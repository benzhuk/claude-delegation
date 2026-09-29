VERDICT: BLOCKED — PREPARATION ONLY

# Lane 40 R3 diagnostic preparation

Prepared: 2026-09-29 America/New_York  
Authority: `skills-fable-lane-40-4`, as summarized by `lock-owner-brief.md`  
Candidate source: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/knowledge-triage-40/dotfiles-owner-fix/dot_claude/skills/triage/SKILL.md`

No R3 Claude invocation ran and no R3 fixture or overlay was created. Root reported that the Sonnet builder stopped before the authorized rename: the PostToolUse secret guard flagged its read of `lock-owner-brief.md` with `SECRET DETECTED IN OUTPUT: a key-shaped literal is now in the transcript`. That refused read must not be rerouted or retried. Root also reported that no rename or regression test exists and directed this lane to finish preparation only.

The prior refused fixture and R2 evidence remain untouched. No live skill, user setting, guard, allowlist, credential, SSH configuration, Git repository, or docs/work file was changed. The unrelated `distill-session.sh` modification reported in the isolated dotfiles worktree was not inspected or touched.

## Readiness evidence already collected

Root confirmed that `git diff --exit-code` for the isolated branch skill is empty. The file is the unchanged pre-fix base and still uses the legacy lock-token name; no partial rename exists.

An earlier read-only substring count found `KNOWLEDGE_LOCK_OWNER` text, but that pattern can match the pre-existing `KNOWLEDGE_LOCK_OWNER_PID` identifier. It is not evidence that the authorized `KNOWLEDGE_LOCK_OWNER` rename began. Likewise, the candidate checkout's observed SHA256 `9f6b7f7cb949d3af4d77d3cb65eb06a80f907d09ef95a99d032355bf3eae06c0` differs from the previously observed live-skill hash, but checkout line endings can explain a byte-hash difference. Neither the substring count nor the cross-checkout hash comparison establishes a source change. The precise readiness fact is the empty branch diff plus root's report that the builder stopped before editing.

## Proposed skill-loading method

Use a minimal scratch Claude plugin whose `skills/triage` directory is a directory junction to the isolated branch directory. Give the wrapper a unique plugin name such as `lane40-r3-probe`, and invoke the skill by its namespaced identifier `lane40-r3-probe:triage`.

This is preferable to a same-name project overlay:

- `CLAUDE_CONFIG_DIR` stays `C:/Users/benzh/.claude`, so the real user settings, plan authentication path, permission rules, and secret/Git-identity PreToolUse hook definitions remain intact.
- `--setting-sources user` continues to load those user controls. No project setting replaces them.
- `--plugin-dir <scratch-plugin>` is a supported per-invocation CLI input and adds only the isolated skill wrapper.
- The namespace avoids relying on undocumented or unverified precedence between live user `triage` and project `triage`.
- A directory junction points at the branch bytes rather than making a copy that could drift.

The scratch wrapper must contain only its plugin manifest and the junction. It must contain no hooks, settings, commands, agents, MCP configuration, credentials, or copied user files.

## Required preflight after a fresh go

Before any future launch:

1. Receive root's explicit go after the builder reports the branch patch ready.
2. Record the builder's exact source path and SHA256 as the expected branch identity.
3. Require `realpath(scratch-plugin/skills/triage/SKILL.md)` to equal the isolated branch skill path and require its SHA256 to equal the expected hash.
4. Require the candidate text to contain `KNOWLEDGE_LOCK_OWNER` and `knowledgeLockOwner`, contain no `KNOWLEDGE_LOCK_TOKEN` or `knowledgeLockToken`, and retain `token.txt`, exclusive `fs.mkdirSync`, `flag: 'wx'`, random PID/GUID owner generation, case-sensitive ownership comparison, and non-recursive release semantics.
5. Require the live user skill to remain distinct and unchanged. Never apply or copy the branch skill into the live configuration for the probe.
6. Create a new R3 plain-file fixture with two pending notes and one exact selected filename. Do not use Git, chezmoi, an allowlist, SSH, or any earlier fixture.
7. Preserve R2's sanitized environment and channel manifests. Do not add `--allowedTools`, change `auto` mode, suppress user setting sources, or bypass permissions.

Any failed preflight or new guard refusal stops the probe without another route.

## Proposed invocation

```text
C:/Users/benzh/.local/bin/claude.exe
  -p
  --output-format stream-json
  --verbose
  --include-hook-events
  --setting-sources user
  --strict-mcp-config
  --no-chrome
  --plugin-dir <new-r3-scratch>/lane40-r3-probe
  --model claude-opus-5-5
  --effort high
  --session-id <fresh-uuid>
  --permission-mode auto
  --permission-prompts none
  --tools Skill,Read,Glob,Grep,Edit,Write,Bash
  --disallowedTools Agent,Bash(claude:*),Bash(codex:*),Bash(git:*),Bash(chezmoi:*),Bash(note-send:*),Bash(orca:*),Bash(ssh:*),Bash(scp:*),Bash(curl:*)
  <prompt via stdin>
```

The prompt's first action must invoke `Skill` with the exact namespaced identifier `lane40-r3-probe:triage`. It must explicitly retain the R2 plain-file adaptation: exact one-note selection from two pending notes, no Git/chezmoi publication, original lock/judgment/archive/digest semantics, and immediate stop on denial.

The child environment should use the R2 policy unchanged: remove `ANTHROPIC_API_KEY`, note/pane/session identities, `ORCA_*`, `CODEX_*`, caller Git environment and the review-run exact identity keys; set scratch `HOME`, `USERPROFILE`, `AGENTS_HOME`, and `KNOWLEDGE_DIR`; retain the real `CLAUDE_CONFIG_DIR`; set `DELEGATION_REVIEW_RUN=1`, `KNOWLEDGE_TRIAGE_NESTED=1`, and `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`. No credential is copied.

## Loaded-path and hash proof

A future result is acceptable only if all of these agree:

- preflight junction realpath equals the isolated branch path;
- preflight source and junction SHA256 equal the builder's expected SHA256;
- init event lists the scratch plugin and namespaced `lane40-r3-probe:triage` skill;
- the first tool call is `Skill` with `skill: lane40-r3-probe:triage`;
- the raw Skill tool result identifies the scratch-plugin/branch base directory and contains the new `KNOWLEDGE_LOCK_OWNER`/`knowledgeLockOwner` spellings with no legacy spelling;
- the live user skill hash remains the prior live hash and is not the loaded candidate.

The init event alone is insufficient because it lists skill names without a content hash. The preflight hash plus namespaced raw Skill result is the required chain from branch bytes to loaded instructions.

## Precedence concern

A scratch project `.claude/skills/triage` overlay would preserve the live user configuration, but both it and the user skill would expose the same unqualified name. The available R2 init event did not expose a source path for skills, so it cannot establish which same-name skill wins. Do not rely on that precedence without a separate authoritative guarantee. The namespaced scratch-plugin method removes that ambiguity while keeping the guard-preserving user setting source.

The R3 launch remains blocked until the builder refusal is adjudicated, a complete branch patch exists, its exact hash is supplied, and root gives a new explicit go.
