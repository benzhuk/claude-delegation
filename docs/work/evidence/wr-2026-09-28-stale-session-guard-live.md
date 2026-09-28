VERDICT: PASS a960c366d34ece5ee1044f866f873701c4c5fc08 (lead-run live proof, supporting evidence, not the deciding review)

# Lane 42 live proof: a stale session's builder spawn is refused

Run on Netcup, 2026-09-28T21:11:12Z (5:11 PM NY), against a scratch HOME only: git archive of a960c366d34ece5ee1044f866f873701c4c5fc08 unpacked twice under <HOME>/.claude/plugins/cache/benzhuk/delegation/, as 0.20.9 and as 0.20.16, and <HOME>/.claude/plugins/installed_plugins.json naming delegation@benzhuk 0.20.16. <HOME>/.agents holds no dispatch-guard-enforce file, so every other deny is observe-only there. The input is one PreToolUse Agent JSON with subagent_type delegation:builder.

Output, verbatim:

    == guard at 0.20.9 (stale), no enforce file: 
    {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"stale session: this session loaded delegation hooks 0.20.9, but 0.20.16 is installed, so hooks added since (the delete guard among them) are not running for it or its agents. The one fix: start a fresh session (claude --resume keeps the conversation). Off switch: ~/.agents/no-dispatch-guard"}}
    exit 0
    == guard at 0.20.16 (current)
    exit 0
    == general-purpose at 0.20.9
    exit 0
    == wiring-check --line --hook at 0.20.9
    stale session: this session loaded delegation hooks 0.20.9, but 0.20.16 is installed, so hooks added since (the delete guard among them) are not running for it or its agents. The one fix: start a fresh session (claude --resume keeps the conversation). Off switch: ~/.agents/no-dispatch-guard
    == at 0.20.16
    0
    == guard log
    <HOME>/.agents/ws/dispatch-guard.log
    {"at":"2026-09-28T21:11:11.869Z","session":"proof","tool":"Agent","from_subagent":false,"subagent_type":"delegation:builder","model":null,"rules":["R0-stale"],"action":"deny","enforced":false,"hard_deny":true}

Reading: the 0.20.9 copy prints the P6 deny JSON and logs R0-stale with hard_deny true. The 0.20.16 copy and a general-purpose spawn print nothing (pass). wiring-check --line --hook prints the stale line only from the 0.20.9 copy.
