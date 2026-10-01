VERDICT: DIAGNOSTIC f59fb856a0f508d0e7fb6b74b6b7924ae5a3b6b9

# Netcup outer-wrapper diagnostic

The detached fetched-origin Netcup test process completed with native test exit `0` and reported 2,120 pass, 0 fail, 3 skipped. The surrounding SSH invocation returned exit `1` only after completion because the PowerShell-fed Bash script reached `exit "0\r"`, producing `bash: line 23: exit: 0\r: numeric argument required`. This is an outer wrapper format error, retained separately from the test runner’s native exit. No suite rerun occurred.