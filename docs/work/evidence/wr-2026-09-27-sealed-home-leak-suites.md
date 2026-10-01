VERDICT: PASS be8028019245ea7aa7b5e374242d603ae5326c37 (lead-run suites and live count, supporting evidence, not the deciding review)

# Lane 24 suites and live count (skills-n)

Linux (Netcup), full suite at a26c5fc (scripts identical to be80280), real /tmp, one run:
2026-09-28T02:31:49Z
before: 129 (ls -d /tmp/sealed-home* | wc -l)
swept 72 stale sealed homes (the run's own sweep line; the 57 left are all younger than 6 h, from 4 PM to 7:59 PM NY, none from this run)
a26c5fc
exit=0
after: 57
2026-09-28T02:32:10Z
ℹ skipped 0
ℹ tests 2371
ℹ pass 2367
ℹ fail 0
ℹ skipped 4

Windows (ben-desktop), full suite at be80280 from an origin bundle:
warning: You appear to have cloned an empty repository.
be80280 fix(scripts): make the F1 test signal a running probe, seal spawn envs, add F3 coverage (lane 24 round 2)
swept 0 stale sealed homes
ℹ tests 2371
ℹ pass 2363
ℹ fail 0
ℹ skipped 8
✖ failing tests:
✖ probe (4.8876ms)

(the ✖ probe line is the intentional failing probe the lane's own tests spawn)

Windows at f8aa816, earlier: first sweep removed 1743 stale homes; 3 fail, see docs/specs/sealed-home-leak-1/reports/windows-r1-f8aa816.log
