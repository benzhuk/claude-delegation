VERDICT: PROVEN MINIMUM

# Windows OpenSSH filtered-environment startup probe

Observed 2026-09-29 America/New_York. This was a local-only `ssh -V` startup matrix. It used the approved source's existing `runProcess` and `sshEnv` functions with the absolute native binary `C:\Windows\System32\OpenSSH\ssh.exe`. No host argument, network connection, triage invocation, denied write, guard change, configuration inspection, credential access, or source edit occurred.

## Finding

The production-filtered environment contains these variable names:

`PATH`, `Path`, `SystemRoot`, `TEMP`, `TMP`, `USERPROFILE`

With that environment, Windows OpenSSH exits 255 with no process error or timeout. Adding the complete authorized Windows-variable group makes it exit 0.

Isolation found a cardinality-minimum sufficient restoration: **`ProgramData` alone**. The baseline with zero additions fails, while the singleton `{ProgramData}` exits 0. No smaller set exists, so cardinality one is proven minimal. The probe stopped at the first proven minimum; it does not claim `ProgramData` is the only singleton that could work.

This narrows the production startup defect to `sshEnv` omitting `ProgramData` for native Windows OpenSSH. The result is independent of the nested `secret-guard.sh` denial from the live proof.

## Matrix

| Added names | Status | Exit |
|---|---:|---:|
| none | FAILED | 255 |
| all authorized candidates | STARTED | 0 |
| `SystemDrive` | FAILED | 255 |
| `WINDIR` | FAILED | 255 |
| `USERNAME` | FAILED | 255 |
| `USERDOMAIN` | FAILED | 255 |
| `HOMEDRIVE` | FAILED | 255 |
| `HOMEPATH` | FAILED | 255 |
| `APPDATA` | FAILED | 255 |
| `LOCALAPPDATA` | FAILED | 255 |
| `ProgramData` | STARTED | 0 |

The group contained only these names: `SystemDrive`, `WINDIR`, `USERNAME`, `USERDOMAIN`, `HOMEDRIVE`, `HOMEPATH`, `APPDATA`, `LOCALAPPDATA`, `ProgramData`, `ComSpec`, `PATHEXT`. All were present in the native parent environment. No values were recorded.

Native `Get-Command ssh` resolved to the same Windows OpenSSH binary used by the proof. Process output content was not retained; the evidence records variable names and process status only.

## Evidence

- `matrix.json` — complete finite matrix and minimum proof
- `native-resolution.json` — native executable resolution
- `probe.mjs` — local-only evidence helper
