VERDICT: BLOCKED b726ff9ad09f3e403ade74d27ab0a497c742c729

# Lane 37 changed-source Windows sealed gate

Preflight observed an active Windows process before mutex admission: PID 536, `C:\nvm4w\nodejs\node.exe scripts/run-tests.mjs`. Per the no-overlap rule, this lane did not acquire `Global\claude-verify`, set `TEMP`/`TMP`, or start a suite; counts and native exit are unavailable rather than inferred. No wait loop or retry ran.

Artifact check: integration HEAD is `b726ff9ad09f3e403ade74d27ab0a497c742c729`; `origin/build/codex-parity-37` resolves to the same SHA. The diff from the passing proof revision `c6212e56739e13cf3e353a636716d5ce15bc23ec` to this SHA is empty for `hooks/multi-codex-hook.mjs`, so the native proof in `L37-native-proof-r2.md` carries unchanged. The changed paths include the two reported suite-failure territories: `scripts/native-package.test.mjs` and `hooks/codex-unsupported.test.mjs`/JSON.

No source, record, or commit changed in this gate attempt. A new authorized gate may run only after the existing process is gone, under the bounded mutex, against this exact SHA.
