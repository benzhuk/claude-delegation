#!/usr/bin/env node
/**
 * install-janitor-timer — J1 (janitor-daily-1), plus C2 (collect-status-1)
 *
 * C2 addition (docs/specs/collect-status-1/contracts.md K1/K3, pinned): a second job,
 * `--job collect-status` (default stays `janitor-record`, so every existing byte-stability test
 * and every already-installed janitor timer is untouched). The collect job schedules
 * `collect-status.mjs` on a 5-60 minute cadence (`--every`, default 15) instead of `--hour`, needs
 * `--to <slug>` (the note recipient), and owns its OWN `~/.agents/collect/installed.json` and
 * `~/.agents/collect/last-run.log` — never the janitor's `~/.agents/janitor/` files. Every generator
 * below defaults its new `job`/`every`/`to`/`out` parameters so a call site that never mentions them
 * (every existing test) produces byte-identical output to before this change.
 *
 * Lane 33 F1 (docs/specs/collect-followups-1/spec.md): the collect job also gains `--stale-hours <n>`
 * (0.1-48, default 2), baked into `scheduledCommandArgv` as the LAST argument of the collect job's
 * scheduled command and into `installed.json`'s `staleHours` field, so a reinstall never drops a
 * hand-tuned threshold again (lane 30 had to hand-edit the live unit; the next install would have
 * silently reverted it). The janitor job's own bytes are untouched by this addition.
 *
 * Cleanup has an owner: this installer creates ONE host-native daily scheduled entry (systemd
 * `--user` service+timer on Linux, a Task Scheduler task on Windows, a launchd agent on macOS) that
 * runs `node <installed plugin>/scripts/janitor.mjs --record --repo <repo> --apply` once a day.
 * Lane 59 (ruling r0, Ben's 9/29 tick "reclaim the safe class daily on every host"): the janitor
 * job's default argv now carries `--apply` — see scheduledCommandArgv's own comment for why, and for
 * the one off switch (janitor.mjs's `~/.agents/ws-off-janitor-act`, checked at run time; there is no
 * installer flag for this). The collect job is untouched: `--apply` never appears in its command,
 * checked by its own test file, same as before this lane.
 *
 * Pinned by docs/specs/janitor-daily-1/contracts.md (J1 rulings + the J1/J2 seam contract):
 *   - names: `janitor-record.service`/`.timer` (systemd --user), task `janitor-record` (Windows,
 *     `janitor-record-test` in tests), label `com.delegation.janitor-record` (launchd)
 *   - `~/.agents/janitor/installed.json`, byte-stable for the same inputs:
 *     {"schema":1,"repo":"<abs repo path>","node":"<abs node path>","hour":<int>,
 *      "scheduler":"systemd-user"|"schtasks"|"launchd","name":"janitor-record"}
 *   - the scheduled command is exactly `<node> <pluginRoot>/scripts/janitor.mjs --record --repo
 *     <repo>`, plus `--host <name>` — `<name>` is `--host` on the CLI if given, else the installing
 *     machine's own `os.hostname()` baked in at install time (J1 review round 1, m1: this keeps a
 *     scheduled record's host stable even across a later machine rename, which is the whole point
 *     of the flag; --record's own default, run without --host, is unaffected). Output goes to
 *     `~/.agents/janitor/last-run.log`, truncated every run.
 *   - never shells out to systemctl/schtasks/launchctl unless `--enable` is given (tests never pass
 *     it); `--remove` deletes only files carrying this file's own marker line, plus installed.json.
 *   - refuses to install from a non-durable (temp/worktree) checkout unless `--force-root`
 *     (tests only).
 *
 * `--repo <repo>` is written into every generated command for byte-stable-contract reasons, but
 * TODAY janitor.mjs's own CLI does not parse `--repo` at all (grep confirms; the brief's NOT list
 * forbids adding it — only `--host` was in scope). janitor.mjs resolves the repo it inspects from
 * its OWN `cwd`, so the actual repo-targeting for a real scheduled run comes from each generated
 * unit/task/plist's WorkingDirectory (systemd `WorkingDirectory=`, the Windows task's
 * `<WorkingDirectory>`, the launchd `WorkingDirectory` key) — `--repo <repo>` on the command line is
 * inert to janitor.mjs today (harmless: it parses only flags it recognizes, ignoring the rest) and
 * exists so a human reading the unit file, or a caller with a `--host`-shaped flag added later, sees
 * the intended repo without having to go find the WorkingDirectory line.
 *
 * CLI: --dry-run --json --remove --hour <n, default 6> --repo <path> --host <name> --enable
 *      --force-root (tests only) --name <name> (tests only, default janitor-record) --help/-h
 *
 * J1 live findings L1: --help/-h always prints usage and exits 0 without writing anything, and any
 * argv token that is neither a known flag nor the value of a value-taking flag is a usage error
 * (exit 2, nothing written) rather than being silently ignored — an unrecognized `--help` used to
 * fall straight through to a real install.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { isDurablePath } from "./mirror-shared-skills.mjs";
import { parseWriterHost } from "./knowledge-triage.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HOUR = 6;
const DEFAULT_NAME = "janitor-record";
const DEFAULT_JOB = "janitor-record";
const DEFAULT_COLLECT_NAME = "collect-status";
const DEFAULT_EVERY = 15;
// Lane 33 F1 (docs/specs/collect-followups-1/spec.md): the collect job's own attention threshold,
// baked into the scheduled command exactly once so a reinstall never drops it — lane 30 had to
// hand-edit the live unit to add `--stale-hours 2`, and the next install (with no flag for it here)
// would have silently overwritten that edit back to the collector's own bare default (6h).
const DEFAULT_STALE_HOURS = 2;
const SCHEMA = 1;
// Lane 40 (docs/specs/knowledge-triage-40/rev4.md): the third job, knowledge-triage. Windows Task
// Scheduler on the designated writer host only; its own state dir `~/.agents/knowledge-triage/`.
const DEFAULT_TRIAGE_NAME = "knowledge-triage";
const DEFAULT_TRIAGE_HOUR = 5;
const TRIAGE_MARKER = "generated by delegation knowledge-triage installer";
const TRIAGE_TASK_LIMIT = "PT2H";
const MARKER = "generated by delegation install-janitor-timer";
// C2 review round 1, M1: the collect job needs its OWN marker string, never a substring of MARKER,
// so `readMarked`'s `content.includes(marker)` ownership check can never mistake the janitor's units
// for the collect job's own (contracts.md K3: "--remove --job collect-status removes only files
// carrying the collect job's own marker line"; K1: "The janitor file keeps its bytes whatever the
// collect job does.") Before this, both jobs shared MARKER, so a `--name janitor-record --job
// collect-status` install or remove could overwrite/delete the janitor's real units.
const COLLECT_MARKER = "generated by delegation collect-status installer";
// Same slug pattern note-send validates `--to`/`--from` against (skills/multi/scripts/
// envelope.mjs:34, SLUG_RE) — contracts.md K3: "--job collect-status requires --to <slug>, with
// the slug validated by the same pattern note-send uses for slugs." Inlined rather than imported so
// this installer keeps zero runtime dependency on the multi skill's own module.
const SLUG_RE = /^[a-z0-9-]+$/;

function markerLine(commentStyle, job = DEFAULT_JOB) {
  // `#` (systemd unit files), `<!-- -->` (Task Scheduler XML), or an XML comment again for the
  // launchd plist (also XML) — one string, three encodings, so `--remove`'s foreign-file check
  // never has to guess which style a given file uses; it just does `content.includes(marker)`.
  // C2 review round 1, M1: each job gets its own marker string (COLLECT_MARKER vs MARKER) so
  // ownership by content, not just by name, tells the two jobs' files apart.
  // Lane 40: a three-entry marker table, so `--remove --job X` touches only X's own files.
  const m = { "janitor-record": MARKER, "collect-status": COLLECT_MARKER, "knowledge-triage": TRIAGE_MARKER }[job] ?? MARKER;
  if (commentStyle === "xml") return `<!-- ${m} -->`;
  return `# ${m}`;
}

/** Same temp-then-rename pattern as mirror-shared-skills.mjs's writeFileAtomic (scripts/mirror-
 * shared-skills.mjs:674-683) — a killed install must never leave a half-written unit/task/plist or
 * installed.json. `encoding` defaults to "utf8" (systemd units, launchd plists, installed.json);
 * the Windows task xml artifact passes "utf16le" so its leading BOM character encodes as the real
 * 0xFF 0xFE bytes Task Scheduler's XML import requires. */
function writeFileAtomic(file, text, encoding = "utf8") {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, encoding);
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* the throw below is what matters */ }
    throw err;
  }
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Repo path resolution (contracts.md J1 rulings, "Repo path"): `--repo` overrides everything; else
 * `~/.agents/janitor-repo` if that file exists (bare path string — the scout's open question on this
 * file's shape is answered here with the simplest reading, per the brief's autonomy note); else
 * `~/Code/zhuk-infra/claude-delegation` (lane 65 item 5: the repo moved under `zhuk-infra`), falling
 * back to the old `~/Code/claude-delegation` ONLY when the new path is absent (`exists` is injectable
 * so a test never depends on a real home). Always resolved to an absolute path, matching installed.json's pinned
 * `"repo":"<abs repo path>"`. */
export function resolveRepo({ home, repoFlag, readFile = fs.readFileSync, exists = fs.existsSync }) {
  if (repoFlag) return path.resolve(repoFlag);
  const overrideFile = path.join(home, ".agents", "janitor-repo");
  try {
    const raw = readFile(overrideFile, "utf8").trim();
    if (raw) return path.resolve(raw);
  } catch {
    // absent or unreadable: fall through to the default, exactly like a missing file would
  }
  const moved = path.resolve(path.join(home, "Code", "zhuk-infra", "claude-delegation"));
  let movedPresent = false;
  try {
    movedPresent = exists(moved);
  } catch {
    // an unreadable path counts as absent: the old default is the safe fallback
  }
  return movedPresent ? moved : path.resolve(path.join(home, "Code", "claude-delegation"));
}

/** The one scheduled command every platform runs, as an argv array (never a pre-quoted string —
 * quoting/escaping is each platform's own generator's job) - the one function every generator below
 * calls, so there is exactly one place that could ever add a flag to the scheduled command.
 *
 * Lane 59 (ruling r0, Ben's tick of 9/29 on the decisions page: "yes, reclaim the safe class daily
 * on every host"): the janitor job's own argv now carries `--apply` by default. Before this, the
 * daily run was report-only forever, and nothing on any host ever actually freed a merged worktree
 * or branch - the packet's own measure (236 secret-guard-plus-rm denials on 9/29, plus the Netcup
 * /tmp exhaustion that same day) is exactly the cost of that. There is no installer flag to opt back
 * out of `--apply` (redteam F15: a flag would just duplicate the kill switch, and would need a
 * reinstall on four hosts to flip - the switch file needs none); the only off path is janitor.mjs's
 * own `~/.agents/ws-off-janitor-act` (F14), checked at RUN time, not install time. The collect job
 * is untouched - it never carried `--apply` and still doesn't; the string still never appears
 * anywhere in ITS generated command. The B1 refusal below (a `--repo`/`--host`/`--to`/`--out` VALUE
 * that itself contains the literal text `--apply`) is unrelated to this and stays exactly as it was:
 * that guards against a user-supplied value smuggling the flag in through systemd's whitespace
 * splitting, not against the installer's own, now-intentional argv.
 */
export function scheduledCommandArgv({ node, pluginRoot, repo, host, job = DEFAULT_JOB, to, out, staleHours = DEFAULT_STALE_HOURS }) {
  if (job === "knowledge-triage") return [node, path.join(pluginRoot, "scripts", "knowledge-triage.mjs")];
  if (job === "collect-status") {
    // contracts.md K3: "<node> <pluginRoot>/scripts/collect-status.mjs --repo <repo> --to <slug>
    // plus --host <name> when given, plus --out <dir> when --out is given, plus --stale-hours <n>
    // (lane 33 F1) always last, so a reinstall can never silently drop it again."
    const argv = [node, path.join(pluginRoot, "scripts", "collect-status.mjs"), "--repo", repo, "--to", to];
    if (host) argv.push("--host", host);
    if (out) argv.push("--out", out);
    argv.push("--stale-hours", staleHours);
    return argv;
  }
  const argv = [node, path.join(pluginRoot, "scripts", "janitor.mjs"), "--record", "--repo", repo];
  if (host) argv.push("--host", host);
  argv.push("--apply");
  return argv;
}

/** The pinned installed.json shape (contracts.md seam): key order schema, repo, node, hour,
 * scheduler, name — matters for byte-stability, so this builds the object literal in that exact
 * order rather than relying on caller-supplied key order. C2: the collect job's OWN shape
 * (contracts.md K1) is schema, repo, node, every, staleHours, scheduler, name, to — no `hour`
 * field at all (lane 33 F1 adds `staleHours` in this exact slot, pinned by contracts.md K1). */
export function installedJsonText({ repo, node, hour, scheduler, name, job = DEFAULT_JOB, every, to, staleHours }) {
  if (job === "knowledge-triage") return `${JSON.stringify({ schema: SCHEMA, node, hour, scheduler, name, job })}\n`;
  if (job === "collect-status") {
    const obj = { schema: SCHEMA, repo, node, every, staleHours, scheduler, name, to };
    return `${JSON.stringify(obj)}\n`;
  }
  const obj = { schema: SCHEMA, repo, node, hour, scheduler, name };
  return `${JSON.stringify(obj)}\n`;
}

// ---------- Linux: systemd --user service + timer ----------

/** systemd ExecStart quoting: `%` is a specifier and `$` is env expansion, so double both; quote only
 * when the arg has whitespace/quotes/backslashes, so ordinary paths stay byte-identical (the existing
 * ExecStart assertion in the test file). Without this, systemd splits ExecStart on whitespace and a
 * space inside `repo`/`host` becomes a new argv element for janitor.mjs — see J1 review round 1 (B1). */
function systemdQuote(arg) {
  const s = String(arg).replace(/%/g, "%%").replace(/\$/g, "$$$$");
  return /[\s"'\\]/.test(s) ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s;
}

export function systemdServiceUnit({ node, pluginRoot, repo, host, logPath, job = DEFAULT_JOB, to, out, staleHours }) {
  const cmd = scheduledCommandArgv({ node, pluginRoot, repo, host, job, to, out, staleHours }).map(systemdQuote).join(" ");
  const nodeDir = path.dirname(node);
  const description = job === "collect-status"
    ? "Delegation collect-status (lane state to the lead, report-only)"
    : "Delegation janitor --record (report-only, no destructive action ever)";
  // StandardOutput/StandardError=truncate:<path> is systemd's own truncate-on-open mode (confirmed
  // against `man systemd.exec` on this host, the "truncate:path ... truncates the file when opening
  // it" paragraph) — chosen over append: so the spec's "truncate per run" holds without wrapping
  // ExecStart in a shell, which would break the pinned exact command text below.
  return (
    `${markerLine("hash", job)}\n` +
    "[Unit]\n" +
    `Description=${description}\n` +
    "\n" +
    "[Service]\n" +
    "Type=oneshot\n" +
    `WorkingDirectory=${repo}\n` +
    `Environment=PATH=${nodeDir}:/usr/bin:/bin\n` +
    `ExecStart=${cmd}\n` +
    `StandardOutput=truncate:${logPath}\n` +
    `StandardError=truncate:${logPath}\n`
  );
}

export function systemdTimerUnit({ hour, name, job = DEFAULT_JOB, every }) {
  if (job === "collect-status") {
    // contracts.md K3: "systemd: OnBootSec=2min plus OnUnitActiveSec=<every>min, Persistent=false."
    return (
      `${markerLine("hash", job)}\n` +
      "[Unit]\n" +
      `Description=Interval timer for ${name} (report-only)\n` +
      "\n" +
      "[Timer]\n" +
      "OnBootSec=2min\n" +
      `OnUnitActiveSec=${every}min\n` +
      "Persistent=false\n" +
      "\n" +
      "[Install]\n" +
      "WantedBy=timers.target\n"
    );
  }
  const hh = String(hour).padStart(2, "0");
  return (
    `${markerLine("hash")}\n` +
    "[Unit]\n" +
    `Description=Daily timer for ${name} (report-only)\n` +
    "\n" +
    "[Timer]\n" +
    `OnCalendar=*-*-* ${hh}:00:00\n` +
    // Persistent=true: a run missed because the host was off/asleep at the scheduled hour still
    // fires once the host is next up — "found daily," not "found on whichever days the box was on
    // at exactly 06:00."
    "Persistent=true\n" +
    "\n" +
    "[Install]\n" +
    "WantedBy=timers.target\n"
  );
}

// ---------- Windows: Task Scheduler XML ----------

/** Task Scheduler's Exec action has no native stdout/stderr redirection, so — same idea as the
 * launchd wrapper below — the actual argument line runs through `cmd.exe /c` with `>` (truncating,
 * not `>>`) redirection. The bytes of the un-wrapped scheduled command still appear verbatim inside
 * this string, which is what the test file's "--apply never appears / --repo appears" assertions
 * scan for. Live execution of `schtasks` was not attempted anywhere in this build — this host has no
 * such binary — so this is generated-text-only, not verified end to end. */
export function windowsTaskXml({ node, pluginRoot, repo, host, hour, logPath, job = DEFAULT_JOB, to, out, every, staleHours, startDate }) {
  const triage = job === "knowledge-triage";
  const inner = scheduledCommandArgv({ node, pluginRoot, repo, host, job, to, out, staleHours }).map((a) => `"${a}"`).join(" ");
  const wrapped = `${inner} > "${logPath}" 2>&1`;
  const description = triage
    ? "Delegation knowledge-triage (daily: gather all hosts, one Opus triage session)"
    : job === "collect-status"
    ? "Delegation collect-status (lane state to the lead, report-only)"
    : "Delegation janitor --record (report-only, no destructive action ever)";
  // contracts.md K3: "Windows: a TimeTrigger with Repetition/Interval PT<every>M in the same XML
  // shape already generated." The daily job keeps its original CalendarTrigger, byte for byte.
  // Lane 40: triage's daily CalendarTrigger starts on the first-run date.
  const triggers = triage
    ? "  <Triggers>\n" +
      "    <CalendarTrigger>\n" +
      `      <StartBoundary>${startDate}T${String(hour).padStart(2, "0")}:00:00</StartBoundary>\n` +
      "      <Enabled>true</Enabled>\n" +
      "      <ScheduleByDay>\n" +
      "        <DaysInterval>1</DaysInterval>\n" +
      "      </ScheduleByDay>\n" +
      "    </CalendarTrigger>\n" +
      "  </Triggers>\n"
    : job === "collect-status"
    ? "  <Triggers>\n" +
      "    <TimeTrigger>\n" +
      "      <StartBoundary>2026-01-01T00:00:00</StartBoundary>\n" +
      "      <Enabled>true</Enabled>\n" +
      "      <Repetition>\n" +
      `        <Interval>PT${every}M</Interval>\n` +
      "        <StopAtDurationEnd>false</StopAtDurationEnd>\n" +
      "      </Repetition>\n" +
      "    </TimeTrigger>\n" +
      "  </Triggers>\n"
    : "  <Triggers>\n" +
      "    <CalendarTrigger>\n" +
      `      <StartBoundary>2026-01-01T${String(hour).padStart(2, "0")}:00:00</StartBoundary>\n` +
      "      <Enabled>true</Enabled>\n" +
      "      <ScheduleByDay>\n" +
      "        <DaysInterval>1</DaysInterval>\n" +
      "      </ScheduleByDay>\n" +
      "    </CalendarTrigger>\n" +
      "  </Triggers>\n";
  return (
    // Windows-task-1 (2026-09-27 defect): Task Scheduler's XML import requires UTF-16 — a live
    // `schtasks /Create /XML` refused the old UTF-8 file with "unable to switch the encoding". This
    // string leads with the UTF-16LE BOM character (U+FEFF); writeFileAtomic below encodes this
    // whole string as "utf16le" bytes for the Windows task xml artifact only, so the BOM lands as the
    // real 0xFF 0xFE bytes Task Scheduler expects and the declaration matches the bytes on disk.
    // readMarked (below) decodes a `.xml` file back as UTF-16 whenever its first two bytes are that
    // BOM, before the marker `.includes()` check, so ownership/foreign-file detection and the file
    // layout are unaffected by the encoding switch (J1 review round 1, M3 is superseded by this).
    '﻿<?xml version="1.0" encoding="UTF-16"?>\n' +
    `${markerLine("xml", job)}\n` +
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">\n' +
    "  <RegistrationInfo>\n" +
    `    <Description>${description}</Description>\n` +
    "  </RegistrationInfo>\n" +
    triggers +
    // Lane 40: the interactive token, so the Claude CLI's plan login is available; a logged-off
    // desktop skips the run rather than failing it.
    (triage
      ? '  <Principals>\n    <Principal id="Author">\n      <LogonType>InteractiveToken</LogonType>\n      <RunLevel>LeastPrivilege</RunLevel>\n    </Principal>\n  </Principals>\n'
      : "") +
    '  <Actions Context="Author">\n' +
    "    <Exec>\n" +
    "      <Command>%ComSpec%</Command>\n" +
    // `/s` makes cmd.exe strip exactly the outer quote pair we add here — without it, cmd's
    // documented `/c` rule strips only the FIRST and LAST quote char on the whole line whenever
    // there are more than two, mangling a multi-quoted argv into a broken program token and an
    // unterminated redirect (J1 review round 1, M2).
    `      <Arguments>/s /c "${escapeXml(wrapped)}"</Arguments>\n` +
    `      <WorkingDirectory>${escapeXml(repo)}</WorkingDirectory>\n` +
    "    </Exec>\n" +
    "  </Actions>\n" +
    "  <Settings>\n" +
    "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\n" +
    "    <StartWhenAvailable>true</StartWhenAvailable>\n" +
    // Lane 40: triage registers DISABLED (enabled later by an explicit schtasks Change) with its own
    // limit, longer than the job's 60-minute nested watchdog plus bounded gather/reconcile.
    (triage
      ? `    <ExecutionTimeLimit>${TRIAGE_TASK_LIMIT}</ExecutionTimeLimit>\n    <Enabled>false</Enabled>\n`
      : "    <Enabled>true</Enabled>\n") +
    "  </Settings>\n" +
    "</Task>\n"
  );
}

// ---------- macOS: launchd agent ----------

/** launchd's StandardOutPath/StandardErrorPath open in append mode, not truncate-on-open (no
 * launchd-native equivalent of systemd's `truncate:` was found), so — to keep "truncate per run"
 * true here too — ProgramArguments wraps the same argv in `/bin/sh -c '... > log 2>&1'` (`>`
 * truncates). WorkingDirectory is launchd's own native key, no wrapper needed for that part. Never
 * executed on this Linux host — text-generation only, same caveat as the Windows XML above. */
export function launchdPlist({ node, pluginRoot, repo, host, hour, logPath, label, job = DEFAULT_JOB, to, out, every, staleHours }) {
  const inner = scheduledCommandArgv({ node, pluginRoot, repo, host, job, to, out, staleHours })
    .map((a) => String(a).replace(/'/g, "'\\''"))
    .map((a) => `'${a}'`)
    .join(" ");
  const shCmd = `${inner} > '${logPath.replace(/'/g, "'\\''")}' 2>&1`;
  // contracts.md K3: "launchd: StartInterval seconds" replaces the daily job's StartCalendarInterval
  // dict entirely for the collect job.
  const scheduleXml = job === "collect-status"
    ? "  <key>StartInterval</key>\n" +
      `  <integer>${every * 60}</integer>\n`
    : "  <key>StartCalendarInterval</key>\n" +
      "  <dict>\n" +
      "    <key>Hour</key>\n" +
      `    <integer>${hour}</integer>\n` +
      "    <key>Minute</key>\n" +
      "    <integer>0</integer>\n" +
      "  </dict>\n";
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    `${markerLine("xml", job)}\n` +
    '<plist version="1.0">\n' +
    "<dict>\n" +
    "  <key>Label</key>\n" +
    `  <string>${escapeXml(label)}</string>\n` +
    "  <key>ProgramArguments</key>\n" +
    "  <array>\n" +
    "    <string>/bin/sh</string>\n" +
    "    <string>-c</string>\n" +
    `    <string>${escapeXml(shCmd)}</string>\n` +
    "  </array>\n" +
    "  <key>WorkingDirectory</key>\n" +
    `  <string>${escapeXml(repo)}</string>\n` +
    scheduleXml +
    "  <key>RunAtLoad</key>\n" +
    "  <false/>\n" +
    "</dict>\n" +
    "</plist>\n"
  );
}

// ---------- file planning (shared by install and --remove) ----------

/** Read a file if it exists, reporting whether its content carries the marker line — the ONE check
 * `--remove` (and, symmetrically, an overwrite during install) uses to decide whether a same-named
 * file is ours: contracts.md's "`--remove` removes only files whose content carries the installer's
 * own marker line... A same-named file without the marker is left untouched and reported." Applying
 * the same rule to install-time overwrite (not just remove) protects the exact asset the reviewer's
 * attack brief names — "`--remove` deleting a user's unrelated `janitor*` unit" — one check away from
 * also never overwriting a user's unrelated one. */
function readMarked(file, marker) {
  let content = null;
  try {
    // Windows-task-1: the Windows task xml is now written UTF-16LE with a BOM (Task Scheduler's
    // XML import requires it). Read raw bytes first so a `.xml` file starting with that exact BOM
    // (0xFF 0xFE) is decoded as UTF-16 before the marker check runs; every other file (systemd units,
    // the launchd plist, installed.json, and any plain-UTF-8 `.xml` a user wrote by hand) decodes as
    // utf8 exactly as before — ownership, the foreign-file check, and the file layout are unchanged.
    const buf = fs.readFileSync(file);
    const isUtf16Xml = file.endsWith(".xml") && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe;
    content = isUtf16Xml ? buf.toString("utf16le") : buf.toString("utf8");
  } catch {
    return { exists: false, marked: false, content: null };
  }
  return { exists: true, marked: marker === null || content.includes(marker), content };
}

function planWrite(file, desired, marker, dryRun, encoding = "utf8") {
  const cur = readMarked(file, marker);
  // `content` is always the generated text, dry-run included — this is what a `--dry-run --json`
  // preview quotes (spec acceptance: "quote the generated unit or task") without ever writing it.
  if (cur.exists && !cur.marked) {
    return { path: file, status: "left-untouched-foreign", changed: false, content: desired };
  }
  if (cur.exists && cur.content === desired) {
    return { path: file, status: "unchanged", changed: false, content: desired };
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(file, desired, encoding);
  }
  // J1 review round 1, m4: a dry-run must never claim past tense ("created"/"updated") for a file it
  // did not touch — "would-create"/"would-update" says plainly that this is a preview.
  const verb = cur.exists ? "update" : "create";
  return { path: file, status: dryRun ? `would-${verb}` : `${verb}d`, changed: true, content: desired };
}

function planRemove(file, marker, dryRun) {
  const cur = readMarked(file, marker);
  if (!cur.exists) return { path: file, status: "absent", changed: false };
  if (!cur.marked) return { path: file, status: "left-untouched-foreign", changed: false };
  // Single named file, never a directory, never recursive — the one delete this feature exists to
  // do, and the only one it is allowed to do.
  if (!dryRun) fs.rmSync(file, { force: true });
  // J1 review round 1, m4: a dry-run must never claim "removed" for a file it left in place.
  return { path: file, status: dryRun ? "would-remove" : "removed", changed: !dryRun };
}

// ---------- main ----------

/** J1 live findings L2: the two known installed-plugin roots on this project. Claude Code's plugin
 * cache is `<home>/.claude/plugins/cache/<publisher>/<name>/<version>/` (README.md:117). Codex's own
 * plugin cache, reached only via the native `codex plugin add` route (docs/native-use.md:65-67), is
 * `<CODEX_HOME>/plugins/cache/delegation/delegation/<version>/`; only the default `<home>/.codex`
 * is allowlisted here (Codex's homes: scripts/codex-hook-trust.mjs:585-591 — a non-default
 * CODEX_HOME / CLAUDE_CONFIG_DIR install is refused, fail-safe); confirmed live (docs/work/evidence/
 * native-package-review.md:10: "installedPath under disposable .codex/plugins/cache/delegation/
 * delegation/0.17.1"). Install is allowed only when pluginRoot resolves inside one of these two —
 * an allowlist, replacing the denylist (isDurablePath's temp/worktree regex) that missed a real
 * worktree name (this host's `.../claude-delegation-wt/<branch>`).
 */
export function isInstalledPluginRoot(target, { home = os.homedir() } = {}) {
  // Realpath both sides: a symlink planted inside the cache must not carry a worktree through, and
  // a symlinked ~/.claude must not refuse a genuine install. Case-fold only on case-insensitive hosts.
  const real = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };
  const foldCase = process.platform === "win32" || process.platform === "darwin";
  const norm = (p) => {
    const s = real(path.resolve(String(p))).split("\\").join("/");
    return foldCase ? s.toLowerCase() : s;
  };
  const t = norm(target);
  return [
    norm(path.join(home, ".claude", "plugins", "cache")),
    norm(path.join(home, ".codex", "plugins", "cache")),
  ].some((root) => t.startsWith(`${root}/`));
}

const KNOWN_BOOLEAN_FLAGS = new Set(["--dry-run", "--json", "--remove", "--enable", "--force-root"]);
const KNOWN_VALUE_FLAGS = new Set(["--hour", "--repo", "--host", "--name", "--job", "--every", "--to", "--out", "--stale-hours", "--first-run"]);

function usageText() {
  return [
    "Usage: install-janitor-timer.mjs [options]",
    "  --dry-run, --json, --remove, --enable, --force-root (tests only)",
    "  --job <janitor-record|collect-status|knowledge-triage>  which job to (un)install (default janitor-record)",
    "  --hour <n>    hour of day to run, 0-23 (default 6; knowledge-triage default 5; not for collect-status)",
    "  --every <n>   minutes between runs, 5-60 (default 15; collect-status only)",
    "  --stale-hours <n>  collect-status's own attention threshold, 0.1-48 (default 2; collect-status only)",
    "  --to <slug>   note recipient slug (required for --job collect-status)",
    "  --out <dir>   collect-status output dir override, passed through as-is",
    "  --repo <path> repo to watch (default ~/.agents/janitor-repo, else ~/Code/zhuk-infra/claude-delegation, or ~/Code/claude-delegation when that is absent)",
    "  --host <name> host name baked into the scheduled command (default: this machine's hostname)",
    "  --name <name> scheduled entry name (tests only; default janitor-record, or collect-status)",
    "  --help, -h    show this help and exit",
    "",
  ].join("\n");
}

/** J1 live findings L1: an argv token that is not a known flag, and not the VALUE belonging to a
 * value-taking flag right before it, is unrecognized. */
function unknownArgs(argv) {
  const unknown = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (KNOWN_BOOLEAN_FLAGS.has(tok)) continue;
    if (KNOWN_VALUE_FLAGS.has(tok)) {
      if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) i++;
      continue;
    }
    unknown.push(tok);
  }
  return unknown;
}

/** The local calendar date of `date`, YYYY-MM-DD (the triage task's first-run date). */
function localDate(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function parseArgFlag(argv, flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1) return null;
  const next = argv[idx + 1];
  return next && !next.startsWith("--") ? next : null;
}

export function main(argv = process.argv.slice(2), opts = {}) {
  const {
    home = os.homedir(),
    platform = process.platform,
    execPath = process.execPath,
    pluginRoot = path.resolve(HERE, ".."),
    env = process.env,
    exec = execFileSync,
    stdout = (s) => process.stdout.write(s),
    hostname = () => os.hostname(),
    now = () => new Date(),
  } = opts;

  // J1 live findings L1: --help/-h wins over everything, writes nothing. Any other unrecognized
  // token (typo'd flag or a stray positional) is a usage error — exit 2, nothing written — rather
  // than being silently ignored and falling through to a real install.
  if (argv.includes("--help") || argv.includes("-h")) {
    stdout(usageText());
    return 0;
  }
  const unknown = unknownArgs(argv);
  if (unknown.length > 0) {
    stdout(`usage error: unrecognized argument(s): ${unknown.join(" ")}\n${usageText()}`);
    return 2;
  }

  const dryRun = argv.includes("--dry-run");
  const jsonFlag = argv.includes("--json");
  const removeFlag = argv.includes("--remove");
  const enableFlag = argv.includes("--enable");
  const forceRoot = argv.includes("--force-root");

  const refusals = [];

  // C2: --job selects janitor-record (default, unchanged) or collect-status. Parsed before --hour/
  // --every so the cross refusals below ("--hour with the collect job is refused, --every with the
  // janitor job is refused") can name the job.
  const jobFlag = parseArgFlag(argv, "--job");
  const job = argv.includes("--job") && jobFlag !== null ? jobFlag : DEFAULT_JOB;
  if (job !== "janitor-record" && job !== "collect-status" && job !== "knowledge-triage") {
    refusals.push(`--job must be janitor-record or collect-status (or knowledge-triage), got ${job}`);
  }
  const triage = job === "knowledge-triage";

  // Lane 40 (rev3 retained): knowledge-triage installs only on the designated writer host, read from
  // the triage skill's own writer paragraph, never a second source. A nonwriter is exit 2, nothing
  // written; a skill with no writer paragraph is refused too. Removing is allowed anywhere.
  if (triage && !removeFlag) {
    let writer = null;
    try { writer = parseWriterHost(fs.readFileSync(path.join(home, ".claude", "skills", "triage", "SKILL.md"), "utf8")); } catch { /* absent skill: no writer */ }
    if (!writer) {
      stdout("refused: writer host not found in triage skill\n");
      return 2;
    }
    if (hostname().toLowerCase() !== writer.toLowerCase()) {
      stdout(`knowledge-triage installs only on the writer host ${writer}\n`);
      return 2;
    }
  }

  let hour = triage ? DEFAULT_TRIAGE_HOUR : DEFAULT_HOUR;
  const hourArg = parseArgFlag(argv, "--hour");
  // J1 review round 1, m2: a typo'd --hour used to install a silent 06:00 fallback and report
  // success. Refuse instead, before any write, so a bad value is never quietly swallowed.
  // J1 review round 2, m2: parseArgFlag also returns null for a VALUELESS --hour (flag present, no
  // following value, or followed by another --flag), which used to be indistinguishable from "flag
  // absent" and silently fell back to DEFAULT_HOUR. Check argv.includes separately so a bare
  // `--hour` is refused, and restrict the value to a plain 1-2 digit decimal string so `Number()`
  // quirks like `"0x10"` (16) or `" "` (0) can never smuggle in a real hour.
  if (argv.includes("--hour")) {
    const n = hourArg !== null && /^\d{1,2}$/.test(hourArg) ? Number(hourArg) : NaN;
    if (Number.isInteger(n) && n >= 0 && n <= 23) hour = n;
    else refusals.push(`--hour must be an integer 0-23, got ${hourArg === null ? "(no value)" : hourArg}`);
  }

  // C2 (contracts.md K3): --every is --hour's twin for the collect job — 5 to 60 minutes, default
  // 15, same refuse-before-any-value-quirk-smuggles-in discipline as --hour above.
  let every = DEFAULT_EVERY;
  const everyArg = parseArgFlag(argv, "--every");
  if (argv.includes("--every")) {
    const n = everyArg !== null && /^\d{1,2}$/.test(everyArg) ? Number(everyArg) : NaN;
    if (Number.isInteger(n) && n >= 5 && n <= 60) every = n;
    else refusals.push(`--every must be an integer 5-60, got ${everyArg === null ? "(no value)" : everyArg}`);
  }

  // C2 (contracts.md K3, spec's "--hour/--every cross refusals"): each job owns exactly one of the
  // two schedule flags; the other is refused rather than silently ignored.
  if (job === "collect-status" && argv.includes("--hour")) {
    refusals.push("--hour is refused for --job collect-status; use --every instead");
  }
  if (job === "janitor-record" && argv.includes("--every")) {
    refusals.push("--every is refused for --job janitor-record; use --hour instead");
  }
  if (job === "janitor-record" && argv.includes("--stale-hours")) {
    refusals.push("--stale-hours is refused for --job janitor-record; it only applies to --job collect-status");
  }
  if (triage) {
    for (const flag of ["--every", "--stale-hours", "--to", "--out"]) {
      if (argv.includes(flag)) refusals.push(`${flag} is refused for --job knowledge-triage`);
    }
    if (!removeFlag && platform !== "win32") refusals.push("knowledge-triage installs only as a Windows Task Scheduler task on the writer host");
  } else if (argv.includes("--first-run")) {
    refusals.push("--first-run only applies to --job knowledge-triage");
  }
  // Optional first-run date (F8), default today: a real calendar date, YYYY-MM-DD.
  let firstRun = null;
  if (triage && argv.includes("--first-run")) {
    const v = parseArgFlag(argv, "--first-run");
    const d = v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;
    if (d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v) firstRun = v;
    else refusals.push(`--first-run must be a calendar date YYYY-MM-DD, got ${v === null ? "(no value)" : v}`);
  }

  // Lane 33 F1 (docs/specs/collect-followups-1/spec.md): --stale-hours is baked into the collect
  // job's own scheduled command (scheduledCommandArgv, last argument) so a reinstall never drops it
  // again — same refuse-before-any-value-quirk-smuggles-in discipline as --hour/--every above, but
  // fractional (0.1-48) rather than integer, since a sub-hour threshold is a legitimate value.
  let staleHours = DEFAULT_STALE_HOURS;
  const staleHoursArg = parseArgFlag(argv, "--stale-hours");
  if (argv.includes("--stale-hours")) {
    // Restricted to a plain 1-2 digit decimal with an optional fractional part, same discipline as
    // --hour/--every above, so `Number()` quirks like `"0x10"` (16, a real number in-range) can never
    // smuggle in a value that never looked like one on the command line.
    const n = staleHoursArg !== null && /^\d{1,2}(\.\d+)?$/.test(staleHoursArg) ? Number(staleHoursArg) : NaN;
    if (Number.isFinite(n) && n >= 0.1 && n <= 48) staleHours = n;
    else refusals.push(`--stale-hours must be a number from 0.1 to 48, got ${staleHoursArg === null ? "(no value)" : staleHoursArg}`);
  }

  // J1 live-fix review F1: a value flag given with no value (or an empty one) must never fall back to
  // its default — `--remove --name` with the value forgotten used to remove the REAL janitor-record.
  // A repeated value flag is ambiguous (parseArgFlag silently takes the first), so it is refused too.
  for (const flag of ["--repo", "--host", "--name", "--job", "--every", "--to", "--out", "--stale-hours", "--first-run"]) {
    if (argv.includes(flag) && parseArgFlag(argv, flag) === null) refusals.push(`${flag} needs a value`);
  }
  for (const flag of KNOWN_VALUE_FLAGS) {
    if (argv.filter((a) => a === flag).length > 1) refusals.push(`${flag} given more than once`);
  }

  const repoFlag = parseArgFlag(argv, "--repo");
  const hostFlag = parseArgFlag(argv, "--host");
  const name = parseArgFlag(argv, "--name") || (triage ? DEFAULT_TRIAGE_NAME : job === "collect-status" ? DEFAULT_COLLECT_NAME : DEFAULT_NAME);

  // C2 (contracts.md K3): --to <slug> is required for the collect job and refused for janitor-record
  // (spec's "--to <slug> is required for this job and refused for janitor-record"). Validated with
  // the same slug pattern note-send uses (SLUG_RE, above).
  const toGiven = argv.includes("--to");
  const toFlag = parseArgFlag(argv, "--to");
  // Required only for an actual install — `--remove --job collect-status` (below) identifies which
  // files to delete from the job/name alone, exactly like `--remove --name x` needs no `--repo`/
  // `--host` either; the fix here mirrors that existing removeFlag guard.
  if (job === "collect-status" && !toGiven && !removeFlag) {
    refusals.push("--to <slug> is required for --job collect-status");
  }
  if (job === "janitor-record" && toGiven) {
    refusals.push("--to is refused for --job janitor-record");
  }
  if (toGiven && toFlag !== null && !SLUG_RE.test(toFlag)) {
    refusals.push(`--to must match [a-z0-9-]+, got ${toFlag}`);
  }

  // --out is a plain pass-through into the collect job's own argv (contracts.md K3); it has no
  // effect on the janitor job's command, so — same reasoning as --to above — it is refused there
  // rather than silently accepted and ignored (builder's own call, brief's autonomy note).
  // C2 review round 1, m2: an un-resolved, unvalidated --out let a relative value land inside the
  // repo's own WorkingDirectory at run time (the collector would then write status.json/status.md/
  // previous.json under the repo tree, breaking C1's "no writes under the repo"), and a control
  // character (in particular a literal newline) survived `systemdQuote` far enough to add a second
  // directive line to the generated systemd unit. Resolved to an absolute path up front, same as
  // `--repo`, and refused outright if it carries any control character (0x00-0x1f, 0x7f) — before
  // any write, same discipline as every other refusal here.
  const outGiven = argv.includes("--out");
  const outRaw = parseArgFlag(argv, "--out");
  if (outRaw !== null && /[\u0000-\u001f\u007f]/.test(outRaw)) {
    refusals.push(`--out must not contain control characters, got ${JSON.stringify(outRaw)}`);
  }
  const outFlag = outRaw === null ? null : path.resolve(outRaw);
  if (job === "janitor-record" && outGiven) {
    refusals.push("--out is refused for --job janitor-record");
  }

  const repo = resolveRepo({ home, repoFlag });
  const node = path.resolve(execPath);
  // J1 review round 1, m1: bake in a host name at INSTALL time rather than leaving every scheduled
  // run to call os.hostname() itself — that keeps the record's host stable even across a later
  // machine rename, which is the whole rationale --host was added for. `--host <name>` overrides it.
  const host = hostFlag || os.hostname();

  // C2: each job schedules its own script — janitor.mjs, unchanged, or collect-status.mjs. Renamed
  // from `janitorScriptPath` to `jobScriptPath` (job-agnostic) so the M5 existence check below and
  // the durability check here both point at the RIGHT script for whichever job was asked for.
  const jobScriptName = triage ? "knowledge-triage.mjs" : job === "collect-status" ? "collect-status.mjs" : "janitor.mjs";
  const jobScriptPath = path.join(pluginRoot, "scripts", jobScriptName);
  // J1 live findings L2: checked before anything else that would CREATE a live entry, including
  // under --dry-run — a preview from a non-installed root is refused exactly like a real install
  // would be. --remove only deletes files this installer already made and never writes a new
  // reference to `pluginRoot`, so it is not gated by this check — a stale worktree's own --remove is
  // exactly how a builder or the janitor itself would clean up an install made from a checkout that
  // is now gone. isDurablePath is kept as an additional refusal (with its own, more specific
  // message) for anything the allowlist rejects that also looks like a temp/worktree checkout.
  if (!removeFlag && !forceRoot && !isInstalledPluginRoot(pluginRoot, { home })) {
    const jobLabel = triage ? "knowledge-triage task" : job === "collect-status" ? "collect-status timer" : "janitor timer";
    if (!isDurablePath(jobScriptPath, { home })) {
      refusals.push(
        `refusing to install a live ${jobLabel} from a temporary checkout (${pluginRoot}) — ` +
          "run the installer from the installed plugin, or pass --force-root (tests only)",
      );
    } else {
      refusals.push(
        `refusing to install a live ${jobLabel} from a root that is not an installed plugin ` +
          `location (${pluginRoot}) — install via the Claude plugin cache or the Codex plugin cache, ` +
          "or pass --force-root (tests only)",
      );
    }
  }

  // J1 review round 1, B1: systemd ExecStart splits on whitespace, so a `--repo`/`--host`/
  // `~/.agents/janitor-repo` value that itself contains the literal string `--apply` could turn a
  // scheduled report-only run into a destructive one once flattened into argv. Refuse outright
  // rather than rely solely on quoting, so the contract ("the string `--apply` never appears
  // anywhere") holds as text too, not just as argv structure. C2: the collect job's own `--to`/
  // `--out` args reach the same generated command, so they are checked here too (contracts.md K3:
  // "the --apply refusal stays and now also covers the collect job's args").
  if ([repo, host, toFlag, outFlag].some((v) => v != null && String(v).includes("--apply"))) {
    // C2 review round 1, m3: the default job's own values (`--repo`/`--host`) can never carry
    // `--to`/`--out` — those flags are refused outright for `--job janitor-record` above — so its
    // refusal text stays exactly what it said before this change, and only the collect job's
    // wording grows to name its own extra args.
    refusals.push(
      job === "collect-status"
        ? "refusing: --repo/--host/--to/--out/~/.agents/janitor-repo contains the string --apply, which a scheduled command must never carry"
        : "refusing: --repo/--host/~/.agents/janitor-repo contains the string --apply, which a scheduled janitor command must never carry",
    );
  }

  // J1 review round 1, M5: mirrors the Codex installer's own refusal on a missing hook script
  // (mirror-shared-skills.mjs's installCodexHookScript) — a timer that can never actually run
  // (missing script, or a repo that is not a git checkout) must never be reported `created`/exit 0.
  // Checked under --dry-run too, per the brief; --remove never needs either to exist.
  if (!removeFlag) {
    if (!fs.existsSync(jobScriptPath)) {
      // Kept byte-identical for the default job ("missing janitor script"); the collect job gets
      // its own wording since no existing test depends on it.
      refusals.push(triage ? `missing knowledge-triage script ${jobScriptPath}` : job === "collect-status" ? `missing collect-status script ${jobScriptPath}` : `missing janitor script ${jobScriptPath}`);
    }
    // The triage job watches no repo, so the git-checkout requirement is the other jobs' alone.
    if (!triage && !fs.existsSync(path.join(repo, ".git"))) {
      refusals.push(`repo ${repo} is not a git checkout (set ~/.agents/janitor-repo or --repo)`);
    }
  }

  // C2 review round 2, N1: Task Scheduler has ONE task-name namespace, but each job keeps its task
  // XML in its own directory (~/.agents/janitor/<name>.task.xml vs ~/.agents/collect/<name>.task.xml),
  // so the marker check above (which only ever reads the CURRENT job's own artifact path) can never
  // see the other job's same-named task. Refuse any --name the other job already holds, before any
  // write or exec, on both the install and the --remove path (a --remove --enable --job collect-status
  // --name janitor-record used to delete the janitor's live task by name; an install used to overwrite
  // it, replacing the running janitor task with the collector's).
  if (platform === "win32") {
    // Lane 40: the same one-namespace rule, now across all three jobs' task-xml directories. The two
    // existing jobs' pair keeps its original check and wording; the triage job is checked both ways.
    const otherDirs = triage
      ? [["janitor", "janitor-record"], ["collect", "collect-status"]]
      : [[job === "collect-status" ? "janitor" : "collect", job === "collect-status" ? "janitor-record" : "collect-status"], ["knowledge-triage", "knowledge-triage"]];
    for (const [otherDir, otherJobLabel] of otherDirs) {
      const otherTaskXml = path.join(home, ".agents", otherDir, `${name}.task.xml`);
      if (fs.existsSync(otherTaskXml)) {
        refusals.push(
          `refusing: --name ${name} is already the ${otherJobLabel} job's scheduled task (${otherTaskXml}); pick another --name`,
        );
      }
    }
  }

  const result = { action: removeFlag ? "remove" : dryRun ? "dry-run" : "install", refusals, files: [] };

  if (refusals.length > 0) {
    if (jsonFlag) stdout(`${JSON.stringify(result, null, 2)}\n`);
    else for (const r of refusals) stdout(`refused: ${r}\n`);
    return 1;
  }

  // C2 (contracts.md K1): the collect job owns its OWN `~/.agents/collect/` directory — its own
  // installed.json and last-run.log — never the janitor's `~/.agents/janitor/` files.
  const agentsDir = triage ? path.join(home, ".agents", "knowledge-triage") : job === "collect-status" ? path.join(home, ".agents", "collect") : path.join(home, ".agents", "janitor");
  const logPath = path.join(agentsDir, "last-run.log");
  const installedJsonPath = path.join(agentsDir, "installed.json");

  const scheduler = platform === "win32" ? "schtasks" : platform === "darwin" ? "launchd" : "systemd-user";
  result.scheduler = scheduler;
  result.name = name;
  result.repo = repo;
  result.node = node;
  // C2 review round 1, m3: `result.job` used to be set unconditionally, so a default-job `--json`
  // run gained a `"job": "janitor-record"` key it never had before this change. Scoped to the
  // collect job only, so the default job's JSON output is byte-identical to before.
  if (triage) {
    result.job = job;
    result.hour = hour;
  } else if (job === "collect-status") {
    result.job = job;
    result.every = every;
    result.to = toFlag;
    result.staleHours = staleHours;
  } else {
    result.hour = hour;
  }
  result.logPath = logPath;
  result.installedJsonPath = installedJsonPath;

  // ---- per-platform artifact path(s) ----
  let artifacts; // [{ file, marker, desired }]
  let enableCmds = []; // [{ cmd, args }]
  let disableCmds = [];

  if (scheduler === "systemd-user") {
    const configHome = env.XDG_CONFIG_HOME || path.join(home, ".config");
    const unitDir = path.join(configHome, "systemd", "user");
    const serviceFile = path.join(unitDir, `${name}.service`);
    const timerFile = path.join(unitDir, `${name}.timer`);
    artifacts = [
      { file: serviceFile, marker: markerLine("hash", job), desired: systemdServiceUnit({ node, pluginRoot, repo, host, logPath, job, to: toFlag, out: outFlag, staleHours }) },
      { file: timerFile, marker: markerLine("hash", job), desired: systemdTimerUnit({ hour, name, job, every }) },
    ];
    enableCmds = [
      { cmd: "systemctl", args: ["--user", "daemon-reload"] },
      { cmd: "systemctl", args: ["--user", "enable", "--now", `${name}.timer`] },
    ];
    disableCmds = [{ cmd: "systemctl", args: ["--user", "disable", "--now", `${name}.timer`] }];
  } else if (scheduler === "schtasks") {
    const taskXmlFile = path.join(agentsDir, `${name}.task.xml`);
    artifacts = [
      // Windows-task-1: written UTF-16LE (encoding: "utf16le" below) so the BOM character this
      // string leads with lands as the real bytes Task Scheduler's XML import requires.
      { file: taskXmlFile, marker: markerLine("xml", job), desired: windowsTaskXml({ node, pluginRoot, repo, host, hour, logPath, job, to: toFlag, out: outFlag, every, staleHours, startDate: triage ? (firstRun ?? localDate(now())) : undefined }), encoding: "utf16le" },
    ];
    enableCmds = [{ cmd: "schtasks", args: ["/Create", "/TN", name, "/XML", taskXmlFile, "/F"] }];
    if (triage) {
      // Lane 40 order (spec-r1-adjudication F8): register disabled (the XML says Enabled=false),
      // query it, enable with Change, then trigger the first run immediately with Run.
      enableCmds.push(
        { cmd: "schtasks", args: ["/Query", "/TN", name] },
        { cmd: "schtasks", args: ["/Change", "/TN", name, "/ENABLE"] },
        { cmd: "schtasks", args: ["/Run", "/TN", name] },
      );
    }
    disableCmds = [{ cmd: "schtasks", args: ["/Delete", "/TN", name, "/F"] }];
  } else {
    const label = `com.delegation.${name}`;
    const plistFile = path.join(home, "Library", "LaunchAgents", `${label}.plist`);
    artifacts = [
      { file: plistFile, marker: markerLine("xml", job), desired: launchdPlist({ node, pluginRoot, repo, host, hour, logPath, label, job, to: toFlag, out: outFlag, every, staleHours }) },
    ];
    enableCmds = [{ cmd: "launchctl", args: ["load", "-w", plistFile] }];
    disableCmds = [{ cmd: "launchctl", args: ["unload", plistFile] }];
  }

  result.commands = [];

  if (removeFlag) {
    // J1 review round 1, M1: a same-named file WITHOUT our marker is a user's own unrelated unit —
    // it is left on disk untouched (planRemove below), but the by-name enable/disable commands know
    // nothing about content, only the name, so running them here would stop/disable that foreign
    // unit anyway. Checked (read-only) BEFORE anything is removed, so this can refuse outright
    // rather than deleting our files and then silently skipping only the systemctl call.
    if (enableFlag) {
      const foreignFiles = artifacts
        .map((a) => ({ a, cur: readMarked(a.file, a.marker) }))
        .filter(({ cur }) => cur.exists && !cur.marked)
        .map(({ a }) => a.file);
      if (foreignFiles.length > 0) {
        refusals.push(
          `refusing --remove --enable: foreign (unmarked) file(s) present, will not run enable/disable ` +
            `commands by name against them: ${foreignFiles.join(", ")}`,
        );
      }
    }
    if (refusals.length > 0) {
      if (jsonFlag) stdout(`${JSON.stringify(result, null, 2)}\n`);
      else for (const r of refusals) stdout(`refused: ${r}\n`);
      return 1;
    }

    // Disable BEFORE the files are deleted — `systemctl --user disable` on a unit whose file is
    // already gone can fail (unit file does not exist), leaving a dangling timers.target.wants
    // symlink and the loaded timer active until a reload/reboot (J1 review round 1, M1).
    if (enableFlag && !dryRun) {
      for (const c of disableCmds) {
        const cmdText = `${c.cmd} ${c.args.join(" ")}`;
        try {
          exec(c.cmd, c.args, { stdio: "ignore" });
          result.commands.push(cmdText);
        } catch (err) {
          // Best effort: disabling a timer/task that was never enabled legitimately errors, and
          // that must never block removing the files themselves. Reported, not swallowed silently.
          result.commands.push(`${cmdText} (failed: ${String(err && err.message ? err.message : err)})`);
        }
      }
    }

    for (const a of artifacts) result.files.push(planRemove(a.file, a.marker, dryRun));
    // installed.json is shared by every --name: remove it only when it records THIS name, so
    // removing a janitor-record-test install never blinds J2's check on a real janitor-record one
    // (seam review round 1, M1).
    let installedName = null;
    try {
      installedName = JSON.parse(fs.readFileSync(installedJsonPath, "utf8")).name ?? null;
    } catch {
      /* absent or unreadable */
    }
    if (installedName === null || installedName === name) {
      result.files.push(planRemove(installedJsonPath, null, dryRun));
    } else {
      result.files.push({ path: installedJsonPath, status: "left-untouched-foreign", changed: false });
    }

    if (enableFlag && !dryRun && scheduler === "systemd-user") {
      // Reload after the unit files are gone and disable has run, so systemd's view matches disk.
      const cmdText = "systemctl --user daemon-reload";
      try {
        exec("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
        result.commands.push(cmdText);
      } catch (err) {
        // Best effort, same reasoning as above — but reported, like the disable commands
        // (J1 review round 2, m3: this was swallowed with no record at all, so `ran:` silently
        // omitted the one exec that could fail on the remove path).
        result.commands.push(`${cmdText} (failed: ${String(err && err.message ? err.message : err)})`);
      }
    }

    if (!enableFlag) {
      // J1 review round 1, m3: a plain --remove deletes files but leaves a registered Windows task,
      // or a loaded systemd timer, still running — say so, rather than letting the output imply the
      // live entry is gone too.
      // J1 review round 2, m1: the twin of r1 m4 — a --remove --dry-run must not claim past tense
      // "files removed" for files it left on disk untouched.
      result.note =
        `${dryRun ? "files would be removed" : "files removed"}, but the ${scheduler} entry may still be ` +
        `registered/running — pass --enable to also run: ${disableCmds.map((c) => `${c.cmd} ${c.args.join(" ")}`).join(" && ")}`;
    }
  } else {
    // installed.json is shared by every --name: refuse a second named install while one already
    // exists, before any artifact write, so two named timers can never coexist and blind each
    // other's shared last-run.log (seam review round 1, M1).
    let priorName = null;
    try {
      priorName = JSON.parse(fs.readFileSync(installedJsonPath, "utf8")).name ?? null;
    } catch {
      /* absent or unreadable */
    }
    if (priorName !== null && priorName !== name) {
      refusals.push(`refusing: ${installedJsonPath} already records name=${priorName}; --remove --name ${priorName} first`);
      if (jsonFlag) stdout(`${JSON.stringify(result, null, 2)}\n`);
      else for (const r of refusals) stdout(`refused: ${r}\n`);
      return 1;
    }

    // --dry-run writes nothing (spec item 3) — not even the directory that would hold the artifacts.
    if (!dryRun) fs.mkdirSync(agentsDir, { recursive: true });
    for (const a of artifacts) result.files.push(planWrite(a.file, a.desired, a.marker, dryRun, a.encoding));

    // J1 review round 1, M1/m4: a same-named foreign artifact is left untouched by planWrite above
    // (correct — never overwritten), but the install as a WHOLE must not finish: the by-name enable
    // command would still touch the foreign unit, and installed.json must not claim `created`/exit 0
    // for a host J2 would then treat as fully installed when it is not.
    const foreignFiles = result.files.filter((f) => f.status === "left-untouched-foreign").map((f) => f.path);
    if (foreignFiles.length > 0) {
      refusals.push(
        `refusing to finish install: foreign (unmarked) file(s) present, left untouched: ${foreignFiles.join(", ")}`,
      );
      if (jsonFlag) stdout(`${JSON.stringify(result, null, 2)}\n`);
      else for (const r of refusals) stdout(`refused: ${r}\n`);
      return 1;
    }

    const installedDesired = installedJsonText({ repo, node, hour, scheduler, name, job, every, to: toFlag, staleHours });
    result.files.push(planWrite(installedJsonPath, installedDesired, null, dryRun));

    if (enableFlag && !dryRun) {
      // J1 review round 1, m3: the contract says --enable "runs the host's enable/load command and
      // prints it" — record each command so it reaches both JSON and text output, and never let a
      // failure throw an uncaught stack trace instead of a reported, nonzero exit.
      for (const c of enableCmds) {
        const cmdText = `${c.cmd} ${c.args.join(" ")}`;
        try {
          exec(c.cmd, c.args, { stdio: "ignore" });
          result.commands.push(cmdText);
        } catch (err) {
          refusals.push(`${cmdText} failed: ${String(err && err.message ? err.message : err)}`);
        }
      }
      if (refusals.length > 0) {
        if (jsonFlag) stdout(`${JSON.stringify(result, null, 2)}\n`);
        else for (const r of refusals) stdout(`refused: ${r}\n`);
        return 1;
      }
    }
  }

  if (jsonFlag) {
    stdout(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const scheduleText = triage ? `job=${job}, hour=${hour}` : job === "collect-status" ? `job=${job}, every=${every}` : `hour=${hour}`;
    stdout(`${result.action} (${scheduler}, name=${name}, ${scheduleText}, repo=${repo})\n`);
    for (const f of result.files) stdout(`  ${f.status}: ${f.path}\n`);
    for (const c of result.commands) stdout(`  ran: ${c}\n`);
    if (result.note) stdout(`  note: ${result.note}\n`);
  }

  return 0;
}

/** Only when RUN, never when imported — same fix as janitor.mjs's own isMainModule() (janitor.mjs:
 * 1544-1564), for the same reason (argv[1] vs import.meta.url disagree on separators on win32). */
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const canon = (p) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  return canon(fileURLToPath(import.meta.url)) === canon(entry);
}

if (isMainModule()) {
  process.exit(main());
}
