VERDICT: APPROVE — narrow pickup off-switch change and continuation/delivery contract at the hashes below.

Independent Astra review, September 23, 2026 (America/New_York). Read the current integration diff and surrounding pickup, CLI and project-config paths. No source edits, provider calls, live hooks, external communication, installed changes or full suite. Performed one independent pure injected-filesystem adverse-path probe (12 cases), plus scoped git diff --check. No blockers or required fixes.

Reviewed SHA-256:
- skills/decisions/scripts/decisions-pickup.mjs: B958361DBA9951E0FF17E4645CF0AE705F7E9E1216F0860B62FCEFEEFA9A889F
- skills/decisions/scripts/decisions-pickup.test.mjs: B0DBBF7BE582F7947003F69F4148336CCAFBC043A28EB65C691D2C7CA3775340
- docs/specs/2026-09-23-continuation-delivery-contract.md: EA6B4D058EB25D6E3D889A8FAA0F2FBE952FBC2C3D2A309B4ECB635779C9E357

Pickup guard

pickupOnce resolves the effective agents home and checks the master and feature switches before registeredProject, receiptPaths, acquireClaim, durable transport resolution or page reading. Every fresh/recovery/send branch is downstream of this admission point, so an already-present switch also prevents recovery from creating receipts or sending a prepared note. Disabled returns a small status result; it does not fabricate an existing receipt state.

The helper's stat-error semantics match the existing project-config switchedOff contract: successful stat means present, ENOENT/ENOTDIR mean absent, all other ordinary Error cases mean disabled. Keeping the tiny injected-fs helper local preserves testability without changing the shared configuration API. No feature-wide refactor is warranted for this fix.

Independent adverse checks

Imported pickupOnce and supplied a filesystem proxy with no backing real filesystem operations. For each of ws-off and ws-off-decisions tested:
1. successful stat (present);
2. EACCES;
3. EIO;
4. ELOOP;
5. Error with no code.

All ten cases returned DISABLED. The proxy asserted exact switch stat order, master short-circuiting, zero other filesystem calls, and zero page-reader/send/git/transport-inspection/transition callbacks. Two additional ENOENT and ENOTDIR cases correctly reached an intentional project-resolution trap, proving absent switches do not suppress the normal path. Total 12/12 passed; no fixture I/O, network or actual transport execution.

The added repository test covers both real switch files under its disposable fixture, deliberately invalid project input, zero reader/send calls, no receipt/claim/private capture and available status inspection. It was inspected here; I did not rerun the repository test file. Scoped git diff --check passed. These checks do not replace the integration owner's applicable test gate.

Boundaries are appropriate

- status and explicit account are unchanged. The selected fix disables --once pickup; it does not claim that ws-off prevents every manual bookkeeping operation.
- The switch is checked at entry, not continuously during an already-running asynchronous page read. This is admission control for the one-shot command, not cancellation of an in-flight attempt. No stronger claim appears in the reviewed diff.
- Ordinary CLI argument validation still happens before pickupOnce. Invalid arguments may error before the disabled response, but they perform no page/project/transport action.
- No scheduler, authority expansion, owner rebinding or new state is introduced.

Continuation/delivery contract

Approved as a plan with explicit evidence limits. It says the previous instruction correction did not close runtime enforcement; distinguishes native Stop veto from a queued post-completion turn; requires actual running-host child/lead evidence before enforcement; protects explicit stop and finite requests; treats malformed/missing work evidence as unknown; and names added turns/usage as measures rather than claiming zero-cost automatic behavior.

It correctly states that cursor movement is deduplication evidence, not proof the intended owner handled an ASK, and leaves the historical consumer unattributed. Its queue defect and historical-note observations are investigation findings supplied by the lead/other lane; this review does not independently re-prove those incidents or the Windows resolver. Its Linux delivery statement is expressly historical and does not imply Windows or child-isolation proof.

The text “Repeated unchanged events ... should cost no model turn” is a desired design condition, not a claim that the current implementation achieves it. Likewise its proposed mechanical accounting boundary and acceptance scenarios are future work, not native runtime parity. No extra-automatic-turn overclaim found.

Optional durability improvement, not an approval condition: preserve the adverse stat-error/fs-spy cases in a focused repository regression if this helper changes again. The independent probe has already closed the current review uncertainty.

