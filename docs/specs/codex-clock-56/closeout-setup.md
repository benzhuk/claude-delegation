# Lane 56 acceptance and closeout setup

Prepared only; do not execute measurement, acceptance, merge, push, publication, or closeout until the host integrator reports all required gates green and supplies one fresh UTC `T`.

## Measurement runner

Runner: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/run-acceptance-measurement.ps1`

```powershell
& 'C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/run-acceptance-measurement.ps1' -AcceptAtUtc '<fresh UTC T ending Z>'
```

It uses Lane 56's source tree and approved artifact `08229f9d3461fa253ec857a451a44dfb89e4f214`, not Lane 55. It validates base `c0818c99c171de3b7812acd20adbe4d4ea96297c`, record `Opened:`/`Spec-from:`, and the canonical Codex lead transcript for `01a0df4c-2809-7520-b1d7-876cc51a87ee`. It runs `build-census` from `Opened:` through the common `T`, then `four-read --accept-at T`; every output, raw log, and native exit is unique under `docs/specs/codex-clock-56/acceptance-<T>/`.

The configured canonical Codex home has no native transcript for Fable `Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31`. Run without `-SpecLeadPath` so four-read records its partial no-spec-slice result. Pass `-SpecLeadPath` only after verifying a real native transcript whose first metadata identity equals that session id; the runner then creates a `Spec-from:` through `Opened:` spec census and passes it to four-read. It never invents a cost.

## Isolated main closeout clone

Prepared clone: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/main-closeout`

It was cloned from `https://github.com/benzhuk/claude-delegation.git`, detached at fresh `origin/main` `c0818c99c171de3b7812acd20adbe4d4ea96297c`; its `HEAD` equals `origin/main` and `git status --porcelain --ignored` was empty. Never check out or merge shared canonical `main`.

At the authorized merge point, fetch in this clone, require clean `--porcelain --ignored` output, detach again at the just-fetched `origin/main`, require `HEAD == origin/main` and that `c0818c9` is its ancestor, then create the no-fast-forward merge of `08229f9`. Run the exact merged-tree Windows gate before any push. After a green gate, push the merge, append the required plain non-bold Closed bullet through the normal decisions-render publication path, and only then run authorized acceptance/closeout steps. Any conflict or failed cleanliness/head check stops this plan without a merge.
