VERDICT: BLOCKED

## Acceptance shape

The current record parses with `errors: ["unknown label: Scratch"]`; `validateRecord()` alone returns no findings, which is why it is not the acceptance test. `checkAcceptance()` immediately calls `requireStrictRecordShape()`, which rejects any parser error before status, evidence, artifact, or census checks. Thus `Scratch:` is an actual current acceptance block, not merely a continuation-helper limitation.

`origin/main` at `357fc15d5d2daaf47a9655246a16b852210f0117` contains no `Scratch` support in `scripts/work-record.mjs` or `docs/work-record.md`. The verified installed mirror is delegation `0.20.17` and likewise has no `Scratch` parser support. The compatible existing-record representation is to preserve the exact one `Scratch: C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37` line immediately after the first header/body blank, rather than in the header: `parseRecord()` and `requireStrictRecordShape()` inspect only header lines, while `requireObservedBody()` permits body content before the existing later `Observed:` paragraph. This is a record-format change for root to make when otherwise ready; it neither drops metadata nor changes parser/source. No acceptance or check-acceptance command was run.

The requested scratch-fixture verification was denied before execution with `CreateProcess ... rejected: blocked by policy`; it was not retried through another tool or shell. The compatibility conclusion above is source-derived from the current parser and acceptance checks.

## Final census commands (do not run before the final review)

The native lead command, with `<ACCEPT_AT>` replaced by the one shared acceptance timestamp, is:

```powershell
node scripts/build-census.mjs --lead "C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f22a4cc4-fb5a-4af5-aeec-4951188a536a/home/sessions/2026/09/26/rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee.jsonl" --from "2026-09-28T19:16:00Z" --to "<ACCEPT_AT>" --out "docs/work/evidence/wr-2026-09-28-codex-parity.census.md" --json "docs/work/evidence/wr-2026-09-28-codex-parity.census.json"
```

The Claude spec-slice command is:

```powershell
node scripts/build-census.mjs --lead "C:/Users/benzh/.claude/projects/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl" --from "2026-09-28T19:03:14Z" --to "2026-09-28T19:16:00Z" --out "docs/work/evidence/wr-2026-09-28-codex-parity.spec-census.md" --json "docs/work/evidence/wr-2026-09-28-codex-parity.spec-census.json"
```

After both reports exist, the four-read command is:

```powershell
node scripts/four-read.mjs --record "docs/work/wr-2026-09-28-codex-parity.record.md" --census "docs/work/evidence/wr-2026-09-28-codex-parity.census.json" --spec-census "docs/work/evidence/wr-2026-09-28-codex-parity.spec-census.json" --ledger "docs/ledger" --git "." --branch "<DELIVERY_REF>" --lead-session "01a0df4c-2809-7520-b1d7-876cc51a87ee" --lead-slug "skills-a" --accept-at "<ACCEPT_AT>" --out "docs/work/evidence/wr-2026-09-28-codex-parity.four-read.md" --json "docs/work/evidence/wr-2026-09-28-codex-parity.four-read.json"
```

Use the same `<ACCEPT_AT>` in `work-record.mjs accept --at`; it must not precede the final reviewed log. Confirm the lead slug from the ledger before use; `skills-a` is the record owner and planned value, not a substitute for that verification.

Source verification: both parsers require a path argument after `--json` and after `--out`; they write JSON and Markdown to those paths, so no output redirection is needed. `--tasks` also requires a directory, never a single file. It may be repeated; for a Codex lead it scans JSONL candidates from each supplied directory under the native horizon/ancestry checks below.

## Native horizon constraint

The native lead's session metadata date is 2026-09-26, so the implementation's two-day discovery horizon is 2026-09-26 and 2026-09-27 UTC. The requested build window begins 2026-09-28, outside that horizon; it will report native coverage partial (and may reject the empty `--from` window), so it cannot provide a counted final native census for this record as written. This is a second acceptance-measure block independent of `Scratch:`.

Current `--tasks` source code accepts explicit JSONL directories for a Codex lead, but every candidate still must be in those two UTC days, have verified `thread_spawn` ancestry to the lead root, and be depth at most three; candidates outside the horizon are excluded and make coverage partial. Do not use `--tasks` to add the external Claude reviewer: it is not a native Codex descendant and belongs only in the separate Claude/spec measurement.

The partial native report is still evidence, but its `VERDICT: PARTIAL` header cannot be passed to `accept --census`, which requires `VERDICT: COUNTED`. Once every non-census acceptance condition is satisfied, the documented visible route is `--no-census` with the precise horizon reason, while retaining the generated partial report in Evidence; for example:

```powershell
node scripts/work-record.mjs accept --record "docs/work/wr-2026-09-28-codex-parity.record.md" --repo "." --pinned-artifact "<DELIVERY_SHA>" --no-census "Native Codex census is PARTIAL because the 2026-09-28 build window is outside the lead session's 2026-09-26/2026-09-27 discovery horizon; see docs/work/evidence/wr-2026-09-28-codex-parity.census.md" --four-read "docs/work/evidence/wr-2026-09-28-codex-parity.four-read.json" --at "<ACCEPT_AT>"
```
