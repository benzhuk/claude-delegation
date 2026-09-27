#!/usr/bin/env node
/**
 * decisions-render — the ONLY way the owner's decisions page is ever written (pack/spec.md,
 * Lane 26). The page is a render of repo files under `docs/decisions/`, never edited in place:
 *
 *   node decisions-render.mjs render --repo <dir> [--done-line <text>] [--drop-owner-lines <file>]
 *   node decisions-render.mjs publish --repo <dir> --page <id> --reader <path-to-notion.js>
 *     [--clear-done] [--adopt-live] [--dry-run] [--topic <Topic>]
 *
 * `render` is pure (the one optional side effect is an injectable, read-only `git ls-tree`
 * against `origin/main`); `publish` is the numbered 8-step pipeline. `--reader <path>` is the
 * same "an explicit path, never hardcoded" convention `decisions-pickup.mjs`'s `readPageWithCli`
 * already uses: this file still never assumes where `notion.js` lives on disk, and nothing here
 * calls the real Notion API in-process — a missing `--reader` leaves `deps.readPage`/`replaceMd`
 * unset, and `publish()` itself refuses with its own clear error rather than reaching the network.
 * This file is the CLI entry point only; the composition logic lives in `decisions-render-core.mjs`
 * and the publish pipeline in `decisions-render-publish.mjs` (split past ~800 lines per the build
 * brief) — both re-exported here so every test and caller can import this one file.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  render, normalize, RefusedError, BlindError,
  checkProseLines, countSentences, checkWaitingItem,
  formatSinceHeading, formatClearedTimestamp, formatMonthDay, parseSessionSource,
  defaultReadFile, defaultReaddir, defaultExecGit,
} from './decisions-render-core.mjs';
import {
  publish, PublishError, ownerInputTriples, hasOwnerInput, multisetsEqual, describeMismatch,
  lineDiff, defaultReadPickupCapture,
} from './decisions-render-publish.mjs';

export {
  render, normalize, RefusedError, BlindError,
  checkProseLines, countSentences, checkWaitingItem,
  formatSinceHeading, formatClearedTimestamp, formatMonthDay, parseSessionSource,
  defaultReadFile, defaultReaddir, defaultExecGit,
  publish, PublishError, ownerInputTriples, hasOwnerInput, multisetsEqual, describeMismatch,
  lineDiff, defaultReadPickupCapture,
  defaultReadPageWithCli, defaultReplaceMdWithCli, defaultReadLatestBackup,
};

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { cmd };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--repo') { opts.repo = rest[i + 1]; i += 1; } else if (a === '--page') { opts.page = rest[i + 1]; i += 1; } else if (a === '--done-line') { opts.doneLine = rest[i + 1]; i += 1; } else if (a === '--drop-owner-lines') { opts.dropOwnerLines = rest[i + 1]; i += 1; } else if (a === '--topic') { opts.topic = rest[i + 1]; i += 1; } else if (a === '--reader') { opts.reader = rest[i + 1]; i += 1; } else if (a === '--clear-done') { opts.clearDone = true; } else if (a === '--adopt-live') { opts.adoptLive = true; } else if (a === '--dry-run') { opts.dryRun = true; } else {
      throw new RefusedError(`unrecognized argument: ${a}`);
    }
  }
  return opts;
}

function defaultTitleSet(page) {
  return async ({ topic }) => {
    const { run: runTitle } = await import('./decisions-title.mjs');
    const argv = ['set', '--page', page];
    if (topic) argv.push('--topic', topic);
    const code = await runTitle({ argv });
    if (code !== 0) throw new Error(`decisions-title.mjs set exited ${code}`);
  };
}

/**
 * `--reader <path>`: the same "reader is an explicit path, never hardcoded" convention
 * `decisions-pickup.mjs`'s `readPageWithCli` already uses — this file still never assumes where
 * `notion.js` lives on disk. Bound only when `--reader` is given; otherwise `deps.readPage` /
 * `deps.replaceMd` stay unset and `publish()` itself refuses with its own clear error.
 */
function runReaderCli(reader, args, env) {
  const readerPath = path.resolve(reader);
  const isNodeScript = /\.(?:c|m)?js$/i.test(readerPath);
  const command = isNodeScript ? process.execPath : readerPath;
  const fullArgs = isNodeScript ? [readerPath, ...args] : args;
  const result = spawnSync(command, fullArgs, {
    encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...(env ? { env } : {}),
  });
  if (result.error) throw new Error(`--reader failed to run: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`--reader exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  // Review round-2 F4: notion.js prints its pre-write backup path to stderr
  // (`console.error(\`[backup] ${file}\`)`); returning stderr alongside stdout lets
  // `defaultReplaceMdWithCli` parse it out instead of discarding it.
  return { stdout: result.stdout, stderr: result.stderr };
}

/** `env` is test-only (a sealed `childEnv()`); production leaves it unset, inheriting the real
 * process environment the same way `decisions-pickup.mjs`'s `readPageWithCli` already does. */
function defaultReadPageWithCli(reader, env) {
  return async (page) => runReaderCli(reader, ['read', page], env).stdout;
}

function defaultReplaceMdWithCli(reader, env) {
  return async (page, md) => {
    const tmp = path.join(os.tmpdir(), `decisions-render-publish-${process.pid}-${Date.now()}.md`);
    fs.writeFileSync(tmp, md, 'utf8');
    try {
      const { stderr } = runReaderCli(reader, ['replace-md', page, tmp, '--force'], env);
      const m = /^\[backup\] (.+)$/m.exec(stderr || '');
      return { backupFile: m ? m[1].trim() : null };
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    }
  };
}

/** Review round-2 M6: wired for real (was never called from the CLI before) — the newest
 * `<NOTION_BACKUP_DIR>/<page>/*.md` file, the same directory convention notion.js's own
 * `backupDirFor()` uses (`NOTION_BACKUP_DIR`, default `~/.local/state/notion-backups/<page-id>/`).
 * Purely a local, read-only filesystem probe: never a network call, never a write. */
function defaultReadLatestBackup() {
  return async (page) => {
    const dir = path.join(process.env.NOTION_BACKUP_DIR || path.join(os.homedir(), '.local', 'state', 'notion-backups'), page);
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return null;
    }
    const mdFiles = names.filter((n) => n.endsWith('.md')).sort();
    if (mdFiles.length === 0) return null;
    const latest = mdFiles[mdFiles.length - 1];
    try {
      return fs.readFileSync(path.join(dir, latest), 'utf8');
    } catch {
      return null;
    }
  };
}

/**
 * The whole CLI, wrapped: nothing above this line can crash the process past exit 3. IO and every
 * network-touching dependency are injectable (`deps`) so a test never reaches Notion or git push.
 */
export async function run({
  argv = process.argv.slice(2),
  write = (s) => process.stdout.write(s),
  writeErr = (s) => process.stderr.write(s),
  deps = {},
} = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    writeErr(`decisions-render: ${e instanceof Error ? e.message : 'failed'}\n`);
    return 2;
  }
  try {
    if (opts.cmd === 'render') {
      if (!opts.repo) throw new RefusedError('render requires --repo');
      const page = render({
        repo: opts.repo, doneLine: opts.doneLine, dropOwnerLines: opts.dropOwnerLines,
      }, deps);
      write(page);
      return 0;
    }
    if (opts.cmd === 'publish') {
      if (!opts.repo) throw new PublishError(2, 'publish requires --repo');
      if (!opts.page) throw new PublishError(2, 'publish requires --page');
      const publishDeps = {
        readFile: (f) => fs.readFileSync(f, 'utf8'),
        readdirSync: (d) => fs.readdirSync(d),
        writeFile: (f, c) => fs.writeFileSync(f, c),
        titleSet: defaultTitleSet(opts.page),
        write,
        readLatestBackup: defaultReadLatestBackup(),
        ...(opts.reader ? { readPage: defaultReadPageWithCli(opts.reader), replaceMd: defaultReplaceMdWithCli(opts.reader) } : {}),
        ...deps,
      };
      const result = await publish({
        repo: opts.repo,
        page: opts.page,
        clearDone: Boolean(opts.clearDone),
        adoptLive: Boolean(opts.adoptLive),
        dryRun: Boolean(opts.dryRun),
        topic: opts.topic ?? null,
      }, publishDeps);
      return result.code ?? 0;
    }
    throw new RefusedError(`unknown command: ${opts.cmd ?? '(none)'}`);
  } catch (e) {
    if (e instanceof PublishError) {
      writeErr(`decisions-render: ${e.message}\n`);
      return e.code;
    }
    if (e instanceof BlindError) {
      writeErr(`decisions-render: BLIND: ${e.message}\n`);
      return 3;
    }
    if (e instanceof RefusedError) {
      writeErr(`decisions-render: ${e.message}\n`);
      return 2;
    }
    writeErr(`decisions-render: ${e instanceof Error ? e.message : e}\n`);
    return 1;
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const canon = (p) => {
    let r = path.resolve(p);
    try { r = fs.realpathSync(r); } catch { /* not on disk — fall back to the resolved path */ }
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return canon(entry) === canon(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(process.exitCode ?? 0); });
  run().then((code) => { process.exitCode = code; });
}
