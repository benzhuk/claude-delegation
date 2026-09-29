VERDICT: FAIL 0824e76e0372390f7309756462053a4cb8aba489 (Windows full suite: 3030 tests, 2996 pass, 1 fail, 33 skipped; the fail is N2, whose exemption keys use / while Windows paths use backslashes)

✖ N2: no test file in this suite inherits the runner environment on its own (47.3493ms)
  AssertionError [ERR_ASSERTION]: these node-direct spawn sites pass NO env key at all, inheriting the runner's whole environment: hooks\codex-unsupported.test.mjs:438 [spawnSync] passes no env key at all, scripts\bugfix-fields.test.mjs:21 [spawnSync] passes no env key at all, scripts\bugfix-fields.test.mjs:113 [spawnSync] passes no env key at all, scripts\prefix-test.test.mjs:91 [spawnSync] passes no env key at all, scripts\work-record.test.mjs:1778 [spawnSync] passes no env key at all, skills\decisions\scripts\decisions-read.test.mjs:440 [spawnSync] passes no env key at all, skills\decisions\scripts\decisions-read.test.mjs:720 [spawnSync] passes no env key at all, skills\decisions\scripts\decisions-read.test.mjs:727 [spawnSync] passes no env key at all, skills\decisions\scripts\goals-mirror.test.mjs:30 [spawnSync] passes no env key at all
  + actual - expected
  
  + [
  +   'hooks\\codex-unsupported.test.mjs:438 [spawnSync] passes no env key at all',
  +   'scripts\\bugfix-fields.test.mjs:21 [spawnSync] passes no env key at all',
  +   'scripts\\bugfix-fields.test.mjs:113 [spawnSync] passes no env key at all',
  +   'scripts\\prefix-test.test.mjs:91 [spawnSync] passes no env key at all',
  +   'scripts\\work-record.test.mjs:1778 [spawnSync] passes no env key at all',
  +   'skills\\decisions\\scripts\\decisions-read.test.mjs:440 [spawnSync] passes no env key at all',
  +   'skills\\decisions\\scripts\\decisions-read.test.mjs:720 [spawnSync] passes no env key at all',
  +   'skills\\decisions\\scripts\\decisions-read.test.mjs:727 [spawnSync] passes no env key at all',
  +   'skills\\decisions\\scripts\\goals-mirror.test.mjs:30 [spawnSync] passes no env key at all'
  + ]
  - []
  
