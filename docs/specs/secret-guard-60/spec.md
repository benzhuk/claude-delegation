# Lane 60: secret guard, a denial log first, then the two noisiest patterns narrowed

Ask: skills-fable-guard-60-1. Ben's tick, page read 5:20 PM NY 9/29, is recorded on main (f815df7): "Yes, open the guard lane after the sweep (recommended)". The item text is "a denial log (command text only, never file contents), then tightens the two noisiest patterns against that log, with a red-team review so nothing real gets through. The guard stays on throughout."

Measure: work lost or stalled. The count is refusals per day, read from the new log across hosts. The baseline is 236 refusals in 108 desktop transcripts on 9/29.

Territory: the dotfiles, not the plugin. Work happens in the worktree /var/tmp/lane-60/dot, on branch build/secret-guard-60-1 of the chezmoi source repo, based at origin/main b29f3f8. The files are:
- dot_claude/hooks/executable_secret-guard.sh;
- dot_claude/hooks/executable_install-secret-guard.sh;
- dot_claude/hooks/INSTALL-secret-guard.md;
- the hook's existing test corpus, wherever the scout finds it. It is extended, never replaced.

The plugin repo holds only this record and the evidence, on branch build/secret-guard-60-1.

Never touch:
- ~/.local/share/chezmoi's own checkout. It is mid-merge on the encrypted secrets file, and that is Ben's to resolve.
- The live ~/.claude/hooks.
- Any encrypted file.

Nothing is applied during the build.

## Phase 1: denial log (buildable now)
- Every refusal appends one line to `~/.local/state/secret-guard/denials.log`. The path is machine-local and never chezmoi-added. It honors XDG_STATE_HOME when set.
- Line format, tab-separated:
  1. UTC ISO timestamp;
  2. hook phase (PreToolUse or PostToolUse);
  3. tool name;
  4. the matched pattern's NAME;
  5. the command or target text, with newlines replaced by spaces, truncated to 300 characters.
- The log never holds file contents or any matched value. On a PostToolUse output detection (SECRET DETECTED), the text field is the literal `<output withheld>`.
- A redaction pass runs before writing. Any substring that the guard's own key patterns would match is replaced by `<redacted:<pattern name>>`, so a command text that contains a real key never lands in the log.
- Off switch: while `~/.agents/ws-off-guard-log` exists, nothing is logged.
- A failure to create the directory, lock or write the file is swallowed. It never changes the deny decision, the exit code or the hook's stdout and stderr.
- The log directory is mode 700, and the file is mode 600.
- The log is bounded: if the file exceeds 5 MB, the oldest half is dropped before appending (rotate by rename to .1, one generation).
- Tests, each red before and green after:
  - a refusal appends exactly one line with the five fields;
  - a command that contains a fake key pattern is logged redacted;
  - an output detection logs `<output withheld>`;
  - with the off switch present, nothing is logged;
  - an unwritable log dir leaves the decision and exit code unchanged;
  - the modes are 700 and 600.

## Phase 2: narrow the two noisiest patterns (waits for the corpus)
- The corpus is docs/work/evidence/secret-guard/denials-desktop.md on plugin main (skills-fable's runner, pending), plus the Netcup refusals from this session's own transcripts.
- A ruling r1 will name the two patterns and the exact narrowing, once the corpus ranks them.
- Known candidates:
  - the accessor-phrase family, which matches argv and similar non-env accessors;
  - the env-file path regex, which matches prose and grep patterns;
  - a new third finding: a branch name ending in "task-" next to a 40-hex sha folds into the legacy key pattern.
- For each narrowed pattern:
  - a red-team test proves that every real case it was written for still denies;
  - the formerly refused corpus commands that now pass are listed;
  - the real-secret reads in the corpus that still deny are listed, and that list must be all of them.

## Review and rollout
- An Opus red-team reviews the pattern changes. It runs through the review-run tool, or through an Agent-tool Opus reviewer with review-run's identity sidecar when review-run cannot reach the dotfiles.
- The hook corpus must be green on Netcup, and on the desktop through skills-fable.
- After APPROVE:
  - merge build/secret-guard-60-1 into dotfiles origin/main, which is the chezmoi source commit;
  - `chezmoi apply` on Netcup and Hetzner. On Netcup this waits until Ben resolves the stuck merge in the chezmoi checkout, because apply from a conflicted source is not safe;
  - Windows and Mac apply only on Ben's word, through a decisions-page item that skills-fable publishes.
