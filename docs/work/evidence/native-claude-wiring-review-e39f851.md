# Native Claude review — wiring-check unknown-evidence repair

Reviewed SHA: `e39f851d52242c31eb5b49ac52d0ec8e447c2099`
Artifact: `candidate/scripts/wiring-check.mjs` (recorded blob `f4d773b25803fdfea259c199fd6779846673e1e9`), `candidate/scripts/wiring-check.test.mjs` (recorded blob `127c635be7c0dab412a773a54cef542bfc4f57df`)
Spec: `candidate/docs/specs/2026-09-23-wiring-unknown-evidence.md`
Work: `wr-2026-09-23-native-wiring-review`, authority `authority.md`
Date: 2026-09-23

## Verdict: NEEDS_FIXES

The candidate fixes all four findings from the f57 review. Read/stat failures are now typed. Invalid rows are checked before the merge. The outer fallback is fixed, private, and `unknown`. The broken assertions were updated. But the parent's reproduction is confirmed from the captured code: a `hook_absent` check still reports green (`ok: true`) when the settings file parses as JSON but has the wrong shape. The spec's first goal is "must not report green when it could not inspect a required condition", so this is an uncorrected false green and blocks approval.

## Assessment of the parent reproduction (confirmed counterexample)

Path traced in the captured code for `expected: hook_absent` with a valid `file`/`event`/`substring`:

1. `evalHookPresence` calls `readJsonEvidence` (`wiring-check.mjs:168`). `readJsonEvidence` returns `{kind:"present"}` for **any** value `JSON.parse` accepts (`wiring-check.mjs:63-65`). It also doesn't check that `readFileSync` returned a string. `JSON.parse` turns non-strings into strings first, so a raw `null` or `42` from the fs dependency parses as `null` / `42`.
2. `hookGroupHasSubstring(evidence.value?.hooks, …)` (`wiring-check.mjs:176`) turns every shape it doesn't expect into `false`:
   - `null` → `null?.hooks` is `undefined` → `group` is `undefined`, not an array → `false` (`:155-156`).
   - `42` → `(42)?.hooks` is `undefined` → `false`.
   - `{"hooks":{"Stop":"bad-shape"}}` → `group` is a string, not an array → `false` (`:156`).
   - `{"hooks":{"Stop":[{"hooks":{}}]}}` → `entry.hooks` is not an array, so it is replaced with `[]` (`:158`) → `false`.
3. With `present === false`, `hook_absent` returns `{state:"ok"}` (`wiring-check.mjs:180`), and `ok` is computed as true (`:300`).

All four malformed inputs produce `ok: true`. The legitimate `{}` also produces `ok: true` by the same path, so the checker can't tell "hook configuration is legitimately absent" from "hook configuration is unreadable". This holds whether the reproduction feeds JSON text or raw values through `readFileSync`: raw `null`/`42` are coerced the same way. (A raw *object* would stringify to `"[object Object]"`, fail to parse, and give `unknown`, so the object-shaped cases only reproduce as JSON text. That is the realistic case for a real settings file.)

**Decision:** yes, the malformed shapes must be `unknown`, and legitimate missing configuration must stay a known absence. Reasons:

- The spec says "Do not collapse genuine ENOENT, permission errors, corrupt JSON and unsupported type into one healthy absence." A settings document whose `hooks`/event/group structure isn't the documented shape is corrupt evidence for this check. Being syntactically valid JSON doesn't make it inspectable. The candidate already treats unparseable JSON as `unknown` (`:67`, test `wiring-check.test.mjs:224-225`). Structurally invalid JSON is the same evidence class.
- The builder report says the repair gives "one three-way present/absent/unknown path". The evaluator step breaks that: it merges `unknown` back into `absent`.

Suggested boundary, which keeps legitimate absence green:

| Settings content | `hook_absent` | `hook_present` |
|---|---|---|
| file ENOENT/ENOTDIR | ok | missing |
| `{}` (no `hooks` key) | ok | missing |
| `{"hooks":{}}` (no key for the event) | ok | missing |
| `{"hooks":{"Stop":[]}}` | ok | missing |
| well-formed groups, no matching command | ok | missing |
| `readFileSync` result not a string | **unknown** | **unknown** |
| top-level not a plain object (`null`, number, string, array) | **unknown** | **unknown** |
| `hooks` present but not a plain object | **unknown** | **unknown** |
| `hooks[event]` present but not an array | **unknown** | **unknown** |
| a group that isn't an object, or whose `hooks` isn't an array | **unknown** | **unknown** |
| a hook entry that isn't an object | **unknown** | **unknown** |

Hook entries that are well-formed objects without a string `command` (other hook types) should stay legitimate non-matches, not `unknown`.

## Findings (ordered)

### 1. HIGH — Structurally malformed hook settings are reported as known absence (false green for `hook_absent`)

- References: `candidate/scripts/wiring-check.mjs:61-72` (no check that the text is a string, no shape check on the parsed value), `:154-164` (`hookGroupHasSubstring` turns wrong types into `false`), `:176`, `:180` (`hook_absent` → `ok`).
- Trigger: see the reproduction above. All four malformed inputs → `state:"ok"`, `ok:true`.
- Secondary effect: the same shapes give `missing` for `hook_present` (`:179`). That isn't green, but it misreports an unknown condition as a known missing hook. The spec says the reviewer must tell known missing apart from unknown.
- Test gap: `wiring-check.test.mjs:201-238` only covers syntactically corrupt JSON (`{not-json`). No test covers valid JSON with the wrong shape, so the 41/41 pass can't detect this.
- Fix/check: have `evalHookPresence` (or a shape-aware helper) return a separate "malformed" result that maps to the fixed `unknown` text, and reject non-string `readFileSync` output in `readJsonEvidence`. Add tests for each row of the table above, in both directions, with `{}` / `{"hooks":{}}` / `{"hooks":{"Stop":[]}}` staying `ok`/`missing`.

### 2. MEDIUM — Hook checks with a missing or empty `event`/`substring` get a definite answer, including green

- References: `candidate/scripts/wiring-check.mjs:155`, `:160`, `:177-178`, `:179-180`.
- Trigger (traced from the code):
  - `hook_absent` with no `event` → `hooksSection[undefined]` reads key `"undefined"` → `undefined` → `false` → `ok`.
  - `hook_absent` with no `substring` → `command.includes(undefined)` looks for the text `"undefined"` → normally `false` → `ok`.
  - `hook_present` with `substring: ""` → `includes("")` is always `true` → `ok` whenever the event has any command hook, even though no specific hook was checked.
- The fallback labels `"(unspecified event)"` / `"(unspecified substring)"` (`:177-178`) show the evaluator deliberately goes ahead without required fields.
- Impact: the same false-green class as Finding 1, triggered by a bad check row instead of a bad settings file. The spec treats a selected valid-id row that can't be evaluated (missing/unsupported type) as `unknown`. A row missing its required discriminating fields is the same kind of problem, and right now it either disappears into `ok` or becomes a trivially true `ok`.
- Fix/check: for `hook_present`/`hook_absent`, a missing, non-string or empty `event` or `substring` should give the fixed `unknown`. Add tests for both directions.

### 3. LOW — The `--line` path in `main` can still let an exception escape (pre-existing, not introduced by e39)

- Reference: `candidate/scripts/wiring-check.mjs:355` (`const fsImpl = opts.fsImpl ?? fs;` is outside any `try`), reached from `:377`.
- Trigger: the same kind of dependency failure the candidate's own test uses (`wiring-check.test.mjs:682-705`), but thrown from an `opts.fsImpl` accessor instead of `opts.lists`. `checkWiring(opts)` throws while destructuring and is caught at `:371`. Then `wsOffActive(opts)` reads `opts.fsImpl` again with no catch, and the exception escapes `main`.
- Impact: this breaks the spec's "No exception escapes" rule and the file's own "never fails its caller" comment (`:344-347`). It's only reachable through a hostile or broken options object, and it's older than this patch, so it doesn't block on its own.
- Fix/check: move the `fsImpl` lookup inside the existing `try`, or treat a failure there as "switch present". Add an `--line` variant of the outer-failure test using a throwing `fsImpl` accessor.

### 4. LOW — Test coverage no longer exercises some of the paths the repair relies on

- `wiring-check.test.mjs:339-352` ("a check whose evaluation throws…") now throws from `statSync`, and `statEvidence` absorbs that (`wiring-check.mjs:74-80`). No test in the suite reaches the per-check `catch` at `wiring-check.mjs:286-290` any more, so a regression that drops that catch would go unnoticed.
- `wiring-check.test.mjs:435-439` is titled "a missing or unparseable ~/.agents/required-wiring.json is simply not consulted". It only tests the missing case, and "unparseable → not consulted" contradicts the spec (malformed private input must be `unknown`). There's no suite test for `wiring-default-input` / `wiring-private-input` being `unknown` (`wiring-check.mjs:92-102`, `:267-268`) for malformed, non-array or EACCES lists. The f57 review checked these separately in temporary scripts that aren't part of this commit.
- Fix/check: add a check whose evaluator really throws (for example `env_presence` with `env: null`), and tests for malformed/unreadable default and private lists. Rename or fix the misleading test title.

### Nit — Unreachable branch

- `candidate/scripts/wiring-check.mjs:277-280` (`wiring-invalid-row`) can't be reached: `mergeChecks` already drops every row without a string `id` (`:111`), and invalid rows are now reported at `:269-274`. It's harmless, but the comment at `:276` is about a different case (valid id, bad type). Consider removing it or adding an explicit comment.

## What I checked and found correct

- **Typed read/stat failures:** only ENOENT/ENOTDIR count as absence (`:57-59`). EACCES, other I/O errors, errors without a code, and parse failures all become the fixed `unknown` text for `json_value`, `hook_*`, `file_exists`, `file_absent` and `file_fresh`. `whenMissing:"info"` now only applies to real absence (`:195-199`). `file_absent` under a permission error is `unknown`, not `ok`. A missing `file` field goes to `readFileSync`/`statSync(undefined)`, whose `ERR_INVALID_ARG_TYPE` becomes `unknown`, not absence.
- **Invalid-row handling:** the public and private lists are each checked before the merge and get one fixed ID each (`wiring-default-row`, `wiring-private-row`). Row contents are never echoed, and a valid private override still wins (test `:354-370`). Non-array overrides and malformed list files become fixed `unknown` rows. An explicitly empty list, or one where every row is platform-excluded, still gives `ok:true` and the table says "no applicable checks configured" (`:311-313`).
- **JSON diagnostic privacy:** every `unknown` `why` is a fixed string. No exception message reaches the output: the per-check catch (`:288`), the list loader (`:98-101`) and the outer catch (`:371-374`) all ignore the error. `json_value` only prints values when both are booleans or numbers of the same type (`:146-147`). The protected-ledger check still runs before any fs call, for every letter case.
- **Main-path fallback:** it now produces `ok:false` with an `unknown` row, which `--line` reports (`:327`) unless ws-off is active. Exit code stays 0, usage errors still return 1, and the JSON shape `{ok, results}` and row shape are unchanged.
- **Unsupported/missing type and protected-ledger refusal:** these now give `unknown` (`:237`, `:284`) and block green.

## Residual limitations

- **Continuation binding was not done.** The UserPromptSubmit hook context for this turn gave no continuation epoch or native session ID, so I didn't run `bind`, `status` or `account` with guessed values. The work record binding and accounting are still open.
- I didn't run the test suite or any reproducer. My tool scope was limited to Read, the continuation command family, and Write for this file. Every behaviour above is traced from the captured source, including confirming the parent reproduction. The builder's 41/41 pass is consistent with the 41 `test(` blocks in the captured test file, but I didn't re-run it. Even if it passes, it doesn't cover Findings 1–2.
- I didn't recompute the Git blob IDs. I checked by reading that the captured files match the post-image of `docs/work/evidence/candidate-e39f851.patch`, but I didn't hash them against `f4d773b…` / `127c635…`.
- I didn't review the janitor consumer, `required-wiring.default.json`, `hooks/hooks.json`, or `test-child-env.mjs` beyond how the tests use them. The full sealed integration gate is still owned by the parent.
- Out of scope, mentioned for completeness: `why` strings contain the expanded file paths, which can include the home directory's username. `why`/`fix` values from rows are passed through without forcing them to strings (`:295-296`). A UTF-8 BOM at the start of a settings file now gives `unknown` instead of the old `missing`. That fails closed, but it may be noisy on Windows. None of these is a new defect from this diff.
