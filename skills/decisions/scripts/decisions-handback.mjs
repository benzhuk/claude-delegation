#!/usr/bin/env node
/**
 * decisions-handback — the check the lead runs before handing the decisions page back to the
 * owner (spec M3). Runs `decisions-read.mjs`'s parser over the decisions page and, when this
 * project's `goals_parent_page` is configured, the goals-mirror page too, checking the
 * goals-mirror sha against the repo's actual head (F6). Exits 0 only when there is nothing left
 * for the owner to react to. Pure except for one `git` call to learn the head sha (skipped when
 * `--head` overrides it), the decisions/goals file reads, and a read of this project's config
 * (to learn whether a goals mirror is configured at all — round-2 F2); nothing here writes
 * anything or calls Notion. Full design: docs/specs/2026-09-22-decisions-current.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseDocument, formatText } from './decisions-read.mjs';
import { createRequire } from 'node:module';

/** Thrown for anything that leaves this check unable to trust its inputs (exit 3, never a crash). */
class BlindError extends Error {}

// The same four statuses `decisions-read.mjs` treats as actionable (computeExitCode) — a
// decision that needs a reaction, quoted here rather than re-derived, since the reader owns
// the vocabulary and this check only asks "did the reader flag anything to react to".
const ACTIONABLE_STATUSES = new Set(['AMBIGUOUS', 'TICKED', 'COMMENTED', 'DUE']);

/**
 * The lines from one parsed page that this check objects to: an actionable decision line, any
 * UNATTACHED line, or any WARN line. OPEN, REPLIED, DECISIONS and DONE lines carry no objection
 * of their own (DONE is checked separately, by `doneRuleLine`, since the rule differs by page).
 */
function objectionableLines(doc) {
  return formatText(doc)
    .split('\n')
    .filter((line) => {
      const status = line.split('\t', 1)[0];
      return ACTIONABLE_STATUSES.has(status) || status === 'UNATTACHED' || status === 'WARN';
    });
}

/**
 * M3's Done rule, decisions page only ("the goals page is exempt from the Done rule"): DONE must
 * be false while any decision is open, true when none are, never absent. Returns a printable
 * line naming the mismatch, or null when the rule is satisfied.
 */
function doneRuleLine(doc) {
  const count = doc.decisions.length;
  const expected = count === 0; // expect true with zero decisions, false with any open
  if (doc.done === null) return `DONE\tabsent\t(expected ${expected ? 'true' : 'false'} with DECISIONS ${count})`;
  if (doc.done !== expected) return `DONE\t${doc.done}\t(expected ${expected ? 'true' : 'false'} with DECISIONS ${count})`;
  return null;
}

/**
 * Round-2 M2: a `<summary>` toggle with zero checkbox options is written outside the template
 * shape and is otherwise completely invisible to this check (and to the owner reading the
 * rendered page) — the exact bug class named in the spec's audit. Decisions page only: the goals
 * page's titles are all headings, per the shared render contract, so this never fires there.
 * Blocking, so it counts toward `clean` the same way an UNATTACHED or WARN line does.
 *
 * Round-2 review M1: scoped to the `# Waiting on you now` section only. The bug class this
 * guards against — an item waiting on the owner, written outside the template shape — only
 * matters there; other sections (`# Closed`, the Night log, the Goals-ruling section) use
 * option-less toggles on purpose as record-keeping, not decision items, and the owner's call was
 * to keep those sections as-is (spec "NOT in this build"). A shapeless toggle counts only when it
 * has no enclosing column-0 `#` heading, or its nearest preceding one is `# Waiting on you now`;
 * the no-heading case fails closed.
 */
function shapeLines(doc, text) {
  const lines = String(text).split(/\r\n|\n/);
  const sectionOf = (lineNo) => {
    for (let i = lineNo - 2; i >= 0; i -= 1) {
      if (/^#[ \t]+/.test(lines[i])) return lines[i];
    }
    return null;
  };
  return doc.shapeless
    .filter((s) => {
      const heading = sectionOf(s.line);
      return heading === null || /^#[ \t]+Waiting on you now\b/.test(heading);
    })
    .map(
      (s) => `SHAPE\tline ${s.line}\t${s.title}\t(toggle with no checkbox options: the reader cannot see it)`,
    );
}

/**
 * REPLIED pairs whose Reply date is before today: not blocking (M1 — "a REPLIED pair must never
 * block"), just listed so the lead does not forget to archive them to Closed at hand-back time.
 */
function archiveLines(doc, todayYmd) {
  const out = [];
  for (const d of doc.decisions) {
    for (const c of d.comments) {
      if (c.replied && c.repliedAt && c.repliedAt < todayYmd) {
        out.push(`ARCHIVE\t${d.title}\tline ${c.line}\treplied ${c.repliedAt}`);
      }
    }
  }
  return out;
}

/**
 * The sha line contract (shared T1/T2): the page sha is the first match of `/\bmain at
 * ([0-9A-Za-z]+)/` on the FIRST line inside the page's first `<callout>` … `</callout>` block —
 * never a whole-document scan, so a stray "main at …" in ordinary prose elsewhere on the page
 * (a Status line, say) never counts. Returns the sha, or null when there is no match there.
 */
export function extractPageSha(text) {
  const lines = String(text).split(/\r\n|\n/);
  const openIdx = lines.findIndex((l) => /<callout\b[^>]*>/i.test(l));
  if (openIdx === -1) return null;
  const openTagMatch = /<callout\b[^>]*>(.*)$/i.exec(lines[openIdx]);
  const afterOpenTag = openTagMatch ? openTagMatch[1] : '';
  const firstLine = afterOpenTag.trim() !== '' ? afterOpenTag : (lines[openIdx + 1] ?? '');
  const m = /\bmain at ([0-9A-Za-z]+)/.exec(firstLine);
  return m ? m[1] : null;
}

/** Two shas "match" when one is a prefix of the other (M3), case-insensitively. */
export function shaMatch(a, b) {
  if (!a || !b) return false;
  const x = String(a).toLowerCase();
  const y = String(b).toLowerCase();
  return x.startsWith(y) || y.startsWith(x);
}

// ─────────────────────────────────────────────────────────────────────────────
// Kill switch: `~/.agents/ws-off` (master) or `~/.agents/ws-off-decisions` (this feature).
// Mirrors `scripts/goal-card.mjs`'s pattern (an injectable `env`, never a bare `process.env`
// read down in the logic) rather than `scripts/project-config.mjs`'s `switchedOff`, which reads
// `process.env` directly and so cannot be pointed at a fixture home without mutating the real
// process environment — the exact class of leak a recent fix on this branch closed for wiring.
// ─────────────────────────────────────────────────────────────────────────────

export function agentsHome(env = process.env) {
  const override = env && env.AGENTS_HOME;
  return override ? String(override) : path.join(homedir(), '.agents');
}

function switchPresent(p) {
  try {
    fs.statSync(p);
    return true;
  } catch (e) {
    return Boolean(e) && e.code !== 'ENOENT' && e.code !== 'ENOTDIR';
  }
}

export function killSwitchActive(env = process.env) {
  const base = agentsHome(env);
  return switchPresent(path.join(base, 'ws-off')) || switchPresent(path.join(base, 'ws-off-decisions'));
}

// ─────────────────────────────────────────────────────────────────────────────
// "Today", America/New_York — `--today <M-D>` overrides it for tests.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string|null} [overrideMD] test override, `M-D`
 * @param {Date} [now] the clock to read when there is no override — a seam (round-2 m2) so a
 *   test can pin America/New_York against a UTC or a differently-zoned machine clock without
 *   patching the global `Date`.
 * @returns {{md: string, ymd: string}} `md` no leading zeros; `ymd` zero-padded, for sorting.
 */
export function computeToday(overrideMD, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const realYmd = `${parts.year}-${parts.month}-${parts.day}`;
  if (overrideMD === null || overrideMD === undefined) {
    return { md: `${Number(parts.month)}-${Number(parts.day)}`, ymd: realYmd };
  }
  if (!/^\d{1,2}-\d{1,2}$/.test(overrideMD)) throw new BlindError(`--today is not M-D: ${overrideMD}`);
  const [m, d] = overrideMD.split('-').map(Number);
  return { md: overrideMD, ymd: `${parts.year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

/** Count of decisions-page lines matching `/^\s*- Your note, <M-D>:/` (M1's logged-today count). */
export function countNotesToday(decisionsText, todayMD) {
  const escaped = todayMD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*- Your note, ${escaped}:`);
  return String(decisionsText).split(/\r\n|\n/).filter((l) => re.test(l)).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { decisions: null, goals: null, repo: null, head: null, today: null, config: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--config') out.config = true;
    else if (a === '--decisions') { out.decisions = argv[i + 1] ?? null; i += 1; }
    else if (a === '--goals') { out.goals = argv[i + 1] ?? null; i += 1; }
    else if (a === '--repo') { out.repo = argv[i + 1] ?? null; i += 1; }
    else if (a === '--head') { out.head = argv[i + 1] ?? null; i += 1; }
    else if (a === '--today') { out.today = argv[i + 1] ?? null; i += 1; }
  }
  return out;
}

/**
 * Lazy, synchronous load of `scripts/project-config.mjs` beside this skill folder (round-1 F1):
 * resolved relative to THIS script's own file, so it is absent whenever this skill folder is a
 * mirrored copy with no sibling `scripts/` three levels up (Codex's store; `--config` and the
 * F2 mirror-configured lookup below share this one lazy load — never a top-level import, which
 * is what crashed every invocation, check path included, before F1). Returns null, never
 * throws, when the loader module itself cannot be found; callers decide what "unknown" means.
 */
function tryLoadProjectConfigModule() {
  try {
    return createRequire(import.meta.url)('../../../scripts/project-config.mjs');
  } catch {
    return null;
  }
}

/**
 * `--config`: the two project.json keys this build adds/uses, one per set key, nothing for an
 * unset one, exit 0; an unreadable project.json (bad JSON) prints BLIND on stderr and exits 3.
 * Deliberately does not touch stdout's `HANDBACK …` vocabulary — this is a config lookup, not a
 * hand-back check.
 */
function runConfig(args, writeOut, writeErr) {
  // Spec M3's Config section and Test 6 both write the bare form, `decisions-handback.mjs
  // --config`, with no `--repo`; `loadProjectConfig` already defaults to `process.cwd()` and
  // walks up to find `.agents/project.json`, so `--repo` is an override here, never a
  // requirement (round-2 m5).
  const mod = tryLoadProjectConfigModule();
  if (!mod) {
    writeErr('decisions-handback: BLIND (scripts/project-config.mjs not found beside this skill)\n');
    return 3;
  }
  const { config, source } = mod.loadProjectConfig(args.repo ?? process.cwd());
  if (source === 'unreadable') {
    writeErr('decisions-handback: BLIND (project config unreadable)\n');
    return 3;
  }
  for (const key of ['decisions_url', 'goals_parent_page']) {
    const v = config[key];
    if (v !== null && v !== undefined && v !== '') writeOut(`${key}\t${v}\n`);
  }
  return 0;
}

/**
 * F2 (round-2 seam fix, ruling in docs/notes/skills-fable-decisions-current-4.md): whether this
 * project's goals mirror is configured at all, read from `.agents/project.json`'s
 * `goals_parent_page` key via the same lazy loader `--config` uses. Injectable (the
 * `readGoalsParentPage` param on `run`/`runCheck`) so tests pin both new outcomes without
 * touching the real filesystem or any existing fixture.
 *
 * Ruling: "configured and the goals page cannot be read" stays BLIND (thrown here, or by the
 * goals-page read/parse in `runCheck`) — that is a real defect the check could not look past.
 * A project.json that itself fails to parse is the same kind of "cannot look": also BLIND.
 * A loader module that cannot be found at all (this skill folder mirrored to Codex's store,
 * round-1 F1) is reported as NOT configured rather than BLIND — the fail-open choice F1 already
 * made for the whole check path: BLIND-ing every hand-back run from a mirrored copy, configured
 * or not, would undo F1's fix outright. Documented tradeoff, not an oversight.
 */
function defaultReadGoalsParentPage(repo) {
  const mod = tryLoadProjectConfigModule();
  if (!mod) return { configured: false };
  const { config, source } = mod.loadProjectConfig(repo);
  if (source === 'unreadable') throw new BlindError('project config unreadable');
  const page = config.goals_parent_page;
  return { configured: page !== null && page !== undefined && page !== '' };
}

function computeHeadSha(repo, head, execGit) {
  if (head !== null) return head;
  let out;
  try {
    out = String(execGit(
      ['log', '-1', '--format=%h', 'origin/main', '--', 'docs/GOALS.md', 'docs/goals/card.md'],
      repo,
    )).trim();
  } catch (e) {
    throw new BlindError(`cannot determine head sha: ${e instanceof Error ? e.message : 'git failed'}`);
  }
  if (!out) throw new BlindError('cannot determine head sha: no matching commit on origin/main');
  return out;
}

/** The whole check. Never throws past this: caller's try/catch turns anything into BLIND, exit 3. */
function runCheck(args, env, readFile, execGit, writeOut, readGoalsParentPage) {
  if (!args.decisions || !args.repo) {
    throw new BlindError('missing required --decisions/--repo');
  }

  let decisionsText;
  let decisionsDoc;
  try {
    decisionsText = readFile(args.decisions);
    decisionsDoc = parseDocument(decisionsText);
  } catch (e) {
    throw new BlindError(e instanceof Error ? e.message : 'failed to read or parse the decisions page');
  }

  const today = computeToday(args.today);
  const decisionsOffending = objectionableLines(decisionsDoc);
  const shapeOffending = shapeLines(decisionsDoc, decisionsText);
  const doneLine = doneRuleLine(decisionsDoc);
  const archive = archiveLines(decisionsDoc, today.ymd);

  // F2 (round-2): the goals-mirror half of the check runs only when this project has a
  // goals_parent_page configured at all — "skip, not narrowing" (the ruling). Unconfigured means
  // no goals read is required, no sha check, no goals-page objections; the exit code follows the
  // decisions-page checks alone.
  const mirror = readGoalsParentPage(args.repo);
  let goalsOffending = [];
  let shaWarnLine = null;
  let mirrorSummary;
  if (mirror.configured) {
    if (!args.goals) throw new BlindError('missing required --goals (goals_parent_page is configured for this project)');
    let goalsText;
    let goalsDoc;
    try {
      goalsText = readFile(args.goals);
      goalsDoc = parseDocument(goalsText);
    } catch (e) {
      throw new BlindError(e instanceof Error ? e.message : 'failed to read or parse the goals page');
    }
    const headSha = computeHeadSha(args.repo, args.head, execGit);
    const pageSha = extractPageSha(goalsText);
    if (pageSha === null) shaWarnLine = 'WARN\tgoals mirror missing sha line';
    else if (!shaMatch(pageSha, headSha)) shaWarnLine = `WARN\tgoals mirror stale: page ${pageSha}, head ${headSha}`;
    goalsOffending = objectionableLines(goalsDoc).map((l) => `goals\t${l}`);
    mirrorSummary = `goals mirror at ${pageSha}`;
  } else {
    mirrorSummary = 'goals mirror at none (not configured)';
  }

  const printed = [...decisionsOffending, ...shapeOffending];
  if (doneLine) printed.push(doneLine);
  printed.push(...archive);
  printed.push(...goalsOffending);
  if (shaWarnLine) printed.push(shaWarnLine);
  for (const line of printed) writeOut(`${line}\n`);

  const clean = decisionsOffending.length === 0 && shapeOffending.length === 0 && !doneLine
    && goalsOffending.length === 0 && !shaWarnLine;
  if (clean) {
    const notesToday = countNotesToday(decisionsText, today.md);
    writeOut(`Decisions waiting: ${decisionsDoc.decisions.length}, notes logged today: ${notesToday}, ${mirrorSummary}\n`);
    writeOut('HANDBACK ok\n');
    return 0;
  }

  writeOut('HANDBACK blocked\n');
  return killSwitchActive(env) ? 0 : 1;
}

/**
 * The whole CLI, wrapped: nothing above this line can crash the process past exit 3. IO is
 * injectable so tests exercise the exit-code contract without spawning a process (same shape as
 * `decisions-read.mjs`'s `run`).
 */
export function run({
  argv = process.argv.slice(2),
  readFile = (f) => fs.readFileSync(f, 'utf8'),
  execGit = (gitArgs, cwd) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8' }),
  write = (s) => process.stdout.write(s),
  writeErr = (s) => process.stderr.write(s),
  env = process.env,
  readGoalsParentPage = defaultReadGoalsParentPage,
} = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    writeErr(`decisions-handback: ${e instanceof Error ? e.message : 'failed'}\n`);
    return 3;
  }

  if (args.config) {
    try {
      return runConfig(args, write, writeErr);
    } catch (e) {
      writeErr(`decisions-handback: ${e instanceof Error ? e.message : 'failed'}\n`);
      return 3;
    }
  }

  try {
    return runCheck(args, env, readFile, execGit, write, readGoalsParentPage);
  } catch (e) {
    writeErr(`decisions-handback: ${e instanceof Error ? e.message : 'failed'}\n`);
    write('HANDBACK blind\n');
    return 3;
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
