VERDICT: PASS
SHA: 135537f7f36f47eca9a5b0abbf954472dff84514

Cause: Optional Claude-source skills (`knowledge`, `triage`, `learn`) were silently excluded whenever `isSkillDir()` returned false, leaving a successful JSON plan unable to explain the omission.

Discriminating check: `node --test skills/multi/scripts/mirror-shim.test.mjs` exited 0: 21 tests passed, 0 failed, duration 2169.9112 ms. New sealed-home cases assert absent sources, a source directory without `SKILL.md`, a wrong-type source, nonfatal `ok:true`/empty refusals, no dry-run destination writes, and selection of a valid optional source. `git diff --check` exited 0 before commit.

Fix location: `scripts/mirror-shared-skills.mjs` now inspects optional inputs with `statSync` and appends a nonfatal existing-`actions` diagnostic. ENOENT/ENOTDIR distinguish missing source or missing `SKILL.md`; wrong types are named; other errors retain their filesystem error code. `skills/multi/scripts/mirror-shim.test.mjs` covers the observable CLI behavior in its existing isolated child environment.

Simplification: The JSON shape, `collectSources()` return type, manifest, managed entries, destination inspection, and refusal policy remain unchanged. Diagnostics describe only why this run did not source an optional input; they make no claim about installed capability.

Follow-up cross-platform correction
SHA: 1f65ca3ac26c723433bce738c7c197f5866a449d
The usable optional-source assertion now expects the existing platform publish verb (`copy` on Windows, `symlink` elsewhere) while retaining the `.agents/skills/learn` selection check. `node --test skills/multi/scripts/mirror-shim.test.mjs` exited 0: 21 passed, 0 failed, duration 2125.4108 ms; `git diff --check` exited 0. Commit contains only `skills/multi/scripts/mirror-shim.test.mjs`.

Native-review repair
SHA: 6f87277dafe31038f7b087d410ab8c6e8d72c8c9
Cause: `say()` prepended `would ` to a factual optional-source inspection line in dry-run mode.
Discriminating check: the sealed empty-home test now requires the exact `optional source skill not sourced: <name> (source missing)` action, which fails with the former prefix. A controlled `SKILL.md` directory fixture requires the exact wrong-file-type action.
Fix location: the existing `NO_OP` expression recognizes `optional source`, keeping diagnostics factual in normal and dry-run output.
Simplification: no new channel, API, manifest state, or filesystem seam; the pre-existing actions path remains the only diagnostic route.
Validation: `node --test skills/multi/scripts/mirror-shim.test.mjs` exited 0 with 22 pass / 0 fail (2151.0291 ms); `git diff --check` exited 0. Commit includes only the two owned files.
