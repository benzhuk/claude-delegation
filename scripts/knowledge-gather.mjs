// knowledge-gather — Lane 40 (docs/specs/knowledge-triage-40/rev4.md + spec-r1-adjudication.md).
// Pulls pending knowledge notes from the fixed hosts over one SSH tar stream each, imports them
// into the local inbox under a deterministic host-prefixed name, and after the triage skill's
// verified publication moves each original into its own host's `_inbox/_archive/`. It feeds the
// existing triage skill; it is not a sync service, host registry or database (stage metadata only).
// Import-safe: no side effects at import time. Node builtins only.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export const HOSTS = ["netcup", "hetzner", "mac"];
// Production endpoints are fixed here. `pending` is the Mac placeholder until Ben supplies an alias.
export const ENDPOINTS = { netcup: "ben@100.69.249.18", hetzner: "ben@100.111.119.54", mac: "pending" };
export const HOST_TIMEOUT_MS = 60_000;
const MAX_STREAM_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 1000;
const MAX_NOTE_BYTES = 1024 * 1024;
const MIN_AGE_MINUTES = 5;
const GIT_TIMEOUT_MS = 30_000;
const SSH_OPTIONS = [
  "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15",
  "-o", "ForwardAgent=no", "-o", "ForwardX11=no", "-o", "ClearAllForwardings=yes",
  "-o", "PermitLocalCommand=no", "-o", "RemoteCommand=none", "-o", "RequestTTY=no",
];

// ---------- fixed remote programs (constants; note data only ever travels on stdin) ----------

const GATHER_SCRIPT = [
  'cd "$HOME/.claude/knowledge/_inbox" || exit 3',
  "COPYFILE_DISABLE=1; export COPYFILE_DISABLE",
  `find . -maxdepth 1 -type f -name "*.md" ! -name ".*" -mmin +${MIN_AGE_MINUTES} -print0 | tar --format=pax --null -T - -cf -`,
].join("\n");

const ARCHIVE_SCRIPT = [
  "IFS= read -r h; IFS= read -r m; IFS= read -r n",
  'case "$n" in ""|*/*|.*) echo BADNAME; exit 0;; esac',
  'case "$h" in ""|*[!0-9a-f]*) echo BADARG; exit 0;; esac',
  'case "$m" in [0-9][0-9][0-9][0-9]-[0-9][0-9]) ;; *) echo BADARG; exit 0;; esac',
  'root="$HOME/.claude/knowledge/_inbox"; src="$root/$n"; dst="$root/_archive/$m/$n"',
  'hashof() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d" " -f1; else shasum -a 256 "$1" | cut -d" " -f1; fi; }',
  'okdst() { [ -f "$dst" ] && [ ! -L "$dst" ] && [ "$(hashof "$dst")" = "$h" ]; }',
  // Rename-claim: the live source name is never removed after a check. The note is first moved into an
  // exclusive per-hash claim dir, and the bytes actually claimed are the ones hashed and archived.
  'claim="$root/.claim-$h"; cf="$claim/note"',
  'restore() { if ln "$cf" "$src" 2>/dev/null; then rm -f "$cf"; rmdir "$claim" 2>/dev/null; echo "$1"; else echo "CLAIM_KEPT $cf"; fi; }',
  'if [ -L "$src" ]; then echo SYMLINK; exit 0; fi',
  'if [ -e "$src" ]; then',
  '  [ -f "$src" ] || { echo CHANGED_SOURCE; exit 0; }',
  '  [ "$(hashof "$src")" = "$h" ] || { echo CHANGED_SOURCE; exit 0; }',
  '  if [ -e "$dst" ] || [ -L "$dst" ]; then if okdst; then echo RESURRECTED; else echo DEST_MISMATCH; fi; exit 0; fi',
  '  mkdir -p "$root/_archive/$m" || { echo MOVE_FAILED; exit 0; }',
  '  mkdir "$claim" 2>/dev/null || { echo "CLAIM_BUSY $claim"; exit 0; }',
  '  mv "$src" "$cf" 2>/dev/null || { rmdir "$claim" 2>/dev/null; echo MOVE_FAILED; exit 0; }',
  '  if [ -f "$cf" ] && [ ! -L "$cf" ] && [ "$(hashof "$cf")" = "$h" ]; then :; else restore CHANGED_SOURCE; exit 0; fi',
  '  ln "$cf" "$dst" 2>/dev/null || { restore MOVE_FAILED; exit 0; }',
  '  if okdst; then rm -f "$cf"; rmdir "$claim" 2>/dev/null; echo MOVED; else echo "CLAIM_KEPT $cf"; fi',
  "else",
  '  if [ -e "$claim" ] || [ -L "$claim" ]; then echo "CLAIM_KEPT $cf"; elif okdst; then echo ALREADY; else echo ORIGIN_MISSING; fi',
  "fi",
].join("\n");

// ---------- small helpers ----------

export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export function writeFileAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  const fd = fs.openSync(tmp, "wx");
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); } catch (err) { try { fs.rmSync(tmp, { force: true }); } catch { /* the throw matters */ } throw err; }
}

export function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    try { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch { /* best effort */ }
    return;
  }
  try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } }
}

/** Run one child with a parent watchdog that kills the whole process tree. Never uses a shell. */
export function runProcess({ cmd, args = [], input = null, env, cwd, timeoutMs, maxBytes = Infinity, timers }) {
  const setT = timers?.setTimeout ?? setTimeout;
  const clearT = timers?.clearTimeout ?? clearTimeout;
  return new Promise((resolve) => {
    const out = []; const err = []; let size = 0;
    let timedOut = false; let overflow = false; let killed = false; let done = false; let handle = null; let child;
    const killOnce = () => { if (!killed) { killed = true; killTree(child.pid); } };
    const finish = (extra) => {
      if (done) return;
      done = true;
      if (handle !== null) clearT(handle);
      resolve({ code: null, signal: null, error: null, timedOut, overflow, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8"), ...extra });
    };
    try {
      child = spawn(cmd[0], [...cmd.slice(1), ...args], {
        env, cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false, detached: process.platform !== "win32",
      });
    } catch (error) { finish({ error }); return; }
    child.on("error", (error) => finish({ error }));
    child.stdout.on("data", (d) => {
      size += d.length;
      if (size > maxBytes) { if (!overflow) { overflow = true; killOnce(); } return; }
      out.push(d);
    });
    child.stderr.on("data", (d) => { if (err.length < 64) err.push(d); });
    child.on("close", (code, signal) => finish({ code, signal }));
    child.stdin.on("error", () => { /* child exited before reading stdin */ });
    child.stdin.end(input ?? undefined);
    if (timeoutMs) {
      handle = setT(() => {
        timedOut = true; killOnce();
        setT(() => finish({}), 2000).unref?.();
      }, timeoutMs);
    }
  });
}

/** The parent's environment for children that talk to a remote: only what local ssh auth needs. */
export function sshEnv(base = process.env) {
  const env = {};
  // ProgramData: native Windows OpenSSH exits 255 at startup without it.
  for (const k of ["PATH", "Path", "SystemRoot", "ProgramData", "USERPROFILE", "HOME", "TEMP", "TMP", "SSH_AUTH_SOCK"]) {
    if (base[k] !== undefined) env[k] = base[k];
  }
  return env;
}

// ---------- context ----------

function makeCtx(options = {}) {
  const home = options.home ?? os.homedir();
  const deps = options.deps ?? {};
  const stateDir = options.stateDir ?? path.join(home, ".agents", "knowledge-triage");
  const inboxDir = options.inboxDir ?? path.join(home, ".claude", "knowledge", "_inbox");
  return {
    home, deps, stateDir, inboxDir,
    now: options.now ?? (() => new Date()),
    archiveDir: path.join(inboxDir, "_archive"),
    gatherDir: path.join(stateDir, "gather"),
    statePath: path.join(stateDir, "gather", "state.json"),
    endpoints: { ...ENDPOINTS, ...(deps.endpoints ?? {}) },
    ssh: deps.sshCommand ?? ["ssh"],
    hostTimeoutMs: deps.hostTimeoutMs ?? HOST_TIMEOUT_MS,
    timers: deps.timers,
  };
}

const emptyRow = (host) => ({ host, status: "gathered", reason: null, fetched: 0, imported: 0, alreadyPresent: 0, archived: 0, pending: 0, managed: 0, resurrected: 0, unresolved: 0, terminal: 0 });
const emptyResidue = () => ({ managed: [], resurrected: [], unresolved: [], oversize: [], unsupportedName: [], terminal: [] });

function withResidue(value, residue) {
  Object.defineProperty(value, "residue", { value: residue, enumerable: false, configurable: true, writable: true });
  return value;
}

// ---------- state (minimal stage metadata, not a database) ----------

function loadState(ctx) {
  try {
    const s = JSON.parse(fs.readFileSync(ctx.statePath, "utf8"));
    if (s && s.schema === 1 && s.notes && typeof s.notes === "object") return s;
  } catch { /* first run or unreadable: start empty */ }
  return { schema: 1, notes: {} };
}

const saveState = (ctx, state) => writeFileAtomic(ctx.statePath, `${JSON.stringify(state, null, 1)}\n`);
const stagedPath = (ctx, host, sha) => path.join(ctx.gatherDir, host, `${sha}.md`);
export const noteSlug = (name) => name.replace(/\.md$/i, "");

/** Local capture of an original's hash before the skill rewrites its status frontmatter. */
export function recordLocalOriginal(options, name, sha) {
  const ctx = makeCtx(options);
  const state = loadState(ctx);
  const entry = state.notes[sha] ?? { sha, canonical: null, origins: [] };
  entry.canonical = entry.canonical ?? { kind: "local", name };
  state.notes[sha] = entry;
  saveState(ctx, state);
}

// ---------- local inbox view ----------

const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})(?:[-_.]|$)/;

function safeStat(p) { try { return fs.lstatSync(p); } catch { return null; } }

/** Top-level non-dot regular `.md` files of the local inbox. */
export function listInbox(inboxDir) {
  let names = [];
  try { names = fs.readdirSync(inboxDir); } catch { return []; }
  const rows = [];
  for (const name of names.sort()) {
    if (name.startsWith(".") || !name.toLowerCase().endsWith(".md")) continue;
    const st = safeStat(path.join(inboxDir, name));
    if (st?.isFile()) rows.push({ name, mtimeMs: st.mtimeMs });
  }
  return rows;
}

/** Original note age: basename date prefix when valid, else original mtime (imports keep theirs). */
export function ageOf(name, mtimeMs, originalName = name) {
  const m = originalName.match(DATE_PREFIX);
  if (m) { const t = Date.parse(`${m[1]}T00:00:00Z`); if (Number.isFinite(t)) return t; }
  return mtimeMs;
}

/** Inbox notes with age info, resolving imports back to their original name/mtime. */
export function describeInbox(options = {}) {
  const ctx = makeCtx(options);
  const state = loadState(ctx);
  const byImported = new Map();
  for (const e of Object.values(state.notes)) if (e.canonical?.kind === "import") byImported.set(e.canonical.name, e);
  return listInbox(ctx.inboxDir).map(({ name, mtimeMs }) => {
    const imp = byImported.get(name);
    const origin = imp?.origins.find((o) => o.host === imp.canonical.host) ?? imp?.origins[0];
    return { name, mtimeMs, imported: Boolean(imp), host: imp?.canonical.host ?? null, ageMs: ageOf(name, origin?.sourceMtimeMs ?? mtimeMs, origin?.originalName ?? name) };
  });
}

function findArchived(ctx, name) {
  let months = [];
  try { months = fs.readdirSync(ctx.archiveDir); } catch { return null; }
  for (const m of months.sort()) {
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    const st = safeStat(path.join(ctx.archiveDir, m, name));
    if (st?.isFile()) return m;
  }
  return null;
}

// ---------- tar parsing (validated fully in memory before anything is written) ----------

function cstr(buf) { const i = buf.indexOf(0); return buf.subarray(0, i < 0 ? buf.length : i).toString("utf8"); }

function octal(buf, what) {
  if (buf[0] & 0x80) throw new Error(`tar ${what} uses unsupported base-256 encoding`);
  const s = cstr(buf).trim();
  if (s === "") return 0;
  if (!/^[0-7]+$/.test(s)) throw new Error(`tar ${what} is not octal`);
  return parseInt(s, 8);
}

function parsePax(data) {
  const rec = {};
  let pos = 0;
  while (pos < data.length) {
    const sp = data.indexOf(0x20, pos);
    if (sp < 0) throw new Error("malformed pax record (no length)");
    const lenText = data.subarray(pos, sp).toString("latin1");
    if (!/^[1-9]\d*$/.test(lenText)) throw new Error("malformed pax record length");
    const len = Number(lenText);
    if (pos + len > data.length || len < sp - pos + 3 || data[pos + len - 1] !== 0x0a) throw new Error("pax record length mismatch");
    const body = data.subarray(sp + 1, pos + len - 1).toString("utf8");
    const eq = body.indexOf("=");
    if (eq < 1) throw new Error("malformed pax record (no key)");
    rec[body.slice(0, eq)] = body.slice(eq + 1);
    pos += len;
  }
  return rec;
}

export function parseTar(buf) {
  const notes = []; const oversize = []; const unsupported = [];
  let off = 0; let entries = 0; let pax = null; let ended = false; let skippedMeta = 0;
  while (off < buf.length) {
    if (off + 512 > buf.length) throw new Error("truncated tar header");
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) { ended = true; break; }
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i];
    if (sum !== octal(h.subarray(148, 156), "checksum")) throw new Error("tar header checksum mismatch");
    if (++entries > MAX_ENTRIES) throw new Error(`more than ${MAX_ENTRIES} tar entries`);
    const type = h[156] === 0 ? "0" : String.fromCharCode(h[156]);
    const size = octal(h.subarray(124, 136), "size");
    off += 512;
    const padded = Math.ceil(size / 512) * 512;
    if (off + padded > buf.length) throw new Error("truncated tar data");
    if (type === "x") { pax = parsePax(buf.subarray(off, off + size)); off += padded; continue; }
    if (type !== "0") throw new Error(`unsupported tar entry type ${JSON.stringify(type)}`);
    const meta = pax ?? {}; pax = null;
    if (meta.linkpath !== undefined) throw new Error("tar entry carries a linkpath");
    if (meta.size !== undefined && Number(meta.size) !== size) throw new Error("pax size disagrees with the file header");
    let name = meta.path;
    if (name === undefined) {
      const prefix = h.subarray(257, 262).toString("latin1") === "ustar" ? cstr(h.subarray(345, 500)) : "";
      name = prefix ? `${prefix}/${cstr(h.subarray(0, 100))}` : cstr(h.subarray(0, 100));
    }
    const mtimeMs = meta.mtime !== undefined && Number.isFinite(parseFloat(meta.mtime)) ? Math.round(parseFloat(meta.mtime) * 1000) : octal(h.subarray(136, 148), "mtime") * 1000;
    const data = buf.subarray(off, off + size);
    off += padded;
    if (name.startsWith("./")) name = name.slice(2);
    if (name === "" || name.startsWith("/") || name.split("/").includes("..") || name.includes("/")) {
      throw new Error(`unsafe tar entry path ${JSON.stringify(name)}`);
    }
    // A POSIX filename may legally contain a backslash or start like a drive letter; never a path here, so skip it, don't fail the host.
    if (/[\\]|^[A-Za-z]:/.test(name)) { unsupported.push(name); continue; }
    if (name.startsWith(".")) { skippedMeta++; continue; }
    if (/[\0\n]/.test(name) || !name.toLowerCase().endsWith(".md")) { unsupported.push(name); continue; }
    if (size > MAX_NOTE_BYTES) { oversize.push(name); continue; }
    notes.push({ name, bytes: Buffer.from(data), mtimeMs });
  }
  if (!ended) throw new Error("missing tar end-of-archive marker (truncated stream)");
  return { notes, oversize, unsupported, skippedMeta };
}

// ---------- managed names (read-only chezmoi source inbox listing) ----------

/** Resolve the DIGEST source path and its repo read-only through chezmoi (bounded), or via the seam. */
async function resolveDigestSource(ctx) {
  const digestTarget = path.join(ctx.archiveDir, "DIGEST.md");
  if (ctx.deps.chezmoiSourceInbox) return { sourcePath: path.join(ctx.deps.chezmoiSourceInbox, "_archive", "DIGEST.md"), error: null };
  const r = await runProcess({ cmd: ctx.deps.chezmoiCommand ?? ["chezmoi"], args: ["source-path", digestTarget], env: process.env, timeoutMs: GIT_TIMEOUT_MS, timers: ctx.timers });
  const p = r.stdout.toString("utf8").trim();
  if (r.code !== 0 || !p) return { sourcePath: null, error: `chezmoi source-path failed${r.error ? `: ${r.error.code ?? r.error.message}` : ""}` };
  return { sourcePath: p, error: null };
}

const CHEZMOI_ATTRS = /^(?:(?:private|readonly|executable|exact|literal|empty|encrypted)_)+/;

async function managedSet(ctx) {
  const set = new Set();
  const { sourcePath, error } = await resolveDigestSource(ctx);
  if (!sourcePath) return { set, error: error ?? "digest source path unresolved" };
  const sourceInbox = path.dirname(path.dirname(sourcePath));
  try {
    for (const n of fs.readdirSync(sourceInbox)) { set.add(n); set.add(n.replace(CHEZMOI_ATTRS, "")); }
  } catch (err) { return { set, error: `chezmoi source inbox unreadable: ${err.code ?? err.message}` }; }
  return { set, error: null };
}

// ---------- read-only publication identity (never commits, pushes or applies) ----------

async function git(ctx, repo, args) {
  const r = await runProcess({ cmd: ctx.deps.gitCommand ?? ["git"], args: ["-C", repo, ...args], env: ctx.deps.gitEnv ?? process.env, timeoutMs: GIT_TIMEOUT_MS, timers: ctx.timers });
  return { ok: r.code === 0 && !r.error, out: r.stdout.toString("utf8").trim(), error: r.error ? String(r.error.code ?? r.error.message) : r.stderr.trim().slice(0, 200) };
}

async function repoRoot(ctx, sourcePath) {
  if (ctx.deps.dotfilesRepo) return { root: ctx.deps.dotfilesRepo, error: null };
  const top = await git(ctx, path.dirname(sourcePath), ["rev-parse", "--show-toplevel"]);
  if (!top.ok || !top.out) return { root: null, error: `dotfiles repo unresolved: ${top.error || "empty"}` };
  return { root: top.out, error: null };
}

/** The dotfiles repo root alone (the seam, else chezmoi source-path then the git toplevel); lane 71's preflight uses it. */
export async function resolveDotfilesRepo(options = {}) {
  const ctx = makeCtx(options);
  if (ctx.deps.dotfilesRepo) return { root: ctx.deps.dotfilesRepo, error: null };
  const { sourcePath, error } = await resolveDigestSource(ctx);
  if (!sourcePath) return { root: null, error: error ?? "digest source path unresolved" };
  return repoRoot(ctx, sourcePath);
}

/** HEAD, a FRESH remote ref (ls-remote, not a stale tracking ref), and the committed DIGEST at HEAD. */
export async function publicationState(options = {}) {
  const ctx = makeCtx(options);
  const res = { verified: false, reason: null, head: null, remoteRef: null, digestRel: null, digestText: null, repo: null };
  const { sourcePath, error } = await resolveDigestSource(ctx);
  if (!sourcePath) return { ...res, reason: error };
  const found = await repoRoot(ctx, sourcePath);
  if (!found.root) return { ...res, reason: found.error };
  const root = found.root;
  res.repo = root;
  res.digestRel = path.relative(root, sourcePath).split(path.sep).join("/");
  const head = await git(ctx, root, ["rev-parse", "HEAD"]);
  if (!head.ok || !head.out) return { ...res, reason: `git HEAD unreadable: ${head.error || "empty"}` };
  res.head = head.out.split(/\s+/)[0];
  const branch = await git(ctx, root, ["symbolic-ref", "--short", "HEAD"]);
  if (!branch.ok || !branch.out) return { ...res, reason: "dotfiles HEAD is detached; no branch to verify against remote" };
  const remote = await git(ctx, root, ["ls-remote", "origin", `refs/heads/${branch.out}`]);
  if (!remote.ok || !remote.out) return { ...res, reason: `remote ref unreadable: ${remote.error || "empty answer"}` };
  res.remoteRef = remote.out.split(/\s+/)[0];
  const show = await git(ctx, root, ["show", `HEAD:${res.digestRel}`]);
  res.digestText = show.ok ? show.out : null;
  if (res.remoteRef !== res.head) return { ...res, reason: "HEAD does not match the fresh remote ref" };
  return { ...res, verified: true };
}

/** First commit since `before` that touches the DIGEST source path, or null. */
export async function digestCommitSince(options, pub, before) {
  if (!before || !pub?.repo || !pub.digestRel) return null;
  const ctx = makeCtx(options);
  const r = await git(ctx, pub.repo, ["log", "--format=%H", `${before}..HEAD`, "--", pub.digestRel]);
  return r.ok ? (r.out.split(/\s+/).filter(Boolean)[0] ?? null) : null;
}

export const managedNames = async (options = {}) => managedSet(makeCtx(options));

export function digestHasSlug(text, slug) {
  return typeof text === "string" && text.includes(`· ${slug} →`);
}

// ---------- import into the local inbox ----------

function safeStem(name) {
  return noteSlug(name).replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_").slice(0, 80);
}

export function importedNameFor(host, sha, originalName) {
  return `${host}-${sha.slice(0, 12)}-${safeStem(originalName)}.md`;
}

function importNote(ctx, importedName, bytes, mtimeMs) {
  fs.mkdirSync(ctx.inboxDir, { recursive: true });
  const finalPath = path.join(ctx.inboxDir, importedName);
  const tmp = path.join(ctx.inboxDir, `.import-${process.pid}-${crypto.randomBytes(4).toString("hex")}.tmp`);
  const fd = fs.openSync(tmp, "wx");
  try { fs.writeSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try {
    const t = mtimeMs / 1000;
    fs.utimesSync(tmp, t, t);
    try {
      fs.linkSync(tmp, finalPath);
      return "created";
    } catch (err) {
      if (err.code === "EEXIST") return sha256(fs.readFileSync(finalPath)) === sha256(bytes) ? "same" : "conflict";
      throw new Error(`atomic import unsupported here (${err.code ?? err.message}); refusing a partial write`);
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* owned temp already gone */ }
  }
}

// ---------- gather ----------

async function fetchHost(ctx, host, endpoint) {
  const r = await runProcess({
    cmd: ctx.ssh, args: [...SSH_OPTIONS, endpoint, "/bin/sh", "-c", `'${GATHER_SCRIPT}'`], env: sshEnv(), timeoutMs: ctx.hostTimeoutMs, maxBytes: MAX_STREAM_BYTES, timers: ctx.timers,
  });
  if (r.overflow) return { status: "failed", reason: `stream exceeded ${MAX_STREAM_BYTES} bytes` };
  if (r.timedOut) return { status: "skipped", reason: `unreachable: timed out after ${ctx.hostTimeoutMs} ms` };
  if (r.error) return { status: "skipped", reason: `unreachable: ${r.error.code ?? r.error.message}` };
  if (r.code === 255) return { status: "skipped", reason: `unreachable: ssh exit 255 ${r.stderr.trim().slice(0, 120)}`.trim() };
  if (r.stdout.length === 0 && (r.code === 0 || /empty archive|no files/i.test(r.stderr))) return { status: "gathered", parsed: { notes: [], oversize: [], unsupported: [], skippedMeta: 0 } };
  if (r.code !== 0) return { status: "failed", reason: `remote gather exit ${r.code}: ${r.stderr.trim().slice(0, 120)}` };
  try { return { status: "gathered", parsed: parseTar(r.stdout) }; } catch (err) { return { status: "failed", reason: `invalid tar stream: ${err.message}` }; }
}

const pendingFor = (state, host) => Object.values(state.notes).reduce((n, e) => n + e.origins.filter((o) => o.host === host && o.status === "pending").length, 0);

export async function gatherKnowledge(options = {}) {
  const ctx = makeCtx(options);
  const state = loadState(ctx);
  const found = options.managedNames instanceof Set ? { set: options.managedNames, error: null } : await managedSet(ctx);
  const managed = found.set;
  const residue = emptyResidue();
  if (found.error) {
    // Fail closed: without the managed set a managed note could be imported and later archived. No ssh, no import.
    const hosts = HOSTS.map((host) => ({ ...emptyRow(host), status: "skipped", reason: `managed set unresolved: ${found.error}`, pending: pendingFor(state, host) }));
    return withResidue({ hosts, imports: [] }, residue);
  }
  const local = listInbox(ctx.inboxDir);
  const localBySha = new Map();
  for (const l of local) { try { localBySha.set(sha256(fs.readFileSync(path.join(ctx.inboxDir, l.name))), l.name); } catch { /* vanished */ } }
  const hosts = []; const imports = [];
  for (const host of HOSTS) {
    const row = emptyRow(host);
    const endpoint = ctx.endpoints[host];
    if (endpoint === "pending") { hosts.push({ ...row, status: "skipped", reason: "awaiting owner-provided ssh alias", pending: pendingFor(state, host) }); continue; }
    if (endpoint === null || endpoint === undefined) { hosts.push({ ...row, status: "skipped", reason: "no ssh alias", pending: pendingFor(state, host) }); continue; }
    const got = await fetchHost(ctx, host, endpoint);
    if (got.status !== "gathered") { hosts.push({ ...row, status: got.status, reason: got.reason, pending: pendingFor(state, host) }); continue; }
    for (const n of got.parsed.oversize) residue.oversize.push({ host, name: n });
    for (const n of got.parsed.unsupported) residue.unsupportedName.push({ host, name: n });
    for (const note of got.parsed.notes) {
      if (managed.has(note.name)) { row.managed++; residue.managed.push({ host, name: note.name }); continue; }
      row.fetched++;
      const sha = sha256(note.bytes);
      const staged = stagedPath(ctx, host, sha);
      if (!fs.existsSync(staged)) writeFileAtomic(staged, note.bytes);
      // A later gathered version of the same host/name supersedes older pending versions.
      for (const e of Object.values(state.notes)) {
        for (const o of e.origins) {
          if (o.host === host && o.originalName === note.name && e.sha !== sha && o.status === "pending") {
            o.status = "superseded"; row.terminal++; residue.terminal.push({ host, name: note.name, reason: "superseded" });
          }
        }
      }
      const entry = state.notes[sha] ?? { sha, canonical: null, origins: [] };
      state.notes[sha] = entry;
      let origin = entry.origins.find((o) => o.host === host && o.originalName === note.name);
      if (origin && origin.status !== "pending") {
        if (origin.status === "archived") { row.resurrected++; residue.resurrected.push({ host, name: note.name }); }
        continue;
      }
      if (!origin) { origin = { host, originalName: note.name, sourceMtimeMs: note.mtimeMs, status: "pending" }; entry.origins.push(origin); }
      const localName = localBySha.get(sha);
      if (!entry.canonical && localName) entry.canonical = { kind: "local", name: localName };
      if (entry.canonical) { row.alreadyPresent++; continue; }
      const importedName = importedNameFor(host, sha, note.name);
      if (findArchived(ctx, importedName)) { entry.canonical = { kind: "import", host, name: importedName }; row.alreadyPresent++; continue; }
      const result = importNote(ctx, importedName, note.bytes, note.mtimeMs);
      if (result === "conflict") { origin.reason = "import name collides with different local bytes"; row.unresolved++; residue.unresolved.push({ host, name: note.name, reason: origin.reason }); continue; }
      entry.canonical = { kind: "import", host, name: importedName };
      if (result === "same") { row.alreadyPresent++; continue; }
      row.imported++;
      imports.push({ host, originalName: note.name, importedName, sha256: sha, stagedPath: staged, sourceMtimeMs: note.mtimeMs });
    }
    row.pending = pendingFor(state, host);
    hosts.push(row);
  }
  saveState(ctx, state);
  return withResidue({ hosts, imports }, residue);
}

// ---------- reconcile ----------

async function remoteArchive(ctx, endpoint, sha, month, name) {
  const r = await runProcess({
    cmd: ctx.ssh, args: [...SSH_OPTIONS, endpoint, "/bin/sh", "-c", `'${ARCHIVE_SCRIPT}'`], input: `${sha}\n${month}\n${name}\n`, env: sshEnv(), timeoutMs: ctx.hostTimeoutMs, timers: ctx.timers,
  });
  if (r.timedOut || r.error || r.code !== 0) return { token: null, reason: r.timedOut ? "timed out" : r.error ? String(r.error.code ?? r.error.message) : `ssh exit ${r.code}` };
  const [token = null, ...rest] = r.stdout.toString("utf8").trim().split(/\s+/);
  return { token: token || null, detail: rest.join(" "), reason: token ? null : "empty answer" };
}

const UNRESOLVED_REASONS = {
  CLAIM_KEPT: "remote claim kept for inspection", CLAIM_BUSY: "remote claim dir already exists",
  CHANGED_SOURCE: "origin changed since gather", SYMLINK: "origin is a symlink", DEST_MISMATCH: "conflicting archive destination",
  POSTCHECK_MISMATCH: "origin or archive changed during move", MOVE_FAILED: "move failed", BADNAME: "unsupported origin name", BADARG: "unsupported argument",
};

export async function reconcileKnowledge(options = {}, gathered = { hosts: [], imports: [] }) {
  const ctx = makeCtx(options);
  const state = loadState(ctx);
  const residue = gathered.residue ?? emptyResidue();
  const pub = await publicationState(options);
  const rows = gathered.hosts.map((r) => ({ ...r, archived: 0 }));
  for (const row of rows) {
    const endpoint = ctx.endpoints[row.host];
    const reachable = row.status === "gathered" && typeof endpoint === "string" && endpoint !== "pending";
    for (const entry of Object.values(state.notes)) {
      for (const o of entry.origins.filter((x) => x.host === row.host && x.status === "pending")) {
        const name = entry.canonical?.name;
        if (!name) continue;
        const month = findArchived(ctx, name);
        if (!month) continue; // not triaged locally yet: stays pending
        if (!pub.verified || !reachable) continue;
        if (!digestHasSlug(pub.digestText, noteSlug(name))) {
          o.reason = "digest entry missing"; row.unresolved++; residue.unresolved.push({ host: row.host, name: o.originalName, reason: o.reason });
          continue;
        }
        const res = await remoteArchive(ctx, endpoint, entry.sha, month, o.originalName);
        if (res.token === null) { row.status = "failed"; row.reason = `reconciliation pending: ${res.reason}`; break; }
        if (res.token === "MOVED" || res.token === "ALREADY") {
          o.status = "archived"; o.month = month; delete o.reason; row.archived++;
          try { fs.rmSync(stagedPath(ctx, row.host, entry.sha), { force: true }); } catch { /* retained copy is harmless */ }
        } else if (res.token === "ORIGIN_MISSING") {
          o.status = "origin missing"; row.terminal++; residue.terminal.push({ host: row.host, name: o.originalName, reason: "origin missing" });
        } else if (res.token === "RESURRECTED") {
          o.reason = "source reappeared beside a matching archive"; row.resurrected++; residue.resurrected.push({ host: row.host, name: o.originalName });
        } else {
          o.reason = `${UNRESOLVED_REASONS[res.token] ?? `unexpected remote answer ${res.token}`}${res.detail ? `: ${res.detail}` : ""}`; row.unresolved++; residue.unresolved.push({ host: row.host, name: o.originalName, reason: o.reason });
        }
      }
      if (row.status === "failed" && row.reason?.startsWith("reconciliation pending")) break;
    }
    row.pending = pendingFor(state, row.host);
  }
  saveState(ctx, state);
  return withResidue(rows, residue);
}
