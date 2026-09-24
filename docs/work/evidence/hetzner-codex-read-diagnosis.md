VERDICT: ROOT CAUSE IDENTIFIED AT THE OBSERVABLE BOUNDARY — Hetzner Codex 0.154 did issue three native `exec` source-read calls, but every call was rejected as `permission_denied`; its `codex exec --json` projection omitted those calls and outputs. The full continue skill was not injected. The lower-level reason that this host/version denied the reads remains unknown.

# Scope and provenance

- Owned historical thread only: `01a0d347-638c-71a0-9570-839b88a2f290`.
- Source report: `C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/0924-linux-codex-native-use.md`.
- Exact remote rollout inspected read-only:
  `.../home/sessions/2026/09/24/rollout-2026-09-24T07-57-46-01a0d347-638c-71a0-9570-839b88a2f290.jsonl`.
- Installed Hetzner CLI: Codex 0.154.0. Comparison receipt: Netcup Codex 0.155.1.
- Inspection emitted only row types, tool names, classifications, booleans, counts, and hashes. It did not print raw prompts, instructions, configuration, authentication, or skill contents.
- No provider call, resumed model turn, configuration change, installation, update, or repository edit occurred.

# Discriminating result

The Hetzner rollout contains 49 rows and two turns. Its payloads include three `custom_tool_call` rows and three matching `custom_tool_call_output` rows:

- Initial turn: two `exec` calls.
- Correction turn: one `exec` call.
- All three inputs target the exact installed continue-skill path and classify as `sed`.
- All three outputs classify as `permission_denied`.
- The first attempt and correction attempt have identical input hashes and identical denial-output hashes. The second initial attempt differs, but was also denied.

The summarized `codex exec --json` receipt showed only `thread.started`, `turn.started`, `agent_message`, and `turn.completed`. Therefore the earlier “no tool call” observation was a trace-projection false negative. The model had an `exec` tool and attempted the requested read.

# Injection check

Bounded marker checks against the owned rollout found:

- Full skill title marker: absent.
- Unique full-body marker: absent.
- Unique bind-body marker: absent.
- Skill catalog name and frontmatter description marker: present.
- User-supplied exact path: present.

The installed skill source was not preloaded into context. Only catalog metadata was present. The accurate prose is explainable from that catalog description plus the prompt’s own wording; it is not evidence of a successful source read.

# Effective boundary

Both turns recorded `approval_policy: never` and `sandbox_policy.type: read-only`. The independent Python fixture could read and hash the same skill path, proving the file existed and the host account could read it outside the Codex execution boundary. Codex nevertheless received `permission_denied` for each attempted read.

This distinguishes the possibilities:

- **Trace parser missed a tool event:** confirmed. The rollout has six call/output rows absent from the 0.154 `--json` projection.
- **Skill source already injected:** rejected for the full source. Only catalog metadata was injected.
- **Tool availability differs:** `exec` was offered and callable, so absence of a tool is rejected. Effective execution permission differed: Hetzner’s three reads were denied; the Netcup 0.155.1 comparison read succeeded under the same apparent read-only/never contract.
- **Exact lower-level denial cause:** unknown. This evidence does not distinguish a 0.154 sandbox defect from a host-specific sandbox/admission condition.

# Consequence

Both Hetzner prose outputs remain unqualified as installed-source-read evidence. They were useful model answers, but neither consumed the requested source bytes.

Diagnostics for Codex 0.154 must inspect rollout `custom_tool_call` and `custom_tool_call_output` rows rather than infer tool use from the public `--json` stream alone.

# Next smallest useful action

Keep this historical thread closed. Before spending another provider call, compare the official pinned 0.154-to-0.155 sandbox and exec-event projection changes, or use the already observed Netcup 0.155.1 result as the minimum qualification floor. If Hetzner is later updated through its normal managed path, run one attended finite source-read qualification and require both a successful read output and a source-grounded answer. Do not treat an accurate answer alone as proof.

