Work: wr-2026-09-23-native-regression-runner
Scope: docs/specs/2026-09-23-native-regression-runner.md
Owner: skills-a
Status: rejected
Authority: Ben requests useful continuous parallel building and live testing; disposable native fixtures and source packaging authorized; no real profile, auth or installation changes
Artifact: a2dc608
Evidence: docs/work/evidence/native-regression-runner-rejected-a2dc608.md
Next: same builder replaces temporary-fixture wrapper with portable self-contained default-prompt runner, then independent review
Opened: 2026-09-24T02:21:51Z
Builder: GPT-5.6-Terra
Rounds: 2
Log: 2026-09-24T02:21:51Z runnable skills-a prerequisite met: actual native fixture exists and reproduces a release-blocking default-prompt failure; territory disjoint from normalizer fix
Log: 2026-09-24T02:27:08Z rejected skills-a first candidate retained absolute temporary dependencies and omitted required defaultprompt coverage; receipt recorded after dispatch, same builder repairing exact contract defects

Predicts: A repeatable default native execution gate will catch host and transcript regressions that synthetic callback tests miss, without requiring real provider calls or production configuration.
Observed: Temporary actual-native fixtures found and verified repair of a two-tool coverage failure. First packaging attempt was rejected for retaining temporary dependencies and false portability/defaultprompt claims; it is not accepted source.
