# Release note — delegation plugin 0.20.4

Source release 0.20.4's frozen candidate (`9a38760`) passed 1,396 sealed tests and an independent native review before acceptance — that verifies the source, not a running deployment. On Windows, the Claude plugin was updated from 0.13.0 to 0.20.4 through the official CLI, and the shared-skill mirror was updated to 0.20.4 with all eight bundled skill hashes matching. Five hook events (SessionStart, UserPromptSubmit, PostToolUse, Stop, Interrupt) are now registered and trusted in five existing Codex homes. None of this confirms the hooks have actually fired in real use yet.

To start useful work on a host: pick one hook route per project — native Codex package or the mirror, never both — then open the project and ask for a specific outcome with observable success criteria, per the operator guide's standard prompt pattern. For Claude, `claude plugin marketplace update benzhuk` and `claude plugin update delegation@benzhuk` bring a host current; start a fresh session afterward.

Still being validated: the Hetzner/Netcup mirror update is in progress; the Mac is reachable over Tailscale but has no qualified management route yet, so it isn't part of this rollout. A separate Store/MSIX outer-hook-shell defect was filed upstream (issue 47810) — per instruction, work continues without waiting on that fix. All three pending Notion rollout decisions have been submitted; none remain open.

---

## Observed / Not checked

**Observed:**
- Frozen candidate `9a38760` passed 1,396 sealed tests; independently reviewed and accepted.
- Windows Claude plugin CLI-updated 0.13.0 → 0.20.4.
- Windows mirror at 0.20.4; eight skill hashes verified matching.
- Five hook events registered and trusted in five existing Codex homes.
- Corrected read-only Codex fixture confirmed native source/skill reads succeed once the elevated Windows sandbox backend is explicitly selected.
- Upstream issue 47810 posted and read back (author bz, state OPEN).
- All three Notion rollout decisions confirmed by Ben in chat; none pending.

**Not checked (this task was Read-only; no execution, tests, or config changes performed):**
- Actual production hook execution/handler firing beyond registration and trust.
- Hetzner/Netcup mirror update completion.
- Mac management route (none qualified yet).
- Any throughput, speed, or cost comparison — no baseline exists.
- Automatic/durable memory behavior — not enabled or claimed by this update.
- Live coexistence or precedence if both native and mirror hook routes are installed on the same host.
- Resolution of the Store/MSIX outer-hook-shell defect (upstream, not blocking).

*Parent captures final text and independently reviews before publication.*