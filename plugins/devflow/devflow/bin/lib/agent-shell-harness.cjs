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

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { pluginVersion } = require('./helpers.cjs');

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

// Heredoc openers on a line, in order: <<EOF, <<-EOF, <<'EOF', <<"EOF". `<<<` (a
// here-STRING) is excluded. Known limit: an opener that appears inside quotes
// (`echo "a <<EOF b"`) is still counted — line-based splitting, not a bash parser.
const HEREDOC_RE = /<<(?!<)-?\s*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z_][A-Za-z0-9_]*))/g;

function heredocDelimiters(line) {
  const out = [];
  HEREDOC_RE.lastIndex = 0;
  let m;
  while ((m = HEREDOC_RE.exec(line)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// Finds the offset of a TRAILING comment: the first `#` that is outside single/double
// quotes and either starts the text or follows whitespace. Deliberately a small scanner,
// not a bash parser — its documented limit is that a `#` inside a heredoc BODY would be
// misread, which is why heredoc calls skip this extraction entirely.
function trailingCommentIndex(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\\') { i++; continue; }
    if (ch === '\'' || ch === '"') { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) return i;
  }
  return -1;
}

// A line ending in an ODD number of backslashes continues onto the next line — `foo \\`
// (an escaped backslash) does not.
const CONTINUES_RE = /(^|[^\\])(\\\\)*\\$/;

// ─── Call splitting ───────────────────────────────────────────────────────────────────

/**
 * splitCalls(block[, opts]) -> [{index, line, call, annotations}]
 *
 * Splits a bash block into the calls the Bash tool would actually make: ONE logical
 * command per call. Line-based, deliberately — a bash parser is a project, not a task,
 * and the model is "one line, one call".
 *
 * `block` is either the raw body string, or an `extractBashBlocks` block object
 * ({body, startLine}); with the object form `line` is absolute in the markdown file,
 * with the string form it is 1-based within the block.
 */
function splitCalls(block, opts = {}) {
  const body = typeof block === 'string' ? block : String(block && block.body || '');
  const base = opts.startLine != null
    ? opts.startLine
    : (typeof block === 'object' && block && block.startLine != null ? block.startLine : 0);

  const lines = body.split('\n');
  const calls = [];
  let pending = null;   // an open backslash continuation: {startIdx, parts}

  let annotations = [];  // full-line comments awaiting the call they annotate

  const flush = () => {
    const call = pending.parts.map(p => p.replace(/\s+$/, '')).join('\n').trim();
    // A trailing comment stays IN the call text (bash ignores it) and is ALSO recorded.
    const ci = pending.heredoc ? -1 : trailingCommentIndex(call);
    if (ci !== -1) annotations.push(call.slice(ci).trim());
    calls.push({ index: calls.length, line: base + pending.startIdx + 1, call, annotations });
    annotations = [];
    pending = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Inside a continuation or a heredoc: every line belongs to the call that opened it,
    // blank or commented or not.
    if (pending) {
      pending.parts.push(raw);
      if (pending.heredocs.length && raw.trim() === pending.heredocs[0]) pending.heredocs.shift();
      if (!pending.heredocs.length && !CONTINUES_RE.test(raw)) flush();
      continue;
    }

    if (raw.trim() === '') continue;                  // blank lines are separators, not calls
    // A full-line comment is an ANNOTATION on the NEXT call, never a call of its own.
    if (/^\s*#/.test(raw)) { annotations.push(raw.trim()); continue; }

    const heredocs = heredocDelimiters(raw);
    pending = { startIdx: i, parts: [raw], heredocs, heredoc: heredocs.length > 0 };
    if (!heredocs.length && !CONTINUES_RE.test(raw)) flush();
  }

  // An unterminated continuation at end-of-block is still one call, not a dropped one.
  if (pending) flush();

  return calls;
}

// ─── Containment ──────────────────────────────────────────────────────────────────────

// Absolute paths mentioned in a call's TEXT. Deliberately conservative: a `/…` token at
// the start, or after whitespace or a shell delimiter. `//…` is skipped so `https://x`
// is not read as a path.
const ABS_PATH_RE = /(?:^|[\s='"(\[{<>|&;`])(\/(?!\/)[^\s'"`;|&()\[\]{}<>]*)/g;

// Read-only system prefixes a contained call may legitimately name: interpreters, system
// binaries, /dev/null. Everything else outside the scratch root is a containment finding.
const SYSTEM_PREFIXES = ['/bin/', '/sbin/', '/usr/', '/opt/', '/etc/', '/dev/', '/Library/', '/System/', '/Applications/'];

function absolutePathsIn(text) {
  const out = [];
  ABS_PATH_RE.lastIndex = 0;
  let m;
  while ((m = ABS_PATH_RE.exec(text)) !== null) out.push(m[1]);
  return out;
}

// Containment is TWO mechanisms, and the SUMMARY states both plus their limits:
//   (1) HOME and TMPDIR are set inside the scratch root, so tooling that writes to a
//       cache or a temp file stays inside it;
//   (2) this static scan of the call TEXT, which blocks the call before it runs.
// What it cannot catch, stated plainly: a path BUILT at runtime (`d=$(echo /tmp); touch
// "$d/x"`), a relative escape (`../../x`), a path reached through a symlink inside the
// root, and anything a process it spawns does on its own. A stated limit is a limit; an
// unstated one is a false green.
function containmentFindings(callText, root, allowOutside) {
  const allowed = SYSTEM_PREFIXES.concat(allowOutside || []);
  const offenders = absolutePathsIn(callText).filter(p => {
    if (p === root || p.startsWith(root + '/')) return false;
    return !allowed.some(prefix => p === prefix.replace(/\/$/, '') || p.startsWith(prefix));
  });
  return [...new Set(offenders)];
}

// ─── The runtime model ────────────────────────────────────────────────────────────────

// Every call gets its own 10s budget. An interactive command must become a FINDING, not
// a hang — a harness that can hang in CI is a harness that gets deleted.
const DEFAULT_TIMEOUT_MS = 10000;

// The scratch root is embedded literally into the per-call script (the trap and the
// stderr redirect). Refuse anything that could break out of that quoting rather than
// building a half-safe escaper.
const UNSAFE_ROOT_RE = /['"$`\\\n]/;

// The PATH every call runs with is HERMETIC by default: the caller's stub directory,
// the directory of the running node (so `#!/usr/bin/env node` shims resolve), and the
// POSIX system directories — and NOT `process.env.PATH`.
//
// This is not tidiness. A developer box here has real `flutter`, `maestro` and `jq` on
// PATH and the CI runner has none of them; inheriting the caller's PATH would mean the
// harness silently exercised a real 40-second toolchain locally and a stub in CI, and a
// MISSING stub would fall through to the real binary instead of being reported. Same
// failure class as `path-filtered-ci-hides-red`: a green that never ran what it claims.
// `opts.inheritPath: true` opts back in, explicitly, for a caller that wants the host.
const SYSTEM_PATH = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

function buildSearchPath(opts) {
  if (opts.inheritPath) {
    return [opts.pathPrepend, process.env.PATH].filter(Boolean).join(path.delimiter);
  }
  return [opts.pathPrepend, path.dirname(process.execPath)]
    .concat(SYSTEM_PATH)
    .filter(Boolean)
    .join(path.delimiter);
}

/**
 * runSection(calls, {root, pathPrepend, timeout}) -> {ok, root, calls:[…], findings:[…]}
 *
 * Reproduces the Bash tool, and nothing else:
 *   - ONE `execFileSync('bash', ['-c', …])` per call — never one shell for the block,
 *     which would let variables persist and make the unset-variable case untestable;
 *   - the working directory is threaded FORWARD from call to call, and a call that moved
 *     it is a FINDING — reported, not corrected, or the bare-`cd` case is unfalsifiable;
 *   - the environment is rebuilt FRESH for every call from an explicit allow-list
 *     ({PATH, HOME, TMPDIR}), never `process.env` and never a shared object.
 */
function runSection(calls, opts = {}) {
  if (!opts || !opts.root) {
    throw new Error('runSection requires opts.root — every run is confined to a scratch root');
  }
  // realpath: bash's $PWD is the PHYSICAL path, so on macOS (/var -> /private/var) an
  // un-resolved root would make every single call look like a cwd leak.
  const root = fs.realpathSync(opts.root);
  if (UNSAFE_ROOT_RE.test(root)) {
    throw new Error(`scratch root contains characters the harness will not embed in a script: ${root}`);
  }

  const home = path.join(root, '.home');
  const tmpdir = path.join(root, '.tmp');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(tmpdir, { recursive: true });

  const searchPath = buildSearchPath(opts);
  const cwdFile = path.join(root, '.cwd');
  const errFile = path.join(root, '.stderr');
  const timeout = opts.timeout == null ? DEFAULT_TIMEOUT_MS : opts.timeout;

  // The initial working directory. Defaults to the scratch root; `opts.cwd` lets a
  // caller start a section from a SUBDIRECTORY, which is how E2 proves that evidence
  // paths absolute from `$REPO_ROOT` land in the same place from any starting cwd
  // rather than only from the one the prose's author had in mind.
  let cwd = opts.cwd ? fs.realpathSync(opts.cwd) : root;
  const results = [];

  for (const raw of calls) {
    const entry = typeof raw === 'string' ? { call: raw } : (raw || {});
    const callText = String(entry.call == null ? '' : entry.call);
    const expectedStatus = entry.expectedStatus == null ? 0 : entry.expectedStatus;

    const rec = {
      index: results.length,
      line: entry.line == null ? null : entry.line,
      call: callText,
      annotations: entry.annotations || [],
      cwd_before: cwd,
      cwd_after: cwd,
      cwd_captured: false,
      status: null,
      expected_status: expectedStatus,
      stdout: '',
      stderr: '',
      findings: [],
    };

    // FRESH env object per call, built from an allow-list. Reuse one object here and a
    // call that exports into it would silently make the unset-variable case pass — the
    // harness would bless exactly the prose bug it exists to catch.
    const env = { PATH: searchPath, HOME: home, TMPDIR: tmpdir };

    // Containment is a PRE-check: an offending call is blocked, not executed and then
    // regretted. A harness that will one day run in CI against a file someone just
    // edited must not be the thing that writes outside its own scratch root.
    const offenders = containmentFindings(callText, root, opts.allowOutside);
    if (offenders.length) {
      for (const p of offenders) {
        rec.findings.push({
          type: 'containment',
          index: rec.index,
          line: rec.line,
          call: callText,
          path: p,
          message:
            `call ${rec.index + 1} names an absolute path outside the scratch root: ${p} ` +
            `(root=${root}). The call was BLOCKED and not executed: \`${callText}\``,
        });
      }
      rec.status = 'blocked';
      results.push(rec);
      continue;   // cwd is unchanged: a blocked call moves nothing
    }

    try { fs.unlinkSync(cwdFile); } catch { /* first call, or already gone */ }
    try { fs.unlinkSync(errFile); } catch { /* ditto */ }

    // `trap … EXIT` rather than an appended `; pwd`: the trap still fires when the call
    // itself calls `exit`, and $PWD goes to a SIDE FILE so the call's own stdout is not
    // polluted. stderr is redirected to a second side file so it is captured on the
    // success path too, not only off a thrown error.
    const script = [
      `exec 2> "${errFile}"`,
      `trap 'printf "%s" "$PWD" > "${cwdFile}"' EXIT`,
      // `set -u` is what makes the environment half of the model OBSERVABLE: a variable
      // a previous call assigned is not merely empty here, it is an error. PATH, HOME
      // and TMPDIR are set, so nothing legitimate trips on it. If real agent prose
      // trips it, that is a FINDING about the prose — which is the entire point.
      'set -u',
      callText,
      '',
    ].join('\n');

    try {
      rec.stdout = execFileSync('bash', ['-c', script], {
        cwd,
        env,
        encoding: 'utf-8',
        timeout,
        stdio: ['ignore', 'pipe', 'pipe'],
      }) || '';
      rec.status = 0;
    } catch (err) {
      rec.stdout = (err.stdout == null ? '' : err.stdout).toString();
      rec.stderr = (err.stderr == null ? '' : err.stderr).toString();
      if (err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
        rec.status = 'timeout';
        rec.findings.push({
          type: 'timeout',
          index: rec.index,
          line: rec.line,
          call: callText,
          message: `call ${rec.index + 1} did not finish within ${timeout}ms: \`${callText}\``,
        });
      } else {
        rec.status = err.status == null ? 1 : err.status;
      }
    }

    // A syntax error is detected before `exec 2>` ever runs, so the pipe still wins then.
    if (fs.existsSync(errFile)) {
      const fromFile = fs.readFileSync(errFile, 'utf-8');
      if (fromFile) rec.stderr = fromFile;
    }

    // Read the cwd side file even when the call FAILED: a failing call still moved (or
    // did not move) the directory, and the bare-`cd` case is a call that SUCCEEDS.
    if (fs.existsSync(cwdFile)) {
      rec.cwd_after = fs.readFileSync(cwdFile, 'utf-8').trim() || rec.cwd_before;
      rec.cwd_captured = true;
    }

    if (rec.cwd_after !== rec.cwd_before) {
      rec.findings.push({
        type: 'cwd-leak',
        index: rec.index,
        line: rec.line,
        call: callText,
        cwd_before: rec.cwd_before,
        cwd_after: rec.cwd_after,
        message:
          `call ${rec.index + 1} changed the persisted working directory: \`${callText}\` — ` +
          `cwd_before=${rec.cwd_before} cwd_after=${rec.cwd_after}. ` +
          'The Bash tool carries this into every later call; use `( cd DIR && … )` instead.',
      });
    }

    // bash's own diagnosis, not the harness guessing: `set -u` turns a read of a
    // variable a PREVIOUS call assigned into a hard error naming the variable.
    const unbound = /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*): unbound variable/m.exec(rec.stderr || '');
    if (unbound) {
      rec.findings.push({
        type: 'unset-variable',
        index: rec.index,
        line: rec.line,
        call: callText,
        variable: unbound[1],
        message:
          `call ${rec.index + 1} read \`$${unbound[1]}\`, which no longer exists: ` +
          'shell variables do NOT persist between Bash calls. ' +
          `Re-derive it inside this call. Offending call: \`${callText}\``,
      });
    }

    // `command not found` is a MISSING, not a failure: the prose was never exercised, so
    // reporting it as a plain non-zero exit would let an absent stub read as "the prose
    // is wrong" — or, with an expect-exit annotation, as a pass.
    const notFound = /(?:^|[\s:])([^\s:/]+): command not found/m.exec(rec.stderr || '');
    if (rec.status === 127 && notFound) {
      rec.findings.push({
        type: 'missing-binary',
        index: rec.index,
        line: rec.line,
        call: callText,
        binary: notFound[1],
        message:
          `call ${rec.index + 1} could not run: \`${notFound[1]}\` is not on PATH. ` +
          `The call was NOT exercised, so this is MISSING, never a pass: \`${callText}\``,
      });
    } else if (rec.status !== expectedStatus && rec.status !== 'timeout') {
      rec.findings.push({
        type: 'nonzero-status',
        index: rec.index,
        line: rec.line,
        call: callText,
        status: rec.status,
        message:
          `call ${rec.index + 1} exited ${rec.status} (expected ${expectedStatus}): ` +
          `\`${callText}\`${rec.stderr ? ` — ${rec.stderr.trim()}` : ''}`,
      });
    }

    // Thread cwd FORWARD even after flagging it. The harness reports the model; it does
    // not correct it. Resetting to `root` here would make the bare-`cd` case unfalsifiable.
    cwd = rec.cwd_after;
    results.push(rec);
  }

  const findings = results.flatMap(r => r.findings);
  return { ok: findings.length === 0, root, calls: results, findings, missing: missingReason(results) };
}

// A section is MISSING — never `pass` — whenever a call did not actually execute: a stub
// binary was absent, or the call was declared un-runnable. The reason is a single string
// so the CI job can print it on one line; `findings[]` carries the per-call detail.
function missingReason(results) {
  const reasons = [];
  for (const r of results) {
    for (const f of r.findings) {
      if (f.type === 'missing-binary') reasons.push(`call ${r.index + 1}: missing binary \`${f.binary}\``);
    }
  }
  return reasons.length ? reasons.join('; ') : null;
}

// ─── The public entry point ───────────────────────────────────────────────────────────

/**
 * checkSection(mdPath, section, opts) ->
 *   {
 *     ok:             boolean — true ONLY when a section was found, had bash, ran, and
 *                     produced zero findings. Never true for anything that did not run.
 *     section:        the matched heading text (or the requested string when not found)
 *     missing:        null when the section ran; otherwise the REASON it did not
 *     calls:          [{index, line, call, annotations, cwd_before, cwd_after,
 *                       status, stdout, stderr, findings[]}] — EVERY call, passing ones
 *                     included, so a reviewer can see what actually ran
 *     findings:       every call's findings, flattened, in order
 *     engine_version: the running engine, so evidence from a stale mirror is detectable
 *     root:           the scratch root the section ran in
 *   }
 *
 * opts: {root, pathPrepend, timeout, allowOutside, keepRoot}. Without `root` a scratch
 * root is created and removed again; pass one to inspect what the section wrote.
 */
function checkSection(mdPath, section, opts = {}) {
  const engine_version = pluginVersion();
  const md = fs.readFileSync(mdPath, 'utf-8');
  const extracted = extractBashBlocks(md, section);

  if (!extracted.ok) {
    // Honest output: "the section your prose names is gone" and "the section is there
    // but has nothing to run" are both MISSING with a reason — neither is a pass.
    return {
      ok: false,
      section: extracted.section || section,
      missing: extracted.missing || extracted.error,
      calls: [],
      findings: [],
      engine_version,
      root: null,
      path: mdPath,
    };
  }

  const calls = extracted.blocks.flatMap(block => splitCalls(block));
  if (calls.length === 0) {
    return {
      ok: false,
      section: extracted.section,
      missing: 'bash blocks contained no executable calls',
      calls: [],
      findings: [],
      engine_version,
      root: null,
      path: mdPath,
    };
  }
  // splitCalls numbers each block independently; renumber across the whole section so
  // `index` is the position in the run, which is what a finding cites.
  calls.forEach((c, i) => { c.index = i; });

  const ownRoot = !opts.root;
  const root = opts.root || fs.mkdtempSync(path.join(os.tmpdir(), 'agent-shell-harness-'));
  try {
    const run = runSection(calls, { ...opts, root });
    return {
      ok: run.ok,
      section: extracted.section,
      missing: run.missing,
      calls: run.calls,
      findings: run.findings,
      engine_version,
      root: run.root,
      path: mdPath,
    };
  } finally {
    if (ownRoot && !opts.keepRoot) fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = {
  extractBashBlocks,
  normalizeHeading,
  splitCalls,
  runSection,
  checkSection,
};
