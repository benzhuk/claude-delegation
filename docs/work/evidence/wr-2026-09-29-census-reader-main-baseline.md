# Merged-main Windows failure diagnosis

## Finding

The failure is checkout-dependent and already exists on first parent `07671c9ab4d855711e063dc0524dbb914c003c34`. The census-reader merge `4faa110328b9e5f7543e6a48d209a79ef859dc4c` did not change the failing test, the shim planner, or `reclaim.mjs`.

The named test assumes every `PATH shim` action belongs to the four `note-*` commands, so it expects 8 actions on Windows. The planner intentionally adds two more actions, `reclaim.cmd` and extensionless `reclaim`, when run from a durable main checkout. A linked worktree deliberately suppresses those two actions. Thus the candidate worktree reported 8 and passed, while canonical main reported 10 and failed.

## Source identity

`git diff 07671c9ab4d855711e063dc0524dbb914c003c34 4faa110328b9e5f7543e6a48d209a79ef859dc4c` is empty for all three requested paths. Reviewed candidate `4f4edbc4e470e6faa4f9598763dbb4800468bb3e` has the same blobs too:

| Path | Blob at first parent | Blob at merge | Blob at candidate 4f |
|---|---|---|---|
| `skills/multi/scripts/mirror-shim.test.mjs` | `0c15e6f33ab6c155cde5f46a038816b6ee8f4e41` | same | same |
| `scripts/mirror-shared-skills.mjs` | `bcf30cec13d939af7bc8289a061b7aa05b574416` | same | same |
| `scripts/reclaim.mjs` | `8cef8adb8f3b492b3a3f958f382947bd5c39748d` | same | same |

The accepted lane second parent changes census-reader code and evidence. It does not introduce this shim behavior or assertion.

## Direct mechanism

In `skills/multi/scripts/mirror-shim.test.mjs`:

- Lines 174-175 define only four commands: `note-send`, `note-inbox`, `note-flush`, and `note-notify`.
- Lines 182-185 select **all** action strings matching `PATH shim`, then assert there are `4 * 2 = 8` on Windows.
- Lines 186-196 separately check the JSON `plan.shims` and `plan.shimCommands`, whose planner fields intentionally describe only the four `note-*` commands.

In the directly called planner, `scripts/mirror-shared-skills.mjs`:

- Lines 103 and 115-117 create the eight Windows `note-*` shim specs.
- Lines 129-135 create two additional Windows reclaim specs.
- Lines 568-577 append those reclaim specs to the action/source plan only when `isDurablePath(REPO) && !isLinkedWorktree(REPO)`.
- Lines 978-997 define a main checkout as one whose Git dir and common dir resolve to the same path; a Git error fails closed as linked.
- Lines 1275-1276 expose only `SHIM_SPECS` and `SHIM_COMMANDS` in the JSON `shims` and `shimCommands` fields. The broader `actions` array also contains conditional reclaim publishing.

Consequently, the test's first assertion compares a broad action list against the narrower note-only expected count. The assertion is reached only when the checkout makes the conditional reclaim actions visible.

## Focused reproductions

The exact command in each case was:

`node --test --test-name-pattern "R4: Windows plans BOTH shims" skills/multi/scripts/mirror-shim.test.mjs`

No HOME or guard override was supplied. The test itself uses its existing sealed throwaway-home helper.

1. **Canonical merged main — reproduces.**
   - Path: `C:\Users\benzh\Code\claude-delegation`
   - HEAD: `4faa110328b9e5f7543e6a48d209a79ef859dc4c`
   - Git dir: `.git`; common dir: `.git`
   - Exit 1; 1 test, 0 pass, 1 fail.
   - Assertion: expected 8, got 10. The two extra actions target canonical `scripts\reclaim.mjs`.
   - Raw: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\census-reader-40b\merge-failure\merge-canonical-focused.log`

2. **First parent as a synthetic durable main checkout — reproduces.**
   - Source archive: `07671c9ab4d855711e063dc0524dbb914c003c34`
   - Plain-file snapshot: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\census-reader-40b\merge-failure\first-parent-tree`
   - A local empty `.git` directory was initialized only to model main-checkout Git-dir/common-dir identity; no worktree or commit was created.
   - Git dir: `.git`; common dir: `.git`
   - Exit 1; 1 test, 0 pass, 1 fail.
   - Assertion: expected 8, got 10. The two extra actions target the snapshot's `scripts\reclaim.mjs`.
   - Raw: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\census-reader-40b\merge-failure\first-parent-focused.log`

3. **Candidate linked checkout — does not reproduce.**
   - Path: `C:\Users\benzh\orca\workspaces\claude-delegation\census-reader-40b`
   - Current HEAD: `fdb59ca1996c25c615fc59b4dc997abce70000f2`; the requested planner/test/reclaim blobs are byte-identical to candidate `4f4edbc4`, first parent, and merge.
   - Git dir: `C:/Users/benzh/Code/claude-delegation/.git/worktrees/census-reader-40b`
   - Common dir: `C:/Users/benzh/Code/claude-delegation/.git`
   - Exit 0; 1 test, 1 pass, 0 fail.
   - The planner logs `SKIP reclaim shim` for this linked worktree, leaving exactly the eight note-shim actions expected by the test.
   - Raw: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\census-reader-40b\merge-failure\candidate-linked-focused.log`

## Why the candidate full gate passed

The candidate full gate ran in the Orca linked worktree. `isLinkedWorktree(REPO)` returned true because its Git dir differs from its common dir, so `collectSources()` skipped both reclaim specs. Canonical main has `.git` for both values, so it appended the reclaim pair. All relevant source bytes are identical; only checkout classification changed.

Canonical tracked status remained clean. No canonical-main, integration, configuration, user-file, or reclaim-artifact change was made; no full suite, repair, cleanup, or additional worktree was performed.
