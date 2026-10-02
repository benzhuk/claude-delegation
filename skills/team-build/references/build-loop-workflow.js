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
    { title: 'Second host', detail: 'when secondHost is given, one Sonnet runner runs the sealed suite once on that host over ssh against the integration branch tip' },
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
//   agentMinutes?: number       default 45; the wall-clock limit every agent prompt carries
//     (a PROMPT-LEVEL limit: the Workflow API has no per-agent time limit, see deadlineLine)
//   secondHost?: string         an ssh alias; the last phase runs the sealed suite once there
//   secondHostGate?: string     the suite command, default "node scripts/run-tests.mjs"
//   (state file: when recordPath is given, a runner writes docs/work/<work-id>.loop-state.json
//   beside the record after each phase and reads it at launch, so a relaunch with the same
//   arguments skips what is done; an explicit startFrom on a territory overrides it)
//
// Returns exactly one object:
//   {
//     territories: [{ id, sha, verdict, rounds, reportPath, findingsPath, blocker }],
//     integrator: INTEGRATE | null,
//     seam: { verdict, sha, rounds, findingsPath, blocker } | null,
//     acceptance: ACCEPT_PREP | { skipped: reason } | null,
//     setup: { reportPath, reviewerBriefPath, integratorBriefPath, seamBriefPath } | null,
//     secondHost: { host, verdict, passed, failed, logPath, headSha } | null,
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

// lane 67: a reviewer that hits its wall-clock limit (deadlineLine) returns BLOCKED with the
// word timeout in note; every other path is unchanged, and note is optional.
const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['APPROVE', 'NEEDS_FIXES', 'BLOCKED'] },
    sha: { type: 'string' },
    findingsPath: { type: 'string' },
    blockerCount: { type: 'number' },
    majorCount: { type: 'number' },
    note: { type: 'string' },
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
    note: { type: 'string' },
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

// R5: the Accept-prep stage's schema. R4: unchanged except recordChanged (the accept-
// prep.mjs helper's own list of header fields it actually touched) is now allowed.
const ACCEPT_PREP = {
  type: 'object',
  properties: {
    recordChanged: { type: 'array', items: { type: 'string' } },
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
    // lane 67 addendum (h): optional; a runner that could not run accept-prep at all says why here.
    error: { type: ['string', 'null'] },
  },
  required: ['censusPath', 'censusNote', 'integrationHead', 'evidencePaths', 'checkAcceptance', 'reportPath'],
}

// lane 67 item 3: the loop-state file's runner calls. The read returns the parsed object (or
// found: false); the write returns the path it wrote.
const STATE_READ = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    state: { type: ['object', 'null'] },
  },
  required: ['found', 'state'],
}

const STATE_WRITE = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    written: { type: 'boolean' },
  },
  required: ['path', 'written'],
}

// lane 74 item 1: the phase-end commit runner's schema (the phase-commit.mjs helper's own JSON).
const PHASE_COMMIT = {
  type: 'object',
  properties: {
    committed: { type: 'boolean' },
    sha: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['committed', 'sha', 'reason'],
}

// lane 67 item 5: the second-host suite runner's schema.
const SECOND_HOST = {
  type: 'object',
  properties: {
    host: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS', 'FAIL', 'BLOCKED'] },
    passed: { type: 'number' },
    failed: { type: 'number' },
    logPath: { type: 'string' },
    headSha: { type: 'string' },
  },
  required: ['host', 'verdict', 'passed', 'failed', 'logPath', 'headSha'],
}

// One mandate line per stage, named once here rather than restated in every prompt — see
// L-C3: "Every stage's prompt names, in one line each, the mandate rules that matter
// there... it never restates the full briefs." R9: every rendered prompt carries the
// note-send prohibition, so it is baked into every mandate constant below.
const BUILD_MANDATE =
  'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; never set or switch a git identity; no destructive git (reset --hard, clean, stash, force-push, rm -rf). A builder never deletes a directory, its own scratch included; a recursive delete waits on a permission prompt nobody is watching, which is how a lane lost 3.5 hours on 2026-09-26. Removal of worktrees and scratch is the lead\'s own standalone command. Commit your territory to the branch of your worktree before your report and again at every stop, so uncommitted code never outlives a phase. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block. Never send peer notes.'
const REVIEW_MANDATE =
  'Report to disk; first line of your report is exactly `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, where <sha> is the same full `git rev-parse HEAD` you report as your sha field; you never modify, stage, or commit the code under review; no destructive git. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block. Never send peer notes.'
const INTEGRATE_MANDATE =
  'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; you fix nothing and decide nothing; no destructive git; never push. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block. Never send peer notes.'
const SETUP_MANDATE =
  'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; never set or switch a git identity; no destructive git (reset --hard, clean, stash, force-push, rm -rf); never push. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block. Never send peer notes.'
const ACCEPT_MANDATE =
  'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; you never call accept and never write Status: accepted; no destructive git; never push. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block. Never send peer notes.'

// lane 67 item 3 / item 5: the state-file runner and the second-host runner. Neither writes a
// report with a VERDICT line of its own except the second-host suite log, which its own prompt
// names; both carry the note-send prohibition like every other mandate.
const STATE_MANDATE =
  'Touch that one file only; your only other output is the schema-forced return (when you hit the wall-clock limit, return written false); never run git, never stage or commit the file, never delete anything; never set or switch a git identity; never push. Never send peer notes.'
const SECOND_HOST_MANDATE =
  'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; you fix nothing and decide nothing; no destructive git; never push; never start the suite on a Windows machine or on a machine already running one. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block. Never send peer notes.'

// lane 67 item 2: a hung agent ends. The Workflow API gives an agent call no per-agent
// time limit (its opts are label, phase, schema, model, effort, agentType and nothing that
// bounds time), and this script has no clock or timers, so the nearest mechanism that needs no
// new part is a PROMPT-LEVEL limit: every builder, reviewer, integrator, runner and seam-fix
// prompt carries this one line, and the script maps a returned BLOCKED naming timeout to the
// territory blocker agent-timeout. It binds only an agent that reads and obeys its prompt; an
// agent wedged on a permission prompt or a dead tool call never returns and is NOT ended by
// this. A harder mechanism (a run-level abort or a watchdog) is the lead's ruling to make.
function deadlineLine() {
  return `Wall-clock limit ${agentMinutes} minutes from your start; at ${agentMinutes} minutes stop, write your report with VERDICT: BLOCKED and the reason timeout, and return (a reviewer or integrator returns verdict BLOCKED with timeout in its note field; for a reviewer this overrides the APPROVE/NEEDS_FIXES first-line rule).`
}

// lane 67 item 2: does a returned BLOCKED name the timeout? Reads a note, a reason or a
// failedGate string; a timeout is the word timeout or "timed out", never a guess from silence.
function namesTimeout(...values) {
  return values.some((v) => typeof v === 'string' && /time-?out|timed out/i.test(v))
}

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

// R7: pure-string path normalisation (still no `path` module — R1). Collapses "." and
// ".." segments and strips a trailing slash, never escaping above an absolute path's
// root. Used to compare a setup-agent-returned path against the script's own computed
// one without being fooled by a relative-vs-absolute rendering of the same file, or by a
// harmless "../" detour that still lands on the same normalized path.
//
// lane 67 item 4b: an absolute path is a leading "/" OR a Windows drive prefix ("C:/"). The
// old check read only a leading "/", so a "C:/..." path was taken as relative on a Windows
// host and had integrationWorktree prepended. The drive letter is upper-cased (a drive letter
// is case-insensitive); the rest of the path keeps its case.
function isAbsolutePath(p) {
  const s = String(p ?? '')
  return s.startsWith('/') || /^[A-Za-z]:\//.test(s)
}

function normalizePath(p) {
  const s = String(p ?? '').replace(/\/+$/, '')
  if (s === '') return s
  const drive = /^([A-Za-z]):(?=\/|$)/.exec(s)
  const root = drive ? `${drive[1].toUpperCase()}:/` : s.startsWith('/') ? '/' : ''
  const isAbs = root !== ''
  const out = []
  for (const seg of (drive ? s.slice(2) : s).split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!isAbs) out.push('..')
      // else: an absolute path's ".." above root has nowhere to go — dropped.
    } else {
      out.push(seg)
    }
  }
  return root + out.join('/')
}

// R7: resolves `p` against `base` when `p` is not already absolute, then normalizes —
// "a relative path is resolved against integrationWorktree" (R7's own words). An empty
// base leaves a relative `p` relative (normalized only), rather than gaining a spurious
// leading slash.
function resolveAgainst(base, p) {
  const s = String(p ?? '')
  if (isAbsolutePath(s)) return normalizePath(s)
  const b = String(base ?? '')
  return normalizePath(b ? `${b}/${s}` : s)
}

// R7: same path identity check for two possibly-relative-vs-absolute renderings of the
// same file — "no other leniency: a different file is still a mismatch".
function samePath(base, a, b) {
  return resolveAgainst(base, a) === resolveAgainst(base, b)
}

function workIdFromRecordPath(p) {
  const b = baseName(p)
  const suffix = '.record.md'
  return b.endsWith(suffix) ? b.slice(0, -suffix.length) : stripExt(b)
}

function buildPrompt(t, round, findingsPath) {
  if (findingsPath) {
    return `Fix round ${round} for territory ${t.id}. Brief: ${t.briefPath}. Worktree: ${t.worktree}. Gate: ${t.gate}. Reviewer findings: ${findingsPath}. Apply every reviewer-verified finding in one round. ${SHA_FROM_GIT} ${deadlineLine()} ${BUILD_MANDATE}`
  }
  return `Build territory ${t.id}. Brief: ${t.briefPath}. Worktree: ${t.worktree}. Gate: ${t.gate}. ${SHA_FROM_GIT} ${deadlineLine()} ${BUILD_MANDATE}`
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
  let p = `Review territory ${t.id}, round ${round}. Reviewer brief: ${reviewerBriefPath}. Territory brief: ${t.briefPath}. Worktree: ${t.worktree}. Builder report: ${build.reportPath}. Run \`git rev-parse HEAD\` in the worktree yourself and report its full 40-character output as your sha field; never take a delivered sha on faith or echo one handed to you. ${deadlineLine()} ${REVIEW_MANDATE}`
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
    ? ` Integration worktree: ${integration.worktree}${integration.branch ? ` (branch ${integration.branch})` : ''}; merge the approved territories there and report headSha as the full 40-character output of \`git rev-parse HEAD\` run in it.${integration.gate ? ` Full-suite gate: ${integration.gate}.` : ''}`
    : ''
  return `Integrator brief: ${integratorBriefPath}. Base sha: ${baseSha}. Approved territories and shas: ${approvedText}. Excluded (blocked) territories: ${excludedText}.${where} Include a territory only after its reviewer explicitly returned APPROVE for that exact sha; do not infer approval from an absent, NEEDS_FIXES, or mismatched review. A seam review, when the loop runs one, comes AFTER you: it is a separate reviewer's job on your merged head, never a precondition for your merge and never a reason for you to refuse, wait or stop; run your gates and report as normal. ${deadlineLine()} ${INTEGRATE_MANDATE}`
}

// R3: the Setup stage's prompt — one runner, one pass, per-territory names computed HERE
// in pure JS (never chosen by the agent) so the script can verify what comes back.
function setupPrompt(specPath, baseSha, computed, reviewerBriefPath, integratorBriefPath, seamBriefPath, integrationWorktree, integrationBranch, integrationGate, reportPath) {
  const rows = computed
    .map((c) => `${c.id}: worktree ${c.worktree}, branch ${c.branch}, brief ${c.briefPath}`)
    .join('; ')
  // lane 67 item 4c: the integrator brief the Setup stage writes must NOT make the integrator
  // refuse when a seam review follows. Lane fourteen's integrator refused "on seam order"
  // (docs/work/wr-2026-09-27-measure-truth.record.md:19); the brief that caused it is not in the
  // tree, so the cause below is inferred: a brief that required seam sign-off before the merge,
  // while the loop runs the seam review AFTER Integrate (the integrator never judges the seam).
  // The sentence below closes that.
  const integrationText = integrationWorktree
    ? ` The integrator brief names integration worktree ${integrationWorktree}${integrationBranch ? `, branch ${integrationBranch}` : ''}${integrationGate ? `, full-suite gate ${integrationGate}` : ''}.`
    : ''
  const seamOrderText = ' The integrator brief must say that the seam review runs AFTER Integrate, on the merged head, as a separate reviewer\'s job: the integrator merges the approved territories and runs its gates whether or not a seam review follows, never requires seam sign-off before its merge, and never refuses, waits or stops because a seam review is on.'
  return `Setup. Spec pack: ${specPath}. Base sha: ${baseSha}. Per territory, run \`git worktree add <worktree> -b <branch> ${baseSha}\` then \`git -C <worktree> rev-parse HEAD\`, reporting its full output verbatim as that territory's headSha (never copy the base sha from this prompt), using exactly these computed ABSOLUTE names, never your own choice and never a relative equivalent of the same path — report worktree and briefPath back exactly as written here, verbatim: ${rows}. Scout every territory per skills/team-build/references/scout-brief.md, writing briefs/scout-<id>.md next to the spec, then write each territory's brief from the spec pack (spec, contracts, its own scout addendum, all by path) using the mandate template at docs/mandate-template.md, plus the reviewer brief at ${reviewerBriefPath}, the integrator brief at ${integratorBriefPath}, and the seam brief at ${seamBriefPath}.${integrationText}${seamOrderText} Report path: ${reportPath}. ${deadlineLine()} ${SETUP_MANDATE}`
}

// R4: the Seam stage's review prompt — same independent-git-read shape as reviewPrompt,
// scoped to the integration worktree rather than one territory's.
function seamPrompt(seamBriefPath, integrationWorktree, approvedIds, round, priorHead, priorFindingsPath, fixSha) {
  const idsText = approvedIds.length ? approvedIds.join(', ') : 'none'
  let p = `Seam review round ${round}. Seam brief: ${seamBriefPath}. Integration worktree: ${integrationWorktree}. Approved territories: ${idsText}. Run \`git rev-parse HEAD\` in the integration worktree yourself and report its full 40-character output as your sha field; never take a delivered sha on faith or echo one handed to you. ${deadlineLine()} ${REVIEW_MANDATE}`
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
  return `Seam fix round ${round}. Worktree: ${integrationWorktree}. Gate: ${integrationGate ?? 'the full-suite gate named in the integrator brief'}. Seam findings: ${findingsPath}. Apply every seam-reviewer-verified finding in one round. ${SHA_FROM_GIT} ${deadlineLine()} ${BUILD_MANDATE}`
}

// lane 74 item 1: uncommitted code never outlives a phase. After EVERY Build, Fix and seam-fix
// agent call, including a call that returned nothing (a dead builder), one runner executes the
// tested helper skills/team-build/references/phase-commit.mjs on that worktree: it stages
// everything not ignored and makes one conventional commit when the tree is dirty, does nothing
// when clean, and with no git identity or on main reports it and leaves the files. The script has
// no fs or shell, so the commit is the runner's; its answer is only logged, never a gate, so no
// existing return field or blocker changes meaning.
const COMMIT_MANDATE =
  'Your only output is the schema-forced return; run that one helper command and no other git command, never stage or commit by hand, never delete anything; never set or switch a git identity; never push. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block. Never send peer notes.'

function phaseCommitPrompt(worktree, message) {
  return `Phase-end commit. Worktree: ${worktree}. Run \`node <plugin-root>/skills/team-build/references/phase-commit.mjs --worktree ${worktree} --message "${message}" --json\`, resolving <plugin-root> yourself as the directory that holds skills/team-build/references/phase-commit.mjs (never the worktree's own copy), and return committed, sha and reason exactly as its JSON line states them. A reason of clean, no-identity, protected-branch, detached-head or operation-in-progress is an answer, not an error: return it as given and do not retry or work around it. ${deadlineLine()} ${COMMIT_MANDATE}`
}

async function commitPhase(worktree, label, phaseName, message) {
  if (typeof worktree !== 'string' || worktree === '') {
    log(`${label}: no worktree to commit`)
    return null
  }
  const opts = { agentType: 'delegation:runner', model: 'sonnet', schema: PHASE_COMMIT, phase: phaseName, label }
  const res = await agent(phaseCommitPrompt(worktree, message), opts)
  if (res === null || res === undefined) log(`${label}: the commit runner returned nothing, worktree ${worktree} left as it was`)
  else if (res.committed) log(`${label}: committed ${res.sha}`)
  else if (res.reason !== 'clean') log(`${label}: not committed (${res.reason})`)
  return res ?? null
}

// R1/R2: the accept-prep runner's prompt. A Workflow script has no fs or shell, so a
// prompt alone can only ever be checked for its TEXT, never for the real order it runs
// things in or whether a header edit really preserved every unowned line — "a check that
// passes because it isn't looking" (R1). The order and header-preservation guarantees
// therefore live in accept-prep.mjs, a deterministic Node helper tested against real
// fixture files (accept-prep.test.mjs); this prompt's only job is to render that helper's
// ONE command exactly (R2's pinned flags and step order) and forbid any other edit path.
function acceptPrepPrompt(recordPath, integrationWorktree, integrationBranch, leadSession, censusMarker, workId, decidingItems, seam, artifactSha, reportPath, maxRoundsUsed) {
  const evidenceDestPaths = decidingItems.map((d) => `docs/work/evidence/${workId}-${d.lane}.md`)
  const copyText = decidingItems.length
    ? decidingItems.map((d, i) => `${d.path} -> ${integrationWorktree}/${evidenceDestPaths[i]}`).join('; ')
    : 'none'
  const censusOut = `docs/work/evidence/${workId}-census.md`
  const markerFlag = censusMarker ? ` --marker '${String(censusMarker).replace(/'/g, `'\\''`)}'` : ''
  // measure-truth-1 R3: this is a loop-accepted record's only `reviewed` Log line, so it must
  // name a counted high-tier model. Every territory and seam reviewer above is pinned to
  // model 'opus'.
  const seamLogText = seam && seam.verdict === 'APPROVE' ? `seam r${seam.rounds} APPROVE ${seam.sha} (Opus reviewer)` : 'seam SKIPPED; territory reviews APPROVE (Opus reviewer)'
  const evidenceFlag = evidenceDestPaths.length ? evidenceDestPaths.join(',') : 'none'
  const cmd = `node skills/team-build/references/accept-prep.mjs --record ${recordPath} --repo ${integrationWorktree} --plugin-root <resolve yourself: the dir holding scripts/work-record.mjs and scripts/build-census.mjs, never the integration worktree's own scripts/> --delivery-ref ${integrationBranch} --artifact-sha ${artifactSha} --worktree ${integrationBranch} --owner <the record's own Owner: field value — read the record first> --log-note "${seamLogText}" --evidence ${evidenceFlag} --lead <resolve leadSession \`${leadSession ?? '(none given)'}\` to its .jsonl path yourself when it is a session id rather than a path>${markerFlag} --max-rounds ${maxRoundsUsed} --census-out ${censusOut} --json`
  let p = `Accept-prep. Record: ${recordPath}. Integration worktree: ${integrationWorktree}. Integration branch: ${integrationBranch}. `
  p += `First, copy each deciding report (last territory APPROVE per territory, last seam APPROVE) to its evidence destination with original bytes, creating the destination directory if needed (source -> destination, destinations are repo-relative under ${integrationWorktree}): ${copyText}. `
  p += `Then, with the delegation plugin root (the same directory you pass as --plugin-root) as your working directory, run exactly this one command, filling in only the three bracketed values yourself (--plugin-root, --owner and --lead) and changing nothing else — this command is the ONLY way you may change the record; never hand-edit its header, its Status:, or any Log: line any other way: \`${cmd}\`. `
  p += `Report recordChanged from that command's own JSON output; integrationHead from running \`git rev-parse HEAD\` in ${integrationWorktree} yourself (never copy ${artifactSha} verbatim); censusPath, censusNote (explain a null censusPath), and checkAcceptance verbatim from the command's JSON output; evidencePaths as the evidence destination paths listed above; and reportPath. `
  p += `Report path: ${reportPath}. `
  p += `${deadlineLine()} `
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
// R4 (defect 3): given-territory mode's own seam brief — same meaning as setup mode's
// computed seamBriefPath, falling back to reviewerBriefPathFinal only when absent (never
// the other way around: an explicit seamBriefPath always wins).
const seamBriefPath = a.seamBriefPath
const maxRoundsCandidate = Number(a.maxRounds)
const maxRounds = a.maxRounds != null && Number.isFinite(maxRoundsCandidate) ? maxRoundsCandidate : 3
// lane 67 item 2: the wall-clock limit (minutes) every rendered agent prompt carries, validated
// like maxRounds (a finite number) and also positive; default 45.
const agentMinutesCandidate = Number(a.agentMinutes)
const agentMinutes = a.agentMinutes != null && Number.isFinite(agentMinutesCandidate) && agentMinutesCandidate > 0 ? agentMinutesCandidate : 45
const integrationWorktree = a.integrationWorktree
const integrationBranch = a.integrationBranch
const integrationGate = a.integrationGate
const leadSession = a.leadSession
const recordPath = a.recordPath
const censusMarker = a.censusMarker
// lane 67 item 5: the optional second-host suite, the last phase after Accept.
const secondHost = typeof a.secondHost === 'string' && a.secondHost.trim() !== '' ? a.secondHost.trim() : null
const secondHostGate = typeof a.secondHostGate === 'string' && a.secondHostGate.trim() !== '' ? a.secondHostGate.trim() : 'node scripts/run-tests.mjs'

log(`build-loop: ${specPath ?? '(no specPath given)'} at ${baseSha ?? '(no baseSha given)'}, started ${startedAt ?? '(no startedAt given)'}, ${territories.length} territories, maxRounds ${maxRounds}`)

function earlyReturn(blockers) {
  return { territories: [], integrator: null, seam: null, acceptance: null, setup: null, secondHost: null, blockers }
}

// R2: missing-args, checked before anything else — nothing spawns.
if (!specPath || !baseSha || !startedAt) {
  log('build-loop: missing-args, nothing spawned')
  return earlyReturn([{ id: '*', reason: 'missing-args' }])
}

// spec item 4 / R4: baseSha must be exactly ONE git sha (7-40 hex characters) — never a
// two-sha shape like "a+b" (lane six's actual defect) or anything else unresolvable as a
// single commit. Checked before anything spawns, same as every other launch-error above.
if (!/^[0-9a-f]{7,40}$/i.test(String(baseSha).trim())) {
  log('build-loop: bad-base-sha, nothing spawned')
  return earlyReturn([{ id: '*', reason: 'bad-base-sha' }])
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
// lane 67 item 3: a run survives its session. When recordPath is given, a mid-tier runner
// writes ONE json file, docs/work/<work-id>.loop-state.json, beside the record after each phase
// (the script has no fs, so the runner is the writer; listRecords only reads *.record.md, so
// the file never disturbs the record census). Started again with the same arguments, one
// runner reads it first (label state:read) and the script skips what is done: a territory
// whose state says APPROVE or NEEDS_FIXES at a sha resumes as startFrom, an already-PASS
// integrator or APPROVE seam is skipped, a recorded Setup is reused (verified as today). A
// state whose baseSha or specPath differs from the args is ignored; an explicit startFrom in
// args wins for its territory. No recordPath, or no state file, is today's run exactly.
// ---------------------------------------------------------------------------

const stateEnabled = typeof recordPath === 'string' && recordPath !== ''
const stateDir = stateEnabled ? dirName(recordPath) : '.'
const loopStatePath = stateEnabled
  ? resolveAgainst(integrationWorktree ?? '', `${stateDir === '.' ? '' : `${stateDir}/`}${workIdFromRecordPath(recordPath)}.loop-state.json`)
  : null

const stateRows = new Map()
let stateSetup = null
let stateIntegrator = null
let stateSeam = null
let stateAcceptance = null

function noteTerritory(id, patch) {
  const prior = stateRows.get(id) ?? { id, phase: null, sha: null, verdict: null, rounds: 0, findingsPath: null, blocker: null }
  stateRows.set(id, { ...prior, ...patch })
}

function stateSnapshot(phaseName) {
  return {
    version: 1,
    baseSha,
    specPath,
    phase: phaseName,
    territories: [...stateRows.values()],
    integrator: stateIntegrator,
    seam: stateSeam,
    setup: stateSetup,
    acceptance: stateAcceptance,
  }
}

function stateWritePrompt(phaseName) {
  return `Loop state, after ${phaseName}. Write exactly this JSON text, unchanged, as the whole contents of ${loopStatePath} (create the file, or overwrite it when present): ${JSON.stringify(stateSnapshot(phaseName))} Then return that path as path and written true. ${deadlineLine()} ${STATE_MANDATE}`
}

function stateReadPrompt() {
  return `Loop state, launch read. Read ${loopStatePath} and change nothing. When the file does not exist or is not valid JSON, return found false and state null; otherwise return found true and state as the parsed JSON object, exactly as stored. ${deadlineLine()} ${STATE_MANDATE}`
}

// One write after each phase; territories run in parallel, so writes requested while one is in
// flight coalesce into ONE more write (the state is rendered when the call starts). Territories
// that finish a phase together share a write; territories that finish minutes apart cost about
// one write per territory per phase. A failed write is logged and the build carries on: the
// state file is a convenience, never a gate. A territory does NOT await its own write (it starts
// it with `void`), so a state runner that hangs never stalls the territories; the Integrate,
// Seam and Accept flushes are awaited and join any write still in flight.
let stateFlight = null
let stateDirty = false
let stateNext = null
async function flushState(phaseName) {
  if (!stateEnabled) return
  stateDirty = true
  stateNext = phaseName
  if (stateFlight) return stateFlight
  stateFlight = (async () => {
    try {
      while (stateDirty) {
        stateDirty = false
        const lbl = stateNext
        const stateOpts = { agentType: 'delegation:runner', model: 'haiku', schema: STATE_WRITE, phase: lbl, label: `state:${lbl}` }
        const wrote = await agent(stateWritePrompt(lbl), stateOpts)
        if (wrote === null || wrote.written !== true) log(`state: write after ${lbl} failed, carrying on without it`)
      }
    } catch (err) {
      log(`state: write failed (${String(err && err.message ? err.message : err)}), carrying on without it`)
    }
    stateFlight = null
  })()
  return stateFlight
}

let priorState = null
if (stateEnabled) {
  const stateReadOpts = { agentType: 'delegation:runner', model: 'sonnet', schema: STATE_READ, label: 'state:read' }
  const read = await agent(stateReadPrompt(), stateReadOpts)
  let parsed = read && read.found ? read.state : null
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch (err) {
      parsed = null
    }
  }
  if (parsed && typeof parsed === 'object') {
    if (parsed.version === 1 && sameSha(parsed.baseSha, baseSha) && samePath(integrationWorktree ?? '', parsed.specPath, specPath)) {
      priorState = parsed
      log(`build-loop: loop-state read from ${loopStatePath}, resuming what it records as done`)
    } else {
      log(`build-loop: loop-state at ${loopStatePath} ignored (its version, baseSha or specPath differs from the arguments)`)
    }
  } else {
    log(`build-loop: no loop-state at ${loopStatePath}, a fresh run`)
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
  // R7 / M5, as one function so a Setup recorded in the loop-state file is verified the very
  // same way a fresh runner's return is (lane 67 item 3: "verified as today"). Returns null when
  // every name checks out, else { id, message } for the setup-failed blocker.
  const pathBase = integrationWorktree ?? ''
  function setupFailure(result) {
    const rows = new Map((Array.isArray(result.territories) ? result.territories : []).map((r) => [r.id, r]))
    for (const c of computed) {
      const row = rows.get(c.id)
      const mismatch =
        !row ||
        !samePath(pathBase, row.worktree, c.worktree) ||
        normalizePath(row.branch) !== normalizePath(c.branch) ||
        !samePath(pathBase, row.briefPath, c.briefPath) ||
        !sameSha(row.headSha, baseSha)
      if (mismatch) return { id: c.id, message: `setup: territory ${c.id} failed verification, nothing built` }
    }
    if (
      !samePath(pathBase, result.reviewerBriefPath, setupReviewerBriefPath) ||
      !samePath(pathBase, result.integratorBriefPath, setupIntegratorBriefPath) ||
      !samePath(pathBase, result.seamBriefPath, setupSeamBriefPath) ||
      !samePath(pathBase, result.reportPath, setupReportPath)
    ) {
      return { id: '*', message: 'setup: returned reviewer/integrator/seam brief path or report path differs from the computed one, nothing built' }
    }
    return null
  }

  // lane 67 item 3: a setup-mode relaunch whose loop-state shows Setup done is treated as given,
  // using the recorded names, but only when they verify exactly as a fresh runner's would.
  let setupResult = null
  const recordedSetup = priorState && priorState.setup && typeof priorState.setup === 'object' ? priorState.setup : null
  if (recordedSetup && !setupFailure(recordedSetup)) {
    setupResult = recordedSetup
    log('setup: already done per the loop-state file, recorded names verified, not spawning the setup runner')
  } else if (recordedSetup) {
    log('setup: the loop-state file records a Setup whose names no longer verify, running Setup again')
  }
  const setupFresh = setupResult === null
  if (setupFresh) {
    setupResult = await agent(setupPromptText, setupOpts)
    if (setupResult === null) {
      log('setup: agent died, respawning once')
      setupResult = await agent(setupPromptText, setupOpts)
    }
    if (setupResult === null) {
      log('setup: agent died twice, giving up, nothing built')
      return earlyReturn([{ id: '*', reason: 'setup-failed' }])
    }
  }

  // R7: a correct but RELATIVE worktree/briefPath (relative to integrationWorktree) is
  // the SAME file as the computed absolute one and must not fail verification merely for
  // being spelled differently — normalise both sides before comparing (strip a trailing
  // slash, resolve "." and ".." segments, resolve a relative path against
  // integrationWorktree). No other leniency: a different file is still a mismatch.
  const byId = new Map((Array.isArray(setupResult.territories) ? setupResult.territories : []).map((r) => [r.id, r]))
  const failure = setupFailure(setupResult)
  if (failure) {
    log(failure.message)
    return earlyReturn([{ id: failure.id, reason: 'setup-failed' }])
  }

  finalTerritories = computed.map((c) => {
    const row = byId.get(c.id)
    return { id: c.id, briefPath: c.briefPath, worktree: c.worktree, branch: c.branch, gate: c.gate ?? row.gate }
  })

  // M5: the reviewer/integrator/seam brief paths are ALSO computed in the script (R3);
  // trust the computed names, but only after confirming the runner actually wrote where
  // it was told (setupFailure above checks them too), so a wrong or attacker-controlled path
  // can never be silently substituted.
  reviewerBriefPathFinal = setupReviewerBriefPath
  integratorBriefPathFinal = setupIntegratorBriefPath
  seamBriefPathFinal = setupSeamBriefPath
  setupInfo = {
    reportPath: setupResult.reportPath,
    reviewerBriefPath: reviewerBriefPathFinal,
    integratorBriefPath: integratorBriefPathFinal,
    seamBriefPath: seamBriefPathFinal,
  }
  // lane 67 item 3: record Setup as done (the verified runner return, verbatim) so a relaunch
  // with the same arguments reuses it; a Setup that was itself resumed needs no second write.
  stateSetup = setupResult
  for (const c of computed) noteTerritory(c.id, {})
  if (setupFresh) await flushState('Setup')
}

// ---------------------------------------------------------------------------
// Build / Review / Fix — R6 (startFrom) generalizes the entry round.
// ---------------------------------------------------------------------------

// lane 67 item 2: a builder BLOCKED that names timeout is the named territory blocker
// agent-timeout (the territory is excluded, the others carry on); any other BLOCKED stays
// builder-blocked, and a non-PASS non-BLOCKED stays build-failed.
function buildBlockerFor(build) {
  if (build.verdict === 'BLOCKED') return namesTimeout(build.note) ? 'agent-timeout' : 'builder-blocked'
  return 'build-failed'
}

// lane 67 item 3: a territory the loop-state file records as APPROVE (or NEEDS_FIXES with its
// findings) at a valid sha resumes as the same startFrom a lead would hand-write. An explicit
// startFrom in args wins; a row with no usable sha, or any other verdict, runs from round 1.
function resumeFromState(t) {
  if (t.startFrom || !priorState) return t
  const rows = Array.isArray(priorState.territories) ? priorState.territories : []
  const row = rows.find((r) => r && r.id === t.id)
  if (!row) return t
  const sha = String(row.sha ?? '').trim()
  if (!startFromShaRe.test(sha)) return t
  let startFrom = null
  if (row.verdict === 'APPROVE' && !row.blocker) {
    startFrom = { sha, verdict: 'APPROVE' }
    if (row.findingsPath) startFrom.findingsPath = row.findingsPath
  } else if (row.verdict === 'NEEDS_FIXES' && row.findingsPath) {
    startFrom = { sha, verdict: 'NEEDS_FIXES', findingsPath: row.findingsPath }
  }
  if (!startFrom) return t
  log(`${t.id}: resumed from the loop-state file at ${startFrom.verdict} ${sha}`)
  noteTerritory(t.id, { phase: row.phase ?? null, sha, verdict: startFrom.verdict, rounds: Number(row.rounds) || 0, findingsPath: row.findingsPath ?? null, blocker: null })
  return { ...t, startFrom }
}

// lane 67 item 2: a reviewer that returns BLOCKED naming timeout is agent-timeout; any other
// BLOCKED review is review-not-approved (it never approved anything).
function reviewBlocked(state, review) {
  const blocker = namesTimeout(review.note) ? 'agent-timeout' : 'review-not-approved'
  log(`${state.id}: review returned BLOCKED (${blocker})`)
  return { ...state, verdict: 'BLOCKED', blocker }
}

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
  const commitPhaseName = round === 1 ? 'Build' : 'Fix'
  let build = await agent(buildPrompt(t, round, findingsForBuild), buildOpts1)
  // lane 74 item 1: a builder that wrote and died (build === null) still leaves committed work.
  await commitPhase(t.worktree, `commit:${t.id}:r${round}`, commitPhaseName, `chore(${t.id}): phase-end commit after ${commitPhaseName} round ${round}`)
  if (build === null) {
    log(`${t.id}: build agent died in round ${round}, respawning once`)
    build = await agent(buildPrompt(t, round, findingsForBuild), buildOpts1)
    await commitPhase(t.worktree, `commit:${t.id}:r${round}:respawn`, commitPhaseName, `chore(${t.id}): phase-end commit after ${commitPhaseName} round ${round} respawn`)
  }
  if (build === null) {
    log(`${t.id}: build agent died twice in round ${round}, giving up`)
    return { ...state, blocker: 'agent-died' }
  }
  state = { ...state, sha: build.sha, verdict: build.verdict, reportPath: build.reportPath, rounds: round }
  noteTerritory(t.id, { phase: round === 1 ? 'Build' : 'Fix', sha: build.sha, verdict: build.verdict, rounds: round, blocker: build.verdict === 'PASS' ? null : buildBlockerFor(build) })
  void flushState(round === 1 ? 'Build' : 'Fix')
  if (build.verdict !== 'PASS') {
    return { ...state, blocker: buildBlockerFor(build) }
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
  if (review.verdict === 'BLOCKED') {
    return reviewBlocked(state, review)
  }
  state = { ...state, findingsPath: review.findingsPath }
  if (!sameSha(review.sha, build.sha)) {
    log(`${t.id}: review sha ${review.sha} did not match build sha ${build.sha}`)
    return { ...state, verdict: 'BLOCKED', blocker: 'review-sha-mismatch' }
  }
  state = { ...state, sha: longerSha(build.sha, review.sha) }
  noteTerritory(t.id, { phase: 'Review', sha: state.sha, verdict: review.verdict, rounds: round, findingsPath: review.findingsPath ?? null, blocker: null })
  void flushState('Review')

  while (review.verdict === 'NEEDS_FIXES' && round < maxRounds) {
    round += 1
    state = { ...state, rounds: round }
    priorFindingsPath = review.findingsPath
    priorBuildSha = build.sha

    phase('Fix')
    const buildOptsN = { agentType: 'delegation:builder', model: 'sonnet', schema: BUILD, phase: 'Fix', label: `build:${t.id}:r${round}` }
    build = await agent(buildPrompt(t, round, priorFindingsPath), buildOptsN)
    await commitPhase(t.worktree, `commit:${t.id}:r${round}`, 'Fix', `chore(${t.id}): phase-end commit after Fix round ${round}`)
    if (build === null) {
      log(`${t.id}: fix-round build agent died in round ${round}, respawning once`)
      build = await agent(buildPrompt(t, round, priorFindingsPath), buildOptsN)
      await commitPhase(t.worktree, `commit:${t.id}:r${round}:respawn`, 'Fix', `chore(${t.id}): phase-end commit after Fix round ${round} respawn`)
    }
    if (build === null) {
      log(`${t.id}: fix-round build agent died twice in round ${round}, giving up`)
      return { ...state, blocker: 'agent-died' }
    }
    state = { ...state, sha: build.sha, verdict: build.verdict, reportPath: build.reportPath }
    noteTerritory(t.id, { phase: 'Fix', sha: build.sha, verdict: build.verdict, rounds: round, blocker: build.verdict === 'PASS' ? null : buildBlockerFor(build) })
    void flushState('Fix')
    if (build.verdict !== 'PASS') {
      return { ...state, blocker: buildBlockerFor(build) }
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
    if (review.verdict === 'BLOCKED') {
      return reviewBlocked(state, review)
    }
    state = { ...state, findingsPath: review.findingsPath }
    if (!sameSha(review.sha, build.sha)) {
      log(`${t.id}: review sha ${review.sha} did not match build sha ${build.sha}`)
      return { ...state, verdict: 'BLOCKED', blocker: 'review-sha-mismatch' }
    }
    state = { ...state, sha: longerSha(build.sha, review.sha) }
    noteTerritory(t.id, { phase: 'Review', sha: state.sha, verdict: review.verdict, rounds: round, findingsPath: review.findingsPath ?? null, blocker: null })
    void flushState('Review')
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

const resumedTerritories = finalTerritories.map(resumeFromState)
const parallelResults = await parallel(resumedTerritories.map((t) => () => runTerritory(t)))
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
// lane 67 item 3: the final territory rows (what the run decided, blockers included) go into
// the state before the integrator runs.
for (const r of results) noteTerritory(r.id, { sha: r.sha, verdict: r.verdict, rounds: r.rounds, findingsPath: r.findingsPath ?? null, blocker: r.blocker ?? null })
const approvedKey = approved.map((r) => `${r.id}@${String(r.sha ?? '').trim().toLowerCase().slice(0, 7)}`).join(',')
const integrateOpts = { agentType: 'delegation:integrator', model: 'sonnet', schema: INTEGRATE, phase: 'Integrate', label: 'integrate' }
const integrationInfo = { worktree: integrationWorktree, branch: integrationBranch, gate: integrationGate }
// lane 67 item 3: an integrator the state records as PASS over exactly this approved set (same
// ids at the same shas) is skipped; any change in what was approved runs it again.
const priorIntegrator = priorState && priorState.integrator && typeof priorState.integrator === 'object' ? priorState.integrator : null
let integrate
if (priorIntegrator && priorIntegrator.verdict === 'PASS' && startFromShaRe.test(String(priorIntegrator.headSha ?? '').trim()) && priorIntegrator.approvedKey === approvedKey && approved.length > 0) {
  log(`integrate: already PASS at ${priorIntegrator.headSha} per the loop-state file for the same approved set, skipped`)
  integrate = { verdict: 'PASS', headSha: priorIntegrator.headSha, reportPath: priorIntegrator.reportPath ?? null, failedGate: priorIntegrator.failedGate ?? '', territory: priorIntegrator.territory ?? '' }
} else {
  integrate = await agent(integratePrompt(integratorBriefPathFinal, baseSha, approved, excluded, integrationInfo), integrateOpts)
  if (integrate === null) {
    log('integrate: agent died, respawning once')
    integrate = await agent(integratePrompt(integratorBriefPathFinal, baseSha, approved, excluded, integrationInfo), integrateOpts)
  }
  if (integrate === null) {
    log('integrate: agent died twice, giving up')
    integrate = { verdict: 'BLOCKED', headSha: null, reportPath: null, failedGate: 'agent-died', territory: null }
  }
}
// lane 67 item 2: an integrator BLOCKED that names timeout is reported as agent-timeout.
const integratorTimedOut = integrate.verdict === 'BLOCKED' && namesTimeout(integrate.failedGate, integrate.note)
stateIntegrator = { verdict: integrate.verdict, headSha: integrate.headSha ?? null, reportPath: integrate.reportPath ?? null, failedGate: integrate.failedGate ?? null, territory: integrate.territory ?? null, approvedKey }
await flushState('Integrate')

// ---------------------------------------------------------------------------
// R4: Seam stage — after Integrate, only when an integration worktree is given.
// ---------------------------------------------------------------------------

let seam = null
const seamEnabled = typeof a.seam === 'boolean' ? a.seam : finalTerritories.length >= 2

// lane 67 item 3: a seam the state records as APPROVE over the very integrator head this run
// has (priorSeam.integrateHead names it) is skipped; a different head means the seam is stale.
const priorSeam = priorState && priorState.seam && typeof priorState.seam === 'object' ? priorState.seam : null
const priorSeamUsable =
  priorSeam !== null &&
  priorSeam.verdict === 'APPROVE' &&
  !priorSeam.blocker &&
  startFromShaRe.test(String(priorSeam.sha ?? '').trim()) &&
  sameSha(priorSeam.integrateHead, integrate.headSha)

if (!integrationWorktree) {
  seam = null
} else if (!seamEnabled || integrate.verdict !== 'PASS') {
  // m3: only mark the Seam phase entered when it actually runs.
  phase('Seam')
  seam = { verdict: 'SKIPPED', sha: null, rounds: 0, findingsPath: null, blocker: null }
} else if (priorSeamUsable) {
  phase('Seam')
  log(`seam: already APPROVE at ${priorSeam.sha} per the loop-state file for this integrator head, skipped`)
  seam = { verdict: 'APPROVE', sha: priorSeam.sha, rounds: Number(priorSeam.rounds) || 0, findingsPath: priorSeam.findingsPath ?? null, blocker: null }
} else {
  // m3: only mark the Seam phase entered when it actually runs.
  phase('Seam')
  // R4 (defect 3): given mode now threads its own seamBriefPath (falling back to the
  // reviewer brief only when absent), the same fallback shape setup mode already had.
  const seamBriefToUse = setupMode ? seamBriefPathFinal : (seamBriefPath || reviewerBriefPathFinal)
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
  } else if (seamReview.verdict === 'BLOCKED') {
    const seamBlocker = namesTimeout(seamReview.note) ? 'agent-timeout' : 'review-not-approved'
    log(`seam: review returned BLOCKED (${seamBlocker})`)
    seam = { verdict: 'BLOCKED', sha: null, rounds: seamRound, findingsPath: seamReview.findingsPath ?? null, blocker: seamBlocker }
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
      await commitPhase(integrationWorktree, `commit:seam-fix:r${seamRound}`, 'Seam', `chore(seam): phase-end commit after seam fix round ${seamRound}`)
      if (seamFixBuild === null) {
        log(`seam: fix-round build agent died in round ${seamRound}, respawning once`)
        seamFixBuild = await agent(seamFixPrompt(integrationWorktree, integrationGate, priorFindings, seamRound), seamFixOpts)
        await commitPhase(integrationWorktree, `commit:seam-fix:r${seamRound}:respawn`, 'Seam', `chore(seam): phase-end commit after seam fix round ${seamRound} respawn`)
      }
      if (seamFixBuild === null) {
        log(`seam: fix-round build agent died twice in round ${seamRound}, giving up`)
        blocker = 'agent-died'
        verdict = 'BLOCKED'
        break
      }
      if (seamFixBuild.verdict !== 'PASS') {
        blocker = buildBlockerFor(seamFixBuild)
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
      if (reReview.verdict === 'BLOCKED') {
        blocker = namesTimeout(reReview.note) ? 'agent-timeout' : 'review-not-approved'
        log(`seam: review returned BLOCKED in round ${seamRound} (${blocker})`)
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

// lane 67 item 3: one state write after Seam (the seam row names the integrator head it judged).
if (seam !== null) {
  stateSeam = { ...seam, integrateHead: integrate.headSha ?? null }
  await flushState('Seam')
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
let acceptPrepFailed = false

// lane 67 item 4b: the spec directory as an ABSOLUTE path (a drive-letter specPath such as
// C:/repo/... is absolute, never prefixed with integrationWorktree).
function specDirAbsolute() {
  return isAbsolutePath(specPath) ? dirName(specPath) : `${integrationWorktree}/${dirName(specPath)}`
}

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
  // Each item carries the LANE it decided (a territory id, or 'seam') so its evidence
  // destination path (docs/work/evidence/<workId>-<lane>.md) is computed here, in pure
  // JS, rather than left to the accept-prep runner to invent a filename for.
  const decidingItems = approved.map((r) => ({ lane: r.id, path: r.findingsPath })).filter((d) => d.path)
  if (seam && seam.verdict === 'APPROVE' && seam.findingsPath) decidingItems.push({ lane: 'seam', path: seam.findingsPath })

  // M3 (moved earlier): the accept-prep runner needs the already-reviewed head sha as an
  // INPUT (R2's --artifact-sha), not just as something to check afterward — it is the
  // same seam-or-integrator head this stage already verified, never a value the runner
  // is trusted to pick itself.
  const expectedHead = seam && seam.verdict === 'APPROVE' ? seam.sha : integrate.headSha

  const acceptReportPath = `${specDirAbsolute()}/reports/accept-prep.md`
  const acceptOpts = { agentType: 'delegation:runner', model: 'sonnet', schema: ACCEPT_PREP, phase: 'Accept', label: 'accept-prep' }
  const acceptPromptText = acceptPrepPrompt(recordPath, integrationWorktree, integrationBranch, leadSession, censusMarker, workId, decidingItems, seam, expectedHead, acceptReportPath, maxRounds)
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
    // lane 67 addendum (h): a failed accept-prep is reported as itself. The runner's own
    // checkAcceptance verdict FAIL, an empty recordChanged list, or a reported error means
    // accept-prep (or the check-acceptance step it runs) did not succeed; the check output rides
    // in acceptance.checkAcceptance.output. The report-path check below then runs only when
    // accept-prep itself succeeded, so report-path-mismatch never masks the failure.
    const acceptCheck = acceptResult.checkAcceptance
    acceptPrepFailed =
      (acceptCheck != null && acceptCheck.verdict === 'FAIL') ||
      (Array.isArray(acceptResult.recordChanged) && acceptResult.recordChanged.length === 0) ||
      (typeof acceptResult.error === 'string' && acceptResult.error !== '')
    if (acceptPrepFailed) log('accept-prep: the runner reported a failed accept-prep (check-acceptance FAIL, nothing changed, or an error), see acceptance.checkAcceptance.output')
    // M3: check what the accept-prep agent returns, per R1, rather than taking its
    // integrationHead on faith — it must name the same head the seam or integrator
    // already verified, never an unreviewed one (including a literal echo like "HEAD").
    if (!sameSha(acceptResult.integrationHead, expectedHead)) {
      log(`accept-prep: integrationHead ${acceptResult.integrationHead} did not match reviewed head ${expectedHead}`)
      acceptHeadMismatch = true
    }
    // s11 (twin of M5's brief-path check): trust the computed report path, but only after
    // confirming the runner actually wrote where it was told.
    if (!acceptPrepFailed && acceptResult.reportPath !== acceptReportPath) {
      log(`accept-prep: returned reportPath ${acceptResult.reportPath} did not match computed ${acceptReportPath}`)
      acceptReportMismatch = true
    }
  }
}

// lane 67 item 3: one state write after Accept.
if (acceptance !== null) {
  stateAcceptance = acceptance.skipped
    ? { skipped: acceptance.skipped }
    : { reportPath: acceptance.reportPath ?? null, verdict: acceptance.checkAcceptance ? acceptance.checkAcceptance.verdict : null, integrationHead: acceptance.integrationHead ?? null }
  await flushState('Accept')
}

// ---------------------------------------------------------------------------
// lane 67 item 5: the second-host suite, the last phase after Accept. Only when secondHost (an
// ssh alias) is given and acceptance did not skip. One runner runs the sealed suite once on that
// host over ssh against the integration branch tip and writes reports/second-host.md beside the
// spec. One suite per machine at a time and none on Windows: a Windows-looking host is refused
// here with a blockers entry and nothing spawned.
// ---------------------------------------------------------------------------

function secondHostPrompt(host, gate, headSha, logPath) {
  return `Second-host suite. Host: ${host} (an ssh alias; reach it with ssh ${host}). Integration worktree: ${integrationWorktree}, branch ${integrationBranch}, tip ${headSha}. Run the sealed suite ONCE on that host, over ssh, against exactly that tip: get commit ${headSha} onto the host without pushing to any remote (for example a git bundle over ssh), check it out there in a clean checkout, then run \`${gate}\` in it, redirecting its output to a log and reading only the tail and the failing test names. One suite per machine at a time and none on Windows: when the host is a Windows machine, or already runs a suite, stop and return verdict BLOCKED without starting one. Write the log to ${logPath} with line 1 VERDICT: PASS, VERDICT: FAIL or VERDICT: BLOCKED, then the pass and fail counts and the failing test names. Return host, verdict, passed and failed (counts from the tail), logPath as ${logPath}, and headSha as the full output of \`git rev-parse HEAD\` run on the host in that checkout (never type a sha from memory). ${deadlineLine()} ${SECOND_HOST_MANDATE}`
}

let secondHostResult = null
let secondHostBlocker = null
if (secondHost !== null && acceptance !== null && !acceptance.skipped) {
  if (/^win/i.test(secondHost) || /windows|ben-desktop/i.test(secondHost)) {
    log(`second-host: ${secondHost} looks like a Windows host, no suite runs there, nothing spawned`)
    secondHostBlocker = { id: 'second-host', reason: 'windows-host' }
  } else {
    phase('Second host')
    const reviewedHead = seam && seam.verdict === 'APPROVE' ? seam.sha : integrate.headSha
    const secondHostLogPath = `${specDirAbsolute()}/reports/second-host.md`
    const secondHostOpts = { agentType: 'delegation:runner', model: 'sonnet', schema: SECOND_HOST, phase: 'Second host', label: 'second-host' }
    const secondHostPromptText = secondHostPrompt(secondHost, secondHostGate, reviewedHead, secondHostLogPath)
    let ran = await agent(secondHostPromptText, secondHostOpts)
    if (ran === null) {
      log('second-host: agent died, respawning once')
      ran = await agent(secondHostPromptText, secondHostOpts)
    }
    if (ran === null) {
      log('second-host: agent died twice, giving up')
      secondHostResult = { host: secondHost, verdict: 'BLOCKED', passed: 0, failed: 0, logPath: null, headSha: null }
      secondHostBlocker = { id: 'second-host', reason: 'agent-died' }
    } else {
      secondHostResult = ran
      if (ran.verdict === 'FAIL') secondHostBlocker = { id: 'second-host', reason: 'suite-failed' }
      else if (ran.verdict === 'BLOCKED') secondHostBlocker = { id: 'second-host', reason: 'suite-blocked' }
      else if (!sameSha(ran.headSha, reviewedHead)) {
        log(`second-host: suite ran at ${ran.headSha}, not the reviewed head ${reviewedHead}`)
        secondHostBlocker = { id: 'second-host', reason: 'review-sha-mismatch' }
      } else if (ran.logPath !== secondHostLogPath) {
        log(`second-host: returned logPath ${ran.logPath} did not match computed ${secondHostLogPath}`)
        secondHostBlocker = { id: 'second-host', reason: 'log-path-mismatch' }
      }
    }
  }
}

const blockers = [
  ...excluded.map((r) => ({ id: r.id, reason: r.blocker })),
  ...(seam && seam.blocker ? [{ id: 'seam', reason: seam.blocker }] : []),
  ...(integratorTimedOut ? [{ id: 'integrator', reason: 'agent-timeout' }] : []),
  ...(acceptPrepFailed ? [{ id: 'accept-prep', reason: 'accept-prep-failed' }] : []),
  ...(acceptHeadMismatch ? [{ id: 'accept-prep', reason: 'review-sha-mismatch' }] : []),
  ...(acceptReportMismatch ? [{ id: 'accept-prep', reason: 'report-path-mismatch' }] : []),
  ...(secondHostBlocker ? [secondHostBlocker] : []),
]

return {
  territories: results,
  integrator: integrate,
  seam,
  acceptance,
  setup: setupInfo,
  secondHost: secondHostResult,
  blockers,
}
