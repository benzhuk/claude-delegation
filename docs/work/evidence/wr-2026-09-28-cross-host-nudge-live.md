VERDICT: PASS 4cb22f16383e5ccb6d17b5e2e64d8c05a9cb900d (lead-run live delivery proof, supporting evidence, not the deciding review)

# Lane 43 live proof: a stall ASK from Netcup lands on the owner's host

Harness: scratch proof.mjs (lane scratch dir) runs collect-status.mjs at 4cb22f16383e5ccb6d17b5e2e64d8c05a9cb900d against a scratch clone whose .agents/project.json maps skills-h to zhuk-vps32, with --stale-hours 0.1, so its one stale fixture lane produces one stall ASK to skills-h. Review r2's H1 patch was applied first (live mode, a one-send guard); the dry-run output was unchanged apart from the new exitCode line.

Live run on Netcup, 2026-09-28T20:33:23Z (4:33 PM NY): note-send exitCode 0, mirrorLedger {"host":"zhuk-vps32","ok":true}, id collect-proof-host-stall-build-proof-cross-host-1-d7d73c1-1.

Read back on Hetzner over ssh (ben@100.111.119.54), grep -c of the id in ~/.agents/notes/2026-09-28.md: 1. The line:

    collect-proof-host → skills-h, 9.28.26 16:33 NYC [collect-proof-host-stall-build-proof-cross-host-1-d7d73c1-1] ASK: build/proof-cross-host-1 has had no Log line for 5.0 h in state owned. Reply with the lane state and a new ETA, or BLOCKED. A Log line on the record resets this. Needs: review by 17:03

skills-h was told in FYI skills-n-lane-43-proof-1 (sent on Hetzner) that the ASK is this proof and needs no action.
