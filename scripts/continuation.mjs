#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseRecord, validateRecord } from "./work-record.mjs";
export { CONTINUATION_VERSION, CONTINUATION_EVENTS, CONTINUATION_HOSTS } from "./continuation-contract.mjs";

const VERSION = 1;
const EVENTS = new Set(["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "Interrupt"]);
const HOSTS = new Set(["codex", "claude"]);
const ROLES = new Set(["lead", "child", "unknown"]);
const MAX_RECORDS = 512;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_SELECTED = 256;
const HISTORY_LIMIT = 32;
const SINGLETONS = new Set(["work", "scope", "owner", "status", "authority", "artifact", "evidence", "next", "opened", "children", "builder", "rounds", "class"]);
const HEADER_RE = /^[ \t*+-]{0,20}([A-Za-z][A-Za-z ]{0,40}):\**[ \t]{0,20}(.*)$/;

function depsOf(deps = {}) {
  return {
    fs: deps.fsImpl ?? fs,
    env: deps.env ?? process.env,
    homedir: deps.homedir ?? os.homedir,
    epoch: deps.epochFactory ?? (() => crypto.randomBytes(18).toString("base64url")),
    nonce: deps.nonceFactory ?? (() => crypto.randomBytes(8).toString("hex")),
  };
}
function agentsHome(d) { return d.env?.AGENTS_HOME ? String(d.env.AGENTS_HOME) : path.join(d.homedir(), ".agents"); }
function sessionPaths(host, sessionId, d) {
  const key = crypto.createHash("sha256").update(`${host}\0${sessionId}`).digest("hex");
  const dir = path.join(agentsHome(d), "ws", "continuation");
  return { dir, file: path.join(dir, `${key}.json`), lock: path.join(dir, `${key}.claim`) };
}
function present(d, p) {
  try { d.fs.statSync(p); return true; }
  catch (error) { return error?.code !== "ENOENT" && error?.code !== "ENOTDIR"; }
}
function switchedOff(d) { return present(d, path.join(agentsHome(d), "ws-off")) || present(d, path.join(agentsHome(d), "ws-off-continuation")); }
function readState(paths, d) {
  try {
    const value = JSON.parse(d.fs.readFileSync(paths.file, "utf8"));
    return value?.version === VERSION && typeof value.generation === "number" ? value : null;
  } catch { return null; }
}
function writeState(paths, value, d) {
  const tmp = `${paths.file}.${d.nonce()}.tmp`;
  d.fs.writeFileSync(tmp, `${JSON.stringify(value)}\n`, { flag: "wx" });
  try { d.fs.renameSync(tmp, paths.file); }
  catch (error) { try { d.fs.unlinkSync(tmp); } catch {} throw error; }
}
function withClaim(paths, d, fn) {
  try { d.fs.mkdirSync(paths.dir, { recursive: true }); d.fs.mkdirSync(paths.lock); }
  catch { return { claimed: false, value: null }; }
  try { return { claimed: true, value: fn() }; }
  finally { try { d.fs.rmdirSync(paths.lock); } catch {} }
}
function validOpaque(value) { return typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\r\n\0]/.test(value); }
function validEvent(event) {
  return event && HOSTS.has(event.host) && EVENTS.has(event.event) && validOpaque(event.sessionId) && ROLES.has(event.role)
    && typeof event.stopHookActive === "boolean" && (event.cancellation === null || typeof event.cancellation === "boolean")
    && typeof event.cancellationVerified === "boolean" && typeof event.peerWillBlock === "boolean";
}
function profileSupported(event) { return validOpaque(event.profile) && event.cancellationVerified === true; }
function currentMatches(state, event) { return validOpaque(event.episodeKey) && state?.current?.episodeKey === event.episodeKey; }
function epochContext(epoch) { return `Continuation epoch ${epoch}. Ongoing scope remains inactive until bind is confirmed by this episode's PostToolUse.`; }
function suspendCurrent(state) {
  if (!state?.current) return;
  state.current.phase = "suspended"; state.current.binding = null; state.generation += 1;
}
function recordSeen(state, event) {
  return state.history?.some((x) => x.eventKey === event.eventKey
    || (validOpaque(event.episodeKey) && x.episodeKey === event.episodeKey));
}
function failSnapshot(code) { return { status: "UNKNOWN", revision: null, buckets: {}, problems: [code] }; }

function safeRealFile(repoRoot, repoReal, relative, d) {
  if (!validOpaque(relative) || path.isAbsolute(relative)) throw new Error("UNSAFE_PATH");
  const candidate = path.resolve(repoRoot, relative);
  const lexical = path.relative(repoRoot, candidate);
  if (lexical.startsWith("..") || path.isAbsolute(lexical)) throw new Error("UNSAFE_PATH");
  const real = d.fs.realpathSync(candidate);
  const rel = path.relative(repoReal, real);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("UNSAFE_PATH");
  const stat = d.fs.statSync(real);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error("UNREADABLE_PATH");
  return { real, text: d.fs.readFileSync(real, "utf8") };
}
function duplicateSingleton(text) {
  const counts = new Map();
  const lines = String(text).split(/\r?\n/); const blank = lines.findIndex((line) => line.trim() === "");
  for (const line of (blank < 0 ? lines : lines.slice(0, blank))) {
    const match = HEADER_RE.exec(line); if (!match) continue;
    const key = match[1].trim().toLowerCase(); if (SINGLETONS.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count > 1);
}

export function selectContinuationSnapshot(options, deps = {}) {
  const d = depsOf(deps);
  try {
    if (!options || !validOpaque(options.repo) || !Array.isArray(options.roots) || options.roots.length === 0
      || options.roots.length > MAX_SELECTED || !options.roots.every((x) => /^wr-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(x))
      || new Set(options.roots).size !== options.roots.length || !validOpaque(options.authorityRef)) return failSnapshot("BAD_SELECTION");
    const repoRoot = path.resolve(options.repo); const repoReal = d.fs.realpathSync(repoRoot);
    if (!d.fs.statSync(repoReal).isDirectory()) return failSnapshot("REPO_UNREADABLE");
    const authority = safeRealFile(repoRoot, repoReal, options.authorityRef, d);
    const workDir = path.join(repoRoot, "docs", "work");
    const entries = d.fs.readdirSync(workDir, { withFileTypes: true }).filter((entry) => entry.name.endsWith(".record.md"));
    if (entries.length > MAX_RECORDS) return failSnapshot("RECORD_LIMIT");
    const byId = new Map();
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const rel = path.join("docs", "work", entry.name); let item;
      try { const loaded = safeRealFile(repoRoot, repoReal, rel, d); const record = parseRecord(loaded.text); item = { ...loaded, record, duplicate: duplicateSingleton(loaded.text), rel }; }
      catch { continue; }
      const id = item.record.fields?.work; if (!id) continue;
      if (!byId.has(id)) byId.set(id, []); byId.get(id).push(item);
    }
    const selected = []; const visiting = new Set(); const visited = new Set();
    const visit = (id) => {
      if (visiting.has(id)) throw new Error("SELECTION_CYCLE"); if (visited.has(id)) return;
      const matches = byId.get(id) ?? []; if (matches.length !== 1) throw new Error(matches.length ? "DUPLICATE_WORK" : "MISSING_WORK");
      const item = matches[0]; if (item.duplicate || item.record.errors.length) throw new Error("MALFORMED_RECORD");
      if (validateRecord(item.record, { repoRoot, fsImpl: d.fs }).some((finding) => finding.level === "finding")) throw new Error("INVALID_RECORD");
      visiting.add(id);
      for (const child of item.record.fields.children ?? []) { if (!/^wr-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(child)) throw new Error("BAD_CHILD"); visit(child); }
      visiting.delete(id); visited.add(id); selected.push(item); if (selected.length > MAX_SELECTED) throw new Error("SELECTION_LIMIT");
    };
    for (const root of options.roots) visit(root);
    const buckets = Object.fromEntries(["runnable", "owned", "delivered", "rejected", "reviewed", "accepted", "blocked"].map((x) => [x, []]));
    const digest = crypto.createHash("sha256"); digest.update(`authority\0${options.authorityRef}\0${authority.text.length}\0${authority.text}`);
    const evidenceRefs = new Set();
    for (const item of selected.sort((a, b) => a.record.fields.work.localeCompare(b.record.fields.work))) {
      const fields = item.record.fields; buckets[fields.status].push(fields.work); digest.update(`\0record\0${fields.work}\0${item.text.length}\0${item.text}`);
      for (const ref of [...(fields.evidence ?? [])].sort()) { const ev = safeRealFile(repoRoot, repoReal, ref, d); evidenceRefs.add(ref); digest.update(`\0evidence\0${ref}\0${ev.text.length}\0${ev.text}`); }
    }
    for (const values of Object.values(buckets)) values.sort();
    return { status: "OK", revision: digest.digest("hex"), buckets, problems: [], evidenceRefs: [...evidenceRefs].sort() };
  } catch (error) { return failSnapshot(error?.message && /^[A-Z_]+$/.test(error.message) ? error.message : "SELECTION_UNREADABLE"); }
}

function reservedResult(paths, epoch, token, snapshot, peerOnly, d) {
  const summary = snapshot ? Object.entries(snapshot.buckets).map(([key, values]) => `${key}=${values.length}`).join(" ") : "snapshot=unknown";
  const context = `Continuation accounting for the bound selected work: ${summary}. Reconcile this snapshot through existing work records and continue only useful authorized work.`;
  return {
    ...(peerOnly ? { context } : { reason: context }),
    afterFlush(ok) {
      if (!ok) return;
      withClaim(paths, d, () => {
        const latest = readState(paths, d);
        if (latest?.current?.epoch !== epoch || latest.current.attemptToken !== token || latest.current.emitted) return;
        latest.current.emitted = true; latest.generation += 1; writeState(paths, latest, d);
      });
    },
  };
}
function stopResult(state, event, paths, d) {
  if (!currentMatches(state, event) || state.current.phase !== "active" || state.current.attempted) return null;
  if (event.peerWillBlock) {
    state.current.attempted = true; state.current.attemptToken = d.epoch(); state.current.attemptRevision = null; state.generation += 1; writeState(paths, state, d);
    return reservedResult(paths, state.current.epoch, state.current.attemptToken, null, true, d);
  }
  const snapshot = selectContinuationSnapshot(state.current.binding, d);
  if (snapshot.status !== "OK") return { diagnostic: snapshot.problems[0] ?? "SELECTION_UNKNOWN" };
  if (state.current.accountedRevision === snapshot.revision) return null;
  state.current.attempted = true; state.current.attemptToken = d.epoch(); state.current.attemptRevision = snapshot.revision; state.generation += 1; writeState(paths, state, d);
  return reservedResult(paths, state.current.epoch, state.current.attemptToken, snapshot, false, d);
}

export async function handleContinuationEvent(event, deps = {}) {
  const d = depsOf(deps);
  if (!validEvent(event) || event.role !== "lead" || switchedOff(d)) return null;
  if (!validOpaque(event.eventKey)) return null;
  const claudePromptBootstrap = event.host === "claude" && event.event === "UserPromptSubmit" && event.episodeKey === null;
  const identityInvalidatingStart = event.event === "SessionStart" && event.episodeKey === null;
  if (!claudePromptBootstrap && !identityInvalidatingStart && !validOpaque(event.episodeKey)) return null;
  const paths = sessionPaths(event.host, event.sessionId, d);
  if (event.event === "SessionStart") {
    const claimed = withClaim(paths, d, () => { const state = readState(paths, d); if (!state) return null; suspendCurrent(state); writeState(paths, state, d); return null; });
    return claimed.value;
  }
  if (event.event === "Interrupt" || event.cancellation === true) {
    const claimed = withClaim(paths, d, () => {
      const state = readState(paths, d); if (!currentMatches(state, event)) return null;
      state.current.phase = "stopped"; state.current.binding = null; state.generation += 1; writeState(paths, state, d); return null;
    });
    return claimed.value;
  }
  if (!profileSupported(event)) return null;
  if (event.event === "UserPromptSubmit") {
    const claimed = withClaim(paths, d, () => {
      const state = readState(paths, d) ?? { version: VERSION, generation: 0, host: event.host, profile: event.profile, history: [], current: null };
      if (state.current?.promptEventKey === event.eventKey && (state.current.episodeKey === event.episodeKey || claudePromptBootstrap)) return { context: epochContext(state.current.epoch) };
      if (recordSeen(state, event)) { suspendCurrent(state); writeState(paths, state, d); return null; }
      const history = state.current ? [...(state.history ?? []), { episodeKey: state.current.episodeKey, eventKey: state.current.promptEventKey }] : (state.history ?? []);
      state.history = history.slice(-HISTORY_LIMIT); state.profile = event.profile;
      state.current = { episodeKey: event.episodeKey, promptEventKey: event.eventKey, epoch: d.epoch(), phase: "unbound", binding: null, attempted: false, emitted: false, accountedRevision: null };
      state.generation += 1; writeState(paths, state, d); return { context: epochContext(state.current.epoch) };
    });
    return claimed.claimed ? claimed.value : null;
  }
  if (event.stopHookActive) return null;
  const claimed = withClaim(paths, d, () => {
    let state = readState(paths, d);
    if (!state && event.event === "PostToolUse") {
      state = {
        version: VERSION, generation: 1, host: event.host, profile: event.profile, history: [],
        current: { episodeKey: event.episodeKey, promptEventKey: event.eventKey, epoch: d.epoch(), phase: "unbound", binding: null, attempted: false, emitted: false, accountedRevision: null },
      };
      writeState(paths, state, d);
      return { context: epochContext(state.current.epoch) };
    }
    if (!state || state.profile !== event.profile) return null;
    if (event.event === "PostToolUse") {
      if (state.current.phase !== "pending") return null;
      const bootstrap = state.current.episodeKey === null;
      if (bootstrap && (!validOpaque(event.bindRequestId) || event.bindRequestId !== state.current.bindRequestId || !validOpaque(event.episodeKey))) return null;
      if (!bootstrap && !currentMatches(state, event)) return null;
      if (bootstrap) state.current.episodeKey = event.episodeKey;
      state.current.phase = "active"; state.current.confirmEventKey = event.eventKey; state.generation += 1; writeState(paths, state, d);
      return null;
    }
    if (!currentMatches(state, event)) return null;
    if (event.event !== "Stop") return null;
    if (event.cancellation !== false) return null;
    return stopResult(state, event, paths, d);
  });
  return claimed.claimed ? claimed.value : null;
}

function parseCli(argv) {
  const command = argv[0]; if (!["status", "bind", "account", "stop"].includes(command)) throw new Error("expected status, bind, account, or stop");
  const out = { command, roots: [] };
  const names = new Map([["--host", "host"], ["--session-id", "sessionId"], ["--expected-epoch", "expectedEpoch"], ["--repo", "repo"], ["--root", "root"], ["--authority-ref", "authorityRef"], ["--expected-revision", "expectedRevision"], ["--evidence-ref", "evidenceRef"]]);
  for (let i = 1; i < argv.length; i += 2) {
    const key = names.get(argv[i]); const value = argv[i + 1]; if (!key || value === undefined) throw new Error(`unknown or incomplete option: ${argv[i]}`);
    if (key === "root") out.roots.push(value); else { if (out[key] !== undefined) throw new Error(`duplicate option: ${argv[i]}`); out[key] = value; }
  }
  if (!HOSTS.has(out.host) || !validOpaque(out.sessionId)) throw new Error("--host and --session-id are required");
  if (command !== "status" && !validOpaque(out.expectedEpoch)) throw new Error("--expected-epoch is required");
  if (command === "bind" && (!out.repo || !out.roots.length || !out.authorityRef)) throw new Error("bind requires --repo, --root, and --authority-ref");
  if (command === "account" && (!out.expectedRevision || !out.evidenceRef)) throw new Error("account requires --expected-revision and --evidence-ref");
  return out;
}
function publicStatus(state) {
  if (!state?.current) return { status: "unbound" };
  return { status: state.current.phase, epoch: state.current.epoch, attempted: Boolean(state.current.attempted), emitted: Boolean(state.current.emitted), accountedRevision: state.current.accountedRevision ?? null };
}
export async function runContinuationCli(argv, deps = {}) {
  const d = depsOf(deps);
  try {
    const args = parseCli(argv); const paths = sessionPaths(args.host, args.sessionId, d);
    if (args.command === "status") return { exitCode: 0, stdout: `${JSON.stringify(publicStatus(readState(paths, d)))}\n`, stderr: "" };
    if (switchedOff(d)) return { exitCode: 3, stdout: "", stderr: "continuation: DISABLED\n" };
    const claimed = withClaim(paths, d, () => {
      const state = readState(paths, d); if (!state?.current || state.current.epoch !== args.expectedEpoch) return { code: 3, error: "STALE_EPOCH" };
      if (args.command === "stop") { state.current.phase = "stopped"; state.current.binding = null; state.generation += 1; writeState(paths, state, d); return { code: 0, value: publicStatus(state) }; }
      if (args.command === "bind") {
        if (["stopped", "suspended"].includes(state.current.phase) || state.current.attempted) return { code: 3, error: "EPISODE_INACTIVE" };
        const repo = d.fs.realpathSync(path.resolve(args.repo)); if (!d.fs.statSync(repo).isDirectory()) return { code: 3, error: "REPO_UNREADABLE" };
        const binding = { repo, roots: args.roots, authorityRef: args.authorityRef }; const snapshot = selectContinuationSnapshot(binding, d);
        if (snapshot.status !== "OK") return { code: 3, error: snapshot.problems[0] };
        state.current.binding = binding; state.current.phase = "pending"; state.current.accountedRevision = null;
        state.current.bindRequestId = d.epoch(); state.current.bindGeneration = state.generation + 1; state.generation += 1; writeState(paths, state, d);
        return { code: 0, value: { status: "pending", revision: snapshot.revision, bindRequestId: state.current.bindRequestId } };
      }
      if (state.current.phase !== "active" || !state.current.binding) return { code: 3, error: "BINDING_INACTIVE" };
      const snapshot = selectContinuationSnapshot(state.current.binding, d); if (snapshot.status !== "OK") return { code: 3, error: snapshot.problems[0] };
      if (snapshot.revision !== args.expectedRevision) return { code: 3, error: "STALE_REVISION" };
      if (!snapshot.evidenceRefs.includes(args.evidenceRef)) return { code: 3, error: "EVIDENCE_NOT_ATTACHED" };
      state.current.accountedRevision = snapshot.revision; state.generation += 1; writeState(paths, state, d);
      return { code: 0, value: { status: "accounted", revision: snapshot.revision } };
    });
    if (!claimed.claimed) return { exitCode: 3, stdout: "", stderr: "continuation: CLAIM_BUSY\n" };
    return claimed.value.code === 0 ? { exitCode: 0, stdout: `${JSON.stringify(claimed.value.value)}\n`, stderr: "" } : { exitCode: claimed.value.code, stdout: "", stderr: `continuation: ${claimed.value.error}\n` };
  } catch (error) { return { exitCode: 2, stdout: "", stderr: `continuation: ${error?.message ?? "INVALID"}\n` }; }
}

async function main() {
  const result = await runContinuationCli(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout); if (result.stderr) process.stderr.write(result.stderr); process.exitCode = result.exitCode;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
