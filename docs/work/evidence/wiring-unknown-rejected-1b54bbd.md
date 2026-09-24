VERDICT: NEEDS_FIXES 1b54bbd1639fd11b8783c8f7b13803c2a180c6c0

Independent final narrow source review, September23,2026 America/New_York. No repository edits or broad native work. All original f57b2ec findings are repaired; one selected-handler false-green remains.

Finding (four fields)
1. Severity/location: MEDIUM, scripts/wiring-check.mjs inspectHookGroup inner handler loop. It validates that h is an object but treats malformed declared command handlers as known nonmatches.
2. Trigger/evidence: hook_absent over selected Stop with hooks:[{type:"command",command:42}] returns state ok/oktrue; hooks:[{type:"command"}] does too. A valid prompt handler also returns ok, as intended. Independent reproducible artifact: C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/wiring-selected-command-repro.mjs; preserved output wiring-selected-command-repro.json in the same directory.
3. Impact: malformed selected hook evidence is still collapsed into healthy absence. The repaired root/event/group container checks do not cover the command value actually inspected. This is the same unknown-evidence class, not a requirement to fully validate every provider hook schema.
4. Fix/check: narrowly reject declared type command when command is not a string, and a present nonstring command field if it is used as command evidence; preserve legitimate noncommand handler absence. Add command missing/null/number versus valid prompt cases, then rerun focused and original independent probes. Do not expand into general host configuration validation.

Original boundary repairs independently verified
- readJsonEvidence/statEvidence distinguish ENOENT/ENOTDIR from access/I/O/parse errors. Original invalidRows/statDenied/absenceDenied/corruptJson/outerError probes now all produce unknown/okfalse and no SECRET_SENTINEL. Saved rerun C:/Users/benzh/AppData/Local/Temp/wiring-review-lwZQTQ/summary.json.
- List invalidity creates bounded input rows before its evidence can disappear in merging. Explicit empty override and valid all-platform-excluded scope remain no-applicable checks.
- Expected bool versus actual secret string remains stale without leaking actual value. Main fallback now fixed unknown; ordinary per-check errors also sanitized.
- Independent positive probe confirms optional private missing is normal, denied private input unknown, mixed-case protected INBOXES.JSON produces unknown with zero read/stat/exists calls, one bounded unknown line, and unreadable off-switch line silence.
- Selected root null/scalar/array, hooks map malformed, event-not-array and group/handlers malformed now unknown. Valid empty/unrelated root, absent event, empty arrays and valid noncommand are known absence. Remaining finding is specifically malformed command evidence within an otherwise valid selected container.

Gate receipt
Independently executed node scripts/run-tests.mjs scripts/wiring-check.test.mjs: exit0,42passed,0failed,0skipped; sealed-home-0hJQH4. Earlier original repro scripts both ran successfully, with results inspected rather than treating their exit0 as assertions. Independent positive script uses actual assertions. No full suite/native matrix repeated.

Docs seam
The seven-line docs/subagent-contract.md instruction at42a8a8ca4705185b4f4472857e46e030e22f239b is accurate: retain process identity, actual completion/exit/counts/output, and capture LASTEXITCODE immediately after native PowerShell commands. StrictMode alone does not enforce native exit status. No documentation finding.

Janitor remains a row consumer; no demonstrated consumer changes required. All prior negative reports/artifacts preserved. The final source candidate needs the narrow handler repair before approval.
