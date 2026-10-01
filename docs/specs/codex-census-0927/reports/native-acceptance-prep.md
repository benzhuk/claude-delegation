# Native acceptance census prep

Status: PREP ONLY, 2026-09-27 America/New_York. No census, four-read, gate, record edit, or commit was run.

## Bounded transcript evidence

- Native lead is accessible at `C:\Users\benzh\AppData\Roaming\orca\codex-accounts\f22a4cc4-fb5a-4af5-aeec-4951188a536a\home\sessions\2026\09\26\rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee.jsonl`.
- Its first record is `session_meta`, with `id=session_id=01a0df4c-2809-7520-b1d7-876cc51a87ee`, `thread_source=user`, and `model_provider=openai`.
- The C1 candidate's fixed canonical Codex home is that same account home; the CLI takes `--lead`, `--from`, `--to`, `--out`, and `--json` (not `--codex-home`).
- Claude spec transcript is accessible at `C:\Users\benzh\.claude\projects\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl`.
- Its first record is metadata-only `last-prompt`, with matching `sessionId=9c61c35a-82dd-4aef-8eca-c99bb0e72e31`; no transcript content was read.
- Accessibility and matching initial metadata establish input paths only. A future spec census may still report unavailable/partial; this prep does not infer a token value.

## Candidate command shape after integration

Use C1 source `d73ef36` and C3 source `7d50ab0` only after their approved integration. Set `$acceptAt` once to the actual fixed acceptance ISO instant, and use that same value in every command below.

```powershell
$acceptAt = '<future-fixed-accept-at-ISO>'
$lead = 'C:\Users\benzh\AppData\Roaming\orca\codex-accounts\f22a4cc4-fb5a-4af5-aeec-4951188a536a\home\sessions\2026\09\26\rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee.jsonl'
$spec = 'C:\Users\benzh\.claude\projects\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl'
node scripts/build-census.mjs --lead $lead --from 2026-09-27T11:17:00Z --to $acceptAt --out docs/work/evidence/wr-2026-09-27-codex-census-census.md --json docs/work/evidence/wr-2026-09-27-codex-census-census.json
node scripts/build-census.mjs --lead $spec --from 2026-09-27T11:05:00Z --to 2026-09-27T11:17:00Z --out docs/work/evidence/wr-2026-09-27-codex-census-spec-census.md --json docs/work/evidence/wr-2026-09-27-codex-census-spec-census.json
node scripts/four-read.mjs --record docs/work/wr-2026-09-27-codex-census.record.md --census docs/work/evidence/wr-2026-09-27-codex-census-census.json --spec-census docs/work/evidence/wr-2026-09-27-codex-census-spec-census.json --ledger C:\Users\benzh\Code\claude-delegation\docs\ledger --git . --branch '<integrated-delivery-ref>' --lead-session 01a0df4c-2809-7520-b1d7-876cc51a87ee --lead-slug skills-a --accept-at $acceptAt --out docs/work/evidence/wr-2026-09-27-codex-census-four-read.md --json docs/work/evidence/wr-2026-09-27-codex-census-four-read.json
```

The verified lead slug is `skills-a` (the original user ASK is `skills-fable` → `skills-a`) and the live ledger is `C:\Users\benzh\Code\claude-delegation\docs\ledger`; pass both for actual measurement. If four-read's parser cannot establish an ASK from the supplied evidence, preserve that unavailable result rather than inventing it.

## Comparison boundary

Lane twelve is `wr-2026-09-26-gate-under-load`: opened `2026-09-26T22:42:00Z`, accepted `2026-09-26T23:47:46.354Z`. Its `Spec-from` is the non-date `docs/specs/2026-09-26-gate-under-load.md@b786916`; do not synthesize a spec slice or compare one as numeric zero. Preserve its existing raw four-read/census artifacts and label that slice unavailable/partial.

The rework value is an observed accept-to-min(HEAD, seven-day-cutoff) window. At this acceptance time that seven-day window is immature: an observed zero commits is not proof of zero future rework. Preserve generated output, and state this qualification beside both the own-build and lane-twelve comparison.
