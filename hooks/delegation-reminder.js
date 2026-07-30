#!/usr/bin/env node
// UserPromptSubmit hook: inject a one-line delegation-routing reminder adjacent
// to every prompt, so the routing policy survives long sessions and compaction.
// The routing line is model-agnostic; one extra orchestrator-economy sentence is
// added on top-tier orchestrator models (or when the model is unknown).
const fs = require("fs");

const ROUTING =
  "Delegation routing — classify this prompt by shape before acting: " +
  "(a) substantial multi-file BUILD -> invoke the team-build skill (delegation:team-build) FIRST, before writing any code; do not hand-orchestrate builds outside it. " +
  "(b) independent research/review/audit lanes -> invoke the delegate skill (delegation:delegate) and fan out ALL lanes as parallel subagents in ONE message; verify with a stronger tier than the writer. " +
  "(c) single-file edit, known lookup, or conversation -> do it yourself; no agents.";

const ECONOMY =
  " Orchestrator tokens buy judgment only: never pull big files or broad grep output into the main loop — subagents return <=10-line conclusions plus a report path.";

const TAIL_BYTES = 262144; // transcripts can be many MB; read only the tail

function modelFromTranscriptTail(path) {
  try {
    if (!path || !fs.existsSync(path)) return "";
    const fd = fs.openSync(path, "r");
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString("utf8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].includes('"model"')) continue;
        try {
          const j = JSON.parse(lines[i]);
          const m = j && j.message && j.message.model;
          if (typeof m === "string" && m) return m;
        } catch {}
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {}
  return "";
}

function detectModel(input) {
  const m = input && input.model;
  if (typeof m === "string" && m) return m;
  if (m && typeof m.id === "string" && m.id) return m.id;
  return modelFromTranscriptTail(input && input.transcript_path);
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {}
  const model = detectModel(input).toLowerCase();
  // Top-tier orchestrator models get the economy sentence; unknown models too
  // (cheap to include, harmless to ignore). Execution-tier sessions skip it.
  const topTier = !model || model.includes("fable") || model.includes("opus");
  const text = topTier ? ROUTING + ECONOMY : ROUTING;
  process.stdout.write(
    JSON.stringify({
      suppressOutput: true,
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: text },
    })
  );
  process.exit(0);
});
