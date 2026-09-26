export const meta = {
  name: 'build-loop',
  description: 'The whole spec\'d build as one Workflow call: setup, builders write per territory, an independent reviewer verifies, an integrator runs the mechanical gates, then a seam review and accept-prep close the loop. Launch from an Opus orchestrator pane only.',
  phases: [
    { title: 'Setup', detail: 'one Sonnet runner creates every territory worktree and writes every brief from the spec pack, when territories arrive unsetup' },
    { title: 'Build', detail: 'one Sonnet builder per territory writes against its pinned contracts' },
    { title: 'Review', detail: 'one Opus reviewer per territory adversarially verifies the delivered sha' },
    { title: 'Fix', detail: 'NEEDS_FIXES re-runs Build with the findings path, up to maxRounds' },
    { title: 'Integrate', detail: 'one Sonnet integrator runs the mechanical gates over every approved territory' },
    { title: 'Seam', detail: 'one Opus reviewer checks the cross-territory joints after Integrate, when an integration worktree is given' },
    { title: 'Accept', detail: 'one Sonnet runner builds the census, copies the deciding reports, and runs check-acceptance read-only' },
  ],
}

// build-loop-workflow — the whole spec'd build as one Workflow call: setup, build,
// review, fix, integrate, seam and accept-prep, launched from an Opus orchestrator pane
// (see skills/team-build/SKILL.md, "Running the loop from an Opus pane"). Two shapes of
// a `territories[]` entry select the path:
//   - GIVEN: worktree, branch and briefPath are all present — the pane already created
//     the worktrees (backward compatible; that path's mechanics are byte-for-byte the
//     same as before).
//   - SETUP: all three are absent — the script's own Setup stage spawns one
//     delegation:runner agent that creates every worktree from baseSha, scouts the tree
//     and writes every brief, then the script verifies its returned names against ones
//     it computed itself before trusting any of them.
// Mixing given and setup territories, or omitting specPath/baseSha/startedAt, is a
// launch error: the script returns at once with a blockers entry and spawns nothing.
//
// args (see build-loop-args.example.json for the new one-launch shape,
// build-loop-args.legacy.example.json for the old given-worktree shape):
//   specPath, baseSha, startedAt: string   all required
//   maxRounds?: number                     default 3; also caps seam fix rounds
//   territories: [{ id, gate?, briefPath?, worktree?, branch?, startFrom? }]
//   reviewerBriefPath?, integratorBriefPath?: string   required when every territory is
//     given; setup writes them otherwise
//   integrationWorktree?, integrationBranch?, integrationGate?: string   post-integrate
//     stages (Seam, Accept) run only when integrationWorktree is given
//   worktreeRoot?: string       default: integrationWorktree's parent directory
//   leadSession?, recordPath?, censusMarker?: string    accept-prep inputs (R8)
//   seam?: boolean              force/suppress Seam; default territories.length >= 2
//
// Returns exactly one object:
//   {
//     territories: [{ id, sha, verdict, rounds, reportPath, findingsPath, blocker }],
//     integrator: INTEGRATE | null,
//     seam: { verdict, sha, rounds, findingsPath, blocker } | null,
//     acceptance: ACCEPT_PREP | { skipped: reason } | null,
//     setup: { reportPath, reviewerBriefPath, integratorBriefPath, seamBriefPath } | null,
//     blockers: [{ id, reason }],
//   }
// seam and acceptance are null only when integrationWorktree is absent (the old,
// given-only behaviour); setup is null whenever territories arrived already given.
//
// The script sends no notes of its own (every rendered prompt carries the prohibition);
// the lead's only outward message after launch is its own RESULT once it has read this
// return and made its one acceptance judgment — the script never calls `accept` itself.

const BUILD = {
  type: 'object',
  properties: {
    sha: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS', 'FAIL', 'BLOCKED'] },
    reportPath: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['sha', 'verdict', 'reportPath', 'note'],
}

const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['APPROVE', 'NEEDS_FIXES'] },
    sha: { type: 'string' },
    findingsPath: { type: 'string' },
    blockerCount: { type: 'number' },
    majorCount: { type: 'number' },
  },
  required: ['verdict', 'sha', 'findingsPath', 'blockerCount', 'majorCount'],
}

const INTEGRATE = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL', 'BLOCKED'] },
    headSha: { type: 'string' },
    reportPath: { type: 'string' },
    failedGate: { type: 'string' },
    territory: { type: 'string' },
  },
  required: ['verdict', 'headSha', 'reportPath', 'failedGate', 'territory'],
}

// R3: the Setup stage's schema.
const SETUP = {
  type: 'object',
  properties: {
    territories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          worktree: { type: 'string' },
          branch: { type: 'string' },
          briefPath: { type: 'string' },
          gate: { type: 'string' },
          headSha: { type: 'string' },
        },
        required: ['id', 'worktree', 'branch', 'briefPath', 'gate', 'headSha'],
      },
    },
    reviewerBriefPath: { type: 'string' },
    integratorBriefPath: { type: 'string' },
    seamBriefPath: { type: 'string' },
    reportPath: { type: 'string' },
  },
  required: ['territories', 'reviewerBriefPath', 'integratorBriefPath', 'seamBriefPath', 'reportPath'],
}

// R5: the Accept-prep stage's schema.
const ACCEPT_PREP = {
  type: 'object',
  properties: {
    censusPath: { type: ['string', 'null'] },
    censusNote: { type: 'string' },
    integrationHead: { type: 'string' },
    evidencePaths: { type: 'array', items: { type: 'string' } },
    checkAcceptance: {
      type: 'object',
      properties: {
        exitCode: { type: 'number' },
        verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
        output: { type: 'string' },
      },
      required: ['exitCode', 'verdict', 'output'],
    },
    reportPath: { type: 'string' },
  },
  required: ['censusPath', 'censusNote', 'integrationHead', 'evidencePaths', 'checkAcceptance', 'reportPath'],
}

// One mandate line per stage, named once here rather than restated in every prompt — see
// L-C3: "Every stage's prompt names, in one line each, the mandate rules that matter
// there... it never restates the full briefs." R9: every rendered prompt carries the
// note-send prohibition, so it is baked into every mandate constant below.
const BUILD_MANDATE =
  'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; never set or switch a git identity; no destructive git (reset --hard, clean, stash, force-push, rm -rf). Never send peer notes.'
const REVIEW_MANDATE =
  'Report to disk; first line of your report is exactly `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, where <sha> is the same full `git rev-parse HEAD` you report as your sha field; you never modify, stage, or commit the code under review; no destructive git. Never send peer notes.'
const INTEGRATE_MANDATE =
  'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; you fix nothing and decide nothing; no destructive git; never push. Never send peer notes.'
const SETUP_MANDATE =
  'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; never set or switch a git identity; no destructive git (reset --hard, clean, stash, force-push, rm -rf); never push. Never send peer notes.'
const ACCEPT_MANDATE =
  'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; you never call accept and never write Status: accepted; no destructive git; never push. Never send peer notes.'

// T1 (loop-gates spec item 3, "the builder likewise"): the builder must also get its sha
// from git, never type one from memory, so build.sha and review.sha are two independent
// `git rev-parse HEAD` runs on the same commit rather than one value echoing the other.
const SHA_FROM_GIT =
  'After your last commit, run `git rev-parse HEAD` in the worktree and report its full 40-character output as your sha field; never type a sha from memory.'

// ---------------------------------------------------------------------------
// Pure string helpers — no `path` module, no fs, no shell (R1: the script has none of
// those; every path it computes is pure JS string manipulation over forward slashes).
// ---------------------------------------------------------------------------

// m1: strip a trailing slash first, so a lead-supplied integrationWorktree/Branch with a
// trailing "/" never nests a setup worktree inside itself or produces an empty slug.
function baseName(p) {
  const s = String(p ?? '').replace(/\/+$/, '')
  const idx = s.lastIndexOf('/')
  return idx === -1 ? s : s.slice(idx + 1)
}

function dirName(p) {
  const s = String(p ?? '').replace(/\/+$/, '')
  const idx = s.lastIndexOf('/')
  return idx === -1 ? '.' : s.slice(0, idx)
}

function stripExt(name) {
  const idx = name.lastIndexOf('.')
  return idx <= 0 ? name : name.slice(0, idx)
}

function workIdFromRecordPath(p) {
  const b = baseName(p)
  const suffix = '.record.md'
  return b.endsWith(suffix) ? b.slice(0, -suffix.length) : stripExt(b)
}

function buildPrompt(t, round, findingsPath) {
  if (findingsPath) {
    return `Fix round ${round} for territory ${t.id}. Brief: ${t.briefPath}. Worktree: ${t.worktree}. Gate: ${t.gate}. Reviewer findings: ${findingsPath}. Apply every reviewer-verified finding in one round. ${SHA_FROM_GIT} ${BUILD_MANDATE}`
  }
  return `Build territory ${t.id}. Brief: ${t.briefPath}. Worktree: ${t.worktree}. Gate: ${t.gate}. ${SHA_FROM_GIT} ${BUILD_MANDATE}`
}

// Both build.sha and review.sha now come from separate, independent `git rev-parse HEAD`
// runs (never one echoing the other); compare them normalized so formatting differences
// (case, surrounding whitespace) between two honestly-independent reads never manufacture
// a false review-sha-mismatch. Never equal when either side is empty/missing.
//
// Seam S1: an exact-only compare rejects a builder that reports (or copies from its own
// log) `git rev-parse --short` against a reviewer's full 40-hex read of the same commit —
// two honest, independent reads of the same commit at different lengths. Accept an
// unambiguous prefix (7 or more hex characters) of a full 40-hex sha as a match.
//
// Seam S5: an exact string match with no shape check would also call two equal
// non-sha strings (e.g. both sides literally "HEAD" or "unknown") a match. Both sides
// must look like a git sha (7-40 lowercase hex characters) before any comparison counts.
function sameSha(x, y) {
  const nx = String(x ?? '').trim().toLowerCase()
  const ny = String(y ?? '').trim().toLowerCase()
  const shaShape = /^[0-9a-f]{7,40}$/
  if (!shaShape.test(nx) || !shaShape.test(ny)) return false
  if (nx === ny) return true
  // A short sha from one honest `git rev-parse` reader and the full sha from the other
  // name the same commit: accept a prefix of at least 7 hex chars against a full 40-hex
  // sha. Both operands already passed shaShape above, so no further shape check is needed.
  const [short, full] = nx.length <= ny.length ? [nx, ny] : [ny, nx]
  return full.length === 40 && full.startsWith(short)
}

// Seam S1 (optional part): once sameSha has approved a build/review pair, prefer the
// longer of the two independently-read shas — when one side reported a short prefix and
// the other its full 40-hex read of the same commit, the integrator prompt always carries
// the full sha rather than whichever length the builder happened to report.
function longerSha(x, y) {
  const sx = String(x ?? '').trim().toLowerCase()
  const sy = String(y ?? '').trim().toLowerCase()
  return sy.length > sx.length ? sy : sx
}

// Never hands the reviewer the delivered sha to echo back (T1, loop-gates spec item 3):
// the reviewer's own `sha` field must come from running `git rev-parse HEAD` in the named
// worktree itself, then the workflow's own equality check (sameSha(review.sha, build.sha),
// below) compares that independently-computed value to what the builder reported -
// never a value read out of this prompt's text.
function reviewPrompt(reviewerBriefPath, t, round, build, priorBuildSha, priorFindingsPath) {
  let p = `Review territory ${t.id}, round ${round}. Reviewer brief: ${reviewerBriefPath}. Territory brief: ${t.briefPath}. Worktree: ${t.worktree}. Builder report: ${build.reportPath}. Run \`git rev-parse HEAD\` in the worktree yourself and report its full 40-character output as your sha field; never take a delivered sha on faith or echo one handed to you. ${REVIEW_MANDATE}`
  // MINOR 4 (T1 round-2 review): if a fix-round builder made no new commit, priorBuildSha
  // equals build.sha, and appending "priorBuildSha..HEAD" would put the exact sha the
  // reviewer is supposed to derive independently into the rendered prompt text for an
  // echoing reviewer to copy. Only append the range when the two shas actually differ.
  if (round >= 2 && priorBuildSha && !sameSha(priorBuildSha, build.sha)) {
    if (priorFindingsPath) p += ` Prior findings: ${priorFindingsPath}.`
    p += ` Commit range: ${priorBuildSha}..HEAD (run this in the worktree).`
  } else if (round >= 2) {
    if (priorFindingsPath) p += ` Prior findings: ${priorFindingsPath}.`
  }
  return p
}

function integratePrompt(integratorBriefPath, baseSha, approved, excluded, integration) {
  const approvedText = approved.length ? approved.map((r) => `${r.id}@${r.sha}`).join(', ') : 'none'
  const excludedText = excluded.length ? excluded.map((r) => `${r.id} (${r.blocker})`).join(', ') : 'none'
  const where = integration && integration.worktree
    ? ` Integration worktree: ${integration.worktree}${integration.branch ? ` (branch ${integration.branch})` : ''}; merge the approved territories there and report headSha from \`git rev-parse HEAD\` run in it.${integration.gate ? ` Full-suite gate: ${integration.gate}.` : ''}`
    : ''
  return `Integrator brief: ${integratorBriefPath}. Base sha: ${baseSha}. Approved territories and shas: ${approvedText}. Excluded (blocked) territories: ${excludedText}.${where} Include a territory only after its reviewer explicitly returned APPROVE for that exact sha; do not infer approval from an absent, NEEDS_FIXES, or mismatched review. ${INTEGRATE_MANDATE}`
}

// R3: the Setup stage's prompt — one runner, one pass, per-territory names computed HERE
// in pure JS (never chosen by the agent) so the script can verify what comes back.
function setupPrompt(specPath, baseSha, computed, reviewerBriefPath, integratorBriefPath, seamBriefPath, integrationWorktree, integrationBranch, integrationGate, reportPath) {
  const rows = computed
    .map((c) => `${c.id}: worktree ${c.worktree}, branch ${c.branch}, brief ${c.briefPath}`)
    .join('; ')
  const integrationText = integrationWorktree
    ? ` The integrator brief names integration worktree ${integrationWorktree}${integrationBranch ? `, branch ${integrationBranch}` : ''}${integrationGate ? `, full-suite gate ${integrationGate}` : ''}.`
    : ''
  return `Setup. Spec pack: ${specPath}. Base sha: ${baseSha}. Per territory, run \`git worktree add <worktree> -b <branch> ${baseSha}\` then \`git -C <worktree> rev-parse HEAD\`, reporting its full output verbatim as that territory's headSha (never copy the base sha from this prompt), using exactly these computed names, never your own choice: ${rows}. Scout every territory per skills/team-build/references/scout-brief.md, writing briefs/scout-<id>.md next to the spec, then write each territory's brief from the spec pack (spec, contracts, its own scout addendum, all by path) using the mandate template at docs/mandate-template.md, plus the reviewer brief at ${reviewerBriefPath}, the integrator brief at ${integratorBriefPath}, and the seam brief at ${seamBriefPath}.${integrationText} Report path: ${reportPath}. ${SETUP_MANDATE}`
}

// R4: the Seam stage's review prompt — same independent-git-read shape as reviewPrompt,
// scoped to the integration worktree rather than one territory's.
function seamPrompt(seamBriefPath, integrationWorktree, approvedIds, round, priorHead, priorFindingsPath, fixSha) {
  const idsText = approvedIds.length ? approvedIds.join(', ') : 'none'
  let p = `Seam review round ${round}. Seam brief: ${seamBriefPath}. Integration worktree: ${integrationWorktree}. Approved territories: ${idsText}. Run \`git rev-parse HEAD\` in the integration worktree yourself and report its full 40-character output as your sha field; never take a delivered sha on faith or echo one handed to you. ${REVIEW_MANDATE}`
  // M2 (twin of MINOR 4 in reviewPrompt): a no-commit seam-fix round makes priorHead the
  // live HEAD, so appending "priorHead..HEAD" would hand an echoing reviewer the exact sha
  // it is supposed to derive independently. Only append the range when the fix round's own
  // sha actually differs from priorHead.
  if (round >= 2 && priorFindingsPath) p += ` Prior findings: ${priorFindingsPath}.`
  if (round >= 2 && priorHead && !sameSha(priorHead, fixSha)) {
    p += ` Commit range: ${priorHead}..HEAD (run this in the worktree).`
  }
  return p
}

// R4: the seam fix-round builder's prompt — a builder call on the INTEGRATION worktree,
// gated by integrationGate rather than any one territory's gate.
function seamFixPrompt(integrationWorktree, integrationGate, findingsPath, round) {
  return `Seam fix round ${round}. Worktree: ${integrationWorktree}. Gate: ${integrationGate ?? 'the full-suite gate named in the integrator brief'}. Seam findings: ${findingsPath}. Apply every seam-reviewer-verified finding in one round. ${SHA_FROM_GIT} ${BUILD_MANDATE}`
}

// R5: the accept-prep runner's prompt — the four numbered steps of R5, verbatim.
function acceptPrepPrompt(recordPath, integrationWorktree, integrationBranch, leadSession, censusMarker, workId, decidingReports, seam, reportPath) {
  const decidingText = decidingReports.length ? decidingReports.join(', ') : 'none'
  const markerText = censusMarker ? ` --marker ${censusMarker}` : ''
  const seamLogText = seam && seam.verdict === 'APPROVE' ? `seam r${seam.rounds} APPROVE ${seam.sha}` : 'seam SKIPPED'
  let p = `Accept-prep. Record: ${recordPath}. Integration worktree: ${integrationWorktree}. Integration branch: ${integrationBranch}. `
  p += `1) From the delegation plugin root (resolve it yourself; scripts/build-census.mjs is the plugin's own script, never the integration worktree's or target repo's \`scripts/\`), run \`node scripts/build-census.mjs --lead <leadSession .jsonl>${markerText} --out ${integrationWorktree}/docs/work/evidence/${workId}-census.md\`, resolving leadSession \`${leadSession ?? '(none given)'}\` to its .jsonl path yourself when it is a session id rather than a path. If leadSession is absent or the census errors, write nothing and report censusPath: null with the reason in censusNote. `
  p += `2) Copy the deciding reports (last territory APPROVE per territory, last seam APPROVE) to ${integrationWorktree}/docs/work/evidence/${workId}-<lane>.md with original bytes (list them repo-relative in Evidence:): ${decidingText}. `
  p += `3) Write exactly these header lines of ${integrationWorktree}/${recordPath} and no others, before the first blank line: Status: reviewed, Artifact: ${integrationBranch}@<40-hex head>, Worktree: ${integrationBranch}, Evidence: (the copied paths), one Log: <iso> reviewed <owner> ${seamLogText} line. Never write accepted and never run accept. `
  p += `4) From the same delegation plugin root, run \`node scripts/work-record.mjs check-acceptance --record ${recordPath} --repo ${integrationWorktree} --delivery-ref ${integrationBranch}\` (read-only), capturing exit code and output. `
  p += `Report path: ${reportPath}. `
  p += ACCEPT_MANDATE
  return p
}

const a = args ?? {}
const specPath = a.specPath
const baseSha = a.baseSha
const startedAt = a.startedAt
const territories = Array.isArray(a.territories) ? a.territories : []
const reviewerBriefPath = a.reviewerBriefPath
const integratorBriefPath = a.integratorBriefPath
const maxRoundsCandidate = Number(a.maxRounds)
const maxRounds = a.maxRounds != null && Number.isFinite(maxRoundsCandidate) ? maxRoundsCandidate : 3
const integrationWorktree = a.integrationWorktree
const integrationBranch = a.integrationBranch
const integrationGate = a.integrationGate
const leadSession = a.leadSession
const recordPath = a.recordPath
const censusMarker = a.censusMarker

log(`build-loop: ${specPath ?? '(no specPath given)'} at ${baseSha ?? '(no baseSha given)'}, started ${startedAt ?? '(no startedAt given)'}, ${territories.length} territories, maxRounds ${maxRounds}`)

function earlyReturn(blockers) {
  return { territories: [], integrator: null, seam: null, acceptance: null, setup: null, blockers }
}

// R2: missing-args, checked before anything else — nothing spawns.
if (!specPath || !baseSha || !startedAt) {
  log('build-loop: missing-args, nothing spawned')
  return earlyReturn([{ id: '*', reason: 'missing-args' }])
}

// R2: mixed-territory-modes. A territory is GIVEN when worktree, branch and briefPath are
// all present, SETUP when all three are absent, and otherwise ambiguous (invalid) —
// which is folded into the same launch error rather than guessed at.
function territoryMode(t) {
  const hasWorktree = t.worktree != null
  const hasBranch = t.branch != null
  const hasBrief = t.briefPath != null
  if (hasWorktree && hasBranch && hasBrief) return 'given'
  if (!hasWorktree && !hasBranch && !hasBrief) return 'setup'
  return 'invalid'
}

const modes = new Set(territories.map(territoryMode))
if (modes.has('invalid') || (modes.has('given') && modes.has('setup'))) {
  log('build-loop: mixed-territory-modes, nothing spawned')
  return earlyReturn([{ id: '*', reason: 'mixed-territory-modes' }])
}
// Zero territories behaves like the old given-only path (empty build, integrator still
// runs once) — there is nothing to set up.
const setupMode = modes.has('setup')

// m2: validate startFrom as part of R2's args check, before anything spawns — an
// unvalidated sha would reach the integrator as an S5-class value (e.g. the literal
// "HEAD"), an unrecognized verdict would be silently ignored (running from round 1), a
// NEEDS_FIXES with no findingsPath would render the fresh-build prompt under a Fix
// label, and startFrom on a setup territory contradicts R6 ("Only valid on given
// territories"). The reason vocabulary needs the lead's OK to extend, so this folds into
// the existing missing-args reason rather than inventing 'invalid-start-from'.
const startFromShaRe = /^[0-9a-f]{7,40}$/i
for (const t of territories) {
  const sf = t.startFrom
  if (!sf) continue
  const invalid =
    setupMode ||
    !startFromShaRe.test(String(sf.sha ?? '').trim()) ||
    (sf.verdict !== 'APPROVE' && sf.verdict !== 'NEEDS_FIXES') ||
    (sf.verdict === 'NEEDS_FIXES' && !sf.findingsPath)
  if (invalid) {
    log(`build-loop: invalid startFrom on territory ${t.id}, nothing spawned`)
    return earlyReturn([{ id: '*', reason: 'missing-args' }])
  }
}

// ---------------------------------------------------------------------------
// R3: Setup stage — only when every territory arrived unsetup.
// ---------------------------------------------------------------------------

let finalTerritories = territories
let reviewerBriefPathFinal = reviewerBriefPath
let integratorBriefPathFinal = integratorBriefPath
let seamBriefPathFinal = null
let setupInfo = null

if (setupMode) {
  // m3: only mark the Setup phase entered when the stage actually runs — the given path
  // never enters Setup.
  phase('Setup')
  const specDir = dirName(specPath)
  const slug = integrationBranch ? baseName(integrationBranch) : stripExt(baseName(specPath))
  const worktreeRoot = a.worktreeRoot ?? dirName(integrationWorktree ?? '')
  const computed = territories.map((t) => ({
    id: t.id,
    branch: integrationBranch ? `${integrationBranch}-${t.id}` : `build/${slug}-${t.id}`,
    worktree: `${worktreeRoot}/wt-${slug}-${t.id}`,
    briefPath: `${specDir}/briefs/${t.id}.md`,
    gate: t.gate ?? null,
  }))
  const setupReviewerBriefPath = `${specDir}/briefs/reviewer.md`
  const setupIntegratorBriefPath = `${specDir}/briefs/integrator.md`
  const setupSeamBriefPath = `${specDir}/briefs/seam.md`
  const setupReportPath = `${specDir}/reports/setup.md`

  const setupOpts = {
    agentType: 'delegation:runner',
    model: 'sonnet',
    schema: SETUP,
    phase: 'Setup',
    label: 'setup',
  }
  const setupPromptText = setupPrompt(specPath, baseSha, computed, setupReviewerBriefPath, setupIntegratorBriefPath, setupSeamBriefPath, integrationWorktree, integrationBranch, integrationGate, setupReportPath)
  let setupResult = await agent(setupPromptText, setupOpts)
  if (setupResult === null) {
    log('setup: agent died, respawning once')
    setupResult = await agent(setupPromptText, setupOpts)
  }
  if (setupResult === null) {
    log('setup: agent died twice, giving up, nothing built')
    return earlyReturn([{ id: '*', reason: 'setup-failed' }])
  }

  const byId = new Map((Array.isArray(setupResult.territories) ? setupResult.territories : []).map((r) => [r.id, r]))
  for (const c of computed) {
    const row = byId.get(c.id)
    const mismatch =
      !row ||
      row.worktree !== c.worktree ||
      row.branch !== c.branch ||
      row.briefPath !== c.briefPath ||
      !sameSha(row.headSha, baseSha)
    if (mismatch) {
      log(`setup: territory ${c.id} failed verification, nothing built`)
      return earlyReturn([{ id: c.id, reason: 'setup-failed' }])
    }
  }

  finalTerritories = computed.map((c) => {
    const row = byId.get(c.id)
    return { id: c.id, briefPath: c.briefPath, worktree: c.worktree, branch: c.branch, gate: c.gate ?? row.gate }
  })

  // M5: the reviewer/integrator/seam brief paths are ALSO computed in the script (R3);
  // trust the computed names, but only after confirming the runner actually wrote where
  // it was told, so a wrong or attacker-controlled path can never be silently substituted.
  if (
    setupResult.reviewerBriefPath !== setupReviewerBriefPath ||
    setupResult.integratorBriefPath !== setupIntegratorBriefPath ||
    setupResult.seamBriefPath !== setupSeamBriefPath ||
    setupResult.reportPath !== setupReportPath
  ) {
    log('setup: returned reviewer/integrator/seam brief path or report path differs from the computed one, nothing built')
    return earlyReturn([{ id: '*', reason: 'setup-failed' }])
  }
  reviewerBriefPathFinal = setupReviewerBriefPath
  integratorBriefPathFinal = setupIntegratorBriefPath
  seamBriefPathFinal = setupSeamBriefPath
  setupInfo = {
    reportPath: setupResult.reportPath,
    reviewerBriefPath: reviewerBriefPathFinal,
    integratorBriefPath: integratorBriefPathFinal,
    seamBriefPath: seamBriefPathFinal,
  }
}

// ---------------------------------------------------------------------------
// Build / Review / Fix — R6 (startFrom) generalizes the entry round.
// ---------------------------------------------------------------------------

async function runTerritory(t) {
  const startFrom = t.startFrom

  // R6: APPROVE resumes straight to Integrate, no build, no review.
  if (startFrom && startFrom.verdict === 'APPROVE') {
    return {
      id: t.id,
      sha: startFrom.sha,
      verdict: 'APPROVE',
      rounds: 0,
      reportPath: null,
      findingsPath: startFrom.findingsPath ?? null,
      blocker: null,
    }
  }

  let round = 1
  let findingsForBuild = null
  let priorBuildSha = null
  let priorFindingsPath = null
  // R6: NEEDS_FIXES resumes at a fix round (round 2) against the prior findings path.
  if (startFrom && startFrom.verdict === 'NEEDS_FIXES') {
    round = 2
    findingsForBuild = startFrom.findingsPath ?? null
    priorBuildSha = startFrom.sha
    priorFindingsPath = startFrom.findingsPath ?? null
  }

  let state = { id: t.id, sha: null, verdict: 'BLOCKED', rounds: round, reportPath: null, findingsPath: null, blocker: null }

  phase(round === 1 ? 'Build' : 'Fix')
  const buildOpts1 = {
    agentType: 'delegation:builder',
    model: 'sonnet',
    schema: BUILD,
    phase: round === 1 ? 'Build' : 'Fix',
    label: `build:${t.id}:r${round}`,
  }
  let build = await agent(buildPrompt(t, round, findingsForBuild), buildOpts1)
  if (build === null) {
    log(`${t.id}: build agent died in round ${round}, respawning once`)
    build = await agent(buildPrompt(t, round, findingsForBuild), buildOpts1)
  }
  if (build === null) {
    log(`${t.id}: build agent died twice in round ${round}, giving up`)
    return { ...state, blocker: 'agent-died' }
  }
  state = { ...state, sha: build.sha, verdict: build.verdict, reportPath: build.reportPath, rounds: round }
  if (build.verdict !== 'PASS') {
    return { ...state, blocker: build.verdict === 'BLOCKED' ? 'builder-blocked' : 'build-failed' }
  }

  phase('Review')
  const reviewOpts1 = { agentType: 'delegation:reviewer', model: 'opus', schema: REVIEW, phase: 'Review', label: `review:${t.id}:r${round}` }
  let review = await agent(reviewPrompt(reviewerBriefPathFinal, t, round, build, priorBuildSha, priorFindingsPath), reviewOpts1)
  if (review === null) {
    log(`${t.id}: review agent died in round ${round}, respawning once`)
    review = await agent(reviewPrompt(reviewerBriefPathFinal, t, round, build, priorBuildSha, priorFindingsPath), reviewOpts1)
  }
  if (review === null) {
    log(`${t.id}: review agent died twice in round ${round}, giving up`)
    return { ...state, blocker: 'agent-died' }
  }
  state = { ...state, findingsPath: review.findingsPath }
  if (!sameSha(review.sha, build.sha)) {
    log(`${t.id}: review sha ${review.sha} did not match build sha ${build.sha}`)
    return { ...state, verdict: 'BLOCKED', blocker: 'review-sha-mismatch' }
  }
  state = { ...state, sha: longerSha(build.sha, review.sha) }

  while (review.verdict === 'NEEDS_FIXES' && round < maxRounds) {
    round += 1
    state = { ...state, rounds: round }
    priorFindingsPath = review.findingsPath
    priorBuildSha = build.sha

    phase('Fix')
    const buildOptsN = { agentType: 'delegation:builder', model: 'sonnet', schema: BUILD, phase: 'Fix', label: `build:${t.id}:r${round}` }
    build = await agent(buildPrompt(t, round, priorFindingsPath), buildOptsN)
    if (build === null) {
      log(`${t.id}: fix-round build agent died in round ${round}, respawning once`)
      build = await agent(buildPrompt(t, round, priorFindingsPath), buildOptsN)
    }
    if (build === null) {
      log(`${t.id}: fix-round build agent died twice in round ${round}, giving up`)
      return { ...state, blocker: 'agent-died' }
    }
    state = { ...state, sha: build.sha, verdict: build.verdict, reportPath: build.reportPath }
    if (build.verdict !== 'PASS') {
      return { ...state, blocker: build.verdict === 'BLOCKED' ? 'builder-blocked' : 'build-failed' }
    }

    phase('Review')
    const reviewOptsN = { agentType: 'delegation:reviewer', model: 'opus', schema: REVIEW, phase: 'Review', label: `review:${t.id}:r${round}` }
    review = await agent(reviewPrompt(reviewerBriefPathFinal, t, round, build, priorBuildSha, priorFindingsPath), reviewOptsN)
    if (review === null) {
      log(`${t.id}: review agent died in round ${round}, respawning once`)
      review = await agent(reviewPrompt(reviewerBriefPathFinal, t, round, build, priorBuildSha, priorFindingsPath), reviewOptsN)
    }
    if (review === null) {
      log(`${t.id}: review agent died twice in round ${round}, giving up`)
      return { ...state, blocker: 'agent-died' }
    }
    state = { ...state, findingsPath: review.findingsPath }
    if (!sameSha(review.sha, build.sha)) {
      log(`${t.id}: review sha ${review.sha} did not match build sha ${build.sha}`)
      return { ...state, verdict: 'BLOCKED', blocker: 'review-sha-mismatch' }
    }
    state = { ...state, sha: longerSha(build.sha, review.sha) }
  }

  if (review.verdict === 'NEEDS_FIXES') {
    log(`${t.id}: rounds-exhausted at round ${round}, still NEEDS_FIXES`)
    return { ...state, verdict: review.verdict, blocker: 'rounds-exhausted' }
  }

  if (review.verdict !== 'APPROVE') {
    return { ...state, verdict: 'BLOCKED', blocker: 'review-not-approved' }
  }

  return { ...state, verdict: 'APPROVE', blocker: null }
}

const parallelResults = await parallel(finalTerritories.map((t) => () => runTerritory(t)))
const results = finalTerritories.map((t, index) => {
  const result = Array.isArray(parallelResults) ? parallelResults[index] : null
  if (result != null) return result
  return {
    id: t.id,
    sha: null,
    verdict: 'BLOCKED',
    rounds: 0,
    reportPath: null,
    findingsPath: null,
    blocker: 'parallel-result-missing',
    failure: { stage: 'parallel', reason: 'missing-result', index },
  }
})

phase('Integrate')
const approved = results.filter((r) => r.verdict === 'APPROVE' && !r.blocker)
const excluded = results.filter((r) => r.blocker)
const integrateOpts = { agentType: 'delegation:integrator', model: 'sonnet', schema: INTEGRATE, phase: 'Integrate', label: 'integrate' }
const integrationInfo = { worktree: integrationWorktree, branch: integrationBranch, gate: integrationGate }
let integrate = await agent(integratePrompt(integratorBriefPathFinal, baseSha, approved, excluded, integrationInfo), integrateOpts)
if (integrate === null) {
  log('integrate: agent died, respawning once')
  integrate = await agent(integratePrompt(integratorBriefPathFinal, baseSha, approved, excluded, integrationInfo), integrateOpts)
}
if (integrate === null) {
  log('integrate: agent died twice, giving up')
  integrate = { verdict: 'BLOCKED', headSha: null, reportPath: null, failedGate: 'agent-died', territory: null }
}

// ---------------------------------------------------------------------------
// R4: Seam stage — after Integrate, only when an integration worktree is given.
// ---------------------------------------------------------------------------

let seam = null
const seamEnabled = typeof a.seam === 'boolean' ? a.seam : finalTerritories.length >= 2

if (!integrationWorktree) {
  seam = null
} else if (!seamEnabled || integrate.verdict !== 'PASS') {
  // m3: only mark the Seam phase entered when it actually runs.
  phase('Seam')
  seam = { verdict: 'SKIPPED', sha: null, rounds: 0, findingsPath: null, blocker: null }
} else {
  // m3: only mark the Seam phase entered when it actually runs.
  phase('Seam')
  const seamBriefToUse = setupMode ? seamBriefPathFinal : reviewerBriefPathFinal
  const approvedIds = approved.map((r) => r.id)

  let seamRound = 1
  const seamOpts1 = { agentType: 'delegation:reviewer', model: 'opus', schema: REVIEW, phase: 'Seam', label: `seam:r${seamRound}` }
  let seamReview = await agent(seamPrompt(seamBriefToUse, integrationWorktree, approvedIds, seamRound, null, null, null), seamOpts1)
  if (seamReview === null) {
    log(`seam: agent died in round ${seamRound}, respawning once`)
    seamReview = await agent(seamPrompt(seamBriefToUse, integrationWorktree, approvedIds, seamRound, null, null, null), seamOpts1)
  }
  if (seamReview === null) {
    log('seam: agent died twice, giving up')
    seam = { verdict: 'BLOCKED', sha: null, rounds: seamRound, findingsPath: null, blocker: 'agent-died' }
  } else if (!sameSha(seamReview.sha, integrate.headSha)) {
    log(`seam: review sha ${seamReview.sha} did not match integrator headSha ${integrate.headSha}`)
    seam = { verdict: 'BLOCKED', sha: null, rounds: seamRound, findingsPath: seamReview.findingsPath, blocker: 'review-sha-mismatch' }
  } else {
    let currentHead = longerSha(integrate.headSha, seamReview.sha)
    let verdict = seamReview.verdict
    let findingsPath = seamReview.findingsPath
    let blocker = null

    while (verdict === 'NEEDS_FIXES' && seamRound < maxRounds) {
      const priorFindings = findingsPath
      const priorHead = currentHead
      seamRound += 1

      phase('Seam')
      const seamFixOpts = { agentType: 'delegation:builder', model: 'sonnet', schema: BUILD, phase: 'Seam', label: `seam-fix:r${seamRound}` }
      let seamFixBuild = await agent(seamFixPrompt(integrationWorktree, integrationGate, priorFindings, seamRound), seamFixOpts)
      if (seamFixBuild === null) {
        log(`seam: fix-round build agent died in round ${seamRound}, respawning once`)
        seamFixBuild = await agent(seamFixPrompt(integrationWorktree, integrationGate, priorFindings, seamRound), seamFixOpts)
      }
      if (seamFixBuild === null) {
        log(`seam: fix-round build agent died twice in round ${seamRound}, giving up`)
        blocker = 'agent-died'
        verdict = 'BLOCKED'
        break
      }
      if (seamFixBuild.verdict !== 'PASS') {
        blocker = seamFixBuild.verdict === 'BLOCKED' ? 'builder-blocked' : 'build-failed'
        verdict = 'BLOCKED'
        break
      }

      phase('Seam')
      const seamReviewOptsN = { agentType: 'delegation:reviewer', model: 'opus', schema: REVIEW, phase: 'Seam', label: `seam:r${seamRound}` }
      let reReview = await agent(seamPrompt(seamBriefToUse, integrationWorktree, approvedIds, seamRound, priorHead, priorFindings, seamFixBuild.sha), seamReviewOptsN)
      if (reReview === null) {
        log(`seam: review agent died in round ${seamRound}, respawning once`)
        reReview = await agent(seamPrompt(seamBriefToUse, integrationWorktree, approvedIds, seamRound, priorHead, priorFindings, seamFixBuild.sha), seamReviewOptsN)
      }
      if (reReview === null) {
        log(`seam: review agent died twice in round ${seamRound}, giving up`)
        blocker = 'agent-died'
        verdict = 'BLOCKED'
        break
      }
      if (!sameSha(reReview.sha, seamFixBuild.sha)) {
        log(`seam: review sha ${reReview.sha} did not match seam-fix build sha ${seamFixBuild.sha}`)
        blocker = 'review-sha-mismatch'
        verdict = 'BLOCKED'
        break
      }
      currentHead = longerSha(seamFixBuild.sha, reReview.sha)
      verdict = reReview.verdict
      findingsPath = reReview.findingsPath
    }

    // m7: a territory row keeps its last sameSha-verified sha on rounds-exhausted (line
    // 544-ish); the seam row does the same, for parity — only a hard blocker (agent-died,
    // review-sha-mismatch, builder-blocked, build-failed) nulls the sha.
    let keepShaOnBlocker = false
    if (verdict === 'NEEDS_FIXES' && !blocker) {
      log(`seam: rounds-exhausted at round ${seamRound}, still NEEDS_FIXES`)
      blocker = 'rounds-exhausted'
      keepShaOnBlocker = true
    }

    seam = { verdict, sha: blocker && !keepShaOnBlocker ? null : currentHead, rounds: seamRound, findingsPath, blocker }
  }
}

// ---------------------------------------------------------------------------
// R5: Accept-prep stage — last, only when integrationWorktree and recordPath are given
// and seam is APPROVE or SKIPPED (and the integrator PASSed).
// ---------------------------------------------------------------------------

// m3: only mark the Accept phase entered when the stage actually runs.
if (integrationWorktree) phase('Accept')
let acceptance = null

let acceptHeadMismatch = false
let acceptReportMismatch = false

if (!integrationWorktree) {
  acceptance = null
} else if (!recordPath) {
  acceptance = { skipped: 'no-record-path' }
} else if (!integrationBranch) {
  acceptance = { skipped: 'no-integration-branch' }
} else if (integrate.verdict !== 'PASS') {
  acceptance = { skipped: 'integrator-not-pass' }
} else if (excluded.length > 0 || approved.length === 0) {
  // M4: R5 step 2 presupposes every territory has an APPROVE ("last territory APPROVE per
  // territory"); running accept-prep with a blocked or entirely-unapproved territory set
  // would write a false "Status: reviewed" header over an incomplete build.
  acceptance = { skipped: 'territory-blockers' }
} else if (!(seam === null || seam.verdict === 'APPROVE' || seam.verdict === 'SKIPPED')) {
  acceptance = { skipped: 'seam-not-approved' }
} else {
  const workId = workIdFromRecordPath(recordPath)
  // M1: the deciding evidence is each territory's last APPROVE — the reviewer's findings
  // file — never the builder's own report, which never carries the approving verdict.
  const decidingReports = approved.map((r) => r.findingsPath).filter(Boolean)
  if (seam && seam.verdict === 'APPROVE' && seam.findingsPath) decidingReports.push(seam.findingsPath)

  const acceptReportPath = specPath.startsWith('/')
    ? `${dirName(specPath)}/reports/accept-prep.md`
    : `${integrationWorktree}/${dirName(specPath)}/reports/accept-prep.md`
  const acceptOpts = { agentType: 'delegation:runner', model: 'sonnet', schema: ACCEPT_PREP, phase: 'Accept', label: 'accept-prep' }
  const acceptPromptText = acceptPrepPrompt(recordPath, integrationWorktree, integrationBranch, leadSession, censusMarker, workId, decidingReports, seam, acceptReportPath)
  let acceptResult = await agent(acceptPromptText, acceptOpts)
  if (acceptResult === null) {
    log('accept-prep: agent died, respawning once')
    acceptResult = await agent(acceptPromptText, acceptOpts)
  }
  if (acceptResult === null) {
    log('accept-prep: agent died twice, giving up')
    acceptance = { skipped: 'agent-died' }
  } else {
    acceptance = acceptResult
    // M3: check what the accept-prep agent returns, per R1, rather than taking its
    // integrationHead on faith — it must name the same head the seam or integrator
    // already verified, never an unreviewed one (including a literal echo like "HEAD").
    const expectedHead = seam && seam.verdict === 'APPROVE' ? seam.sha : integrate.headSha
    if (!sameSha(acceptResult.integrationHead, expectedHead)) {
      log(`accept-prep: integrationHead ${acceptResult.integrationHead} did not match reviewed head ${expectedHead}`)
      acceptHeadMismatch = true
    }
    // s11 (twin of M5's brief-path check): trust the computed report path, but only after
    // confirming the runner actually wrote where it was told.
    if (acceptResult.reportPath !== acceptReportPath) {
      log(`accept-prep: returned reportPath ${acceptResult.reportPath} did not match computed ${acceptReportPath}`)
      acceptReportMismatch = true
    }
  }
}

const blockers = [
  ...excluded.map((r) => ({ id: r.id, reason: r.blocker })),
  ...(seam && seam.blocker ? [{ id: 'seam', reason: seam.blocker }] : []),
  ...(acceptHeadMismatch ? [{ id: 'accept-prep', reason: 'review-sha-mismatch' }] : []),
  ...(acceptReportMismatch ? [{ id: 'accept-prep', reason: 'report-path-mismatch' }] : []),
]

return {
  territories: results,
  integrator: integrate,
  seam,
  acceptance,
  setup: setupInfo,
  blockers,
}
