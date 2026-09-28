VERDICT: PASS 3ff71effc9cb9933edcb7446d1412e32bd2b8f98 (lead-run live proof, supporting evidence, not the deciding review)

# Lane 46 live proof on Netcup: one full suite, /tmp unchanged

One full `node scripts/run-tests.mjs` from the lane worktree (code at 3ff71ef). The counts were taken immediately before and after the run. The prefix count uses the branch's own LEAK_PREFIX_RE.

| | UTC | df -i /tmp used | LEAK_PREFIX_RE entries in /tmp | delegation-test-run-* roots |
|---|---|---|---|---|
| before | 2026-09-28T22:45:40Z | 400749 | 30588 | 2 |
| after | 2026-09-28T22:46:02Z | 400752 | 30588 | 2 |

The run exited 0, with tests 2670, pass 2665 and fail 0. Its last line was `leak check: 0 new temp entries`.

How to read it: the prefix count and the root count did not change at all. The used-inode count moved by 3 on a host where other sessions were working at the same time. Before this lane, one full suite left about 1,300 directories in /tmp (Windows run 2 at 2455f1d counted 1,304 from a legacy run). The two existing roots are the builder's own round-0 failed runs, each trimmed to its retained sealed home as P2 specifies. The 24 h dead-pid sweep removes them.
