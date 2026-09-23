'use strict';

/**
 * agent-shell-harness (TRD 34-09) — run the fenced bash of a named agent-prose section
 * UNDER THE REAL BASH-TOOL MODEL and assert what each call did.
 *
 * Why this exists: wave 0 spent three review rounds on executor prose about cwd
 * persistence, because prose has no executable check. Proposal §21 amendment 1 makes the
 * check binding. This module is that check.
 *
 * The model it reproduces (and the ONLY model it reproduces):
 *   - the working directory PERSISTS across Bash calls;
 *   - shell variables, functions and exported environment do NOT;
 *   - one logical command per call.
 * Therefore a bare `cd X && cmd` leaks the working directory into every subsequent call
 * and FAILS a section; `( cd X && cmd )` leaves it unchanged and passes.
 *
 * This module points at no real agent file. 34-10 aims it at `agents/executor.md`.
 *
 * No new npm dependencies: `node:child_process` `execFileSync` is the executor.
 */

// ─── Section / fence scanning ─────────────────────────────────────────────────────────

// A fence opens on 3+ backticks or tildes (up to 3 leading spaces, per CommonMark) and
// closes on a line of >= as many of the SAME character with nothing after it.
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ATX_RE = /^(#{1,6})\s+(.*)$/;

// Section matching rule (documented, because 34-10 names real agents/executor.md headings
// against it): the `section` argument is normalised by stripping its leading `#`s and
// whitespace, and every ATX heading in the document is normalised the same way. An EXACT
// match wins; if there is none, the FIRST heading whose normalised text `startsWith` the
// wanted text is used. `match` in the result says which rule fired.
function normalizeHeading(s) {
  return String(s == null ? '' : s).replace(/^\s*#{1,6}\s*/, '').trim();
}

// One pass over the document, tracking fence state, so that `#` lines INSIDE a fenced
// block are never mistaken for section boundaries.
function scanDocument(lines) {
  const headings = [];
  const fences = [];
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fm = line.match(FENCE_RE);
    if (open) {
      if (fm && fm[1][0] === open.char && fm[1].length >= open.len && fm[2].trim() === '') {
        fences.push({ info: open.info, startLine: open.line, openIndex: open.index, bodyStart: open.index + 1, bodyEnd: i });
        open = null;
      }
      continue;
    }
    if (fm) {
      open = { char: fm[1][0], len: fm[1].length, info: fm[2].trim(), line: i + 1, index: i };
      continue;
    }
    const hm = line.match(ATX_RE);
    if (hm) headings.push({ level: hm[1].length, text: hm[2].trim(), index: i });
  }
  // An unterminated fence runs to EOF rather than silently swallowing the rest of the doc.
  if (open) {
    fences.push({ info: open.info, startLine: open.line, openIndex: open.index, bodyStart: open.index + 1, bodyEnd: lines.length });
  }
  return { headings, fences };
}

/**
 * extractBashBlocks(md, section)
 *   -> {ok:true,  blocks:[{startLine, info, body}], section, headingLine, match}
 *   -> {ok:false, error:'section not found: …', blocks:[]}          (E1 — never an empty pass)
 *   -> {ok:false, missing:'no bash blocks in section', blocks:[]}   (E2 — never `pass`)
 *
 * The two failure modes are deliberately DISTINGUISHABLE: 34-10's CI job reports on the
 * difference between "the section your prose names is gone" and "the section is there but
 * has nothing to run". Neither may read as green.
 */
function extractBashBlocks(md, section) {
  if (typeof md !== 'string') {
    return { ok: false, error: 'markdown input must be a string', blocks: [] };
  }
  const wanted = normalizeHeading(section);
  const lines = md.split('\n');
  const { headings, fences } = scanDocument(lines);

  let match = 'exact';
  let heading = wanted ? headings.find(h => h.text === wanted) : undefined;
  if (!heading && wanted) {
    heading = headings.find(h => h.text.startsWith(wanted));
    match = 'startsWith';
  }
  if (!heading) {
    return { ok: false, error: `section not found: ${section}`, blocks: [] };
  }

  // The section ends at the next heading of the SAME OR HIGHER level (lower `level`
  // number == higher level). A deeper subheading stays inside the section.
  const next = headings.find(h => h.index > heading.index && h.level <= heading.level);
  const endIndex = next ? next.index : lines.length;

  const blocks = fences
    .filter(f => f.openIndex > heading.index && f.openIndex < endIndex)
    // The info string's FIRST token decides: ```bash counts, ```bash title=x counts,
    // ```yaml / ```markdown / a bare ``` do not.
    .filter(f => (f.info.split(/\s+/)[0] || '').toLowerCase() === 'bash')
    .map(f => ({
      startLine: f.startLine,
      info: f.info,
      body: lines.slice(f.bodyStart, f.bodyEnd).join('\n'),
    }));

  if (blocks.length === 0) {
    return {
      ok: false,
      missing: 'no bash blocks in section',
      blocks: [],
      section: heading.text,
      headingLine: heading.index + 1,
      match,
    };
  }

  return { ok: true, blocks, section: heading.text, headingLine: heading.index + 1, match };
}

module.exports = {
  extractBashBlocks,
  normalizeHeading,
};
