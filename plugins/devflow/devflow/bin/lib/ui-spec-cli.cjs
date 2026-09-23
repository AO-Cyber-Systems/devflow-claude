'use strict';

/**
 * ui-spec-cli — the `df-tools ui spec …` arms (objective 34-04).
 *
 *   cmdUiSpec(cwd, args, raw)   ->  `validate` today; 34-05 adds `render`, 34-06 `sheet`,
 *                                   34-07 `lock`, each BESIDE validate in one dispatch.
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
const { error } = require('./helpers.cjs');

const SPEC_SUBCOMMANDS = ['validate'];

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

/** `ui spec validate <file> [--patterns <file>]` */
function cmdUiSpecValidate(cwd, args) {
  const rest = positionals(args);
  const given = rest[0];
  if (!given) {
    error('usage: df-tools ui spec validate <file> [--patterns <catalogue.json>]');
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

  const result = validateSurfaceSpec(frontMatter, { patterns, vocabulary });

  process.stdout.write(`${JSON.stringify({ ...result, spec: file }, null, 2)}\n`);

  // CRITICAL: process.exitCode, never process.exit() and never helpers.output().
  process.exitCode = result.ok ? 0 : 1;
}

/**
 * `df-tools ui spec <subcommand> …`
 *
 * @param {string} cwd
 * @param {string[]} args  argv with `ui spec` stripped by df-tools.cjs: args[0] is the spec
 *                         subcommand (`validate`), args[1] the file.
 * @param {boolean} raw    accepted for dispatch symmetry; this arm's output is always the
 *                         verdict JSON, because the exit code and the codes are the contract.
 */
function cmdUiSpec(cwd, args, raw) { // eslint-disable-line no-unused-vars
  const sub = Array.isArray(args) ? args[0] : undefined;
  if (sub !== 'validate') {
    error(`Unknown ui spec subcommand. Available: ${SPEC_SUBCOMMANDS.join(', ')}`);
  }
  cmdUiSpecValidate(cwd, args.slice(1));
}

module.exports = {
  cmdUiSpec,
  SPEC_SUBCOMMANDS
};
