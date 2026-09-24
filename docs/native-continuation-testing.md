# Native continuation smoke

Run this opt-in developer gate only with the locally installed Claude executable:

```powershell
node scripts/native-continuation-smoke.mjs --claude C:\Users\benzh\.local\bin\claude.exe
```

It creates a fresh output directory unless `--output <new-or-empty-directory>` is supplied. The driver uses disposable homes, a dummy API key, a loopback Messages endpoint, and the checkout's native continuation hook. It never belongs in the sealed suite.

The gate requires more than exit status: native `PostToolUse` and `Stop` callbacks, model-visible `Continuation epoch … Host: claude; session: …` context, accounted Stop silence, a native interrupt acknowledgement, and an unbound replacement episode. Its summary contains counts and structural result flags only.

Cause: native continuation regressions previously depended on short-lived sessions and hand-fed hook data.

Discriminating check: callbacks must arise from the installed CLI against the synthetic Messages endpoint, with bounded fixture Bash tools.

Fix location: `scripts/native-continuation-smoke.mjs` is a developer-only runner; production behavior stays in `hooks/continuation-native.mjs` and `hooks/multi-inbox.js`.

Simplification: the corrected independent fixture drivers provide the local protocol model while this command supplies opt-in invocation, output isolation, and explicit structural assertions.
