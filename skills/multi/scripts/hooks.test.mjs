// node --test "skills/multi/scripts/*.test.mjs"
// The plugin hooks (spec V3). Each case runs the real hook as a child process with a fixture HOME, so
// what is asserted is exactly what Claude Code would receive on stdout.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { toPosix, cursorPath, readCursor } from './transport.mjs';
// S1/S2, then N2: ONE sealing helper for the whole suite, so the rule is a property of the suite and
// not of this file. `no test file inherits the runner environment` below is what keeps it that way.
import { childEnv, SEALED } from './test-child-env.mjs';
// Round 2 (N2 review MAJOR 1): N2 scans the SAME files `run-tests.mjs` actually runs, found the
// SAME way, instead of a hand-maintained root list - a mistyped or renamed root used to scan zero
// files and still pass (proved by renaming `scripts` -> `scriptz`: N2 stayed green with 10 files
// unscanned). Reusing this walk also means a new territory's test directory is policed the moment
// it exists, with nothing for anyone to remember to add here.
import { walkTestFiles } from '../../../scripts/run-tests.mjs';

const REPO = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const HOOK = path.join(REPO, 'hooks', 'multi-inbox.js');
const HOOKS_JSON = path.join(REPO, 'hooks', 'hooks.json');

function tmp() { return toPosix(fs.mkdtempSync(path.join(os.tmpdir(), 'multi-hook-'))); }

/** The session id Claude Code puts in every hook payload; a socket registration is pinned to it (C6). */
const SESSION_ID = 'fixture-session-0001';

// The fixture note must be dated NOW in Ben's zone, not UTC: the cold-start window ages a line by the
// timestamp it carries, so a UTC date near midnight would silently fall outside it and make this suite
// pass or fail by clock.
const nycParts = Object.fromEntries(
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).map((p) => [p.type, p.value]),
);
const TODAY = `${nycParts.year}-${nycParts.month}-${nycParts.day}`;
const STAMP = `${Number(nycParts.month)}.${Number(nycParts.day)}.${nycParts.year.slice(2)}`;
const CLOCK = `${nycParts.hour === '24' ? '00' : nycParts.hour}:${nycParts.minute}`;

function mirror(home, lines) {
  const file = path.join(home, '.agents/notes', `${TODAY}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# Peer-note ledger ${TODAY}\n\n${lines.join('\n')}\n`, 'utf8');
  return file;
}

const note = (id, kind = 'ASK', body = 'Please review PR 137') =>
  `astra → taxonomy, ${STAMP} ${CLOCK} NYC [${id}] ${kind}: ${body}.`;

/**
 * Run the hook exactly as Claude Code does: JSON on stdin, the event name in argv, and a HOME that
 * points at the fixture. HOME/USERPROFILE both set — os.homedir() reads USERPROFILE on Windows.
 */
function runHook(event, home, input = {}, extraEnv = {}) {
  const stdout = execFileSync(process.execPath, [HOOK, event], {
    input: JSON.stringify({ hook_event_name: event, cwd: home, session_id: SESSION_ID, ...input }),
    encoding: 'utf8',
    env: childEnv(home, { CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: 'taxonomy', ORCA_TERMINAL_HANDLE: '', ...extraEnv }),
  });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

test('V3: hooks.json parses, and every command goes through ${CLAUDE_PLUGIN_ROOT}', () => {
  const cfg = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  assert.deepEqual(Object.keys(cfg.hooks).sort(), ['PostToolBatch', 'PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit']);
  const commands = Object.values(cfg.hooks).flat().flatMap((g) => g.hooks).map((h) => h.command);
  assert.ok(commands.length >= 4);
  for (const c of commands) {
    assert.match(c, /\$\{CLAUDE_PLUGIN_ROOT\}/, `${c} must be plugin-root relative`);
    assert.equal(c.includes('\\\\'), false);
  }
  assert.ok(commands.some((c) => c.includes('delegation-reminder.js')), 'the existing routing hook survives');
  assert.equal(commands.filter((c) => c.includes('multi-inbox.js')).length, 4);
  // T2/C3: the backlog notice rides UserPromptSubmit, PostToolUse and Stop alongside the existing
  // handlers on each — never its own new event, never replacing another hook's entry.
  assert.equal(commands.filter((c) => c.includes('backlog-notice.js')).length, 3);
  for (const ev of ['UserPromptSubmit', 'PostToolUse', 'Stop']) {
    assert.ok(
      cfg.hooks[ev].flatMap((g) => g.hooks).some((h) => h.command.includes('backlog-notice.js')),
      `${ev} must carry a backlog-notice.js entry`,
    );
  }
  // C4: SessionStart is what makes a session that starts and sits idle reachable at all.
  assert.match(cfg.hooks.SessionStart[0].hooks[0].command, /multi-inbox\.js" SessionStart/);
  // The dispatch guard must stay narrow: a catch-all matcher would put a node cold start on every tool call.
  assert.equal(cfg.hooks.PreToolUse[0].matcher, 'Agent|SendMessage');
  assert.match(cfg.hooks.PreToolUse[0].hooks[0].command, /agent-dispatch-guard\.mjs"$/);
});

test('V3: UserPromptSubmit injects the new notes and acks them', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  const out = runHook('UserPromptSubmit', home);
  assert.equal(out.suppressOutput, true);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /1 new peer note for taxonomy/);
  assert.match(out.hookSpecificOutput.additionalContext, /\[astra-pr137-1\]/);
  assert.ok(readCursor(home, 'taxonomy').seen['astra-pr137-1'], 'the cursor advances, so it is shown once');
  assert.equal(runHook('UserPromptSubmit', home), null, 'nothing new, nothing printed');
});

test('V3: Stop blocks with the notes as the reason, then never blocks on them again', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1'), note('astra-pr138-1', 'ASK', 'And PR 138')]);
  const out = runHook('Stop', home);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /2 new peer notes for taxonomy/);
  assert.match(out.reason, /Handle these before you stop/);
  assert.equal(runHook('Stop', home), null);
});

test('V3: stop_hook_active short-circuits — a Stop hook must never loop', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  assert.equal(runHook('Stop', home, { stop_hook_active: true }), null);
  assert.equal(fs.existsSync(cursorPath(home, 'taxonomy')), false, 'and it does not even read');
});

test('V3: PostToolUse is silent until the ledger changes, then injects once', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  const first = runHook('PostToolUse', home);
  assert.equal(first.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(first.hookSpecificOutput.additionalContext, /arrived mid-turn/);
  assert.equal(runHook('PostToolUse', home), null, 'unchanged ledger: the mtime stamp short-circuits');
});

test('V3: a session with no pane identity produces nothing at all', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  for (const event of ['UserPromptSubmit', 'Stop', 'PostToolUse']) {
    assert.equal(runHook(event, home, {}, { NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: '' }), null, event);
  }
});

test('V3: an empty ledger, a missing notes dir and a corrupt cursor are all silent, exit 0', () => {
  const home = tmp();
  assert.equal(runHook('UserPromptSubmit', home), null);
  assert.equal(runHook('PostToolUse', home), null);
  mirror(home, [note('astra-pr137-1')]);
  fs.writeFileSync(cursorPath(home, 'taxonomy'), 'not json at all');
  const out = runHook('UserPromptSubmit', home);
  assert.match(out.hookSpecificOutput.additionalContext, /astra-pr137-1/);
});

test('V3: my own sends and other panes\' notes are never injected', () => {
  const home = tmp();
  mirror(home, [
    `taxonomy → astra, ${STAMP} ${CLOCK} NYC [taxonomy-mine-1] ACK: My own send.`,
    `astra → nucleus, ${STAMP} ${CLOCK} NYC [astra-theirs-1] FYI: Someone elses.`,
  ]);
  assert.equal(runHook('UserPromptSubmit', home), null);
});

test('M1: a hook that cannot import its script exits 0 and SAYS SO once, never silently', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  const broken = () => execFileSync(process.execPath, [HOOK, 'UserPromptSubmit'], {
    input: '{}',
    encoding: 'utf8',
    env: childEnv(home, { CLAUDE_PLUGIN_ROOT: path.join(home, 'nowhere'), NOTE_SLUG: 'taxonomy' }),
  });
  // Silence here was the bug: a broken config meant peer notes stopped arriving with no signal at all.
  const first = JSON.parse(broken());
  assert.equal(first.suppressOutput, true);
  assert.match(first.hookSpecificOutput.additionalContext, /peer notes are not being read/);
  assert.match(first.hookSpecificOutput.additionalContext, /note-inbox --me/);
  // …but it must not nag on every prompt: the same message is emitted once.
  assert.equal(broken().trim(), '', 'the same warning must not repeat every prompt');
});

test('M1: an unwritable cursor still surfaces the notes, with the problem named', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  // The reviewer's probe: `.cursor-taxonomy` occupied by a directory. writeCursor used to throw, the
  // hook swallowed it, and a real pending note produced zero bytes forever.
  fs.mkdirSync(cursorPath(home, 'taxonomy'), { recursive: true });
  const out = runHook('UserPromptSubmit', home);
  assert.ok(out, 'a pending note must still be injected');
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.match(ctx, /astra-pr137-1/);
  assert.match(ctx, /cursor not writable/);
  // and the fallback cursor means it is not repeated forever
  assert.equal(runHook('UserPromptSubmit', home), null, 'the temp-dir fallback cursor still dedupes');
});

test('M1: a bad NOTE_SLUG is reported once instead of silencing the pane', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  const out = runHook('UserPromptSubmit', home, {}, { NOTE_SLUG: 'Taxonomy' });
  assert.ok(out, 'an uppercase NOTE_SLUG used to make the hook silent forever');
  assert.match(out.hookSpecificOutput.additionalContext, /peer notes are not being read/);
  assert.match(out.hookSpecificOutput.additionalContext, /lowercase/);
});

test('M1/M3: Stop never emits a config warning — a broken hook must not block a stop', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  const stdout = execFileSync(process.execPath, [HOOK, 'Stop'], {
    input: JSON.stringify({ hook_event_name: 'Stop', cwd: home }),
    encoding: 'utf8',
    env: childEnv(home, { CLAUDE_PLUGIN_ROOT: path.join(home, 'nowhere'), NOTE_SLUG: 'taxonomy' }),
  });
  assert.equal(stdout.trim(), '');
});

test('M3: a missing packet is surfaced in the injected context, not just on stderr', () => {
  const home = tmp();
  // Lane 47, P6/P7: `packetLocation` only reports MISSING for a repo git itself proved — so this
  // fixture's cwd (`home`, passed as the hook's `input.cwd`) must be a real, git-initialized
  // checkout for the packet to be genuinely absent from a CHECKED repo, not merely "not checked
  // here". `git init` alone needs no commit identity.
  execFileSync('git', ['init', '-q', home], { env: childEnv(home) });
  mirror(home, [`astra → taxonomy, ${STAMP} ${CLOCK} NYC [astra-gone-1] ASK: See the packet. Details: docs/notes/astra-gone-1.md`]);
  const out = runHook('UserPromptSubmit', home);
  assert.match(out.hookSpecificOutput.additionalContext, /packet MISSING: docs\/notes\/astra-gone-1\.md/);
  assert.match(out.hookSpecificOutput.additionalContext, /! \[astra-gone-1\] points at/);
});

test('L3: a Stop reason stays small — six notes, each truncated', () => {
  const home = tmp();
  const long = 'x'.repeat(400);
  // ASK (not FYI): since MINOR 11, a Stop where every waiting note is ledger-only does not block at
  // all — this test is about the size/truncation of a block that DOES happen, so it needs a loud kind.
  mirror(home, Array.from({ length: 12 }, (_, i) => note(`astra-bulk${i}-1`, 'ASK', long)));
  const out = runHook('Stop', home);
  assert.equal(out.decision, 'block');
  assert.ok(out.reason.length < 2500, `Stop reason was ${out.reason.length} bytes`);
  assert.match(out.reason, /…and 6 more in ~\/\.agents\/notes\//);
  assert.match(out.reason, /note-inbox --me taxonomy/);
});

test('L1: a stale pane-slug cache entry is not used — PostToolUse never acks the previous slug', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  const cache = path.join(home, '.agents/notes/.pane-slug.json');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify({ term_abc: { slug: 'taxonomy', at: Date.now() - 20 * 60 * 1000 } }));
  const env = { NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: 'term_abc' };
  assert.equal(runHook('PostToolUse', home, {}, env), null, 'an 20-minute-old cache entry is not "me"');
  assert.equal(fs.existsSync(cursorPath(home, 'taxonomy')), false, 'and nothing was acked under it');

  fs.writeFileSync(cache, JSON.stringify({ term_abc: { slug: 'taxonomy', at: Date.now() } }));
  const fresh = runHook('PostToolUse', home, {}, env);
  assert.match(fresh.hookSpecificOutput.additionalContext, /astra-pr137-1/);
});

test('V3: malformed stdin is not a crash', () => {
  const home = tmp();
  const stdout = execFileSync(process.execPath, [HOOK, 'UserPromptSubmit'], {
    input: 'not json',
    encoding: 'utf8',
    env: childEnv(home, { CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: 'taxonomy' }),
  });
  assert.equal(stdout.trim(), '');
});

test('H4: a wedged orca cannot hold a prompt open — the hook returns inside its own budget', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  // An `orca` that never answers, and a subprocess timeout far beyond the hook's own bound, so what is
  // being measured is the HOOK's budget rather than execFile's. NOTE_SLUG is cleared, so slug
  // resolution has to go through this hanging runner.
  const started = Date.now();
  const stdout = execFileSync(process.execPath, [HOOK, 'UserPromptSubmit'], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: home }),
    encoding: 'utf8',
    env: childEnv(home, {
      CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: 'term_abc',
      ORCA_CLI: `${process.execPath} -e setInterval(()=>{},1000)`,
      ORCA_TIMEOUT_MS: '600000',
    }),
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 5000, `the hook took ${elapsed} ms; its advertised ceiling is under 5 s`);
  assert.equal(stdout.trim(), '', 'and it says nothing rather than guessing at a slug');
});

test('H4: PostToolUse never pays for orca at all, wedged or not', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  const started = Date.now();
  const stdout = execFileSync(process.execPath, [HOOK, 'PostToolUse'], {
    input: JSON.stringify({ hook_event_name: 'PostToolUse', cwd: home }),
    encoding: 'utf8',
    env: childEnv(home, {
      CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: 'term_abc',
      ORCA_CLI: `${process.execPath} -e setInterval(()=>{},1000)`,
    }),
  });
  // No cached slug, so there is nothing to do — and it must reach that conclusion without an orca call.
  assert.ok(Date.now() - started < 2000);
  assert.equal(stdout.trim(), '');
});

// ─────────────────────────────────────────────────────────────────────────────
// D2 (spec 2026-09-17) — the hook registers this session's inbox, so nobody has to type
// ─────────────────────────────────────────────────────────────────────────────

const SOCKET = '/tmp/cc-socks/4242.sock';
const TOKEN = 'tok3n-that-must-never-be-printed';
const messagingEnv = (over = {}) => ({
  CLAUDE_CODE_MESSAGING_SOCKET: SOCKET, CLAUDE_CODE_MESSAGING_TOKEN: TOKEN, ...over,
});

function inboxes(home) {
  const file = path.join(home, '.agents/notes/inboxes.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).inboxes : null;
}

test('D2: a session with a messaging socket registers its inbox, and prints no token', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  const out = runHook('UserPromptSubmit', home, {}, messagingEnv());
  const reg = inboxes(home);
  assert.equal(reg.taxonomy.kind, 'claude-socket');
  assert.equal(reg.taxonomy.socket, SOCKET);
  assert.equal(reg.taxonomy.token, TOKEN, 'the token is in THIS FILE and nowhere else');
  assert.equal(reg.taxonomy.sessionId, SESSION_ID, 'C6: pinned to the session that wrote it');
  assert.equal(reg.taxonomy.host, os.hostname(), 'C7: and to this machine');
  assert.ok(reg.taxonomy.pid > 0, 'the Claude process, for a human reading the file');
  assert.equal(JSON.stringify(out).includes(TOKEN), false, 'never on stdout, where the model would read it');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(path.join(home, '.agents/notes/inboxes.json')).mode & 0o777, 0o600);
  }
});

test('D2: a session with NOTHING waiting still registers - being reachable is the point', () => {
  const home = tmp();
  assert.equal(runHook('UserPromptSubmit', home, {}, messagingEnv()), null, 'silent, as always');
  assert.equal(inboxes(home).taxonomy.socket, SOCKET);
});

test('D2: Stop registers too, and a session without the env vars registers nothing', () => {
  const home = tmp();
  runHook('Stop', home, {}, messagingEnv());
  assert.equal(inboxes(home).taxonomy.socket, SOCKET);
  const bare = tmp();
  runHook('UserPromptSubmit', bare, {}, {});
  assert.equal(inboxes(bare), null, 'no socket in the environment, nothing to register');
});

test('C4: SessionStart registers and does nothing else - a session that starts idle is reachable', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  const out = runHook('SessionStart', home, { source: 'startup' }, messagingEnv());
  assert.equal(out, null, 'registration only: no inbox read, no context, nothing in the transcript');
  assert.equal(inboxes(home).taxonomy.sessionId, SESSION_ID);
  // Nothing was acked either, so the note is still there for the first real event to surface.
  assert.equal(fs.existsSync(cursorPath(home, 'taxonomy')), false);
});

test('C6: no session_id in the payload means no registration at all', () => {
  const home = tmp();
  const stdout = execFileSync(process.execPath, [HOOK, 'UserPromptSubmit'], {
    // Deliberately no `session_id`: a record that cannot be pinned to a session must not be written,
    // because a recycled pid behind the same socket path would then redirect a note into another one.
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: home }),
    encoding: 'utf8',
    env: childEnv(home, { CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: 'taxonomy', ...messagingEnv() }),
  });
  assert.equal(stdout.trim(), '');
  assert.equal(inboxes(home), null);
});

test('D2: a GUESSED slug never registers - that would send another session its notes', () => {
  const home = tmp();
  mirror(home, [note('astra-pr137-1')]);
  const cache = path.join(home, '.agents/notes/.pane-slug.json');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify({ term_abc: { slug: 'taxonomy', at: Date.now() } }));
  const guessing = messagingEnv({ NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: 'term_abc' });
  runHook('PostToolUse', home, {}, guessing);
  assert.equal(inboxes(home), null, 'a title-derived slug is not this session stating its identity');

  // A BINDING is that statement, written down - so it does register.
  fs.writeFileSync(
    path.join(home, '.agents/notes/panes.json'),
    JSON.stringify({ term_abc: { slug: 'taxonomy', at: Date.now() } }),
  );
  runHook('UserPromptSubmit', home, {}, guessing);
  assert.equal(inboxes(home).taxonomy.socket, SOCKET);
});

test('S1: no hook child can register anything the fixture did not give it', () => {
  // THE REGRESSION TEST FOR THE INCIDENT. This suite runs inside a live session, so `process.env` holds
  // that session's real socket and token; every spawn goes through `childEnv`, which blanks them. Here
  // the runner's own environment is loaded with sentinels and every event is run in the configuration
  // that DOES register - a valid plugin root and a first-hand slug - and the sentinel must appear
  // nowhere. Before the fix, the malformed-stdin case alone wrote the running session's token into a
  // fixture registry while passing.
  const SENTINEL_SOCKET = '/tmp/cc-socks/SENTINEL-must-never-be-registered.sock';
  const SENTINEL_TOKEN = 'SENTINEL-TOKEN-must-never-be-registered';
  const previous = {
    CLAUDE_CODE_MESSAGING_SOCKET: process.env.CLAUDE_CODE_MESSAGING_SOCKET,
    CLAUDE_CODE_MESSAGING_TOKEN: process.env.CLAUDE_CODE_MESSAGING_TOKEN,
  };
  process.env.CLAUDE_CODE_MESSAGING_SOCKET = SENTINEL_SOCKET;
  process.env.CLAUDE_CODE_MESSAGING_TOKEN = SENTINEL_TOKEN;
  const homes = [];
  try {
    for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop', 'PostToolUse']) {
      const home = tmp();
      homes.push(home);
      mirror(home, [note('astra-sentinel-1')]);
      runHook(event, home, {});
    }
    // And the one spawn that is not `runHook`: the malformed-stdin site, the site that leaked.
    const home = tmp();
    homes.push(home);
    execFileSync(process.execPath, [HOOK, 'UserPromptSubmit'], {
      input: 'not json',
      encoding: 'utf8',
      env: childEnv(home, { CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: 'taxonomy' }),
    });
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  for (const home of homes) {
    const seen = JSON.stringify(inboxes(home) ?? null);
    assert.equal(seen.includes(SENTINEL_TOKEN), false, `sentinel token reached ${home}`);
    assert.equal(seen.includes('SENTINEL'), false, `sentinel socket reached ${home}`);
  }
});

// --- N2 extension (lane 57): a spawn site can violate "never inherits the runner's environment"
// two ways - handing a child an explicitly inheriting env value (`undefined`, `null`, `process.env`,
// or a bare `...process.env` spread), OR passing NO `env` key at all, which inherits the WHOLE real
// environment unmodified (worse: no text pattern for a naive scan to find). Lane 57 found the second
// shape at test-home.test.mjs's `spawnAndSignal`. Fix round 1 closed four ways a text scan can be
// fooled: a comment or string inside a call corrupting where the call actually ends (F1), an
// exemption list keyed by line number instead of file (F2), a `sh -c` (or `fork`) child that runs
// node without `process.execPath` as its OWN first argument (F3/F6), and an inheriting env VALUE
// reading as "has an env key" (F4) - plus normalizing every reported path to `/` so the exemption
// keys (always written with `/`) still match a Windows scan's `\` paths (W1). These helpers make all
// of it mechanical instead of remembered.

/** `s` with every comment and string body blanked to spaces (same length), so a key test sees code
 * only - an apostrophe in a `//` comment, or the word "env" inside a string, can no longer corrupt
 * what looks like an object key (F1, measured false green on note-inbox.test.mjs:369). */
function codeOnly(s) {
  let out = '';
  let inStr = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') { out += '  '; i++; continue; }
      if (c === inStr) { inStr = null; out += c; } else out += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (c === '/' && s[i + 1] === '/') { const nl = s.indexOf('\n', i); const end = nl === -1 ? s.length : nl; out += ' '.repeat(end - i); i = end - 1; continue; }
    if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); const end = e === -1 ? s.length : e + 2; out += s.slice(i, end).replace(/[^\n]/g, ' '); i = end - 1; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; continue; }
    out += c;
  }
  return out;
}

/** Balanced-delimiter slice of `text` starting at `openIdx` (which must be `openCh`), string- AND
 * comment-aware (F1): an apostrophe in a `//` comment used to be read as the start of a string,
 * stretching the slice into unrelated later code. */
function extractBalanced(text, openIdx, openCh, closeCh) {
  let depth = 0;
  let i = openIdx;
  let inStr = null;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') { const nl = text.indexOf('\n', i); if (nl === -1) break; i = nl; continue; }
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); if (end === -1) break; i = end + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === openCh) depth++;
    else if (c === closeCh) { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return text.slice(openIdx);
}

/** One-hop resolution: does `const <ident> = { ... }` (found in `fileText`) have an `env` key? Null
 * if the identifier isn't declared EXACTLY ONCE as an object literal in this file (F7) - an ambiguous
 * case (two same-named declarations, e.g. one per helper function) is not vouched for either way,
 * instead of silently resolving to whichever declaration happens to come first. Matches `env` only as
 * an object KEY (via `codeOnly`), not as any occurrence of the word (e.g. `{ cwd: env.HOME }`). */
function resolveIdentHasEnvKey(fileText, ident) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${ident}\\s*=\\s*\\{`, 'g');
  const decls = [...fileText.matchAll(re)];
  if (decls.length !== 1) return null;
  const braceIdx = fileText.indexOf('{', decls[0].index);
  const obj = extractBalanced(fileText, braceIdx, '{', '}');
  return /[{,]\s*env\s*[:,}]/.test(codeOnly(obj));
}

/**
 * Finds every way a test file's spawn can inherit the runner's real environment:
 *  (a) a spawn/spawnSync/execFile/execFileSync/fork call, narrowed to one that can actually reach the
 *      runner's session - `process.execPath`, a local const bound to it, or the string `'node'`/
 *      `"node"` appears ANYWHERE in the call's own text, including behind a `sh -c` script (F3), or
 *      the call is fork itself, always node (F6) - that passes no `env` key at
 *      all, checked key-only and comment/string-safe (F1, F7). A spawn of a fixed external binary with
 *      no node anywhere in its argv (`git`, `mkfifo`, `taskkill.exe`, a `sh -c` script that never runs
 *      node) has no code path that parses or forwards `CLAUDE_CODE_MESSAGING_SOCKET`/`TOKEN`, so it
 *      cannot reach the session through inheritance alone and is out of scope, not "exempt". (Lane 57
 *      fix round 1 dropped the earlier "inline `-e` literal that doesn't mention `process.env`" escape
 *      hatch (F5): it proved only one spelling among many ways a literal can still reach a module, a
 *      grandchild, or its own environment, for very little in return.)
 *  (b) ANY line, under any function name, that hands a child an explicitly inheriting `env` value -
 *      `undefined`, `null`, `process.env`, or a bare `...process.env` spread (F4). This half is NOT
 *      limited to the function names in (a): a wrapper like `runChild(...)` inherits the same way,
 *      and this is how it's still caught.
 */
function findEnvLessSpawns(text) {
  const found = [];
  const nodeDirect = new Set(['process.execPath', "'node'", '"node"']);
  const constRe = /\b(?:const|let|var)\s+(\w+)\s*=\s*process\.execPath\b/g;
  let cm;
  while ((cm = constRe.exec(text))) nodeDirect.add(cm[1]);
  const nodeTokenRes = [...nodeDirect].map((t) => {
    const bare = t.replace(/^['"]|['"]$/g, '');
    const esc = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\w$.])${esc}(?![\\w$])`);
  });

  const fnRe = /\b(spawn|spawnSync|execFile|execFileSync|fork)\s*\(/g;
  let m;
  while ((m = fnRe.exec(text))) {
    // A function name written as literal DATA inside a string ('spawn(' in a forbidden-terms list,
    // measured on hooks/delegation-reminder.test.mjs) sits with a quote touching it directly - no
    // real call is ever written that way. Skipping it here is cheap and local (one character), unlike
    // tracking string state across the whole raw-text scan, which fnRe deliberately does not do.
    if (/['"]/.test(text[m.index - 1] ?? '')) continue;

    const openParenIdx = m.index + m[0].length - 1;
    const call = extractBalanced(text, openParenIdx, '(', ')');
    const line = text.slice(0, m.index).split('\n').length;

    // (a) node-reachable, per F3/F6: `fork` always runs node; anything else needs a node token
    // literally somewhere in its own call text (this deliberately scans the RAW call, not
    // `codeOnly(call)` - a node token can legitimately sit inside a quoted `sh -c` script or a bare
    // `'node'` string argument, and over-including a comment's mention of "node" only means more
    // scrutiny, never less).
    const reachesNode = m[1] === 'fork' || nodeTokenRes.some((re) => re.test(call));
    if (!reachesNode) continue;

    // hasEnv here means "this call's OWN env key, if any, is not an unconditional non-override" -
    // `undefined`/`null` are scoped to THIS call only (an unrelated function's own same-named "env"
    // parameter, e.g. a wiring-check test's `env: null` fixture, is not a child-process spawn and
    // must not be read as one). `process.env`/a bare spread are deliberately left for (b) below,
    // which is not restricted to these five function names - so they are not double-counted here.
    const code = codeOnly(call);
    const hasEnvKey = /[{,]\s*env\s*[:,}]/.test(code) || /\.\.\.\s*process\s*\.\s*env\b/.test(code);
    const inheritsBare = /[{,]\s*env\s*:\s*(?:undefined|null)\s*[,}]/.test(code);
    let hasEnv = hasEnvKey && !inheritsBare;
    if (!hasEnv && !inheritsBare) {
      const lastArgMatch = call.match(/,\s*(\w+)\s*\)$/);
      if (lastArgMatch) {
        const resolved = resolveIdentHasEnvKey(text, lastArgMatch[1]);
        if (resolved === true) hasEnv = true;
      }
    }
    if (hasEnv) continue;

    const inner = call.slice(1, -1);
    const firstArgMatch = inner.match(/^\s*([^,]+?)\s*,/);
    const firstArg = firstArgMatch ? firstArgMatch[1].trim() : inner.trim();
    found.push({ line, fn: m[1], target: firstArg });
  }

  // (b): an explicit `process.env` handoff - the exact value, or a bare spread of it - under ANY
  // function name (F4): a wrapper like `runChild(...)` inherits the same way, and this half is what
  // still catches it. `undefined`/`null` are deliberately NOT checked here (see (a) above) - read
  // universally, "env: null" is common as an unrelated parameter to something that has nothing to do
  // with spawning a child (measured: scripts/wiring-check.test.mjs's own `env: null` fixture), where
  // "env: process.env" naming the real environment by name is specific enough not to false-positive
  // that way. Checked one LINE at a time, not over the whole file: `codeOnly` tracks string/comment
  // state as it scans, and a regex literal ELSEWHERE in the file holding a stray quote character
  // (measured: hooks/codex-unsupported.test.mjs's own quote character class) can desync that state
  // for everything after it in a whole-file pass. Resetting fresh at every line bounds a desync to
  // that one line.
  const inheritRe = /\benv\s*:\s*process\s*\.\s*env\b|\.\.\.\s*process\s*\.\s*env\b/;
  const textLines = text.split('\n');
  for (let li = 0; li < textLines.length; li++) {
    if (inheritRe.test(codeOnly(textLines[li]))) found.push({ line: li + 1, fn: 'inherits', target: 'process.env' });
  }

  return found.sort((a, b) => a.line - b.line);
}

// Real sites that inherit the runner's env, in test files OUTSIDE this lane's territory (scripts/
// run-tests.test.mjs, scripts/test-home.test.mjs). Per the hard rule that an existing test file's
// spawn options need the lead first, these are named here rather than fixed. Keyed by FILE, with an
// EXACT COUNT, not `file:line` (F2, W1 normalizes the key to `/`): a line moving anywhere in one of
// these files - and all of them see routine, unrelated edits - must never flip this red or green on
// its own. A NEW no-env site in an exempted file (the count goes up) still fails red, listing every
// site in that file. A site that gets fixed (the count goes down) fails red too, until the count here
// is lowered - either way a human looks at the file again, not "it happened to land on a clean line".
const N2_SPAWN_ENV_EXEMPTIONS = new Map([
  ['hooks/codex-unsupported.test.mjs', { count: 1, reason: 'functional installer smoke test, real INSTALLER child, out of lane-57 territory' }],
  ['scripts/bugfix-fields.test.mjs', { count: 2, reason: 'runCli() helper and the direct usage-message check, real bugfix-fields.mjs CLI, out of lane-57 territory' }],
  ['scripts/prefix-test.test.mjs', { count: 1, reason: 'runPrefixTest() helper spawning the real CLI, out of lane-57 territory' }],
  ['scripts/work-record.test.mjs', { count: 1, reason: 'real build-census.mjs CLI invocation, out of lane-57 territory' }],
  ['skills/decisions/scripts/decisions-read.test.mjs', { count: 3, reason: 'symlinked-script exit-code check, the direct SCRIPT_PATH spawn and the blind-input variant, out of lane-57 territory' }],
  ['skills/decisions/scripts/goals-mirror.test.mjs', { count: 1, reason: 'real CLI render-match check, out of lane-57 territory' }],
  // F3 follow-up (lead ruling r1): an execFileSync call on sh, "-c", ..., process.execPath, ..., {}
  // with no env - a real node-direct spawn reachable only through the shell's argv, out of lane-57
  // territory.
  ['scripts/collect-from-origin.test.mjs', { count: 1, reason: 'F3 follow-up: sh -c running process.execPath on the real CLI with no env, out of lane-57 territory' }],
  // F4/F5 follow-up (lead ruling r1): two sites, same file - the win32-only scenario's runChild call
  // with env set to process.env (the live full-environment handoff F4 was written for), plus a spawn
  // call written INSIDE that scenario's own eval'd source string, which F5's removed "inert literal"
  // escape hatch used to hide (build.md's build-round citation of ":17" as inert is wrong: that line
  // is not a real call at this file's own scope, but the scanner reads string contents the same as
  // code and it is a genuine second node-direct site with no env of its own).
  ['scripts/native-continuation-smoke.test.mjs', { count: 2, reason: 'F4/F5 follow-up: a runChild call with env set to process.env, and the nested spawn literal in its eval source, win32-only, out of lane-57 territory' }],
  // F5 follow-up (lead ruling r1): the removed "inert -e literal" escape hatch used to hide these.
  ['scripts/janitor.test.mjs', { count: 1, reason: 'F5 follow-up: a trivial spawn on process.execPath with -e setInterval, as a cwd/stdio-only holder process, out of lane-57 territory' }],
  ['skills/team-build/scripts/review-run.test.mjs', { count: 2, reason: 'F5 follow-up: spawnSleeper()\'s own spawn call (opts is a function parameter, never resolved) and a trivial dead-pid probe, out of lane-57 territory' }],
]);

/** Per-file exemption check (F2): `rel` is normalized to `/` first (W1) - a Windows scan reports `\`
 * and every key above is written with `/`. Returns this one file's offender messages: none if it's
 * unlisted and clean, or listed with its hit count matching exactly; otherwise every hit in the file,
 * plus a mismatch note if it WAS listed at a different count (a new site, or a fixed one whose count
 * needs lowering). Records the normalized key into `seenExempt` when the file is listed, so the
 * caller can catch a stale entry (an exempted file with no matching hit left at all) after the scan. */
function exemptionOffenders(rel, hits, exemptions, seenExempt) {
  const key = toPosix(rel);
  const allowed = exemptions.get(key);
  if (allowed) seenExempt?.add(key);
  if (allowed && hits.length === allowed.count) return [];
  const offenders = hits.map((hit) => `${key}:${hit.line} [${hit.fn}] passes no env key at all`);
  if (allowed) offenders.push(`${key}: exemption allows ${allowed.count}, found ${hits.length} - fix the new site or lower the count`);
  return offenders;
}

test('N2: no test file in this suite inherits the runner environment on its own', () => {
  // The rule, enforced rather than remembered: every child environment is built by `childEnv`, so no
  // test file spreads the runner's real environment, or forgets an `env` key on a spawn that reaches
  // node. A new site that forgets the seal fails HERE, at the class, instead of quietly writing this
  // session's token into a fixture the way the 2026-09-17 one did. (`test-child-env.mjs` is the one
  // place the real inheritance lives on purpose, and it is not a .test.mjs.)
  const files = walkTestFiles(REPO);
  assert.ok(files.length > 0, 'N2 scanned no test files at all - the walk itself is broken');
  const envLessOffenders = [];
  const seenExempt = new Set();
  for (const full of files) {
    const text = fs.readFileSync(full, 'utf8');
    const rel = toPosix(path.relative(REPO, full));
    envLessOffenders.push(...exemptionOffenders(rel, findEnvLessSpawns(text), N2_SPAWN_ENV_EXEMPTIONS, seenExempt));
  }
  for (const f of N2_SPAWN_ENV_EXEMPTIONS.keys()) {
    if (!seenExempt.has(f)) envLessOffenders.push(`${f}: exempted file no longer has a matching hit - drop or fix its entry`);
  }
  assert.deepEqual(
    envLessOffenders,
    [],
    `these sites inherit the runner's whole environment: ${envLessOffenders.join(', ')}`,
  );
  assert.deepEqual(Object.keys(SEALED).sort(), ['CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN']);
  assert.equal(childEnv('/fixture').CLAUDE_CODE_MESSAGING_TOKEN, '', 'and the helper really does blank them');
  assert.equal(childEnv('/fixture').HOME, '/fixture');
});

test('N2 scanner: findEnvLessSpawns flags a node-direct spawn with no env key, not one that has one', () => {
  // Built, never written: this file is itself scanned by the real N2 check above, so writing the
  // bare call text directly (function name immediately followed by an opening paren) right here
  // would make this unit test its own offender.
  const SPAWN = ['sp', 'awn'].join('');
  const noEnv = [
    "const NODE = process.execPath;",
    `${SPAWN}(NODE, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });`,
  ].join('\n');
  const withEnv = [
    "const NODE = process.execPath;",
    `${SPAWN}(NODE, ['--input-type=module', '-e', script], { env: childEnv(home), stdio: ['ignore', 'pipe', 'pipe'] });`,
  ].join('\n');
  const flaggedNoEnv = findEnvLessSpawns(noEnv);
  const flaggedWithEnv = findEnvLessSpawns(withEnv);
  assert.equal(flaggedNoEnv.length, 1, 'a node-direct spawn with no env key at all must be flagged');
  assert.equal(flaggedNoEnv[0].fn, 'spawn');
  assert.deepEqual(flaggedWithEnv, [], 'the same call with an env key must not be flagged');

  // The non-node-direct narrowing still holds: a fixed external binary with no node anywhere in its
  // own argv cannot reach the session through inheritance alone.
  const gitSpawn = "execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });";
  assert.deepEqual(findEnvLessSpawns(gitSpawn), [], 'a fixed external binary cannot reach the session through inheritance alone');
});

test('N2 scanner: a comment inside a call does not corrupt where it ends, or hide a real env key (F1)', () => {
  const SPAWN = ['sp', 'awn'].join('');
  // An apostrophe in a `//` comment used to be read as opening a string, stretching the "call" all
  // the way into this later, unrelated, genuinely-sealed call - hiding the first call's real gap.
  const apostropheInComment = [
    "const NODE = process.execPath;",
    `${SPAWN}(NODE, ['-e', script], { // don't let this apostrophe leak past the call`,
    "  stdio: 'ignore' });",
    `${SPAWN}Sync(NODE, ['-e', 'later'], { env: {} });`,
  ].join('\n');
  const hits = findEnvLessSpawns(apostropheInComment);
  assert.equal(hits.length, 1, 'only the first, genuinely env-less call should be flagged');
  assert.equal(hits[0].fn, 'spawn');

  // A comment that literally SAYS "env:" inside the call must not be read as a real object key.
  const envWordInComment = [
    "const NODE = process.execPath;",
    `${SPAWN}(NODE, ['-e', script], { // env: added later, not really`,
    "  stdio: 'ignore' });",
  ].join('\n');
  assert.equal(findEnvLessSpawns(envWordInComment).length, 1, 'a comment mentioning env: must still be flagged as env-less');
});

test('N2 scanner: fork and a bare node string are node-direct too, and sh -c running process.execPath is in scope (F3, F6)', () => {
  // Built, never written: same self-scan reason as the SPAWN trick above.
  const FORK = ['fo', 'rk'].join('');
  const EXEC_FILE_SYNC = ['execFile', 'Sync'].join('');
  const SP = ['sp', 'awn'].join('');

  const forkNoEnv = `${FORK}('./child.mjs', ['--flag'], { stdio: 'ignore' });`;
  assert.equal(findEnvLessSpawns(forkNoEnv).length, 1, 'fork always runs node, and must be flagged with no env key');

  const bareNodeNoEnv = `${SP}('node', ['script.js'], { stdio: 'ignore' });`;
  assert.equal(findEnvLessSpawns(bareNodeNoEnv).length, 1, "a bare 'node' string argument is node-direct too");

  const shellRunningNode = `${EXEC_FILE_SYNC}("sh", ["-c", '"$0" --repo x', process.execPath, "script.mjs"], { encoding: "utf8" });`;
  assert.equal(findEnvLessSpawns(shellRunningNode).length, 1, 'a shell child running process.execPath in its own argv is in scope');

  const shellRunningGit = `${EXEC_FILE_SYNC}("sh", ["-c", "git status"], { encoding: "utf8" });`;
  assert.deepEqual(findEnvLessSpawns(shellRunningGit), [], 'a shell child with no node anywhere in its argv stays out of scope');
});

test('N2 scanner: an inheriting env value counts as no env, under any function name (F4)', () => {
  const SPAWN = ['sp', 'awn'].join('');
  const undef = `${SPAWN}(process.execPath, ['-e', '0'], { env: undefined, stdio: 'ignore' });`;
  const nul = `${SPAWN}(process.execPath, ['-e', '0'], { env: null, stdio: 'ignore' });`;
  const fullEnv = `${SPAWN}(process.execPath, ['-e', '0'], { env: process.env, stdio: 'ignore' });`;
  const spread = `${SPAWN}(process.execPath, ['-e', '0'], { ...process.env, stdio: 'ignore' });`;
  for (const [name, src] of [['undefined', undef], ['null', nul], ['process.env', fullEnv], ['spread', spread]]) {
    assert.equal(findEnvLessSpawns(src).length, 1, `env: ${name} must count as inheriting the whole environment`);
  }

  // And it's not limited to the fnRe function names: a wrapper like runChild(...) inherits the same
  // way, and native-continuation-smoke.test.mjs:20 is exactly this shape.
  const wrapperCall = "runChild(process.execPath, ['-e', source], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }, 300);";
  assert.equal(findEnvLessSpawns(wrapperCall).length, 1, 'an inheriting env value under an unlisted function name must still be flagged');
});

test('N2 scanner: ambiguous one-hop resolution does not vouch for an env key (F7)', () => {
  const SPAWN = ['sp', 'awn'].join('');
  const twoDeclarations = [
    "const NODE = process.execPath;",
    "function helperA() {",
    "  const opts = { env: {} };",
    "  return opts;",
    "}",
    "function helperB() {",
    "  const opts = { stdio: 'ignore' };",
    `  return ${SPAWN}(NODE, ['-e', script], opts);`,
    "}",
  ].join('\n');
  assert.equal(findEnvLessSpawns(twoDeclarations).length, 1, 'two same-named declarations must not resolve to whichever one has env');
});

test('N2 scanner: exemption keys normalize backslash paths, and stay keyed by file (W1, F2)', () => {
  const exemptions = new Map([['scripts/fixture.test.mjs', { count: 1, reason: 'fixture' }]]);

  // W1: a backslash-separated relative path (as a Windows scan would report) must still match a key
  // written with `/`.
  const seenWin = new Set();
  assert.deepEqual(
    exemptionOffenders('scripts\\fixture.test.mjs', [{ line: 66, fn: 'spawn' }], exemptions, seenWin),
    [],
    'a backslash path must match the forward-slash exemption key',
  );
  assert.ok(seenWin.has('scripts/fixture.test.mjs'));

  // F2 direction 1: moving the flagged line alone (an unrelated edit above it) must never turn this
  // red - the count still matches.
  const beforeShift = exemptionOffenders('scripts/fixture.test.mjs', [{ line: 5, fn: 'spawn' }], exemptions, new Set());
  const afterShift = exemptionOffenders('scripts/fixture.test.mjs', [{ line: 50, fn: 'spawn' }], exemptions, new Set());
  assert.deepEqual(beforeShift, []);
  assert.deepEqual(afterShift, [], 'a line shift with the same hit count must stay green');

  // F2 direction 2: a NEW site in an already-exempted file must still be flagged, with the mismatch
  // reported too.
  const withNewSite = exemptionOffenders(
    'scripts/fixture.test.mjs',
    [{ line: 5, fn: 'spawn' }, { line: 40, fn: 'execFileSync' }],
    exemptions,
    new Set(),
  );
  assert.ok(withNewSite.some((o) => o.includes('scripts/fixture.test.mjs:40')), 'the new site must be reported');
  assert.ok(withNewSite.some((o) => o.includes('exemption allows 1, found 2')), 'the count mismatch must be reported too');

  // And a site that gets fixed (fewer hits than the recorded count) must also go red until the count
  // is lowered - the ratchet works both ways.
  const withFixedSite = exemptionOffenders('scripts/fixture.test.mjs', [], exemptions, new Set());
  assert.ok(withFixedSite.some((o) => o.includes('exemption allows 1, found 0')), 'a lowered hit count must still be reported until the entry catches up');
});

// Lane 47, P3/FU4: childEnv strips the four repo-locating git names too, even when the parent
// process (this test runner) has one set. Must fail on base d6f5c9d (red) before the fix.
test('childEnv strips the four repo-locating git names, even when the parent process has them set', () => {
  const names = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE'];
  const saved = {};
  for (const name of names) {
    saved[name] = { had: Object.prototype.hasOwnProperty.call(process.env, name), value: process.env[name] };
    process.env[name] = '/somewhere/.git';
  }
  try {
    const env = childEnv('/fixture');
    for (const name of names) assert.equal(env[name], undefined, `${name} leaked into childEnv's output`);
  } finally {
    for (const name of names) {
      if (saved[name].had) process.env[name] = saved[name].value;
      else delete process.env[name];
    }
  }
});
