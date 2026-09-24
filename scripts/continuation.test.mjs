import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { handleContinuationEvent, runContinuationCli, selectContinuationSnapshot } from "./continuation.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(HERE, "continuation.mjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT, "continuation-"));
  const agentsHome = path.join(root, "agents");
  fs.mkdirSync(path.join(root, "docs", "work", "evidence"), { recursive: true });
  fs.mkdirSync(agentsHome, { recursive: true });
  fs.writeFileSync(path.join(root, "authority.md"), "authorized ongoing scope\n");
  fs.writeFileSync(path.join(root, "docs", "work", "evidence", "proof.md"), "VERDICT: APPROVE deadbeef\nproof\n");
  const env = { ...process.env, AGENTS_HOME: agentsHome };
  return { root, agentsHome, env, deps: { env }, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function record({ id = "wr-2026-09-23-root", status = "owned", owner = "worker", children = [], evidence = ["docs/work/evidence/proof.md"], extra = "" } = {}) {
  return `Work: ${id}\nScope: scripts/example.mjs@deadbeef\nOwner: ${owner}\nStatus: ${status}\nAuthority: authority.md\nArtifact: integrate/example@deadbeef\nEvidence: ${evidence.length ? evidence.join(", ") : "none"}\nNext: continue useful work\nOpened: 2026-09-23T00:00:00Z\nChildren: ${children.length ? children.join(", ") : "none"}\n${extra}\nObserved: fixture\n`;
}

function putRecord(f, name, options) {
  fs.writeFileSync(path.join(f.root, "docs", "work", `${name}.record.md`), record(options));
}

function ev(overrides = {}) {
  return { host: "codex", event: "UserPromptSubmit", sessionId: "session-1", episodeKey: "episode-1", eventKey: "event-1", role: "lead", stopHookActive: false, cancellation: false, cancellationVerified: true, peerWillBlock: false, profile: "codex-native-v1", ...overrides };
}

function epochFrom(result) { return /Continuation epoch ([^.]+)\./.exec(result.context)[1]; }
function cliArgs(command, epoch, f, extra = []) {
  return [command, "--host", "codex", "--session-id", "session-1", ...(epoch ? ["--expected-epoch", epoch] : []), ...extra];
}

async function arm(f, { host = "codex", episodeKey = "episode-1", profile = `${host}-native-v1` } = {}) {
  const prompt = await handleContinuationEvent(ev({ host, profile, episodeKey, eventKey: "prompt-1" }), f.deps);
  const epoch = epochFrom(prompt);
  const bind = await runContinuationCli(cliArgs("bind", epoch, f, ["--repo", f.root, "--root", "wr-2026-09-23-root", "--authority-ref", "authority.md"]), f.deps);
  assert.equal(bind.exitCode, 0, bind.stderr);
  const payload = JSON.parse(bind.stdout);
  await handleContinuationEvent(ev({ host, profile, event: "PostToolUse", episodeKey: episodeKey ?? "claude-user-uuid", eventKey: "tool-1", bindRequestId: payload.bindRequestId }), f.deps);
  return { epoch, ...payload };
}

test("selected root closure is strict and revision includes actual attached evidence", (t) => {
  const f = fixture(); t.after(f.cleanup);
  putRecord(f, "root", { children: ["wr-2026-09-23-child"] });
  putRecord(f, "child", { id: "wr-2026-09-23-child", status: "blocked" });
  const options = { repo: f.root, roots: ["wr-2026-09-23-root"], authorityRef: "authority.md" };
  const a = selectContinuationSnapshot(options, f.deps);
  assert.equal(a.status, "OK"); assert.deepEqual(a.buckets.owned, ["wr-2026-09-23-root"]); assert.deepEqual(a.buckets.blocked, ["wr-2026-09-23-child"]);
  fs.appendFileSync(path.join(f.root, "docs", "work", "evidence", "proof.md"), "changed\n");
  const b = selectContinuationSnapshot(options, f.deps); assert.notEqual(b.revision, a.revision);
});

test("missing, duplicate, cyclic, and duplicate-singleton selected records are UNKNOWN", (t) => {
  const f = fixture(); t.after(f.cleanup);
  const options = { repo: f.root, roots: ["wr-2026-09-23-root"], authorityRef: "authority.md" };
  assert.equal(selectContinuationSnapshot(options, f.deps).status, "UNKNOWN");
  putRecord(f, "one", {}); putRecord(f, "two", {});
  assert.equal(selectContinuationSnapshot(options, f.deps).problems[0], "DUPLICATE_WORK");
  fs.rmSync(path.join(f.root, "docs", "work", "two.record.md"));
  putRecord(f, "one", { children: ["wr-2026-09-23-root"] });
  assert.equal(selectContinuationSnapshot(options, f.deps).problems[0], "SELECTION_CYCLE");
  putRecord(f, "one", { extra: "Owner: second" });
  assert.equal(selectContinuationSnapshot(options, f.deps).problems[0], "MALFORMED_RECORD");
});

test("bind activates only after matching tool event and Stop reserves one attempt", async (t) => {
  const f = fixture(); t.after(f.cleanup); putRecord(f, "root", {});
  const prompt = await handleContinuationEvent(ev(), f.deps); const epoch = epochFrom(prompt);
  const bind = await runContinuationCli(cliArgs("bind", epoch, f, ["--repo", f.root, "--root", "wr-2026-09-23-root", "--authority-ref", "authority.md"]), f.deps);
  assert.equal(bind.exitCode, 0);
  assert.equal(await handleContinuationEvent(ev({ event: "Stop", eventKey: "stop-before-tool" }), f.deps), null);
  await handleContinuationEvent(ev({ event: "PostToolUse", eventKey: "tool" }), f.deps);
  const [first, second] = await Promise.all([handleContinuationEvent(ev({ event: "Stop", eventKey: "stop-a" }), f.deps), handleContinuationEvent(ev({ event: "Stop", eventKey: "stop-b" }), f.deps)]);
  assert.equal([first, second].filter((x) => x?.reason).length, 1);
  const reserved = first?.reason ? first : second; reserved.afterFlush(true);
  const status = await runContinuationCli(cliArgs("status", null, f), f.deps); assert.equal(JSON.parse(status.stdout).emitted, true);
});

test("account requires current revision and attached evidence, then unchanged Stop is silent", async (t) => {
  const f = fixture(); t.after(f.cleanup); putRecord(f, "root", {});
  const armed = await arm(f);
  let result = await runContinuationCli(cliArgs("account", armed.epoch, f, ["--expected-revision", "0".repeat(64), "--evidence-ref", "docs/work/evidence/proof.md"]), f.deps);
  assert.match(result.stderr, /STALE_REVISION/);
  result = await runContinuationCli(cliArgs("account", armed.epoch, f, ["--expected-revision", armed.revision, "--evidence-ref", "authority.md"]), f.deps);
  assert.match(result.stderr, /EVIDENCE_NOT_ATTACHED/);
  result = await runContinuationCli(cliArgs("account", armed.epoch, f, ["--expected-revision", armed.revision, "--evidence-ref", "docs/work/evidence/proof.md"]), f.deps);
  assert.equal(result.exitCode, 0);
  assert.equal(await handleContinuationEvent(ev({ event: "Stop", eventKey: "stop" }), f.deps), null);
});

test("new prompt makes stale bind and stale Stop fail closed", async (t) => {
  const f = fixture(); t.after(f.cleanup); putRecord(f, "root", {});
  const oldEpoch = epochFrom(await handleContinuationEvent(ev(), f.deps));
  const newEpoch = epochFrom(await handleContinuationEvent(ev({ episodeKey: "episode-2", eventKey: "prompt-2" }), f.deps));
  const stale = await runContinuationCli(cliArgs("bind", oldEpoch, f, ["--repo", f.root, "--root", "wr-2026-09-23-root", "--authority-ref", "authority.md"]), f.deps);
  assert.match(stale.stderr, /STALE_EPOCH/); assert.notEqual(newEpoch, oldEpoch);
  assert.equal(await handleContinuationEvent(ev({ event: "Stop", eventKey: "old-stop" }), f.deps), null);
});

test("late afterFlush cannot mark a newer episode and null-identity SessionStart suspends", async (t) => {
  const f = fixture(); t.after(f.cleanup); putRecord(f, "root", {}); await arm(f);
  const reserved = await handleContinuationEvent(ev({ event: "Stop", eventKey: "stop-old" }), f.deps);
  await handleContinuationEvent(ev({ episodeKey: "episode-2", eventKey: "prompt-2" }), f.deps);
  reserved.afterFlush(true);
  let status = JSON.parse((await runContinuationCli(cliArgs("status", null, f), f.deps)).stdout);
  assert.equal(status.emitted, false); assert.equal(status.status, "unbound");
  await handleContinuationEvent(ev({ event: "SessionStart", episodeKey: null, eventKey: "resume" }), f.deps);
  status = JSON.parse((await runContinuationCli(cliArgs("status", null, f), f.deps)).stdout);
  assert.equal(status.status, "suspended");
});

test("Claude null-prompt bootstrap requires structured current bind request id", async (t) => {
  const f = fixture(); t.after(f.cleanup); putRecord(f, "root", {});
  const prompt = await handleContinuationEvent(ev({ host: "claude", profile: "claude-native-v1", episodeKey: null }), f.deps);
  const epoch = epochFrom(prompt);
  const bind = await runContinuationCli(["bind", "--host", "claude", "--session-id", "session-1", "--expected-epoch", epoch, "--repo", f.root, "--root", "wr-2026-09-23-root", "--authority-ref", "authority.md"], f.deps);
  const request = JSON.parse(bind.stdout).bindRequestId;
  await handleContinuationEvent(ev({ host: "claude", profile: "claude-native-v1", event: "PostToolUse", episodeKey: "real-user-uuid", eventKey: "tool-bad", bindRequestId: "copied-old" }), f.deps);
  assert.equal(await handleContinuationEvent(ev({ host: "claude", profile: "claude-native-v1", event: "Stop", episodeKey: "real-user-uuid", eventKey: "stop-bad" }), f.deps), null);
  await handleContinuationEvent(ev({ host: "claude", profile: "claude-native-v1", event: "PostToolUse", episodeKey: "real-user-uuid", eventKey: "tool-good", bindRequestId: request }), f.deps);
  assert.ok((await handleContinuationEvent(ev({ host: "claude", profile: "claude-native-v1", event: "Stop", episodeKey: "real-user-uuid", eventKey: "stop-good" }), f.deps)).reason);
});

test("a positively identified current PostToolUse can issue an unbound epoch after installation", async (t) => {
  const f = fixture(); t.after(f.cleanup); putRecord(f, "root", {});
  const result = await handleContinuationEvent(ev({ event: "PostToolUse", eventKey: "first-tool" }), f.deps);
  const epoch = epochFrom(result);
  const status = JSON.parse((await runContinuationCli(cliArgs("status", null, f), f.deps)).stdout);
  assert.equal(status.status, "unbound"); assert.equal(status.epoch, epoch);
  assert.equal(await handleContinuationEvent(ev({ event: "Stop", eventKey: "unbound-stop" }), f.deps), null);
});

test("peer block consumes the one attempt even when selected work becomes unreadable", async (t) => {
  const f = fixture(); t.after(f.cleanup); putRecord(f, "root", {}); await arm(f);
  fs.rmSync(path.join(f.root, "docs", "work", "root.record.md"));
  const peer = await handleContinuationEvent(ev({ event: "Stop", eventKey: "peer-stop", peerWillBlock: true }), f.deps);
  assert.ok(peer.context); assert.equal(peer.reason, undefined);
  assert.equal(await handleContinuationEvent(ev({ event: "Stop", eventKey: "second-stop" }), f.deps), null);
});

test("off switches, unsupported profile, child, unknown episode, recursion, and Interrupt cannot block", async (t) => {
  const f = fixture(); t.after(f.cleanup); putRecord(f, "root", {});
  assert.equal(await handleContinuationEvent(ev({ cancellationVerified: false }), f.deps), null);
  assert.equal(await handleContinuationEvent(ev({ role: "child" }), f.deps), null);
  assert.equal(await handleContinuationEvent(ev({ episodeKey: null }), f.deps), null);
  const armed = await arm(f);
  assert.equal(await handleContinuationEvent(ev({ event: "Stop", eventKey: "recursive", stopHookActive: true }), f.deps), null);
  await handleContinuationEvent(ev({ event: "Interrupt", eventKey: "interrupt", cancellationVerified: false }), f.deps);
  assert.equal(await handleContinuationEvent(ev({ event: "Stop", eventKey: "after-interrupt" }), f.deps), null);
  fs.writeFileSync(path.join(f.agentsHome, "ws-off-continuation"), "");
  assert.equal(await handleContinuationEvent(ev({ episodeKey: "episode-2", eventKey: "new" }), f.deps), null);
  const disabled = await runContinuationCli(cliArgs("stop", armed.epoch, f), f.deps); assert.match(disabled.stderr, /DISABLED/);
});

test("an unreadable off switch fails closed before any state write", async () => {
  const f = fixture();
  const realStat = fs.statSync.bind(fs);
  const fsImpl = new Proxy(fs, { get(target, prop) {
    if (prop === "statSync") return (candidate, ...args) => {
      if (String(candidate).endsWith("ws-off") || String(candidate).endsWith("ws-off-continuation")) { const error = new Error("denied"); error.code = "EACCES"; throw error; }
      return realStat(candidate, ...args);
    };
    return target[prop];
  } });
  try {
    assert.equal(await handleContinuationEvent(ev(), { env: f.env, fsImpl }), null);
    assert.equal(fs.existsSync(path.join(f.agentsHome, "ws", "continuation")), false);
  } finally { f.cleanup(); }
});

test("actual CLI process supports status, bind, account, and stop in sealed fixture", async (t) => {
  const f = fixture(); t.after(f.cleanup); putRecord(f, "root", {});
  const epoch = epochFrom(await handleContinuationEvent(ev(), f.deps));
  const run = (args) => execFileSync(process.execPath, [SOURCE, ...args], { env: f.env, encoding: "utf8" });
  assert.equal(JSON.parse(run(cliArgs("status", null, f))).status, "unbound");
  const binding = JSON.parse(run(cliArgs("bind", epoch, f, ["--repo", f.root, "--root", "wr-2026-09-23-root", "--authority-ref", "authority.md"])));
  await handleContinuationEvent(ev({ event: "PostToolUse", eventKey: "tool" }), f.deps);
  assert.equal(JSON.parse(run(cliArgs("account", epoch, f, ["--expected-revision", binding.revision, "--evidence-ref", "docs/work/evidence/proof.md"]))).status, "accounted");
  assert.equal(JSON.parse(run(cliArgs("stop", epoch, f))).status, "stopped");
});
