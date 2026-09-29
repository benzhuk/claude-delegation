#!/usr/bin/env node
/**
 * page-lint: the mechanical part of Ben's Notion page rules (lane 39, wr-2026-09-28-notion-writing).
 *
 *   node page-lint.mjs <doc.md> [--kind decisions|spec|brief|status|read|handoff|plain]
 *                               [--fragment] [--title "<title>"]
 *
 * Read-only: it never writes and never calls Notion. Exit 0 = clean, exit 2 = one stderr line per
 * violation (`page-lint: <rule-id> <file>:<line> <what, and how to fix>`), exit 1 = usage error.
 * The library entry point is `lintPage(text, { kind, skip, fragment, title })`: synchronous, returns
 * `[{ rule, line, message }]`, throws on an unknown kind or an unknown id in `skip`. It imports
 * nothing from the decisions skill (that would be an import cycle: the render calls this).
 *
 * The rules and their sources are listed in SKILL.md and in docs/specs/2026-09-28-notion-writing.md
 * (Revision 2). Every rule ignores fenced code, the subtree of a `<details>` whose summary holds
 * "Original text", and Ben's owner comment lines (the escaped `\*\*` form), except `no-byline`,
 * which reads every line. Two rules also ignore double-quoted text: `em-dash-arrow` and
 * `options-checkbox`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KINDS = ['decisions', 'spec', 'brief', 'status', 'read', 'handoff', 'plain'];

/** rule id -> the kinds it applies to. */
export const RULES = {
  'goal-callout': ['spec', 'brief', 'status', 'handoff'],
  'read-status': ['read'],
  'prior-rounds': ['read', 'plain'],
  'heading-prefix': KINDS,
  'heading-children': KINDS,
  'toggle-tail': KINDS,
  'before-after': KINDS,
  'options-checkbox': ['decisions', 'plain'],
  'open-question-visible': ['decisions'],
  'decision-block': ['decisions'],
  'done-last': ['decisions'],
  'no-byline': KINDS,
  'em-dash-arrow': KINDS.filter((k) => k !== 'plain'),
};

/** `--fragment` (an append-md or replace-range body) turns off the page-level rules. */
export const FRAGMENT_OFF = ['goal-callout', 'read-status', 'done-last', 'decision-block', 'prior-rounds'];

const ROUND = /\b(round|pass)\s*(\d+)/i;
export const HEADING_PREFIX = /^(\d+[.)]|[A-Z][.)]\s|[IVX]+[.)]\s|P\d+\b|(Step|Phase|Part)\s+\d+)/;
const EMPTY_BLOCK = '<empty-block/>';

// The byline patterns, tested against the probe list in the red-team report (F7).
const AGENT = String.raw`(?:claude(?:\s+code)?|anthropic|codex|openai|chatgpt|gpt[-\s]?[\d.]*|an?\s+ai(?:\s+assistant)?|ai\s+assistant)`;
const END = String.raw`(?![A-Za-z0-9])`;
const LEAD = String.raw`^\s*(?:[-*>]\s+)?(?:<[^>]+>\s*)?(?:[_*]{1,2})?`;
const BYLINE = [
  new RegExp(LEAD + String.raw`(?:written|created|generated|drafted|authored|composed|prepared)\s+(?:by|with|using)\s+(?:[_*]{1,2})?` + AGENT + END, 'i'),
  new RegExp(LEAD + String.raw`(?:by|author)\s*:?\s*(?:[_*]{1,2})?\s*:?\s*(?:[_*]{1,2})?\s*` + AGENT + String.raw`[\s.*_]*(?:</[^>]+>)?\s*$`, 'i'),
  new RegExp(LEAD + String.raw`[—–-]{1,2}\s*` + AGENT + String.raw`[\s.*_]*$`, 'i'),
  /🤖\s*Generated|Co-Authored-By:/i,
];
export const isByline = (s) => BYLINE.some((r) => r.test(s));

/** A title has no line start to anchor on, so "Report by Claude" and "Report (Claude)" need the tail forms too. */
const TITLE_TAIL = [
  new RegExp(String.raw`\b(?:by|with|using)\s+` + AGENT + String.raw`[\s.*_)]*$`, 'i'),
  new RegExp(String.raw`\(\s*` + AGENT + String.raw`\s*\)\s*$`, 'i'),
  new RegExp(String.raw`[—–-]\s*` + AGENT + String.raw`[\s.*_]*$`, 'i'),
];
const isTitleByline = (s) => isByline(s) || TITLE_TAIL.some((r) => r.test(s));

// ---------------------------------------------------------------------------
// Parsing: one pass that marks fences, "Original text" subtrees and owner lines, and collects
// every toggle (a <details> or a {toggle="true"} heading) with its extent and parent.
// ---------------------------------------------------------------------------

function summaryText(line) {
  const m = /<summary>(.*?)(?:<\/summary>|$)/.exec(line);
  return m ? m[1].replace(/\*\*/g, '').trim() : null;
}

function headingOf(t) {
  const m = /^(#{1,3})\s+(.*)$/.exec(t);
  if (!m) return null;
  const toggle = /\{toggle="true"\}\s*$/.test(m[2]);
  return { level: m[1].length, text: m[2].replace(/\s*\{toggle="true"\}\s*$/, '').trim(), toggle };
}

export function prepare(text) {
  const lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const info = lines.map((l) => {
    const indent = /^\t*/.exec(l)[0].length;
    const t = l.slice(indent).trim();
    return {
      indent, t, blank: t === '', fence: false, original: false, owner: false,
    };
  });

  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    const { t } = info[i];
    const m = /^(`{3,}|~{3,})/.exec(t);
    if (fence) {
      info[i].fence = true;
      if (m && m[1][0] === fence.ch && m[1].length >= fence.len && t.slice(m[1].length).trim() === '') fence = null;
    } else if (m) {
      fence = { ch: m[1][0], len: m[1].length };
      info[i].fence = true;
    }
  }

  const toggles = [];
  const open = [];
  for (let i = 0; i < lines.length; i += 1) {
    const x = info[i];
    if (x.fence) continue;
    if (/^\\\*\\\*/.test(x.t.replace(/^- (?:\[[ xX]\] )?/, ''))) x.owner = true;
    if (/^<details\b/.test(x.t)) {
      const el = {
        kind: 'details', line: i, indent: x.indent, summary: null, end: -1, parent: -1,
      };
      toggles.push(el);
      open.push(el);
    }
    if (x.t.includes('<summary>')) {
      const top = open[open.length - 1];
      if (top && top.summary === null) top.summary = summaryText(x.t);
    }
    if (/^<\/details>/.test(x.t)) {
      const top = open.pop();
      if (top) top.end = i;
    }
    const h = headingOf(x.t);
    if (h && h.toggle) {
      let end = i;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (info[j].blank) continue;
        if (info[j].indent <= x.indent) break;
        end = j;
      }
      toggles.push({
        kind: 'heading', line: i, indent: x.indent, summary: h.text, end, parent: -1,
      });
    }
  }
  toggles.sort((a, b) => a.line - b.line);
  // Original text subtrees: the whole <details>, open line to close line.
  for (const el of toggles) {
    if (el.kind === 'details' && el.summary && /Original text/i.test(el.summary)) {
      if (el.end < 0) continue; // unclosed: exempts nothing, toggle-tail reports it
      for (let j = el.line; j <= el.end; j += 1) info[j].original = true;
    }
  }
  // Parent = the nearest earlier toggle whose extent still contains this one.
  toggles.forEach((el, idx) => {
    for (let k = idx - 1; k >= 0; k -= 1) {
      const p = toggles[k];
      const stop = p.end >= 0 ? p.end : lines.length - 1;
      if (p.line < el.line && el.line <= stop && el.indent > p.indent) {
        el.parent = k;
        break;
      }
    }
  });
  return { lines, info, toggles };
}

const stripQuotes = (s) => s.replace(/"[^"]*"|“[^”]*”/g, '""');

function nextNonBlank(ctx, i) {
  for (let j = i + 1; j < ctx.lines.length; j += 1) if (!ctx.info[j].blank) return j;
  return -1;
}

/** True when the line is verbatim or code: rules other than no-byline leave it alone. */
const exempt = (ctx, i) => ctx.info[i].fence || ctx.info[i].original || ctx.info[i].owner;

// ---------------------------------------------------------------------------
// Rules. Each returns [{ rule, line (1-based), message }].
// ---------------------------------------------------------------------------

function firstBlock(ctx) {
  return ctx.info.findIndex((x) => !x.blank);
}

function calloutBody(ctx, i) {
  const t = ctx.info[i].t;
  if (/<\/callout>\s*$/.test(t)) return [t.replace(/^<callout[^>]*>/, '').replace(/<\/callout>\s*$/, '')];
  const body = [];
  for (let j = i + 1; j < ctx.lines.length; j += 1) {
    if (/^<\/callout>/.test(ctx.info[j].t)) return body;
    if (!ctx.info[j].blank) body.push(ctx.info[j].t);
  }
  return body;
}

function ruleGoalCallout(ctx) {
  const i = firstBlock(ctx);
  if (i < 0 || ctx.info[i].indent !== 0 || !/^<callout\b[^>]*icon="🎯"/.test(ctx.info[i].t)) {
    return [{
      rule: 'goal-callout',
      line: (i < 0 ? 0 : i) + 1,
      message: 'the first top-level block must be a goal callout (<callout icon="🎯">) stating Ben\'s goals in his meaning; put it first, replace it, never append to it',
    }];
  }
  const n = calloutBody(ctx, i).filter((s) => s.trim() !== '').length;
  if (n > 15) {
    return [{ rule: 'goal-callout', line: i + 1, message: `the goal callout has ${n} non-empty lines, more than 15; cut it to Ben's goals in his meaning` }];
  }
  return [];
}

function roundToggles(ctx) {
  return ctx.toggles.filter((el) => !ctx.info[el.line].original && el.summary
    && !/^Prior rounds\b/i.test(el.summary) && ROUND.test(el.summary));
}

function countSentences(s) {
  return s.replace(/\*\*/g, '').replace(/<[^>]+>/g, '').split(/(?<=[.!?])\s+/).filter((x) => /\S/.test(x)).length;
}

function ruleReadStatus(ctx) {
  const rounds = ctx.toggles.filter((el) => !ctx.info[el.line].original && el.summary && ROUND.test(el.summary));
  if (rounds.length < 2) return [];
  const out = [];
  const i = firstBlock(ctx);
  if (i < 0 || ctx.info[i].indent !== 0 || !/^<callout\b/.test(ctx.info[i].t)) {
    out.push({ rule: 'read-status', line: (i < 0 ? 0 : i) + 1, message: 'a read page with several rounds must open with a status callout of at most two sentences' });
  } else {
    const n = countSentences(calloutBody(ctx, i).join(' '));
    if (n > 2) out.push({ rule: 'read-status', line: i + 1, message: `the status callout has ${n} sentences, more than 2; cut it to two` });
  }
  const readNow = [];
  ctx.lines.forEach((_, k) => { if (!exempt(ctx, k) && /^(?:\*\*)?Read now:/.test(ctx.info[k].t)) readNow.push(k); });
  if (readNow.length !== 1) {
    out.push({
      rule: 'read-status',
      line: (readNow[1] ?? readNow[0] ?? 0) + 1,
      message: `a read page needs exactly one "Read now:" line naming the toggles to read, found ${readNow.length}`,
    });
  }
  return out;
}

function insidePrior(ctx, el) {
  for (let p = el.parent; p >= 0; p = ctx.toggles[p].parent) {
    if (/^Prior rounds\b/i.test(ctx.toggles[p].summary ?? '')) return true;
  }
  return false;
}

function rulePriorRounds(ctx) {
  const groups = new Map();
  for (const el of roundToggles(ctx)) {
    if (insidePrior(ctx, el)) continue;
    if (!groups.has(el.parent)) groups.set(el.parent, []);
    groups.get(el.parent).push(el);
  }
  const out = [];
  for (const els of groups.values()) {
    const nums = [...new Set(els.map((el) => Number(ROUND.exec(el.summary)[2])))];
    if (nums.length > 1) {
      out.push({
        rule: 'prior-rounds',
        line: els[0].line + 1,
        message: `sibling toggles name rounds ${nums.join(', ')}; keep only the current round at this level and move earlier rounds into ONE toggle titled "Prior rounds"`,
      });
    }
  }
  return out;
}

function ruleHeadingPrefix(ctx) {
  const out = [];
  ctx.lines.forEach((_, i) => {
    if (exempt(ctx, i)) return;
    const h = headingOf(ctx.info[i].t);
    const text = h ? h.text : (ctx.info[i].t.includes('<summary>') ? summaryText(ctx.info[i].t) : null);
    if (text && HEADING_PREFIX.test(text)) {
      out.push({ rule: 'heading-prefix', line: i + 1, message: `"${text.slice(0, 50)}" starts with a number or ordinal; headings and toggle titles stand alone, drop the prefix` });
    }
  });
  return out;
}

function ruleHeadingChildren(ctx) {
  const out = [];
  ctx.lines.forEach((_, i) => {
    if (exempt(ctx, i)) return;
    const h = headingOf(ctx.info[i].t);
    if (!h || h.toggle) return;
    const j = nextNonBlank(ctx, i);
    if (j >= 0 && ctx.info[j].indent > ctx.info[i].indent) {
      out.push({ rule: 'heading-children', line: i + 1, message: 'a plain heading has indented children, which Notion flattens to top level; add {toggle="true"} to the heading or outdent the children' });
    }
  });
  return out;
}

function ruleToggleTail(ctx) {
  const out = [];
  for (const el of ctx.toggles) {
    if (ctx.info[el.line].original) continue;
    if (el.kind === 'details') {
      if (el.end < 0) {
        out.push({ rule: 'toggle-tail', line: el.line + 1, message: 'this <details> never closes' });
        continue;
      }
      let j = el.end - 1;
      while (j >= 0 && ctx.info[j].blank) j -= 1;
      if (j < 0 || ctx.info[j].t !== EMPTY_BLOCK) {
        out.push({ rule: 'toggle-tail', line: el.end + 1, message: `this <details> (opened at line ${el.line + 1}) closes without an <empty-block/> as its last child; add one before </details>` });
      }
    } else {
      let last = -1;
      for (let j = el.line + 1; j <= el.end; j += 1) if (!ctx.info[j].blank) last = j;
      if (last >= 0 && ctx.info[last].t !== EMPTY_BLOCK) {
        out.push({ rule: 'toggle-tail', line: el.line + 1, message: 'this toggle heading section does not end with an <empty-block/>; add one as its last child' });
      }
    }
  }
  return out;
}

function ruleBeforeAfter(ctx) {
  const B = /\bBefore:|\bBEFORE\b/g;
  const A = /\bAfter:|\bAFTER\b/g;
  const positions = (line, rx) => [...line.matchAll(rx)].map((m) => m.index);
  const colored = (line, at) => /<span color="[^"]+">\**$/.test(line.slice(0, at));
  const out = [];
  const seen = new Set();
  const partner = (i, rx) => {
    const lo = Math.max(0, i - 3);
    const hi = Math.min(ctx.lines.length - 1, i + 3);
    const cands = [];
    for (let j = i; j <= hi; j += 1) cands.push(j);
    for (let j = i - 1; j >= lo; j -= 1) cands.push(j);
    for (const j of cands) {
      if (j !== i && (ctx.info[j].blank || ctx.info[j].indent !== ctx.info[i].indent || exempt(ctx, j))) continue;
      const at = positions(ctx.lines[j], rx);
      if (at.length) return { j, at: at[0] };
    }
    return null;
  };
  ctx.lines.forEach((line, i) => {
    if (exempt(ctx, i)) return;
    const bs = positions(line, B);
    if (bs.length === 0) return;
    const pair = partner(i, A);
    if (!pair) return;
    const key = `${Math.min(i, pair.j)}:${Math.max(i, pair.j)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!colored(line, bs[0]) || !colored(ctx.lines[pair.j], pair.at)) {
      out.push({ rule: 'before-after', line: Math.min(i, pair.j) + 1, message: 'a Before/After pair needs both labels as colored spans: <span color="red">**BEFORE**</span> and <span color="green">**AFTER**</span>' });
    }
  });
  return out;
}

function ruleOptionsCheckbox(ctx) {
  const out = [];
  ctx.lines.forEach((_, i) => {
    if (exempt(ctx, i)) return;
    const s = stripQuotes(ctx.info[i].t);
    if (/^- \[[ xX]\]/.test(s)) return;
    if (/^(?:[-*]\s+)?\([A-Za-z]\)\s/.test(s)) {
      out.push({ rule: 'options-checkbox', line: i + 1, message: 'an option label (A), (B) sits in prose; write each option as a checkbox line: - [ ] (A) ...' });
    }
  });
  return out;
}

const QUESTION = /^- \[ \] \*\*/;

function h1Section(ctx, re) {
  for (let i = 0; i < ctx.lines.length; i += 1) {
    if (ctx.info[i].fence || ctx.info[i].indent !== 0 || !re.test(ctx.info[i].t)) continue;
    let end = ctx.lines.length;
    for (let j = i + 1; j < ctx.lines.length; j += 1) {
      if (!ctx.info[j].fence && ctx.info[j].indent === 0 && /^# /.test(ctx.info[j].t)) { end = j; break; }
    }
    return { start: i + 1, end, base: /\{toggle="true"\}\s*$/.test(ctx.info[i].t) ? 1 : 0 };
  }
  return null;
}

function itemChildren(ctx, i, base, end) {
  const kids = [];
  for (let j = i + 1; j < end; j += 1) {
    if (ctx.info[j].blank) continue;
    if (ctx.info[j].indent <= base) break;
    if (ctx.info[j].indent === base + 1) kids.push(j);
  }
  return kids;
}

function ruleOpenQuestionVisible(ctx) {
  const sec = h1Section(ctx, /^# Waiting on you/);
  if (!sec) return [];
  const out = [];
  for (let i = sec.start; i < sec.end; i += 1) {
    if (exempt(ctx, i) || !QUESTION.test(ctx.info[i].t) || !/\?\*\*/.test(ctx.info[i].t)) continue;
    const inside = ctx.toggles.some((el) => el.kind === 'details' && el.line < i && i < (el.end < 0 ? ctx.lines.length : el.end));
    if (inside) out.push({ rule: 'open-question-visible', line: i + 1, message: 'an open question sits inside a <details>; open questions stay visible, only their detail nests in a toggle' });
  }
  return out;
}

const BLOCK_LABELS = [
  '**Why this is yours:**', '**What waits on it:**', '**Options, tick one:**',
  '**My recommendation:**', '**Given:**', '**Answer here:**',
];

const summaryAt = (ctx, j) => ctx.toggles.find((el) => el.kind === 'details' && el.line === j)?.summary ?? '';

function checkWaitingItem(ctx, i, sec) {
  const out = [];
  const bad = (message) => out.push({ rule: 'decision-block', line: i + 1, message });
  if (!/\?\*\*/.test(ctx.info[i].t)) bad('the question must be one bold line that ends with ?');
  const kids = itemChildren(ctx, i, sec.base, sec.end).filter((j) => !exempt(ctx, j));
  let cursor = -1;
  let optionsAt = -1;
  for (const label of BLOCK_LABELS) {
    const at = kids.findIndex((j, n) => n > cursor && ctx.info[j].t.startsWith(label));
    if (at < 0) { bad(`missing or out of order: ${label}`); continue; }
    cursor = at;
    if (label === BLOCK_LABELS[2]) optionsAt = at;
  }
  if (optionsAt >= 0) {
    let n = 0;
    for (let k = optionsAt + 1; k < kids.length && /^- \[[ xX]\] \([A-Za-z]\)/.test(ctx.info[kids[k]].t); k += 1) n += 1;
    if (n < 2) bad(`Options, tick one: needs two or more "- [ ] (A) ..." lines directly under it, found ${n}`);
  }
  const details = kids.filter((j) => /^<details\b/.test(ctx.info[j].t));
  if (details.length > 1) bad(`${details.length} <details> children; a decision item has one Background toggle and no reasoning sub-toggles`);
  for (const j of details) {
    if (!/Background/.test(summaryAt(ctx, j))) bad('the only toggle in a decision item is titled Background');
  }
  return out;
}

function ruleDecisionBlock(ctx) {
  const out = [];
  const wait = h1Section(ctx, /^# Waiting on you/);
  if (wait) {
    for (let i = wait.start; i < wait.end; i += 1) {
      if (exempt(ctx, i) || ctx.info[i].indent !== wait.base || !QUESTION.test(ctx.info[i].t)) continue;
      out.push(...checkWaitingItem(ctx, i, wait));
    }
  }
  const dec = h1Section(ctx, /^# Decided/);
  if (dec) {
    for (let i = dec.start; i < dec.end; i += 1) {
      if (exempt(ctx, i) || ctx.info[i].indent !== dec.base || !/^- \[[xX]\] \*\*/.test(ctx.info[i].t)) continue;
      const bad = (message) => out.push({ rule: 'decision-block', line: i + 1, message });
      if (!/Your answer:/.test(ctx.info[i].t)) bad('a decided item carries "Your answer:" with his words');
      const kids = itemChildren(ctx, i, dec.base, dec.end);
      const hasOriginal = kids.some((j) => /^<details\b/.test(ctx.info[j].t) && /Original text/.test(summaryAt(ctx, j)));
      if (!hasOriginal) bad('a decided item keeps the original block verbatim in a child <details> titled Original text');
    }
  }
  return out;
}

function ruleDoneLast(ctx) {
  let j = ctx.lines.length - 1;
  while (j >= 0 && (ctx.info[j].blank || ctx.info[j].t === EMPTY_BLOCK)) j -= 1;
  if (j < 0 || !/^- \[[ xX]\] Done\b/.test(ctx.info[j].t)) {
    return [{ rule: 'done-last', line: Math.max(j, 0) + 1, message: 'the last line of a decisions page is the "- [ ] Done" checkbox' }];
  }
  return [];
}

function ruleNoByline(ctx) {
  const out = [];
  ctx.lines.forEach((line, i) => {
    if (isByline(line)) out.push({ rule: 'no-byline', line: i + 1, message: 'an AI or assistant byline or attribution; every page reads as written by Ben Zhuk, delete the line' });
  });
  return out;
}

function ruleEmDashArrow(ctx) {
  const out = [];
  ctx.lines.forEach((_, i) => {
    if (exempt(ctx, i)) return;
    const s = stripQuotes(ctx.info[i].t)
      .replace(/`[^`]*`/g, '')
      .replace(/\]\([^)]*\)/g, ']')
      .replace(/-->/g, '');
    const m = /—|→|⇒|->/.exec(s);
    if (m) out.push({ rule: 'em-dash-arrow', line: i + 1, message: `"${m[0]}" in prose; no em dashes and no arrows, write a sentence or a comma` });
  });
  return out;
}

const RUNNERS = {
  'goal-callout': ruleGoalCallout,
  'read-status': ruleReadStatus,
  'prior-rounds': rulePriorRounds,
  'heading-prefix': ruleHeadingPrefix,
  'heading-children': ruleHeadingChildren,
  'toggle-tail': ruleToggleTail,
  'before-after': ruleBeforeAfter,
  'options-checkbox': ruleOptionsCheckbox,
  'open-question-visible': ruleOpenQuestionVisible,
  'decision-block': ruleDecisionBlock,
  'done-last': ruleDoneLast,
  'no-byline': ruleNoByline,
  'em-dash-arrow': ruleEmDashArrow,
};

/**
 * @param {string} text  the markdown that will be sent
 * @param {{kind?: string, skip?: string[], fragment?: boolean, title?: string|null}} [opts]
 * @returns {{rule: string, line: number, message: string}[]} sorted by line; [] is clean
 */
export function lintPage(text, { kind = 'plain', skip = [], fragment = false, title = null } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`page-lint: unknown kind "${kind}" (one of ${KINDS.join(', ')})`);
  for (const id of skip) {
    if (!Object.hasOwn(RULES, id)) throw new Error(`page-lint: unknown rule id "${id}" in skip`);
  }
  const off = new Set([...skip, ...(fragment ? FRAGMENT_OFF : [])]);
  const ctx = prepare(text);
  const out = [];
  for (const [id, kinds] of Object.entries(RULES)) {
    if (off.has(id) || !kinds.includes(kind)) continue;
    out.push(...RUNNERS[id](ctx));
  }
  if (title !== null && title !== undefined) {
    if (!off.has('no-byline') && isTitleByline(String(title))) {
      out.push({ rule: 'no-byline', line: 0, message: 'the page title carries an AI or assistant byline; titles read as Ben\'s own' });
    }
    if (!off.has('heading-prefix') && HEADING_PREFIX.test(String(title).trim())) {
      out.push({ rule: 'heading-prefix', line: 0, message: 'the page title starts with a number or ordinal; drop the prefix' });
    }
  }
  return out.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

/** One `page-lint: <rule> <file>:<line> <message>` per violation. */
export function formatViolations(violations, file) {
  return violations.map((v) => `page-lint: ${v.rule} ${file}:${v.line} ${v.message}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    kind: 'plain', fragment: false, title: null, file: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--kind' || a === '--title') {
      if (argv[i + 1] === undefined) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = argv[i + 1];
      i += 1;
    } else if (a === '--fragment') {
      opts.fragment = true;
    } else if (a.startsWith('--')) {
      throw new Error(`unrecognized option ${a}`);
    } else if (opts.file === null) {
      opts.file = a;
    } else {
      throw new Error(`unexpected argument ${a}`);
    }
  }
  if (opts.file === null) throw new Error('usage: page-lint.mjs <doc.md> [--kind K] [--fragment] [--title "<title>"]');
  return opts;
}

export function main(argv, { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  let opts;
  let text;
  try {
    opts = parseArgs(argv);
    if (!KINDS.includes(opts.kind)) throw new Error(`unknown kind "${opts.kind}" (one of ${KINDS.join(', ')})`);
    text = fs.readFileSync(opts.file, 'utf8');
  } catch (e) {
    err(`page-lint: ${e instanceof Error ? e.message : e}\n`);
    return 1;
  }
  const violations = lintPage(text, { kind: opts.kind, fragment: opts.fragment, title: opts.title });
  if (violations.length === 0) {
    out(`page-lint: clean (${opts.kind})\n`);
    return 0;
  }
  err(`${formatViolations(violations, opts.file).join('\n')}\n`);
  return 2;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const canon = (p) => {
    let r = path.resolve(p);
    try { r = fs.realpathSync(r); } catch { /* fall back to the resolved path */ }
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return canon(entry) === canon(fileURLToPath(import.meta.url));
}

if (isMainModule()) process.exitCode = main(process.argv.slice(2));
