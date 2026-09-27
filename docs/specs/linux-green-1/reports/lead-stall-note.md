# Lead note: round 1 builder stalled before reporting

The round 1 builder committed ffc882f ("fix: mainCheckout composes with path.posix on Linux, V4 polices
symlink publish") on build/linux-green-1-L1, ran the red check, and then stalled on a permission prompt for
`rm -rf` of a scratchpad folder (never run a gated command such as rm in an unattended build; scratchpad
files need no deletion). It never wrote its report.

Findings for this round (no reviewer has seen ffc882f yet):
1. Verify ffc882f against the brief and contracts.md R2-R3 hunk by hunk; fix anything that does not meet
   them, including the new H6 test that must pass on both platforms without a platform branch.
2. Run the territory gate and write the report the brief asks for, with the bug-fix fields Cause,
   Discriminating check, Fix location and Simplification.
3. Never run rm, rm -rf or git clean. Leave scratch files where they are.
