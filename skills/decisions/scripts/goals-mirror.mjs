#!/usr/bin/env node
/**
 * goals-mirror — renders `docs/GOALS.md` and `docs/goals/card.md` into the Notion-flavoured
 * markdown shape of `templates/goals-page.md`. `render` is pure: no network, no git write,
 * sources read straight off `--repo`. Publication is deliberately disabled: use the existing
 * notion-writing skill's fresh targeted edits and readback for an attended update.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE_PATH = path.join(SCRIPT_DIR, '..', 'templates', 'goals-page.md');

const STATUS_COLOR = { MET: 'green', PARTIAL: 'orange', NONE: 'red', UNKNOWN: 'red' };

/** Refuses an unsupported command or malformed render request (exit 1). */
export class RefusedError extends Error {}
/** A read or parse failure the caller cannot trust (exit 3), never a silent false-clean. */
export class BlindError extends Error {}

function checkForbidden(text, lineNo, sourceLabel) {
  const t = text.trim();
  const body = t.replace(/^[-*+]\s+/, ''); // what the reader tests after splitMarker strips a bullet
  if (/^[-*+]\s+\[/.test(t)) {
    throw new RefusedError(`${sourceLabel}:${lineNo} would render as a checkbox ("- ["): ${t}`);
  }
  if (/<summary\b/i.test(t)) {
    throw new RefusedError(`${sourceLabel}:${lineNo} would render as a <summary> toggle: ${t}`);
  }
  if (/^Default\b/.test(body) && body.includes(':')) {
    throw new RefusedError(`${sourceLabel}:${lineNo} would render as a Default line: ${t}`);
  }
  if (/^`{3,}/.test(t)) {
    throw new RefusedError(`${sourceLabel}:${lineNo} would render as a code fence: ${t}`);
  }
}

function splitLines(text) {
  return text.split(/\r\n|\n/);
}

/** Rule 2: card.md's five lines, each TAB-prefixed, in source order. */
function buildCardBlock(cardText) {
  const lines = splitLines(cardText).filter((l) => l.trim() !== '');
  lines.forEach((l, idx) => checkForbidden(l, idx + 1, 'docs/goals/card.md'));
  return lines.map((l) => `\t${l}`).join('\n');
}

/** Rules 3-4-7: one `# X {toggle="true"}` block per `## ` section of GOALS.md. */
function renderSection(headingText, sectionLines) {
  const out = [`# ${headingText} {toggle="true"}`];
  let sawStatus = false;
  for (const { text, lineNo } of sectionLines) {
    if (text.trim() === '') continue;
    checkForbidden(text, lineNo, 'docs/GOALS.md');
    const statusMatch = /^Status:\s*([A-Za-z]+)\.\s*([\s\S]*)$/.exec(text);
    if (statusMatch) {
      sawStatus = true;
      const word = statusMatch[1];
      const rest = statusMatch[2];
      const color = STATUS_COLOR[word] || 'red';
      out.push(`\t<span color="${color}">**${word}**</span>${rest ? ` ${rest}` : ''}`);
    } else {
      out.push(`\t${text}`);
    }
  }
  if (!sawStatus) out.push('\t<span color="red">**UNKNOWN**</span>');
  out.push('\t<empty-block/>');
  return out.join('\n');
}

function buildSections(goalsText) {
  const lines = splitLines(goalsText);
  const startIdx = lines.findIndex((l) => /^##[ \t]+/.test(l));
  if (startIdx === -1) return '';
  const blocks = [];
  let i = startIdx;
  while (i < lines.length) {
    const headingMatch = /^##[ \t]+(.*)$/.exec(lines[i]);
    const headingText = headingMatch[1].trim();
    i += 1;
    const sectionLines = [];
    while (i < lines.length && !/^##[ \t]+/.test(lines[i])) {
      sectionLines.push({ text: lines[i], lineNo: i + 1 });
      i += 1;
    }
    blocks.push(renderSection(headingText, sectionLines));
  }
  return blocks.join('\n');
}

const defaultReadFile = (f) => fs.readFileSync(f, 'utf8');

/**
 * Pure: `--repo`'s two sources plus the skill's own template, joined directly (never a root
 * walk-up). Never touches git; `sha` is supplied by the caller (CLI resolves `--sha` or git).
 */
export function renderPage({ repo, sha, readFile = defaultReadFile, templatePath = DEFAULT_TEMPLATE_PATH }) {
  const readOrBlind = (f) => {
    try {
      return readFile(f);
    } catch (e) {
      throw new BlindError(`cannot read ${f}: ${e instanceof Error ? e.message : e}`);
    }
  };
  const goalsText = readOrBlind(path.join(repo, 'docs', 'GOALS.md'));
  const cardText = readOrBlind(path.join(repo, 'docs', 'goals', 'card.md'));
  const template = readOrBlind(templatePath);
  const cardBlock = buildCardBlock(cardText);
  const sectionsBlock = buildSections(goalsText);
  const values = { sha, card: cardBlock, sections: sectionsBlock };
  let page = template.replace(/\{\{(sha|card|sections)\}\}/g, (_m, key) => values[key]);
  if (!page.endsWith('\n')) page += '\n';
  return page;
}

function defaultGit(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

/** `git log -1 --format=%h origin/main -- <sources>` in `--repo` — the last commit that changed either. */
export function computeSha({ repo, git = defaultGit }) {
  let out;
  try {
    out = git(repo, ['log', '-1', '--format=%h', 'origin/main', '--', 'docs/GOALS.md', 'docs/goals/card.md']);
  } catch (e) {
    throw new BlindError(`git log failed in ${repo}: ${e instanceof Error ? e.message : e}`);
  }
  const sha = out.trim();
  if (!sha) throw new BlindError('git log gave no sha for the goals sources on origin/main');
  return sha;
}

/** Retained pure helper for callers that compare local goals sources with origin/main. */
export function checkDirty({ repo, readFile = defaultReadFile, git = defaultGit }) {
  const sources = ['docs/GOALS.md', 'docs/goals/card.md'];
  for (const rel of sources) {
    let origin;
    try {
      origin = git(repo, ['show', `origin/main:${rel}`]);
    } catch (e) {
      throw new BlindError(`cannot read origin/main:${rel}: ${e instanceof Error ? e.message : e}`);
    }
    const local = readFile(path.join(repo, ...rel.split('/')));
    if (local.replace(/\r\n/g, '\n') !== origin.replace(/\r\n/g, '\n')) {
      return { dirty: true, path: rel };
    }
  }
  return { dirty: false, path: null };
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { cmd };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--repo') { opts.repo = rest[i += 1]; }
    else if (a === '--sha') { opts.sha = rest[i += 1]; }
    else if (a === '--parent') { opts.parent = rest[i += 1]; }
    else if (a === '--current') { opts.current = rest[i += 1]; }
  }
  return opts;
}

/**
 * The whole CLI, wrapped: nothing above this line can crash the process past exit 3. IO and
 * git/spawn are injectable so tests never touch a real repo or call the real notion.js.
 */
export function run({
  argv = process.argv.slice(2),
  readFile = defaultReadFile,
  write = (s) => process.stdout.write(s),
  writeErr = (s) => process.stderr.write(s),
  git = defaultGit,
} = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.cmd === 'render') {
      if (!opts.repo) throw new RefusedError('render requires --repo');
      const sha = opts.sha || computeSha({ repo: opts.repo, git });
      if (!opts.sha) {
        const freshness = checkDirty({ repo: opts.repo, readFile, git });
        if (freshness.dirty) {
          throw new RefusedError(`render refuses local ${freshness.path} that differs from origin/main; use --sha only for a caller-attested preview`);
        }
      }
      const page = renderPage({ repo: opts.repo, sha, readFile });
      write(page);
      return 0;
    }
    if (opts.cmd === 'publish') {
      writeErr('goals-mirror: publish is disabled; run render, read the Goals page fresh, then use notion-writing targeted anchored edits and verify readback\n');
      return 1;
    }
    throw new RefusedError(`unknown command: ${opts.cmd ?? '(none)'}`);
  } catch (err) {
    if (err instanceof BlindError) {
      writeErr(`goals-mirror: BLIND: ${err.message}\n`);
      return 3;
    }
    writeErr(`goals-mirror: ${err instanceof Error ? err.message : err}\n`);
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
  process.exitCode = run();
}
