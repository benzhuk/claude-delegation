VERDICT: PASS
SHA: 135537f7f36f47eca9a5b0abbf954472dff84514

Cause: Optional Claude-source skills (`knowledge`, `triage`, `learn`) were silently excluded whenever `isSkillDir()` returned false, leaving a successful JSON plan unable to explain the omission.

Discriminating check: `node --test skills/multi/scripts/mirror-shim.test.mjs` exited 0: 21 tests passed, 0 failed, duration 2169.9112 ms. New sealed-home cases assert absent sources, a source directory without `SKILL.md`, a wrong-type source, nonfatal `ok:true`/empty refusals, no dry-run destination writes, and selection of a valid optional source. `git diff --check` exited 0 before commit.

Fix location: `scripts/mirror-shared-skills.mjs` now inspects optional inputs with `statSync` and appends a nonfatal existing-`actions` diagnostic. ENOENT/ENOTDIR distinguish missing source or missing `SKILL.md`; wrong types are named; other errors retain their filesystem error code. `skills/multi/scripts/mirror-shim.test.mjs` covers the observable CLI behavior in its existing isolated child environment.

Simplification: The JSON shape, `collectSources()` return type, manifest, managed entries, destination inspection, and refusal policy remain unchanged. Diagnostics describe only why this run did not source an optional input; they make no claim about installed capability.
