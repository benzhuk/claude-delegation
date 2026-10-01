# Lane52 census inputs — prepared, not run

The requested native lead is `01a0df4c-2809-7520-b1d7-876cc51a87ee`, read from its real Sep 26 rollout:

`C:/Users/benzh/AppData/Roaming/orca/codex-accounts/f22a4cc4-fb5a-4af5-aeec-4951188a536a/home/sessions/2026/09/26/rollout-2026-09-26T15-58-25-01a0df4c-2809-7520-b1d7-876cc51a87ee.jsonl`

The verified real Lane52 child rollout files are in the actual Sep 28 session directory:

| task path | role-map key | rollout file |
|---|---|---|
| `/root/lane52_builder` | `lane52_builder` | `rollout-2026-09-28T21-54-05-01a0eade-7fd9-70b1-ae59-4802df44d1bc.jsonl` |
| `/root/lane52_tests` | `lane52_tests` | `rollout-2026-09-28T21-54-12-01a0eade-9c57-7e31-a0ae-9d774ddd86ba.jsonl` |
| `/root/lane52_scout` | `lane52_scout` | `rollout-2026-09-28T21-42-13-01a0ead3-a487-73e0-8bdf-f608a8bb9b77.jsonl` |
| `/root/lane52_probe` | `lane52_probe` | `rollout-2026-09-28T21-42-20-01a0ead3-be5a-7262-83af-5af917becd58.jsonl` |

Each child’s recorded `source.subagent.thread_spawn.parent_thread_id` is the requested native lead. The runner passes their real containing directory through `--tasks` and the role map in `lane52-role-map.json`; it creates no copied transcript, task file, or zero-valued replacement.

The lead’s fixed default discovery horizon is Sep 26–27 UTC because its `session_meta` is Sep 26. Lane52’s actual Sep 28 children and the Sep 29 build window are outside that horizon. The planned census must therefore retain the resulting `PARTIAL` / `effective census window is outside default discovery horizon` evidence and any further discovery exclusions. This is a measurement limitation, not evidence that the children did not run.

Build window inputs are fixed by the record: `Spec-from` is `2026-09-29T01:38:40Z`, `Opened` is `2026-09-29T01:39:00Z`. The final accept-time runner takes exactly one caller-supplied UTC `T` for the census `--to` and four-read `--accept-at`; the acceptance command must use that same `T`.

The runner requires its integration checkout to contain the current `origin/main` version of `scripts/build-census.mjs`, including Lane51’s wake-split fixes. It derives the relevant `origin/main` source commit at execution rather than pinning today’s local ref.
