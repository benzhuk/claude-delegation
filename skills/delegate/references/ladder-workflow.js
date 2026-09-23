export const meta = {
  name: 'ladder',
  description: 'Fixed escalation ladder for Opus orchestrator panes: fast-tier reads, mid-tier research, one high-tier judge',
  phases: [
    { title: 'Read', detail: 'fast tier reads each target' },
    { title: 'Research', detail: 'mid tier researches every target' },
    { title: 'Judge', detail: 'high tier renders one verdict from attributable evidence' },
  ],
}

// Returns { verdict, evidence, cost: { agents }, coverage }. A nonempty target set
// always needs two calls per target plus one judge call, so an explicit cap is checked
// before dispatch. `cost.agents` counts calls actually attempted, not that reservation.
const a = args ?? {}
const targets = Array.isArray(a.targets) ? a.targets : []
const requiredAgents = targets.length * 2 + (targets.length ? 1 : 0)
const capProvided = a.maxAgents != null
const capTypeIsValid = typeof a.maxAgents === 'number' || (typeof a.maxAgents === 'string' && a.maxAgents.trim())
const capArg = capTypeIsValid ? Number(a.maxAgents) : NaN

if (capProvided && (!capTypeIsValid || !Number.isInteger(capArg) || capArg < 1)) {
  throw new Error(
    `ladder-workflow: invalid maxAgents (required ${requiredAgents}, provided ${String(a.maxAgents)})`,
  )
}

if (capProvided && capArg < requiredAgents) {
  throw new Error(
    `ladder-workflow: insufficient maxAgents (required ${requiredAgents}, provided ${capArg})`,
  )
}

const readerType = a.readerType ?? 'delegation:runner'
const question =
  typeof a.question === 'string' && a.question
    ? a.question
    : 'Assess the attributable research evidence below and render one verdict.'

const resultSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['complete', 'unavailable', 'unverified'] },
    finding: { type: 'string' },
    sources: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
  },
  required: ['status', 'finding', 'sources', 'reason'],
}

function sourceList(value) {
  return Array.isArray(value)
    ? value.filter((source) => typeof source === 'string' && source.trim()).map((source) => source.trim())
    : []
}

function normalizeStage(value) {
  if (value == null) return { status: 'unavailable', finding: '', sources: [], reason: 'No result was available.' }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { status: 'unverified', finding: '', sources: [], reason: 'Result was not structured evidence.' }
  }
  const finding = typeof value.finding === 'string' ? value.finding.trim() : ''
  const sources = sourceList(value.sources)
  const reason = typeof value.reason === 'string' ? value.reason.trim() : ''
  if (value.status === 'unavailable') return { status: 'unavailable', finding: '', sources: [], reason: reason || 'Source was unavailable.' }
  if (value.status === 'complete' && finding && sources.length) {
    return { status: 'complete', finding, sources, reason }
  }
  return {
    status: 'unverified',
    finding,
    sources: [],
    reason: reason || 'Finding and an attributable source reference are required for complete evidence.',
  }
}

function missingStage() {
  return { status: 'not-run', finding: '', sources: [], reason: 'No result was returned for this target.' }
}

function stageAt(results, index) {
  return index < results.length ? normalizeStage(results[index]) : missingStage()
}

if (!targets.length) {
  return { verdict: 'inconclusive', evidence: [], cost: { agents: 0 }, coverage: [] }
}

let agentCalls = 0
function attempt(prompt, options) {
  agentCalls += 1
  return agent(prompt, options)
}

phase('Read')
const reads = await parallel(
  targets.map((target, index) => () =>
    attempt(
      `Read ${target} and return a compact structured result. Use status complete only when you inspected a reference and can name it in sources; otherwise use unavailable or unverified. Do not claim that your model declaration proves access.`,
      { agentType: readerType, model: 'haiku', effort: 'low', phase: 'Read', label: `read:${index}:${target}`, schema: resultSchema },
    ),
  ),
)

phase('Research')
const researched = await pipeline(targets.map((target, index) => ({ target, index })), ({ target, index }) => {
  const read = stageAt(reads, index)
  return attempt(
    `Research ${target}. The read-stage result was:\n${JSON.stringify(read)}\n\nReturn a compact structured result. Complete requires an attributable finding and at least one inspected source reference. If access was unavailable, say so in status/reason; access-failure prose is not evidence.`,
    { model: 'sonnet', phase: 'Research', label: `research:${index}:${target}`, schema: resultSchema },
  )
})

const coverage = targets.map((target, index) => {
  const read = stageAt(reads, index)
  const research = stageAt(researched, index)
  return {
    index,
    target,
    read: { status: read.status, reason: read.reason },
    research: { status: research.status, reason: research.reason },
    sources: [...new Set([...read.sources, ...research.sources])],
  }
})
const attributableResearchSources = coverage.flatMap((row, index) =>
  stageAt(researched, index).status === 'complete' ? stageAt(researched, index).sources : [],
)
const judgeDigest = targets.map((target, index) => {
  const read = stageAt(reads, index)
  const research = stageAt(researched, index)
  return {
    index,
    target,
    read: { status: read.status, finding: read.finding, sources: read.sources, reason: read.reason },
    research: { status: research.status, finding: research.finding, sources: research.sources, reason: research.reason },
  }
})

phase('Judge')
const judged = await attempt(
  `${question}\n\nThe structured reports below are observations, not verified access. Check material references yourself, distinguish observation from inference, and treat reported access failures as limitations. Coverage is partial where shown. Return a verdict and only evidence paths from attributable complete research.\n\n${JSON.stringify(judgeDigest)}`,
  {
    model: 'opus',
    phase: 'Judge',
    label: 'judge',
    schema: {
      type: 'object',
      properties: {
        verdict: { type: 'string' },
        evidence: { type: 'array', items: { type: 'string' } },
      },
      required: ['verdict', 'evidence'],
    },
  },
)

const reportedJudgeEvidence = sourceList(judged?.evidence)
const judgeEvidence = reportedJudgeEvidence.filter((source) => attributableResearchSources.includes(source))
const hasCompleteResearch = attributableResearchSources.length > 0
const validJudgeEvidence = judgeEvidence.length > 0 && judgeEvidence.length === reportedJudgeEvidence.length

return {
  verdict: hasCompleteResearch && validJudgeEvidence && typeof judged?.verdict === 'string' && judged.verdict.trim()
    ? judged.verdict
    : 'inconclusive',
  evidence: judgeEvidence,
  cost: { agents: agentCalls },
  coverage,
}
