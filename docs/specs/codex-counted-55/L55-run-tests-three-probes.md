VERDICT: NOT_REPRODUCED

# Lane55 `run-tests.test.mjs` three-probe result

Candidate: `cd5fecccad1028298fb7811c77cff133c2d4c750`.

The original failed full-gate file process was `scripts/run-tests.test.mjs:1:1`; its failure text was `Unable to deserialize cloned data due to invalid or unsupported version.` This bounded probe ran exactly `node --test scripts/run-tests.test.mjs` three separate times on Windows. Each launch first recorded detached `REPO`, actual `PWD`, and `HEAD`; all three values identify `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-counted-55/windows-r1-cd5fecc` at the exact candidate SHA.

| Probe | Native exit | Top-level tests | Pass | Fail | Skipped | Original deserialization failure |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 0 | 27 | 21 | 0 | 6 | Not reproduced |
| 2 | 0 | 27 | 21 | 0 | 6 | Not reproduced |
| 3 | 0 | 27 | 21 | 0 | 6 | Not reproduced |

Receipts are retained under `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-counted-55/diagnostics/windows-r1/run-tests-three-probes/`:

- `probe-1-9db60668d4c044b5a6dfd89bcb48ea33/{launch.json,raw.log,native.exit.txt,summary.json}`
- `probe-2-28fe3e2e80af481cb93ef10d2fa3d339/{launch.json,raw.log,native.exit.txt,summary.json}`
- `probe-3-46cca2c1dc4a4e87ac70e2bd9861ff49/{launch.json,raw.log,native.exit.txt,summary.json}`

The nested `✖ probe` output is the file's intentional failing-child test and each enclosing assertion passed; it is not the original file-process failure. This isolated result does not establish full-suite behavior or explain the prior failure under full load.
