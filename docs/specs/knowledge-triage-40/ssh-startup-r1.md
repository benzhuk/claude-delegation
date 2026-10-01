VERDICT: REPRODUCED (local executable startup only)

Root native check on September29,2026,America/New_York, tool receipt functions.exec chunk6d5475. Four local -V invocations, no network, SSH config inspection, credential values, triage rerun or source change. Existing runProcess and sshEnv imported from the candidate.

| Binary | Environment | Exit | stdout bytes | stderr bytes |
| --- | --- | --- | --- | --- |
| Windows System32 OpenSSH9.5p2 | inherited |0|0|43|
| Windows System32 OpenSSH9.5p2 | sshEnv() |255|0|0|
| Git OpenSSH10.0p2 | inherited |0|0|42|
| Git OpenSSH10.0p2 | sshEnv() |0|0|42|

Get-Command ssh in the native parent resolves C:/Windows/System32/OpenSSH/ssh.exe (tool receipt a85fea). This reproduces the same empty exit255 pattern independently of remote connectivity. It supports a Windows OpenSSH startup dependency omitted by the filtered environment, but does not yet identify which variable. A finite local-only OS-variable matrix is assigned to the native tester. No ssh -G or host retry is authorized.
