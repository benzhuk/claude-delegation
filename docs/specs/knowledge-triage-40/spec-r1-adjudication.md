# Root adjudication of Opus spec round1

September29 2026 America/New_York. Review-run exited0 with a valid NEEDS_FIXES(11) at0a759de, session9352a523-6bed-42c0-8faf-e31ca286f9c4, resolved model claude-opus-5-5. Report and identity sidecar are retained unchanged. No peer review ASK is needed for exit0. All eleven problem statements are accepted; the corrections below replace the corresponding rev4 clauses. This revision is NOT approved, and implementation remains blocked on the separately refused probe.

## F1: content duplicates and managed residue

Deduplicate original bytes by full SHA256 across local and all remote pending/previously processed notes. Minimal staging metadata retains every origin alias for a content hash, never replaces one source name with another. One canonical local note is selected for identical content. All matching remote origins become reconcilable when that canonical disposition is verifiably published. Capture local original hashes before the skill changes status frontmatter; do not hash modified archived notes as if they were originals. This is the stage/provenance metadata, not a new database or cross-host sync mechanism.

Treat names present in the read-only chezmoi source inbox listing conservatively as `managed` residue: do not select, import or move those names on origin. Record counts/names and flag possible source resurrection; no unverified claim that Git tracks them. The reviewer's attempt to confirm tracked paths was itself denied and must not be retried. Source removals are outside this lane and require a separate disposition. Do not change the existing installation decision item merely to smuggle in source removal authority; include the concrete residue in the eventual live result.

Tests: identical local/remote bytes get one digest decision with all origins accounted; source-managed names stay untouched and named. Same-name changed bytes are separate versions. A source still present with a matching archive is `resurrected`, not successful deletion or an overwritten archive.

## F2: explicit capped selection

The job computes an exact list of at most60 canonical eligible filenames. Age is original basename date prefix when valid, otherwise original mtime; deterministic filename tie-break. Host-prefixed imports preserve original mtime with utimes. `notesIn` means selected notes; also report union eligible count separately. The prompt limits triage to this list, overriding the skill's general whole-inbox rule under this task's explicit cap. Probe with extra unselected notes and verify only selected notes are archived. Snapshot before/after archives; any out-of-list archive becomes `outOfSelection` in last-run.json, status attention, no origin reconciliation. This is a checked behavioral limit, not a claim that prompt text mechanically prevents an action before it occurs.

## F3: publication and per-note eligibility

HEAD movement alone is insufficient. Require a commit touching the actual source path for DIGEST since dotfilesBefore when DIGEST changed, a fresh read-only remote-ref match to HEAD rather than a potentially stale tracking ref, and the committed DIGEST containing each canonical imported name eligible for reconciliation. Resolve the exact source path read-only through existing chezmoi; no publishing from the job. Persist only verified publication identity in stage metadata. Older locally archived imports can be reconciled after a later successful verification covering their digest names. Missing archive, missing digest entry, failed secret check, failed publication or unrelated HEAD movement cannot authorize an origin move.

Any verification failure records ATTENTION and one outer BLOCKED to Ben. Never clear state automatically. Recovery text must name the actual problem; the two retained lock commands are conditional on an inspected stale curated lock and must not instruct deletion of a nonexistent or actively owned lock. Subsequent runs skip while ATTENTION remains.

## F4: overlap and lock deferral

Check the curated lock before gather and immediately before nested spawn, never take or clear it. An exit0 nested run leaving selected notes pending with no digest change is `skill deferred`, not successful processing, and counts toward consecutive deferral escalation. Hold a job-local exclusive mkdir run.lock through gather/nested/reconcile/receipt writes; record pid/start. A live owner yields `job already running`; stale or unverifiable ownership yields attention and no auto-removal. The job releases only its own run lock on normal exit with an ownership token check. A killed job leaves evidence. This shares the existing mkdir locking primitive; no new lock service.

## F5: remote commands and deterministic archive path

Use fixed `/bin/sh` programs over SSH, with note data on stdin, never interpolated into a shell command. Reject NUL, newline and path separators in source basenames. Parse hash/month/name without executing or expanding the name. The hash utility is sha256sum, otherwise shasum -a256. The target month is the local archive's month, not retry time. Hash-check the still-present regular source, create only the archive directory, refuse existing mismatched destination, move without overwriting, then confirm source absence and matching destination. Missing source is success only with matching destination evidence. Source+matching destination is resurrected residue. Changed source or symlink is an unresolved item. A remote concurrent writer can still change after a hash check; recheck the moved destination and surface a mismatch without claiming archived success. Never destroy or overwrite data to repair it.

## F6: bounded tar and atomic imports

One tar stream per host, POSIX pax format, COPYFILE_DISABLE=1, top-level regular non-dot markdown files unchanged for at least5minutes. Enumerate filenames without shell evaluation; newline basenames are unsupported named residue. Node validation accepts regular type0/NUL plus per-file pax x records with path/mtime only. Strip one conventional leading `./` before validating the top-level name. Reject absolute/traversal/nested/link/device/global-pax entries. Skip/count dot and AppleDouble metadata. Bounds:1MiB per note,64MiB per stream,1000 entries; validate lengths/checksums/pax records and fail the host explicitly on malformed/truncated input. No extraction before validation.

Stage content under gather/<host>/<fullSHA256>.md with metadata preserving all original names. Import filename begins with host slug and a hash, uses a bounded safe encoding, handles Windows reserved names/ADS/invalid characters and collisions explicitly. Write a dot-prefixed temporary inbox file, finish/close it, then hard-link to the final path exclusively and unlink only the owned temporary name. Existing final bytes must hash-match or yield conflict. Unsupported atomic-link behavior fails explicitly, never falls back to partial final-file writes. Tests cover half-written files, collisions, case-only origins, hostile pax entries, resource bounds and cross-month retry.

## F7: SSH isolation and honest alias discovery

SSH argv is fixed: -T, BatchMode=yes, StrictHostKeyChecking=yes, ConnectTimeout=15, ForwardAgent=no, ForwardX11=no, ClearAllForwardings=yes, PermitLocalCommand=no, RemoteCommand=none, RequestTTY=no. Parent supplies only PATH/SystemRoot/USERPROFILE/HOME/TEMP/TMP and existing SSH_AUTH_SOCK as needed for local authentication, never arbitrary env or API keys. No agent forwarding, configuration modification or endpoint discovery network scan.

Mac alias is currently UNKNOWN because the configured-file metadata read was denied. Do not run ssh-G or another read as a workaround. `no ssh alias` is reserved for a successfully read config with no applicable existing alias; current outcome is `alias discovery denied`. An existing alias supplied through an authorized route can be validated later. Tests exercise absent and denied separately.

After confirmed origin reconciliation, remove only the owned staged byte copy; keep hash/name/mtime/disposition identity needed for dedup and audit. Pending reconciliation retains bytes. Local skill archives remain readable. No live raw inbox or staged remote content is committed to this repository or dotfiles.

## F8: task installation mechanics

Even disabled task installation waits for Ben's tick. Triage XML uses Enabled=false and StartBoundary from `--first-run YYYY-MM-DD`, default today; other jobs remain byte-identical. Under the tick, register disabled, query/verify, then enable with schtasks Change. After-Oct4 choice means2026-10-05 first-run date and must apply to the daily trigger before enabling; no later manual wake is required. Tests inspect generated XML and injected commands without any real task mutation. No installation occurs during this blocked preparation.

## F9: unresolved probe blocker

Accept the isolation concern and extra assertions (resolved model, exact list, real guard evidence and explicit manual-proof authority). Reject the proposed blanket copy of live configuration/hooks as an automatic next step: probe-report.md records an actual active identity-guard refusal, and the intake says to stop, not copy an allowlist/config or change HOME to retry. A deliberately denied hook test also needs an explicit bounded test interpretation before execution under that rule. No retry is authorized in this turn.

The candidate scratch HOME redirects the store/source correctly, but baseline Git commit fails because its identity allowlist is absent. No nested session ran. All five required nested proofs remain unproven. The concrete stopped fixture and invocation are retained for the spec owner's ruling; do not manufacture an approved flag set or start the builder.

## F10: concrete test seams

contracts.d.ts now pins command-prefix seams, hostname, test-only endpoints, noteSend, dotfilesRepo and chezmoiSourceInbox. Fake SSH is a real Node child via `[process.execPath, fakeSshPath]`; POSIX PATH smoke is optional. No shell:true or Windows cmd shim. The fixture exercises argv/stdin/timeouts and real child lifetime. Installer/count test signatures reuse current helper seams after authorized source inspection is resolved.

## F11: prepared amendment

The exact sentence prepared for BOTH locations after the tick is: "A run started by the knowledge-triage job installed under Ben's decision of <tick date> is Ben asking, for at most 60 notes per run, gathered from all hosts."

The placeholder is filled from the actual owner decision, never today's date by assumption. No live text amendment yet. All changes above need one fresh Opus delta after the probe blocker is resolved; do not spend another review on a known unproven gate.
