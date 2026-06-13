'use strict';
const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');

// ─── State Description Map ───────────────────────────────────────────────────
// Human-readable expected text per common state name. Custom states fall back to
// a generic template. Keys must be lowercase to match TRD state values verbatim.
// Per TRD 10-06 gotchas: loading, data, error, empty, initial all have specific text.

const STATE_DESCRIPTIONS = {
  loading: 'a loading spinner is visible and no other content is rendered',
  data: 'content renders correctly with no spinner or error overlay',
  error: 'an error message is shown with a retry option (or equivalent UX)',
  empty: 'an empty-state message is shown (no spinner, no error)',
  initial: 'the initial UI is visible (no user action taken yet)',
};

/**
 * Pure function: generate UAT.md content from a parsed objective's TRDs + Maestro flows.
 *
 * Per user correction (2026-05-24): web is DEFAULT coverage (not opt-in).
 * - State rows expand per (state, platform): platform=[mobile, web] doubles rows per artifact.
 * - Maestro rows are MOBILE-ONLY by design (mobile-dev-inc/maestro#2591). No web branching.
 * - Web verification rows use `flutter drive` (per TRD 10-02 "Web verification mechanism").
 *
 * @param {object} input
 * @param {string} input.objective - objective slug
 * @param {string[]} input.sourceFiles - SUMMARY.md filenames
 * @param {object[]} input.trds - parsed TRD frontmatter objects (must_haves, type, platform, etc.)
 * @param {string[]} input.maestroFlows - paths to .maestro/*.yaml flow files
 * @returns {string} UAT.md content (markdown string)
 */
function generateUAT({ objective, sourceFiles, trds, maestroFlows }) {
  const now = new Date().toISOString();

  // Filter to only Flutter UI TRDs — non-UI TRDs contribute zero rows.
  const flutterTrds = (trds || []).filter(t => t.type === 'ui' && t.stack === 'flutter');

  const rows = [];
  let n = 1;

  // ─── State-coverage rows: one per (artifact, state, platform) ────────────
  // TRD with platform=[mobile, web] + states=[loading, data, error] = 6 rows per artifact.
  for (const trd of flutterTrds) {
    const platforms = trd.platform || ['mobile', 'web'];
    const artifacts = (trd.must_haves && trd.must_haves.artifacts) || [];
    for (const art of artifacts) {
      for (const state of art.states || []) {
        for (const platform of platforms) {
          const desc = STATE_DESCRIPTIONS[state] || `the \`${state}\` state UI is rendered correctly`;
          const artBase = path.basename(art.path || 'artifact', '.dart');
          rows.push(`### ${n}. ${artBase} renders \`${state}\` state correctly on ${platform}
expected: Open the screen on ${platform}, trigger ${state} state, verify ${desc}.
result: [pending]
`);
          n++;
        }
      }
    }
  }

  // ─── Maestro flow rows — MOBILE-ONLY by design ───────────────────────────
  // Maestro on Flutter web is blocked upstream (mobile-dev-inc/maestro#2591).
  // Web verification is handled separately via flutter drive rows below.
  const maestroFlowsList = maestroFlows || [];
  for (const flow of maestroFlowsList) {
    const flowBase = path.basename(flow);
    rows.push(`### ${n}. Maestro flow: ${flowBase} (mobile)
expected: Run \`maestro test ${flow}\` on a mobile device, verify all assertions pass.
result: [pending]
`);
    n++;
  }

  // ─── Web-integration rows — one per artifact when web is in platform ─────
  // Web verification uses flutter drive (NOT Maestro). See TRD 10-02 "Web verification mechanism".
  // These rows are DEFAULT (not opt-in) whenever the TRD declares web in platform.
  for (const trd of flutterTrds) {
    const platforms = trd.platform || ['mobile', 'web'];
    if (!platforms.includes('web')) continue;
    const artifacts = (trd.must_haves && trd.must_haves.artifacts) || [];
    for (const art of artifacts) {
      const integrationPath = art.tests && art.tests.integration;
      if (!integrationPath) continue;
      const artBase = path.basename(art.path || 'artifact', '.dart');
      rows.push(`### ${n}. Web integration: ${artBase}
expected: Run \`flutter drive --driver=test_driver/integration_test.dart --target=${integrationPath} -d chrome\` and verify all assertions pass (chromedriver must be running on port 4444).
result: [pending]
`);
      n++;
    }
  }

  const total = rows.length;

  // ─── Frontmatter — conforms to existing templates/UAT.md shape ──────────
  const frontmatter = `---
status: testing
objective: ${objective}
source: [${(sourceFiles || []).join(', ')}]
started: ${now}
updated: ${now}
---
`;

  const body = `
## Current Test

number: 1
name: ${total > 0 ? '(first test)' : '[no tests]'}
expected: |
  See Tests section below.
awaiting: user response

## Tests

${rows.join('\n')}

## Summary

total: ${total}
passed: 0
issues: 0
pending: ${total}
skipped: 0

## Gaps

<!-- Auto-populated when issues found during walkthrough -->
`;

  return frontmatter + body;
}

/**
 * df-tools command handler: reads objective dir, parses TRDs, lists .maestro/ files,
 * calls generateUAT, and writes .planning/objectives/<obj-dir>/<obj>-UAT.md.
 *
 * Safety: refuses to overwrite a UAT.md that already has non-pending results
 * or a non-testing status (i.e., a walkthrough in progress or complete).
 *
 * @param {string} cwd - working directory
 * @param {string} objectiveArg - objective slug or number
 * @param {boolean} raw - --raw flag
 */
function cmdGenerateUAT(cwd, objectiveArg, raw) {
  if (!objectiveArg) {
    output({ error: 'objective argument required' }, raw);
    return;
  }

  const { extractFrontmatter } = require('./frontmatter.cjs');
  const { parseMustHavesArtifacts } = require('./trd-artifacts.cjs');
  const objectivesRoot = path.join(cwd, '.planning', 'objectives');

  // Find the objective directory by prefix match
  const padded = String(objectiveArg).padStart(2, '0');
  let dirs;
  try {
    dirs = fs.readdirSync(objectivesRoot).filter(d => d.startsWith(padded + '-') || d === objectiveArg);
  } catch {
    output({ error: 'objective not found', objective: objectiveArg }, raw);
    return;
  }

  if (dirs.length === 0) {
    output({ error: 'objective not found', objective: objectiveArg }, raw);
    return;
  }

  const objDir = path.join(objectivesRoot, dirs[0]);

  // Gather TRDs and source SUMMARY files
  const trds = [];
  const sourceFiles = [];
  for (const f of fs.readdirSync(objDir)) {
    if (f.endsWith('-TRD.md')) {
      try {
        const content = fs.readFileSync(path.join(objDir, f), 'utf-8');
        const fm = extractFrontmatter(content);
        // Override flattened-string artifacts with structured entries from the raw-FM scanner.
        const structuredArtifacts = parseMustHavesArtifacts(content);
        if (structuredArtifacts.length > 0) {
          fm.must_haves = fm.must_haves || {};
          fm.must_haves.artifacts = structuredArtifacts;
        }
        trds.push(fm);
      } catch {
        // Skip unreadable TRDs gracefully
      }
    } else if (f.endsWith('-SUMMARY.md')) {
      sourceFiles.push(f);
    }
  }

  // Gather Maestro flows from cwd's .maestro/ directory (if present)
  const maestroDir = path.join(cwd, '.maestro');
  const maestroFlows = [];
  if (fs.existsSync(maestroDir)) {
    for (const f of fs.readdirSync(maestroDir)) {
      if (f.endsWith('.yaml')) {
        maestroFlows.push(path.join('.maestro', f));
      }
    }
  }

  const uat = generateUAT({ objective: dirs[0], sourceFiles, trds, maestroFlows });

  // Safety check: refuse to overwrite a UAT.md with non-pending results or non-testing status
  const uatPath = path.join(objDir, `${dirs[0]}-UAT.md`);
  if (fs.existsSync(uatPath)) {
    const existing = fs.readFileSync(uatPath, 'utf-8');
    if (
      /result:\s*(pass|issue|skipped)/.test(existing) ||
      /status:\s*(complete|diagnosed)/.test(existing)
    ) {
      output({ error: 'UAT.md already in use; refusing to overwrite', uat_path: uatPath }, raw);
      return;
    }
  }

  fs.writeFileSync(uatPath, uat, 'utf-8');
  output({
    generated: true,
    uat_path: uatPath,
    test_count: (uat.match(/^### \d+\./gm) || []).length,
  }, raw);
}

module.exports = { generateUAT, cmdGenerateUAT };
