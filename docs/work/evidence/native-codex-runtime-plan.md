VERDICT: TEMPORARY-HOME AUTH IS THE ONLY SUPPORTED ROUTE FOUND

Local Codex is `0.156.1`. `codex exec` supports `--ephemeral` and
`--ignore-user-config`; the latter skips `$CODEX_HOME/config.toml` while still taking
auth from that home. It is incompatible with a temporary marketplace/plugin
registration: `codex plugin marketplace add` and `codex plugin add` store their
records in that config. There is no CLI `--plugin`, `--marketplace`, or cache-source
flag on `exec` or `debug prompt-input`.

The released 0.18 package has the documented repo marketplace and explicit empty OpenAI
hook file. Its project setting is only `plugins."delegation@delegation".enabled=true`;
official guidance defines it as an enable/disable toggle, not a source/cache declaration.
A no-model preflight from the 0.18 root using that `-c` setting and the existing
authenticated home exited 0 but did not expose `delegation:multi` in prompt input. The
user config SHA-256 was unchanged. `debug prompt-input` has no `--ignore-user-config`,
and `codex debug` rejects `--strict-config`, so it cannot validate the exact exec
layering without a model call.

The concrete safe trial uses a fresh temporary home; do NOT pass
`--ignore-user-config`, because that temporary config is the deliberately isolated
registration state:

```powershell
$trialHome = Join-Path $env:TEMP ("delegation-codex-018-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $trialHome | Out-Null
$env:CODEX_HOME = $trialHome
codex login --device-auth                 # interactive user action in the temporary home
$market = (codex plugin marketplace add <released-0.18-package-root> --json | ConvertFrom-Json).marketplaceName
codex plugin add "delegation@$market" --json
codex debug prompt-input                  # preflight: verify delegation:multi source/path
codex exec --ephemeral --sandbox read-only --skip-git-repo-check `
  'Use $delegation:multi to state, in one sentence, how to hand work to an equal peer. Do not use tools, files, hooks, or external communication.'
```

The marketplace and plugin records are confined to the named temporary `CODEX_HOME`; the
model session itself is ephemeral. The package's explicit empty OpenAI hook file must
remain in the released root package, so no plugin hook is trusted or executed. No hook
bypass flag is used. Capture the final response and preflight path, then remove only
that named temporary directory after review.

Boundary: using the existing authenticated profile without changing it is unsupported by
the inspected CLI/schema. A fresh home requires an attended device-auth step. This is
not a claim that a hidden config override is impossible; it is the concrete boundary
after inspecting the available CLI/config surface and a read-only prompt preflight. The
prior coexistence probe also shows prompt input may retain the host known-folder `r0`
skill root, so any trial proves explicit `delegation:multi` use, not personal-skill
precedence or a fully profile-isolated prompt. No model call, config mutation,
credential read/copy, hook trust, or installation was performed while preparing this
plan.
