#!/usr/bin/env node
/**
 * decisions-render — the ONLY way the owner's decisions page is ever written (pack/spec.md,
 * Lane 26). The page is a render of repo files under `docs/decisions/`, never edited in place:
 *
 *   node decisions-render.mjs render --repo <dir> [--done-line <text>] [--drop-owner-lines <file>]
 *   node decisions-render.mjs publish --repo <dir> --page <id> [--clear-done] [--adopt-live] [--dry-run]
 *
 * `render` is pure (the one optional side effect is an injectable, read-only `git ls-tree`
 * against `origin/main`); `publish` is the numbered 8-step pipeline, with `notion.js`,
 * `decisions-title.mjs` and the pickup's status read always injected — nothing in this file (or
 * anything it imports) calls the real Notion API on its own. This file is the CLI entry point
 * only; the composition logic lives in `decisions-render-core.mjs` and the publish pipeline in
 * `decisions-render-publish.mjs` (split past ~800 lines per the build brief) — both re-exported
 * here so every test and caller can import this one file.
 */
import fs from 'node:fs';
import path from 'node:path';
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
};

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { cmd };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--repo') { opts.repo = rest[i + 1]; i += 1; } else if (a === '--page') { opts.page = rest[i + 1]; i += 1; } else if (a === '--done-line') { opts.doneLine = rest[i + 1]; i += 1; } else if (a === '--drop-owner-lines') { opts.dropOwnerLines = rest[i + 1]; i += 1; } else if (a === '--topic') { opts.topic = rest[i + 1]; i += 1; } else if (a === '--clear-done') { opts.clearDone = true; } else if (a === '--adopt-live') { opts.adoptLive = true; } else if (a === '--dry-run') { opts.dryRun = true; } else {
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
