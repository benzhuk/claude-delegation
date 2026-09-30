VERDICT: NO PROVEN CAUSE. Static evidence ranks a production-only environment/executable difference first, an unknown local launch failure second, a transient local/network event third. No probe, SSH, retry, edit or test run was performed.

Actual clock: 2026-09-29 20:42 EDT (America/New_York), system clock.

## What production did (sources: scripts/knowledge-gather.mjs at 0fa06fe, last changed by that commit)
- Executable: `ssh` from `deps.sshCommand ?? ["ssh"]` (knowledge-gather.mjs:147), spawned with `shell:false` via runProcess (:101-103), resolved by PATH lookup.
- Argv: SSH_OPTIONS (:23-27: -T, BatchMode=yes, StrictHostKeyChecking=yes, ConnectTimeout=15, ForwardAgent=no, ForwardX11=no, ClearAllForwardings=yes, PermitLocalCommand=no, RemoteCommand=none, RequestTTY=no), then `ben@<ip>`, `/bin/sh`, `-c`, and the multiline GATHER_SCRIPT wrapped in single quotes (:419-420; script :31-35).
- Environment: NOT inherited. `sshEnv()` (:125-131) builds a new object with only these names, when present: PATH, Path, SystemRoot, USERPROFILE, HOME, TEMP, TMP, SSH_AUTH_SOCK. Names only inspected; no values read.
- stdin: a pipe, ended immediately (`child.stdin.end(undefined)`, :113-114). stderr collected (:111) and included in the skip reason up to 120 characters (:425).
- Result mapping: exit 255 becomes `unreachable: ssh exit 255 <stderr trimmed to 120 chars>` (:425). The receipt shows exactly `unreachable: ssh exit 255` for both hosts (live-proof/20260929-201431/08-receipt-summary.json:111,125), so the captured stderr was empty. I did NOT find code that discards stderr; an empty string is what the code recorded. An empty stderr with exit 255 is itself odd, since ssh normally prints its refusal reason; the actual error text is unknown and I will not invent it.
- The receipt records no resolved ssh path, and the raw log holds only "knowledge-triage success" (live-run.raw.log), so which ssh binary ran is not recorded.

## What the collectors did (same live-proof directory)
- capture-remote-counts.mjs: `spawn("ssh", [...opts, endpoint, "/bin/sh", "-c", "'<count script>'"], {stdio:["ignore","pipe","pipe"], windowsHide:true, shell:false})` with the SAME option list and no `env` key, so the child inherited the full parent environment; stdin ignored; different remote script (count, not tar). Before and after runs succeeded (before-*/after-* stdout and empty stderr; report.md:39).
- Which shell launched each process is not recorded (06-live-run-meta.json shows the production command `node .\scripts\knowledge-triage.mjs --manual`, PowerShell-style path; the collectors' launcher is not recorded).
- Machine fact from source/OS lookup: two ssh executables exist on this host, `C:\Program Files\Git\usr\bin\ssh.exe` and `C:\Windows\System32\OpenSSH\ssh.exe` (`where.exe ssh`, order shown from this Git Bash session). Which one comes first depends on the launching shell's PATH.

## Comparison
| Aspect | Production | Collector |
|---|---|---|
| Executable | bare `ssh`, PATH lookup | bare `ssh`, PATH lookup |
| Argv options | identical SSH_OPTIONS | identical |
| Remote command | tar gather script | count script |
| Environment | 8 named vars only | full inherited |
| stdin | pipe, closed | ignored |
| Process group | attached on win32 | default |

## Ranked hypotheses (falsifiable)
1. Stripped environment breaks the local ssh (most likely). sshEnv() drops names such as APPDATA, LOCALAPPDATA, USERNAME, USERDOMAIN, HOMEDRIVE, HOMEPATH, ProgramData, ComSpec, windir, PATHEXT (and any MSYS/Git variables), which the Git or Windows OpenSSH binary may need to locate its user, config or known_hosts, or to start at all. Predicts: the identical read-only count command runs OK with the inherited env and fails 255 (empty or short stderr) with env = sshEnv(). Also explains why both hosts failed together and why collectors succeed.
2. Executable resolution differs (Git ssh vs System32 OpenSSH) because the production launcher's PATH order differs, and only one binary tolerates the stripped env. Predicts: `where ssh` under the production launcher's PATH resolves to a different first hit than the collector's, and the stripped env fails only for one of them. Cannot be checked from receipts.
3. Duplicate PATH/Path keys: on Windows process.env is case-insensitive, so sshEnv() reads both `PATH` and `Path` from the same value and assigns two keys that differ only by case into a plain object; the resulting environment block has duplicate PATH entries. Predicts failure depends on how the launcher resolves duplicates. Weaker; would apply to any Node spawn.
4. Time-correlated local or network event during 20:21-20:32 EDT (both hosts, at once) that ended before the after-collector. Predicts a repeat of the same job under identical settings succeeds. Weak: exit 255 with empty stderr is not a typical network error, and collectors succeeded immediately before and after.
5. Stdin pipe versus ignore: production closes an open stdin pipe at once; ssh with BatchMode and a remote command does not read it. Low likelihood.
6. Remote script differences: exit 255 is not produced by the tar script's own failures (exit 3 for cd, tar codes otherwise), so remote-side causes are unlikely.

Excluded/unknown: private SSH config, known_hosts and credentials were not read; ssh version/binary path and the launcher's env are unknown; the production stderr text, if any, was not captured to disk beyond the empty string above.

## Smallest discriminating future check (NOT run; needs authorization)
Run one local, no-network command twice from a small Node script that imports only the exported `sshEnv` and `runProcess`, printing exit code and stderr length only (no config, no values): `ssh -G ben@100.69.249.18` (parses config and prints resolved settings, opens no connection) with env = process.env, then with env = sshEnv(), each on both `C:\Windows\System32\OpenSSH\ssh.exe` and the Git ssh, absolute paths. Divergent exit codes or stderr length between env variants falsify or confirm hypotheses 1-2 without touching the hosts. If needed, one follow-up: the collector's count script to one host with sshEnv(), read-only. Output the bare exit code, stderr length and resolved binary path only.
Prediction: with sshEnv(), at least one ssh binary exits 255 or prints an environment-related error; with process.env both exit 0.
A fix (adding the missing names to sshEnv) is out of scope and only proposed if the check confirms.

## Limits
Static reading only: knowledge-gather.mjs, knowledge-triage.mjs call sites, the live-proof collector scripts, 06-live-run-meta.json and 08-receipt-summary.json, plus `where.exe ssh`. No env dump, no process listing, no private config or credentials, no remote commands, no test reruns, no repo writes, no peer messages, no cleanup.
