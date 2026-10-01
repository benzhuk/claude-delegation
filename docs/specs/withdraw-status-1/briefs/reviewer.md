Task: Independently review territory W1's `withdrawn` status, `work-record.mjs
withdraw` command, and exclusion fixes against docs/specs/withdraw-status-1/spec.md and
contracts.md — read-only, adversarial. Spawn only after W1's own gate
(docs/specs/withdraw-status-1/reports/W1-gate.log) is green; read W1's report first
(docs/specs/withdraw-status-1/reports/W1-report.md), then its diff, never the other way.
Goal: confirm the fix actually closes the false "rejected awaiting a fix round" signal
for a record nobody will fix, without weakening what a real `rejected` or `accepted`
record means, and without a withdrawn record ever reappearing where it shouldn't.
Work: wr-2026-09-26-withdraw-status (docs/work/wr-2026-09-26-withdraw-status.record.md
— read-only for you too; only the lead writes it).

Inputs (by path):
- docs/specs/withdraw-status-1/spec.md
- docs/specs/withdraw-status-1/contracts.md (R1-R4, R6 — this file wins over spec.md on
  any disagreement)
- docs/specs/withdraw-status-1/briefs/scout-W1.md (the territory's own file/line survey;
  use it to check whether W1 actually addressed the open question it raised about
  `hooks/multi-codex-hook.mjs`, and whether it left `docs/census.md`'s collector-state
  enumeration alone deliberately or by omission)
- docs/specs/withdraw-status-1/briefs/W1.md (the mandate W1 built against)
- docs/specs/withdraw-status-1/reports/W1-report.md and W1-gate.log

PROJECT FACTS: pure Node, `node --test <files>`, no build step. Every test-fixture child
process goes through `childEnv()`, never bare `process.env`. Header-line shape is
`/^[ \t*+-]{0,20}<Label>:\**[ \t]{0,20}(.+)$/mi` everywhere in this file format. Never
set a git identity; never push; no trailers.

NOT (out of scope, stated explicitly):
- Do not edit any file. Findings only, with file:line and a ready-to-apply patch
  (exact old -> exact new) for anything mechanical.
- Do not touch `docs/work/` or run the dogfood withdrawal yourself — that is the lead's
  step (R5), after your APPROVE.
- Do not re-run the full repo suite — that is the integrator's gate, once, not yours.

Evidence format: verdict `APPROVE`/`NEEDS_FIXES` as the literal first line. Every finding
carries severity, file:line or a measured count, and a concrete fix. Quote the exact
before/after text for anything you claim is wrong in a Log line or Status line — never
paraphrase a header-line shape.

Attack brief (spec.md's own Acceptance section — try every one of these against the
actual code, not the spec's description of it):
1. Withdraw an ALREADY-ACCEPTED record — must refuse (contracts.md R2: "never from
   accepted").
2. Withdraw the SAME record twice — the second call must refuse ("already withdrawn").
3. `--superseded-by` naming a record that does not exist on disk — must refuse, and
   check it resolves against the record's own docs/work directory (R2), not cwd or an
   absolute path elsewhere.
4. Make a withdrawn record reappear in ANY list `hooks/backlog-notice.js` prints
   (runnable-unowned, delivered-unreviewed, rejected-awaiting-fix-round) or any state
   `scripts/collect-from-origin.mjs` reports (must be its own terminal state or omitted,
   never `owned` or `rejected` — contracts.md R3's exact wording) — construct a fixture
   record with `Status: withdrawn` and feed it through both, don't just read the source.
5. Construct a Log line for the withdraw event that would break `scripts/four-read.mjs`'s
   parse (find the exact assumption four-read.test.mjs makes about Log-line shape/count
   and try to violate it with a withdraw-shaped line).
6. Confirm the four allowed source statuses (rejected, blocked, runnable, owned) each
   transition cleanly, and confirm every OTHER status (delivered, reviewed, accepted,
   and a bogus/unknown status string) is refused with a clear message and the file left
   byte-for-byte unchanged (R2's "leave the file unchanged" on every refusal path, not
   just the ones spec.md item 2 names explicitly).
7. `STATUSES`'s own test (scout-W1.md's finding: `work-record.test.mjs:207`, currently
   asserting "seven values") — confirm it was updated to eight and still passes; a
   forgotten update here is a false-green gate on the very fact the whole build turns on.
8. Docs (R4): confirm every status list the scout's grep and your own re-grep for
   "rejected" in docs/ and skills/ turns up either already lists withdrawn or has a
   documented reason it doesn't need to (a collector-state enumeration doc like
   docs/census.md is the likely miss).

Termination: report to docs/specs/withdraw-status-1/reports/reviewer-report.md, first
line `VERDICT: <word>`, then stop.
