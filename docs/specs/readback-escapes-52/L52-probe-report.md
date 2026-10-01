VERDICT: OBSERVED — escaped set: `* [ ] \` ~ > | <`; unescaped candidates: `_ # - + !`.

## Probe result

Created page id: `3eada112-77a1-819a-88ae-c7d77fa1b3d7`.

Verified title: `Scratch: readback escapes (lane 52)`.

Verified parent: `3e1da112-77a1-817d-b4c1-f1038ccfdd5a`, which normalizes to the authorized `3e1da11277a1817db4c1f1038ccfdd5a`.

The normal markdown readback is literal prose, not formatting: `A*B`, `A[B`, `A]B`, `A\`B`, `A~B`, `A>B`, `A|B`, and `A<B` respectively returned with exactly one leading backslash before the named candidate. The remaining candidates were returned without a leading backslash. No inference is made beyond this candidate set.

Archive status: succeeded. The archive receipt reports `in_trash: true` under Notion API version `2026-03-11`; its native exit is `0`.

## Archive-route diagnostic

The initial normal-CLI archive preflight is retained. `notion.js archive --help` returned `Unknown command: archive` with exit `1`; the CLI has no archive verb. After that diagnostic, the authorized archive used the same script's exported authenticated `request(method, path, body, opts)` helper only: `PATCH /pages/<created-id>` with `{ "in_trash": true }` and `{ "version": "2026-03-11" }`. No CLI source was changed and no second page or additional page write was made.

## Supplied incident snapshots

Both source snapshots were copied unchanged into this scratch root. Their SHA-256 values match their originals:

| File | SHA-256 |
| --- | --- |
| `lane52-render-before-write.md` | `B448DAB8D79FC7254FD42D100D192A5790E5A7642F2B46E608ED2D8C9C9B93C8` |
| `lane52-live-after-write.md` | `A88FA4A5AF57B30F237038F164B3F25EBA334F220EB559D62114542FD5FCC844` |

The raw diff shows two removed empty separator lines, `build/* branches` becoming `build/\* branches`, and the live-only cleared timestamp on `Done`. The snapshots are therefore not verbatim-equal; the cleared-timestamp difference is present alongside the documented star escaping.

## Raw evidence

Every path below is within `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/readback-escapes-52/`.

| File | SHA-256 | Native exit |
| --- | --- | --- |
| `probe-request.md` | `117A5C0F257FD42BC6CBA3B10AEB603B07E63B2D85735BF6CE36DCFB1D35264D` | n/a |
| `creation-response.json` | `648721CC6681C109FFD6E04491FF718BB485FC6A251396FFA395D975D87B1FA0` | 0 |
| `readback.md` | `01FCC13F70C603E1E222A23986E33C879EFE3EB1A1C0A87393A10B7FEF43A3DD` | 0 |
| `title-parent-verification.json` | `6E89A8728AF116E89A5F481E1E906DF495345810925BA512D4709DA2F7F43D47` | 0 |
| `archive-receipt.json` | `D73BE7250CF35D0EBAE2DEA965F5F15C2A059D82FBA5FFAF67F90AAF8AB62AA6` | 0 |
| `archive-command-surface.txt` | `B335095E0E9BDB5E316F09FDBE650BC833D495B049CCB48D0C1D9A499355EB4E` | 1 |
| `snapshot-raw-difference.diff` | `774EB207F0C9CEFF8FE9E89B53E87B7CA9FF00F70B32C948AB21E6F726AC79E1` | 1 |
| `snapshot-raw-difference.txt` | `88F262B9696C267BE104BA08B3AAE287BFD93792575D843BD21A48BC4F1C929F` | n/a |
| `snapshot-sha256.json` | `544C6CB778D249CF35CC1FEEC4E4E81F76D82985DA061EB33F2E48C32F5063C3` | n/a |
| `lane52-render-before-write.md` | `B448DAB8D79FC7254FD42D100D192A5790E5A7642F2B46E608ED2D8C9C9B93C8` | n/a |
| `lane52-live-after-write.md` | `A88FA4A5AF57B30F237038F164B3F25EBA334F220EB559D62114542FD5FCC844` | n/a |

The two `1` exits are expected: the unsupported archive command and `git diff --no-index` reporting differences. All creation, readback, title/parent verification, and archive operations exited `0`.
