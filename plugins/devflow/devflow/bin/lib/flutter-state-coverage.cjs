'use strict';

/**
 * flutter-state-coverage.cjs — Flutter widget test state-coverage verifier (REQ-10-05)
 *
 * Exports:
 *   loadCatalog(catalogPath)  — Parse references/flutter-state-patterns.md into regex map
 *   parseSimpleYamlList(body) — Internal tiny YAML-list parser (exported for testing)
 *   verifyCoverage({stateManagement, declaredStates, widgetTestContent, catalog})
 *                             — Pure function; returns coverage decision per declared state
 *   cmdVerifyFlutterStateCoverage(cwd, trdPath, raw)
 *                             — df-tools subcommand handler
 *
 * Anti-patterns avoided:
 *   - No external YAML library (constrained shape, parsed inline ~35 lines)
 *   - No blocking on MEDIUM/LOW misses (confidence model per TRD 10-02)
 *   - No re-implementation of api-contract drift detection (TRD 10-08 handles that)
 */

const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');

// ─── Catalog Loader ───────────────────────────────────────────────────────────

/**
 * Parse the markdown catalog file (references/flutter-state-patterns.md) into a
 * structured catalog object keyed by library name.
 *
 * Strategy: find each ```yaml ... ``` block and use the first key inside it
 * (e.g., `riverpod:`, `bloc:`, `setState:`) to determine the library. This is
 * more robust than heading-based matching since the YAML key IS the canonical library name.
 *
 * @param {string} catalogPath — absolute path to flutter-state-patterns.md
 * @returns {{ riverpod: Entry[], bloc: Entry[], setState: Entry[] }}
 */
function loadCatalog(catalogPath) {
  const content = fs.readFileSync(catalogPath, 'utf-8');
  const catalog = { riverpod: [], bloc: [], setState: [] };

  // Extract all ```yaml ... ``` blocks from the markdown
  const yamlBlockRe = /```yaml\n([\s\S]+?)\n```/g;
  let match;
  while ((match = yamlBlockRe.exec(content)) !== null) {
    const body = match[1];
    // The first line of each block is the top-level key, e.g. "riverpod:"
    const firstLine = body.split('\n')[0].trim();
    const libKeyMatch = firstLine.match(/^(\w+):$/);
    if (!libKeyMatch) continue;
    const lib = libKeyMatch[1]; // "riverpod", "bloc", or "setState"
    if (!Object.prototype.hasOwnProperty.call(catalog, lib)) continue;

    // Skip the first line (the top-level key) and parse the entries below it
    const listBody = body.split('\n').slice(1).join('\n');
    catalog[lib] = parseSimpleYamlList(listBody);
  }

  return catalog;
}

/**
 * Tiny YAML-list-of-objects parser for the constrained catalog shape.
 *
 * Handles entries of the form:
 *   - name: foo
 *     pattern: '...'
 *     covers: [a, b]
 *     confidence: HIGH
 *     note: "..."
 *
 * Does NOT handle: multiline strings, nested objects, non-inline arrays, anchors.
 *
 * @param {string} yamlBody — the list content (lines starting with "  - name: ...")
 * @returns {Array<{name:string, pattern:string, covers:string[], confidence:string, note?:string}>}
 */
function parseSimpleYamlList(yamlBody) {
  const entries = [];
  const lines = yamlBody.split('\n');
  let current = null;

  for (const line of lines) {
    // New list entry: "  - name: ..." (2 or 4 spaces + dash + name)
    const nameMatch = line.match(/^\s+-\s+name:\s*(.+)/);
    if (nameMatch) {
      if (current) entries.push(current);
      current = { name: nameMatch[1].trim() };
      continue;
    }
    if (!current) continue;

    // Key-value pair inside an entry
    const kvMatch = line.match(/^\s+(\w+):\s*(.*)/);
    if (!kvMatch) continue;
    const [, key, rawValue] = kvMatch;
    let value = rawValue.trim();

    // Strip surrounding single or double quotes
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }

    // Parse inline YAML arrays: [a, b, c] or []
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      value = inner === '' ? [] : inner.split(',').map(s => s.trim()).filter(Boolean);
    }

    current[key] = value;
  }

  if (current) entries.push(current);
  return entries;
}

// ─── Coverage Verifier ────────────────────────────────────────────────────────

/**
 * Pure function — verify that each declared state is covered by the widget test content.
 *
 * Confidence model (from TRD 10-02 / flutter-state-patterns.md):
 *   HIGH miss  → blocker (required for verification pass)
 *   MEDIUM/LOW miss → advisory (surface in notes, not gaps)
 *
 * @param {object} opts
 * @param {string}   opts.stateManagement   — 'riverpod' | 'bloc' | 'setState' | 'other'
 * @param {string[]} opts.declaredStates    — states declared in TRD artifact (e.g. ['loading','data','error'])
 * @param {string}   opts.widgetTestContent — full text content of the widget test file
 * @param {object}   opts.catalog           — catalog from loadCatalog()
 *
 * @returns {{
 *   status: 'verified'|'partial'|'missing'|'skipped',
 *   coverage: {[state]: {matched:boolean, matchedBy:string|null, confidence:string|null}},
 *   blockers: string[],
 *   advisories: string[]
 * }}
 */
function verifyCoverage({ stateManagement, declaredStates, widgetTestContent, catalog }) {
  // Graceful degradation for unknown/other state management
  if (stateManagement === 'other' || !Object.prototype.hasOwnProperty.call(catalog, stateManagement)) {
    return {
      status: 'skipped',
      coverage: {},
      blockers: [],
      advisories: [`regex skipped for state_management:${stateManagement} — manual review recommended`],
    };
  }

  const patterns = catalog[stateManagement];
  const coverage = {};
  const blockers = [];
  const advisories = [];

  for (const state of declaredStates) {
    // Find all catalog patterns that cover this state
    const relevant = patterns.filter(p => Array.isArray(p.covers) && p.covers.includes(state));

    let matched = false;
    let matchedBy = null;
    let matchedConf = null;

    for (const p of relevant) {
      try {
        const re = new RegExp(p.pattern);
        if (re.test(widgetTestContent)) {
          // Record match; prefer HIGH-confidence matches over lower ones
          if (!matched || p.confidence === 'HIGH') {
            matched = true;
            matchedBy = p.name;
            matchedConf = p.confidence;
          }
          if (p.confidence === 'HIGH') break; // short-circuit — HIGH match is definitive
        }
      } catch (e) {
        advisories.push(`bad regex in catalog pattern '${p.name}': ${e.message}`);
      }
    }

    coverage[state] = { matched, matchedBy, confidence: matchedConf };

    if (!matched) {
      // Check if any HIGH-confidence pattern was supposed to cover this state
      const hasHighPattern = relevant.some(p => p.confidence === 'HIGH');
      if (hasHighPattern) {
        blockers.push(state);
      } else if (relevant.length > 0) {
        advisories.push(`state '${state}' has only MEDIUM/LOW-confidence patterns and none matched — manual review recommended`);
      } else {
        advisories.push(`state '${state}' has no catalog pattern for '${stateManagement}' — manual review recommended`);
      }
    }
  }

  // Determine aggregate status
  let status;
  if (blockers.length === declaredStates.length && declaredStates.length > 0) {
    status = 'missing';
  } else if (blockers.length > 0) {
    status = 'partial';
  } else {
    status = 'verified';
  }

  return { status, coverage, blockers, advisories };
}

// ─── df-tools Subcommand Handler ──────────────────────────────────────────────

/**
 * df-tools handler for: verify flutter-state-coverage <trd-path> [--raw]
 *
 * Reads the TRD, loads the catalog, runs verifyCoverage per type:ui artifact,
 * and emits aggregated JSON.
 *
 * @param {string}  cwd     — working directory for path resolution
 * @param {string}  trdPath — path to the TRD (absolute or relative to cwd)
 * @param {boolean} raw     — if true, pass raw flag to output()
 */
function cmdVerifyFlutterStateCoverage(cwd, trdPath, raw) {
  if (!trdPath) {
    output({ error: 'TRD path required. Usage: verify flutter-state-coverage <trd-path>', ok: false }, raw);
    return;
  }

  const absTrd = path.isAbsolute(trdPath) ? trdPath : path.join(cwd, trdPath);
  if (!fs.existsSync(absTrd)) {
    output({ error: 'TRD not found', trd_path: trdPath, ok: false }, raw);
    return;
  }

  const { extractFrontmatter } = require('./frontmatter.cjs');
  const { parseMustHavesArtifacts } = require('./trd-artifacts.cjs');
  const trdContent = fs.readFileSync(absTrd, 'utf-8');
  const fm = extractFrontmatter(trdContent);

  // Only applicable to Flutter UI TRDs
  if (fm.type !== 'ui' || fm.stack !== 'flutter') {
    output({ status: 'not_applicable', reason: 'not a Flutter UI TRD', trd_path: absTrd }, raw);
    return;
  }

  // Resolve catalog relative to this lib file — always references/flutter-state-patterns.md
  const catalogPath = path.join(__dirname, '..', '..', 'references', 'flutter-state-patterns.md');
  const catalog = loadCatalog(catalogPath);

  const stateManagement = fm.state_management || 'other';
  // extractFrontmatter flattens nested block-array items to strings — use the
  // raw-FM scanner to recover structured {path, states, tests{}} entries.
  const artifacts = parseMustHavesArtifacts(trdContent);

  const perArtifact = [];
  for (const art of artifacts) {
    // Skip artifacts without states or widget test path (non-Flutter artifacts in mixed TRDs)
    if (!art || !art.states || !art.tests || !art.tests.widget) continue;

    const widgetPath = path.isAbsolute(art.tests.widget)
      ? art.tests.widget
      : path.join(cwd, art.tests.widget);

    if (!fs.existsSync(widgetPath)) {
      perArtifact.push({
        artifact: art.path || '(unknown)',
        status: 'missing_test_file',
        test_path: art.tests.widget,
        blockers: [art.tests.widget],
        advisories: [],
      });
      continue;
    }

    const widgetTestContent = fs.readFileSync(widgetPath, 'utf-8');
    const result = verifyCoverage({
      stateManagement,
      declaredStates: Array.isArray(art.states) ? art.states : [art.states],
      widgetTestContent,
      catalog,
    });
    perArtifact.push({ artifact: art.path || '(unknown)', ...result });
  }

  const overallStatus = perArtifact.length === 0
    ? 'not_applicable'
    : perArtifact.every(a => a.status === 'verified')
      ? 'verified'
      : 'partial';

  output({
    trd_path: absTrd,
    state_management: stateManagement,
    artifacts: perArtifact,
    overall: overallStatus,
  }, raw);
}

module.exports = {
  loadCatalog,
  parseSimpleYamlList,
  verifyCoverage,
  cmdVerifyFlutterStateCoverage,
};
