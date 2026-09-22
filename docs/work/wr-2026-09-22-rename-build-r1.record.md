Work: wr-2026-09-22-rename-build-r1
Scope: rename-build/spec.md@v1.1
Owner: none
Status: runnable
Authority: build and self-gate in own worktree; review by an Opus reviewer; merge to integrate/rename-build by the integrator after APPROVE; no merge to main, no version bump, no roll-out without Ben's word in the lead's pane
Artifact: none
Evidence: none
Next: the build-loop Workflow spawns the R1 builder
Opened: 2026-09-22T15:51:26.389Z
Builder: sonnet
Log: 2026-09-22T15:51:26.389Z runnable none

R1 covers the session's own name as its peer-note slug (D1-D6): session-name.mjs, the SessionStart hook, transport's resolveSlug and registerInbox, note-inbox's CLI resolver.
