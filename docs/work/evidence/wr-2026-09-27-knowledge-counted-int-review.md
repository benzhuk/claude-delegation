VERDICT: APPROVE 2ea22bf8c71b8b2d0f4c144ca35ef189cd990764

# Seam and integration review: lane eighteen (knowledge counted)

Reviewed 2026-09-27 at 10:02 New York. Integration worktree `C:/Users/benzh/Code/knowledge-counted/wt-int`, branch `build/knowledge-counted-1`, head `c99970493287aed5480bf16deb9d275b9735bc57`. That head is `ee3cacd` plus one test-only commit, which the coordinator announced mid-review. The review was read-only: every probe ran in a scratch home under the session scratchpad, the real `~/.agents` and `~/.claude` were never touched, and the worktree was clean before and after (`git status --short` was empty).

No BLOCKER and no MAJOR findings. There are three MINOR items and some INFO. Two of the MINOR items belong to the lead: the doc statement and the GOALS numbers.

## 1. The tree is exactly base, the record commit and the two approved merges

- `git log c25cc70..HEAD` shows 989ae1f (record), then K1 b270c67..9ff2ee4 merged at 2235fd3, then K23 61f57d5..1004743 merged at ee3cacd, then c999704.
- **Both merges are clean re-merges, with no hand edits:**
  - `git merge-tree --write-tree 989ae1f 9ff2ee4` gives `3661451c…`, which equals `2235fd3^{tree}`.
  - `git merge-tree --write-tree 2235fd3 1004743` gives `9b6079b9…`, which equals `ee3cacd^{tree}`.
- **Nothing stray.**
  - `git diff 1004743 ee3cacd --stat` shows only K1's 3 files plus the 2 record-commit docs.
  - `git diff 9ff2ee4 2235fd3 --stat` shows only the 2 record-commit docs.
  - `git diff c25cc70..HEAD --stat` shows 15 files, all inside the K1 or K23 file lists or the record commit.
  - `scripts/mirror-shared-skills.mjs`, `hooks/codex-hooks.json`, README, `build-census.mjs` and `four-read.mjs` are all untouched.
- **c999704** is a one-line change at `hooks/knowledge-log.test.mjs:145`. It adds `{ skip: process.platform !== 'win32' && 'Windows path semantics only' }`, so on win32 the test still runs.
  - That is correct: off Windows a backslash is not a separator, so the case cannot hold there.
  - The code path under test is untouched.
  - `pack/reports/int-suite.log` (09:59, after c999704) shows `tests 2066 / pass 2066 / fail 0`, and this case ran there (line 336 shows ✔).

## 2. The joints between K1 and K23

**What counts as a topic read: they agree (verified).**
- **Writer and reader use the same log path.**
  - The writer is `hooks/knowledge-log.mjs:288-289`, writing `path.join(os.homedir(), '.agents', 'knowledge', 'read.log')`.
  - The reader is `scripts/knowledge-counts.mjs:32-34`, reading `join(home, '.agents', 'knowledge', 'read.log')`.
  - In production `home` is `homedir()`, because `goal-card.mjs` `knowledgeSessionLine` falls back to `homedir()` when neither `KNOWLEDGE_HOME` nor `AGENTS_HOME` is set. Neither is set in this session.
- **Writer and reader agree on the line format.**
  - K1 writes `${new Date().toISOString()} ${tool} ${path} ${session}`, newline-terminated and capped at 400 characters (`knowledge-log.mjs:215-219,263`).
  - K23 splits on `\n`, trims, takes the first space-separated token and runs `Date.parse` on it (`knowledge-counts.mjs:143-149`).
  - The timestamp always comes first and is never truncated by the 400 cap, so every line K1 writes parses.
  - Paths with spaces do not matter to K23, since it only reads token 0. In the probe the home was `…\seam\Ben Home\…`.
- **The inbox split agrees.**
  - `_inbox/**` goes to `inbox.log`, which K23 never reads for R. P comes from a directory scan of `_inbox/` that skips `_archive` and dotfiles (`knowledge-counts.mjs:95-96`).
  - In the probe, `_archive/2026-01-01-old.md` and `_inbox/.hidden` were present and P came out as exactly 1.
- **The kill switches are the same.**
  - K1 checks `~/.agents/no-knowledge-log` and `~/.agents/ws-off` (`knowledge-log.mjs:176-181`).
  - The goal-card line checks `no-knowledge-log` at `goal-card.mjs` `knowledgeSessionLine`, and `ws-off` upstream via `goalCardResult` → `switchedOff`.
  - Probe with `no-knowledge-log` present: the hook appended nothing, and SessionStart still showed the card but had no knowledge line.
  - Probe with `ws-off` present: the hook appended nothing and there was no knowledge line.

**hooks/hooks.json: verified.** The only change is one new `PostToolUse` entry, `matcher: "Read|Write|Edit"` → `node "${CLAUDE_PLUGIN_ROOT}/hooks/knowledge-log.mjs"`, with timeout 5.
- I removed that entry and compared the result with `c25cc70:hooks/hooks.json`. They are identical (`rest identical: true`), so every existing entry is unchanged.
- The file parses.
- The SessionStart chain (`multi-inbox`, `delegation-reminder`, `wiring-check`) is untouched, and the knowledge line reaches it through the existing `delegation-reminder.js` → `goalCardResult` path, with no new registration.

**Codex: the code is consistent, but the doc statement is missing (see m1).**
- The hook header states "unsupported on Codex" with upstream source evidence (`knowledge-log.mjs:67-94`).
- `hooks/codex-hooks.json` and `scripts/mirror-shared-skills.mjs` are unchanged, which matches that statement: nothing is registered on Codex.
- `.codex-plugin/plugin.json` points only at `codex-hooks.json`, so the new Claude `hooks.json` entry cannot leak into Codex.
- In the probe, a Codex-shaped payload (`tool_input.path` in place of `file_path`) logged nothing.
- The Codex SessionStart knowledge line (K23) comes through `runCodexHook`, and `goal-card.test.mjs` "end to end (Codex)" covers it (pass).

**Byte cap: within the cap, with little headroom (see m2).**
- `RENDER_MAX_BYTES` is 1200 (`goal-card.mjs:54`).
- I measured with this repo's real `docs/goals/card.md` (997 bytes):

| Case | Bytes | Knowledge line shown |
|---|---|---|
| Card only | 1055 | n/a |
| Card plus line with Windows-shaped counts (16 topics, 68 pending, 0 reads; line is 138 bytes) | 1194 | yes |
| Card plus line with 103 pending and 999 reads | 1197 | yes |
| Card plus line with 4-digit reads | 1055 | no, line dropped and the card kept |
| Subagent render (with `SUBAGENT_SUFFIX`) | 1144 | no, line always dropped |

- The card itself is never cut, which is what the spec asks for.

## 3. The attack brief, across the seam (scratch probe, actual output)

Setup: a scratch `HOME`/`USERPROFILE`/`AGENTS_HOME` at `…\scratchpad\seam\Ben Home`. The store holds `INDEX.md`, `topic-a.md`, `topic-b.md`, `_draft.md`, `_inbox/2026-09-20-note.md`, `_inbox/.hidden` and `_inbox/_archive/2026-01-01-old.md`, plus `Code/knowledge-base/x.md` outside the store. The hook was spawned per payload.

| Payload | Result (quoted) |
|---|---|
| Absolute path, backslashes, upper case, lower-case drive letter | read.log `2026-09-27T14:00:40.146Z Read c:\USERS\…\BEN HOME\.CLAUDE\KNOWLEDGE\TOPIC-A.md s1` |
| `~/.claude/knowledge/INDEX.md` | read.log `2026-09-27T14:00:40.186Z Read C:\Users\…\Ben Home\.claude\knowledge\INDEX.md s2` |
| Relative `topic-b.md` with `cwd` set to the store | read.log `… Read C:\…\knowledge\topic-b.md s3` |
| Read of an `_inbox` note | inbox.log `2026-09-27T14:00:40.263Z Read C:\…\knowledge\_inbox\2026-09-20-note.md s4`, and read.log unchanged |
| Write under `_inbox` | inbox.log `… Write C:\…\_inbox\new.md s5` |
| `~/Code/knowledge-base/x.md` | nothing |
| `~/.claude/knowledge2/x.md` (prefix sibling) | nothing |
| `…/knowledge/../settings.json` | nothing |
| Codex-shaped `tool_input.path` | nothing |
| No `file_path` | nothing |
| Garbage stdin | nothing |

Every case exited 0 with empty stdout.

- **Malformed read.log lines.** I appended these by hand: `garbage line`, a blank line, a whitespace-only line, `not-a-date Read x y`, `2026-13-45T99:99:99Z Read x y`, a CRLF junk line, and an unterminated `2026-09-27T00:00:00.000Z Read partial` followed by a newline.
  - All of them were skipped except the last, which has a valid timestamp and so counts as a read.
  - No throw.
- **Concurrent appends.** 40 hook processes spawned at once added exactly 40 lines, all well-formed, with 40 distinct session ids. There was no interleaving. Each process makes one `appendFileSync`, with no read-modify-write.
- **`knowledge-count.mjs --json` on the same home** returned `{"storeExists":true,"topics":2,"pending":1,"oldest":"2026-09-20","newest":"2026-09-20","reads":44,…}`.
  - Topics is 2 because `INDEX.md` and `_draft.md` are excluded.
  - Pending is 1 because `_archive` and the dotfile are excluded.
  - Reads is 44: 3 single reads, 40 concurrent reads and the one valid hand-appended line. Every malformed line was rejected.
- **The real SessionStart through `hooks/delegation-reminder.js SessionStart`.** I ran it in a scratch project that has `.agents/project.json` and a copy of this repo's card. The additional context ends with the card, then:
  `knowledge: 2 topics, 1 inbox notes pending (oldest 2026-09-20), 44 topic reads on this host in 7 days; INDEX ~/.claude/knowledge/INDEX.md` (137 bytes, under the 160 cap)
  These are the same numbers as the CLI, so the writer → module → rendered-line chain holds on the merged tree.

## 4. Child spawns use childEnv(): verified

| File | Spawn sites | Env |
|---|---|---|
| `hooks/knowledge-log.test.mjs` | `:256`, `:305` | `childEnv(home)` |
| `scripts/goal-card.test.mjs` | `:336`, `:344`, `:476`, `:660` | `childEnv(home, { AGENTS_HOME })` |
| `scripts/knowledge-count.test.mjs` | `:139`, `:148`, `:160` | `childEnv(home)` |

`knowledge-counts.test.mjs` spawns nothing. The N2 scanner `skills/multi/scripts/hooks.test.mjs` passes 26/26.

The targeted run was `node --test hooks/knowledge-log.test.mjs scripts/goal-card.test.mjs scripts/knowledge-count.test.mjs scripts/knowledge-counts.test.mjs`: 96 tests, 96 pass, 0 fail.

## Findings

### m1 MINOR (lead-owned, do before accept): "unsupported on Codex" is stated only in the hook comment, not in any doc
- Evidence:
  - The statement exists only at `hooks/knowledge-log.mjs:67-94`.
  - No doc in the tree mentions the knowledge-log hook's Codex status. `grep -rn "unsupported on Codex\|knowledge-log"` over md/json/js finds only `hooks/hooks.json:82` and code comments.
  - The plugin lists its hooks in `README.md:136-157` ("**Three hooks**"). The new hook is not there, and builders were forbidden to edit README.
  - `docs/census.md:363-376` describes the log but not its Codex gap.
- Why it matters: spec K1 item 3 requires the statement "in the doc and in the hook's own comment".
  - The SessionStart line also renders in Codex sessions, and it says "topic reads on this host". A Codex lead could read that R as covering Codex reads, but it never does.
- Fix: the lead adds one bullet to the README hook list (a hooks description, not the changelog). For example:
  > **Knowledge read counter** (PostToolUse on Read|Write|Edit — `hooks/knowledge-log.mjs`): appends one line to `~/.agents/knowledge/read.log` (or `inbox.log` for `_inbox/`) when a tool touches `~/.claude/knowledge/`. Unsupported on Codex (Codex hook payloads carry no file path); Codex reads are not counted. Off switches: `~/.agents/no-knowledge-log`, `~/.agents/ws-off`.
- If "Three hooks" is kept as a count, update it too.
- Alternatively, append the Codex sentence to the `docs/census.md` paragraph.

### m2 MINOR: in this repo the knowledge line has 3 to 6 bytes of render headroom, and it is dropped whole rather than shortened
- Evidence:
  - `goal-card.mjs` `renderInjection`: when the card plus the line exceeds `RENDER_MAX_BYTES`, the whole line is dropped.
  - `formatKnowledgeLine` already has a short form that omits `; INDEX ~/.claude/knowledge/INDEX.md` (36 bytes), but it is used only for the line's own 160-byte cap, not for the render cap.
  - Measured with this repo's card: 1194 and 1197 of 1200 bytes for realistic counts, and the line is dropped once reads reach 4 digits or the card grows about 6 bytes.
  - The drop is silent and the card stays intact, so the spec is met, but the nudge disappears in exactly the repo where the lead's live check runs.
- Fix (judgment call, instruction only): have `goalCardResult` compute both forms, or pass the counts, and have `renderInjection` try the full line, then the short line, then no line.
  - Predicted outcome: 4-digit reads still show `knowledge: … topic reads on this host in 7 days` at about 1162 bytes.
  - The live check does not need this. It shows R=1 with 1194 bytes.

### m3 MINOR: in theory, a rotation race can overwrite the one `.1` backup
- Evidence: `hooks/knowledge-log.mjs:255-257` checks for `.1` and then renames, which is not atomic.
  - The race needs two sessions with the log at or over 1 MiB. Process A checks that `.1` is absent, renames, and appends a fresh line.
  - Process B checked for `.1` before A's rename. B then renames the new, tiny live log onto `.1`. On both win32 and POSIX `rename` replaces the destination, so the 1 MiB backup is lost. The spec says "never deleted".
  - I could not reproduce it: 15 trials of 30 concurrent hooks against an exactly 1 MiB log gave `.1` = 1048576 bytes every time and 0 lines lost. It fires at most once in the log's lifetime.
- Fix (mechanical): replace the rename with a hard link plus unlink, so a second rotator fails with `EEXIST` instead of overwriting.
  - Current code:
    ```js
      try {
        fsImpl.renameSync(logPath, `${logPath}.1`);
      } catch {
    ```
  - Replacement:
    ```js
      try {
        fsImpl.linkSync(logPath, `${logPath}.1`); // EEXIST if another session already rotated: never clobbers
        fsImpl.unlinkSync(logPath);
      } catch {
    ```
  - Predicted outcome: the loser's link throws `EEXIST` and it falls through to append to the live log.
  - An append that lands between the winner's link and its unlink goes to the shared inode, so it is kept in `.1`.
  - The existing rotation tests (no prior `.1` rotates; an existing `.1` is left alone) still pass.
  - `fsImpl` doubles in the tests would need `linkSync` and `unlinkSync`.

### INFO (no action required for this lane)
- **i1.** R reads only `read.log`, not `read.log.1`, so for up to 7 days after the single rotation R undercounts. After that the live log grows without bound, and K23 reads it whole on every card render: SessionStart, PostToolBatch reinjection and each Codex lead UserPromptSubmit. At about 110 bytes per line this is negligible for months. A later census lane may want a size bound.
- **i2.** The line format `<ts> <tool> <path> <session>` is ambiguous when a path contains spaces (probe home `Ben Home`). K23 is unaffected because it reads only token 0. A future census that wants the path or session should split off the first two tokens and the last one, not split on spaces.
- **i3.** No card means no line.
  - `goalCardResult` returns `blind` or `absent` before `knowledgeSessionLine` runs. Earlier reviews already raised this and `docs/census.md:371-376` documents it.
  - The Lead addendum's live check "from a scratch directory" will therefore show no knowledge line. Run it from a checkout with a card, such as this repo. My probe showed that a scratch project needs both `.agents/project.json` and `docs/goals/card.md`.
  - Whether "every session" needs the line without a card is the lead's decision.
- **i4.** Two carries are already on the lead's list:
  - `docs/GOALS.md:119` and both fixtures still carry the 2026-09-24 figure (44 pending). Spec K3 item 2 wants the script's dated counts from the Windows build, mirrored into both fixtures.
  - `docs/census.md:372` still says the line "is computed inside `renderInjection`". After round 2 it is computed in `goalCardResult` and only appended by `renderInjection`. The paragraph also ends with "(round-1 review, MAJOR 2)".
- **i5.** `AGENTS_HOME` is honoured on one side of the seam only.
  - K1 ignores it and always uses `os.homedir()/.agents`.
  - K23 derives the store and log home as `dirname(AGENTS_HOME)` when it is set.
  - In production neither variable is set (checked in this session without printing values), so the two agree. A host that set `AGENTS_HOME` to something other than `<home>/.agents` would silently lose the line.

## Answers to the brief's checks
1. The tree equals base + record + K1 + K23 merges, plus the announced test-only c999704. Both merge trees are byte-identical to clean re-merges, and nothing stray is present.
2. The joints agree on path, format and kill switches, with actual lines quoted above. `hooks.json` gains one entry and the rest is identical. Codex is consistent in code, hook comment and mirror, but the doc statement is missing (m1). The SessionStart line fits under the 1200-byte render cap, and the card is never cut (m2 covers the headroom).
3. On the attack brief: malformed lines are skipped, 40 concurrent appends are all intact, `_inbox/_archive` is not pending, the `~/Code/knowledge-base` false positive does not occur, and `~`, relative, prefix-sibling and traversal paths are all handled correctly.
4. Every child spawn in the four test files uses `childEnv()`, and the N2 scanner passes.

## Delta re-review: c999704..2ea22bf (docs only), 2026-09-27 at 10:08 New York
- The diff touches 4 files and nothing else: `docs/GOALS.md:119`, both decisions fixtures, and `docs/census.md`, which gains one paragraph. No code changed. The worktree is clean at `2ea22bf8c71b8b2d0f4c144ca35ef189cd990764`.
- **m1 is closed.** The new `docs/census.md` paragraph says the read counter is unsupported on Codex, gives the reason (no file path in Codex hook payloads), and says Codex sessions still show the line, with a read count that covers only Claude sessions on the same host. That is accurate against `hooks/knowledge-log.mjs:67-94`, `hooks/codex-hooks.json` (unchanged) and the goal-card Codex rendering path.
  - The README hook list still does not name the hook. That is acceptable, because the spec allows "wherever the plugin lists its hooks" and the lead chose census.md.
- **GOALS (i4) is closed.**
  - The status is dated 2026-09-27, attributed to `scripts/knowledge-count.mjs`, and reads 16 topics, 70 pending (oldest 2026-07-28), 1 read in 7 days.
  - It stays NONE, as the spec requires ("do not promote it on the strength of shipping this lane"), and it keeps the triage-unscheduled sentence.
  - The sentence is identical in `docs/GOALS.md`, `goals-src/docs/GOALS.md` and `goals-page.expected.md` (the last inside the red NONE span).
- **Tests.** `node --test skills/decisions/scripts/*.test.mjs scripts/goal-card.test.mjs` gives 296/296 pass, including `goals-mirror`. `scripts/work-record.test.mjs`, the other test that reads GOALS.md, gives 164/164 pass.
- **Still open.** m2, m3, the stale "computed inside `renderInjection`" wording in the census paragraph (i4, second item), and the other INFO items stand as written. None blocks.
