# wedge64 state

## Territory
Worktree C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-decisions-wedge-64-wedge64, branch build/decisions-wedge-64-wedge64, base 0d9cdeb539a6f23e7974cdea589fb0d3b127f2f9.
Files: skills/decisions/scripts/{decisions-pickup,decisions-render-publish,decisions-render}.mjs, their tests, registered-pickup.contract.test.mjs, skill-text.test.mjs, skills/decisions/SKILL.md.

## Contracts I rely on
- spec.md (no contracts.md). Scope items 1-4; item 5 is the lead's.
- Existing: registered-pickup.contract.test.mjs:181 stays green (pickupOnce owner-change handoff unchanged).

## Done
- Item 1: publish --clear-done accounts via closeRound before the page write (decisions-render-publish.mjs, decisions-pickup.mjs closeRound/settleRound).
- Item 2: stuck round admitted when all owner inputs (original + reconciliation capture) are quoted in any origin/main history day; publish reader returns it tagged reconciling.
- Item 3: `--owner` on account and publish --clear-done; attestation = running lead; receipt.owner untouched; accountedBy recorded; handoff marker cleared on accounting.
- Item 4: regression tests in decisions-pickup.test.mjs ("wedge 9/30 ..."), prefix-test exit 0 at base 0d9cdeb5; 8 publish unit tests; 2 skill-text pins.
- Gate green: 170/170 after fix round 3 (F6, F7), log reports/wedge64-gate.log. Final commit 535f5140470416d55ee72aea287af15392bde047.
- Report: reports/wedge64-report.md (VERDICT: PASS, rulings A-F listed).

## Next
Nothing for the builder. Lead: item 5 needs ruling D first (project rebind after the repo move; real receipt binds the pre-move path), host registrations.json repair, then `publish --clear-done --owner <lead>` on the real page; full suites on Netcup and Hetzner.

## Open questions
Ruling D (rebind). Ruling A taken: --owner mandatory when publish accounts. Day floor on history (reviewer F2 alternative) is the lead's call.

## How to run my gate
From the worktree: node --test skills/decisions/scripts/decisions-pickup.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs skills/decisions/scripts/registered-pickup.contract.test.mjs skills/decisions/scripts/skill-text.test.mjs
Prefix proof: node scripts/prefix-test.mjs --base 0d9cdeb539a6f23e7974cdea589fb0d3b127f2f9 --test skills/decisions/scripts/decisions-pickup.test.mjs --repo .

## Fix round 2 (F8, F9) done at 894453fc2e8a493e719fc07e7b4fa5e50d01b79f
Gate 171/171. Nothing pending for the builder.
