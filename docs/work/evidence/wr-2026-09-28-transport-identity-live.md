VERDICT: PASS 216d56bc1bb27233c3771e0779a2884fde6dd0c7 (lead-run live proof, supporting evidence, not the deciding review)

# Lane 44 live proof: decisions-pickup status under a foreign GIT_DIR

Run by the lead on Netcup on 2026-09-28, around 17:50 NY. `<X>` is a fresh scratch repo made with git init under the lane scratch dir (other-repo-s4fL). Each run was `decisions-pickup.mjs status --page 3e1da11277a18174bccfea187d5c3972 --repo /home/ben/Code/wt-ws-mainbase`, where the repo is a clean claude-delegation checkout on main. The receipt shows round 4 ACCOUNTED.

| run | code | GIT_DIR | top-level status |
|---|---|---|---|
| base | main df7ba47, without the fix | `<X>/.git` | PENDING_MANUAL_HANDOFF |
| fix | 216d56b | `<X>/.git` | ACCOUNTED |
| control | main df7ba47 | unset | ACCOUNTED |

How to read it: without the fix, the inherited GIT_DIR made the transport git runner resolve the scratch repo's identity. The pickup then took the registered page to be another project's and reported a manual handoff. With the fix, the runner resolves claude-delegation from its cwd, and the status matches the control. The raw outputs are proof-base.json and proof-fix.json in the lane scratch dir.
