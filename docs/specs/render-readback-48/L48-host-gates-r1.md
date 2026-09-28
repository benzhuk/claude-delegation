VERDICT: BLOCKED 4d6c940849f4c48264e0f05071bfd2b667e745c3
Both hosts ran their one permitted full suite on the exact candidate; neither is green.
Windows: native exit 1; 2,686 pass, 1 fail, 14 skip; raw SHA256
43FEA8FB32420E70948E7222134E11CA5DBCC51A73F46049035C95B331FB72E0.
Windows receipt: windows/4d6c940849f4c48264e0f05071bfd2b667e745c3/suite.{raw.log,exit.txt,summary}.
Windows failure is hooks/codex-unsupported.test.mjs:134 expecting runnable backlog output;
actual peer/continuation context lacked the expected `work: 1 runnable and unowned` line.
Netcup attempt 1: native exit 127 before suite because noninteractive SSH PATH resolved no node.
Attempt 1 retained: netcup/4d6c940849f4c48264e0f05071bfd2b667e745c3/.
That is an environment correction, not a source or guard bypass; attempt 2 used login-Bash's
absolute Node /home/ben/.local/state/fnm_multishells/269424_1790638581984/bin/node.
Netcup attempt 2: native exit 1; 2,599 pass, 1 fail, 5 skip; raw SHA256
CF3675BD4AF25A59089AA3A8403030F59FAEB7D48215EE1158E2EBACC0A030B2.
Netcup receipt: netcup/4d6c940849f4c48264e0f05071bfd2b667e745c3-r2-node-path/suite.{raw.log,exit.txt,summary}.
Netcup failure is decisions-render.test.mjs:140 snapshot fixture hash mismatch:
actual 7285214582D93D6AAB73B5323C967A058598D481A7E315E7A5F30780CE6CD277;
expected 535914342B07C360AB2FBC59699598C2012F547C3C7F501FCC5CC8EC8D755E1E.
Netcup used the persistent regular /tmp/claude-verify.lock with flock -w60 and short TMPDIR/TMP/TEMP.
Windows used the process-owned Global\claude-verify mutex with a 60-second bound.
Remote clone: /tmp/01a0df4c-2809-7520-b1d7-876cc51a87ee/48/repo-4d6c940849f4c48264e0f05071bfd2b667e745c3.
No source, checkout, record, install, deletion, or unchanged-candidate suite rerun occurred.
