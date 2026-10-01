# Lane 60 phase 2: corpus replay, old hook (c890801) vs. new hook

Method: every quoted command found in plugin main's
`docs/work/evidence/secret-guard/denials-desktop.md` (fetched via
`git -C /home/ben/Code/wt-ws-mainbase show origin/main:docs/work/evidence/secret-guard/denials-desktop.md`,
never checked out) was extracted programmatically and replayed, AS WRITTEN,
as a `Bash` `tool_input.command` PreToolUse payload through two hook
binaries:

- **OLD** = `git show c890801f58f7068db66ee1548ce9a7b604df22b4:dot_claude/hooks/executable_secret-guard.sh`
  (the commit this build started from, pre-phase-2);
- **NEW** = this branch's `dot_claude/hooks/executable_secret-guard.sh` at
  the commit this document is committed alongside.

Each replay ran in an isolated `HOME`/no real state, matching the selftest's
own fixture discipline. **The corpus itself truncates every quoted command
to roughly 200 characters** (its own stated practice, "Quoted commands are
truncated in the corpus"). This replay does not attempt to reconstruct the
missing tail — every command below is replayed exactly as the corpus prints
it, including a mid-token cutoff and any `[literal-removed]` placeholder the
census run already substituted. Where truncation removes the actual
triggering text, neither hook denies the truncated fragment; that is a
property of the corpus, not of either hook build, and is called out
explicitly below rather than silently omitted.

33 quoted commands were found: the 3 class-(a) real reads (listed in full in
the corpus's own "every case is listed" section) and the 15 sampled
examples each for class (b) and class (d) (class (c) has zero cases; class
(e) has no sampled command text in the corpus, only sub-type counts, so
there is nothing to replay there). Section 5 of the corpus ("Refusals whose
command contains the environment-file flag") names two more refusals but
gives no separate quoted command for either (one names the flag text was
inside a subagent *prompt*, not a command; the other gives only a reason,
no command text) — nothing replayable there either.

## Result summary

| class | commands | denied on OLD | denied on NEW | now passing (OLD deny → NEW allow) | regressions (OLD allow → NEW deny) |
|---|---|---|---|---|---|
| a | 3 | 2 | 2 | 0 | 0 |
| b | 15 | 8 | 4 | 4 | 0 |
| d | 15 | 1 | 0 | 1 | 0 |
| **total** | **33** | **11** | **6** | **5** | **0** |

Zero regressions: no command that the old hook allowed is denied by the new
one across all 33 rows.

### Class (a): all 3 real reads still deny, confirmed

Two of the three class-(a) rows deny on **both** OLD and NEW when replayed
verbatim (rows 1–2 below). The third (row 3, session `cb23003e`) does **not**
deny on either hook when replayed as the corpus prints it — the corpus's own
200-character truncation cuts that command off before whatever text actually
triggered the real refusal (the corpus's own reason field for that row says
"command references a secret file", but the printed fragment names only a
registry path and an `OPENAI`-named filter, neither of which is
secret-shaped by this hook's own patterns). This is a truncation artifact
present on **both** hooks identically, not a phase-2 regression.

Per the ruling's own allowance ("Test each one, **or a structural twin of it
with fake paths**"), row 3 is proven instead by a structural twin in the
selftest corpus (`t_phase2_classA_registry_hunt_secret_path`,
`executable_secret-guard-selftest.sh`): the same registry-enumeration shape,
completed with a real secret-path mention (matching the corpus row's own
stated reason), which denies on both OLD and NEW.

| # | label | old | new |
|---|---|---|---|
| 1 | 9/27, 10:25 AM agent-abuilder | DENY (env dump) | DENY (env dump) |
| 2 | 9/26, 6:10 PM agent-alane-fa | DENY (secret file) | DENY (secret file) |
| 3 | 9/25, 6:59 PM cb23003e | allow (truncated before trigger — see note above; twin denies both) | allow (same) |

### Now-passing commands (5 total)

All 5 were denied by OLD and are allowed by NEW. Reasons matched to the
exclusion/narrowing that changed each one:

1. **class b, 9/28 8:31 AM, session 001c0ea5** — exclusion Q (ls existence
   operand): `grep -in "netcup" ~/.claude/knowledge/_inbox/[literal-removed].md ~/.claude/knowledge/_inbox/[literal-removed].md | cut -c1-400 | head; echo ---; ls ~/.ssh/ 2>/dev/null;`
   — old reason: "command references a secret file" (the `ls ~/.ssh/`
   existence listing). New: allowed (Q's ls-operand exemption).

2. **class b, 9/28 9:34 AM, agent-abuilder** — exclusion Q (ls existence
   operand): `cd "C:\Users\benzh\Code\Zhuk Projects\tdf-wt\h-c1\apps\web" && ls -la .env* 2>&1; echo "--- h-c2 worktree env ---"; ls -la "C:\Users\benzh\Code\Zhuk Projects\tdf-wt\h-c2\`
   — old reason: "command references a secret file" (`ls -la .env*`). New:
   allowed.

3. **class b, 9/21 11:25 PM, agent-areview-** — exclusion Q / narrowing E
   shared mechanism (grep pattern argument): `P="$SP/loop-build/wt-integrate"; cd "$P"; echo "=== spawn/exec/fork in new test files ==="; grep -n "spawn\|execFile\|execSync\|fork(\|process\.env" skills/team-build/ref`
   — old reason: "command references a secret file" (the literal
   `process\.env` text inside the grep pattern argument read as a dotted
   secret-file mention). New: allowed
   (`strip_search_pattern_arguments` blanks the whole quoted grep pattern).

4. **class b, 9/27 12:57 AM, agent-alane11-** — same shared mechanism:
   `ssh ben@100.69.249.18 "cd ~/tmp/[literal-removed] && ls scripts/run-tests.mjs && grep -n 'PLATFORM\|process.env' scripts/run-tests.mjs | head -20"`
   — old reason: "command dumps the process environment" (`process.env`
   sitting inside the single-quoted grep pattern). New: allowed.

5. **class d, 9/22 8:38 AM, agent-aa9359fb** — narrowing E (grep/sed pattern
   argument): `SCRATCH="$SP/P1-mutation-copy" cd "$SCRATCH" grep -n "env = process.env" scripts/wiring-check.mjs sed -i 's/lists, env = process.env }/lists, env = {} }/' scripts/wiring-`
   — old reason: "command dumps the process environment" (the bare `env`
   token inside the quoted grep pattern, immediately after the opening
   quote). New: allowed.

### Everything else: unchanged

The remaining 28 rows behave identically on OLD and NEW: 4 class-b rows stay
denied (real `.ssh`/secret-file/env-dump mentions outside any Q/E-exempt
context — e.g. a bare `env | grep -i TDF`, which narrowing E does **not**
exempt: it starts a pipeline segment with bare `env` and no arguments, one
of E's own explicit deny cases), and the other 22 rows across b/d were
already allowed on OLD when replayed truncated (the corpus's 200-character
cutoff falls before the command's actual write/heredoc content in most
class-d cases, and before the flagged text in several class-b cases) and
remain allowed on NEW.

## Full 33-row table

| # | class | label | old | new |
|---|---|---|---|---|
| 1 | a | 9/27, 10:25 AM agent-abuilder | DENY | DENY |
| 2 | a | 9/26, 6:10 PM agent-alane-fa | DENY | DENY |
| 3 | a | 9/25, 6:59 PM cb23003e | allow* | allow* |
| 4 | b | 9/28, 8:31 AM \| 001c0ea5 | DENY | **allow** |
| 5 | b | 9/28, 9:34 AM \| agent-abuilder | DENY | **allow** |
| 6 | b | 9/26, 7:27 PM \| agent-aintegra | allow | allow |
| 7 | b | 9/28, 10:35 AM \| agent-aintegra | DENY | DENY |
| 8 | b | 9/27, 10:46 AM \| 4660b908 | allow | allow |
| 9 | b | 9/26, 6:07 PM \| 986a8552 | DENY | DENY |
| 10 | b | 9/26, 7:06 PM \| agent-adfd938b | allow | allow |
| 11 | b | 9/27, 8:54 AM \| agent-a3007ca7 | allow | allow |
| 12 | b | 9/21, 11:25 PM \| agent-areview- | DENY | **allow** |
| 13 | b | 9/20, 10:46 PM \| agent-a07867a6 | DENY | DENY |
| 14 | b | 9/21, 5:10 PM \| agent-a6669a58 | allow | allow |
| 15 | b | 9/21, 12:27 AM \| agent-a850b746 | allow | allow |
| 16 | b | 9/20, 7:50 PM \| agent-aaudit-h | DENY | DENY |
| 17 | b | 9/21, 12:39 AM \| agent-ad784494 | allow | allow |
| 18 | b | 9/27, 12:57 AM \| agent-alane11- | DENY | **allow** |
| 19 | d | 9/26, 5:55 PM \| agent-abuilder | allow | allow |
| 20 | d | 9/26, 5:22 PM \| agent-aredteam | allow | allow |
| 21 | d | 9/26, 5:17 PM \| 4660b908 | allow | allow |
| 22 | d | 9/26, 4:52 PM \| 986a8552 | allow | allow |
| 23 | d | 9/26, 10:58 PM \| agent-areviewe | allow | allow |
| 24 | d | 9/26, 7:09 PM \| agent-adfd938b | allow | allow |
| 25 | d | 9/25, 9:43 PM \| agent-a970d493 | allow | allow |
| 26 | d | 9/27, 4:38 PM \| agent-aaf43320 | allow | allow |
| 27 | d | 9/26, 4:21 PM \| agent-aca4e115 | allow | allow |
| 28 | d | 9/23, 3:53 PM \| agent-ac9efb1e | allow | allow |
| 29 | d | 9/22, 12:22 PM \| agent-a7240a1c | allow | allow |
| 30 | d | 9/22, 8:38 AM \| agent-aa9359fb | DENY | **allow** |
| 31 | d | 9/22, 8:06 AM \| agent-a1c06c10 | allow | allow |
| 32 | d | 9/21, 5:58 PM \| agent-a92e8c3d | allow | allow |
| 33 | d | 9/22, 4:37 PM \| agent-acd6ecb4 | allow | allow |

`*` row 3: truncation artifact on both hooks — see "Class (a)" section above;
proven instead by a structural twin in the selftest corpus.

## Reproducing this replay

The extraction/replay scripts used to build this table live under the
scratch directory `/var/tmp/delegation-l60p2-*` (per the build's hard rule
against writing scratch into the repo) and are not part of the deliverable;
this document is the durable record. To redo it: extract each quoted
command from the corpus markdown's class-(a) list and class-(b)/(d) sample
tables, wrap each in `{"tool_name":"Bash","tool_input":{"command":"<text>"}}`,
and pipe that JSON into `bash <hookbin> pretooluse` with `HOME` pointed at an
empty fixture directory, once per hook binary (OLD = commit c890801, NEW =
this branch's HEAD).
