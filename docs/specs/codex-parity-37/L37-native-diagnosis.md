# L37 native hook diagnosis

Cause: the live Codex callback did not carry `transcript_path`. `classifyCodexRole()` therefore returned `unknown`, and `nativeRouteForLead()` returned before running either the wiring or backlog route because it accepted only `role === 'lead'`. The output was silent even though Codex had registered and trusted the hook.

Discriminating check: `codex-home/config.toml` has six trusted hook entries and `hooks.json` registers `multi-codex-hook.mjs` for SessionStart, UserPromptSubmit, PostToolUse, Stop, and Interrupt. The persisted native session's `session_meta` has a valid CLI lead identity, while the live callback did not supply its path to that file. The native transcript contains no injected `wiring:` or `work:` context; the command completed with `NATIVE_EXIT=0`. This separates a route eligibility failure from installer, trust, child-process, or Codex-output failure.

Fix location: `hooks/multi-codex-hook.mjs`, `nativeRouteForLead()`. Route the advisory-only wiring and backlog callbacks for every non-child event. `runCodexHook()` has already returned for a confirmed child before it calls this function; unknown is a conservative lead-like state for delivery and must not suppress host advisories merely because the native payload omits a transcript path.

Simplification: remove the redundant role gate; do not add a second identity classifier, state file, manifest event, installer change, or retry. Existing child exclusion remains the sole positive child discriminator.
