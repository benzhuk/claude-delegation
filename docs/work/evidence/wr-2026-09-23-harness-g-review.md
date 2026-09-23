VERDICT: APPROVE f5cd1ec3b29da46ffebfbe6b147ae712fd8f7c98
Work: wr-2026-09-23-harness-g
Reviewed delta: dd25b0883e1d041d322bd5dda063e131a8c2f2e7..f5cd1ec3b29da46ffebfbe6b147ae712fd8f7c98

All four prior blocking findings are resolved for the scoped source patch.

Cause / Fix location / Discriminating check:
- Lost findings: ladder-workflow.js judgeDigest now includes index, target, stage status, finding, sources and reason. Independent prompt capture confirms both a unique positive research fact and structured access-denial prose reach the judge, including the affected index. Public coverage shape is retained.
- Citation laundering: every normalized nonempty judge citation must belong to complete research sources. Independent mixed real/fabricated citation probe now returns inconclusive; legitimate partial research with only attributable evidence still returns PASS and exposes unavailable coverage.
- Malformed caps: input type guard rejects arrays, objects, booleans, empty/whitespace strings and noninteger numbers before dispatch. Independent probes observed zero calls and required/provided error text for all six cases. Numeric-string cap '3' remains compatible and dispatches exactly three calls for one target.
- G2 omission: delegate SKILL.md now provides prior-report retrieval, unresolved delta, underlying/common problems, alternatives, provenance/versions, counterevidence/limits and discovery-versus-validation guidance. It explicitly separates native Claude/Codex execution from the optional Claude Workflow adapter. No separate research skill or runtime was added.

Simplification: internal judge digest plus scalar guard and evidence-membership condition; existing shared skill contains the host-independent research discipline. No retries, hidden calls, filesystem globals, new runtime, or extra public result keys.

Independent validation:
- Read prior review, updated builder report and full three-file delta; verified worktree HEAD exactly matches the approved SHA.
- One focused inline Node AsyncFunction probe of actual workflow source passed finding/denial visibility, invalid mixed citation rejection, valid partial evidence, six malformed cap cases, numeric-string compatibility and omitted-callback accounting.
- Both parallel and pipeline callbacks omitted: two duplicate target positions remain visible with read/research not-run, only the judge is attempted (cost.agents=1), verdict inconclusive.
- Builder reports 20/20 scoped tests pass. That gate is attributed builder evidence; this review independently ran the focused probe instead of repeating the suite.

Nonblocking test observation: the new missing-slot fixture uses [await thunks[0]], which returns a function rather than invoking the reader callback. Its expected two calls are consistent with zero reader calls, one researcher and one judge. Improve the fixture to call thunks[0]() and expect three calls if its intended scenario is one successful reader plus one missing slot. This does not undermine the independently verified omitted-callback behavior or warrant withholding this source approval.

Limits: complete is now explicitly schema-reported evidence, not mechanical proof of source access. The judge/owner still must inspect material references; arbitrary model declarations cannot be authenticated by string validation. Exact-string citation membership can conservatively reject equivalent path aliases. Approval covers source and focused injected-runtime behavior, not live Workflow schema integration, installed discovery, or end-to-end cross-host execution. No live Workflow run, repository edits, configuration changes, extra agents or background processes.
