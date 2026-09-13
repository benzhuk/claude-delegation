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

const REPO = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const HOOK = path.join(REPO, 'hooks', 'multi-inbox.js');
const HOOKS_JSON = path.join(REPO, 'hooks', 'hooks.json');

function tmp() { return toPosix(fs.mkdtempSync(path.join(os.tmpdir(), 'multi-hook-'))); }

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
    input: JSON.stringify({ hook_event_name: event, cwd: home, ...input }),
    encoding: 'utf8',
    env: {
      ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: REPO,
      NOTE_SLUG: 'taxonomy', ORCA_TERMINAL_HANDLE: '', ...extraEnv,
    },
  });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

test('V3: hooks.json parses, and every command goes through ${CLAUDE_PLUGIN_ROOT}', () => {
  const cfg = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  assert.deepEqual(Object.keys(cfg.hooks).sort(), ['PostToolUse', 'Stop', 'UserPromptSubmit']);
  const commands = Object.values(cfg.hooks).flat().flatMap((g) => g.hooks).map((h) => h.command);
  assert.ok(commands.length >= 4);
  for (const c of commands) {
    assert.match(c, /\$\{CLAUDE_PLUGIN_ROOT\}/, `${c} must be plugin-root relative`);
    assert.equal(c.includes('\\\\'), false);
  }
  assert.ok(commands.some((c) => c.includes('delegation-reminder.js')), 'the existing routing hook survives');
  assert.equal(commands.filter((c) => c.includes('multi-inbox.js')).length, 3);
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
    env: {
      ...process.env, HOME: home, USERPROFILE: home,
      CLAUDE_PLUGIN_ROOT: path.join(home, 'nowhere'), NOTE_SLUG: 'taxonomy',
    },
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
    env: {
      ...process.env, HOME: home, USERPROFILE: home,
      CLAUDE_PLUGIN_ROOT: path.join(home, 'nowhere'), NOTE_SLUG: 'taxonomy',
    },
  });
  assert.equal(stdout.trim(), '');
});

test('M3: a missing packet is surfaced in the injected context, not just on stderr', () => {
  const home = tmp();
  mirror(home, [`astra → taxonomy, ${STAMP} ${CLOCK} NYC [astra-gone-1] ASK: See the packet. Details: docs/notes/astra-gone-1.md`]);
  const out = runHook('UserPromptSubmit', home);
  assert.match(out.hookSpecificOutput.additionalContext, /packet MISSING: docs\/notes\/astra-gone-1\.md/);
  assert.match(out.hookSpecificOutput.additionalContext, /! \[astra-gone-1\] points at/);
});

test('L3: a Stop reason stays small — six notes, each truncated', () => {
  const home = tmp();
  const long = 'x'.repeat(400);
  mirror(home, Array.from({ length: 12 }, (_, i) => note(`astra-bulk${i}-1`, 'FYI', long)));
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
    env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: 'taxonomy' },
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
    env: {
      ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: REPO,
      NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: 'term_abc',
      ORCA_CLI: `${process.execPath} -e setInterval(()=>{},1000)`,
      ORCA_TIMEOUT_MS: '600000',
    },
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
    env: {
      ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: REPO,
      NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: 'term_abc',
      ORCA_CLI: `${process.execPath} -e setInterval(()=>{},1000)`,
    },
  });
  // No cached slug, so there is nothing to do — and it must reach that conclusion without an orca call.
  assert.ok(Date.now() - started < 2000);
  assert.equal(stdout.trim(), '');
});
