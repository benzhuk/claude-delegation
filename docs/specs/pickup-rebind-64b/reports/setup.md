VERDICT: PASS

Setup for lane 64b (pickup rebind). One territory, id rebind64b.

Worktree: `git worktree add C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-pickup-rebind-64b-rebind64b -b build/pickup-rebind-64b-rebind64b b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516` succeeded ("HEAD is now at b52e3fae docs: open lane 64b ..."). Branch checked out, working tree clean.
`git -C <worktree> rev-parse HEAD` output, verbatim: b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516

Files written (all under C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/briefs/, untracked, nothing committed):
- scout-rebind64b.md (30 lines)
- rebind64b.md (builder mandate, mandate-template shape, no bug-fix block: this is a new verb)
- reviewer.md, integrator.md, seam.md

Scout findings that change the builder's job (all in scout-rebind64b.md):
- The spec investigation's line numbers drifted against base (parseArgs 1527, runCli 1550, settleRound 1406, marker write 1148-1158, receipt.project refusals 966/997/1288/1416/1511).
- Binding the investigation missed: `receipt.exactSendInputs.argv` carries the old transportRepo twice (--recipient-repo, --sender-repo) and a PREPARED receipt sends it verbatim (dispatchPrepared:930). Also captures of earlier rounds under the saved scope carry the old project. Pointers carry no path and need the same-named file under the new main checkout.
- Six open questions the tree cannot settle (receipt states, argv rewrite, earlier-round captures, crash order/resume, missing pointer, output shape). The builder brief prescribes a narrow reading for each and requires them listed under "Rulings needed".

Not run: no tests (setup only). No identity change, no destructive git, nothing pushed, no peer notes, nothing against real ~/.agents state or the page.
