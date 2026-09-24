VERDICT: NEEDS_FIXES f57b2ec4f408ca28d1cd9b5e86631d21030b34d5

Independent review against22a31e2 wiring-unknown spec and five-case prep. September23,2026 America/New_York. Only wiring-check.mjs/.test reviewed; no repository edits or live configuration reads.

Finding1 — required evidence still false-green
Severity/location: HIGH, evalFileFresh/evalFileExistence/evalJsonValue/evalHookPresence and their existing existsSync/readJsonSafe helpers.
Trigger/evidence: file_fresh existsSync true + statSync EACCES returns info and oktrue. file_absent existsSync false on inaccessible target returns ok and oktrue without consulting the injected statSync EACCES. Present corrupt JSON returns missing rather than unknown. Saved independent results C:/Users/benzh/AppData/Local/Temp/wiring-review-7XWhm3/summary.json, cases statDenied/absenceDenied/corruptJson.
Impact: main repair remains incomplete: genuine unknown filesystem evidence is presented as healthy or known absence; whenMissing:info can also wrongly hide inaccessible evidence. Changes to outer evaluation catch cannot see errors swallowed by existing helpers.
Fix/check: preserve read/stat error outcomes through evaluation; only ENOENT/ENOTDIR establish absence. Permission/I/O/stat/JSON parse failures yield fixed unknown. Add discriminating known-absence versus EACCES tests for absence/freshness/JSON/hook checks, including whenMissing:info.

Finding2 — invalid list rows silently disappear
Severity/location: HIGH, mergeChecks filtering before checkWiring's new invalid-row branch.
Trigger/evidence: public list [null,{type:file_exists,file:~/missing}] with private[] returns {ok:true,results:[]}; the new validation branch never sees rows mergeChecks already dropped. Independent invalidRows case in saved summary.
Impact: malformed required checks disappear and report green/no applicable scope, violating fixed input-level uncertainty requirement.
Fix/check: validate original list rows before merging or return validation evidence alongside merge. Retain a bounded fixed-id unknown without echoing invalid row data, while preserving valid private override order and intentional explicit empty/platform-excluded lists. Test invalid rows mixed with valid rows and wholly invalid lists.

Finding3 — outer fallback still leaks private error content
Severity/location: MEDIUM, main catch branch.
Trigger/evidence: checkWiring invocation failure (independent injected options accessor throwing Error SECRET_SENTINEL) is rendered in --json as state info, why could not run: SECRET_SENTINEL. Saved outerError case. This probes the explicit unexpected-failure fallback rather than pretending such an accessor comes from JSON.
Impact: last-resort diagnostic violates no-raw-error contract; --line excludes info and can remain silent despite okfalse. The per-check catch was sanitized but outer catch was not.
Fix/check: fixed bounded unknown fallback with no error content and a --line finding when off switch permits. Test both JSON and line modes against a deterministic thrown outer dependency.

Finding4 — submitted focused suite fails
Severity/location: MEDIUM, wiring-check.test.mjs assertions at unknown-type, thrown-evaluation, missing-type, protected-ledger and case-variant tests.
Trigger/evidence: independent node scripts/run-tests.mjs scripts/wiring-check.test.mjs ->38total,33passed,5failed,0skipped; sealed-home-WHYrHf. Titles changed to unknown but assertions still expect info. Protected tests fail before completing access assertions. Builder statement that validation completed is not a passing gate.
Impact: candidate cannot pass required focused integration gate and currently lacks regressions for findings1–3.
Fix/check: update actual expected state/wording/assertions and add meaningful adversity, then rerun focused suite. Do not merely rename tests or suppress assertions.

Positive independently checked behavior
Temporary reproducer wiring-unknown-positive-independent.mjs verifies protected mixed-case INBOXES.JSON returns unknown with zero read/stat/exists calls; optional private ENOENT is normal and EACCES is fixed private-input unknown; explicit empty and valid all-platform-excluded scope remain ok/no findings; unknown emits one line; unreadable off switch silences line. Temporary wiring-unknown-independent.mjs confirms expected boolean against actual secret string now returns stale without secret text. Intentional switch/env and genuine missing whenMissing:info behavior remains intact in existing passing tests. Per-check exceptions and unsupported types now map to unknown as intended.

Artifacts
C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/wiring-unknown-independent.mjs
C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/wiring-unknown-positive-independent.mjs
C:/Users/benzh/AppData/Local/Temp/wiring-review-7XWhm3/summary.json

Janitor directly renders returned id/state/why rows, so no demonstrated janitor source change is required. Full sealed gate remains parent-owned after fixes. No source repair, configuration activation, installation or broad research performed.

Exact failing test names
- an unknown check type is unknown and prevents green
- a check whose evaluation throws is unknown, private, and not a crash
- a check with NO type field is unknown and never silently dropped
- a private-list entry naming inboxes.json is refused before any fs call, whatever type it claims
- a check naming inboxes.json in ANY letter case is refused before any fs call, and nothing is read out of it

The builder report's validation claim is rejected as passing evidence: the exact candidate's focused suite exits1 with these5 failures. Repair the first broken reader/validation/fallback boundaries, then use assertions to verify their semantics; changing expectation text alone does not repair the reproduced false-green cases.
