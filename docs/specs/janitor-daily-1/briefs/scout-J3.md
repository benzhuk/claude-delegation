# Scout — J3 (one paragraph in the release/install procedure)

## Files and symbols
- No single dedicated "release runner's checklist" doc exists in `docs/`. Candidates
  actually present, confirmed by reading them:
  - `README.md` `## Install (mirror for Codex)` section (README.md:225-233) — the closest
    thing to an install runbook: names `node scripts/mirror-shared-skills.mjs` as the
    one-shot publish step, describes what it publishes, no per-host verification step
    listed today.
  - `docs/GOALS.md` line 92 — the four-host-install goal's `Status: PARTIAL` line, which
    literally already contains the sentence this same spec's Why section quotes:
    "Wiring check cannot go red; pane-setup.md describes a setup Ben does not run." This
    is a measure/status line, not a step-by-step procedure — adding a sentence here
    documents the new capability's use, but doesn't read like "the release runner's
    checklist."
  - `docs/census.md` — a measures/definitions doc (confirmed: has a `## ...release
    commit...` mention at line 256 in a different context, counting `accepted` log
    entries), not an install runbook either.
- No file matched `release procedure`, `release checklist`, or `four-host` as a
  step-by-step doc; the four-host install has so far been done by hand and narrated in
  `docs/work/evidence/*` reports and README changelog entries, not from a checklist doc.

## Helpers to reuse
- None — this territory is prose-only, no code, no test.

## Tests that police this area
- None found; no test parses README.md or GOALS.md prose for structure. Nothing
  mechanically enforces this paragraph's presence or wording.

## Open questions for the spec
- The spec says "the release procedure (whatever doc describes installing a release on
  the four hosts, if any; else skills/team-build or the plugin README's install
  section)" — scout confirms there is no dedicated release-procedure doc, so this
  territory's target is README.md's `## Install (mirror for Codex)` section (README.md:
  225-233) by the spec's own fallback clause. Recommend that section unless the lead
  names a different one.
- Should the new line ALSO update `docs/GOALS.md`:92's `Status: PARTIAL` prose (which
  currently states "Wiring check cannot go red" as a fact) once J2 makes that untrue? The
  spec's J3 charge is narrower — "gains one line" in the release/install doc — and
  GOALS.md status changes are gated ("Status changes only in a release commit, with
  evidence" per GOALS.md's own header). Flagging so the lead can rule whether touching
  GOALS.md's status text is in or out of scope for this lane (the territory map doesn't
  list it).
