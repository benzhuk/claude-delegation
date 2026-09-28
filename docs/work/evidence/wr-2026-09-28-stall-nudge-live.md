VERDICT: PASS 1839481b (lead-run live proof on Netcup, supporting evidence, not the deciding review)

# Lane 30 live proof (skills-n, Netcup)

Proof branch build/stall-proof-1 at 6c1ed16. Its record has Owner skills-n and one Log line copied from a real skills-n event at 2026-09-27T20:31:01Z (the lane 24 pickup). It was pushed, then deleted on origin under the spec's authority (git ls-remote count 0 afterwards).

Hand run of the merged collector (main 1839481) at 2026-09-28T03:41:36Z:
node scripts/collect-status.mjs --repo /home/ben/Code/claude-delegation --to skills-fable --host v2202608391056492408 --stale-hours 2

ASK lines it wrote, from the Netcup repo ledger docs/ledger/2026-09-27.md:
collect-v2202608391056492408 → skills-h, 9.27.26 23:41 NYC [collect-v2202608391056492408-stall-build-fresh-walk-1-475873d-1] ASK: build/fresh-walk-1 has had no Log line for 31.5 h in state reviewed. Reply with the lane state and a new ETA, or BLOCKED. A Log line on the record resets this. Needs: review by 00:11
collect-v2202608391056492408 → skills-n, 9.27.26 23:41 NYC [collect-v2202608391056492408-stall-build-stall-proof-1-6c1ed16-1] ASK: build/stall-proof-1 has had no Log line for 7.2 h in state owned. Reply with the lane state and a new ETA, or BLOCKED. A Log line on the record resets this. Needs: review by 00:11

A second run at 2026-09-28T03:41:46Z sent nothing: 2 stall lines before, 2 after (dedupe per tip).

Surfaced to the owner: yes, on the same host. skills-n's own PostToolUse hook showed the proof ASK in this session mid-turn. The skills-h ASK is a real stall nudge: build/fresh-walk-1 was reviewed, unmerged, 31.5 h silent. Whether a lead on another host sees such an ASK is the known limit. The ASK lands only in the collector host's ledger, which is the follow-up.

Timer unit: ExecStart now ends with --stale-hours 2 (daemon-reload done; the pre-edit copy is kept in the lead's scratch). The unit still runs the installed 0.20.15 collect-status.mjs, so the timer sends no ASK until a release carrying 1839481 is installed. Until then only the attention threshold changes, to 2 h. A reinstall regenerates the unit without the flag: the follow-up is to pass --stale-hours through the installer.
