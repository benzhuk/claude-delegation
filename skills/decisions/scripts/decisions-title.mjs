#!/usr/bin/env node
/**
 * decisions-title — retitles the owner's decisions page (Notion) as the last step of any job
 * that edited it, and reports its title/last-edit time for the hand-back check to police
 * (contracts.md C2 title format, C3 topic resolution, C5 the CLI/API contract). Two
 * subcommands:
 *
 *   node decisions-title.mjs set  --page <id> [--topic <T>] [--now <ISO>]
 *   node decisions-title.mjs meta --page <id>
 *
 * `fetch` is injected through `run({argv, env, fetch, now, stdout, stderr})`; nothing here
 * reaches the real network on its own, so this whole file is testable without a live Notion
 * credential or account access. `set` never edits page content or Done -- it only PATCHes the
 * page's title property -- and no call to this file is added to decisions-pickup.mjs (that is
 * the sessions' write path, not the pickup's). Full design: docs/specs/pickup-complete-1/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

// C5: the exact Notion-Version constant ~/.claude/scripts/notion.js uses for its /pages calls
// (scout-P3: notion.js:43 `const VERSION = "2022-06-28";`) -- copied by value, per C5 ("do not
// import notion.js").
const NOTION_VERSION = '2022-06-28';
const NOTION_API_BASE = 'https://api.notion.com/v1';
const FETCH_TIMEOUT_MS = 20000;

// C3: the shape of a topic, shared by the --topic flag and a registration entry's topic key.
const TOPIC_RE = /^[A-Za-z][A-Za-z0-9 &._-]{0,39}$/;

// C2: the title format, anchored both ends.
const TITLE_RE = /^(.+): (\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})(AM|PM) Decisions$/;

// A Notion page id, 32 hex chars or the same 32 chars dashed as a UUID (C5: "32-hex or dashed").
const PAGE_ID_RE = /^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Two page ids name the same page regardless of dashes or letter case. */
export function canonicalPageId(id) {
  return String(id).replace(/-/g, '').toLowerCase();
}

/**
 * C2: `<Topic>: <M>/<D> <h>:<mm><AM|PM> Decisions`, the time in America/New_York computed via
 * Intl -- never a fixed offset, so this stays correct across a DST change. `date` is the real
 * instant (a `Date`). Month, day and hour carry no leading zero; minute is always two digits;
 * hour is 12-hour (00:05 -> 12:05AM, 12:00 -> 12:00PM, matching Intl's own `hour12` convention).
 */
export function formatTitle(topic, date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const ampm = String(parts.dayPeriod || '').toUpperCase();
  return `${topic}: ${parts.month}/${parts.day} ${parts.hour}:${parts.minute}${ampm} Decisions`;
}

/**
 * The inverse of `formatTitle`: `{topic, month, day, hour24, minute}`, or `null` when `title`
 * does not match C2's anchored pattern exactly (extra spaces, a lower-case am/pm, a missing
 * "Decisions" suffix, etc. all fail to parse). `hour24` follows the 12-hour convention C2
 * states: 12:05AM -> hour24 0, 12:00PM -> hour24 12.
 */
export function parseTitle(title) {
  const m = TITLE_RE.exec(String(title));
  if (!m) return null;
  const [, topic, monthStr, dayStr, hourStr, minuteStr, ampm] = m;
  const month = Number(monthStr);
  const day = Number(dayStr);
  const h = Number(hourStr);
  if (month < 1 || month > 12 || day < 1 || day > 31 || h < 1 || h > 12) return null;
  const hour24 = ampm === 'AM' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12);
  return { topic, month, day, hour24, minute: Number(minuteStr) };
}

// ─────────────────────────────────────────────────────────────────────────────
// C3: topic resolution -- --topic, then a registration entry for the same page, then the topic
// parsed from the page's current title.
// ─────────────────────────────────────────────────────────────────────────────

function agentsHome(env) {
  const override = env && env.AGENTS_HOME;
  return override ? String(override) : path.join(homedir(), '.agents');
}

function registrationsPath(env) {
  return path.join(agentsHome(env), 'ws', 'decisions-pickup', 'registrations.json');
}

/**
 * C3: the registered topic for this exact page, or `null` when there is none. Read-only, and a
 * missing or unparsable `registrations.json` is skipped -- never fatal, never written. Read
 * directly here (not through decisions-pickup.mjs, which this territory does not call into and
 * must not depend on) so this lookup never depends on that file's own registration validation
 * landing first. An entry for a different page, or whose `topic` key is missing/not a string/not
 * shaped like C3's topic regex, is skipped rather than trusted.
 */
export function lookupRegisteredTopic(pageId, env) {
  let raw;
  try {
    raw = fs.readFileSync(registrationsPath(env), 'utf8');
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
  const canon = canonicalPageId(pageId);
  for (const entry of parsed.entries) {
    if (!entry || typeof entry.page !== 'string' || canonicalPageId(entry.page) !== canon) continue;
    if (typeof entry.topic === 'string' && TOPIC_RE.test(entry.topic)) return entry.topic;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notion HTTP, fully injected -- nothing below reaches the real network by itself.
// ─────────────────────────────────────────────────────────────────────────────

class UsageError extends Error {}

/** exit 4: a real HTTP response Notion sent back, just not a 2xx one. */
class HttpError extends Error {
  constructor(status, code) {
    super(`HTTP ${status} ${code}`);
    this.status = status;
    this.code = code;
  }
}

/** exit 4: `fetch` itself rejected -- a genuine network failure, or our own 20s timeout. */
class NetworkError extends Error {
  constructor(message, timedOut) {
    super(message);
    this.timedOut = timedOut;
  }
}

async function notionRequest(fetchImpl, method, pageId, token, body) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(`${NOTION_API_BASE}/pages/${pageId}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    // Distinguishing a real timeout from an ordinary network failure is this territory's own
    // call (scout-P3's open question -- C5 only pins the HTTP-error-body wording). A timeout has
    // no HTTP status at all, so it gets its own distinct, equally terse line rather than being
    // folded into the "HTTP <status> <code>" shape C5 states for a real error response.
    if (timedOut) throw new NetworkError('timed out waiting for Notion (20s, no response)', true);
    throw new NetworkError(e instanceof Error ? e.message : 'network error', false);
  }
  clearTimeout(timer);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const code = json && typeof json.code === 'string' ? json.code : 'unknown_error';
    throw new HttpError(res.status, code);
  }
  return json;
}

/** The plain text of a Notion page's title-type property, or `''` if the page has none. */
function extractTitleProperty(page) {
  const props = (page && page.properties) || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop && prop.type === 'title') {
      const arr = Array.isArray(prop.title) ? prop.title : [];
      return arr.map((t) => (t && typeof t.plain_text === 'string' ? t.plain_text : '')).join('');
    }
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (cmd !== 'set' && cmd !== 'meta') {
    throw new UsageError(`expected "set" or "meta", got ${cmd === undefined ? '(nothing)' : JSON.stringify(cmd)}`);
  }
  const out = { cmd, page: null, topic: null, now: null };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--page') { out.page = rest[i + 1] ?? null; i += 1; } else if (a === '--topic' && cmd === 'set') {
      out.topic = rest[i + 1] ?? null; i += 1;
    } else if (a === '--now' && cmd === 'set') {
      out.now = rest[i + 1] ?? null; i += 1;
    } else {
      throw new UsageError(`unrecognized argument for "${cmd}": ${a}`);
    }
  }
  if (!out.page) throw new UsageError('missing required --page');
  if (!PAGE_ID_RE.test(out.page)) throw new UsageError(`--page is not 32-hex or dashed: ${out.page}`);
  if (out.topic !== null && !TOPIC_RE.test(out.topic)) {
    throw new UsageError(`--topic does not match the required shape: ${out.topic}`);
  }
  if (out.now !== null && Number.isNaN(new Date(out.now).getTime())) {
    throw new UsageError(`--now is not a valid date: ${out.now}`);
  }
  return out;
}

/**
 * The whole CLI, wrapped: nothing above this line can crash the process past exit 4. IO and the
 * clock are injectable (C5), and `fetch` is the only path to the network, so a test never
 * touches it. Exits: 0 ok, 2 usage or no topic, 3 NOTION_TOKEN unset, 4 HTTP or network error.
 */
export async function run({
  argv = process.argv.slice(2),
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  now = new Date(),
  stdout = (s) => process.stdout.write(s),
  stderr = (s) => process.stderr.write(s),
} = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    stderr(`decisions-title: ${e instanceof Error ? e.message : 'failed'}\n`);
    return 2;
  }

  // Both subcommands send at least one request, so the token is checked once, up front, before
  // any topic resolution or network call -- never printed, whatever happens next (C5).
  const token = env && env.NOTION_TOKEN;
  if (!token) {
    stderr('decisions-title: NOTION_TOKEN is not set\n');
    return 3;
  }

  try {
    if (args.cmd === 'meta') {
      const page = await notionRequest(fetchImpl, 'GET', args.page, token);
      const title = extractTitleProperty(page);
      const lastEdited = page && typeof page.last_edited_time === 'string' ? page.last_edited_time : '';
      stdout(`${JSON.stringify({
        page: canonicalPageId(args.page), title, last_edited_time: lastEdited,
      })}\n`);
      return 0;
    }

    // set: --topic, then a registration for this exact page, then the topic parsed from the
    // page's current title (C3). A GET is sent only for that last case.
    let topic = args.topic;
    if (topic === null) topic = lookupRegisteredTopic(args.page, env);
    if (topic === null) {
      const page = await notionRequest(fetchImpl, 'GET', args.page, token);
      const parsed = parseTitle(extractTitleProperty(page));
      if (parsed) topic = parsed.topic;
    }
    if (!topic) {
      stderr(
        'decisions-title: no topic (pass --topic, register one for this page, or give the page '
        + 'a title matching "<Topic>: M/D h:mmAM Decisions")\n',
      );
      return 2;
    }

    const effectiveNow = args.now !== null ? new Date(args.now) : now;
    const newTitle = formatTitle(topic, effectiveNow);
    await notionRequest(fetchImpl, 'PATCH', args.page, token, {
      properties: { title: { title: [{ type: 'text', text: { content: newTitle } }] } },
    });
    stdout(`TITLE ${newTitle}\n`);
    return 0;
  } catch (e) {
    if (e instanceof HttpError) {
      stderr(`decisions-title: HTTP ${e.status} ${e.code}\n`);
      return 4;
    }
    if (e instanceof NetworkError) {
      stderr(`decisions-title: ${e.timedOut ? e.message : `network error: ${e.message}`}\n`);
      return 4;
    }
    stderr(`decisions-title: ${e instanceof Error ? e.message : 'failed'}\n`);
    return 4;
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const canon = (p) => {
    let r = path.resolve(p);
    try { r = fs.realpathSync(r); } catch { /* not on disk -- fall back to the resolved path */ }
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return canon(entry) === canon(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(process.exitCode ?? 0); });
  run().then((code) => { process.exitCode = code; });
}
