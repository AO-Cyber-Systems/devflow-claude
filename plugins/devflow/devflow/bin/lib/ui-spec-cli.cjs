'use strict';

/**
 * ui-spec-cli — the `df-tools ui spec …` arms (objective 34-04).
 *
 *   cmdUiSpec(cwd, args, raw)   ->  `validate` and `render` today; 34-06 adds `sheet`,
 *                                   34-07 `lock`, each BESIDE the others in one dispatch.
 *
 * ── The one thing this file exists to get right ───────────────────────────────
 * The plan's W1b gate for this row is literally `df-tools ui spec validate <file>` **exit 1
 * with codes**. So:
 *
 *   * stdout is written HERE, directly, and the exit code is set with `process.exitCode` —
 *     never `process.exit()`, which can truncate a buffered write, and never
 *     `helpers.cjs`'s `output()`, which calls `process.exit(0)` UNCONDITIONALLY and would
 *     make this gate structurally incapable of failing. Same decision, same reasoning as
 *     `flutter-ui-eval.cjs`'s `outputRollup()`; `output()` itself is not touched, because a
 *     dozen callers depend on its exit-0 behaviour.
 *   * `ok` — not the presence of error records — drives the code. A MISSING row (PAT000,
 *     HIT000) is a check that could not run: not a pass, not a failure, and never an exit 1.
 *
 * ── The arm holds NO rules ────────────────────────────────────────────────────
 * It resolves argv, reads the file, calls `parseSurfaceSpec` then `validateSurfaceSpec`,
 * prints, and sets the code. Every invariant lives in `ui-spec-validate.cjs` where the
 * known-broken fixtures can reach it without a subprocess.
 *
 * ── `render`, and why it shares validate's front half (34-05) ─────────────────
 * `ui spec render <file> [--manifest|--graph|--table]` derives the four artifacts of §4.1's
 * one-file rule. It parses and validates FIRST, and an invalid spec renders NOTHING and exits
 * 1 — a manifest, a graph and a table derived from a spec nobody checked look authoritative
 * and are not, and everything downstream treats them as the truth. With no flag it prints all
 * four under named keys, so a caller wanting everything does not run the arm three times and
 * hope the runs agree.
 *
 * A MISSING row does NOT refuse the render (it is not a violation) and is NOT swallowed
 * either: it is written to STDERR as an advisory. stdout carries only the artifact, because
 * the byte-stability contract diffs stdout.
 *
 * ── The pattern catalogue (I5) ────────────────────────────────────────────────
 * `ctx.patterns` is `undefined` when the catalogue is UNREACHABLE and an array when it is
 * reachable. W1b has no pinned `eden-ui-flutter` release, so the default is `undefined` and
 * I5 reports PAT000/MISSING. Passing `[]` instead would fire PAT001 on every real spec, and
 * reporting nothing would turn an unreachable catalogue into a silent pass.
 * `--patterns <file>` supplies one explicitly — a JSON array (or `{patterns: [...]}`) of
 * catalogue entries. It exists so I5's codes are reachable from the REAL binary: without it
 * the `unknown-pattern.md` fixture's defect can never be proven through the gate, and a gate
 * that cannot fail for one of its own fixtures is the trap this objective exists to close.
 * A `--patterns` file that cannot be read is a one-line refusal, NOT a fallback to MISSING:
 * the caller asked for a catalogue, so hiding the typo would be the same silent pass.
 *
 * Consumed by: bin/df-tools.cjs `case 'ui'`.
 * Depends on: ./ui-spec.cjs, ./ui-spec-validate.cjs, ./helpers.cjs. No npm dependencies.
 */

const fs = require('fs');
const path = require('path');

const { parseSurfaceSpec, loadMustNotVocabulary } = require('./ui-spec.cjs');
const { validateSurfaceSpec } = require('./ui-spec-validate.cjs');
const { renderSurfaceSpec } = require('./ui-spec-render.cjs');
const { error } = require('./helpers.cjs');

const SPEC_SUBCOMMANDS = ['validate', 'render'];
const RENDER_FLAGS = ['--manifest', '--graph', '--table'];

/** `--flag value` out of an argv slice. Returns undefined when the flag is absent. */
function flagValue(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function positionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (typeof args[i] === 'string' && args[i].startsWith('--')) { i += 1; continue; }
    out.push(args[i]);
  }
  return out;
}

/**
 * The pattern catalogue for I5, or `undefined` when none was supplied (UNREACHABLE).
 * Entries are either a bare id string or `{id, kind?, must_not?}` — `ui-spec-validate.cjs`
 * owns the reading of them.
 */
function readPatternCatalogue(cwd, args) {
  const given = flagValue(args, '--patterns');
  if (given === undefined) return undefined; // no catalogue -> I5 reports MISSING
  if (!given || given.startsWith('--')) {
    error('--patterns needs a path to a JSON pattern catalogue');
  }
  const file = path.resolve(cwd, given);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (e) {
    error(`--patterns catalogue not readable at ${file}: ${e.code || e.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    error(`--patterns catalogue at ${file} is not valid JSON: ${e.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.patterns) ? parsed.patterns : null);
  if (list === null) {
    error(`--patterns catalogue at ${file} must be a JSON array, or an object with a \`patterns\` array`);
  }
  return list;
}

/**
 * The front half BOTH arms share: resolve the file, read it, parse it, validate it. One home
 * for it, because `render` refusing an invalid spec and `validate` reporting one are the same
 * question asked by two callers — and two implementations of it would eventually disagree
 * about which specs are valid.
 *
 * @returns {{file: string, frontMatter: (object|Error), result: object}}
 */
function parseAndValidate(cwd, args, usage) {
  const rest = positionals(args);
  const given = rest[0];
  if (!given) {
    error(usage);
  }

  const file = path.resolve(cwd, given);
  if (!fs.existsSync(file)) {
    error(`spec not found: ${given}`);
  }

  const patterns = readPatternCatalogue(cwd, args);

  let vocabulary;
  try {
    vocabulary = loadMustNotVocabulary().terms;
  } catch (e) {
    // The vocabulary ships beside the schema; if it is unreadable the validator still runs and
    // CTRL007 (34-05+) reports MISSING rather than this arm dying before a verdict.
    vocabulary = undefined;
  }

  // A parse failure is a VERDICT, not a crash: `validateSurfaceSpec` turns the thrown
  // yaml-lite error (line number and all) into SPEC000. A stack trace would tell the author
  // where node is, not where their spec is wrong.
  let frontMatter;
  try {
    frontMatter = parseSurfaceSpec(fs.readFileSync(file, 'utf-8'), { source: file }).frontMatter;
  } catch (e) {
    frontMatter = e;
  }

  return { file, frontMatter, result: validateSurfaceSpec(frontMatter, { patterns, vocabulary }) };
}

/** `ui spec validate <file> [--patterns <file>]` */
function cmdUiSpecValidate(cwd, args) {
  const { file, result } = parseAndValidate(
    cwd, args, 'usage: df-tools ui spec validate <file> [--patterns <catalogue.json>]'
  );

  process.stdout.write(`${JSON.stringify({ ...result, spec: file }, null, 2)}\n`);

  // CRITICAL: process.exitCode, never process.exit() and never helpers.output().
  process.exitCode = result.ok ? 0 : 1;
}

/**
 * `ui spec render <file> [--manifest|--graph|--table] [--patterns <file>]`
 *
 * Derives §4.1's four artifacts from the ONE hand-authored spec. Refuses an invalid one.
 */
function cmdUiSpecRender(cwd, args) {
  const { file, frontMatter, result } = parseAndValidate(
    cwd, args, `usage: df-tools ui spec render <file> [${RENDER_FLAGS.join('|')}] [--patterns <catalogue.json>]`
  );

  // CRITICAL: an invalid spec renders NOTHING. The verdict goes out in `validate`'s own shape
  // so a caller that pipes either arm reads one format, and the exit code is the gate.
  if (!result.ok) {
    process.stdout.write(`${JSON.stringify({ ...result, spec: file }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  // A MISSING row is not a violation and does not refuse the render — but it is a check that
  // DID NOT RUN, and rendering four confident-looking artifacts without saying so is the
  // silent-green class this objective exists to close. stderr, so the artifact on stdout stays
  // byte-stable.
  const missing = (result.errors || []).filter((e) => e.status === 'MISSING');
  for (const row of missing) {
    process.stderr.write(`advisory: ${row.code} MISSING — ${row.msg}\n`);
  }
  if (missing.length > 0) {
    process.stderr.write(
      `advisory: ${missing.length} check(s) did not run for ${file}; a MISSING row is not a pass.\n`
    );
  }

  // Already validated above — re-running the whole invariant set here would do the same work
  // twice and give the verdict two homes.
  const rendered = renderSurfaceSpec(frontMatter, { validate: false });

  const flags = args.filter((a) => typeof a === 'string' && a.startsWith('--') && a !== '--patterns');
  const flag = flags[0];

  if (flag === undefined) {
    process.stdout.write(`${JSON.stringify({
      spec: file,
      manifest: rendered.manifest,
      navGraphMermaid: rendered.navGraphMermaid,
      controlTableMd: rendered.controlTableMd,
      captureList: rendered.captureList
    }, null, 2)}\n`);
  } else if (flag === '--manifest') {
    process.stdout.write(`${JSON.stringify(rendered.manifest, null, 2)}\n`);
  } else if (flag === '--graph') {
    process.stdout.write(rendered.navGraphMermaid);
  } else if (flag === '--table') {
    process.stdout.write(rendered.controlTableMd);
  } else {
    error(`Unknown render flag ${flag}. Available: ${RENDER_FLAGS.join(', ')}`);
  }

  process.exitCode = 0;
}

/**
 * `df-tools ui spec <subcommand> …`
 *
 * @param {string} cwd
 * @param {string[]} args  argv with `ui spec` stripped by df-tools.cjs: args[0] is the spec
 *                         subcommand (`validate` | `render`), args[1] the file.
 * @param {boolean} raw    accepted for dispatch symmetry; the shape of each arm's output is
 *                         fixed by its own contract (the verdict codes; the artifact bytes).
 */
function cmdUiSpec(cwd, args, raw) { // eslint-disable-line no-unused-vars
  const sub = Array.isArray(args) ? args[0] : undefined;
  if (sub === 'validate') {
    cmdUiSpecValidate(cwd, args.slice(1));
  } else if (sub === 'render') {
    cmdUiSpecRender(cwd, args.slice(1));
  } else {
    error(`Unknown ui spec subcommand. Available: ${SPEC_SUBCOMMANDS.join(', ')}`);
  }
}

module.exports = {
  cmdUiSpec,
  SPEC_SUBCOMMANDS,
  RENDER_FLAGS
};
