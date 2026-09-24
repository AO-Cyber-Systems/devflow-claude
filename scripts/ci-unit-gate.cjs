#!/usr/bin/env node
'use strict';

/**
 * ci-unit-gate — the CI gate for `npm test` (issue #89).
 *
 * Background. Until this gate landed, `.github/workflows/` ran exactly one test
 * file (`agent-shell-harness.test.cjs`). The 3,248-test unit suite was never
 * executed by CI, so every green tick on every PR merged into this repo said
 * nothing about it. That is the precise failure shape this repo exists to
 * eliminate: a check that reports success without having run.
 *
 * What this script guarantees, in order:
 *
 *   1. THE SUITE IT RUNS IS THE SUITE `npm test` RUNS. The file patterns are
 *      read out of package.json `scripts.test` rather than restated here, so the
 *      gate cannot drift away from the developer-facing command. If that script
 *      stops looking like `node --test <patterns...>`, the gate fails loudly
 *      instead of guessing.
 *
 *   2. IT CANNOT PASS BY NOT RUNNING. `node --test` exits 0 when its patterns
 *      match zero files — a green tick over an empty run. The gate therefore
 *      asserts floors on both the number of tests and the number of distinct
 *      test files observed, and fails if the reporter produced no output at all.
 *      The test floor counts EXECUTED tests: a skipped test did not run, so it
 *      cannot help a run clear the bar that proves the run happened.
 *
 *   2b. IT CANNOT BE MORE OPTIMISTIC THAN THE RUNNER. The junit XML is not
 *      node's verdict; the exit code is, and they can disagree. A describe()-
 *      scoped `after()` hook that throws makes node 25 exit 1 while writing
 *      failures="0" and no <failure> element at all. A non-zero exit with a
 *      clean report is therefore a FAIL in its own right. Conversely a `{ todo }`
 *      test that genuinely fails emits <skipped type="todo"> AND <failure> and
 *      exits 0 — so the report is read for failures whether or not it also says
 *      skipped. Neither channel is trusted alone.
 *
 *   3. THE KNOWN-FAILURE LIST CAN ONLY SHRINK. Failures are matched against
 *      `.github/known-test-failures.json` by `file::test name`. A failure that
 *      is not on the list fails the gate (regression). An entry on the list that
 *      *passed* also fails the gate, with instructions to delete it — so the
 *      list is a ratchet, not a parking lot. Every entry must carry a reason
 *      naming a mechanism; the word "flaky" is rejected outright, because
 *      "flaky" with no mechanism is how a real regression hides.
 *      A SKIPPED test is neither a pass nor a fail and is read as neither: its
 *      entry is KEPT and reported, because nothing was learned about it. Reading
 *      a skip as a pass is not hypothetical — on 2026-09-23 two runs of THIS
 *      workflow on the same SHA, four seconds apart, saw 31 and 34 skips, and
 *      the second told a human to delete the PW-9 quarantine for a test that had
 *      failed in the first.
 *
 *   3b. A QUARANTINE HAS A METER AND THE METER HAS A MAXIMUM. `nondeterministic`
 *      buys an exit from the ratchet, priced at a tracking issue and an expiry
 *      no more than MAX_QUARANTINE_DAYS out. An expiry that merely parses is not
 *      a ceiling: 2099-01-01 parses.
 *
 * Usage:  node scripts/ci-unit-gate.cjs
 * Exits 0 only when every check above passes.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

// ─── Floors ──────────────────────────────────────────────────────────────────
// These are the "it cannot pass by not running" guard. They are deliberately
// below the observed counts (3,248 tests across 109 files as of 2026-09-23) so
// ordinary churn does not trip them, but far above zero so a glob that matches
// nothing — or a `scripts.test` edited down to one file — fails the job.
// Raise them when the suite grows; never lower them to make a run pass.
const MIN_TESTS = 3000;
const MIN_TEST_FILES = 100;

const ALLOWLIST_PATH = path.join(REPO_ROOT, '.github', 'known-test-failures.json');

// A reason that contains any of these, and nothing else of substance, is not a
// reason. Naming the mechanism is the entire point of the list.
const BANNED_REASON_WORDS = /\b(flak\w*|intermittent\w*|sometimes\s+fails|unstable)\b/i;
const MIN_REASON_CHARS = 40;

// The ceiling on a quarantine. `nondeterministic: true` buys an entry an exit
// from the shrink-only ratchet, and an "expires" that merely *parses* prices
// that at nothing: `2099-01-01` parses, and a licence that outlives everyone who
// reviewed it is a permanent exemption wearing a date. Two quarters is the
// outer edge of "we are fixing this"; past that it is not a quarantine, it is a
// decision to stop testing the thing, which belongs in a PR and not in a date
// field. Measured from evaluation time, so it binds when the date is WRITTEN and
// never turns a previously-valid entry red as the clock moves.
const MAX_QUARANTINE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The instant an `expires` value stops being valid.
 *
 * A bare `YYYY-MM-DD` names a DAY, and an entry stamped `2026-12-31` is licensed
 * *through* 2026-12-31 — not until one second past its midnight. `Date.parse`
 * resolves a date-only string to 00:00:00Z, so comparing against it directly
 * kills the quarantine a full day early. Date-only values therefore expire at
 * the END of the named UTC day; a value that carries its own time is taken
 * literally.
 */
function expiryInstant(expires) {
  const t = Date.parse(expires);
  if (!Number.isFinite(t)) return NaN;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(expires).trim()) ? t + DAY_MS - 1 : t;
}

// Directories never worth walking when resolving test-file patterns.
const GLOB_SKIP_DIRS = new Set(['node_modules', '.git', '.github', 'site', 'dist', 'build']);

// ─── pattern globbing (reporter-independent) ─────────────────────────────────

/**
 * Turn a simple glob into an anchored regex. Supports the two constructs this
 * repo's `scripts.test` actually uses: `**` (any number of path segments) and
 * `*` (any run of characters within one segment).
 *
 * Deliberately NOT fs.globSync: the floors below must mean the same thing on
 * every node version CI might ever use, and globSync's availability and
 * semantics have moved between releases.
 */
function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` swallows zero or more directory segments; a bare `**` any chars.
        if (pattern[i + 2] === '/') { re += '(?:[^/]+/)*'; i += 2; }
        else { re += '.*'; i += 1; }
      } else {
        re += '[^/]*';
      }
      continue;
    }
    re += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/**
 * Every repo-relative file matching any of `patterns`. This is what makes the
 * "did the selection match anything" floor independent of what the test
 * reporter chooses to tell us — node 22's junit reporter, for one, omits the
 * `file` attribute entirely.
 */
function resolveTestFiles(patterns, root = REPO_ROOT) {
  const regexes = patterns.map(globToRegExp);
  const out = new Set();
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (GLOB_SKIP_DIRS.has(e.name)) continue;
        walk(rel);
      } else if (regexes.some((r) => r.test(rel))) {
        out.add(rel);
      }
    }
  };
  walk('');
  return [...out].sort();
}

// ─── package.json → test patterns ────────────────────────────────────────────

/**
 * Split a shell-ish command string into argv, honouring single and double
 * quotes. package.json `scripts.test` quotes its glob patterns so the shell
 * does not expand them — node does the globbing itself.
 */
function tokenize(cmd) {
  const out = [];
  let cur = '';
  let quote = null;
  let started = false;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; started = true; continue; }
    if (/\s/.test(ch)) {
      if (started) { out.push(cur); cur = ''; started = false; }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (quote) throw new Error(`unbalanced quote in command: ${cmd}`);
  if (started) out.push(cur);
  return out;
}

/**
 * Derive the test-file patterns from package.json `scripts.test`.
 * Throws — never guesses — if the script is not a recognisable
 * `node --test <patterns...>` invocation.
 */
function derivePatterns(testScript) {
  if (typeof testScript !== 'string' || testScript.trim() === '') {
    throw new Error('package.json scripts.test is missing or empty');
  }
  const argv = tokenize(testScript);
  if (argv[0] !== 'node') {
    throw new Error(`package.json scripts.test must start with "node", got: ${argv[0]}`);
  }
  if (!argv.includes('--test')) {
    throw new Error('package.json scripts.test does not pass --test');
  }
  const patterns = argv.slice(1).filter((a) => !a.startsWith('-'));
  if (patterns.length === 0) {
    throw new Error('package.json scripts.test names no test-file patterns');
  }
  return patterns;
}

// ─── junit XML → results ─────────────────────────────────────────────────────

function unescapeXml(s) {
  // node's junit reporter double-escapes entities in attribute values
  // (`"` arrives as `&amp;quot;`). Unescape repeatedly until it settles so the
  // allowlist can be written with the names a human actually sees.
  let prev = null;
  let cur = s;
  for (let i = 0; i < 4 && cur !== prev; i++) {
    prev = cur;
    cur = cur
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&amp;/g, '&');
  }
  return cur;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? unescapeXml(m[1]) : null;
}

/**
 * Find the end of the XML tag that starts at `start` (the '<'), honouring
 * double-quoted attribute values.
 *
 * This cannot be a `[^>]*` regex. node's junit reporter escapes `&` and `"` in
 * attribute values but leaves `>` RAW — a test named
 *   `BW-2 wrapCommand contains { echo hello ; } > $__DFW_OUT`
 * is emitted with a literal `>` inside name="…". A `[^>]*` scan ends the tag
 * there and then fails to match, so the testcase is dropped from the count
 * without a word. A dropped <testcase> is a dropped failure — exactly the
 * silent-omission shape this gate exists to prevent.
 *
 * Returns { end, selfClosing } where `end` is the index just past '>'.
 */
function findTagEnd(xml, start) {
  let inQuote = false;
  for (let i = start; i < xml.length; i++) {
    const ch = xml[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === '>' && !inQuote) {
      return { end: i + 1, selfClosing: xml[i - 1] === '/' };
    }
  }
  return null;
}

/**
 * Parse node's `--test-reporter=junit` output.
 *
 * Returns { total, failures, skipped, skippedNames:Set, files:Set,
 * nameCounts:Map, failing:[…] }.
 * `total` counts leaf <testcase> elements; suites are not counted, so a failing
 * test is never double-reported through its parent describe().
 *
 * A <testcase> can be BOTH skipped and failed: `{ todo: '…' }` on a failing test
 * makes node emit `<skipped type="todo">` *and* `<failure>` in the same body, and
 * exit 0. Reading the skip first and moving on launders that failure past the
 * gate — verified against node 22.23.3 and 25.9.0 — so the failure is read
 * unconditionally and the two verdicts are recorded independently.
 *
 * `files` is best-effort and may be EMPTY: node 22's junit reporter does not
 * emit a `file` attribute at all, while node 25's does. Nothing load-bearing
 * may depend on it — see `resolveTestFiles` for the floor that does not.
 * `nameCounts` exists because allowlist entries are keyed by test NAME (the
 * only key that is identical on every node version), so the gate has to be able
 * to prove a name it is about to license is unambiguous.
 */
function parseJunit(xml) {
  const result = {
    total: 0, failures: 0, skipped: 0, skippedNames: new Set(),
    files: new Set(), nameCounts: new Map(), failing: [],
  };
  const OPEN = '<testcase';
  const CLOSE = '</testcase>';
  let cursor = 0;
  for (;;) {
    const start = xml.indexOf(OPEN, cursor);
    if (start === -1) break;
    const tag = findTagEnd(xml, start);
    if (!tag) break; // truncated report; the floors below will catch it
    const tagAttrs = xml.slice(start + OPEN.length, tag.end - (tag.selfClosing ? 2 : 1));
    let body = '';
    if (tag.selfClosing) {
      cursor = tag.end;
    } else {
      const closeAt = xml.indexOf(CLOSE, tag.end);
      if (closeAt === -1) { cursor = tag.end; } // truncated; treat as empty body
      else { body = xml.slice(tag.end, closeAt); cursor = closeAt + CLOSE.length; }
    }

    const name = attr(tagAttrs, 'name');
    const fileAbs = attr(tagAttrs, 'file');
    const file = fileAbs
      ? path.relative(REPO_ROOT, path.resolve(fileAbs))
      : '<unknown>';
    result.total += 1;
    result.nameCounts.set(name, (result.nameCounts.get(name) || 0) + 1);
    if (file !== '<unknown>') result.files.add(file);

    if (/<skipped\b/.test(body)) {
      result.skipped += 1;
      result.skippedNames.add(name);
      // deliberately NOT `continue` — see the header: a todo test can be skipped
      // AND failed in the same body.
    }

    // The failure tag must be bounded by findTagEnd, not by `[^>]*`. node leaves
    // `>` RAW inside message="…" (`assert.fail('… } > $OUT …')` is emitted
    // verbatim), so a `[^>]*` scan ends the tag mid-attribute and the subsequent
    // message="([^"]*)" lookup finds no closing quote and reports BLANK. That is
    // the same defect findTagEnd exists to fix on <testcase>; reproduced on node
    // 22.23.3 and 25.9.0.
    const failAt = body.search(/<(failure|error)\b/);
    if (failAt !== -1) {
      const failTag = findTagEnd(body, failAt);
      const failAttrs = failTag ? body.slice(failAt, failTag.end) : body.slice(failAt);
      result.failures += 1;
      result.failing.push({
        file,
        test: name,
        message: (attr(failAttrs, 'message') || '').split('\n')[0].slice(0, 200),
      });
    }
  }
  return result;
}

// ─── allowlist ───────────────────────────────────────────────────────────────

/**
 * The allowlist key is the test NAME, and only the name.
 *
 * The obvious key is `file::name`, and the first cut of this gate used it —
 * until CI proved it unusable: node 22's junit reporter emits no `file`
 * attribute, node 25's does. A key that resolves differently on a developer's
 * machine and on the runner is a trap, not a key: the list would appear to
 * shrink locally and silently fail to match in CI. The name is identical on
 * every version.
 *
 * The cost of a name key is ambiguity, and that is paid for explicitly:
 * `evaluate` fails the gate when a licensed name matches more than one test in
 * the run, so a name can never quietly license a second test. `file` stays on
 * each entry for the reader, and is cross-checked whenever the runner is
 * generous enough to report it.
 */
function key(test) { return test; }

function loadAllowlist(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${ALLOWLIST_PATH} is not valid JSON: ${e.message}`);
  }
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error(`${ALLOWLIST_PATH} must be an object with an "entries" array`);
  }
  const problems = [];
  const seen = new Set();
  for (const [i, e] of parsed.entries.entries()) {
    const where = `entries[${i}]`;
    if (!e || typeof e.file !== 'string' || e.file === '') {
      problems.push(`${where}: missing "file"`);
      continue;
    }
    if (typeof e.test !== 'string' || e.test === '') {
      problems.push(`${where}: missing "test"`);
      continue;
    }
    const reason = typeof e.reason === 'string' ? e.reason.trim() : '';
    if (reason.length < MIN_REASON_CHARS) {
      problems.push(
        `${where} (${e.test}): "reason" must name a mechanism — at least ${MIN_REASON_CHARS} characters`
      );
    }
    if (BANNED_REASON_WORDS.test(reason)) {
      problems.push(
        `${where} (${e.test}): "reason" calls the test flaky/intermittent. Name what it binds, ` +
        `reads or assumes instead — "flaky" with no mechanism is how a real regression hides.`
      );
    }
    // A nondeterministic entry is exempt from the shrink-only ratchet (it may
    // pass or fail on any given run), so it buys a much bigger licence and is
    // priced accordingly: it must point at a tracking issue and it must expire.
    // Without the expiry it is a parking space with no meter, which is the
    // failure mode the ratchet exists to prevent.
    if (e.nondeterministic === true) {
      if (typeof e.tracking !== 'string' || !/\d/.test(e.tracking)) {
        problems.push(`${where} (${e.test}): "nondeterministic" entries need a "tracking" issue reference`);
      }
      const expires = Date.parse(e.expires);
      if (!Number.isFinite(expires)) {
        problems.push(`${where} (${e.test}): "nondeterministic" entries need an "expires" ISO date`);
      }
    } else if ('tracking' in e || 'expires' in e) {
      // Harmless, but say so: these fields do nothing on a deterministic entry.
      problems.push(
        `${where} (${e.test}): "tracking"/"expires" only apply when "nondeterministic" is true`
      );
    }

    const k = key(e.test);
    if (seen.has(k)) problems.push(`${where}: duplicate entry for ${k}`);
    seen.add(k);
  }
  if (problems.length) {
    throw new Error(`known-test-failures.json is invalid:\n  - ${problems.join('\n  - ')}`);
  }
  return parsed.entries;
}

// ─── evaluation ──────────────────────────────────────────────────────────────

/**
 * Pure decision function: given a parsed run and the allowlist entries, return
 * { ok, errors:[] }. Kept free of I/O so it is directly testable.
 */
function evaluate(run, entries, opts = {}) {
  const minTests = opts.minTests ?? MIN_TESTS;
  const minFiles = opts.minTestFiles ?? MIN_TEST_FILES;
  // Files the PATTERNS resolve to, counted by the gate itself. Independent of
  // whatever the reporter feels like telling us about file attribution.
  const matchedFiles = opts.matchedFiles ?? null;
  // The repo-relative files the patterns resolved to, when the caller has them.
  // Lets the `file` on each allowlist entry be cross-checked on EVERY node
  // version — see Guard 2c.
  const matchedFileSet = opts.matchedFileSet ?? null;
  // The runner's own verdict, as a process exit code. See Guard 0.
  const runnerExit = opts.runnerExit ?? null;
  const runnerSignal = opts.runnerSignal ?? null;
  const errors = [];

  // Guard 0 — the report and the process must agree.
  //
  // Every other guard here reasons about the junit XML. The XML is not the
  // runner's verdict; the exit code is. They can disagree, and when they do the
  // XML is the optimistic one: a describe()-scoped `after()` hook that throws
  // makes node 25 exit 1 while emitting failures="0" and no <failure> element at
  // all, so a gate that reads only the report prints PASS over a suite node
  // itself reported as failed. That shape is live in this repo
  // (flutter-ui-eval.test.cjs and flutter-ui-eval-dogfood.test.cjs both rm -rf a
  // tmpdir from a describe-scoped after()).
  //
  // A non-zero exit WITH failures in the report is ordinary and is judged by the
  // allowlist below. A non-zero exit with a CLEAN report is unexplained, and an
  // unexplained non-zero exit is a failure.
  if (runnerExit !== null && runnerExit !== 0 && run.failures === 0) {
    errors.push(
      `The test runner exited ${runnerExit}` +
      `${runnerSignal ? ` (signal ${runnerSignal})` : ''} but the junit report ` +
      `contains ZERO failures. The report and the process DISAGREE, and the exit ` +
      `code is the runner's actual verdict — the report is only what the reporter ` +
      `chose to write down.\n` +
      `    node exits non-zero without emitting a <failure> for failures it cannot ` +
      `attribute to a test: a throwing before()/after() hook on a describe(), a ` +
      `load-time throw, an unhandled rejection after the last test.\n` +
      `    The spec output above carries the real error; look at its "failing tests:" ` +
      `section. This is a FAIL, not a pass with a footnote.`
    );
  }

  // Guard 1 — the run must have actually run.
  if (matchedFiles !== null && matchedFiles < minFiles) {
    errors.push(
      `The test-file patterns in package.json scripts.test resolve to only ` +
      `${matchedFiles} file(s); the floor is ${minFiles}. \`node --test\` exits 0 ` +
      `when its patterns match nothing, so a shrunken selection is a green tick ` +
      `over a suite that was never run.`
    );
  }
  if (run.total === 0) {
    errors.push(
      'The test runner reported ZERO tests. `node --test` exits 0 when its file ' +
      'patterns match nothing, so this would otherwise be a green tick over an ' +
      'empty run. Check the patterns in package.json scripts.test.'
    );
  } else if (run.total - run.skipped < minTests) {
    // The floor counts EXECUTED tests, not reported ones. A skipped test did not
    // run, so counting it toward "the suite ran" reproduces the exact hole this
    // floor exists to close — a `{ skip: … }` sprayed across 300 tests, or a
    // platform predicate that silently stops being true on the runner, would
    // otherwise clear the floor with a suite that barely executed.
    errors.push(
      `Only ${run.total - run.skipped} tests actually EXECUTED (${run.total} ` +
      `reported, ${run.skipped} skipped); the floor is ${minTests}. Either the ` +
      `file patterns stopped matching part of the suite, a whole file failed to ` +
      `load, or something started skipping en masse. A skipped test is not a ` +
      `passing test. This is not a pass.`
    );
  }

  const allowed = new Map(entries.map((e) => [key(e.test), e]));
  const failedKeys = new Set(run.failing.map((f) => key(f.test)));
  const skippedNames = run.skippedNames || new Set();

  // Guard 2 — regressions: a failure nobody wrote down.
  const unexpected = run.failing.filter((f) => !allowed.has(key(f.test)));
  if (unexpected.length) {
    errors.push(
      `${unexpected.length} test(s) failed that are NOT in .github/known-test-failures.json:\n` +
      unexpected.map((f) => `    ✖ ${f.file}\n        ${f.test}\n        ${f.message}`).join('\n')
    );
  }

  // Guard 2b — the price of keying on the name alone. A licensed name that
  // matches two tests would silently extend the licence to a test nobody
  // reviewed; refuse rather than guess which one was meant.
  if (run.nameCounts) {
    const ambiguous = [...allowed.keys()].filter((k) => (run.nameCounts.get(k) || 0) > 1);
    if (ambiguous.length) {
      errors.push(
        `${ambiguous.length} allowlisted test name(s) match MORE THAN ONE test in this run.\n` +
        `    Entries are keyed by name, so this would license tests nobody reviewed.\n` +
        `    Rename the tests to be unique, then update the entry.\n` +
        ambiguous.map((k) => `    ⚠ ${k} (${run.nameCounts.get(k)} matches)`).join('\n')
      );
    }
  }

  // Guard 2c — the documentary `file` on each entry, checked STATICALLY against
  // the files the patterns resolve to.
  //
  // This used to be checked only against the runner's `file` attribution, which
  // meant it could never run on node 22 — the version CI pins, and the only
  // environment the list actually describes. A safety net that is off in the one
  // place it is advertised for is not a safety net. The check below is
  // reporter-independent: the path must exist in the selected suite, which is the
  // rot that actually happens (a file renamed or moved while the entry stayed
  // behind). The dynamic cross-check is kept underneath it as a bonus on the node
  // versions generous enough to report attribution.
  if (matchedFileSet) {
    for (const e of entries) {
      if (!matchedFileSet.has(e.file)) {
        errors.push(
          `Allowlist entry for "${e.test}" records file "${e.file}", which is not ` +
          `one of the ${matchedFileSet.size} test files the patterns in ` +
          `package.json scripts.test select. The file was renamed, moved or ` +
          `deleted and the entry did not follow. Correct or delete the entry.`
        );
      }
    }
  }
  for (const f of run.failing) {
    const e = allowed.get(key(f.test));
    if (e && f.file && f.file !== '<unknown>' && e.file !== f.file) {
      errors.push(
        `Allowlist entry for "${f.test}" records file "${e.file}", but the runner ` +
        `reports it in "${f.file}". Correct the entry.`
      );
    }
  }

  // Guard 3 — the ratchet: an entry that passed must be deleted, not left to rot.
  // Without this the list is a parking lot and a fixed test silently keeps its
  // licence to fail again later.
  //
  // A SKIPPED test is neither a pass nor a fail, and it must not be read as
  // either. Reading it as a pass is the live hazard: PW-9 runs only where pwsh is
  // on PATH, ubuntu-latest's pwsh availability has moved within the same image
  // label, and the moment it goes missing the ratchet would report PW-9 as
  // "PASSED this run" and instruct a human to DELETE a quarantine for a test that
  // still fails every time pwsh is present. The entry is therefore KEPT: it was
  // not exercised, so nothing was learned, so nothing changes. It is reported
  // separately (see notesForRun) rather than silently, because an entry that
  // stops being exercised is itself news.
  const stale = [];
  const unexercised = [];
  for (const [k, e] of allowed.entries()) {
    if (failedKeys.has(k) || e.nondeterministic === true) continue;
    if (skippedNames.has(k)) unexercised.push(k);
    else stale.push(k);
  }
  if (stale.length) {
    errors.push(
      `${stale.length} entr(ies) in .github/known-test-failures.json PASSED this run.\n` +
      `    The list may only shrink: delete these entries in the same PR that made them pass.\n` +
      stale.map((k) => `    ✔ ${k}`).join('\n')
    );
  }

  // Guard 4 — a quarantine with no end date is a parking space. Nondeterministic
  // entries escape the ratchet above, so their licence is time-boxed instead.
  const now = opts.now ? Date.parse(opts.now) : Date.now();
  const quarantines = entries.filter((e) => e.nondeterministic === true);
  const expired = quarantines.filter((e) => expiryInstant(e.expires) < now);
  if (expired.length) {
    errors.push(
      `${expired.length} quarantine entr(ies) in .github/known-test-failures.json have EXPIRED.\n` +
      `    Fix the underlying defect, or re-justify and extend with a dated note — do not just bump the date.\n` +
      expired.map((e) => `    ⏰ ${key(e.test)} (expired ${e.expires}, tracking ${e.tracking})`).join('\n')
    );
  }

  // Guard 4b — and the meter has a maximum reading. An `expires` that merely
  // parses is not a ceiling: `2099-01-01` parses. Without this, `nondeterministic`
  // plus a far-future date is a permanent exemption with the paperwork filled in.
  const maxDays = opts.maxQuarantineDays ?? MAX_QUARANTINE_DAYS;
  const overlong = quarantines.filter(
    (e) => expiryInstant(e.expires) - now > maxDays * DAY_MS
  );
  if (overlong.length) {
    errors.push(
      `${overlong.length} quarantine entr(ies) expire more than ${maxDays} days from now.\n` +
      `    A quarantine is a promise to fix something, and a date past the horizon of\n` +
      `    anyone who will read it is a permanent exemption wearing a date. If the test\n` +
      `    should not run, delete it in a PR someone reviews; do not park it here.\n` +
      overlong.map((e) => {
        const days = Math.round((expiryInstant(e.expires) - now) / DAY_MS);
        return `    📅 ${key(e.test)} (expires ${e.expires} — ${days} days out)`;
      }).join('\n')
    );
  }

  return { ok: errors.length === 0, errors, unexercised };
}

/**
 * Non-fatal observations worth printing on every run, pass or fail.
 *
 * A skipped test is its own verdict, and the only honest thing a gate with no
 * recorded baseline can do with an unexpected one is SAY SO. There is no
 * per-test expected-skip record in this repo, so failing on a skip would be a
 * false-red generator (PW-9 legitimately skips wherever pwsh is absent). Printing
 * every skipped name on every run costs nothing and makes "this test used to run
 * here" a one-line diff between two job logs — which is the evidence a human
 * needs and the gate cannot synthesise.
 */
function notesForRun(run, evaluation) {
  const notes = [];
  if (evaluation && evaluation.unexercised && evaluation.unexercised.length) {
    notes.push(
      `${evaluation.unexercised.length} allowlisted test(s) SKIPPED rather than ran. ` +
      `Their entries are KEPT — a skip proves nothing either way — but nothing was ` +
      `learned about them this run:\n` +
      evaluation.unexercised.map((k) => `    ⃠ ${k}`).join('\n')
    );
  }
  const skippedNames = [...(run.skippedNames || new Set())];
  if (skippedNames.length) {
    const shown = skippedNames.slice(0, 25);
    notes.push(
      `${skippedNames.length} test(s) skipped in this run. A skip is not a pass; if a ` +
      `name below used to execute on this runner, that is a silent loss of coverage:\n` +
      shown.map((k) => `    ⃠ ${k}`).join('\n') +
      (skippedNames.length > shown.length
        ? `\n    … and ${skippedNames.length - shown.length} more`
        : '')
    );
  }
  return notes;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const patterns = derivePatterns(pkg.scripts && pkg.scripts.test);

  const entries = loadAllowlist(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));

  const junitPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'df-ci-gate-')),
    'results.xml'
  );

  // Resolve the patterns here, before running anything. This is the guard that
  // does not depend on the reporter: if the selection has collapsed, say so with
  // the number, rather than letting an empty run exit 0.
  const matched = resolveTestFiles(patterns);

  console.log(`[ci-unit-gate] patterns from package.json scripts.test: ${patterns.join(' ')}`);
  console.log(`[ci-unit-gate] patterns resolve to ${matched.length} test file(s) (floor ${MIN_TEST_FILES})`);
  console.log(`[ci-unit-gate] known-failure entries: ${entries.length}`);
  console.log('[ci-unit-gate] running the suite…\n');

  // Two reporters: spec to the job log so a human can read it, junit to a file
  // so this gate can reason about individual test names.
  // The ONLY difference from `npm test` is --test-timeout. node's default is
  // Infinity, and this suite contains PTY/daemon tests that have been observed
  // to wedge past their own per-test timeout: without a ceiling a hang shows up
  // as an opaque job timeout with no attribution. With one, it arrives as a
  // named failing test the sections below can report, ratchet and allowlist.
  // The slowest single test observed is ~32s, so 180s is a 5-6x margin;
  // per-test `{ timeout: … }` options still win over this default.
  const PER_TEST_TIMEOUT_MS = 180000;
  const args = [
    '--test',
    `--test-timeout=${PER_TEST_TIMEOUT_MS}`,
    '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=junit', `--test-reporter-destination=${junitPath}`,
    ...patterns,
  ];
  // A wall-clock ceiling on the WHOLE run, on top of the per-test one above.
  // --test-timeout is not enough: handoff-e2e.test.cjs has been observed to leak
  // a devflow-watch daemon whose surviving handles stop node exiting the file, so
  // the per-test timeout fires and the runner still never returns (issue #93).
  // Without this, that wedge burns the job's entire budget and reports as an
  // unattributable GitHub-level timeout with no test output at all.
  const SUITE_TIMEOUT_MS = 22 * 60 * 1000;
  const startedAt = Date.now();
  const child = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    timeout: SUITE_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'inherit', 'inherit'],
    // NODE_TEST_* is set inside a process that is itself running a test file.
    // Inherited, it makes the child emit node's internal child-process protocol
    // instead of junit XML — a report that parses to zero results.
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST_'))
      ),
      FORCE_COLOR: '0',
    },
  });

  const elapsedMs = Date.now() - startedAt;

  if (child.signal === 'SIGKILL' || (child.error && child.error.code === 'ETIMEDOUT')) {
    // Report what was MEASURED, and name the candidate causes as candidates.
    // The previous wording asserted issue #93 outright. A SIGKILL is not a
    // diagnosis: a 2-core runner merely slower than this budget, and an OOM kill
    // from the kernel, both arrive as exactly this signal — and naming a cause
    // the gate never measured sends the next reader to the wrong file.
    const secs = Math.round(elapsedMs / 1000);
    console.error(
      `\n[ci-unit-gate] FAIL — the suite process was killed before it finished.\n` +
      `  MEASURED: ran ${secs}s (${(secs / 60).toFixed(1)} min) against a ceiling of ` +
      `${SUITE_TIMEOUT_MS / 60000} min; signal ${child.signal || '(none)'}; ` +
      `spawn error ${child.error ? child.error.code : '(none)'}; per-test timeout ` +
      `${PER_TEST_TIMEOUT_MS / 1000}s.\n` +
      `  NOT MEASURED: why. A SIGKILL here is consistent with at least three causes ` +
      `and this gate distinguished none of them:\n` +
      `    - the known wedge in issue #93 — handoff-e2e.test.cjs leaks a devflow-watch\n` +
      `      daemon whose open handles stop node exiting that file, and the per-test\n` +
      `      --test-timeout cannot reach it. Tell by: the spec output stops inside\n` +
      `      handoff-e2e.test.cjs and stays there.\n` +
      `    - a runner simply slower than this budget. Tell by: the spec output was still\n` +
      `      advancing through new files when it stopped, at the ceiling.\n` +
      `    - an OOM kill from the kernel, which also arrives as SIGKILL. Tell by: the\n` +
      `      elapsed time above is well BELOW the ceiling, and the runner annotations\n` +
      `      or dmesg mention the OOM killer.\n` +
      `  The spec output above ends at the last file that completed; that is where to look.`
    );
    process.exitCode = 1;
    return;
  }
  if (child.error) {
    console.error(`[ci-unit-gate] FAIL — could not run the suite: ${child.error.message}`);
    process.exitCode = 1;
    return;
  }

  let xml = '';
  try {
    xml = fs.readFileSync(junitPath, 'utf8');
  } catch (e) {
    console.error(
      `[ci-unit-gate] FAIL — the junit reporter produced no output (${e.message}).\n` +
      `  The runner exited with ${child.status} / signal ${child.signal}. ` +
      `A gate with no results is not a pass.`
    );
    process.exitCode = 1;
    return;
  }
  if (xml.trim() === '') {
    console.error('[ci-unit-gate] FAIL — the junit report is empty. A gate with no results is not a pass.');
    process.exitCode = 1;
    return;
  }

  const run = parseJunit(xml);
  const evaluation = evaluate(run, entries, {
    matchedFiles: matched.length,
    matchedFileSet: new Set(matched),
    // The runner's own verdict, so the gate can refuse to disagree with it.
    runnerExit: child.status,
    runnerSignal: child.signal,
  });
  const { ok, errors } = evaluation;

  console.log('\n[ci-unit-gate] ───────────────────────────────────────────────');
  console.log(`[ci-unit-gate] tests: ${run.total} reported  ` +
              `${run.total - run.skipped} executed (floor ${MIN_TESTS})  ` +
              `failures: ${run.failures}  skipped: ${run.skipped}`);
  console.log(`[ci-unit-gate] files: ${matched.length} selected by the patterns; ` +
              `${run.files.size} attributed by the reporter` +
              (run.files.size === 0 ? ' (this node version omits testcase file=)' : ''));
  console.log(`[ci-unit-gate] runner exit: ${child.status}${child.signal ? ` (signal ${child.signal})` : ''}` +
              `  wall clock: ${Math.round(elapsedMs / 1000)}s`);

  if (run.failing.length) {
    console.log('[ci-unit-gate] failing tests observed:');
    for (const f of run.failing) console.log(`    \u2716 ${f.test}\n        (${f.file}) ${f.message}`);
  }

  for (const n of notesForRun(run, evaluation)) console.log(`[ci-unit-gate] NOTE — ${n}`);

  if (!ok) {
    console.error('\n[ci-unit-gate] FAIL\n');
    for (const e of errors) console.error(`  • ${e}\n`);
    // NOT process.exit(): it tears the process down without waiting for a
    // multi-KB write to drain, and on CI stdout/stderr ARE pipes. The FAIL report
    // above is the entire value of a red run; truncating it is the one output
    // this gate cannot afford to lose. process.exitCode lets the write flush and
    // still exits 1.
    process.exitCode = 1;
    return;
  }

  console.log('[ci-unit-gate] PASS — every failure is a declared, reasoned known failure.');
}

module.exports = { tokenize, derivePatterns, globToRegExp, resolveTestFiles,
                   parseJunit, loadAllowlist, evaluate, key, findTagEnd,
                   expiryInstant, notesForRun,
                   MIN_TESTS, MIN_TEST_FILES, MIN_REASON_CHARS,
                   MAX_QUARANTINE_DAYS };

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(`[ci-unit-gate] FAIL — ${e.message}`);
    process.exitCode = 1;
  }
}
