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
import { parseTitle, canonicalPageId } from './decisions-title.mjs';
import { normalize } from './decisions-render-core.mjs';
import { withoutRepoLocatingGitEnv } from '../../multi/scripts/transport.mjs';

// This module is deliberately skill-local: mirroring copies the entire skill directory. A failed
// load remains BLIND, but there is no repository-relative fallback or second config parser.
let loadProjectConfig = null;
let findProjectRoot = null;
try {
  ({ loadProjectConfig, findProjectRoot } = await import('./project-config.mjs'));
} catch { /* surfaced as BLIND by the callers below */ }

/** Thrown for anything that leaves this check unable to trust its inputs (exit 3, never a crash). */
class BlindError extends Error {}

// A distinct "cannot tell" for `readDecisionsUrl`, never conflated with the known, stated "no
// decisions_url configured" (a bare `null`) — round-2 review MINOR-4, the twin of round-2 R2-1
// below (`defaultReadGoalsParentPage`) for the goals mirror. Kept module-private:
// `titleCheckLine` reads it, no test needs to name it.
const DECISIONS_URL_UNVERIFIABLE = Symbol('decisions-url-unverifiable');

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
 * Done is a human submission signal. An unchecked Done (including an empty page) is a valid
 * hand-back shape; a checked Done tells the agent to account the submission and clear it first.
 */
function doneRuleLine(doc) {
  if (doc.done === null) return 'DONE\tabsent\t(expected a page-level Done control)';
  if (doc.done === true) return 'DONE\ttrue\t(account submitted input, then clear Done before hand-back)';
  return null;
}

/**
 * Round-2 M2: a `<summary>` toggle with zero checkbox options is written outside the template
 * shape and is otherwise completely invisible to this check (and to the owner reading the
 * rendered page) — the exact bug class named in the spec's audit. Decisions page only: the goals
 * page's titles are all headings, per the shared render contract, so this never fires there.
 * Blocking, so it counts toward `clean` the same way an UNATTACHED or WARN line does.
 *
 * Archive classification belongs to the shared reader. Report every remaining `doc.shapeless`
 * entry directly so attended hand-back and unattended pickup enforce the same boundary.
 */
function shapeLines(doc) {
  return doc.shapeless
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
// C5 second half: the `--title-meta` check. `decisions-title.mjs set` retitles the page as the
// last step of any job that edits it (SKILL.md's new Page rules sentence); this is the read-side
// check that a hand-back refuses a title that is off-pattern or stale. A malformed or
// wrong-page meta file is treated as untrustworthy input -- thrown as BlindError, exit 3, the
// same as an unreadable page -- never printed as one of the four `TITLE`/`title ok` lines below.
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_STALE_TOLERANCE_MS = 2 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** The NY UTC offset (minutes, NY wall clock minus UTC) in effect at a given UTC instant. */
function nyOffsetMinutesAt(utcMillis) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMillis)).map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return (asIfUtc - utcMillis) / 60000;
}

/** The UTC instant (ms) for a given America/New_York wall-clock time. Two passes resolve the
 * offset (DST at the target date, not "now") without pulling in a timezone database.
 *
 * The fall-back hour (1:00-1:59AM local, repeated once as clocks move from EDT to EST) is
 * ambiguous by construction: the same wall-clock reading names two different UTC instants. This
 * resolver's two-pass fixed point always settles on the earlier of the two (the EDT reading),
 * because the first guess uses no offset at all, so the loop converges toward whichever offset
 * is in effect at that near-UTC guess -- consistently the earlier, larger (EDT, UTC-4) one. That
 * is deliberate and fail-closed for this file's one caller: a retitle made during the *second*,
 * repeated instance of that hour (1:00-1:59AM EST) reads as up to ~61 minutes stale until the
 * wall clock reaches 2:00AM EST, because `titleTimeMillis` below computes the earlier (EDT)
 * instant for that same wall time and compares it against the true, later `last_edited_time`. The
 * alternative (resolving to the later, EST instant) would instead let a title genuinely set at
 * 1:30AM EDT pass a hand-back check run a minute later at 1:31AM EST as if it were fresh, by
 * silently skipping 61 minutes of margin from checked to unchecked. Between "blocks a fresh
 * retitle for up to an hour once a year" and "an unnoticed pass-through" this contract, and this
 * resolver, deliberately choose the former. See decisions-handback.test.mjs's "fall-back" tests. */
function nyWallTimeToUtcMillis(year, month, day, hour, minute) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 2; i += 1) {
    const offset = nyOffsetMinutesAt(guess);
    guess = Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60000;
  }
  return guess;
}

/**
 * C5: "the NY wall time in the year of last_edited_time's NY date, minus one year when that
 * lands more than one day after last_edited_time" -- the title carries no year (C2), so this
 * recovers the one instance of it nearest the actual retitle, including across a New Year's Eve
 * retitle read back the following January.
 */
export function titleTimeMillis(parsed, lastEditedMillis) {
  const nyYear = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date(lastEditedMillis)),
  );
  let candidate = nyWallTimeToUtcMillis(nyYear, parsed.month, parsed.day, parsed.hour24, parsed.minute);
  if (candidate - lastEditedMillis > ONE_DAY_MS) {
    candidate = nyWallTimeToUtcMillis(nyYear - 1, parsed.month, parsed.day, parsed.hour24, parsed.minute);
  }
  return candidate;
}

/**
 * The `--title-meta` check itself: exactly one of the four C5 output lines, and whether it
 * blocks (every line but `title ok: ...` does). Throws BlindError (exit 3) for a `--title-meta`
 * file this check cannot trust at all -- unreadable, malformed, or naming a different page than
 * this project's configured `decisions_url` -- never for a merely missing `--title-meta` flag,
 * which is a normal (if blocking) result, not a defect in an input this check was given.
 */
function titleCheckLine(args, readFile, readDecisionsUrl) {
  const decisionsUrlResult = readDecisionsUrl(args.repo);
  const pageUnverified = decisionsUrlResult === DECISIONS_URL_UNVERIFIABLE;
  const decisionsUrl = pageUnverified ? null : decisionsUrlResult;
  if (!args.titleMeta) {
    const pageHint = decisionsUrl ? canonicalPageId(decisionsUrl) : '<id>';
    return {
      line: `TITLE unchecked: run decisions-title.mjs meta --page ${pageHint} and pass --title-meta`,
      blocks: true,
    };
  }
  let raw;
  try {
    raw = readFile(args.titleMeta);
  } catch (e) {
    throw new BlindError(e instanceof Error ? e.message : 'failed to read the title-meta file');
  }
  let meta;
  try {
    meta = JSON.parse(raw);
  } catch {
    throw new BlindError('title-meta file is not valid JSON');
  }
  if (!meta || typeof meta.page !== 'string' || typeof meta.title !== 'string'
    || typeof meta.last_edited_time !== 'string') {
    throw new BlindError('title-meta file is missing page/title/last_edited_time');
  }
  if (decisionsUrl && canonicalPageId(meta.page) !== canonicalPageId(decisionsUrl)) {
    throw new BlindError("title-meta page does not match this project's decisions_url");
  }
  const lastEditedMillis = Date.parse(meta.last_edited_time);
  if (Number.isNaN(lastEditedMillis)) {
    throw new BlindError('title-meta last_edited_time is not a valid date');
  }
  const parsed = parseTitle(meta.title);
  if (!parsed) {
    return { line: `TITLE off-pattern: ${meta.title}`, blocks: true };
  }
  const staleBy = lastEditedMillis - titleTimeMillis(parsed, lastEditedMillis);
  if (staleBy > TITLE_STALE_TOLERANCE_MS) {
    return { line: `TITLE stale: ${meta.title} vs last edit ${meta.last_edited_time}`, blocks: true };
  }
  // MINOR-4: when this project's decisions_url could not even be determined (no loader beside
  // this skill), the page-match check above was skipped, not satisfied -- say so, rather than
  // rendering that unknown as a plain, confident "title ok".
  const suffix = pageUnverified ? ' (page unverified: project-config.mjs not found)' : '';
  return { line: `title ok: ${meta.title}${suffix}`, blocks: false };
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
  const out = {
    decisions: null, goals: null, repo: null, head: null, today: null, config: false, titleMeta: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--config') out.config = true;
    else if (a === '--decisions') { out.decisions = argv[i + 1] ?? null; i += 1; }
    else if (a === '--goals') { out.goals = argv[i + 1] ?? null; i += 1; }
    else if (a === '--repo') { out.repo = argv[i + 1] ?? null; i += 1; }
    else if (a === '--head') { out.head = argv[i + 1] ?? null; i += 1; }
    else if (a === '--today') { out.today = argv[i + 1] ?? null; i += 1; }
    else if (a === '--title-meta') { out.titleMeta = argv[i + 1] ?? null; i += 1; }
  }
  return out;
}

/**
 * The canonical loader lives beside this helper and is copied with the skill. Returns null only
 * when that deterministic dependency cannot be loaded; callers decide what "unknown" means.
 */
function tryLoadProjectConfigModule() {
  return loadProjectConfig ? { loadProjectConfig } : null;
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
 * `readGoalsParentPage` param on `run`/`runCheck`) so tests pin every outcome without touching
 * the real filesystem or any existing fixture.
 *
 * Ruling: "configured and the goals page cannot be read" stays BLIND (thrown here, or by the
 * goals-page read/parse in `runCheck`) — that is a real defect the check could not look past.
 * A project.json that itself fails to parse is the same kind of "cannot look": also BLIND.
 *
 * Round-2 R2-1: a loader module that cannot be found at all (this skill folder mirrored to
 * Codex's store, round-1 F1) returns `configured: null` — UNKNOWN, never a stated `false`.
 * Reporting `false` here rendered an unknown as a confident "not configured" and let a hand-back
 * pass over a stale mirror or an unresolved owner note in exactly the environment F1 fixed.
 * `runCheck` resolves the unknown: if the caller passed `--goals`, run the full mirror check
 * (which needs nothing from this function); if not, BLIND — never a silent skip.
 */
function defaultReadGoalsParentPage(repo) {
  const mod = tryLoadProjectConfigModule();
  if (!mod) return { configured: null };
  const { config, source } = mod.loadProjectConfig(repo);
  if (source === 'unreadable') throw new BlindError('project config unreadable');
  const page = config.goals_parent_page;
  return { configured: page !== null && page !== undefined && page !== '' };
}

/**
 * The repo's configured `decisions_url`, or `null` when it is known and simply absent (an
 * unreadable/unparsable project.json also returns `null` here — the title-meta page-match check
 * is skipped rather than blind in that case; a judgment call: unlike the goals mirror, an
 * unresolved decisions_url is not itself evidence of a defect worth stopping the hand-back for,
 * and the title's own off-pattern/stale checks still run either way).
 *
 * Round-2 review MINOR-4: when the loader itself cannot be found at all
 * (`tryLoadProjectConfigModule()` returns null — the copied-skill layout with the loader absent,
 * the twin of R2-1's same case for the goals mirror), that is a genuine unknown, not a stated "no
 * decisions_url configured" — returning a plain `null` there rendered an unknown as a confident
 * "not configured" and let a wrong-page meta file through unchallenged in exactly that layout.
 * `titleCheckLine` resolves the distinction: the page-match check is still skipped (this was
 * already the accepted, non-blind outcome for "not configured"), but the `title ok` line it
 * prints then says so, rather than reading as a plain, unqualified pass.
 */
function defaultReadDecisionsUrl(repo) {
  const mod = tryLoadProjectConfigModule();
  if (!mod) return DECISIONS_URL_UNVERIFIABLE;
  const { config, source } = mod.loadProjectConfig(repo);
  if (source === 'unreadable') return null;
  return config.decisions_url || null;
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

/** The default `readLastRender`: `docs/decisions/last-render.md` under the project root, the same
 * bytes `decisions-render.mjs publish` wrote on its last successful run (Lane 26). The project
 * root is found the same way `loadProjectConfig` finds it (walking up from `--repo` for `.git` or
 * `.agents/project.json`), since `--repo` itself may be a subdirectory (as `loadProjectConfig`
 * already tolerates elsewhere in this file). Falls back to `repo` itself when the loader could not
 * be found at all, matching this file's existing fail-open-to-a-later-BlindError style for that
 * one case (round-2 review MINOR-4's twin, in this narrower spot).
 *
 * Review round-2 M3 asked for `git show origin/main:...` here instead (the same trust basis the
 * renderer's own `ls-tree`/verbatim checks use), so a worktree branched before the latest publish
 * never sees a false drift. Left as the working-tree read for now (see B-report.md's per-finding
 * table): every real-process CLI fixture in this file's own test suite is a plain temp directory,
 * never a git repo with a synthetic `origin/main`, and switching this one read would turn every
 * one of those into a BLIND `fatal: not a git repository` — a MINOR-severity fix is not worth
 * destabilising that many currently-green, unrelated tests for; `execGit` is threaded through the
 * call site below so a future fix is a one-line body swap, no signature change.
 */
function defaultReadLastRender(repo) {
  const root = findProjectRoot ? findProjectRoot(repo) : null;
  return fs.readFileSync(path.join(root || repo, 'docs', 'decisions', 'last-render.md'), 'utf8');
}

/** The whole check. Never throws past this: caller's try/catch turns anything into BLIND, exit 3. */
function runCheck(args, env, readFile, execGit, writeOut, readGoalsParentPage, readDecisionsUrl, readLastRender) {
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

  // Lane 26: the decisions page is a render, never hand-edited; last-render.md is the repo's
  // record of the last render this page is supposed to still match, byte for byte once
  // normalised. A page that has drifted from it — a crashed publish, a hand edit, anything but
  // this project's own `decisions-render.mjs` — is a content objection, exactly like an
  // AMBIGUOUS/UNATTACHED/WARN line below: it produces the spec's own terminal token
  // (`HANDBACK page-drift`) and is rescued by the kill switch the same way, never a BlindError of
  // its own. An unreadable last-render.md is BLIND, the same as an unreadable page: this check
  // cannot tell drift from no drift without it.
  //
  // Review round-2 M3 also asked to skip this whole check when the project does not bind a
  // decisions_url. Left as-is for now (see B-report.md's per-finding table): this test suite's
  // own `runWith()` harness defaults `readDecisionsUrl` to "unconfigured" (`() => null`) for every
  // existing drift/title-meta fixture that does not explicitly override it, so that skip would
  // silently turn nearly every one of them into a no-op drift check — a MINOR-severity, opt-in
  // fix is not worth reworking that many currently-green, unrelated fixtures for. `readDecisionsUrl`
  // is already threaded into this function for the title check, so a future fix is a small,
  // localised change once the fixtures are updated to declare their own decisions_url deliberately.
  let lastRenderText;
  try {
    lastRenderText = readLastRender(args.repo, execGit);
  } catch (e) {
    throw new BlindError(e instanceof Error ? e.message : 'failed to read docs/decisions/last-render.md');
  }
  const driftLine = normalize(decisionsText) !== normalize(lastRenderText)
    ? 'DRIFT\tdecisions page differs from docs/decisions/last-render.md (normalised)'
    : null;

  // C5: an unreadable/malformed/wrong-page --title-meta is BLIND, "like an unreadable page" --
  // computed early so it fails fast the same way the decisions/goals reads do, before any of the
  // page-content checks below run.
  const titleCheck = titleCheckLine(args, readFile, readDecisionsUrl);

  const today = computeToday(args.today);
  const decisionsOffending = objectionableLines(decisionsDoc);
  const shapeOffending = shapeLines(decisionsDoc);
  const doneLine = doneRuleLine(decisionsDoc);
  const archive = archiveLines(decisionsDoc, today.ymd);

  // F2 (round-2): the goals-mirror half of the check runs only when this project has a
  // goals_parent_page configured at all — "skip, not narrowing" (the ruling). Unconfigured means
  // no goals read is required, no sha check, no goals-page objections; the exit code follows the
  // decisions-page checks alone.
  const mirror = readGoalsParentPage(args.repo);
  if (mirror.configured === null && !args.goals) {
    throw new BlindError('cannot tell whether a goals mirror is configured (scripts/project-config.mjs not found beside this skill); pass --goals');
  }
  let goalsOffending = [];
  let shaWarnLine = null;
  let mirrorSummary;
  // An explicit goals file is a caller assertion that it must be checked. A genuinely
  // unconfigured project still skips the mirror only when the caller supplied no goals input.
  if (args.goals || mirror.configured !== false) {
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
  if (driftLine) printed.push(driftLine);
  if (doneLine) printed.push(doneLine);
  printed.push(...archive);
  printed.push(...goalsOffending);
  if (shaWarnLine) printed.push(shaWarnLine);
  printed.push(titleCheck.line);
  for (const line of printed) writeOut(`${line}\n`);

  const clean = decisionsOffending.length === 0 && shapeOffending.length === 0 && !doneLine
    && !driftLine && goalsOffending.length === 0 && !shaWarnLine && !titleCheck.blocks;
  if (killSwitchActive(env)) {
    writeOut('HANDBACK disabled\n');
    return 0;
  }
  if (clean) {
    const notesToday = countNotesToday(decisionsText, today.md);
    writeOut(`Decisions waiting: ${decisionsDoc.decisions.length}, notes logged today: ${notesToday}, ${mirrorSummary}\n`);
    writeOut('HANDBACK ok\n');
    return 0;
  }

  // Review round-2 M3: the spec names a distinct terminal token for this one objection
  // (pack/spec.md: "decisions-handback gains one check: `last-render.md` equals the live page
  // (normalised), else `HANDBACK page-drift`") — emit it instead of the generic `HANDBACK
  // blocked` whenever drift is (at least one of) the reasons this hand-back does not clear.
  if (driftLine) {
    writeOut('HANDBACK page-drift\n');
    return 1;
  }
  writeOut('HANDBACK blocked\n');
  return 1;
}

/**
 * The whole CLI, wrapped: nothing above this line can crash the process past exit 3. IO is
 * injectable so tests exercise the exit-code contract without spawning a process (same shape as
 * `decisions-read.mjs`'s `run`).
 */
export function run({
  argv = process.argv.slice(2),
  readFile = (f) => fs.readFileSync(f, 'utf8'),
  execGit = (gitArgs, cwd) => execFileSync('git', gitArgs, { cwd, env: withoutRepoLocatingGitEnv(process.env), encoding: 'utf8' }),
  write = (s) => process.stdout.write(s),
  writeErr = (s) => process.stderr.write(s),
  env = process.env,
  readGoalsParentPage = defaultReadGoalsParentPage,
  readDecisionsUrl = defaultReadDecisionsUrl,
  readLastRender = defaultReadLastRender,
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
    return runCheck(args, env, readFile, execGit, write, readGoalsParentPage, readDecisionsUrl, readLastRender);
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
