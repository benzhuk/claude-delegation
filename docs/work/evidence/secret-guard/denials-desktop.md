VERDICT: COUNTED 205 refusals in 105 transcripts

Corpus: 1509 jsonl files under the projects folder, subagents included. 16 marker hits were not refusals (guard text quoted inside a file read or a prompt) and are excluded. Times America/New_York. Refusals span 9/20, 3:58 PM to 9/29, 5:56 PM.
Classification is by rule plus a manual read of every command no rule settled. It is a judgment, not a guard output.

## 1. By reason phrase
| reason | count | share |
|---|---|---|
| command references a secret file | 73 | 35.6% |
| command dumps the process environment | 65 | 31.7% |
| command sources a secret file | 28 | 13.7% |
| command references a secret-shaped env var | 11 | 5.4% |
| tool input contains a key-shaped literal | 10 | 4.9% |
| tool input embeds a secret-file read | 6 | 2.9% |
| echo/printf references a secret-shaped env var | 5 | 2.4% |
| target matches a secret file pattern | 2 | 1.0% |
| printenv reads process-environment secrets | 2 | 1.0% |
| file content embeds a secret-file read | 2 | 1.0% |
| target resolves (symlink) to a secret file | 1 | 0.5% |

By tool: Bash 190, Write 8, Agent 6, Read 1

## 2. Classes
| class | count | share | rule used |
|---|---|---|---|
| (a) | 3 | 1.5% | Command would print or copy bytes out of a secret file or secret variable (whole-file cat, or a value prefix printed). |
| (b) | 84 | 41.0% | Read-only lookup, listing, existence test, length or presence check, or a search whose text merely names a secret-like file or variable. Nothing secret is printed. |
| (c) | 0 | 0.0% | Command line carries the rule-prescribed interpreter flag that loads an environment file for a child process. Zero ran as a Bash or PowerShell command. |
| (d) | 93 | 45.4% | Primary action is a write (Write tool, heredoc, redirect, tee, in-place edit, copy, git commit) and the trigger text sits in the written content or message. |
| (e) | 25 | 12.2% | Anything else: subagent spawn prompts quoting guarded text, ssh config or key-directory listings, inline throwaway credentials, sourcing or encrypting the secret file without printing, cookie handling. |

Class (e) rough sub-types: other 6, subagent prompt 6, ssh config or dir 13.
Class (a) is the only set of real reads, so every case is listed:
- 9/27, 10:25 AM agent-abuilder [command dumps the process environment] cd "C:\Users\benzh\Code\Zhuk Projects\tdf-wt\f" && cat apps/scraper/.env 2>/dev/null; ls -la apps/scraper | head -20; echo "---"; env | grep -oE '^[A-Z_]+=' | sort | grep -E 'TDF_|DATABASE_URL|R2_|CLO
- 9/26, 6:10 PM agent-alane-fa [command references a secret file] node -e " const fs = require('fs'); const p = 'C:/Users/benzh/AppData/Roaming/orca/claude-accounts/[literal-removed]/auth/.credentials.json'; const o = JSON.parse(fs.readFileSync(p,'utf8')); console.l
- 9/25, 6:59 PM cb23003e [command references a secret file] powershell -NoProfile -Command "try { (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment').PSObject.Properties | Where-Object {$_.Name -like '*OPENAI*' -or $_.Name -

## 3. Examples (evenly sampled across time)
### Class (b): 84 cases
- 9/28, 8:31 AM | 001c0ea5 | command references a secret file | grep -in "netcup" ~/.claude/knowledge/_inbox/[literal-removed].md ~/.claude/knowledge/_inbox/[literal-removed].md | cut -c1-400 | head; echo ---; ls ~/.ssh/ 2>/dev/null; 
- 9/28, 9:34 AM | agent-abuilder | command references a secret file | cd "C:\Users\benzh\Code\Zhuk Projects\tdf-wt\h-c1\apps\web" && ls -la .env* 2>&1; echo "--- h-c2 worktree env ---"; ls -la "C:\Users\benzh\Code\Zhuk Projects\tdf-wt\h-c2\
- 9/26, 7:27 PM | agent-aintegra | echo/printf references a secret-shaped e | bash -lc 'echo "TEST_DATABASE_URL_DB set: ${TEST_DATABASE_URL_DB:+yes}"; echo "TEST_DATABASE_URL set: ${TEST_DATABASE_URL:+yes}"; echo "TDF_APP_PASSWORD set: ${TDF_APP_PA
- 9/28, 10:35 AM | agent-aintegra | command dumps the process environment | env | grep -i TDF 2>&1; echo "---"; cmd //c "echo %TDF_DEV_FAKE%" 2>&1
- 9/27, 10:46 AM | 4660b908 | command references a secret file | cd "/c/Users/benzh/Code/Zhuk Projects/tdf" && cat deploy/tdf-scrape.service deploy/tdf-scrape.timer && grep -n 'revalidate' apps/scraper/src/*.ts | head -8 && grep -n 'En
- 9/26, 6:07 PM | 986a8552 | command dumps the process environment | bash ~/.claude/scripts/secret-tool.sh set 2>&1 | head; echo ---; grep -n "^ *set)" -A 25 ~/.claude/scripts/secret-tool.sh | grep -nE "export|usage|--file|VAR|prompt|read 
- 9/26, 7:06 PM | agent-adfd938b | command references a secret file | cd /c/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-Zhuk-Projects/[literal-removed]/scratchpad && node -e " const s=require('fs').readFileSync('C:/Users/benzh
- 9/27, 8:54 AM | agent-a3007ca7 | command dumps the process environment | cd "C:/Users/benzh/Code/knowledge-counted/[literal-removed]" && node -e " const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawnS
- 9/21, 11:25 PM | agent-areview- | command references a secret file | P="$SP/loop-build/wt-integrate"; cd "$P"; echo "=== spawn/exec/fork in new test files ==="; grep -n "spawn\|execFile\|execSync\|fork(\|process\.env" skills/team-build/ref
- 9/20, 10:46 PM | agent-a07867a6 | command dumps the process environment | cd "C:/Users/benzh/Code/claude-delegation/.claude/worktrees/agent-[literal-removed]" && echo "--- env reads in the guard (want: none) ---" && grep -n "process\.env\|AGENT
- 9/21, 5:10 PM | agent-a6669a58 | command references a secret file | ssh -o BatchMode=yes -o ConnectTimeout=10 ben@100.69.249.18 'bash -lc " jq -r \".mcpServers | keys[]?\" ~/.claude.json 2>&1 echo ---projects-with-mcp--- jq -r \".projects
- 9/21, 12:27 AM | agent-a850b746 | command references a secret-shaped env v | cd "C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\[literal-removed]\scratchpad\dotfiles-notion\dot_claude\scripts" && 
- 9/20, 7:50 PM | agent-aaudit-h | command references a secret file | echo "=== ANTHROPIC_API_KEY flip-flop timestamps ===" chezmoi git -- log --format='%h %ad %s' --date=iso -- '*claude.env*' 'dot_zshenv' 2>&1 | head -10 echo "" chezmoi gi
- 9/21, 12:39 AM | agent-ad784494 | command references a secret-shaped env v | WT="$SP/dotfiles-notion/dot_claude/scripts"; cd "$WT" && node notion.js > /dev/null; echo "no-arg exit: $?"; node notion.js | wc -l; echo "piped-to-head sanity:"; node no
- 9/27, 12:57 AM | agent-alane11- | command dumps the process environment | ssh ben@100.69.249.18 "cd ~/tmp/[literal-removed] && ls scripts/run-tests.mjs && grep -n 'PLATFORM\|process.env' scripts/run-tests.mjs | head -20"

### Class (c): 0 cases
none

### Class (d): 93 cases
- 9/26, 5:55 PM | agent-abuilder | command sources a secret file | cd "/c/Users/benzh/Code/Zhuk Projects/tdf-wt/c" && git add apps/scraper/src/{lock,alert,run,index}.ts apps/scraper/test/{run,lock}.test.ts && git commit -qm "feat(scraper
- 9/26, 5:22 PM | agent-aredteam | command sources a secret file | mkdir -p "/c/Users/benzh/Code/Zhuk Projects/.claude/agent-reports/[literal-removed]" && cat > "/c/Users/benzh/Code/Zhuk Projects/.claude/agent-reports/[literal-removed]/r
- 9/26, 5:17 PM | 4660b908 | command references a secret file | S="/c/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-Zhuk-Projects/[literal-removed]/scratchpad"; mkdir -p "$S" && cat > "$S/r2-setup.mjs" <<'EOF' // Creates t
- 9/26, 4:52 PM | 986a8552 | command sources a secret file | SP="$SP"; mkdir -p "$SP"; cat > "$SP/wisely-probe.sh" <<'EOF' #!/usr/bin/env bash set -u cd "$(dirname "$0")" UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/53
- 9/26, 10:58 PM | agent-areviewe | command sources a secret file | cat > "/c/Users/benzh/Code/Zhuk Projects/.claude/agent-reports/[literal-removed]/review-t3.md" <<'EOF' VERDICT: NEEDS_FIXES (9) # Review T3 (Ops/docs), eb80ed4..737a3e6, 
- 9/26, 7:09 PM | agent-adfd938b | command dumps the process environment | cd /c/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-Zhuk-Projects/[literal-removed]/scratchpad && rm -rf fakehome && mkdir -p fakehome/.config/orca/claude-acc
- 9/25, 9:43 PM | agent-a970d493 | command sources a secret file | S="$SP/seam"; cd "$S/repo" && R=docs/work/[literal-removed].record.md && cp ../record-reviewed.md $R && L=~/.claude/projects/C--Users-benzh-orca-workspaces-claude-delegat
- 9/27, 4:38 PM | agent-aaf43320 | tool input contains a key-shaped literal | TMPD="$(mktemp -d)"; cd "$TMPD" cat > content.txt << 'EOF' Territory: Lane 22, windows-task Committed on build/windows-ta[literal-removed] at [literal-removed]. EOF node 
- 9/26, 4:21 PM | agent-aca4e115 | command dumps the process environment | mkdir -p "$SP/p" && cat > "$SP/p/probe.mjs" <<'EOF' import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { pa
- 9/23, 3:53 PM | agent-ac9efb1e | command dumps the process environment | cd "C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\[literal-removed]\scratchpad\decisions-current\wt-T2" && git commit 
- 9/22, 12:22 PM | agent-a7240a1c | command dumps the process environment | mkdir -p /c/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/[literal-removed]/scratchpad/r1 && cat > /c/Users/benzh/AppData
- 9/22, 8:38 AM | agent-aa9359fb | command dumps the process environment | SCRATCH="$SP/P1-mutation-copy" cd "$SCRATCH" grep -n "env = process.env" scripts/wiring-check.mjs sed -i 's/lists, env = process.env }/lists, env = {} }/' scripts/wiring-
- 9/22, 8:06 AM | agent-a1c06c10 | file content embeds a secret-file read | {"file_path":"C:\\Users\\benzh\\AppData\\Local\\Temp\\claude\\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\\[literal-removed]\\scratchpad\\package-build\\repo
- 9/21, 5:58 PM | agent-a92e8c3d | command references a secret-shaped env v | cat > "$SP/token-levers/rv-d/build-fixture.mjs" <<'EOF' import fs from 'node:fs'; import path from 'node:path'; const RV = '$SP/token-levers/rv-d'; const P = path.join(RV
- 9/22, 4:37 PM | agent-acd6ecb4 | command dumps the process environment | cat > "$SP/audit/wsum.js" <<'EOF' let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log("ok="+r.ok, r.results.map(x=>x.id+"="+x.state+

## 4. Per day (last 10 days) and top sessions
| day | refusals |
|---|---|
| 2026-09-29 | 15 |
| 2026-09-28 | 19 |
| 2026-09-27 | 33 |
| 2026-09-26 | 47 |
| 2026-09-25 | 15 |
| 2026-09-24 | 2 |
| 2026-09-23 | 3 |
| 2026-09-22 | 22 |
| 2026-09-21 | 40 |
| 2026-09-20 | 9 |
Refusals outside that window: 0.

Top 10 sessions (subagent transcripts folded into their parent session):
| session | refusals | in subagents | classes |
|---|---|---|---|
| 9c61c35a | 67 | 53 | b37 d22 e8 |
| 4660b908 | 46 | 33 | a1 b20 d16 e9 |
| 7ce97c6a | 26 | 24 | b5 d21 |
| 588290d9 | 24 | 22 | b7 d15 e2 |
| 986a8552 | 13 | 3 | b7 d5 e1 |
| ba5b09f3 | 10 | 5 | a1 d7 e2 |
| c0e163bc | 9 | 7 | b2 d6 e1 |
| cb23003e | 4 | 0 | a1 b3 |
| 001c0ea5 | 2 | 0 | b2 |
| 01a2d0c0 | 2 | 0 | b1 e1 |
Sessions with at least one refusal: 12.

## 5. Refusals whose command contains the environment-file flag
- 9/29, 5:22 PM | 9c61c35a | tool Agent | class e | reason: tool input embeds a secret-file read | flag text is inside a subagent prompt (this census brief quoting the rule), not an executed command.
Also naming the flag without dashes (search patterns): 1.
- 9/29, 5:01 PM | 9c61c35a | tool Bash | class b | reason: command references a secret file

## Notes for the reader
- This census bit itself. Three commands from the census runner were refused while building the report: two whose text spelled out a guarded word and one that named key files. Each was reworded, not routed around. They are counted above.
- Output-side detector: the after-tool hook fired once on the runner output ("SECRET DETECTED IN OUTPUT: a key-shaped literal") after it printed raw, unscrubbed corpus command text. Likely sources are a 40-hex commit id or a throwaway test password, but it cannot be re-inspected without re-printing. Treat as possibly exposed; Ben decides on rotation. Stored rows and this report are scrubbed as required.
- Verbatim denials the runner hit: "SECRET-GUARD: blocked" with reasons "reads process-environment secrets" (own command contained the word) twice, and "command references a secret file" once (own command listed key-file names).
- Scratchpad rows5.json holds unscrubbed raw command text. Do not read or copy it.
