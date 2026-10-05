# Bet 2: the secret guard protects sight, not use

Opened: 2026-10-05 10:25 AM America/New_York, on Ben's words in the lead pane: "can we do this urgently right now, and also disable it while we work?"
Appetite: one working day. Ends Tuesday 2026-10-06 at 12:00 PM America/New_York. No extension. At the appetite the branch goes to Ben with what is done and its gaps named, and he decides whether it replaces the guard or the guard stays off.
Owner decisions this bet answers: Ben's 10/5 word to do it urgently and to disable the guard on ben-desktop while it runs.

## Problem lines this bet answers
Misfit rows M135 to M139, M184, M198, M200, M201, M247, M264 to M268, M280, M281, M287, M291, M292: the guard refuses legitimate use of secrets (sourcing to run a script, writing scripts and reports that name the env file, deleting a pulled secrets file) while allowing the one risky verb (pulling every production secret to disk), and it has no owner switch.

## The line it draws
Agents may use secrets and may never see them. Use: a program reads a key from its environment. Sight: a key's value lands in a transcript through display verbs or program output. The guard refuses sight only.

## Output, five changes in the dotfiles repo on one branch, nothing pushed to main
1. Windows agent shells load `~/.config/claude/claude.env` at startup as the Mac and the VPS do, so no agent needs to source it. Proven by a fresh Bash tool call in a new session reporting the variable set, without printing it.
2. `secret-tool run -- <command...>`: loads the env file into the child's environment only, runs the command, passes the output through the existing output detector. Agents run scripts that need keys while their shell holds none.
3. Deleting or moving a secret-shaped file under the session scratchpad, the system temp folders and any `.vercel` output folder is allowed. Deletion cannot leak.
4. `secret-tool pull-one <vercel-project> <VAR>`: fetches one variable from Vercel into the env file without leaving a file on disk; a bare `vercel env pull` of production is refused with a hint to this command.
5. The guard's command matcher shrinks to display verbs on the env file and env dumps (cat, less, head, tail, more, grep, awk, sed printing, echo or printf of a secret-shaped variable, env, printenv, set, export with no args, declare -p), plus the PostToolUse output detector. The "names the env file" and "secret-shaped word anywhere" heuristics are removed. Every must-block case in the existing self-test that is a sight case still blocks; the use cases become allow cases. The guard file is shorter than main's.

## Who
Builder: skills-o's Opus pane runs the build as one loop with a Sonnet builder and an Opus reviewer in the dotfiles repo on branch bet-2/guard-use-not-sight. The reviewer's check is the sight line: list every way a value could reach stdout through the five changes. Codex review by skills-a is skipped for urgency; Ben hears that.

## Parts added and removed
Added: two subcommands in secret-tool, one shell startup line on Windows. Removed: two heuristics from the guard and every line that served them.

## Rules
Never push to dotfiles main: the sync task deploys origin/main to live hosts unreviewed (M288). Never print a secret or any substring beyond an eight-character fingerprint. A denied command stops the step and is reported, never routed around. No git identity changes. No test suites on Windows beyond the guard's own self-test. The apply on any host waits for Ben's word.

## Outcome
Open. The guard is off on ben-desktop from 10:24 AM 10/5 by Ben's word; settings backup in the lead's session scratchpad.
