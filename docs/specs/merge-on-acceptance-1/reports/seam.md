VERDICT: APPROVE f3ec5333b9e91847fc86be4c4f7f98e9ea951a26

APPROVE

# Seam review, round 1: merge-on-acceptance-1 (M1 x M2, registered decisions-page pickup)

Integration worktree: /home/ben/Code/wt-moa, branch build/merge-on-acceptance-1, HEAD
f3ec5333b9e91847fc86be4c4f7f98e9ea951a26 (checked with `git rev-parse HEAD`). Diff read: `git diff 71e4c65 HEAD`
(M1: 3078f1b, e5d10f5; M2: 202ad60, 8ada6f2; merged at 4e43538, f3ec533).

Seam findings: 0 blockers, 0 majors, 0 minors. There is one non-blocking note (N1). It extends an observation
M2's own reviewer already made, so it goes to the orchestrator.

Tests run to confirm the integrated tree at HEAD:
`node --test skills/multi/scripts/note-flush.test.mjs skills/decisions/scripts/skill-text.test.mjs scripts/work-record.test.mjs`
gave 274 pass, 0 fail.

## 1. Kill-switch names match (verified, no defect)

- M1 side: skills/decisions/SKILL.md:155 and :160 are existing text that this build did not edit. They name
  `AGENTS_HOME/ws-off` and `ws-off-decisions`. M1's new prose (:97-100, :218-227) introduces no switch name.
- M2 side: skills/multi/scripts/note-flush.mjs:323-324 builds the literals `'ws-off'` and
  `'ws-off-decisions'` under `path.resolve(home, '.agents')`. skills/multi/SKILL.md:134 says
  `ws-off`/`ws-off-decisions`.
- The mechanism itself uses the same strings: runPostFlushPickup at note-flush.mjs:1207-1208, and
  decisions-pickup.mjs:99-100.
- Typo hunt: I grepped skills/ and docs/ for `ws-off-decision` not followed by `s`, and for `ws_off` and
  `wsoff`. The only hit is the seam brief's own example. The registration path segment
  `ws/decisions-pickup/registrations.json` is the same in all three places: note-flush.mjs:329,
  decisions-pickup.mjs:585, and multi SKILL.md:131.
- `AGENTS_HOME` in M1's prose versus `~/.agents` in M2's doc: the status helper resolves `home/.agents`, as
  runPostFlushPickup does (:1203-1205). A different `AGENTS_HOME` produces PICKUP_CONFIG_INVALID there, so the
  status line follows the mechanism's real base. The two sides do not contradict each other.

## 2. "Not registered on this host" is consistent (verified, no defect)

- M2 (multi SKILL.md:129-132) calls it "pickup was never opted into on this machine, which is the normal state
  on most hosts".
- M1 and existing decisions text (SKILL.md:127, :134-141) say "On one explicitly chosen pickup host … may opt
  in … never … create it merely because the plugin is installed".
- The two agree. Registration is opt-in and single-host, and an unregistered host is the default rather than
  an error. Nothing in M1's new text implies that registration is automatic. M2's `configured, awaiting first
  pickup pass` state (a registration file with no annotation yet) is also consistent with decisions
  SKILL.md:143-150, which says the `flush-last.json` pickup code is diagnostic evidence only.

## 3. The pickup-host sentence is consistent with redteam section 2 (verified, no defect)

- skills/decisions/SKILL.md:224-227: "The pickup host is the host where the owner lead's inbox lives —
  `note-send` delivers only on the recipient's own host, so registering pickup on the wrong host silently
  dead-letters the wake (not checked)."
- redteam.md section 2 reaches its conclusion from this same premise: note-send delivers only on the
  recipient's host, and a Netcup registration naming skills-fable dead-letters. That is why the host is
  Windows, where skills-fable runs. M1 keeps the reasoning (the premise and the failure mode) and leaves out
  the project-specific instance.
- That is the right split. decisions SKILL.md is a plugin skill that ships to every project, so naming
  "Windows / skills-fable" there would be wrong for other installs. The instance for this project is
  recorded in redteam.md section 2, contracts.md R1 ("writing registrations.json on Windows with
  owner: skills-fable"), and the by-hand item for Ben.
- Anyone applying the SKILL.md rule to this project gets Windows: find where the owner lead's inbox lives.
  So the rule does protect against a later re-registration on the wrong host.
- This matches M2's line too. On a wrong host, pickup still annotates PICKUP_RECORDED, because the ASK is
  queued before it dead-letters. The status line would therefore look healthy, which is exactly the
  "silently" M1 describes. The two sides agree.

## 4. The Done-window rules do not conflate with the status line (verified absence)

- M1's R5 rule 2 (decisions SKILL.md:221-223) and the write paragraph (:77-86) both gate on "its own fresh
  read shows Done already checked", which means a `notion.js read` of the page.
- None of M1's five files mention `note-flush --status`, `pickup:`, or `flush-last.json` as input to a write
  decision. I checked with a grep for `--status|PICKUP_|note-flush|pickup` across team-build SKILL.md,
  decisions SKILL.md, decision-item.md, census.md, and pane-setup.md. The only hits are existing text:
  decisions SKILL.md:146 ("`--status` … never run registered pickup") and :147-150 (the annotation is
  "diagnostic evidence only"). Both push against the conflation.
- M2's multi SKILL.md paragraph (:129-134) says nothing about Done or about writing the page.
- Neither side tells a lane lead to use the status line in place of a fresh page read.

## 5. The dogfood is self-consistent (plausibility check, no defect)

- The Closed entry `Merged <branch> at <sha>, <M-D>: <one-line changelog>; suite <n> of <n> on <host>.`
  needs nothing that exists only after the rule has been applied:
  - The merge commit sha and the push exist before the entry is posted (team-build SKILL.md:268-271).
  - The suite count comes from the second-host gate log. R4 and team-build SKILL.md:256-261 require that log
    in the record's evidence before `accept`. It is produced by pushing the integration branch, which is
    allowed before accept, so the rule has no circular dependency.
  - The Opus verdicts, including this seam report, exist before accept.
- For this build, registered pickup is not active on any host yet (the Windows registration is Ben's by-hand
  step). No round can be open, so Done-window rule 2 reduces to "fresh read; Done is presumably unchecked;
  write".

## Note (non-blocking; deferred to the orchestrator)

### N1. The status line's annotation-first order hides "not registered" and the switch name once any annotation exists

- Where:
  - skills/multi/scripts/note-flush.mjs:316-321: the annotation is checked first, and buildHeartbeat
    :256 and :1138-1141 carry it forward on every pass indefinitely.
  - multi SKILL.md:130-134: the text describes `not registered on this host` as "no `registrations.json`"
    and `disabled (<switch>)` as "when `ws-off`/`ws-off-decisions` is present".
- The seam angle: M1's new host sentence (decisions SKILL.md:224-227) invites a reader who registered on the
  wrong host to remove that registration. M1's existing switch prose (:155) invites the reader to set
  `ws-off-decisions`. On a host with any earlier annotation, M2's line reports neither of these changes.
- I confirmed this on scratch homes outside the tree, importing buildFlushStatus from HEAD. The heartbeat
  carried a PICKUP_RECORDED annotation 3 days old, and there was no registrations.json:
  - with `ws-off-decisions` present, the line was `; pickup: PICKUP_RECORDED 259200s`
  - with no switch, the line was `; pickup: PICKUP_RECORDED 259200s`
- A registered host with a switch shows `PICKUP_DISABLED <age>` after its next pass, not
  `disabled (<switch>)`. It still reads as disabled, but the switch is not named.
- Why this is a note and not a finding:
  - contracts.md R1 orders the annotation first.
  - M2-review-1.md:143-145 already records the stale-annotation behavior and accepts it, since the growing
    age shows the annotation is out of date.
  - No blocker follows from it.
- Optional doc-only fix (M2 territory, multi SKILL.md, after ":134"): add one sentence such as "A past pickup
  annotation is carried forward and wins over both, so after deregistering or setting a switch, read its age:
  a growing age means no pass has run pickup since." Predicted outcome: the doc stops overclaiming, and no
  code or test changes.

## Scope notes

- I did not run the full sealed suite or the second-host suite, and did not touch any registrations.json.
- I wrote no file other than this report. The scratch probe lived in the session scratchpad.
