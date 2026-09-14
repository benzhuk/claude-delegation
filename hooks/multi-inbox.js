#!/usr/bin/env node
// multi-inbox — the Claude Code half of the v4 wake-up (spec V3).
//
// Codex gets woken by its `notify` hook at turn end. Claude Code gets woken by these, so that a peer
// note lands in the session's context without anyone having typed into the pane — the failure the
// pilot spent 1–3.5 hours at a time inside.
//
//   UserPromptSubmit  → additionalContext with the new notes, then ack (cursor advances).
//   Stop              → block the stop with the notes as the reason, then ack. Honours
//                       stop_hook_active, so it can never loop.
//   PostToolUse       → additionalContext for notes that arrived mid-turn. Confirmed supported:
//                       `hookSpecificOutput.additionalContext` on PostToolUse reaches the model
//                       (.claude/agent-reports/…/claude-hooks-capabilities.md §3).
//
// FOUR RULES, all of them load-bearing:
//   1. NEVER THROW. A hook that fails is Ben's session broken. Every path is wrapped, the whole run is
//      bounded by a timer, and the fallback is always "print nothing, exit 0".
//   2. SILENT WHEN THERE IS NOTHING. No notes, no slug, no Orca pane: no output at all.
//   3. FAST. PostToolUse fires on every tool call, so it short-circuits on a directory mtime check and
//      never shells out to git or orca. UserPromptSubmit and Stop may resolve a slug through orca, but
//      only once per 10 minutes (transport caches it).
//   4. NEVER GUESS THE SLUG. `$NOTE_SLUG`, else the pane's `$ORCA_TERMINAL_HANDLE`. A hook that reads
//      the wrong pane's inbox shows one session another session's notes.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { pathToFileURL } = require("url");

/** Hard ceiling on the whole hook, whatever happens underneath. */
const BUDGET_MS = 2500;
/** PostToolUse runs on every tool call; it gets a much tighter budget and no git/orca. */
const POST_TOOL_BUDGET_MS = 700;
const NOTES_DIR = path.join(os.homedir(), ".agents", "notes");
const SKILL_SCRIPTS = path.join(
  process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, ".."),
  "skills", "multi", "scripts",
);

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

const PANE_SLUG_CACHE_MS = 10 * 60 * 1000;

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

async function inbox(argv, cwd) {
  const mod = await import(pathToFileURL(path.join(SKILL_SCRIPTS, "note-inbox.mjs")).href);
  return mod.runNoteInbox(argv, { cwd });
}

/**
 * Keep an injection small: hooks' output is concatenated into the context on every prompt, and the
 * practical guidance is ~500 tokens per injection. `maxChars` truncates each envelope line — the full
 * line is always in the ledger, and the id is at the front (L3).
 */
function summarise(result, limit = 12, maxChars = 0) {
  const shown = result.notes.slice(0, limit);
  const lines = shown.map((n) => {
    const packet = n.details ? (n.packetExists ? ` (packet: ${n.packetPath})` : ` (packet MISSING: ${n.details})`) : "";
    const text = `${n.line}${packet}`;
    return `  ${maxChars > 0 && text.length > maxChars ? `${text.slice(0, maxChars)}…` : text}`;
  });
  const more = result.notes.length - shown.length;
  return [
    `${result.count} new peer note${result.count === 1 ? "" : "s"} for ${result.slug} (the multi skill; the ledger is the channel):`,
    ...lines,
    more > 0 ? `  …and ${more} more in ~/.agents/notes/ — read them with \`note-inbox --me ${result.slug}\`` : null,
    // M3: problems are the packet that never arrived, the cursor that cannot be written. They reached
    // note-inbox's stderr and nowhere else, and hook stderr on exit 0 does not reach the model.
    ...(result.problems || []).map((p) => `  ! ${p}`),
    "Read the packet before acting. ACK an ASK you take, or send BLOCKED with the reason. "
    + "Never re-send an id someone else sent, and never wait on a peer inside this turn.",
  ].filter(Boolean).join("\n");
}

function emit(object) {
  process.stdout.write(JSON.stringify(object));
}

async function handleUserPromptSubmit(cwd) {
  const result = await inbox(["--ack"], cwd);
  if (!result || result.count === 0) return;
  writeStamp(result.slug, newestLedgerMtime());
  emit({
    suppressOutput: true,
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: summarise(result) },
  });
}

async function handleStop(input, cwd) {
  // The loop guard. Without this a blocked stop that keeps finding notes would never let the session
  // end. We also ack below, so a second fire has nothing to find anyway — belt and braces.
  if (input.stop_hook_active) return;
  const result = await inbox(["--ack"], cwd);
  if (!result || result.count === 0) return;
  writeStamp(result.slug, newestLedgerMtime());
  emit({
    // L3: a Stop reason is read in full by the model at the worst moment for a wall of text. Six notes,
    // each truncated; the rest are one `note-inbox` away and are already in the ledger.
    decision: "block",
    reason: `${summarise(result, 6, 220)}\n\nHandle these before you stop: ACK what you are taking, answer what you can, `
      + "or send BLOCKED with the reason. If none of it is for you, say so in one line and stop.",
  });
}

async function handlePostToolUse(cwd) {
  // The cheap path: no git, no orca, no import unless the mirror actually changed.
  const me = cheapSlug();
  if (!me) return;
  const slug = me.slug;
  const newest = newestLedgerMtime();
  if (newest === 0 || newest <= readStamp(slug)) return;
  // `--no-bind` when the slug came from the title cache: a guess must never become a permanent binding.
  const args = ["--me", slug, "--ack", "--no-repo", ...(me.guess ? ["--no-bind"] : [])];
  const result = await inbox(args, cwd);
  // L2: the stamp moves only AFTER a successful read. Advancing it first meant any failure underneath
  // was never retried until some other write happened to touch the mirror again.
  writeStamp(slug, newest);
  if (!result || result.count === 0) return;
  emit({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `${summarise(result, 6, 220)}\nThis arrived mid-turn. Finish the current atomic step first — a note never interrupts an in-flight edit.`,
    },
  });
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

async function main() {
  if (!couldBeInAPane()) return;
  const input = await readInput();
  const event = input.hook_event_name || process.argv[2] || "";
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const work = (async () => {
    try {
      if (event === "Stop") return await handleStop(input, cwd);
      if (event === "PostToolUse") return await handlePostToolUse(cwd);
      if (event === "UserPromptSubmit" || event === "") return await handleUserPromptSubmit(cwd);
      return undefined;
    } catch (err) {
      // M1: a configuration error must SAY SO once, not vanish. Never on PostToolUse (it fires on every
      // tool call) and never on Stop (a broken hook must not block a stop).
      if (event !== "UserPromptSubmit" && event !== "") return undefined;
      const once = warnOnce(`multi-inbox: peer notes are not being read — ${err && err.message ? err.message : String(err)}`);
      if (once) {
        emit({
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: `${once}\nPeer notes are still in ~/.agents/notes/ — read them with \`note-inbox --me <your-slug>\`.`,
          },
        });
      }
      return undefined;
    }
  })();

  const budget = event === "PostToolUse" ? POST_TOOL_BUDGET_MS : BUDGET_MS;
  let timer;
  await Promise.race([
    work,
    new Promise((resolve) => { timer = setTimeout(resolve, budget); timer.unref?.(); }),
  ]);
  clearTimeout(timer);
}

main()
  .catch(() => { /* rule 1: a hook failure must never be visible to Ben's session */ })
  .finally(() => { process.exit(0); });
