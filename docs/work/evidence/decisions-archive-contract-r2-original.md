VERDICT: READY

Work: wr-2026-09-24-decisions-archive independent unbalanced-details contract delta.

Test-only commit: 7c4f3681b128e037b1a810fc8732309a91a8e5f3
Changed path: skills/decisions/scripts/decisions-archive.contract.test.mjs only.

The contract adds a parser and real-pickup boundary for an unclosed <details> under canonical # Closed and a stray </details>. Each contains a historical optionless title and a later active optionless title. Both must remain shapeless. With Done false, real pickup must return INVALID, make zero sends, and create no receipt artifacts; the contract intentionally introduces no BLIND rule.

Pre-fix expected-red baseline, retained: under C:/Users/benzh/AppData/Local/Temp/claude-verify.lock, node --test skills/decisions/scripts/decisions-archive.contract.test.mjs exited 1: 9 tests, 8 pass, 1 fail, 333.0689 ms. The new test observed parseDocument [] instead of [Historical optionless, Active optionless], proving the unbalanced-details suppression defect.

Qualification source: a35f417db9bb5dd56f9738f4f4aaf374a04b69cf, cherry-picked solely into this isolated test worktree as cfc6575dc7a5100c47e0ae7cbee8b299d09b3d12. Exact sealed focused rerun under the same mutex exited 0: 9 tests, 9 pass, 0 fail, 327.5258 ms. This confirms the balanced-structure archive exemption against both adverse inputs.

Static gates: node --check exit 0; git diff --check exit 0. No full suite, live page, registration, or external effects were run.