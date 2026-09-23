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

// ─── Where a scalar begins ────────────────────────────────────────────────────
//
// THE rule the whole prose-safety story rests on, stated once and read by three callers: the
// quote masker, the anchor/alias refusal, and nothing else may re-derive it.
//
// A Surface Spec is prose-heavy on purpose — `does`, `rule`, `design_read`, `reason_shown` and
// every `must_show` entry are sentences a human wrote. In a sentence, `'`, `&` and `*` are
// ordinary characters: `Shows the user's projects`, `Tools &settings`, `rating *stars* shown`.
// In YAML they are structural ONLY where a scalar begins. Scanning for them "anywhere after
// whitespace" is what made three separate defects out of one mistake, and the fix for all
// three is this predicate.
//
// A scalar begins at index `i` of `s` when, skipping spaces backwards:
//   * nothing precedes it (the start of the region, or only indentation); or
//   * the previous character opens a flow collection (`[`, `{`); or
//   * the previous character is a `,` separator AND we are inside a flow collection; or
//   * the previous character is a `:` separator.
//
// The depth condition on `,` is not decoration: at depth 0 a comma is prose (`Shows tags,
// *starred* first`), inside `[…]`/`{…}` it is a real separator. `depth` is the caller's
// bracket depth at `i`.
//
// `:` is the one asymmetry between the two callers, and `afterColon` names it. At depth 0 a
// colon is the KEY SEPARATOR, so the masker must treat `key: "value"` as opening a scalar —
// it passes `true`. For the anchor/alias refusal a second colon at depth 0 is prose (`does:
// note: &c`), so it passes `false` and only counts a colon inside a flow collection.
function atScalarHead(s, i, depth, from, afterColon) {
  const floor = from || 0;
  let j = i - 1;
  while (j >= floor && (s[j] === ' ' || s[j] === '\t')) j--;
  if (j < floor) return true;
  const p = s[j];
  if (p === '[' || p === '{') return true;
  if (p === ',' && depth > 0) return true;
  if (p === ':' && (depth > 0 || afterColon)) return true;
  return false;
}

// ─── Quote masking ────────────────────────────────────────────────────────────
//
// Everything that scans for a structural character — the `: ` key separator, a `,` between
// flow elements, a matching `]`/`}`, a ` #` comment — scans the MASKED copy of the line, in
// which the contents of quoted strings are blanked to spaces. Slices are then taken from the
// ORIGINAL, so `title: "{project.name}: overview # 1"` keeps its colon and its hash.
// Same length in, same length out, so indices carry over unchanged.
//
// TWO rules keep prose out of this. A quote opens a quoted scalar only where a scalar can
// BEGIN (see `atScalarHead`) — so the apostrophe in `the user's projects` is a character, not
// an opener. And an opener with no closing quote on the line is RE-READ as a character rather
// than thrown on: the throw belongs to whoever actually tries to decode the scalar
// (`readQuoted`, via `parseScalar`), which still reports `unterminated …-quoted string` with
// the right line for a value that really is a broken quoted scalar. Masking runs over the whole
// line INCLUDING its trailing comment, so without the re-read a lone `'` in `# the widget's
// identifier` would fail the file — a documented authoring trap in the §4.2 transcription.
function maskQuoted(s) {
  let out = '';
  let depth = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '[' || c === '{') { out += c; depth++; i++; continue; }
    if (c === ']' || c === '}') { out += c; depth--; i++; continue; }
    if ((c !== '"' && c !== "'") || !atScalarHead(s, i, depth, 0, true)) { out += c; i++; continue; }

    const quote = c;
    const body = [];
    let j = i + 1;
    let closed = false;
    while (j < s.length) {
      if (quote === '"' && s[j] === '\\') { body.push('  '); j += 2; continue; }
      if (s[j] === quote) {
        if (quote === "'" && s[j + 1] === "'") { body.push('  '); j += 2; continue; }
        closed = true;
        break;
      }
      body.push(' ');
      j++;
    }
    if (!closed) { out += quote; i++; continue; }
    out += quote + body.join('') + quote;
    i = j + 1;
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

// A key is taken verbatim unless it is quoted, in which case it is the quoted contents:
// `"a b": 1` is the key 'a b', not '"a b"'. Block and flow mappings share this so the two
// spellings of the same key can never disagree.
function parseKey(rawKey, line) {
  const raw = rawKey.trim();
  const quote = raw.charAt(0);
  if (quote === '"' || quote === "'") return parseScalar(raw, line);
  return raw;
}

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
  const masked = maskQuoted(body);
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
    key: keyEnd < 0 ? null : parseKey(body.slice(0, keyEnd), line),
    value: body.slice(start, end).replace(/\s+$/, ''),
    // The masked, comment-free code region of this line. Every refusal pattern is matched
    // against THIS, so `title: "a & b"` is not mistaken for an anchor and a `# &x` comment
    // is not mistaken for anything at all.
    code: masked.slice(0, end),
    // Where the VALUE starts inside `code`. The anchor/alias refusal needs it: `&`/`*` are
    // structural at the head of a value and ordinary characters anywhere else in one.
    valueStart: start
  };
}

function splitLine(content, indent, line) {
  let dash = false;
  let off = 0;
  const m = /^-( +|$)/.exec(content);
  if (m) { dash = true; off = m[0].length; }
  const body = content.slice(off);
  if (dash && /^-( |$)/.test(body)) {
    throw new YamlLiteError(
      'a nested inline block sequence (`- - x`) is not supported by yaml-lite; '
        + 'indent the inner list on its own lines, or write it as a flow list (`- [x, y]`)',
      line
    );
  }
  const kv = splitKeyValue(body, line);
  // A block-list item `- id: x` opens a mapping whose column is the column of the character
  // AFTER `- `, not the column of `-`. Continuation keys align to that column.
  return {
    dash,
    itemIndent: indent + off,
    body,
    key: kv.key,
    value: kv.value,
    code: kv.code,
    valueStart: kv.valueStart
  };
}

// ─── Refusals ─────────────────────────────────────────────────────────────────
//
// Matched against the masked, comment-free code region of a line, in source order, so the
// FIRST offending line is the one reported. When the choice is between "support it" and
// "reject it with a clear message", reject: a construct that is neither supported nor refused
// is the one outcome that makes a spec quietly wrong instead of loudly broken.

const MERGE_KEY_RE = /^<<\s*:/;
const NAME_CHAR_RE = /[A-Za-z0-9_-]/;
const BLOCK_SCALAR_RE = /:\s*[|>][-+0-9]*\s*$/;
const EXPLICIT_KEY_RE = /^\?(\s|$)/;

/**
 * `'anchor'` / `'alias'` when the VALUE region of this line really declares one, else null.
 *
 * `&` and `*` are structural only where a scalar begins (`atScalarHead`) — `x: &base`,
 * `- *item`, `[a, *b]`, `{k: *v}`. Everywhere else in a value they are characters a human
 * typed: `Tools &settings`, `rating *stars* shown`, `Shows tags, *starred* first`. A pattern
 * that fired on "after any whitespace" refused all three, and did it on the one field class —
 * prose — the Surface Spec is made of. (It also MISSED `[*a]`, where no whitespace precedes
 * the `*`; the head rule catches that and the old one never did.)
 *
 * The scan starts at `valueStart`, so a key is never examined, and it tracks bracket depth so
 * `,` and `:` count as separators inside a flow collection and as prose outside one.
 */
function anchorOrAlias(code, valueStart) {
  let depth = 0;
  for (let i = valueStart; i < code.length; i++) {
    const c = code[i];
    if (c === '[' || c === '{') { depth++; continue; }
    if (c === ']' || c === '}') { depth--; continue; }
    if (c !== '&' && c !== '*') continue;
    if (!NAME_CHAR_RE.test(code[i + 1] || '')) continue;
    if (!atScalarHead(code, i, depth, valueStart, false)) continue;
    return c === '&' ? 'anchor' : 'alias';
  }
  return null;
}

/**
 * True when this line's VALUE region really declares a tag (`!Thing`, `!!str`), else false.
 *
 * Same rule, and the same helper, as `anchorOrAlias` above — and for the same reason. The
 * old `TAG_RE = /(^|\s)!!?[A-Za-z]/` fired after ANY whitespace anywhere in a value, so it
 * refused `does: Shows the !important badge`, `rule: names ellipsize!` and
 * `must_show: [Saved!, Done!]`: ordinary prose, on the field class the Surface Spec is
 * mostly made of. Quoting was the only workaround and nothing said so — the message named
 * YAML tags, which is not what the author had typed.
 *
 * A tag is structural only where a scalar BEGINS: `when: !!str 1`, `- !Thing x`, `[!Thing]`.
 * Anywhere else in a value, `!` is a character. `atScalarHead` already encodes exactly that
 * boundary, so this shares it rather than re-deriving it — one definition of "a scalar
 * begins here" for quotes, anchors, aliases and tags alike.
 */
function tagAtHead(code, valueStart) {
  let depth = 0;
  for (let i = valueStart; i < code.length; i++) {
    const c = code[i];
    if (c === '[' || c === '{') { depth++; continue; }
    if (c === ']' || c === '}') { depth--; continue; }
    if (c !== '!') continue;
    const after = code[i + 1] === '!' ? code[i + 2] : code[i + 1];
    if (!/[A-Za-z]/.test(after || '')) continue;
    if (!atScalarHead(code, i, depth, valueStart, false)) continue;
    return true;
  }
  return false;
}

function refuse(code, line, valueStart) {
  if (EXPLICIT_KEY_RE.test(code.trim())) {
    throw new YamlLiteError(
      'an explicit key (`? key` / `: value`) is not supported by yaml-lite; use `key: value`',
      line
    );
  }
  if (MERGE_KEY_RE.test(code.trim())) {
    throw new YamlLiteError(
      'the merge key `<<:` is not supported by yaml-lite; write the merged keys out in full',
      line
    );
  }
  const node = anchorOrAlias(code, valueStart || 0);
  if (node === 'anchor') {
    throw new YamlLiteError(
      'an anchor (`&name`) is not supported by yaml-lite; write the value out in full',
      line
    );
  }
  if (node === 'alias') {
    throw new YamlLiteError(
      'an alias (`*name`) is not supported by yaml-lite; write the value out in full',
      line
    );
  }
  if (BLOCK_SCALAR_RE.test(code)) {
    throw new YamlLiteError(
      'a block scalar (`|` or `>`) is not supported by yaml-lite; use a quoted single-line string',
      line
    );
  }
  if (tagAtHead(code, valueStart || 0)) {
    throw new YamlLiteError(
      'a tag (`!` / `!!`) is not supported by yaml-lite; scalars are typed by their spelling, not by a tag',
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
    if (trimmed === '---' || trimmed === '...') {
      throw new YamlLiteError(
        'a document marker (`---` / `...`) is not supported by yaml-lite; it parses one '
          + 'document, and front-matter fences are stripped before it is called',
        i + 1
      );
    }
    if (/^ *\t/.test(raw)) {
      throw new YamlLiteError(
        'tab indentation is not supported by yaml-lite; indent with two spaces per level',
        i + 1
      );
    }
    const indent = raw.length - raw.replace(/^ +/, '').length;
    const content = raw.slice(indent).replace(/\s+$/, '');
    const parsed = splitLine(content, indent, i + 1);
    refuse(parsed.code, i + 1, parsed.valueStart);
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
  const masked = maskQuoted(el);
  let depth = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ':' && depth === 0 && (i + 1 >= masked.length || masked[i + 1] === ' ')) {
      return { key: parseKey(el.slice(0, i), line), value: el.slice(i + 1).trim() };
    }
  }
  throw new YamlLiteError('expected `key: value` inside a flow mapping', line);
}

// A flow SEQUENCE element carrying an unbracketed `key: value` is YAML's implicit single-pair
// map. Real YAML accepts it; yaml-lite does not, because the two readings of
// `[pointer, keyboard: [Enter, Space]]` — three elements or two — are both plausible to a human
// skimming the spec. The message names the explicit form so the fix is mechanical.
function refuseImplicitPair(el, line) {
  const t = el.trim();
  if (t === '') return;
  const masked = maskQuoted(t);
  let depth = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ':' && depth === 0 && (i + 1 >= masked.length || masked[i + 1] === ' ')) {
      throw new YamlLiteError(
        'an implicit single-pair map inside a flow sequence is not supported by yaml-lite; '
          + 'write it as an explicit flow map, e.g. [pointer, {keyboard: [Enter, Space]}]',
        line
      );
    }
  }
}

function parseFlowValue(text, line) {
  const t = text.trim();
  const head = t.charAt(0);
  if (head !== '[' && head !== '{') return parseScalar(t, line);

  const masked = maskQuoted(t);
  const close = matchingClose(masked, line);
  if (close !== t.length - 1) throw new YamlLiteError('unexpected content after a flow collection', line);
  const inner = t.slice(1, close);
  const innerMasked = masked.slice(1, close);

  if (head === '[') {
    return splitTopLevel(inner, innerMasked).map((el) => {
      refuseImplicitPair(el, line);
      return parseFlowValue(el, line);
    });
  }

  const obj = {};
  const seen = new Set();
  for (const el of splitTopLevel(inner, innerMasked)) {
    const pair = splitFlowPair(el.trim(), line);
    if (seen.has(pair.key)) {
      throw new YamlLiteError(`duplicate key \`${pair.key}\` in the same flow mapping`, line);
    }
    seen.add(pair.key);
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
  // Duplicate keys throw. Taking the last one is JS object semantics, not a decision — and it
  // would make an invariant like "a state declares exactly one `does`" unreachable downstream.
  const seen = new Set();
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    // A line indented deeper than this mapping, reached after its own block closed, sits at a
    // column no open block occupies. Refuse rather than guess which block it meant to join.
    if (tok.indent > indent) {
      throw new YamlLiteError('indentation does not match any open block', tok.line);
    }
    if (tok.indent !== indent || tok.dash || tok.key === null) break;
    if (seen.has(tok.key)) {
      throw new YamlLiteError(`duplicate key \`${tok.key}\` in the same mapping`, tok.line);
    }
    seen.add(tok.key);
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
      // `tok.value`, NOT `tok.body`. `splitKeyValue` has already stripped this item's trailing
      // comment off the MASKED copy — the only place that can be done safely, since `- "#1
      // priority"` must keep its hash. Pushing the raw body instead put the comment inside the
      // item: `- Enter  # the keyboard key` became the string "Enter  # the keyboard key",
      // which in a `content.must_show` list is an assertion no render can ever satisfy — and it
      // fails at PROBE time, against a screenshot, rather than at spec time with a line number.
      // (The flow case was worse still: `- [a, b] # why` threw `unexpected content after a flow
      // collection`, refusing legal YAML outright.)
      arr.push(parseValue(tok.value, tok.line));
    }
  }
  return { value: arr, next: i };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function parseYamlLite(text) {
  const tokens = tokenise(text);
  if (tokens.length === 0) return null;
  const first = tokens[0];
  if (!first.dash && first.key === null) {
    throw new YamlLiteError(
      'the top level of a yaml-lite document must be a block mapping (`key: value`) or a '
        + 'block sequence (`- item`)',
      first.line
    );
  }
  const built = buildBlock(tokens, 0, tokens[0].indent);
  if (built.next < tokens.length) {
    throw new YamlLiteError('indentation does not match any open block', tokens[built.next].line);
  }
  return built.value;
}

module.exports = { parseYamlLite, YamlLiteError };
