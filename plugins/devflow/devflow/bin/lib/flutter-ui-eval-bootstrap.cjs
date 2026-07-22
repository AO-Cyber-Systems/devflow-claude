'use strict';

/**
 * flutter-ui-eval-bootstrap.cjs — UI-visual-eval scaffolder (P4).
 *
 * Sibling to flutter-ui-bootstrap.cjs. Scaffolds the visual-eval wiring into any
 * `stack:flutter` repo so every Flutter project inherits the eden-biz hand-wiring
 * as a generated default:
 *   - a Shape-A manifest skeleton (ui_eval/manifests/web.manifest.json)
 *   - a capture-adapter stub (web_e2e/lib/uiEval/captureWeb.js)
 *   - baseline dirs (web __screenshots__ + widget goldens)
 *   - a `ui_eval` Playwright project entry (playwright.config.js)
 *   - a `.planning/.flutter-ui-eval-bootstrap-done` marker (written LAST)
 *
 * Pure logic, no LLM, no network. Two-part split mirrors flutter-ui-bootstrap.cjs:
 *   - checkScaffoldState({ projectDir })  — PURE planner (existence-reads only, no writes)
 *   - scaffoldUIEval({ projectDir })      — impure writer (idempotent, marker-last)
 *   - cmdFlutterUIEvalBootstrap(...)       — CLI I/O wrapper
 *
 * Flutter detection is delegated to detectPubspecFlutter from flutter-ui-scope.cjs
 * (locked reuse per OBJECTIVE.md P4 — no reinvented pubspec parse).
 *
 * Idempotency contract: scaffolding is a no-op on re-run. Presence is decided by
 * checking each target path; the marker is the LAST write so a failed run retries.
 */

const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');
const { detectPubspecFlutter } = require('./flutter-ui-scope.cjs');

// ─── Canonical scaffold target paths (repo-relative) ─────────────────────────

const MANIFEST_REL = path.join('ui_eval', 'manifests', 'web.manifest.json');
const ADAPTER_REL = path.join('web_e2e', 'lib', 'uiEval', 'captureWeb.js');
const BASELINE_WEB_REL = path.join('web_e2e', 'tests', 'ui_eval', '__screenshots__');
const BASELINE_GOLDENS_REL = path.join('test', 'ui_eval', 'goldens');
const PLAYWRIGHT_REL = 'playwright.config.js';
const MARKER_REL = path.join('.planning', '.flutter-ui-eval-bootstrap-done');

// Token used to detect (and to mark) the `ui_eval` Playwright project entry.
const PLAYWRIGHT_PROJECT_TOKEN = "name: 'ui_eval'";

// ─── Scaffold content templates (authored, never LLM-generated) ──────────────

/** Shape-A manifest skeleton — JSON-parseable, matches the engine's loadManifest. */
const MANIFEST_SKELETON = JSON.stringify(
  {
    objective: '<TODO: describe the screen/flow under visual evaluation>',
    samples: 3,
    flakeBudget: 1,
    states: [
      // Example Shape-A state (uncomment + edit):
      // {
      //   "state_id": "dashboard-populated",
      //   "route": "/dashboard",
      //   "data_state": "populated",
      //   "viewport": { "width": 1280, "height": 800 },
      //   "expected": "Populated revenue chart and a non-empty table; no overflow, no blank regions.",
      //   "capture_path": "./captures/dashboard-populated.capture.json",
      //   "screenshot_path": "./captures/dashboard-populated.png"
      // }
    ],
  },
  null,
  2,
) + '\n';

/** Capture-adapter stub — web Playwright adapter scaffold. */
const ADAPTER_STUB = `// captureWeb.js — UI-visual-eval web capture adapter (scaffolded by df-tools flutter-ui bootstrap).
//
// Drives the Flutter-web build under Playwright and emits one capture artifact per
// manifest state ({ label, screenshot_path, ... }) that the offline judge consumes.
//
// TODO: implement captureState(page, state) to:
//   1. navigate to state.route on the running flutter-web build
//   2. apply state.viewport + state.data_state
//   3. screenshot to state.screenshot_path
//   4. write the sibling state.capture_path JSON
//
// See bin/lib/__fixtures__/flutter-ui-eval/*.capture.json for the capture shape.

'use strict';

async function captureState(/* page, state */) {
  throw new Error('captureWeb.captureState not implemented — scaffolded stub');
}

module.exports = { captureState };
`;

/** Playwright config scaffold — created when no playwright.config.js exists. */
const PLAYWRIGHT_CONFIG_NEW = `// playwright.config.js — scaffolded by df-tools flutter-ui bootstrap.
// Adds a dedicated \`ui_eval\` project for UI-visual-eval capture runs.
module.exports = {
  projects: [
    {
      ${PLAYWRIGHT_PROJECT_TOKEN},
      testDir: './web_e2e/tests/ui_eval',
      snapshotDir: './web_e2e/tests/ui_eval/__screenshots__',
    },
  ],
};
`;

/** Appended block when a playwright.config.js exists but lacks the ui_eval project. */
const PLAYWRIGHT_PROJECT_APPEND = `

// ── Appended by df-tools flutter-ui bootstrap: UI-visual-eval project ──
// Merge the following project entry into your existing config's \`projects\` array:
//   {
//     ${PLAYWRIGHT_PROJECT_TOKEN},
//     testDir: './web_e2e/tests/ui_eval',
//     snapshotDir: './web_e2e/tests/ui_eval/__screenshots__',
//   }
`;

// ─── checkScaffoldState (pure planner) ───────────────────────────────────────

/**
 * Pure function: decide what UI-visual-eval scaffolding is missing in projectDir.
 * Performs existence-reads only — NEVER writes.
 *
 * @param {object} opts
 * @param {string} opts.projectDir - absolute path to the candidate repo root
 * @returns {{ action:'scaffold'|'skip', missing:string[], reason?:string }}
 */
function checkScaffoldState({ projectDir }) {
  if (!projectDir) {
    return { action: 'skip', missing: [], reason: 'projectDir-required' };
  }

  // Flutter gate — reuse detectPubspecFlutter (no reinvented pubspec parse).
  const pubspecPath = path.join(projectDir, 'pubspec.yaml');
  const pubspecContent = fs.existsSync(pubspecPath) ? safeRead(pubspecPath) : '';
  if (!detectPubspecFlutter(pubspecContent).fired) {
    return { action: 'skip', missing: [], reason: 'flutter-not-detected' };
  }

  const missing = [];

  if (!fs.existsSync(path.join(projectDir, MANIFEST_REL))) missing.push('manifest');
  if (!fs.existsSync(path.join(projectDir, ADAPTER_REL))) missing.push('adapter');

  const baselineDirsPresent =
    fs.existsSync(path.join(projectDir, BASELINE_WEB_REL)) &&
    fs.existsSync(path.join(projectDir, BASELINE_GOLDENS_REL));
  if (!baselineDirsPresent) missing.push('baseline_dirs');

  if (!playwrightProjectPresent(projectDir)) missing.push('playwright_project');

  if (missing.length === 0) {
    return { action: 'skip', missing: [] };
  }
  return { action: 'scaffold', missing };
}

// ─── scaffoldUIEval (impure writer) ──────────────────────────────────────────

/**
 * Idempotent writer: scaffolds whatever checkScaffoldState reports missing, then
 * writes the marker LAST. A re-run is a no-op (returns the planner's skip result).
 *
 * @param {object} opts
 * @param {string} opts.projectDir - absolute path to the repo root
 * @returns {{ action:'scaffolded'|'skip', created?:string[], missing?:string[], reason?:string }}
 */
function scaffoldUIEval({ projectDir }) {
  const state = checkScaffoldState({ projectDir });
  if (state.action !== 'scaffold') {
    // Non-flutter skip, or all-present no-op (B3/B6).
    return state;
  }

  const created = [];
  const missing = new Set(state.missing);

  if (missing.has('manifest')) {
    const dest = path.join(projectDir, MANIFEST_REL);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, MANIFEST_SKELETON);
    created.push('manifest');
  }

  if (missing.has('adapter')) {
    const dest = path.join(projectDir, ADAPTER_REL);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, ADAPTER_STUB);
    created.push('adapter');
  }

  if (missing.has('baseline_dirs')) {
    fs.mkdirSync(path.join(projectDir, BASELINE_WEB_REL), { recursive: true });
    fs.mkdirSync(path.join(projectDir, BASELINE_GOLDENS_REL), { recursive: true });
    created.push('baseline_dirs');
  }

  if (missing.has('playwright_project')) {
    const dest = path.join(projectDir, PLAYWRIGHT_REL);
    if (!fs.existsSync(dest)) {
      fs.writeFileSync(dest, PLAYWRIGHT_CONFIG_NEW);
    } else {
      // Append ONLY if the ui_eval token is absent (keeps re-run a true no-op).
      const existing = safeRead(dest) || '';
      if (!existing.includes(PLAYWRIGHT_PROJECT_TOKEN)) {
        fs.appendFileSync(dest, PLAYWRIGHT_PROJECT_APPEND);
      }
    }
    created.push('playwright_project');
  }

  // Marker LAST — only reached if every earlier write succeeded, so a failed
  // run leaves no marker and the next run retries the missing pieces.
  const markerPath = path.join(projectDir, MARKER_REL);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, '');

  return { action: 'scaffolded', created };
}

// ─── cmdFlutterUIEvalBootstrap (CLI I/O wrapper) ─────────────────────────────

const USAGE = {
  command: 'flutter-ui bootstrap',
  usage: 'df-tools flutter-ui bootstrap [project-dir] [--raw]',
  description:
    'Scaffold the UI-visual-eval wiring (manifest skeleton, capture adapter, baseline dirs, ui_eval Playwright project) into a stack:flutter repo. Idempotent; skips non-flutter repos.',
};

/**
 * CLI entry point: resolve target dir, run the scaffolder, emit the result.
 * `--help`/`-h` emits a usage object and exits 0.
 *
 * @param {string} cwd
 * @param {string} projectDir - optional override path (args[2] from CLI)
 * @param {boolean} raw
 */
function cmdFlutterUIEvalBootstrap(cwd, projectDir, raw) {
  if (projectDir === '--help' || projectDir === '-h') {
    output(USAGE, raw);
    return;
  }
  const target = projectDir
    ? (path.isAbsolute(projectDir) ? projectDir : path.join(cwd, projectDir))
    : cwd;
  const result = scaffoldUIEval({ projectDir: target });
  output(result, raw);
}

// ─── internals ───────────────────────────────────────────────────────────────

function safeRead(p) {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

function playwrightProjectPresent(projectDir) {
  const cfg = path.join(projectDir, PLAYWRIGHT_REL);
  if (!fs.existsSync(cfg)) return false;
  return (safeRead(cfg) || '').includes(PLAYWRIGHT_PROJECT_TOKEN);
}

module.exports = {
  checkScaffoldState,
  scaffoldUIEval,
  cmdFlutterUIEvalBootstrap,
};
