# Root ruling: Windows OpenSSH startup after the live proof

The failed G1 proof remains failed and the denied Orca write remains stopped. This ruling authorizes only the independent SSH startup defect repair, not a new triage run, remote probe, guard/config change, acceptance, merge or install. Prior F1-F4 repair prediction was met at72ca037; this is a newly observed host-integration defect, not an expanded archive protocol.

Evidence: ssh-startup-r1.md reproduces native Windows ssh -V exit255 with empty output under sshEnv(), while inherited env and Git SSH succeed. ssh-startup-r2.md establishes ProgramData as a cardinality-minimum sufficient restoration. No remote connection or private configuration read was involved. The successful collectors inherited that variable; production filtered it out.

Smallest fix: preserve ProgramData alongside the current non-secret OS allowlist in sshEnv. No other environment names, no full-environment inheritance, binary override, PATH change, host-specific orchestration or new state. Both gather and reconciliation already use this shared helper.

Independent author first commits a Windows no-network regression using actual OpenSSH -V under the existing sealed child environment, with explicit unavailable-binary/platform skips. The current source must fail its intended startup assertion. Other forbidden environment names remain excluded. Source builder then records round-four Research before editing: exact reproduced red, minimum case, falsifiable omitted-variable cause, discriminating check and observation. Native diagnostic report is evidence, not permission to skip the builder's reproduction.

Source territory: one allowlist entry in scripts/knowledge-gather.mjs plus its explanatory comment if needed, source report/state only. Test territory: existing scripts/knowledge-gather.test.mjs and report/state. Existing contracts/signatures and guard behavior unchanged. Root owns this ruling and records. Scoped sealed green and independent exact-SHA Opus delta precede broader host gates. O1/O2 review follow-ups stay recorded and outside this repair. Any further unexpected failure returns to root before patches. No denied command replay or alternate path.

Measure: make the authorized cross-host gather actually start its SSH client on Windows, reducing stalled remote notes. No overall cost/speed improvement is claimed from a local version check. The next successful authorized live proof still must measure the host behavior.
