# Independent test-author seam ruling

After implementation dispatch, independent T2 identified that the existing command-prefix seams covered SSH/Claude but not read-only Git/chezmoi verification, and the contract did not name the parent watchdog seam needed by its own deterministic tests. A fixture must not need scratch Git commits or sixty-minute sleeps to exercise those boundaries.

Root authorizes additive test-only dependency keys in contracts.d.ts: gitCommand, chezmoiCommand, nestedTimeoutMs, hostTimeoutMs, and timers.setTimeout/clearTimeout. They follow the already approved command-prefix pattern. Defaults remain real installed commands, sixty minutes for nested triage, sixty seconds per host, and real global timers. CLI exposes none of these seams. No endpoint, permission or timeout override becomes a production CLI flag.

Injected command fixtures must be real Node child processes and assert argv/stdin and commanded operations. Their outputs model committed-DIGEST and fresh-remote cases without claiming an actual Git publication proof. Actual Git/chezmoi publication remains G1. Functional tests control only the parent watchdog; real-clock tests retain real child/grandchild lifetime checks with loose bounds. Do not invent elapsed-time success from mocked clocks.

This is a bounded testability completion of F10, not a new publication rule. Root supplies the identical revised contract to both owners now. The final independent code review must inspect the defaults, CLI exclusion, actual fixture assertions and the real-process deadline proof, alongside the rest of the implementation. Prior spec approval6fa1b4d is retained as its exact historical scope; it is not relabeled as approval of this later contract delta.
