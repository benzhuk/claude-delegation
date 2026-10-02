#!/usr/bin/env node
/**
 * mask-fixture: turns a real Notion page into a public-safe skeleton that page-lint still reads
 * the same way (lane 39, spec Revision 2 F1). This repo is public and Ben's pages are not, so
 * only the skeleton is ever committed; the real read stays in the session scratch folder.
 *
 *   node mask-fixture.mjs <real.md> <skeleton.md>
 *
 * Every letter and digit outside the keyword list becomes `x`, so a word keeps its length and
 * nothing else. Kept as they are: markers (`-`, `[ ]`, `#`, `>`), tabs, tags and the attributes
 * page-lint keys on, punctuation, em dashes, arrows, `(A)`-style labels, heading and summary
 * ordinals, `Round N` / `Pass N`, and the keywords below. `maskText` is idempotent, and the CLI
 * refuses to write a skeleton that `findLeaks` still finds a real word in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEADING_PREFIX } from './page-lint.mjs';

/** The only words a skeleton may still carry (compared case-insensitively). */
export const KEYWORDS = [
  'Waiting on you now', 'Waiting on you', 'Decided',
  'Goal card', 'Bearings', 'Components',
  'Decision', 'Condition', 'Next action', 'Prediction', 'Links', 'Original text', 'Background',
  'Why this is yours', 'What waits on it', 'Options, tick one', 'My recommendation',
  'Given', 'Answer here', 'Your answer',
  'Read now', 'Prior rounds', 'Round', 'Pass',
  'Before', 'After', 'BEFORE', 'AFTER',
  'Done',
];

const TAGS = 'details|summary|callout|span|empty-block|page|table|tr|td|th|colgroup|col|br|u|mention-page|mention-user|mention-date|database|data-source';
const TAG_RE = new RegExp(`</?(?:${TAGS})(?:\\s[^<>]*)?/?>`, 'y');
const BLOCK_ATTR_RE = /\{(?:toggle|color)="[\w-]+"(?:\s+(?:toggle|color)="[\w-]+")*\}/y;
const KEEP_ATTRS = new Set(['icon', 'color', 'toggle', 'header-row', 'header-column']);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEYWORD_ALT = [...KEYWORDS].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
const B = String.raw`(?<![\p{L}\p{N}])`;
const E = String.raw`(?![\p{L}\p{N}])`;
const PROTECT = new RegExp(
  `(${B}(?:round|pass)\\s*\\d+)|(${B}(?:${KEYWORD_ALT})${E})|(\\([A-Za-z]\\))|([\\p{L}\\p{N}])`,
  'giu',
);

function maskPiece(s, atStart) {
  let pre = '';
  let rest = s;
  if (atStart) {
    const bold = /^\*\*/.exec(rest)?.[0] ?? '';
    const pm = HEADING_PREFIX.exec(rest.slice(bold.length));
    if (pm) {
      pre = rest.slice(0, bold.length + pm[0].length);
      rest = rest.slice(pre.length);
    }
  }
  return pre + rest.replace(PROTECT, (m, round, kw, label, ch) => (ch !== undefined ? 'x' : m));
}

function maskTag(tag) {
  const m = /^<(\/?)([\w-]+)((?:\s[^<>]*?)?)(\/?)>$/.exec(tag);
  if (!m) return tag.replace(/[\p{L}\p{N}]/gu, 'x');
  const attrs = m[3].replace(/(\s+)([\w-]+)(?:="([^"]*)")?/g, (all, sp, name, val) => {
    if (val === undefined) return `${sp}${name}`;
    return `${sp}${name}="${KEEP_ATTRS.has(name) ? val : val.replace(/[\p{L}\p{N}]/gu, 'x')}"`;
  });
  return `<${m[1]}${m[2]}${attrs}${m[4]}>`;
}

export function maskLine(line) {
  const lead = /^(\t*)((?:>\s*)?)(#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?/.exec(line);
  const prefix = lead[0];
  const rest = line.slice(prefix.length);
  let atStart = /^#/.test(lead[3] ?? '');
  let out = prefix;
  let text = '';
  const flush = () => {
    if (text !== '') out += maskPiece(text, atStart);
    if (text !== '') atStart = false;
    text = '';
  };
  let i = 0;
  while (i < rest.length) {
    if (rest[i] === '<' || rest[i] === '{') {
      const re = rest[i] === '<' ? TAG_RE : BLOCK_ATTR_RE;
      re.lastIndex = i;
      const m = re.exec(rest);
      if (m) {
        flush();
        out += rest[i] === '<' ? maskTag(m[0]) : m[0];
        atStart = /^<summary>$/.test(m[0]);
        i += m[0].length;
        continue;
      }
    }
    text += rest[i];
    i += 1;
  }
  flush();
  return out;
}

export function maskText(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').map(maskLine).join('\n');
}

const ALLOWED_WORDS = new Set([
  ...KEYWORDS.flatMap((k) => k.toLowerCase().split(/[^a-z]+/)).filter(Boolean),
  'step', 'phase', 'part',
]);

/**
 * Words a skeleton still carries that are neither an x run nor part of the keyword list, after
 * the structural tags are taken out. Empty means nothing readable is left.
 */
export function findLeaks(skeleton) {
  const leaks = [];
  String(skeleton).split('\n').forEach((line, i) => {
    const bare = line
      .replace(new RegExp(`</?(?:${TAGS})(?:\\s[^<>]*)?/?>`, 'g'), ' ')
      .replace(/\{(?:toggle|color)="[\w-]+"(?:\s+(?:toggle|color)="[\w-]+")*\}/g, ' ');
    for (const w of bare.match(/[\p{L}\p{N}]+/gu) ?? []) {
      if (/^x+$/i.test(w) || /^\d+$/.test(w) || w.length === 1 || ALLOWED_WORDS.has(w.toLowerCase())) continue;
      if (/^(?:[ivx]+|p\d+)$/i.test(w)) continue;
      leaks.push({ line: i + 1, word: w });
    }
  });
  return leaks;
}

function main(argv) {
  const [input, output] = argv;
  if (!input || !output) {
    process.stderr.write('usage: mask-fixture.mjs <real.md> <skeleton.md>\n');
    return 1;
  }
  const skeleton = maskText(fs.readFileSync(input, 'utf8'));
  const leaks = findLeaks(skeleton);
  if (leaks.length > 0 || maskText(skeleton) !== skeleton) {
    process.stderr.write(`mask-fixture: refusing to write, ${leaks.length} word(s) survive, first: ${JSON.stringify(leaks.slice(0, 5))}\n`);
    return 2;
  }
  fs.writeFileSync(output, skeleton);
  process.stdout.write(`mask-fixture: wrote ${output} (${skeleton.split('\n').length} lines)\n`);
  return 0;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const canon = (p) => {
    let r = path.resolve(p);
    try { r = fs.realpathSync(r); } catch { /* fall back */ }
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return canon(entry) === canon(fileURLToPath(import.meta.url));
}

if (isMainModule()) process.exitCode = main(process.argv.slice(2));
