# Native continuation smoke

This explicit developer gate runs the current checkout’s real Claude hook through an installed Claude executable while a local synthetic Messages endpoint supplies deterministic responses:

```powershell
node scripts/native-continuation-smoke.mjs --claude C:\Users\benzh\.local\bin\claude.exe
```

Use `--output <new-or-empty-directory>` to retain results at a chosen location. Existing nonempty directories are rejected. The runner resolves the plugin root from its own source location, so it can be invoked by absolute path from an unrelated working directory.

The three scenarios exercise the default system prompt with one unaccounted correction and native refire; binding plus accounting from model-visible CLI results followed by quiet completion; and native interruption followed by a replacement episode and a stale old-epoch bind that must return `STALE_EPOCH` while the replacement remains unbound.

The runner invokes the exact absolute `--claude` executable and records its version. Each scenario gets disposable home, config, agent state, repository, settings, hook wrapper, and event files below the output directory. Child environments use an OS/path/temp allowlist plus those disposable locations, a dummy key, and a loopback URL. No real settings source, authentication, provider, Orca identity, peer transport, or sandbox bypass is used.

The response server derives host, session, epoch, and accounting revision only from hook context and tool-result JSON visible in actual Messages requests. Continuation state is read only after the native process exits, for assertions. Processes and servers have bounded lifetimes; failures return nonzero and preserve the output tree.

Success requires native hook counts, one correction/refire, interrupt acknowledgement, replacement disarming, `STALE_EPOCH`, and a default-prompt transcript larger than 64 KiB. Accounted completion must include a successful account JSON result visible in the native Messages history and one matching active, bound, unattempted state whose `accountedRevision` equals that result; a merely quiet Stop cannot pass. `summary.json` contains structural counts and flags rather than prompt or environment contents.

On timeout the runner terminates and awaits the exact process tree it spawned. It also tracks sockets accepted by its own loopback server and force-closes only those sockets if normal server shutdown exceeds its separate deadline. This cleanup path is infrastructure failure handling and is not used as interruption evidence; the interrupt scenario still requires Claude’s native control acknowledgement.

This smoke is intentionally excluded from the regular sealed suite. It proves observed Claude mechanics against synthetic responses; it does not prove model judgment, useful outcomes, token cost, Codex behavior, or universal host support.
