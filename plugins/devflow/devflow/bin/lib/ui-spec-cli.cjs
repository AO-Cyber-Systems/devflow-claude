'use strict';

/**
 * ui-spec-cli — the `df-tools ui spec …` arms (objective 34-04).
 *
 *   cmdUiSpec(cwd, args, raw)   ->  `validate` and `render`.
 *   cmdUiSheet(cwd, args, raw)  ->  `df-tools ui sheet …`, a THIRD `ui` subcommand beside
 *                                   `metrics` and `spec` (§8.3 names it `ui sheet <surface>`).
 *   cmdUiLock(cwd, args, raw)   ->  `df-tools ui lock …`, a FOURTH one: the look-lock a human's
 *                                   approval actually runs (34-07).
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
const { buildSheetModel, sheetHash, renderSheetHtml, loadSheetTemplate } = require('./ui-sheet.cjs');
const { lockStatus, writeLock } = require('./ui-spec-lock.cjs');
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

/**
 * `ui spec validate <file> [--patterns <file>]`
 *
 * ── `lock` rides ALONGSIDE the verdict, and never inside it ───────────────────
 * `ok` answers "is this spec structurally sound"; `lock` answers "has a human looked at this
 * shape". They are different questions and a caller needs both: a spec can be perfect and
 * un-approved (that is every spec during authoring, before any sheet exists), and a spec whose
 * lock is `cleared` is not thereby broken. So `lock: 'cleared'` does NOT set `ok: false` and
 * does NOT flip the exit code — 34-08's refusal to compose reads the `lock` field explicitly.
 */
function cmdUiSpecValidate(cwd, args) {
  const { file, frontMatter, result } = parseAndValidate(
    cwd, args, 'usage: df-tools ui spec validate <file> [--patterns <catalogue.json>]'
  );

  process.stdout.write(`${JSON.stringify({ ...result, lock: lockStatus(frontMatter), spec: file }, null, 2)}\n`);

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
 * A directory argument: resolved, and REQUIRED TO EXIST when it was supplied.
 *
 * A typo in `--renders` must not quietly become "every state is MISSING" — that reads exactly
 * like a surface nobody rendered, which is the one message this sheet has to be trusted to
 * mean. Absent (no flag at all) is a different thing and is allowed: it says up front that no
 * renders were supplied.
 */
function resolveDir(cwd, args, flag) {
  const given = flagValue(args, flag);
  if (given === undefined) return null;
  if (!given || given.startsWith('--')) {
    error(`${flag} needs a directory path`);
  }
  const dir = path.resolve(cwd, given);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    error(`${flag} directory not found: ${dir}`);
  }
  return dir;
}

/**
 * `ui sheet <spec> --renders <dir> --refs <dir> --out <file>`
 *
 * The §8.3 review artifact: one static, self-contained HTML page showing every declared
 * state x theme x width beside its reference, the navigation graph, the plain-language
 * control table and the per-state content contract.
 *
 * ── ONE HASHING PATH ─────────────────────────────────────────────────────────
 * The `sheet_hash` printed here is `sheetHash(buildSheetModel(...))` and nothing else. A CLI
 * with its own digest would be a second definition of what a look-lock covers, and the two
 * would eventually disagree about whether a human's approval still stands. Case A4 pins it.
 *
 * ── AN INVALID SPEC PRODUCES NO FILE ─────────────────────────────────────────
 * Same guard as `render` (34-05's R3): validate FIRST, and on a real violation print the
 * verdict in `validate`'s own shape, exit 1, and write nothing. A review sheet derived from
 * an unchecked spec is the most authoritative-looking wrong artifact this program can make —
 * a human signs it.
 */
function cmdUiSheet(cwd, args) {
  const { file, frontMatter, result } = parseAndValidate(
    cwd, args, 'usage: df-tools ui sheet <spec> [--renders <dir>] [--refs <dir>] --out <file> [--patterns <catalogue.json>]'
  );

  if (!result.ok) {
    process.stdout.write(`${JSON.stringify({ ...result, spec: file }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const givenOut = flagValue(args, '--out');
  if (givenOut === undefined || !givenOut || givenOut.startsWith('--')) {
    error('--out <file> is required: df-tools ui sheet <spec> [--renders <dir>] [--refs <dir>] --out <file>');
  }
  const out = path.resolve(cwd, givenOut);

  const renders = resolveDir(cwd, args, '--renders');
  const refs = resolveDir(cwd, args, '--refs');

  // A MISSING invariant row is not a violation and does not refuse the sheet — but it is a
  // check that DID NOT RUN. stderr, so the written file and stdout stay clean.
  const missingChecks = (result.errors || []).filter((e) => e.status === 'MISSING');
  for (const row of missingChecks) {
    process.stderr.write(`advisory: ${row.code} MISSING — ${row.msg}\n`);
  }
  if (missingChecks.length > 0) {
    process.stderr.write(
      `advisory: ${missingChecks.length} check(s) did not run for ${file}; a MISSING row is not a pass.\n`
    );
  }

  // Already validated above — `validate: false` here, exactly as `render` does, so the
  // invariant set has one home and runs once.
  const model = buildSheetModel(frontMatter, { renders, refs, validate: false });
  const html = renderSheetHtml(model, loadSheetTemplate(), { renders, refs });

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf-8');

  process.stdout.write(`${JSON.stringify({
    sheet_hash: sheetHash(model),
    out,
    states: model.rows.length,
    missing: model.rows.filter((r) => r.status === 'MISSING').map((r) => r.capture_id),
    engine_version: model.engine_version,
    schema_version: model.schema_version,
    spec: file
  }, null, 2)}\n`);

  // CRITICAL: process.exitCode, never process.exit() and never helpers.output().
  process.exitCode = 0;
}

/** A `--flag value` whose value is another flag is an ABSENT value, not a value of `"--by"`. */
function optionValue(args, name) {
  const v = flagValue(args, name);
  if (v === undefined || typeof v !== 'string' || v.startsWith('--')) return undefined;
  return v;
}

/**
 * `ui lock <spec> --sheet-hash <h> --by <email> [--at YYYY-MM-DD] [--patterns <c.json>]`
 *
 * What a human's approval at the §8.3 look-lock checkpoint actually RUNS. It records, in the
 * spec's own front matter, which review sheet was approved, by whom, when — and the sha256 of
 * `{routes, controls, states}` as they stood at that moment, so `ui spec validate` can say
 * afterwards whether the approval still covers what is on disk.
 *
 * ── REFUSALS ARE THE POINT ───────────────────────────────────────────────────
 * An invalid spec, a `--sheet-hash` that is not 64 hex, or an absent `--by` each exit 1 and
 * write NOTHING. A lock recorded against a broken spec is a lie with a signature on it, and an
 * approval nobody signed is not an approval. The verdict for an invalid spec is printed in
 * `validate`'s own shape so a caller that pipes either arm reads one format.
 *
 * `process.exitCode` throughout — never `process.exit()`, never `helpers.output()` (which
 * calls `process.exit(0)` unconditionally and would make the refusals unreachable).
 */
function cmdUiLock(cwd, args) {
  const { file, result } = parseAndValidate(
    cwd, args,
    'usage: df-tools ui lock <spec> --sheet-hash <64 hex> --by <email> [--at YYYY-MM-DD] [--patterns <catalogue.json>]'
  );

  // An invalid spec is refused BEFORE any flag is judged: the spec is the thing being signed,
  // and telling an author their `--by` is missing on a spec that does not validate buries the
  // finding that matters.
  if (!result.ok) {
    process.stdout.write(`${JSON.stringify({ ...result, lock: lockStatus(undefined), spec: file }, null, 2)}\n`);
    process.stderr.write(`Error: the spec does not validate; no lock was written to ${file}\n`);
    process.exitCode = 1;
    return;
  }

  // `writeLock` documents a `{ok:false, code, msg}` refusal for every condition it knows about,
  // and this catch is the backstop for the ones it does not: an unexpected throw is still a
  // refusal to the person at the terminal, never a stack trace. A stack trace tells an author
  // nothing about their spec, and it bypasses the one guarantee this arm makes — that a lock is
  // either written and reported, or refused with a reason.
  let written;
  try {
    written = writeLock(file, {
      sheetHash: optionValue(args, '--sheet-hash'),
      by: optionValue(args, '--by'),
      at: optionValue(args, '--at'),
      patterns: readPatternCatalogue(cwd, args)
    });
  } catch (e) {
    error(`no lock was written to ${file}: ${e && e.message ? e.message : e}`);
    return;
  }

  if (!written.ok) {
    // `writeLock` re-validates as its own guard (it is callable without this arm), so a verdict
    // can still come back here; a flag refusal is a one-line stderr message, not a stack trace.
    if (written.verdict) {
      process.stdout.write(`${JSON.stringify({ ...written.verdict, lock: lockStatus(undefined), spec: file }, null, 2)}\n`);
      process.stderr.write(`Error: ${written.msg}\n`);
      process.exitCode = 1;
      return;
    }
    error(written.msg);
  }

  const { acceptance } = written;
  process.stdout.write(`${JSON.stringify({
    spec: file,
    locked_sheet: acceptance.locked_sheet,
    locked_by: acceptance.locked_by,
    locked_at: acceptance.locked_at,
    locked_shape_hash: acceptance.locked_shape_hash,
    locked_section_hashes: acceptance.locked_section_hashes,
    engine_version: result.engine_version,
    schema_version: result.schema_version
  }, null, 2)}\n`);

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
  cmdUiSheet,
  cmdUiLock,
  SPEC_SUBCOMMANDS,
  RENDER_FLAGS
};
