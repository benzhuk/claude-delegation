// node --test "skills/multi/scripts/*.test.mjs"
// note-inbox — the ledger read as an inbox (spec V2). Fixture ledgers on disk, no orca, no git.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { NoteError } from './envelope.mjs';
import { toPosix, cursorPath, readCursor, recentLedgerFiles } from './transport.mjs';
import {
  runNoteInbox, parseInboxArgs, scanLedgerFiles, dedupeById, addressedToMe, formatInbox,
} from './note-inbox.mjs';

const SCRIPT = fileURLToPath(new URL('./note-inbox.mjs', import.meta.url));

function tmp() { return toPosix(fs.mkdtempSync(path.join(os.tmpdir(), 'note-inbox-'))); }

/** 9.13.26 14:00 NYC, the pilot's own clock. */
const NOW = Date.UTC(2026, 8, 13, 18, 0);
const TODAY = '2026-09-13';

const line = (from, to, id, kind, body, extra = '') =>
  `${from} → ${to}, 9.13.26 13:45 NYC [${id}] ${kind}: ${body}.${extra}`;

/** Write a ledger file under <home>/.agents/notes, the mirror every sender appends to. */
function mirror(home, ymd, lines) {
  const file = path.join(home, '.agents/notes', `${ymd}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# Peer-note ledger ${ymd}\n\n${lines.join('\n')}\n`, 'utf8');
  return toPosix(file);
}

/** Write a repo ledger file, the other half of what a reader scans. */
function repoLedger(repo, ymd, lines) {
  const file = path.join(repo, 'docs/ledger', `${ymd}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# Peer-note ledger ${ymd}\n\n${lines.join('\n')}\n`, 'utf8');
  return toPosix(file);
}

const deps = (home, over = {}) => ({
  home, now: NOW, env: { NOTE_SLUG: 'taxonomy' }, git: () => '.git', cwd: home, ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
// Parsing and filtering
// ─────────────────────────────────────────────────────────────────────────────

test('V2: only lines addressed to me count — never my own sends', () => {
  const entries = scanLedgerFiles([{ file: 'x', ymd: TODAY }], {
    readFileSync: () => [
      line('astra', 'taxonomy', 'astra-pr137-1', 'ASK', 'Review PR 137'),
      line('taxonomy', 'astra', 'taxonomy-pr137-2', 'ACK', 'Taking it'),
      line('astra', 'nucleus', 'astra-other-1', 'FYI', 'Not for me'),
    ].join('\n'),
  });
  assert.equal(entries.length, 3);
  const mine = entries.filter((e) => addressedToMe(e, 'taxonomy'));
  assert.deepEqual(mine.map((e) => e.id), ['astra-pr137-1']);
});

test('a line that does not parse is kept, not dropped — an unreadable ledger line is the news', () => {
  const entries = scanLedgerFiles([{ file: 'x', ymd: TODAY }], {
    readFileSync: () => 'astra → taxonomy, this line is broken\n# a header\n\n',
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].unparsed, true);
  assert.equal(addressedToMe(entries[0], 'taxonomy'), false, 'an unparsed line is never claimed as mine');
});

test('the same id in the mirror and the repo ledger is reported once', () => {
  const same = line('astra', 'taxonomy', 'astra-dup-1', 'FYI', 'Only once');
  const entries = dedupeById(scanLedgerFiles(
    [{ file: 'a', ymd: TODAY }, { file: 'b', ymd: TODAY }],
    { readFileSync: () => same },
  ));
  assert.equal(entries.length, 1);
});

test('unknown flags and missing values are exit 1', () => {
  assert.throws(() => parseInboxArgs(['--nope']), (e) => e instanceof NoteError && e.exitCode === 1);
  assert.throws(() => parseInboxArgs(['--me']), (e) => e instanceof NoteError && e.exitCode === 1);
  assert.throws(() => parseInboxArgs(['taxonomy']), (e) => e instanceof NoteError && e.exitCode === 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// End to end against fixture ledgers
// ─────────────────────────────────────────────────────────────────────────────

test('V2: new notes for my slug, from both the mirror and the repo ledger', async () => {
  const home = tmp();
  mirror(home, TODAY, [line('astra', 'taxonomy', 'astra-pr137-1', 'ASK', 'Review PR 137', ' Needs: review by 15:00')]);
  repoLedger(home, TODAY, [line('n-astra', 'taxonomy', 'n-astra-c8-1', 'RESULT', 'Contract C8 landed')]);

  const res = await runNoteInbox(['--me', 'taxonomy'], deps(home));
  assert.equal(res.exitCode, 0);
  assert.equal(res.slug, 'taxonomy');
  assert.equal(res.count, 2);
  assert.deepEqual(res.notes.map((n) => n.id).sort(), ['astra-pr137-1', 'n-astra-c8-1']);
  assert.match(formatInbox(res), /2 new peer notes for taxonomy/);
});

test('V2: --ack advances the cursor so the same note is never shown twice', async () => {
  const home = tmp();
  mirror(home, TODAY, [line('astra', 'taxonomy', 'astra-pr137-1', 'ASK', 'Review PR 137')]);

  const first = await runNoteInbox(['--me', 'taxonomy', '--ack'], deps(home));
  assert.equal(first.count, 1);
  assert.ok(fs.existsSync(cursorPath(home, 'taxonomy')));
  assert.ok(readCursor(home, 'taxonomy').seen['astra-pr137-1']);

  const second = await runNoteInbox(['--me', 'taxonomy'], deps(home));
  assert.equal(second.count, 0);
  assert.equal(formatInbox(second), 'no new notes for taxonomy');
});

test('V2: without --ack the note stays new — a read that is not acked changes nothing', async () => {
  const home = tmp();
  mirror(home, TODAY, [line('astra', 'taxonomy', 'astra-pr137-1', 'ASK', 'Review PR 137')]);
  await runNoteInbox(['--me', 'taxonomy'], deps(home));
  const again = await runNoteInbox(['--me', 'taxonomy'], deps(home));
  assert.equal(again.count, 1);
});

test('V2: the packet a Details path names is reported present or MISSING', async () => {
  const home = tmp();
  mirror(home, TODAY, [
    line('astra', 'taxonomy', 'astra-here-1', 'ASK', 'See the packet', ' Details: docs/notes/astra-here-1.md'),
    line('astra', 'taxonomy', 'astra-gone-1', 'ASK', 'See the packet', ' Details: docs/notes/astra-gone-1.md'),
  ]);
  const packet = path.join(home, 'docs/notes/astra-here-1.md');
  fs.mkdirSync(path.dirname(packet), { recursive: true });
  fs.writeFileSync(packet, '# packet\n');

  const res = await runNoteInbox(['--me', 'taxonomy'], deps(home));
  const byId = Object.fromEntries(res.notes.map((n) => [n.id, n]));
  assert.equal(byId['astra-here-1'].packetExists, true);
  assert.equal(byId['astra-gone-1'].packetExists, false);
  assert.equal(res.problems.length, 1);
  assert.match(formatInbox(res), /packet MISSING: docs\/notes\/astra-gone-1\.md/);
});

test('V2: `--me ben` reads the reserved recipient', async () => {
  const home = tmp();
  mirror(home, TODAY, [
    line('astra', 'ben', 'astra-blocked-1', 'BLOCKED', 'Cannot reach the pane'),
    line('astra', 'taxonomy', 'astra-other-1', 'FYI', 'Not Bens'),
  ]);
  const res = await runNoteInbox(['--me', 'ben'], deps(home, { env: {} }));
  assert.deepEqual(res.notes.map((n) => n.id), ['astra-blocked-1']);
});

test('the cold start shows recent notes and marks older ones seen, saying so', async () => {
  const home = tmp();
  mirror(home, TODAY, [
    'astra → taxonomy, 9.13.26 01:00 NYC [astra-old-1] FYI: Thirteen hours ago.',
    'astra → taxonomy, 9.13.26 13:45 NYC [astra-fresh-1] FYI: Fifteen minutes ago.',
  ]);
  const res = await runNoteInbox(['--me', 'taxonomy'], deps(home));
  assert.deepEqual(res.notes.map((n) => n.id), ['astra-fresh-1']);
  assert.equal(res.suppressed, 1);
  assert.equal(res.coldStart, true);
  assert.match(formatInbox(res), /cursor initialised for taxonomy: 1 note\(s\) older than the cold-start window/);
  // and the suppression persists without --ack, so the banner does not repeat forever
  const again = await runNoteInbox(['--me', 'taxonomy'], deps(home));
  assert.equal(again.suppressed, 0);
  assert.equal(again.count, 1, 'the fresh note is still new until it is acked');
});

test('--cold-start-hours 0 shows everything in the window', async () => {
  const home = tmp();
  mirror(home, TODAY, ['astra → taxonomy, 9.13.26 01:00 NYC [astra-old-1] FYI: Thirteen hours ago.']);
  const res = await runNoteInbox(['--me', 'taxonomy', '--cold-start-hours', '0'], deps(home));
  assert.equal(res.count, 1);
});

test('--days bounds the scan to recent ledger files', async () => {
  const home = tmp();
  mirror(home, '2026-09-09', ['astra → taxonomy, 9.9.26 10:00 NYC [astra-ancient-1] FYI: Days ago.']);
  mirror(home, TODAY, [line('astra', 'taxonomy', 'astra-today-1', 'FYI', 'Today')]);
  const res = await runNoteInbox(['--me', 'taxonomy', '--cold-start-hours', '0'], deps(home));
  assert.deepEqual(res.notes.map((n) => n.id), ['astra-today-1']);
  assert.equal(res.scanned.length, 1, 'only the files inside --days are opened');

  const wide = await runNoteInbox(['--me', 'taxonomy', '--days', '10', '--cold-start-hours', '0'], deps(home));
  assert.equal(wide.count, 2);
});

test('recentLedgerFiles dates by filename, oldest first', () => {
  const home = tmp();
  mirror(home, '2026-09-11', ['x']);
  mirror(home, '2026-09-13', ['y']);
  fs.writeFileSync(path.join(home, '.agents/notes', 'not-a-ledger.md'), 'ignored');
  const files = recentLedgerFiles(path.join(home, '.agents/notes'), 3, TODAY);
  assert.deepEqual(files.map((f) => f.ymd), ['2026-09-11', '2026-09-13']);
});

test('a corrupt cursor is a fresh cursor, never a crash', async () => {
  const home = tmp();
  mirror(home, TODAY, [line('astra', 'taxonomy', 'astra-pr137-1', 'ASK', 'Review PR 137')]);
  fs.mkdirSync(path.dirname(cursorPath(home, 'taxonomy')), { recursive: true });
  fs.writeFileSync(cursorPath(home, 'taxonomy'), '{not json');
  const res = await runNoteInbox(['--me', 'taxonomy', '--cold-start-hours', '0'], deps(home));
  assert.equal(res.count, 1);
});

test('an empty inbox is exit 0 and says so', async () => {
  const home = tmp();
  const res = await runNoteInbox(['--me', 'taxonomy'], deps(home));
  assert.equal(res.count, 0);
  assert.equal(res.exitCode, 0);
  assert.equal(formatInbox(res), 'no new notes for taxonomy');
});

// ─────────────────────────────────────────────────────────────────────────────
// Slug resolution and the CLI
// ─────────────────────────────────────────────────────────────────────────────

test('V2: $NOTE_SLUG answers when --me does not, and neither needs orca', async () => {
  const home = tmp();
  mirror(home, TODAY, [line('astra', 'taxonomy', 'astra-pr137-1', 'ASK', 'Review PR 137')]);
  const res = await runNoteInbox([], deps(home));
  assert.equal(res.slug, 'taxonomy');
  assert.equal(res.slugSource, '$NOTE_SLUG');
});

test('V2: with no --me, no $NOTE_SLUG and no pane handle it FAILS LOUD, never guesses', async () => {
  const home = tmp();
  await assert.rejects(
    runNoteInbox([], deps(home, { env: {}, orca: async () => ({}) })),
    (err) => err instanceof NoteError && err.exitCode === 2 && /cannot tell which pane this is/.test(err.message),
  );
});

test('V2: the pane slug comes from $ORCA_TERMINAL_HANDLE via `terminal show`, then from cache', async () => {
  const home = tmp();
  mirror(home, TODAY, [line('astra', 'taxonomy', 'astra-pr137-1', 'ASK', 'Review PR 137')]);
  const calls = [];
  const orca = async (args) => {
    calls.push(args);
    return { terminal: { handle: 'term_abc', title: '◑ taxonomy', agentIdentity: 'claude' } };
  };
  const env = { ORCA_TERMINAL_HANDLE: 'term_abc' };
  const first = await runNoteInbox([], deps(home, { env, orca }));
  assert.equal(first.slug, 'taxonomy');
  assert.equal(first.slugSource, '$ORCA_TERMINAL_HANDLE');
  assert.equal(calls.length, 1);

  const second = await runNoteInbox([], deps(home, { env, orca }));
  assert.equal(second.slugSource, '$ORCA_TERMINAL_HANDLE (cached)');
  assert.equal(calls.length, 1, 'a per-prompt hook must not pay for an orca round-trip every time');
});

test('V2: a pane whose title is not a slug is told to rename, not guessed at', async () => {
  const home = tmp();
  const orca = async () => ({ terminal: { handle: 'term_abc', title: '◑ ', agentIdentity: 'claude' } });
  await assert.rejects(
    runNoteInbox([], deps(home, { env: { ORCA_TERMINAL_HANDLE: 'term_abc' }, orca })),
    (err) => err instanceof NoteError && /rename the pane to its slug/.test(err.message),
  );
});

test('V2: a shell pane never claims an inbox, even though its title reduces to a legal slug', async () => {
  const home = tmp();
  const orca = async () => ({ terminal: { handle: 'term_abc', title: 'MINGW64:/c/Users/benzh/Code' } });
  await assert.rejects(
    runNoteInbox([], deps(home, { env: { ORCA_TERMINAL_HANDLE: 'term_abc' }, orca })),
    (err) => err instanceof NoteError && /has no agent/.test(err.message),
  );
});

test('the CLI exits 0 and prints JSON against a fixture ledger, even when it cannot find a slug', () => {
  const home = tmp();
  mirror(home, TODAY, [line('astra', 'taxonomy', 'astra-pr137-1', 'ASK', 'Review PR 137')]);
  // --orca names a command that does not exist, so the slug fallbacks cannot reach a real runtime and
  // the test is the same on every machine.
  const run = (args) => execFileSync(
    process.execPath, [SCRIPT, '--home', home, '--orca', 'not-a-real-orca-binary-xyz', ...args],
    { encoding: 'utf8', env: { ...process.env, NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: '' } },
  );

  const out = JSON.parse(run(['--me', 'taxonomy', '--json', '--cold-start-hours', '0', '--no-repo']));
  assert.equal(out.ok, true);
  assert.equal(out.count, 1);
  assert.equal(out.notes[0].id, 'astra-pr137-1');

  // No slug anywhere: still exit 0 (execFileSync would throw otherwise) with the reason in the object.
  const blind = JSON.parse(run(['--json', '--no-repo']));
  assert.equal(blind.ok, false);
  assert.equal(blind.count, 0);
  assert.match(blind.error, /cannot tell which pane this is/);
});

test('V2: the focused-pane fallback is opt-in — without --active-terminal it is never consulted', async () => {
  const home = tmp();
  const calls = [];
  const orca = async (args) => {
    calls.push(args);
    return { terminal: { handle: 'term_focused', title: '◑ someone-else', agentIdentity: 'claude' } };
  };
  await assert.rejects(
    runNoteInbox([], deps(home, { env: {}, orca })),
    (err) => err instanceof NoteError && err.exitCode === 2,
  );
  assert.equal(calls.length, 0, 'no orca call at all when the fallback is off');

  const opted = await runNoteInbox(['--active-terminal'], deps(home, { env: {}, orca }));
  assert.equal(opted.slug, 'someone-else');
  assert.match(opted.slugSource, /active terminal/);
});

test('V2: ORCA_WORKTREE_ID names the pane\'s own repo when cwd is somewhere else', async () => {
  const home = tmp();
  const repo = tmp();
  repoLedger(repo, TODAY, [line('astra', 'taxonomy', 'astra-worktree-1', 'FYI', 'In the pane repo')]);
  const env = { NOTE_SLUG: 'taxonomy', ORCA_WORKTREE_ID: `abc-123::${repo}::workspace:def-456` };
  const res = await runNoteInbox(['--cold-start-hours', '0'], deps(home, { env, cwd: tmp() }));
  assert.deepEqual(res.notes.map((n) => n.id), ['astra-worktree-1']);
});
