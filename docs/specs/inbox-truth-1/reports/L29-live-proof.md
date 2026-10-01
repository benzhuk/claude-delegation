VERDICT: PASS — the REPO integration copy reports the same existing packet as unchecked without a repository and present with the canonical repository.

Integration commit: `d1345220822651c762fa5a5a461e5bbe94620c7c`.

The verified existing packet was `C:/Users/benzh/Code/claude-delegation/docs/notes/skills-a-codex-census-10.md`. Before sending, no matching ids (`skills-a-inbox-truth-proof-1`, `skills-a-inbox-truth-proof-2`) or proof-slug cursor files existed.

Two real, ledger-only FYI notes were sent with the installed sender from canonical cwd `C:/Users/benzh/Code/claude-delegation`:

```text
node C:/Users/benzh/.agents/skills/multi/scripts/note-send.mjs --from skills-a --to inbox-truth-proof-1 --kind FYI --topic inbox-truth-proof --n 1 --details docs/notes/skills-a-codex-census-10.md --recipient-repo C:/Users/benzh/Code/claude-delegation --no-type --json --text "Lane29 packet lookup proof one."
node C:/Users/benzh/.agents/skills/multi/scripts/note-send.mjs --from skills-a --to inbox-truth-proof-2 --kind FYI --topic inbox-truth-proof --n 2 --details docs/notes/skills-a-codex-census-10.md --recipient-repo C:/Users/benzh/Code/claude-delegation --no-type --json --text "Lane29 packet lookup proof two."
```

Both sender commands exited natively 0. Their raw JSON and exits are `L29-live-proof-send1.json`, `L29-live-proof-send1.exit`, `L29-live-proof-send2.json`, and `L29-live-proof-send2.exit`.

The REPO copy at `C:/Users/benzh/orca/workspaces/claude-delegation/inbox-truth-1/skills/multi/scripts/note-inbox.mjs` was then run from the canonical cwd with these exact reads:

```text
node C:/Users/benzh/orca/workspaces/claude-delegation/inbox-truth-1/skills/multi/scripts/note-inbox.mjs --me inbox-truth-proof-1 --json --cold-start-hours 72 --no-repo --no-bind
node C:/Users/benzh/orca/workspaces/claude-delegation/inbox-truth-1/skills/multi/scripts/note-inbox.mjs --me inbox-truth-proof-2 --json --cold-start-hours 72 --no-bind
```

Both reads exited natively 0. The first returned exactly one proof note with `packetExists: null`, `packetChecked: false`, and `problems: []`. The second returned exactly one proof note with `packetExists: true`, `packetChecked: true`, and `packetPath: C:/Users/benzh/Code/claude-delegation/docs/notes/skills-a-codex-census-10.md`; its `problems` array was also empty. Raw JSON and native exits are retained as `L29-live-proof-read1.json`, `L29-live-proof-read1.exit`, `L29-live-proof-read2.json`, and `L29-live-proof-read2.exit`.

This proof used the integration REPO copy only. Installed hooks still load the plugin cache; release and installation are required before panes use this code.
