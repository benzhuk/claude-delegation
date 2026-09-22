export const meta = {
  name: 'ladder',
  description: 'Fixed escalation ladder for Opus orchestrator panes: fast-tier reads, mid-tier research, one high-tier judge',
  phases: [
    { title: 'Read', detail: 'fast tier reads each target' },
    { title: 'Research', detail: 'mid tier researches the read results' },
    { title: 'Judge', detail: 'high tier renders one verdict' },
  ],
}

// Ladder workflow template — Opus orchestrator panes only (see skills/delegate/SKILL.md,
// section "Ladder, Opus orchestrator panes only"). Approved by the next-build spec, NOT
// yet live: acceptance is one real run from an Opus orchestrator pane after merge,
// recorded on its work record.
//
// args (may be omitted entirely — every field defaults):
//   targets: string[]      what the fast tier reads (paths, questions, URLs); default []
//   question: string       what the high-tier judge must decide; default a generic prompt
//   readerType: string     agentType for the fast tier; default 'delegation:runner'
//   maxAgents: number      per-run cap on agent() calls; default 12
//
// Returns exactly one object: { verdict, evidence: [paths], cost: { agents } }.
// Intermediate rung output never leaves this script.

const a = args ?? {}
const targets = Array.isArray(a.targets) ? a.targets : []
const capArg = Number(a.maxAgents)
const maxAgents = a.maxAgents != null && Number.isFinite(capArg) ? capArg : 12
const readerType = a.readerType ?? 'delegation:runner'
const question =
  typeof a.question === 'string' && a.question
    ? a.question
    : 'Assess the read and research findings below and render one verdict.'

// Per-run cap. Reserved BEFORE entering parallel()/pipeline() for a rung, never inside a
// stage callback: parallel()/pipeline() may resolve a callback's own thrown error to null
// for just that one item instead of rejecting the whole call, which would let an over-cap
// rung slip through without ever hard-stopping the script. Reserving here means the throw
// always happens at the top level, before any of that rung's agent() calls are made.
let agentCalls = 0
function reserve(n) {
  const next = agentCalls + n
  if (next > maxAgents) {
    throw new Error(
      `ladder-workflow: maxAgents cap of ${maxAgents} exceeded (this rung needs ${n} more agent() call(s), would reach ${next})`,
    )
  }
  agentCalls = next
}

phase('Read')
let reads = []
if (targets.length) {
  reserve(targets.length)
  reads = await parallel(
    targets.map((target) => () =>
      agent(
        `Read ${target} and report only what is there, in under 10 lines. Facts, not a recommendation.`,
        { agentType: readerType, model: 'haiku', effort: 'low', phase: 'Read', label: `read:${target}` },
      ),
    ),
  )
}
const readPairs = targets
  .map((target, index) => ({ target, summary: reads[index] }))
  .filter((pair) => pair.summary)
const readFindings = readPairs.map((pair) => pair.summary)

phase('Research')
let researched = []
if (readPairs.length) {
  reserve(readPairs.length)
  researched = await pipeline(readPairs, (pair) =>
    agent(
      `A fast-tier reader reported this about ${pair.target}:\n\n${pair.summary}\n\nInvestigate further and report findings with evidence paths, in under 20 lines.`,
      { model: 'sonnet', phase: 'Research', label: `research:${pair.target}` },
    ),
  )
}
const researchFindings = researched.filter(Boolean)

phase('Judge')
reserve(1)
const digest = (researchFindings.length ? researchFindings : readFindings).join('\n\n---\n\n')
const judged = await agent(
  `${question}\n\nFindings from the ladder below. Render one verdict and list the evidence paths that support it.\n\n${digest}`,
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

return {
  verdict: judged?.verdict ?? 'inconclusive',
  evidence: Array.isArray(judged?.evidence) ? judged.evidence : [],
  cost: { agents: agentCalls },
}
