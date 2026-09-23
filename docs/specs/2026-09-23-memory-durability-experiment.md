# Memory durability experiment — ready for owner review

## Observed contract (read-only inspection, 2026-09-23)
- Capture writers target `~/.claude/knowledge/_inbox/`: the knowledge skill directs an in-session writer there; `distill-session.sh` is a fail-open, capped backstop writer there.
- Triage is the sole promoter/archiver and runs only when Ben invokes it. It must not be part of this experiment.
- `chezmoi source-path` maps knowledge files to `C:/Users/benzh/.local/share/chezmoi/dot_claude/...`; `chezmoi update` is an inbound pull-and-apply operation. The source repo's `origin` is `github.com/benzhuk/dotfiles.git`.
- No inspected contract provides automatic reverse publication of a new capture. README omits `knowledge/` from its managed-path table, conflicting with the observed source mapping; it is not publication evidence.

## Hypothesis and discriminator
Hypothesis: a fixture can be retained locally yet fail to reach a second host because capture, publication, and inbound update are separate steps. A matching SHA-256 after the second host's ordinary `chezmoi update` distinguishes end-to-end transport from local retention.

## Host A preflight and fixture (writer authority required)
Run in Windows PowerShell once, after replacing the UUID token with a new UUID. The preflight refuses a non-main, dirty, or non-origin/main checkout before any fixture exists:
```powershell
$ProbeRun = 'memory-durability-probe-20260923-REPLACE-WITH-UUID'
$ProbeRepo = 'C:\Users\benzh\.local\share\chezmoi'; $ProbeBranch = 'main'
$ProbeInbox = Join-Path $HOME '.claude\knowledge\_inbox'
$ProbeName = "2026-09-23-$ProbeRun.md"; $ProbeFile = Join-Path $ProbeInbox $ProbeName
if (Test-Path -LiteralPath $ProbeFile) { throw "Refusing existing probe: $ProbeFile" }
git -C $ProbeRepo fetch origin $ProbeBranch; if ($LASTEXITCODE) { throw 'origin fetch failed' }
$ProbeRepoRoot = [IO.Path]::GetFullPath((Resolve-Path $ProbeRepo).Path)
$ProbeTop = git -C $ProbeRepo rev-parse --show-toplevel; if ($LASTEXITCODE -or [IO.Path]::GetFullPath($ProbeTop) -ne $ProbeRepoRoot) { throw 'unexpected source repository' }
$ProbeOriginUrl = git -C $ProbeRepo remote get-url origin; if ($LASTEXITCODE -or $ProbeOriginUrl -ne 'https://github.com/benzhuk/dotfiles.git') { throw 'unexpected origin URL' }
$ProbeCurrentBranch = git -C $ProbeRepo branch --show-current; if ($LASTEXITCODE -or $ProbeCurrentBranch -ne $ProbeBranch) { throw 'source repo is not main' }
$ProbeDirty = git -C $ProbeRepo status --porcelain; if ($LASTEXITCODE -or $ProbeDirty) { throw 'source repo is not clean' }
$ProbeHead = git -C $ProbeRepo rev-parse HEAD; if ($LASTEXITCODE) { throw 'HEAD resolution failed' }
$ProbeOrigin = git -C $ProbeRepo rev-parse "origin/$ProbeBranch"; if ($LASTEXITCODE) { throw 'origin/main resolution failed' }
if ($ProbeHead -ne $ProbeOrigin) { throw 'source HEAD differs from origin/main' }
$ProbeBody = @"
---
date: 2026-09-23
project: memory-durability-probe
machine: win32
session_id: $ProbeRun
status: pending
---

## Synthetic durability probe

Fixture for a one-time transport experiment. It carries no private lesson and must remain pending; do not triage it during this experiment.

Suggested topic file: new
"@
New-Item -ItemType Directory -Force -Path $ProbeInbox | Out-Null
New-Item -ItemType File -Path $ProbeFile -Value $ProbeBody -ErrorAction Stop | Out-Null
$ProbeHashA = (Get-FileHash -LiteralPath $ProbeFile -Algorithm SHA256).Hash
"HOST_B_PROBE_NAME='$ProbeName'"; "HOST_B_PROBE_SHA256='$ProbeHashA'"
```
Expected observation: Host A prints literal filename and hash. This proves only local capture retention.

## Scoped publication (separate owner approval required)
Continue on Host A only if the preceding preflight succeeded. This stages and commits exactly the fixture; it does not modify identity or include any other path:
```powershell
chezmoi add $ProbeFile; if ($LASTEXITCODE) { throw 'chezmoi add failed' }
$ProbeSource = chezmoi source-path $ProbeFile; if ($LASTEXITCODE) { throw 'source mapping failed' }
$ProbeSourceRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ProbeSource)))
if ([IO.Path]::GetFullPath((Resolve-Path $ProbeSourceRoot).Path) -ne $ProbeRepoRoot) { throw 'fixture mapped outside expected source repository' }
$ProbeRelative = [IO.Path]::GetRelativePath($ProbeRepo, $ProbeSource).Replace('\','/')
if ($ProbeRelative -eq '..' -or $ProbeRelative.StartsWith('../')) { throw 'fixture relative path escapes source repository' }
git -C $ProbeRepo add -- $ProbeRelative; if ($LASTEXITCODE) { throw 'scoped stage failed' }
$ProbeStaged = @(git -C $ProbeRepo diff --cached --name-only)
if ($ProbeStaged.Count -ne 1 -or $ProbeStaged[0] -ne $ProbeRelative) { throw 'refusing non-fixture staged set' }
git -C $ProbeRepo commit --only -m "test: publish $ProbeRun memory durability probe" -- $ProbeRelative
if ($LASTEXITCODE) { throw 'scoped commit failed' }
$ProbeCommitFiles = @(git -C $ProbeRepo diff-tree --no-commit-id --name-only -r HEAD)
if ($ProbeCommitFiles.Count -ne 1 -or $ProbeCommitFiles[0] -ne $ProbeRelative) { throw 'unexpected commit contents' }
git -C $ProbeRepo push origin "HEAD:refs/heads/$ProbeBranch"; if ($LASTEXITCODE) { throw 'explicit main push failed' }
```

## Host B readback (macOS/Linux POSIX shell; separate owner approval required)
Paste the two **literal** `HOST_B_...` values emitted on Host A below; do not rely on Host-A variables. Verify commands exist before the ordinary inbound update:
```sh
PROBE_NAME='PASTE-HOST_B_PROBE_NAME-LITERAL'
PROBE_SHA256='PASTE-HOST_B_PROBE_SHA256-LITERAL'
command -v chezmoi >/dev/null || { echo 'chezmoi unavailable' >&2; exit 1; }
command -v node >/dev/null || { echo 'node unavailable' >&2; exit 1; }
chezmoi update || { echo 'chezmoi update failed' >&2; exit 1; }
node - "$PROBE_NAME" "$PROBE_SHA256" <<'NODE'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const [name, expected] = process.argv.slice(2), file = path.join(process.env.HOME, '.claude', 'knowledge', '_inbox', name);
if (!fs.existsSync(file)) throw new Error(`missing probe: ${file}`);
const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
if (actual !== expected.toUpperCase()) throw new Error(`hash mismatch: ${actual}`);
console.log(`NAME=${name}\nSHA256=${actual}`);
NODE
```
Expected success: Host B reports the literal name and matching hash after `chezmoi update`. Record Host A/B, source commit, update output, and both hashes in an evidence note.

## Interpretation and pending authority
- Host A only: local capture retained; cross-machine durability unproven.
- Host B missing/different: publication or ordinary-update transport failed; preserve outputs and do not infer a repair.
- Host B matching: one synthetic inbox fixture survived explicit publication plus ordinary update and readback. It does not prove automatic capture, triage, retrieval use, conflict handling, or ongoing upkeep.
- Pending Ben authority: create the live fixture, modify/push the dotfiles repository, run `chezmoi update` on a second host, and choose whether inbox publication is the intended durable writer model.
- Reuse: existing template, `chezmoi` source mapping/update, and current capture/triage contracts. No new runtime, scheduler, publication service, test, or source change is proposed.

No live operation was run and this note makes no claim of installed or cross-machine proof.
