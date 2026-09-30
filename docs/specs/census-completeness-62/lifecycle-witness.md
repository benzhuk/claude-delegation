Verdict: the earlier split (9 in-turn vs 2 between-turn gaps of at least 120 min) is NOT a valid stall oracle. All 9 "in-turn" gaps are caused by one stale turn that never completed. Read-only, production scripts/jsonl-lines.mjs lfLines, in-memory, no snapshot files; no message or tool content read. Full numbers: lifecycle-witness.json (native turn ids and 1-based LF row numbers retained).

Known Codex lead rollout (live file, now 27,517 LF rows, 0 unparsable; it has grown since the 27,301-row scout read).

Witness (a): task_started while another turn id is open
- 85 task_started, 83 task_complete, 0 duplicate starts, 0 duplicate completes, 0 complete-before-start.
- 80 of 85 starts occurred while another turn was open. All 80 have a DIFFERENT root_turn_id than the open turn, 0 same-root, 0 unknown roots, and 0 whose root equals an open turn's id.
- Shape: root_turn_id equals the row's own turn_id on all 85 starts (every turn is its own root), and no root_turn_id ever names another turn. So this rollout shows NO nesting: equal or linked root ids never occur, and "descendant via root_turn_id" cannot be established from any row. The 80 overlaps are supersession, not nesting.
- The open-set at EOF is 2 turns: 01a0e295-3b13-7520-ac52-02d56a351c85 (started row 2010, 2026-09-27T11:17:05.990Z; 80 later turns started after it; never completed) and 01a0f45e-7733-7a51-8dee-76fa2f7fbf97 (started row 27099, 2026-09-30T22:10:26.759Z; last turn, 0 later turns, plausibly live). Abort vs running for either is not observable (no abort/interrupt event type exists in the file).

Witness (b): ordering
- Timestamp reversals: 0 (none missing either). Tool call/output: 3,144 calls, 3,144 outputs, 0 output-before-call, 0 duplicate call ids, 0 unpaired at EOF (the earlier "4 unpaired" came from the readline-split scan and file growth; retract it).

Oracle check (gaps of at least 120 min, 11 total, same as before)
- 2 between turns (open set empty: rows 684-685 at 126 min, rows 1934-1935 at 647 min).
- 9 "in-turn": rows 4813-4814 (252), 7086-7087 (184), 8666-8667 (493), 8667-8668 (553), 19137-19138 (485), 19138-19139 (430), 26889-26890 (544), 26981-26982 (176), 27097-27098 (332 min). In every one of the 9 the ONLY open turn is the stale 01a0e295 (started row 2010); the turn that actually ran around those gaps had completed. So 9 of 9 are false in-turn silence under a started-without-complete state machine; real in-turn evidence for any gap is 0.
- F3's supposed fix holds against this data: a turn followed by a start of a turn that is neither it nor a same-root descendant has an unobserved end (here: 01a0e295 from row 2011 onward), and the unobserved end is the correct PARTIAL reason. Since no start ever shares a root, "descendant via root_turn_id" is an untested branch here; a synthetic fixture must cover it, and the rule must not treat equal root alone as nesting without a documented shape.
- Not supported by this file: nested-turn shape, abort events, whether the 9/27 turn was interrupted or lost. Only the 2 gaps with no open turn are cleanly between-turn; their cause (owner idle vs host stall) remains unobservable.
