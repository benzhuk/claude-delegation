VERDICT: OBSERVED

# Lane55 exact-base baseline

Work `wr-2026-09-28-codex-counted` preserved the requested Lane37 historical census without changing integration, records, source, ledger, or native logs.

## Provenance

- Scratch clone: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-counted-55/baseline-main`
- Detached fetched `origin/main`: `72f1dfc1c026c0e410bf6e74d910550e1fe0f843`
- Required base `72f1dfc1c026c0e410bf6e74d910550e1fe0f843` is an ancestor (it is HEAD).
- Census source git blob: `7b5e69b5bd6a3ccce1c652b0ede1352a6b1376b0`; file SHA-256: `E69D665443FCA10367482DACD743F6E5E99C2E5D807A8E519155EAD73E3C0B16`.
- Native lead: `01a0df4c-2809-7520-b1d7-876cc51a87ee`, read at `C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f22a4cc4-fb5a-4af5-aeec-4951188a536a/home/sessions/2026/09/26/rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee.jsonl`. Census metadata verified the selected lead identity. No transcript content was copied.

## One baseline census

Command (run once from the detached clone):

```text
node scripts/build-census.mjs --lead C:\\Users\\benzh\\AppData\\Roaming\\orca\\codex-accounts\\f22a4cc4-fb5a-4af5-aeec-4951188a536a\\home\\sessions\\2026\\09\\26\\rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee.jsonl --from 2026-09-28T19:16:00Z --to 2026-09-28T22:58:55.152Z --ledger-dir C:\\Users\\benzh\\Code\\claude-delegation\\docs\\ledger --lead-slug skills-a --out ...\\L55-lane37-baseline.census.md --json ...\\L55-lane37-baseline.census.json
```

Native exit: `0`.

Outputs: `L55-lane37-baseline.census.md` and `L55-lane37-baseline.census.json` beside this report.

Observed old failure signature: `VERDICT: PARTIAL Codex census (unverified or out-of-contract discovery candidate; effective census window is outside default discovery horizon)`. The census found 35 candidates, 10 exclusions, and 25 subagent files; its canonical discovery horizon is `2026-09-26, 2026-09-27`, while the record window is `2026-09-28T19:16:00Z` through final acceptance `2026-09-28T22:58:55.152Z`.

Optional unsupported field observed separately: `wakeSplit: unavailable (codex lead)`. It is not one of the blanket PARTIAL reasons.

Window note: the caller-supplied record window is retained in `lead.codex.effectiveWindow`; the markdown's observed message window begins at `2026-09-28T21:40:55.604Z` and ends at `2026-09-28T22:58:54.494Z`, because no qualifying lead message was observed earlier/later. No alternate window was chosen.

## Historical input manifest

`L55-input-manifest.json` names the five immutable record paths, artifact identities, first/final accepted Log timestamps, and their existing census/four-read metrics paths.
