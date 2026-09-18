#!/usr/bin/env node
// multi-inbox — the Claude Code half of hook delivery.
//
// Codex gets woken by `multi-codex-hook.mjs`; Claude Code gets woken by these, so a peer note lands in
// the session's context without anyone typing into the pane — the failure the pilot spent 1–3.5 hours at
// a time inside.
//
//   UserPromptSubmit  → additionalContext with the new notes, then ack (cursor advances).
//   Stop              → block the stop with the notes as the reason. Nothing waiting means exit 0 at
//                       once — it never waits for a peer (2026-09-16 ruling). Honours stop_hook_active,
//                       so it can never loop.
//   PostToolUse       → additionalContext for notes that arrived mid-turn, behind an mtime gate.
//
// Every event also REGISTERS this session's inbox (spec 2026-09-17): Claude Code exports this session's
// messaging socket and its per-session token to its own hooks, and `registerMyInbox` writes them into
// `~/.agents/notes/inboxes.json` so the flusher can post a note into this session directly. That file
// is what replaced typing into the composer.
//
// EVERY decision about what a note looks like lives in `multi-hook-core.mjs`, shared with Codex. What is
// left here is the Claude-specific part: the argv/stdin contract, the cheap slug (with its 10-minute TTL
// and the `--no-bind` rule that keeps a guess from becoming a binding), the mtime stamp, and the budget.
//
// FOUR RULES, all load-bearing:
//   1. NEVER THROW. A hook that fails is Ben's session broken. Every path is wrapped; the fallback is
//      always "print nothing, exit 0".
//   2. SILENT WHEN THERE IS NOTHING.
//   3. FAST. No event waits for a peer; the ceiling on Stop is one inbox read.
//   4. NEVER GUESS THE SLUG.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { pathToFileURL } = require("url");

/** Hard ceiling on the cheap events. Stop is bounded by its handler timeout instead — see below. */
const BUDGET_MS = 2500;
/** PostToolUse runs on every tool call; it gets a much tighter budget and no git/orca. */
const POST_TOOL_BUDGET_MS = 700;
const NOTES_DIR = path.join(os.homedir(), ".agents", "notes");
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..");
const SKILL_SCRIPTS = path.join(PLUGIN_ROOT, "skills", "multi", "scripts");
const CORE = path.join(__dirname, "multi-hook-core.mjs");
const PANE_SLUG_CACHE_MS = 10 * 60 * 1000;

function stampPath(slug) {
  return path.join(NOTES_DIR, `.poll-${slug}`);
}

/** Newest mtime across the ledger mirror. Appending to today's file bumps that file, not the dir. */
function newestLedgerMtime() {
  let newest = 0;
  let names;
  try {
    names = fs.readdirSync(NOTES_DIR);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue;
    try {
      const m = fs.statSync(path.join(NOTES_DIR, name)).mtimeMs;
      if (m > newest) newest = m;
    } catch { /* raced with a writer; the next tool call sees it */ }
  }
  return newest;
}

function readStamp(slug) {
  try {
    return Number(fs.readFileSync(stampPath(slug), "utf8")) || 0;
  } catch {
    return 0;
  }
}

function writeStamp(slug, value) {
  try {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
    fs.writeFileSync(stampPath(slug), String(value), "utf8");
  } catch { /* a stamp we cannot write just means the next call does the full scan */ }
}

/**
 * The slug WITHOUT spending anything: the env var, or the pane-slug cache transport wrote the last
 * time something resolved this handle. Returns null rather than reaching for orca.
 *
 * `guess` says WHERE it came from, and it decides whether this read may write a binding. The env var
 * is the pane's own statement; the cache is a title we once reduced, kept for 10 minutes on purpose.
 * A binding has no expiry at all, so passing a cached title as `--me` would freeze a renamed pane's
 * old slug forever — it would keep reading and ACKING another slug's inbox, which is exactly what the
 * TTL below exists to prevent (review BLOCKER 1).
 */
function cheapSlug() {
  if (process.env.NOTE_SLUG) return { slug: process.env.NOTE_SLUG, guess: false };
  const handle = process.env.ORCA_TERMINAL_HANDLE;
  if (!handle) return null;
  try {
    const cache = JSON.parse(fs.readFileSync(path.join(NOTES_DIR, ".pane-slug.json"), "utf8"));
    const hit = cache[handle];
    if (!hit || !hit.slug) return null;
    // L1: honour the same 10-minute TTL resolveSlug uses. Without it, a renamed pane keeps reading —
    // and ACKING — the previous slug's inbox, which is the one thing rule 4 forbids.
    if (Date.now() - Number(hit.at || 0) >= PANE_SLUG_CACHE_MS) return null;
    return { slug: hit.slug, guess: true };
  } catch {
    return null;
  }
}

/**
 * M1: a config error (an unwritable cursor, `NOTE_SLUG=Taxonomy` with a capital) used to make this hook
 * permanently silent — runNoteInbox threw, the catch swallowed it, zero bytes, forever. Now it is said
 * once: the message is stamped to disk and only re-emitted when it CHANGES, so a broken pane complains
 * without nagging on every prompt.
 */
function warnOnce(message) {
  const stamp = path.join(NOTES_DIR, ".hook-warn");
  try {
    if (fs.readFileSync(stamp, "utf8") === message) return null;
  } catch { /* no stamp yet */ }
  try {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
    fs.writeFileSync(stamp, message, "utf8");
  } catch { /* cannot stamp: emit anyway, once per prompt is still better than never */ }
  return message;
}

/** Nothing to do at all: no pane identity anywhere, so this session is not part of the protocol. */
function couldBeInAPane() {
  return Boolean(process.env.NOTE_SLUG || process.env.ORCA_TERMINAL_HANDLE);
}

/**
 * D2 (spec 2026-09-17): tell the machine where to deliver notes for this session WITHOUT typing.
 *
 * Claude Code exports `CLAUDE_CODE_MESSAGING_SOCKET` and `CLAUDE_CODE_MESSAGING_TOKEN` to its own
 * hooks before any of them run, so this hook — and only this hook — can write down coordinates that
 * let the flusher post a note straight into this session's inbox. The alternative was typing into the
 * composer, which on 2026-09-17 landed inside a sentence Ben was writing and submitted it.
 *
 * The slug must be FIRST-HAND (the 0.4.0 rule): `$NOTE_SLUG` is this session stating its own identity,
 * and `panes.json` is the same statement written down earlier. A title-derived guess is never used —
 * registering under a guessed slug would send another session's notes here.
 *
 * Best-effort and silent: a registration that cannot be written costs one deferred nudge, and the note
 * is already in the ledger.
 */
async function registerMyInbox(cwd, sessionId) {
  try {
    const transport = await import(pathToFileURL(path.join(SKILL_SCRIPTS, "transport.mjs")).href);
    const home = os.homedir();
    let slug = process.env.NOTE_SLUG || null;
    if (!slug) {
      const handle = process.env.ORCA_TERMINAL_HANDLE;
      if (handle && transport.HANDLE_RE.test(handle)) {
        const bound = transport.readBindings(transport.toPosix(home))[handle];
        slug = bound && bound.slug ? bound.slug : null;
      }
    }
    if (!slug) return null;
    // `sessionId` comes from the payload Claude Code writes to this hook's stdin, so it is first-hand
    // — and it is REQUIRED (review C6): it is sent with every post, the receiver drops a frame whose
    // session id is not its own, and that is what stops a recycled pid from redirecting somebody's note
    // into a different session behind the same `/tmp/cc-socks/<pid>.sock` path.
    // `process.ppid` is recorded for a human reading the file; delivery never uses it.
    const record = transport.claudeInboxRecord(process.env, { sessionId, pid: process.ppid, cwd });
    if (!record) return null;
    return transport.registerInbox(transport.toPosix(home), slug, record);
  } catch {
    return null; // rule 1: never throw out of a hook
  }
}

async function loadInbox() {
  const mod = await import(pathToFileURL(path.join(SKILL_SCRIPTS, "note-inbox.mjs")).href);
  return mod.runNoteInbox;
}

/**
 * Write and WAIT for the flush. On Windows stdout to a pipe is asynchronous, and `process.exit` does not
 * flush it — a Stop reason of 1-2 KB can be truncated and the whole delivery lost (review MAJOR 4).
 */
function emit(object) {
  return new Promise((resolve) => {
    try {
      process.stdout.write(JSON.stringify(object), () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

async function main() {
  if (!couldBeInAPane()) return;
  const input = await readInput();
  const event = input.hook_event_name || process.argv[2] || "";
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const sessionId = input.session_id;

  // C4: SessionStart REGISTERS and stops there — no inbox read, no output, nothing in the context.
  // A pane Ben opens and walks away from used to register nothing at all (the adapter only gets here on
  // a prompt, a stop, or a tool call past the mtime gate), which made the one case this whole feature
  // exists for — an idle session — the one case it could not reach. Registration only, because a
  // session that has just started has not asked for anything, and its first UserPromptSubmit will
  // surface whatever is waiting a moment later anyway.
  if (event === "SessionStart") {
    await registerMyInbox(cwd, sessionId);
    return;
  }

  // PostToolUse is the hot path: it fires on every tool call, so it decides whether there is anything
  // to do from a stamp and a directory mtime, before importing anything.
  let extraArgs = [];
  if (event === "PostToolUse") {
    const me = cheapSlug();
    if (!me) return;
    const newest = newestLedgerMtime();
    if (newest === 0 || newest <= readStamp(me.slug)) return;
    // `--no-bind` when the slug came from the title cache: a guess must never become a permanent binding.
    extraArgs = ["--me", me.slug, "--no-repo", ...(me.guess ? ["--no-bind"] : [])];
  }

  let delivered = null;

  const work = (async () => {
    // D2: register this session's inbox first, so a session that has nothing to read is still
    // REACHABLE. Its own try/catch, because a failed registration must not stop the note read.
    await registerMyInbox(cwd, sessionId);
    try {
      // Inside the try on purpose: a broken CLAUDE_PLUGIN_ROOT makes this import throw, and M1 says a
      // config error must SAY SO once rather than making the hook permanently silent.
      const core = await import(pathToFileURL(CORE).href);
      const runNoteInbox = await loadInbox();
      const inbox = (argv) => runNoteInbox([...extraArgs, ...argv], { cwd });
      const result = await core.runHookEvent({
        event,
        input,
        cwd,
        home: os.homedir(),
        env: process.env,
        now: Date.now(),
        inbox,
        // L2: the stamp moves only AFTER a successful read. Advancing it first meant any failure
        // underneath was never retried until some other write happened to touch the mirror again.
        onRead: (r) => writeStamp(r.slug, newestLedgerMtime()),
      });
      if (result?.output) delivered = { ...result, inbox };
      return undefined;
    } catch (err) {
      // M1: a configuration error must SAY SO once, not vanish. Never on PostToolUse (it fires on every
      // tool call) and never on Stop (a broken hook must not block a stop).
      if (event !== "UserPromptSubmit" && event !== "") return undefined;
      const once = warnOnce(`multi-inbox: peer notes are not being read — ${err && err.message ? err.message : String(err)}`);
      if (once) {
        delivered = {
          output: {
            suppressOutput: true,
            hookSpecificOutput: {
              hookEventName: "UserPromptSubmit",
              additionalContext: `${once}
Peer notes are still in ~/.agents/notes/ — read them with \`note-inbox --me <your-slug>\`.`,
            },
          },
          ackIds: [],
        };
      }
      return undefined;
    }
  })();

  // Stop is not raced against a timer: it is one inbox read, and losing that race would drop a
  // delivery the model was about to be blocked on. Its ceiling is the handler `timeout` in hooks.json,
  // now 60 s — it no longer parks (2026-09-16 ruling).
  if (event === "Stop") {
    await work;
  } else {
    const budget = event === "PostToolUse" ? POST_TOOL_BUDGET_MS : BUDGET_MS;
    let timer;
    await Promise.race([
      work,
      new Promise((resolve) => { timer = setTimeout(resolve, budget); timer.unref?.(); }),
    ]);
    clearTimeout(timer);
  }

  if (!delivered) return;
  // Emit, wait for the flush, and only THEN ack exactly what was printed. A process killed in between
  // (Esc on a running hook, the budget above, a closed pane) then repeats a note instead of losing it —
  // the cursor is what note-flush reads to decide a wake-up is no longer needed (review MAJOR 3).
  await emit(delivered.output);
  if (delivered.ackIds && delivered.ackIds.length && delivered.inbox) {
    try {
      await delivered.inbox(["--ack-ids", delivered.ackIds.join(",")]);
    } catch { /* delivered; it will simply repeat */ }
  }
}

function readInput() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => { raw += d; });
    process.stdin.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
    });
    process.stdin.on("error", () => resolve({}));
  });
}

main()
  .catch(() => { /* rule 1: a hook failure must never be visible to Ben's session */ })
  .finally(() => {
    // The exit stays — a hook that lingers is a turn that will not end, and the suite hung the moment
    // it was removed. What changed is WHEN we get here: `emit` awaits the stdout callback and the ack
    // is awaited after it, so by now the pipe has taken the whole object. Exiting BEFORE that flush is
    // what truncates a long Stop reason on Windows (review MAJOR 4).
    process.exit(0);
  });
