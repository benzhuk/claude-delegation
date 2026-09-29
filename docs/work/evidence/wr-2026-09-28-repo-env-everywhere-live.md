VERDICT: PASS 9435161e0997b5cde2e42b8a481c6e07f547d077 (lead-run live proofs, supporting evidence, not the deciding review)

# Lane 47 live proofs

## Part 1: janitor under a foreign GIT_DIR (Netcup, 2026-09-28)

`<X>` is a fresh scratch repo made with git init and one empty commit, under the lane scratch dir. Both runs used cwd = the lane worktree, a linked worktree of claude-delegation. The command was `GIT_DIR=<X>/.git node <code>/scripts/janitor.mjs --no-fetch`, the command the builder named in build.md.

| run | code | janitor's SAFE summary |
|---|---|---|
| base | a git archive of d6f5c9d, without the fix | 0 worktree(s), 0 branch(es): it resolved the scratch repo |
| fix | the lane worktree at 6ef609a (plus docs) | 18 worktree(s), 21 branch(es): it resolved claude-delegation |

The fix run exits 1, the same as an unpoisoned run from the same checkout. The 1 comes from janitor's own red findings, not from repo resolution. The raw outputs are live-janitor-base.txt and live-janitor-branch.txt in the lane scratch dir.

## Part 2: note-inbox from a linked worktree (Windows, ben-desktop, 2026-09-28)

The code was the bundle clone at 6ef609a (C:\Temp\ree-6ef6). The script (scratchpad lane-47/win-live-inbox.mjs):
1. made a fresh temp root with a main repo and a `git worktree add` linked worktree;
2. put the packet docs/notes/livesender-proof-1.md in the main checkout only;
3. wrote a mirror ledger line addressed to `liveproof` under a scratch --home;
4. ran `note-inbox.mjs --me liveproof --home <scratch> --cold-start-hours 0` with cwd = the linked worktree.

Output:

```
1 new peer note for liveproof:
  livesender → liveproof, 9.28.26 12:00 EDT [livesender-proof-1] ASK: See the packet. Details: docs/notes/livesender-proof-1.md Needs: none [packet: C:/Users/benzh/AppData/Local/Temp/lane47-live-j8UGni/main/docs/notes/livesender-proof-1.md]
```

A worktree cwd resolves to the main checkout, and a packet that exists reads `packet: <path>`. The live packet misses that skills-fable reported were caused by its stale pre-0.20.16 session hooks (see review r1 F1), not by this path. This proof shows the current resolver has no such miss.

## Pinned artifact

These proofs ran at 6ef609a. The only production change from 6ef609a to 9435161 is hooks/lib/goal-context.mjs. janitor.mjs, transport.mjs and note-inbox.mjs are unchanged (`git diff --stat 6ef609a..9435161`), so both proofs hold at 9435161. Review r3 reran the P8 probes at 9435161.
