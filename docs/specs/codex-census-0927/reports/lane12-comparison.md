# Lane 12: original versus measured census

Window: `2026-09-26T22:42:00Z` through accepted `2026-09-26T23:47:46.354Z`. Fresh raw outputs are [census JSON](lane12-comparison-census.json), [census Markdown](lane12-comparison-census.md), [four-read JSON](lane12-comparison-four-read.json), and [four-read Markdown](lane12-comparison-four-read.md). Existing lane-twelve evidence was not changed.

| Measure | Original retained result | Fresh measured result |
| --- | --- | --- |
| Census coverage | Unsupported; no native lead usage/child attribution | Complete: verified lead identity and 14 discovered child files; no unreadable files or directories. |
| Measured usage | Unavailable | Lead `gpt-6-astra`: 14,751,869 derived tokens across 97 responses; child `gpt-5.6-terra`: 33,814,093 across 276 turns; combined derived total 48,565,962. |
| Top-tier tokens/build | Unavailable | 14,751,869, lead-only; partial because the record's non-date `Spec-from` cannot support a spec slice. |
| Ask to accepted | 1.1h; response gap unavailable | 1.1h; largest native API response gap 2.6 minutes. |
| Rework after acceptance | Unavailable; seven-day window had not elapsed | One observed build-file commit and no re-accept log entries in the available accept-to-cutoff interval. The seven-day observation window is still immature: this is not proof that future rework is zero. |
| Work lost/stalled | Unavailable | No native response gaps over 30 minutes and no unanswered ASKs to `skills-a`. |

No spec census was run: lane twelve's `Spec-from` is `docs/specs/2026-09-26-gate-under-load.md@b786916`, not a timestamped `Spec-from..Opened` window. The four-read reports that limitation rather than treating a missing spec slice as zero.
