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
// two ways - spreading the runner's environment on its own (the original check above), OR passing NO
// `env` key at all, which inherits the WHOLE real environment unmodified (worse: no text pattern for
// the check above to find). Lane 57 found exactly that shape at test-home.test.mjs's `spawnAndSignal`.
// These helpers make the second shape mechanical instead of remembered.

/** Balanced-delimiter slice of `text` starting at `openIdx` (which must be `openCh`), string-aware. */
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
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === openCh) depth++;
    else if (c === closeCh) { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return text.slice(openIdx);
}

/** One-hop resolution: does `const <ident> = { ... }` (found in `fileText`) have an `env` key? Null
 * if no such declaration is found (the identifier isn't a locally-declared object literal). */
function resolveIdentHasEnvKey(fileText, ident) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${ident}\\s*=\\s*\\{`);
  const m = re.exec(fileText);
  if (!m) return null;
  const braceIdx = fileText.indexOf('{', m.index);
  const obj = extractBalanced(fileText, braceIdx, '{', '}');
  return /\benv\b/.test(obj);
}

/**
 * Finds every `spawn`/`spawnSync`/`execFile`/`execFileSync`/`fork` call in `text` that passes no
 * `env` key, narrowed to calls that can actually reach the runner's session: a spawn of `node` itself
 * (`process.execPath`, or a local const bound to it - the common `NODE` pattern in this suite) runs
 * ARBITRARY script text with the whole inherited environment, so it alone could read and act on
 * `CLAUDE_CODE_MESSAGING_SOCKET`/`TOKEN` the way the 2026-09-17 hook child did. A spawn of a fixed
 * external binary (`git`, `sh`, `mkfifo`, `taskkill.exe`, ...) has no code path that parses or acts on
 * those two variable names, so it cannot reach the session through inheritance alone and is not
 * flagged - narrowing the rule to the mechanism that made the incident possible, not to "no env key"
 * read literally everywhere a spawn appears (which would also catch every fixture `git` call in the
 * suite). Two exemptions from THAT narrower rule, both mechanical, not "trusted because of what the
 * script happens to do today":
 *   - the options argument is a bare identifier resolving (one hop, in the same file) to an object
 *     literal that itself has an `env` key;
 *   - the script text is a literal written directly at the call site (an inline `-e`/`--eval` string,
 *     not a path to a separately-maintained file) that does not itself reference `process.env` - so
 *     if anyone ever edits that exact literal to add one, this scanner re-flags it at that moment;
 *     it is not "trust that this doesn't misuse it forever."
 */
function findEnvLessSpawns(text) {
  const found = [];
  const nodeDirect = new Set(['process.execPath']);
  const constRe = /\b(?:const|let|var)\s+(\w+)\s*=\s*process\.execPath\b/g;
  let cm;
  while ((cm = constRe.exec(text))) nodeDirect.add(cm[1]);

  const fnRe = /\b(spawn|spawnSync|execFile|execFileSync|fork)\s*\(/g;
  let m;
  while ((m = fnRe.exec(text))) {
    const openParenIdx = m.index + m[0].length - 1;
    const call = extractBalanced(text, openParenIdx, '(', ')');
    const line = text.slice(0, m.index).split('\n').length;
    const inner = call.slice(1, -1);
    const firstArgMatch = inner.match(/^\s*([^,]+?)\s*,/);
    const firstArg = firstArgMatch ? firstArgMatch[1].trim() : inner.trim();
    if (!nodeDirect.has(firstArg)) continue; // not a node-direct spawn: cannot reach the session

    let hasEnv = call.includes('env:') || /[{,]\s*env\s*[,}]/.test(call);
    if (!hasEnv) {
      const lastArgMatch = call.match(/,\s*(\w+)\s*\)$/);
      if (lastArgMatch && resolveIdentHasEnvKey(text, lastArgMatch[1]) === true) hasEnv = true;
    }
    if (hasEnv) continue;

    const evalFlag = ['-', 'e'].join('');
    const litMatch = call.match(new RegExp(`['"](?:${evalFlag}|--eval)['"]\\s*,\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`));
    if (litMatch) {
      const marker = ['process', '.', 'env'].join('');
      if (!litMatch[2].includes(marker)) continue; // inline literal, provably can't read the sealed vars
    }

    found.push({ line, fn: m[1], target: firstArg });
  }
  return found;
}

// Real spawns of `process.execPath` in test files OUTSIDE this lane's territory
// (scripts/run-tests.test.mjs, scripts/test-home.test.mjs) that inherit the runner's env with no
// override. Per the hard rule that an existing test file's spawn options need the lead first, these
// are named here rather than fixed - each is a real, minor completeness gap against the class this
// scanner enforces, but leaving them named means a NEW site anywhere else still fails red.
const N2_SPAWN_ENV_EXEMPTIONS = new Map([
  ['hooks/codex-unsupported.test.mjs:438', 'functional installer smoke test, real INSTALLER child, out of lane-57 territory'],
  ['scripts/bugfix-fields.test.mjs:21', 'runCli() helper for the bugfix-fields CLI, out of lane-57 territory'],
  ['scripts/bugfix-fields.test.mjs:113', 'same file, direct usage-message check, out of lane-57 territory'],
  ['scripts/prefix-test.test.mjs:91', 'runPrefixTest() helper spawning the real CLI, out of lane-57 territory'],
  ['scripts/work-record.test.mjs:1778', 'real build-census.mjs CLI invocation, out of lane-57 territory'],
  ['skills/decisions/scripts/decisions-read.test.mjs:440', 'symlinked-script exit-code check, out of lane-57 territory'],
  ['skills/decisions/scripts/decisions-read.test.mjs:720', 'same file, direct SCRIPT_PATH spawn, out of lane-57 territory'],
  ['skills/decisions/scripts/decisions-read.test.mjs:727', 'same file, blind-input variant, out of lane-57 territory'],
  ['skills/decisions/scripts/goals-mirror.test.mjs:30', 'real CLI render-match check, out of lane-57 territory'],
]);

test('N2: no test file in this suite inherits the runner environment on its own', () => {
  // The rule, enforced rather than remembered: every child environment is built by `childEnv`, so no
  // test file spreads `process.env` itself. A new spawn site that forgets the seal fails HERE, at the
  // class, instead of quietly writing this session's token into a fixture the way the 2026-09-17 one
  // did. (`test-child-env.mjs` is the one place that spread lives, and it is not a .test.mjs.)
  const files = walkTestFiles(REPO);
  assert.ok(files.length > 0, 'N2 scanned no test files at all - the walk itself is broken');
  const offenders = [];
  const envLessOffenders = [];
  for (const full of files) {
    const text = fs.readFileSync(full, 'utf8');
    const rel = path.relative(REPO, full);
    // Built, never written: a literal here would make this test its own first offender.
    const needle = ['...', 'process', '.', 'env'].join('');
    for (const [i, line] of text.split('\n').entries()) {
      if (line.includes(needle)) offenders.push(`${rel}:${i + 1}`);
    }
    for (const hit of findEnvLessSpawns(text)) {
      const key = `${rel}:${hit.line}`;
      if (N2_SPAWN_ENV_EXEMPTIONS.has(key)) continue;
      envLessOffenders.push(`${key} [${hit.fn}] passes no env key at all`);
    }
  }
  assert.deepEqual(offenders, [], `these spawn sites build their own env instead of using childEnv(): ${offenders.join(', ')}`);
  assert.deepEqual(
    envLessOffenders,
    [],
    `these node-direct spawn sites pass NO env key at all, inheriting the runner's whole environment: ${envLessOffenders.join(', ')}`,
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

  // And the non-node-direct + inline-literal-without-process.env-reference narrowings hold too.
  const gitSpawn = "execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });";
  assert.deepEqual(findEnvLessSpawns(gitSpawn), [], 'a fixed external binary cannot reach the session through inheritance alone');
  const trivialEval = "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });";
  assert.deepEqual(findEnvLessSpawns(trivialEval), [], 'an inline literal that never references process.env is provably safe');
  const evalMarker = ['process', '.', 'env'].join('');
  const dangerousEval = `spawn(process.execPath, ['-e', 'console.log(${evalMarker})'], { stdio: 'ignore' });`;
  assert.equal(findEnvLessSpawns(dangerousEval).length, 1, 'an inline literal that DOES reference the env must still be flagged');
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
