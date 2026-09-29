VERDICT: PASS

# Lane56 host gates

Candidate gate SHA: `08229f9d3461fa253ec857a451a44dfb89e4f214`. Integration HEAD at report time: `52bf8cc0e1f434c02921951f36584f1ca0b70e2b`.

## Windows: three consecutive sealed runs

All runs used the clean detached `C:/Users/benzh/orca/workspaces/claude-delegation/codex-clock-56-gate` checkout at the candidate SHA, real `origin/main` `c0818c99c171de3b7812acd20adbe4d4ea96297c`, normal Windows TEMP, and process-owned `Global\claude-verify` acquired with the 60-second cap. The runner used `Push-Location` for each launch and each receipt’s `node-preflight.json` records that Node CWD and Git HEAD equal the detached checkout and candidate.

| Run | Native exit | Tests | Pass | Fail | Skipped | Leak observer | Receipt |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 0 | 2943 | 2929 | 0 | 14 | 0 new entries | `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/windows/08229f9d3461fa253ec857a451a44dfb89e4f214-attempt1-6f42a919b85f4fbf97813bb31eb2038a/{git-preflight.json,node-preflight.json,suite.raw.log,native.exit.txt,summary.json}` |
| 2 | 0 | 2943 | 2929 | 0 | 14 | 0 new entries | `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/windows/08229f9d3461fa253ec857a451a44dfb89e4f214-attempt2-7753489469304d3394bfcc52d060bc41/{git-preflight.json,node-preflight.json,suite.raw.log,native.exit.txt,summary.json}` |
| 3 | 0 | 2943 | 2929 | 0 | 14 | 0 new entries | `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/windows/08229f9d3461fa253ec857a451a44dfb89e4f214-attempt3-7a705469b0764eabbc0c88fbe695627d/{git-preflight.json,node-preflight.json,suite.raw.log,native.exit.txt,summary.json}` |

A Node `--test`/`run-tests.mjs` process scan was empty before attempt 1 and the same monitor ran before attempts 2 and 3; all three proceeded, so it found no competing suite. The monitor serialized no file for an empty PowerShell array, a retained artifact limitation; the initial clean scan and the successful sequential starts are recorded in the execution receipt/history. No processes were killed.

## Netcup: one sealed run

The actual corrected run on `ben@100.69.249.18` passed with native exit `0`: 2,943 tests, 2,938 pass, 0 fail, 5 skipped, and `leak check: 0 new temp entries`. It ran from a unique remote checkout under `/tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/56`, through the existing `/tmp/claude-verify.lock` with `flock -w 60`, using stable login-shell Node `/home/ben/.local/share/fnm/node-versions/v24.18.1/installation/bin/node` (`v24.18.1`). Local retained receipt: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-clock-56/netcup/08229f9-002/{launch.txt,suite.raw.log,native.exit.txt}`.

Two earlier Netcup invocations were setup-only failures and ran no tests: the first passed an ephemeral `fnm_multishells` path into the flock child (exit 127); the second sent CRLF into the shell path (exit 127). The actual suite ran only after resolving and verifying the stable Node binary in the login shell and flock context. Those failures and their receipts remain preserved; no failed actual suite was repeated.
