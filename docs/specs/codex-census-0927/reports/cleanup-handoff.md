# Cleanup handoff — Codex census and Astra worktrees

_Assessed 2026-09-27 10:10 America/New_York. Read-only assessment from `gudgeon`._

## Scope and method

This handoff covers only the five `astra-*` worktrees, `codex-census-1`, its `-c1` and `-c3` children, and `codex-census-1-final-main-merge`.

The repository janitor at `codex-census-1/scripts/janitor.mjs` was invoked from this root twice, once normally and once with `--no-fetch`, both with `--json`. Neither bounded invocation completed with a report (the script scans every registered repository worktree); no `--apply`, `--record`, worktree removal, or branch removal was used. The classification below therefore applies the janitor's conservative criteria only to the named scope, using a fresh local `origin/main` observation at `2adcc30` (10:07 America/New_York), Git cleanliness/submodule checks, and read-only Orca worktree/terminal state.

## SAFE

None. No named worktree is suitable for mechanical cleanup in this pass.

## JUDGMENT — retain

| Worktree | Git evidence | Orca evidence | Reason to retain |
| --- | --- | --- | --- |
| `astra-archive-contract` | Clean; not an ancestor of fresh `origin/main`; no submodules | Inactive, 0 live terminals; card remains in progress | Unmerged work needs an owner decision. |
| `astra-archive-reader` | Clean; not an ancestor of fresh `origin/main`; no submodules | Inactive, 0 live terminals; card remains in progress | Unmerged work needs an owner decision. |
| `astra-pickup-contract` | Clean; not an ancestor of fresh `origin/main`; no submodules | Inactive, 0 live terminals; card remains in progress | Unmerged work needs an owner decision. |
| `astra-pickup-integration` | Clean; not an ancestor of fresh `origin/main`; no submodules | Inactive, 0 live terminals; card remains in progress | Unmerged work needs an owner decision. |
| `astra-private-capture` | Clean; not an ancestor of fresh `origin/main`; no submodules | Inactive, 0 live terminals; card remains in progress | Unmerged work needs an owner decision. |
| `codex-census-1` | Ancestor of fresh `origin/main`; 4 untracked entries | Inactive, 0 live terminals; card is in review | Dirty worktree. Preserve the handoff artifact. |
| `codex-census-1-c1` | Ancestor of fresh `origin/main`; 12 untracked entries | Inactive, 0 live terminals; card is todo | Dirty worktree. Preserve its artifacts. |
| `codex-census-1-c3` | Ancestor of fresh `origin/main`; 8 untracked entries | Inactive, 0 live terminals; card remains in progress | Dirty worktree. Preserve its artifacts. |
| `codex-census-1-final-main-merge` | Ancestor of fresh `origin/main`; 2 tracked and 2 untracked entries | Active with 1 live terminal; card is completed | Current final-merge checkout and terminal; retain until its owner closes it. |

The Astra worktrees have no live terminal according to the local Orca host, but a clean Git status is not proof that their work is disposable. Their in-progress cards and unmerged branches keep them in JUDGMENT.

## Retained names

`astra-archive-contract`, `astra-archive-reader`, `astra-pickup-contract`, `astra-pickup-integration`, `astra-private-capture`, `codex-census-1`, `codex-census-1-c1`, `codex-census-1-c3`, and `codex-census-1-final-main-merge`.

No cleanup action has been taken or requested by this handoff.
