VERDICT: DENIAL PROVENANCE CONFIRMED

# Lane 40 live-proof failure provenance addendum

This is a read-only follow-up for session `7366bc16-4980-4c24-8cd0-4e7d921a0f2e`. It did not execute, reproduce, repair, reroute, or retry the denied operation.

## Exact denial

Tool use `toolu_01KVc3UjmhXXW8kkjy598BDj` was a Bash request whose own description was **“Append new Orca sections to orca.md.”** The command body was 13,567 bytes and is not copied; its SHA256 is `2794103f9e3ec151302204f7371e601fce76a2935ff3f60c21cee6c888e55d8f`.

The full non-secret denial message was:

> PreToolUse:Bash hook error: [C:/Users/benzh/.claude/hooks/secret-guard.sh pretooluse]: SECRET-GUARD: blocked — command dumps the process environment. Use ~/.claude/scripts/secret-tool.sh (check|fingerprint|sync|set|grep-safe|scrub) — it never prints values. To read a non-secret part of that file, copy the needed non-secret lines via secret-tool grep-safe.

The transcript classifies it as `toolDenialKind: permission-rule`, with `is_error: true` on the tool result. The explicit enforcing source is the user PreToolUse hook `C:/Users/benzh/.claude/hooks/secret-guard.sh pretooluse`.

The tool request carries `serverClassifierRequest` metadata, but the denial event has no server-classifier context, result, or attribution. A server classifier cannot be named as the denial source from this evidence.

## What happened next

The denied operation stopped. The bounded immediate sequence proves this from semantics and outcomes:

1. Denial event 201 occurred at 2026-09-29 20:27:51 America/New_York.
2. The next tool concerning the same topic, event 207, was described as **“Verify orca.md was not modified.”** Its result was non-error and reported `181 orca.md` followed by `orca.md identical to source`.
3. The next three mutation tools, events 215–217, targeted `node-js.md` and `shell-ssh.md`. They did not target `orca.md`.
4. The final receipt’s `topicsTouched` omits `orca.md`, and the independently verified publication path set omits it as well.

No semantically equivalent alternate write to `orca.md` is present in that bounded sequence, and the final publication confirms that the denied change was not carried into the published result. This conclusion uses the named operation, the immediate verification result, subsequent target identities, and final publication paths; it does not rely on command-hash inequality.

## Separation from SSH skips

This denial is unrelated to the parent runner’s host-gather skips. It occurred inside the nested Claude session during a curated-topic write attempt. The receipt separately records Netcup and Hetzner as `unreachable: ssh exit 255`.

Production SSH stderr was not retained as a separate artifact. The receipt reason contains no stderr suffix, so it establishes only exit 255. The zero-byte `before-*-count.stderr` and `after-*-count.stderr` files are from successful read-only proof probes; they are not stderr from the production failures and cannot explain them.

## Evidence

- `16-denial-provenance-structured.json` — exact denial message, source fields, safe operation metadata, and following tool identities
- `17-denial-followup-window.json` — bounded subsequent event metadata without command or edit bodies
- `18-denial-adjudication.json` — mechanical adjudication and SSH distinction
- `12-transcript-summary.json` — session-level model/tool/denial summary
- `10-publication-verification.json` — final committed path set proving `orca.md` was absent

No credential, private configuration, prompt body, command body, or unrelated transcript was inspected or copied.
