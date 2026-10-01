VERDICT: PASS 1799/1804

## Test Results

**Summary:**
- Total: 1804 tests
- Passed: 1799
- Failed: 2 (both expected)
- Skipped: 3
- Duration: 15991ms

## Known Expected Failures

Both failing tests are documented expected failures on Linux:

1. **H6 in note-send.test.mjs** - Plain checkout path resolution on Linux
   - Location: skills/multi/scripts/note-send.test.mjs:367
   - Issue: Path separator normalization (backslashes) on Linux systems

2. **V4 in mirror-shim.test.mjs** - Shim file exclusion
   - Location: skills/multi/scripts/mirror-shim.test.mjs:269
   - Error: SKILL_FILE_EXCLUDE let a .test.mjs file publish

## Temporary Clone

The sealed test suite was cloned at:
```
/tmp/tmp.agzveovuZg/repo
```

This checkout is available on the Netcup Linux host (ssh ben@100.69.249.18) for inspection.

The sealed home was preserved at:
```
/tmp/sealed-home-woensp
```

## Summary

All tests passed except for the two documented expected failures. The sealed test suite for build/janitor-origin-1 at commit 6c9bc850ae4be8bef4cf6086935923b0c88b137f ran successfully on Linux with no unexpected failures.

## Rerun at 70f639bae113d97c1577fb3c3f86eb55825d6430 (lead, same clone, bash -lc)
Failures: exactly V4 (mirror-shim) and H6 (note-send), main's own; log /tmp/tmp.agzveovuZg/suite-r2.log on Netcup.
