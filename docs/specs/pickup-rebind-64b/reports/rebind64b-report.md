VERDICT: PASS

Territory rebind64b, branch build/pickup-rebind-64b-rebind64b, base b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516, one commit 196fb620a9ee026803818f4fed4ddaabb0cae74b (feat(decisions): pickup rebind verb ...). Nothing outside the four territory files was touched. No live action, no notion.js, no real ~/.agents state.

## Gate
`node --test` on the four gate files, log at reports/rebind64b-gate.log: exit 0, tests 183, pass 183, fail 0.

## Files changed (worktree wt-pickup-rebind-64b-rebind64b)
- skills/decisions/scripts/decisions-pickup.mjs: `rebind` export at :1576, helpers `pathAbsent` :1529, `rebindArgv` :1539, `rebindCaptureState` :1549; parseArgs list :1641, usage message :1653, `--from-project` required :1660, runCli dispatch :1675.
- skills/decisions/scripts/decisions-pickup.test.mjs: helpers from :1898 (`movedRepo`, `treeBytes`, `writeExtraCapture`), eleven tests prefixed `rebind 64b:` at :1941-2123.
- skills/decisions/SKILL.md:254-257: one paragraph after the "global to the registered page" paragraph, naming the verb, the live-path refusal, and that new rounds use the new project's scope while the old round keeps its saved one. No existing line re-wrapped, no line starts with `**`.
- skills/decisions/scripts/skill-text.test.mjs:115-117: one pin for the literal `decisions-pickup.mjs rebind --page <id> --repo <new project root> --from-project <old path> [--owner <lead>]`.

## What rebind does (decisions-pickup.mjs:1576-1637)
Under acquireClaim (released in finally): newProject = registeredProject(--repo); read receipt (missing, v1 legacy, or unreadable refuses); refuse unless canonicalPathKey(receipt.project) equals the canonicalised --from-project AND lstat shows the old path absent; transportRepo = durableTransportRepo(newProject); classify every saved capture (the two the receipt names via verifyOnePrivateCapture against the OLD receipt, falling back to the NEW identity for crash resume; every other `r<N>[-changed-<digest>].json` under captures/<projectScope>/ by page, projectScope, project, transportRepo, sha256(bytes) === digest); verifyPointer on the receipt rewritten in memory; only then write captures (atomicJson, only those still at the old identity) and the receipt last. Receipt rewrite: project, transportRepo, exactSendInputs.argv values after --recipient-repo and --sender-repo; `--owner` different from receipt.owner sets handoffStatus/requestedOwner/handoffObservedAt as at base :1148-1158; receipt.owner, projectScope, refs, detailsPath, noteId untouched. Output: JSON of receiptStatus plus `rebound: {from, to}`, exit 0.

## Evidence: the fixture, before and after
Fixture = the buildWedge stuck round (NEEDS_RECONCILIATION round 1, owner skills-a, handoff marker to ben) in a sealed home, repo directory renamed to .../fixtures/moved-pickup (old path absent), pointers kept. Strings from a scratch run of the same shape (path prefix `C:\Users\benzh\AppData\Local\Temp\sealed-home-JfAlTH\fixtures\`):
- Before, `status --repo moved`: status PENDING_MANUAL_HANDOFF, reason "this page is bound to a different authorization project"; receipt.project = receipt.transportRepo = `...\pickup-lDe2TA`; receipt.state NEEDS_RECONCILIATION; evidenceIntegrity POINTER_INVALID (pointer looked up at the dead path).
- Old path recreated: error "the old project path still exists; a live project is never taken over".
- After `rebind`: status NEEDS_RECONCILIATION, no reason; project = transportRepo = `...\moved-pickup`; state NEEDS_RECONCILIATION; evidenceIntegrity OK; rebound.from `...\pickup-lDe2TA`, rebound.to `...\moved-pickup`.
- Second `rebind`: error "the saved project binding is not --from-project", nothing written.

## The four named tests, at the base sha
Command for each: `node scripts/prefix-test.mjs --base b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516 --test skills/decisions/scripts/decisions-pickup.test.mjs --repo .` run in the worktree: exit 0, "reproduces at base b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516 and passes at the fix revision". The tool works per file, so all four share that one exit code. Per test, at a git-archive export of the base with this test file copied in (scratch), `--test-name-pattern "rebind 64b"`: 11 fail, 0 pass, every failure "TypeError: pickupModule.rebind is not a function" (a missing export, which the brief counts as failing). On the branch all 11 pass.
1. moved repo to status OK: `rebind 64b: a moved repo is refused before and bound and intact after, the saved scope and owner kept` (decisions-pickup.test.mjs:1941); the `--owner` variant is `rebind 64b: a different --owner leaves receipt.owner ...` (:1979).
2. existing old path refused: `rebind 64b: an existing old path is refused, every file byte-identical, and a live second project still gets the old refusal` (:2007).
3. tampered capture refused: `rebind 64b: a tampered saved capture is refused, receipt and captures byte-identical` (:2037); also tampered earlier round :2054, missing pointer :2067.
4. second rebind: `rebind 64b: a second rebind is a clean refusal that changes nothing` (:2089).
Also: crash resume :2098, CLI via child process and runCli :2123, `--from-project` mismatch :2028, missing and v1 receipt :2075. Existing "different authorization project" tests (:833-896) are untouched and green.

## Rulings needed (narrow readings taken; alternative not taken)
1. States: any v2 receipt state is rebound (no state changes, no send); v1 refuses. Not taken: refuse CAPTURE_INTENT/PREPARED/SENDING. I did not park because rebind writes no state and the argv rewrite makes a later PREPARED send go to the new repo; the lead may prefer to refuse in-flight states.
2. exactSendInputs.argv: both repo-flag values rewritten; id, topic, text, details, kind, needs untouched; proven in the first test. Not taken: leave argv alone.
3. Captures: the two named plus every `r<N>[-changed-<64hex>].json` under captures/<projectScope>/; extras verified by page, projectScope, project/transportRepo (old or new) and digest, not by round, owner or from; an unparseable or non-matching extra refuses. Not taken: rewrite only the two named. File names that do not match the capture pattern (including crashed `.tmp-` files) are ignored.
4. Order and crash: validate everything, captures, then receipt last; a capture at the new identity is skipped, at the old identity verified and rewritten, anything else refuses. A failed receipt write leaves its `.tmp-` file beside the receipt (atomicJson behaviour, unchanged). After success a second rebind refuses (project no longer --from-project). Not taken: a no-op success on the second run.
5. Pointer: refuse with no write if the pointer is not exact under the new transportRepo ("the details pointer is not present under the new transport repository (MISSING)"). Not taken: write it after the fact.
6. Output: receiptStatus JSON plus `rebound: {from, to}`, exit 0, as briefed.
7. Extra: `--owner` equal to receipt.owner sets no marker; a different one always sets the marker, in any state.

## Deviations and notes
- A guard hook (secret-guard.sh) refused one Bash heredoc with "SECRET-GUARD: blocked — command sources a secret file." though the command touched no secret; later heredocs also failed to parse in the Bash tool. I did not retry them that way: source and test edits went through the Edit and Write tools, and the test block was appended with `cat >>` from a scratch file. Report and state files were written with the Write tool.
- Scratch is left in place under the session scratchpad (base export under scratchpad/base, strings.mjs, rebind-tests.mjs, prefix1.log) for the lead's closeout; the scratch strings script renamed (not deleted) one directory aside inside a sealed home. The prefix-test tool added and removed its own temp worktree.
- Not mine: the live rebind on page 3e1da11277a18174bccfea187d5c3972, the registrations.json repoint, full suites on Netcup and Hetzner, push and accept.
