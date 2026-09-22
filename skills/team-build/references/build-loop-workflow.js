export const meta = {
  name: 'build-loop',
  description: 'Build-review-fix loop for one spec\'d build: builders write per territory, an independent reviewer verifies, an integrator runs the mechanical gates. Launch from an Opus orchestrator pane only.',
  phases: [
    { title: 'Build', detail: 'one Sonnet builder per territory writes against its pinned contracts' },
    { title: 'Review', detail: 'one Opus reviewer per territory adversarially verifies the delivered sha' },
    { title: 'Fix', detail: 'NEEDS_FIXES re-runs Build with the findings path, up to maxRounds' },
    { title: 'Integrate', detail: 'one Sonnet integrator runs the mechanical gates over every approved territory' },
  ],
}

// build-loop-workflow — the build/review/fix loop as one Workflow script, launched from
// an Opus orchestrator pane (see skills/team-build/SKILL.md, section "Running the loop
// from an Opus pane"). Worktrees and branches are created by the pane BEFORE launch, one
// `git worktree add <worktree> -b <branch> <baseSha>` per territory, ALL from the SAME
// baseSha — this script never creates a worktree of its own and never passes any per-
// agent worktree option; every worktree decision here happens before the script is
// invoked, not inside it.
//
// args (see build-loop-args.example.json for a worked example):
//   specPath: string                 the spec pack this build reads
//   baseSha: string                  the shared sha every territory's worktree was cut from
//   startedAt: string                ISO timestamp — the script has no clock of its own
//   maxRounds?: number               default 3
//   territories: [{ id, briefPath, worktree, branch, gate }]
//   reviewerBriefPath: string
//   integratorBriefPath: string
//
// Returns exactly one object:
//   {
//     territories: [{ id, sha, verdict, rounds, reportPath, findingsPath, blocker }],
//     integrator: INTEGRATE,
//     blockers: [{ id, reason }],
//   }

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

// One mandate line per stage, named once here rather than restated in every prompt — see
// L-C3: "Every stage's prompt names, in one line each, the mandate rules that matter
// there... it never restates the full briefs."
const BUILD_MANDATE =
  'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; never set or switch a git identity; no destructive git (reset --hard, clean, stash, force-push, rm -rf).'
const REVIEW_MANDATE =
  'Report to disk; first line of your report is VERDICT: APPROVE or NEEDS_FIXES; you never modify, stage, or commit the code under review; no destructive git.'
const INTEGRATE_MANDATE =
  'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; you fix nothing and decide nothing; no destructive git; never push.'

function buildPrompt(t, round, findingsPath) {
  if (findingsPath) {
    return `Fix round ${round} for territory ${t.id}. Brief: ${t.briefPath}. Worktree: ${t.worktree}. Gate: ${t.gate}. Reviewer findings: ${findingsPath}. Apply every reviewer-verified finding in one round. ${BUILD_MANDATE}`
  }
  return `Build territory ${t.id}. Brief: ${t.briefPath}. Worktree: ${t.worktree}. Gate: ${t.gate}. ${BUILD_MANDATE}`
}

function reviewPrompt(reviewerBriefPath, t, round, build, priorFindingsPath) {
  let p = `Review territory ${t.id}, round ${round}. Reviewer brief: ${reviewerBriefPath}. Territory brief: ${t.briefPath}. Delivered sha: ${build.sha}. Builder report: ${build.reportPath}. ${REVIEW_MANDATE}`
  if (round >= 2 && priorFindingsPath) {
    p += ` Prior findings: ${priorFindingsPath}. Commit range: prior sha..${build.sha}.`
  }
  return p
}

function integratePrompt(integratorBriefPath, baseSha, approved, excluded) {
  const approvedText = approved.length ? approved.map((r) => `${r.id}@${r.sha}`).join(', ') : 'none'
  const excludedText = excluded.length ? excluded.map((r) => `${r.id} (${r.blocker})`).join(', ') : 'none'
  return `Integrator brief: ${integratorBriefPath}. Base sha: ${baseSha}. Approved territories and shas: ${approvedText}. Excluded (blocked) territories: ${excludedText}. ${INTEGRATE_MANDATE}`
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

log(`build-loop: ${specPath ?? '(no specPath given)'} at ${baseSha ?? '(no baseSha given)'}, started ${startedAt ?? '(no startedAt given)'}, ${territories.length} territories, maxRounds ${maxRounds}`)

async function runTerritory(t) {
  let round = 1
  let state = { id: t.id, sha: null, verdict: 'BLOCKED', rounds: round, reportPath: null, findingsPath: null, blocker: null }

  phase('Build')
  let build = await agent(buildPrompt(t, round, null), {
    agentType: 'delegation:builder',
    model: 'sonnet',
    schema: BUILD,
    phase: 'Build',
    label: `build:${t.id}:r${round}`,
  })
  if (build === null) {
    log(`${t.id}: build agent died in round ${round}, respawning once`)
    build = await agent(buildPrompt(t, round, null), {
      agentType: 'delegation:builder',
      model: 'sonnet',
      schema: BUILD,
      phase: 'Build',
      label: `build:${t.id}:r${round}`,
    })
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
  let review = await agent(reviewPrompt(reviewerBriefPath, t, round, build, null), {
    agentType: 'delegation:reviewer',
    model: 'opus',
    schema: REVIEW,
    phase: 'Review',
    label: `review:${t.id}:r${round}`,
  })
  if (review === null) {
    log(`${t.id}: review agent died in round ${round}, respawning once`)
    review = await agent(reviewPrompt(reviewerBriefPath, t, round, build, null), {
      agentType: 'delegation:reviewer',
      model: 'opus',
      schema: REVIEW,
      phase: 'Review',
      label: `review:${t.id}:r${round}`,
    })
  }
  if (review === null) {
    log(`${t.id}: review agent died twice in round ${round}, giving up`)
    return { ...state, blocker: 'agent-died' }
  }
  state = { ...state, findingsPath: review.findingsPath }

  while (review.verdict === 'NEEDS_FIXES' && round < maxRounds) {
    round += 1
    state = { ...state, rounds: round }
    const priorFindingsPath = review.findingsPath

    phase('Fix')
    build = await agent(buildPrompt(t, round, priorFindingsPath), {
      agentType: 'delegation:builder',
      model: 'sonnet',
      schema: BUILD,
      phase: 'Fix',
      label: `build:${t.id}:r${round}`,
    })
    if (build === null) {
      log(`${t.id}: fix-round build agent died in round ${round}, respawning once`)
      build = await agent(buildPrompt(t, round, priorFindingsPath), {
        agentType: 'delegation:builder',
        model: 'sonnet',
        schema: BUILD,
        phase: 'Fix',
        label: `build:${t.id}:r${round}`,
      })
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
    review = await agent(reviewPrompt(reviewerBriefPath, t, round, build, priorFindingsPath), {
      agentType: 'delegation:reviewer',
      model: 'opus',
      schema: REVIEW,
      phase: 'Review',
      label: `review:${t.id}:r${round}`,
    })
    if (review === null) {
      log(`${t.id}: review agent died in round ${round}, respawning once`)
      review = await agent(reviewPrompt(reviewerBriefPath, t, round, build, priorFindingsPath), {
        agentType: 'delegation:reviewer',
        model: 'opus',
        schema: REVIEW,
        phase: 'Review',
        label: `review:${t.id}:r${round}`,
      })
    }
    if (review === null) {
      log(`${t.id}: review agent died twice in round ${round}, giving up`)
      return { ...state, blocker: 'agent-died' }
    }
    state = { ...state, findingsPath: review.findingsPath }
  }

  if (review.verdict === 'NEEDS_FIXES') {
    log(`${t.id}: rounds-exhausted at round ${round}, still NEEDS_FIXES`)
    return { ...state, verdict: review.verdict, blocker: 'rounds-exhausted' }
  }

  return { ...state, verdict: review.verdict, blocker: null }
}

const results = await parallel(territories.map((t) => () => runTerritory(t)))

phase('Integrate')
const approved = results.filter((r) => !r.blocker)
const excluded = results.filter((r) => r.blocker)
let integrate = await agent(integratePrompt(integratorBriefPath, baseSha, approved, excluded), {
  agentType: 'delegation:integrator',
  model: 'sonnet',
  schema: INTEGRATE,
  phase: 'Integrate',
  label: 'integrate',
})
if (integrate === null) {
  log('integrate: agent died, respawning once')
  integrate = await agent(integratePrompt(integratorBriefPath, baseSha, approved, excluded), {
    agentType: 'delegation:integrator',
    model: 'sonnet',
    schema: INTEGRATE,
    phase: 'Integrate',
    label: 'integrate',
  })
}
if (integrate === null) {
  log('integrate: agent died twice, giving up')
  integrate = { verdict: 'BLOCKED', headSha: null, reportPath: null, failedGate: 'agent-died', territory: null }
}

return {
  territories: results,
  integrator: integrate,
  blockers: excluded.map((r) => ({ id: r.id, reason: r.blocker })),
}
