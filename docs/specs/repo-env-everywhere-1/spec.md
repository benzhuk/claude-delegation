# Lane 47: repo-locating git env everywhere, and the packet lookup miss. Lead spec

Source: the packet beside this file (skills-fable-lane-47-1), plus the follow-ups FU1 to FU6 in the lane 44 review r1 (docs/work/evidence/wr-2026-09-28-transport-identity-review-r1.md). Base d6f5c9d, main after lane 46.

## Part 1: every repo-locating git call ignores an inherited GIT_DIR

### Verified sources (lead, at d6f5c9d)

- skills/multi/scripts/transport.mjs:417-436 has `REPO_LOCATING_GIT_ENV` (GIT_DIR, GIT_WORK_TREE, GIT_COMMON_DIR, GIT_INDEX_FILE) and `gitRunner`, which builds the stripped env inline. On win32 the key match ignores case.
- These direct git calls inherit the parent environment unchanged:
  - scripts/janitor.mjs:165 and :195
  - scripts/collect-from-origin.mjs:27
  - scripts/collect-status.mjs:285 and :581
  - scripts/four-read.mjs:519
  - scripts/prefix-test.mjs:180, :186 and :194, through its `run`
  - scripts/work-record.mjs:358, :589, :790, :1206, :1234, :1592 and :1598, through the injectable `execImpl`/`spawnImpl`
  - skills/decisions/scripts/decisions-handback.mjs:583
  - skills/decisions/scripts/decisions-render-core.mjs:236
  - skills/decisions/scripts/goals-mirror.mjs:244
- decisions-pickup.mjs and collect-status.mjs already import from `skills/multi/scripts/transport.mjs`, so importing it from scripts/ and from skills/decisions/ is an existing pattern.
- `mainCheckout` (transport.mjs) ends with `c.replace(/\/?\.git\/?$/, '')`. For a bare repo whose common dir is `/srv/repo.git`, that produces `/srv/repo`, which is FU5.

### Pinned rulings

P1: one helper. Export `withoutRepoLocatingGitEnv(env)` from transport.mjs. It returns a new object, the copy minus the four names, with win32 ignoring case, and never mutates its argument. `gitRunner` uses it.

P2: every call site listed above passes `env: withoutRepoLocatingGitEnv(<the env it would otherwise have used>)`. A call that passes no env today uses the parent process environment as the argument. A call that passes one wraps it. For work-record.mjs and prefix-test.mjs, apply it in the options object at each git call, so an injected spy sees it. Do not change their injection seams.

P2 scope limit: change only the git calls in janitor.mjs, work-record.mjs and decisions-render-core.mjs, nothing else in those files. They belong to other lanes (lane 45 and skills-o).

P2 check: any `execFileSync`/`spawnSync`/`execFile`/`spawn`/`run`/`execImpl`/`spawnImpl` call with `"git"` that is left without the helper goes in the report with the reason. The report includes the grep that proves it.

P3: FU4. The sealed test env deletes the four names. Where scripts/test-home.mjs `makeTempHome` builds `env`, and in skills/multi/scripts/test-child-env.mjs `childEnv`, remove them after the spread. That way an agent or git hook running the suite with GIT_DIR exported cannot point fixture git calls at the real repo.

P4: FU5. In `mainCheckout`, strip only a trailing `/.git` path component. A common dir that is itself `<name>.git` (bare) is returned as is. Unit-test both.

P5: FU6. The list stays at four. The report gives the reason in two or three lines each for:
- GIT_OBJECT_DIRECTORY and GIT_ALTERNATE_OBJECT_DIRECTORIES: they change objects, not identity;
- GIT_CEILING_DIRECTORIES and GIT_DISCOVERY_ACROSS_FILESYSTEM: they can only stop discovery, never redirect it;
- GIT_NAMESPACE: it scopes refs, not location.
Add a fifth only if the builder shows, with a real git run, that a variable relocates `rev-parse --git-common-dir` or `--show-toplevel`.

### Efficacy for Part 1

Each test is the lane 44 pattern:
- two scratch repos made with `git init` under a mktemp dir;
- the parent environment's GIT_DIR pointed at repo B's `.git`, and restored in `finally`;
- real git, no injected runner;
- it fails on base d6f5c9d and passes at the fix.

One test per call-site class:
- (a) scripts direct calls: pick collect-from-origin or four-read's `runGit`, whichever is callable in-process, plus one more;
- (b) work-record through its default `execImpl`/`spawnImpl`;
- (c) the decisions trio: one of handback, render-core or goals-mirror, through its default runner;
- (d) test-home/childEnv: the returned env has none of the four names even when the parent has GIT_DIR;
- (e) mainCheckout on a bare repo.

The report says, for each class, which call sites the test covers and which are covered by the grep plus the shared helper.

Live proof, run by the lead after review: `janitor.mjs --record` (or its nearest read-only subcommand that resolves the repo; the builder names the exact command in the report) run with GIT_DIR exported to a scratch repo's `.git`. At base it resolves the wrong repo; from the branch it resolves claude-delegation.

## Part 2: the packet lookup miss

### Facts

The skills-n packets skills-n-release-0-20-17-1, -2 and skills-n-lane-44-2 existed in C:/Users/benzh/Code/claude-delegation/docs/notes. skills-fable's pane cwd is the Orca worktree C:/Users/benzh/orca/workspaces/claude-delegation/gudgeon. Its `git rev-parse --git-common-dir` is C:/Users/benzh/Code/claude-delegation/.git, so it resolves to that main checkout. Even so, its hook printed "points at docs/notes/<id>.md, which is not on this machine". GIT_DIR and GIT_WORK_TREE are unset there. skills-a-lane-37-4 got the same false miss on a Windows-to-Windows send with the file present.

### Lead hypothesis, to test and not assume

note-inbox.mjs:213-224 resolves `repo` from `args.repo`, else the hook's `cwd`, else `worktreePathFromEnv(env)`. `mainCheckout` returns `start` itself when `start` is not a git repo. Suppose the hook process's cwd is not inside the repo, for example the home dir or the plugin cache. Then `repo` becomes that non-repo dir. The ledger-dir fallback runs only when `worktreePathFromEnv` yields a different path; ORCA_WORKTREE_ID's format on Windows may not parse. `packetLocation` then checks `<non-repo>/docs/notes/<id>` and reports false, "not on this machine", while the ledger lines still arrive through the ~/.agents/notes mirror. So the lines surface and the packet check looks in the wrong place.

Other candidates:
- ordering, where the packet is written after the ledger line on some path;
- the Windows path form in `path.posix.join` with a drive letter.

### Pinned rulings

P6: reproduce first, on Windows, without touching live state. Use `--home <scratch>` or a scratch AGENTS_HOME, a scratch repo with a linked worktree, and a packet in the main checkout. Drive note-inbox the way the hook does: same argument shape, the cwd the hook really has, and ORCA_WORKTREE_ID in the form Orca really sets. Read the hook source for both. Record the exact repro. Then write the smallest fix at the cause, in note-inbox.mjs (or note-send.mjs if it is the write order). If the cause is a non-repo `start`, a likely shape is that `mainCheckout` reports "not a repo" distinctly and the resolver moves on to the next candidate instead of using a non-repo dir as the repo.

P7: a packet the reader could not look for in a real repo reads `packet: <path>, not checked here`, never MISSING. MISSING means "looked in a real repo checkout and it is not there".

### Efficacy for Part 2

- A unit test in note-inbox.test.mjs that reproduces the miss with the real resolution path: red on base, green at the fix.
- The Windows repro run before and after, in the report.
- Live proof, run by the lead after merge and install is not needed. From the branch on Windows, run note-inbox against a scratch home with a worktree cwd and show "packet: <path>" for a packet that exists.

## Part 3 (added from skills-fable-lane-47-2): the bearings notice keys on the worktree, the receipt on the main checkout

In skills-fable's Orca worktree pane, the SessionStart notice says "Bearings are due". Meanwhile `bearings-state.mjs check --repo .` run from the main checkout says the receipt is current, from 19:58Z, keyed on projectRoot = the main checkout. The notice resolves the project from the worktree path and the receipt from the common dir. This is a different defect class from Parts 1 and 2: a worktree path used as project identity, not an inherited env.

P8: the notice is in hooks/lib/goal-context.mjs (lead grep). Find where it prints "Bearings are due" and how it derives the project root. Make it resolve the root the same way the receipt writer does, through `mainCheckout` or the same helper bearings-state uses, so every worktree of a repository reads the same receipt. Lane 34 made the Done pickup treat worktrees as the main checkout the same way. Add a unit test: a receipt written for the main checkout is found as current from a linked worktree. It must be red on base and green at the fix. If the fix turns out to be more than one resolution change in the notice's own code, stop, leave it, and report it as left with the reason.

## Territory

transport.mjs (P1, P4), the call sites named in P2 (git calls only), scripts/test-home.mjs and skills/multi/scripts/test-child-env.mjs (P3), note-inbox.mjs, note-send.mjs, the bearings notice's project-root resolution (P8 only), and the tests of all of these. docs/census.md gets one line only if a new marker string is printed.

NOT the rest of janitor.mjs, work-record.mjs or decisions-render-core.mjs.

## Rules for the builder

Standard hard rules are in the brief. Give the four bug-fix fields for each part: Cause:, Discriminating check:, Fix location:, Simplification:.
