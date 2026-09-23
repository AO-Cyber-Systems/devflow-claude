'use strict';

/**
 * yaml-lite — a minimal, dependency-free YAML SUBSET parser (objective 34-01).
 *
 * Surface Spec front matter has to be machine-read, and this repo carries exactly one npm
 * dependency (`node-pty`) on purpose. So instead of `require('js-yaml')` there is this: a
 * parser for the small YAML subset §4.2's schema actually uses — block maps, block lists
 * (of scalars and of maps), inline (flow) maps and lists, quoted and bare scalars, comments.
 *
 * Everything outside that subset THROWS, with a 1-based line number and the name of the
 * construct. A subset parser that silently mis-parses is worse than no parser: it turns a
 * spec the author believes is machine-checked into one that is quietly wrong.
 *
 * Consumed by: 34-02's parseSurfaceSpec (its first and only caller). Wires nothing itself.
 * Requires nothing — not even a node builtin.
 */

class YamlLiteError extends Error {
  constructor(message, line) {
    super(`${message} (line ${line})`);
    this.name = 'YamlLiteError';
    this.line = line;
  }
}

// ─── Quote masking ────────────────────────────────────────────────────────────
//
// Everything that scans for a structural character — the `: ` key separator, a `,` between
// flow elements, a matching `]`/`}`, a ` #` comment — scans the MASKED copy of the line, in
// which the contents of quoted strings are blanked to spaces. Slices are then taken from the
// ORIGINAL, so `title: "{project.name}: overview # 1"` keeps its colon and its hash.
// Same length in, same length out, so indices carry over unchanged.

function maskQuoted(s, line) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c !== '"' && c !== "'") { out += c; i++; continue; }
    const quote = c;
    out += quote;
    i++;
    for (;;) {
      if (i >= s.length) {
        throw new YamlLiteError(`unterminated ${quote === '"' ? 'double' : 'single'}-quoted string`, line);
      }
      if (quote === '"' && s[i] === '\\') { out += '  '; i += 2; continue; }
      if (s[i] === quote) {
        if (quote === "'" && s[i + 1] === "'") { out += '  '; i += 2; continue; }
        break;
      }
      out += ' ';
      i++;
    }
    out += quote;
    i++;
  }
  return out;
}

// Reads one quoted scalar starting at s[0]; returns its decoded value and the index just past
// the closing quote. Double quotes honour \" \\ \n \t \r; single quotes honour '' -> '.
function readQuoted(s, line) {
  const quote = s[0];
  let out = '';
  let i = 1;
  while (i < s.length) {
    const c = s[i];
    if (quote === '"' && c === '\\') {
      const n = s[i + 1];
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n === undefined ? '' : n;
      i += 2;
      continue;
    }
    if (c === quote) {
      if (quote === "'" && s[i + 1] === "'") { out += "'"; i += 2; continue; }
      return { value: out, end: i + 1 };
    }
    out += c;
    i++;
  }
  throw new YamlLiteError(`unterminated ${quote === '"' ? 'double' : 'single'}-quoted string`, line);
}

// ─── Phase 1: tokenise ────────────────────────────────────────────────────────
//
// One record per significant line: { line, indent, content, dash, itemIndent, body, key, value }.
// Blank lines and full-line comments are dropped, but `line` keeps the ORIGINAL 1-based number
// so every error points at the real file.

function isSpace(c) {
  return c === ' ' || c === '\t';
}

function splitKeyValue(body, line) {
  // `': '` (colon-space) or a line-terminal `:` is the key separator. A colon glued to the next
  // character is CONTENT — `/projects/:id/conversations` and `sha256:9f2b…` are single strings.
  //
  // Comments are stripped HERE, off the masked copy, not off the raw line: a stripper that runs
  // over the raw text eats `must_show: ["#1 priority"]`. A `#` is a comment only when it is
  // preceded by whitespace AND is not the first character of the value — `color: #fff` is the
  // string '#fff', and `accent: #fff # why` is '#fff' with the SECOND hash starting the comment.
  const masked = maskQuoted(body, line);
  const flowHead = body.charAt(0) === '{' || body.charAt(0) === '[';
  let keyEnd = -1;
  if (!flowHead) {
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] === '#' && i > 0 && isSpace(masked[i - 1])) break;
      if (masked[i] === ':' && (i + 1 >= masked.length || masked[i + 1] === ' ')) { keyEnd = i; break; }
    }
  }
  let start = keyEnd + 1;
  while (start < masked.length && masked[start] === ' ') start++;
  let end = masked.length;
  for (let i = start + 1; i < masked.length; i++) {
    if (masked[i] === '#' && isSpace(masked[i - 1])) { end = i; break; }
  }
  return {
    key: keyEnd < 0 ? null : body.slice(0, keyEnd).trim(),
    value: body.slice(start, end).replace(/\s+$/, ''),
    // The masked, comment-free code region of this line. Every refusal pattern is matched
    // against THIS, so `title: "a & b"` is not mistaken for an anchor and a `# &x` comment
    // is not mistaken for anything at all.
    code: masked.slice(0, end)
  };
}

function splitLine(content, indent, line) {
  let dash = false;
  let off = 0;
  const m = /^-( +|$)/.exec(content);
  if (m) { dash = true; off = m[0].length; }
  const body = content.slice(off);
  const kv = splitKeyValue(body, line);
  // A block-list item `- id: x` opens a mapping whose column is the column of the character
  // AFTER `- `, not the column of `-`. Continuation keys align to that column.
  return { dash, itemIndent: indent + off, body, key: kv.key, value: kv.value, code: kv.code };
}

// ─── Refusals ─────────────────────────────────────────────────────────────────
//
// Matched against the masked, comment-free code region of a line, in source order, so the
// FIRST offending line is the one reported. When the choice is between "support it" and
// "reject it with a clear message", reject: a construct that is neither supported nor refused
// is the one outcome that makes a spec quietly wrong instead of loudly broken.

const MERGE_KEY_RE = /^<<\s*:/;
const ANCHOR_RE = /(^|\s)&[A-Za-z0-9_-]+/;
const ALIAS_RE = /(^|\s)\*[A-Za-z0-9_-]+/;

function refuse(code, line) {
  if (MERGE_KEY_RE.test(code.trim())) {
    throw new YamlLiteError(
      'the merge key `<<:` is not supported by yaml-lite; write the merged keys out in full',
      line
    );
  }
  if (ANCHOR_RE.test(code)) {
    throw new YamlLiteError(
      'an anchor (`&name`) is not supported by yaml-lite; write the value out in full',
      line
    );
  }
  if (ALIAS_RE.test(code)) {
    throw new YamlLiteError(
      'an alias (`*name`) is not supported by yaml-lite; write the value out in full',
      line
    );
  }
}

function tokenise(text) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const tokens = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    if (trimmed.charAt(0) === '#') continue;
    const indent = raw.length - raw.replace(/^ +/, '').length;
    const content = raw.slice(indent).replace(/\s+$/, '');
    const parsed = splitLine(content, indent, i + 1);
    refuse(parsed.code, i + 1);
    tokens.push({ line: i + 1, indent, content, ...parsed });
  }
  return tokens;
}

// ─── Phase 2: flow (inline) collections ───────────────────────────────────────
//
// Flow syntax is context-free; it gets its own small recursive scanner rather than being
// squeezed through the line tokeniser.

function matchingClose(masked, line) {
  let depth = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) return i; }
  }
  throw new YamlLiteError('unterminated flow collection', line);
}

function splitTopLevel(inner, masked) {
  if (inner.trim() === '') return [];
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { parts.push(inner.slice(start, i)); start = i + 1; }
  }
  parts.push(inner.slice(start));
  return parts;
}

function splitFlowPair(el, line) {
  const masked = maskQuoted(el, line);
  let depth = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ':' && depth === 0 && (i + 1 >= masked.length || masked[i + 1] === ' ')) {
      return { key: parseScalar(el.slice(0, i), line), value: el.slice(i + 1).trim() };
    }
  }
  throw new YamlLiteError('expected `key: value` inside a flow mapping', line);
}

function parseFlowValue(text, line) {
  const t = text.trim();
  const head = t.charAt(0);
  if (head !== '[' && head !== '{') return parseScalar(t, line);

  const masked = maskQuoted(t, line);
  const close = matchingClose(masked, line);
  if (close !== t.length - 1) throw new YamlLiteError('unexpected content after a flow collection', line);
  const inner = t.slice(1, close);
  const innerMasked = masked.slice(1, close);

  if (head === '[') return splitTopLevel(inner, innerMasked).map((el) => parseFlowValue(el, line));

  const obj = {};
  for (const el of splitTopLevel(inner, innerMasked)) {
    const pair = splitFlowPair(el.trim(), line);
    obj[pair.key] = pair.value === '' ? null : parseFlowValue(pair.value, line);
  }
  return obj;
}

// ─── Phase 3: scalars ─────────────────────────────────────────────────────────

function parseScalar(str, line) {
  const s = str.trim();
  if (s === '') return null;
  const quote = s.charAt(0);
  if (quote === '"' || quote === "'") {
    const read = readQuoted(s, line);
    if (read.end !== s.length) throw new YamlLiteError('unexpected content after a quoted scalar', line);
    // The unquoted contents, VERBATIM — no further typing, so `"1"` stays the string '1'.
    return read.value;
  }
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  // Everything else is a STRING, explicitly and deliberately: `2026-09-18`, `390x844`,
  // `sha256:9f2b…`, `/projects/:id/conversations`.
  return s;
}

function parseValue(str, line) {
  const head = str.charAt(0);
  if (head === '[' || head === '{') return parseFlowValue(str, line);
  return parseScalar(str, line);
}

// ─── Phase 4: build the tree from the token stream ────────────────────────────

function buildBlock(tokens, start, indent) {
  if (tokens[start].dash) return buildSeq(tokens, start, indent);
  return buildMap(tokens, start, indent);
}

function buildMap(tokens, start, indent) {
  const obj = {};
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.indent !== indent || tok.dash || tok.key === null) break;
    i++;
    let value;
    if (tok.value === '') {
      if (i < tokens.length && tokens[i].indent > indent) {
        const r = buildBlock(tokens, i, tokens[i].indent);
        value = r.value;
        i = r.next;
      } else if (i < tokens.length && tokens[i].indent === indent && tokens[i].dash) {
        const r = buildSeq(tokens, i, indent);
        value = r.value;
        i = r.next;
      } else {
        // A key with an empty value and no block below it is null, not ''.
        value = null;
      }
    } else {
      value = parseValue(tok.value, tok.line);
    }
    obj[tok.key] = value;
  }
  return { value: obj, next: i };
}

function buildSeq(tokens, start, indent) {
  const arr = [];
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.indent !== indent || !tok.dash) break;
    i++;
    if (tok.body === '') {
      if (i < tokens.length && tokens[i].indent > indent) {
        const r = buildBlock(tokens, i, tokens[i].indent);
        arr.push(r.value);
        i = r.next;
      } else {
        arr.push(null);
      }
    } else if (tok.key !== null) {
      // `- id: x` opens a mapping at the column of `i` in `id`; continuation keys align there.
      const itemIndent = tok.itemIndent;
      let j = i;
      while (j < tokens.length && tokens[j].indent >= itemIndent) j++;
      const head = {
        line: tok.line,
        indent: itemIndent,
        content: tok.body,
        dash: false,
        itemIndent,
        body: tok.body,
        key: tok.key,
        value: tok.value
      };
      const sub = [head].concat(tokens.slice(i, j));
      arr.push(buildMap(sub, 0, itemIndent).value);
      i = j;
    } else {
      arr.push(parseValue(tok.body, tok.line));
    }
  }
  return { value: arr, next: i };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function parseYamlLite(text) {
  const tokens = tokenise(text);
  if (tokens.length === 0) return null;
  return buildBlock(tokens, 0, tokens[0].indent).value;
}

module.exports = { parseYamlLite, YamlLiteError };
