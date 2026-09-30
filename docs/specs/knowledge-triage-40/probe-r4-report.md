VERDICT: PASS

# Lane 40 R4 exact filename-slug diagnostic

Run: 2026-09-29 18:18:41–18:19:46 America/New_York  
Session: `22e738d0-ff7f-4215-997e-73c5e45e23d7`  
Scratch: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/probe/r4-20260929-181641`

R4 proves the missing filename-to-digest contract. The prompt contained this exact sentence at line 8:

> For each selected note, use its exact filename without `.md` as the skill's note-slug.

The selected fixture used the distinctive filename `hetzner-9f4c2a7be8d1-2026-09-01-finch-cobalt-observation.md`; the unselected fixture used `netcup-1aa4e0d977c2-2026-09-02-otter-violet-observation.md`.

The post-run mechanical matcher required the literal fragment:

```text
· hetzner-9f4c2a7be8d1-2026-09-01-finch-cobalt-observation →
```

It found that fragment exactly once and found no unselected slug. `artifacts/slug-matcher.json` reports `pass: true`; child and probe exit codes were both 0.

The resulting digest line was:

```text
2026-09-29 · hetzner-9f4c2a7be8d1-2026-09-01-finch-cobalt-observation → merged:probe-ops.md
```

## Hash and disposition evidence

| Artifact | Before | After |
|---|---|---|
| selected note | `5b77902ee6d0bc8b7f7aecc305b1a7653e8bcb8390927fe28cece359ca5533a6` | archived with `status: merged:probe-ops.md`, SHA256 `3813d77b504a31b7980e1b9b4b0e2dbc16a8ae078db53ab398fba83d7c708b4b` |
| unselected note | `1a26ad6fa2c7e3d54c4d5cba29da792297ca5e0948689856e82c24cce41f11db` | same hash, still pending and unarchived |
| topic | `4235c04efb0ea198a308bf0f4d544a9802df48aa32367875cbe73894c8c11da1` | `4d8b7c2bca360070e01bb92fb5e57d46ee30fa3b1797706644f8a3207d37b362` |
| digest | `88da69cfb257a7a82689a98e570c15539aba832340328ef02a928eaa33e737bb` | `4c8e3ddb04d0a9d5599c4989c795aa62f98c197b94b1b814c315e0c63e62f79d` |

The lock was acquired and released through the branch skill's owner checks; no lock remains.

## Skill, guards and usage

Preflight loaded the same approved branch skill as R3: commit `727e60db25d5e45d9476d8a6f41e9ade91fe33cf`, 8,980 bytes, SHA256 `967b3d6443dc17bf1b3565fab2edcba388d366fa83c88095794cadc1f4e55342`, through the namespaced `lane40-r4-probe:triage` scratch plugin. Real user settings/auth remained active; the init event reported Opus 5.5 and `apiKeySource: none`.

The live installed skill changed concurrently during the run. Preflight recorded SHA256 `4af64fa8d7636decf81b331cfb1edc667e6218121ff6f0a2fecfd3ced18b9ec6`; the post-run observation recorded 9,142 bytes and SHA256 `f9924f92c15db1264610bb87df11fbf18595d749d8280324b9bc1007e8c06ec9`, with a filesystem write time of 18:19:12 America/New_York. The coordinator reported that the `skills-fable` peer was applying the one-file rename on the live Windows, Netcup and Hetzner copies at 18:19 America/New_York. R4 did not write the live skill; the independently namespaced branch path and matching branch/overlay hashes establish which candidate the child loaded despite this external change.

All 20 PreToolUse Bash hook responses succeeded and `permission_denials` was empty. The R4 child ran no subagent, Git, chezmoi, SSH, network or live apply. The multi-inbox hook said the session was never registered; no live channel file contained its session ID. One unrelated SessionStart hook could not find scratch-home `report-watcher.js`; it was non-blocking and unchanged from R3.

Usage:

- input 14; cache creation 26,993; cache read 164,428; output 5,796, including 1,081 thinking tokens
- aggregate reported categories: 197,231 tokens
- cost: $0.3648056
- duration: 65,592 ms; turns: 8

This PASS is limited to the exact filename-slug assertion that R3 did not prove, while retaining R3's guard-preserving scratch workflow. Git/chezmoi publication, live throughput and cross-host gather/reconcile remain outside the diagnostic.

Raw evidence: `prompt.txt`, `artifacts/slug-matcher.json`, `artifacts/skill-preflight.json`, `artifacts/live-skill-post-observation.json`, `artifacts/invocation.json`, `artifacts/process.json`, `artifacts/stream.jsonl`, both complete file manifests, channel manifests and `artifacts/probe-summary.json` under Scratch.
