#!/usr/bin/env node
// knowledge-triage — Lane 40 (docs/specs/knowledge-triage-40/rev4.md and its precedence documents).
// One daily job on the designated writer host: gather pending notes from the fixed hosts, run the
// existing triage skill ONCE over the union (nested Claude Opus, capped selection), verify the
// skill's own publication read-only, then reconcile archived originals back to their origin hosts.
// Lane 71: before the run it fetches the chezmoi source repo and fast-forwards it (dirty, ahead or
// diverged stops with ATTENTION before anything is gathered), and after the run it repairs one push race
// (fetch, rebase the skill's single commit once, push) via scripts/knowledge-publish-sync.mjs. It still
// never force-pushes, never takes or clears `.curated-update.lock`, never makes a commit of its own and never runs chezmoi.
// Any guard/permission denial stops the affected step and is reported; nothing routes around it.
// Import-safe: no side effects until the CLI entry point runs.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertFieldSafe } from "../skills/multi/scripts/envelope.mjs";
import {
  describeInbox, digestCommitSince, digestHasSlug, gatherKnowledge, killTree, managedNames, noteSlug, publicationState,
  reconcileKnowledge, recordLocalOriginal, runProcess, sha256, writeFileAtomic,
} from "./knowledge-gather.mjs";
import { recoveryBlock, repairPushRace, syncBeforeStart } from "./knowledge-publish-sync.mjs";

export const MODEL = "claude-opus-5-5";
export const CAP = 60;
export const NESTED_TIMEOUT_MS = 60 * 60 * 1000;
export const SLUG_SENTENCE = "For each selected note, use its exact filename without `.md` as the skill's note-slug.";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TICK = "Ben's decision of 2026-09-29 (his 5:11 PM America/New_York tick on the triage item: install when it lands, first run right away)";
const INTAKE = "the Lane 40 rev 4 intake authority (docs/specs/knowledge-triage-40/rev4-intake.md), a one-time manual proof";

// ---------- paths and small helpers ----------

function makeCtx(options = {}) {
  const home = options.home ?? os.homedir();
  const stateDir = options.stateDir ?? path.join(home, ".agents", "knowledge-triage");
  const storeDir = path.join(home, ".claude", "knowledge");
  const inboxDir = options.inboxDir ?? path.join(storeDir, "_inbox");
  return {
    home, stateDir, storeDir, inboxDir, deps: options.deps ?? {}, now: options.now ?? (() => new Date()),
    archiveDir: path.join(inboxDir, "_archive"),
    lockDir: path.join(storeDir, ".curated-update.lock"),
    runLock: path.join(stateDir, "run.lock"),
    attention: path.join(stateDir, "ATTENTION"),
    receiptPath: path.join(stateDir, "last-run.json"),
    sessionsPath: path.join(stateDir, "sessions.json"),
    runStatePath: path.join(stateDir, "run-state.json"),
    skillPath: path.join(home, ".claude", "skills", "triage", "SKILL.md"),
  };
}

const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; } };
const writeJson = (p, v) => writeFileAtomic(p, `${JSON.stringify(v, null, 2)}\n`);
const exists = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };

/** The one writer name the skill already carries; no second source. */
export function parseWriterHost(skillText) {
  const m = /designated\s+writer:\s*(?:\w+\s+)?host\s+`([^`]+)`/i.exec(skillText ?? "");
  return m ? m[1] : null;
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === "EPERM"; }
}

const emptyResidue = () => ({ managed: [], resurrected: [], unresolved: [], oversize: [], unsupportedName: [] });

function recoveryText(problem, block = []) {
  return [
    `${problem}`,
    ...block,
    "Ben inspects and recovers this; never an agent. Only if you inspected a STALE curated lock (no triage process running, owner.txt confirms):",
    "  rmdir ~/.claude/knowledge/.curated-update.lock",
    "Then, once the cause is fixed:",
    "  rm ~/.agents/knowledge-triage/ATTENTION",
  ].join("\n");
}

const RUN_LOCK_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const PACKET_MISSING = "ATTENTION packet NOT written";
const PLUGIN_ROOT = path.resolve(HERE, "..");

/** One line the envelope validator accepts: no control chars, shell payload or reserved words, under the line cap. */
export function safeSummary(reason) {
  const flat = `knowledge-triage: ${reason}`.replace(/\s+/g, " ").replace(/[`;|$]/g, "'").replace(/&&/g, "and")
    .replace(/ (Goal|Details|Needs):/g, " $1 -").trim();
  const text = flat.length > 400 ? `${flat.slice(0, 397)}...` : flat;
  assertFieldSafe("text", text);
  return text;
}

/** Pure: the production note-send launch (Node directly, no shell, no PATH lookup). */
export function buildNotificationInvocation(text, packetFile) {
  return {
    cmd: [process.execPath],
    args: [path.join(PLUGIN_ROOT, "skills", "multi", "scripts", "note-send.mjs"),
      "--from", "knowledge-triage", "--to", "ben", "--kind", "BLOCKED", "--topic", "knowledge-triage", "--text", text,
      ...(packetFile ? ["--packet-file", packetFile] : []), "--sender-repo", PLUGIN_ROOT],
  };
}

async function defaultNoteSend(ctx, text, packetFile) {
  const { cmd, args } = buildNotificationInvocation(text, packetFile);
  const run = await runProcess({ cmd, args, env: process.env, timeoutMs: 30_000 });
  if (run.error || run.timedOut || run.code !== 0) throw new Error(`note-send exit ${run.code ?? run.error?.code ?? "none"}`);
}

/**
 * Write ATTENTION (the detail packet) first, then post exactly one BLOCKED to Ben. Only the outer job
 * does this. Returns a visible suffix ("" when everything worked) naming any failed leg.
 */
async function raiseAttention(ctx, reason, block = []) {
  const text = recoveryText(reason, block);
  let suffix = "";
  try { fs.mkdirSync(ctx.stateDir, { recursive: true }); fs.writeFileSync(ctx.attention, `${ctx.now().toISOString()}\n${text}\n`); }
  catch (err) { suffix += ` [ATTENTION write failed: ${err.message}]`; }
  // Without a packet the note still goes out, with a short fixed label so both recovery commands survive the line cap.
  const written = !suffix;
  try {
    const summary = safeSummary(written ? reason : recoveryText(PACKET_MISSING));
    if (ctx.deps.noteSend) await ctx.deps.noteSend(summary);
    else await defaultNoteSend(ctx, summary, written ? ctx.attention : null);
  } catch (err) { suffix += ` [BLOCKED to Ben NOT delivered: ${err.message}]`; }
  if (suffix) { try { fs.appendFileSync(ctx.attention, `${suffix.trim()}\n`); } catch { /* receipt carries it */ } }
  return suffix;
}

// ---------- the nested call (argv pinned by the R3/R4 probes; see builder-report.md) ----------

export function buildNestedArgv(sessionId) {
  return [
    "-p", "--output-format", "stream-json", "--verbose", "--setting-sources", "user", "--strict-mcp-config", "--no-chrome",
    "--model", MODEL, "--effort", "high", "--session-id", sessionId, "--permission-mode", "auto", "--permission-prompts", "none",
    "--tools", "Skill,Read,Glob,Grep,Edit,Write,Bash",
    "--disallowedTools", "Agent,Bash(claude:*),Bash(codex:*),Bash(note-send:*),Bash(orca:*),Bash(ssh:*),Bash(scp:*),Bash(curl:*)",
  ];
}

const STRIP_ENV = /^(?!CLAUDE_CODE_OAUTH)(ANTHROPIC_|OPENAI_|GEMINI_|ORCA_|CODEX_|CLAUDECODE|CLAUDE_CODE_(SESSION|ENTRYPOINT|EXECPATH)|CLAUDE_SESSION|CLAUDE_PEER|PEER_|AGENT_SLUG|NOTE_|GIT_(AUTHOR|COMMITTER|CONFIG|ASKPASS|PAGER|TERMINAL)|.*_(API_KEY|TOKEN|SECRET)$)/i;

/** Plan-billed, identity-free environment: no API key, no caller peer/session/pane handles, no SSH secrets. */
export function nestedEnv(base = process.env) {
  const env = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined && !STRIP_ENV.test(k) && k !== "SSH_AUTH_SOCK") env[k] = v;
  env.DELEGATION_REVIEW_RUN = "1";
  env.KNOWLEDGE_TRIAGE_NESTED = "1";
  return env;
}

export function buildPrompt(selected, manual) {
  return [
    "Invoke the `triage` skill with the Skill tool as your first action and follow it as the judgment, lock, archive, digest and curated-publication workflow.",
    "",
    `A run started by the knowledge-triage job is Ben explicitly invoking this skill (${manual ? INTAKE : TICK}), for at most ${CAP} notes gathered from all hosts.`,
    `Process ONLY these ${selected.length} notes, listed oldest first (this explicit cap overrides the skill's whole-inbox instruction):`,
    ...selected.map((n) => `- ${n}`),
    SLUG_SENTENCE,
    "Every other inbox note must remain untouched, pending and unarchived. Publish only through the skill's own allowlisted publication.",
    "",
    "Do not invoke another Claude/Codex process, agent, subagent, review-run, note-send, Orca, SSH, curl or any peer/message tool. Do not create a pane or slug, register an inbox, or write a notes channel or docs/ledger.",
    "If any command, permission, sandbox, or guard denies a step, stop that affected step immediately and report the exact denial. Do not retry through another shell, tool, command shape, allowlist, or permission mode.",
    "Finish by reporting each digest line, each disposition, the topics touched and any denial.",
  ].join("\n");
}

/** Usage from the nested stream-json result event; never an invented zero. */
export function parseUsage(stdout) {
  let usage = null;
  for (const line of stdout.toString("utf8").split("\n")) {
    if (!line.startsWith("{")) continue;
    try { const ev = JSON.parse(line); if (ev.type === "result" && ev.usage) usage = ev.usage; } catch { /* partial line */ }
  }
  if (!usage) return { unavailable: "nested output carried no usage" };
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const t = { input: n(usage.input_tokens), output: n(usage.output_tokens), cacheRead: n(usage.cache_read_input_tokens), cacheCreation: n(usage.cache_creation_input_tokens) };
  return { ...t, total: t.input + t.output + t.cacheRead + t.cacheCreation };
}

function resolveCommand(cmd) {
  const c = cmd[0];
  if (path.isAbsolute(c)) return exists(c);
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD").split(";").concat("") : [""];
  return (process.env.PATH ?? process.env.Path ?? "").split(path.delimiter).some((d) => d && exts.some((e) => exists(path.join(d, c + e))));
}

// ---------- snapshots ----------

function archiveSnapshot(ctx) {
  const set = new Set();
  let months = [];
  try { months = fs.readdirSync(ctx.archiveDir); } catch { return set; }
  for (const m of months) {
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    try { for (const f of fs.readdirSync(path.join(ctx.archiveDir, m))) set.add(`${m}/${f}`); } catch { /* skip */ }
  }
  return set;
}

function topicSnapshot(ctx) {
  const map = new Map();
  try {
    for (const f of fs.readdirSync(ctx.storeDir)) {
      if (f.startsWith("_") || f.startsWith(".") || !f.toLowerCase().endsWith(".md")) continue;
      try { map.set(f, sha256(fs.readFileSync(path.join(ctx.storeDir, f)))); } catch { /* skip */ }
    }
  } catch { /* absent store */ }
  return map;
}

const digestHash = (ctx) => { try { return sha256(fs.readFileSync(path.join(ctx.archiveDir, "DIGEST.md"))); } catch { return null; } };

function lockHolder(ctx) {
  if (!exists(ctx.lockDir)) return null;
  try { return fs.readFileSync(path.join(ctx.lockDir, "owner.txt"), "utf8").trim().replace(/\s+/g, " ") || "unknown owner"; } catch { return "unknown owner"; }
}

/** Oldest-first, deduplicated-by-bytes selection of at most CAP notes across local and imported notes. */
function selectNotes(ctx, options, managed) {
  const rows = describeInbox(options).filter((r) => !managed.has(r.name)).sort((a, b) => a.ageMs - b.ageMs || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const seen = new Set(); const eligible = [];
  for (const r of rows) {
    let sha;
    try { sha = sha256(fs.readFileSync(path.join(ctx.inboxDir, r.name))); } catch { continue; }
    if (seen.has(sha)) continue;
    seen.add(sha);
    eligible.push({ ...r, sha });
  }
  return { eligible, selected: eligible.slice(0, CAP) };
}

// ---------- the run ----------

export async function runKnowledgeTriage(options = {}) {
  const ctx = makeCtx(options);
  const opts = { ...options, home: ctx.home, stateDir: ctx.stateDir, inboxDir: ctx.inboxDir, now: ctx.now };
  const started = ctx.now();
  const runState = readJson(ctx.runStatePath, { lastEndedAt: null, consecutiveDeferred: 0 });
  const receipt = {
    schemaVersion: 1, startedAt: started.toISOString(), endedAt: started.toISOString(), status: "skipped", reason: null, sessionId: null,
    model: MODEL, cap: CAP, wallClockMs: 0, notesIn: 0, notesEligible: 0, notesArchived: 0, notesArrived: 0, topicsTouched: [],
    selected: [], outOfSelection: [], deferredConsecutive: runState.consecutiveDeferred ?? 0, tokens: { unavailable: "nested run not started" },
    dotfilesBefore: null, dotfilesSha: null, sync: null, hosts: [], nestedExitCode: null,
    publication: { verified: false, reason: null, head: null, remoteRef: null, digestPath: null }, residue: emptyResidue(), terminal: [],
  };
  let runLockToken = null;
  let ended = false;
  const done = (status, reason, exitCode) => {
    if (ended) return { receipt, exitCode };
    ended = true;
    const end = ctx.now();
    Object.assign(receipt, { status, reason, endedAt: end.toISOString(), wallClockMs: Math.max(0, end.getTime() - started.getTime()) });
    try {
      fs.mkdirSync(ctx.stateDir, { recursive: true });
      writeJson(ctx.receiptPath, receipt);
      writeJson(ctx.runStatePath, { lastEndedAt: status === "skipped" ? runState.lastEndedAt : receipt.endedAt, consecutiveDeferred: receipt.deferredConsecutive });
    } catch { /* the returned receipt is still the truth */ }
    return { receipt, exitCode };
  };
  const skip = (reason) => done("skipped", reason, 0);
  const attend = async (why, shown = why, block = []) => done("attention", `${shown}${await raiseAttention(ctx, why, block)}`, 1);

  try {
    if (exists(path.join(ctx.home, ".agents", "no-knowledge-triage")) || exists(path.join(ctx.home, ".agents", "ws-off"))) return skip("kill switch present");
    let skillText = null;
    try { skillText = fs.readFileSync(ctx.skillPath, "utf8"); } catch { return skip("triage skill missing"); }
    const writer = parseWriterHost(skillText);
    if (!writer) {
      return await attend("writer host not found in triage skill");
    }
    const hostname = (ctx.deps.hostname ?? os.hostname)();
    if (hostname.toLowerCase() !== writer.toLowerCase()) return skip(`not the writer host: ${writer}`);
    if (exists(ctx.attention)) return skip("ATTENTION present");
    const claudeCmd = ctx.deps.claudeCommand ?? ["claude"];
    if (!resolveCommand(claudeCmd)) return skip("claude CLI missing");

    // Job-local run lock, held through gather/nested/reconcile/receipt.
    fs.mkdirSync(ctx.stateDir, { recursive: true });
    try {
      fs.mkdirSync(ctx.runLock);
      runLockToken = `run-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
      fs.writeFileSync(path.join(ctx.runLock, "owner.json"), JSON.stringify({ token: runLockToken, pid: process.pid, started: started.toISOString() }));
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const owner = readJson(path.join(ctx.runLock, "owner.json"), null);
      const ownerAge = owner ? ctx.now().getTime() - Date.parse(owner.started) : NaN;
      if (owner && Number.isInteger(owner.pid) && isAlive(owner.pid) && ownerAge >= 0 && ownerAge < RUN_LOCK_MAX_AGE_MS) return skip("job already running");
      return await attend("stale or unverifiable run.lock; never removed automatically (inspect ~/.agents/knowledge-triage/run.lock)");
    }

    const heldNow = () => lockHolder(ctx);
    const deferOnLock = async (holder) => {
      receipt.deferredConsecutive = (runState.consecutiveDeferred ?? 0) + 1;
      if (receipt.deferredConsecutive >= 2) {
        const why = `curated lock held on ${receipt.deferredConsecutive} consecutive runs (lock held by ${holder})`;
        return await attend(why);
      }
      return done("skipped", `lock held by ${holder}`, 0);
    };
    let holder = heldNow();
    if (holder) return await deferOnLock(holder);

    // Lane 71 item 1: fetch and fast-forward the chezmoi source repo BEFORE anything is read or gathered, so the
    // managed set, the baseline HEAD and the skill all see the post-fast-forward tree. Refusals touch nothing.
    const sync = await syncBeforeStart(opts);
    if (!sync.ok) {
      receipt.sync = { action: "stopped", kind: sync.kind, repo: sync.repo, branch: sync.branch };
      return await attend(sync.reason, sync.reason, recoveryBlock(sync.kind, sync.repo, sync.branch));
    }
    receipt.sync = { action: sync.action, kind: null, repo: sync.repo, branch: sync.branch, behind: sync.behind };

    const { set: managed, error: managedError } = await managedNames(opts);
    if (managedError) return skip(`managed set unresolved: ${managedError}`);
    opts.managedNames = managed;
    const baseline = await publicationState(opts);
    receipt.dotfilesBefore = baseline.head;
    const prevEnd = runState.lastEndedAt ? Date.parse(runState.lastEndedAt) : 0;
    receipt.notesArrived = describeInbox(opts).filter((r) => !r.imported && r.mtimeMs > prevEnd).length;

    const gathered = await gatherKnowledge(opts);
    const { eligible, selected } = selectNotes(ctx, opts, managed);
    receipt.notesEligible = eligible.length;
    receipt.notesIn = selected.length;
    receipt.selected = selected.map((s) => s.name);
    for (const s of selected) if (!s.imported) recordLocalOriginal(opts, s.name, s.sha);
    const residue = emptyResidue();
    for (const r of describeInbox(opts)) if (managed.has(r.name)) residue.managed.push({ host: "local", name: r.name });
    residue.managed.push(...(gathered.residue?.managed ?? []));
    residue.oversize.push(...(gathered.residue?.oversize ?? []));
    residue.unsupportedName.push(...(gathered.residue?.unsupportedName ?? []));
    residue.resurrected.push(...(gathered.residue?.resurrected ?? []));
    residue.unresolved.push(...(gathered.residue?.unresolved ?? []));
    const terminal = [...(gathered.residue?.terminal ?? [])];
    let hosts = gathered.hosts;
    receipt.hosts = hosts; receipt.residue = residue; receipt.terminal = terminal;

    let nestedOk = true;
    let digestChanged = false;
    let archivedSelected = [];
    let topicsTouched = [];

    if (selected.length > 0) {
      holder = heldNow();
      if (holder) return await deferOnLock(holder);
      const sessionId = crypto.randomUUID();
      receipt.sessionId = sessionId;
      const sessions = readJson(ctx.sessionsPath, []);
      writeJson(ctx.sessionsPath, [...(Array.isArray(sessions) ? sessions : []), sessionId]);
      const archiveBefore = archiveSnapshot(ctx);
      const topicsBefore = topicSnapshot(ctx);
      const digestBefore = digestHash(ctx);
      const timeoutMs = ctx.deps.nestedTimeoutMs ?? NESTED_TIMEOUT_MS;
      const run = await runProcess({
        cmd: claudeCmd, args: buildNestedArgv(sessionId), input: buildPrompt(receipt.selected, Boolean(options.manual)), env: nestedEnv(),
        cwd: ctx.home, timeoutMs, maxBytes: 256 * 1024 * 1024, timers: ctx.deps.timers,
      });
      receipt.nestedExitCode = run.code;
      receipt.tokens = parseUsage(run.stdout);
      const archiveAfter = archiveSnapshot(ctx);
      const newlyArchived = [...archiveAfter].filter((x) => !archiveBefore.has(x)).map((x) => x.split("/").slice(1).join("/"));
      const selectedSet = new Set(receipt.selected);
      receipt.outOfSelection = newlyArchived.filter((n) => !selectedSet.has(n));
      archivedSelected = newlyArchived.filter((n) => selectedSet.has(n));
      receipt.notesArchived = archivedSelected.length;
      const topicsAfter = topicSnapshot(ctx);
      topicsTouched = [...topicsAfter].filter(([k, v]) => topicsBefore.get(k) !== v).map(([k]) => k);
      receipt.topicsTouched = topicsTouched;
      digestChanged = digestHash(ctx) !== digestBefore;
      if (run.timedOut) {
        nestedOk = false;
        const why = `nested triage exceeded ${Math.round(timeoutMs / 60000)} minutes; process tree killed, curated lock left as the skill's rule says`;
        return await attend(why);
      }
      if (run.error || run.code !== 0) {
        nestedOk = false;
        return done("failed", `nested claude exited ${run.code ?? "without a code"}${run.error ? ` (${run.error.code ?? run.error.message})` : ""}`, 1);
      }
      if (receipt.outOfSelection.length > 0) {
        const why = `nested run archived ${receipt.outOfSelection.length} note(s) outside the selection; no origin reconciliation`;
        return await attend(why);
      }
    }

    // Publication identity: strict only when this run changed DIGEST; otherwise unverified just defers.
    let pub = await publicationState(opts);
    let repairNote = "";
    // Lane 71 item 2: this run changed DIGEST and origin moved before the skill could push its one commit.
    if (digestChanged && !pub.verified && pub.head && pub.remoteRef && pub.head !== pub.remoteRef) {
      const fix = await repairPushRace(opts, { repo: receipt.sync.repo, branch: receipt.sync.branch, before: receipt.dotfilesBefore });
      receipt.publication = { ...receipt.publication, repair: fix.stop ? { attempted: true, outcome: fix.stop.kind } : fix.pushed ? { attempted: true, outcome: "pushed" } : { attempted: false, why: fix.why } };
      if (fix.stop) return await attend(fix.stop.reason, fix.stop.reason, recoveryBlock(fix.stop.kind, receipt.sync.repo, receipt.sync.branch));
      if (fix.pushed) pub = await publicationState(opts);
      else repairNote = ` [repair not attempted: ${fix.why}]`;
    }
    receipt.dotfilesSha = pub.head;
    receipt.publication = { ...receipt.publication, verified: pub.verified, reason: pub.reason, head: pub.head, remoteRef: pub.remoteRef, digestPath: pub.digestRel };
    if (digestChanged) {
      const commit = await digestCommitSince(opts, pub, receipt.dotfilesBefore);
      const problem = !pub.verified ? pub.reason : !commit ? "DIGEST changed but no commit touching its source path since the run began" : null;
      if (problem) {
        receipt.publication = { ...receipt.publication, verified: false, reason: problem };
        return await attend(`publication not verified: ${problem}${repairNote}`);
      }
    }
    let reason = null;
    if (selected.length > 0 && nestedOk && archivedSelected.length === 0 && !digestChanged) {
      reason = "skill deferred";
      receipt.deferredConsecutive = (runState.consecutiveDeferred ?? 0) + 1;
      if (receipt.deferredConsecutive >= 2) {
        return await attend(`skill deferred on ${receipt.deferredConsecutive} consecutive runs with no DIGEST change`, "skill deferred repeatedly");
      }
    } else {
      receipt.deferredConsecutive = 0;
    }
    if (selected.length === 0) reason = "inbox empty";

    hosts = await reconcileKnowledge(opts, gathered);
    const rec = hosts.residue ?? {};
    residue.resurrected.push(...(rec.resurrected ?? []).filter((r) => !residue.resurrected.some((x) => x.host === r.host && x.name === r.name)));
    residue.unresolved.push(...(rec.unresolved ?? []).filter((r) => !residue.unresolved.some((x) => x.host === r.host && x.name === r.name)));
    for (const t of rec.terminal ?? []) if (!terminal.includes(t)) terminal.push(t);
    receipt.hosts = [...hosts];
    return done(reason === "skill deferred" ? "skipped" : "success", reason, 0);
  } catch (err) {
    return done("failed", `unexpected error: ${err && err.message ? err.message : err}`, 1);
  } finally {
    if (runLockToken) {
      const owner = readJson(path.join(ctx.runLock, "owner.json"), null);
      if (owner?.token === runLockToken) {
        try { fs.rmSync(path.join(ctx.runLock, "owner.json"), { force: true }); fs.rmdirSync(ctx.runLock); } catch { /* left as evidence */ }
      }
    }
  }
}

// ---------- CLI ----------

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const canon = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  return canon(fileURLToPath(import.meta.url)) === canon(entry);
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== "--manual");
  if (unknown.length > 0) {
    process.stderr.write(`usage: knowledge-triage.mjs [--manual]\nunrecognized argument(s): ${unknown.join(" ")}\n`);
    process.exitCode = 2;
  } else {
    runKnowledgeTriage({ manual: args.includes("--manual") }).then(({ receipt, exitCode }) => {
      process.stdout.write(`knowledge-triage ${receipt.status}${receipt.reason ? `: ${receipt.reason}` : ""}\n`);
      process.exitCode = exitCode;
    });
  }
}

export { noteSlug, digestHasSlug, killTree };
