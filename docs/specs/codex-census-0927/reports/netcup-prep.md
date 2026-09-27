VERDICT: PASS

# Netcup pre-gate receipt

Read-only reachability to `ben@100.69.249.18` through `bash -lc` succeeded on 2026-09-27. The runner has Node `v24.18.1`. Its shared source checkout `/home/ben/Code/claude-delegation` is detached at `c25cc70cb180f22fc2f5ddb40a47be501cde9245` and contains unrelated untracked ledger/note files plus `hooks/multi-hook-core.mjs.bak-noparking`; it was not changed.

`origin/main` on that checkout resolves to the same `c25cc70cb180f22fc2f5ddb40a47be501cde9245` release baseline. `origin/build/codex-census-1` is not fetched there yet, and no dedicated Codex-census worktree exists. Before the authorized Linux suite, create or reuse a separate clean worktree from an explicit `git fetch origin build/codex-census-1` result; never switch, clean, or use the shared dirty checkout.

No full suite was run in this preparatory step. The known baseline is the pinned release SHA only; its green status must be evidenced by the later candidate-branch Linux gate, captured with raw stdout, stderr, exit code, start/end timestamps, tested SHA, and fetched origin ref under `docs/work/evidence/` before main.
