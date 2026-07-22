'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// RED: imports resolve to the not-yet-implemented module under test.
const {
  checkScaffoldState,
  scaffoldUIEval,
} = require('./flutter-ui-eval-bootstrap.cjs');

// ─── Hand-built fixtures (habit 4 — no LLM-generated data) ───────────────────
//
// Each fixture is a fresh temp dir. We hand-write pubspec content and pre-create
// (or omit) the scaffold target paths + marker to drive each test-list case.

// Canonical scaffold target paths (kept in sync with the module).
const MANIFEST_REL = 'ui_eval/manifests/web.manifest.json';
const ADAPTER_REL = 'web_e2e/lib/uiEval/captureWeb.js';
const BASELINE_WEB_REL = 'web_e2e/tests/ui_eval/__screenshots__';
const BASELINE_GOLDENS_REL = 'test/ui_eval/goldens';
const PLAYWRIGHT_REL = 'playwright.config.js';
const MARKER_REL = '.planning/.flutter-ui-eval-bootstrap-done';

const FLUTTER_PUBSPEC = `name: x\ndependencies:\n  flutter:\n    sdk: flutter\n`;
const NON_FLUTTER_PUBSPEC = `name: x\ndependencies:\n  http: ^1.0.0\n`;

function makeProject({
  pubspec,            // 'flutter' | 'non-flutter' | 'none'
  hasManifest,
  hasAdapter,
  hasBaselineDirs,
  hasPlaywrightProject,
  hasMarker,
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-eval-bootstrap-'));
  if (pubspec === 'flutter') {
    fs.writeFileSync(path.join(tmp, 'pubspec.yaml'), FLUTTER_PUBSPEC);
  } else if (pubspec === 'non-flutter') {
    fs.writeFileSync(path.join(tmp, 'pubspec.yaml'), NON_FLUTTER_PUBSPEC);
  }
  // pubspec === 'none' → write nothing.
  if (hasManifest) {
    fs.mkdirSync(path.join(tmp, path.dirname(MANIFEST_REL)), { recursive: true });
    fs.writeFileSync(path.join(tmp, MANIFEST_REL),
      JSON.stringify({ objective: 'pre', samples: 3, flakeBudget: 1, states: [] }, null, 2));
  }
  if (hasAdapter) {
    fs.mkdirSync(path.join(tmp, path.dirname(ADAPTER_REL)), { recursive: true });
    fs.writeFileSync(path.join(tmp, ADAPTER_REL), '// pre-existing adapter\n');
  }
  if (hasBaselineDirs) {
    fs.mkdirSync(path.join(tmp, BASELINE_WEB_REL), { recursive: true });
    fs.mkdirSync(path.join(tmp, BASELINE_GOLDENS_REL), { recursive: true });
  }
  if (hasPlaywrightProject) {
    fs.writeFileSync(path.join(tmp, PLAYWRIGHT_REL),
      `module.exports = { projects: [{ name: 'ui_eval' }] };\n`);
  }
  if (hasMarker) {
    fs.mkdirSync(path.join(tmp, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(tmp, MARKER_REL), '');
  }
  return tmp;
}

// ─── Pure planner: checkScaffoldState (B1-B4) ────────────────────────────────

test.describe('checkScaffoldState (P4 pure planner)', () => {

  test('B1 — clean flutter repo, nothing scaffolded → action:scaffold, full missing list', () => {
    const tmp = makeProject({ pubspec: 'flutter' });
    const result = checkScaffoldState({ projectDir: tmp });
    assert.strictEqual(result.action, 'scaffold');
    assert.ok(result.missing.includes('manifest'), 'missing manifest');
    assert.ok(result.missing.includes('adapter'), 'missing adapter');
    assert.ok(result.missing.includes('baseline_dirs'), 'missing baseline_dirs');
    assert.ok(result.missing.includes('playwright_project'), 'missing playwright_project');
  });

  test('B2 — non-flutter repo → action:skip, flutter-not-detected, nothing to scaffold', () => {
    const tmp = makeProject({ pubspec: 'non-flutter' });
    const result = checkScaffoldState({ projectDir: tmp });
    assert.strictEqual(result.action, 'skip');
    assert.match(result.reason, /flutter-not-detected/);
    assert.deepStrictEqual(result.missing, []);
  });

  test('B2b — no pubspec at all → action:skip, flutter-not-detected', () => {
    const tmp = makeProject({ pubspec: 'none' });
    const result = checkScaffoldState({ projectDir: tmp });
    assert.strictEqual(result.action, 'skip');
    assert.match(result.reason, /flutter-not-detected/);
    assert.deepStrictEqual(result.missing, []);
  });

  test('B3 — all scaffolds present + marker present → action:skip, no-op, missing:[]', () => {
    const tmp = makeProject({
      pubspec: 'flutter',
      hasManifest: true,
      hasAdapter: true,
      hasBaselineDirs: true,
      hasPlaywrightProject: true,
      hasMarker: true,
    });
    const result = checkScaffoldState({ projectDir: tmp });
    assert.strictEqual(result.action, 'skip');
    assert.deepStrictEqual(result.missing, []);
  });

  test('B4 — manifest present but adapter missing → action:scaffold, partial missing (adapter only, not manifest)', () => {
    const tmp = makeProject({
      pubspec: 'flutter',
      hasManifest: true,
      hasAdapter: false,
      hasBaselineDirs: true,
      hasPlaywrightProject: true,
      hasMarker: false,
    });
    const result = checkScaffoldState({ projectDir: tmp });
    assert.strictEqual(result.action, 'scaffold');
    assert.ok(result.missing.includes('adapter'), 'adapter is missing');
    assert.ok(!result.missing.includes('manifest'), 'manifest NOT missing (already present)');
  });
});

// ─── Impure writer: scaffoldUIEval (B5-B6, idempotency) ──────────────────────

// Recursively count files (not dirs) under a root — used to assert "no new files".
function countFiles(root) {
  let n = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) n += countFiles(p);
    else n += 1;
  }
  return n;
}

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test.describe('scaffoldUIEval (P4 impure writer)', () => {

  test('B5 — scaffold on clean flutter repo CREATES manifest(JSON w/ states[]), adapter, baseline dirs, ui_eval playwright project, marker-LAST', () => {
    const tmp = makeProject({ pubspec: 'flutter' });
    const result = scaffoldUIEval({ projectDir: tmp });
    assert.strictEqual(result.action, 'scaffolded');

    // Manifest is a valid Shape-A skeleton: object with an Array `states`.
    const manifestPath = path.join(tmp, MANIFEST_REL);
    assert.ok(fs.existsSync(manifestPath), 'manifest file exists');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.ok(Array.isArray(manifest.states), 'manifest.states is an Array');

    // Capture-adapter stub.
    assert.ok(fs.existsSync(path.join(tmp, ADAPTER_REL)), 'adapter stub exists');

    // Baseline dirs.
    assert.ok(fs.existsSync(path.join(tmp, BASELINE_WEB_REL)), 'web baseline dir exists');
    assert.ok(fs.existsSync(path.join(tmp, BASELINE_GOLDENS_REL)), 'goldens baseline dir exists');

    // ui_eval playwright project entry.
    const cfg = fs.readFileSync(path.join(tmp, PLAYWRIGHT_REL), 'utf-8');
    assert.match(cfg, /ui_eval/, 'playwright.config.js contains ui_eval project token');

    // Marker present (written LAST).
    assert.ok(fs.existsSync(path.join(tmp, MARKER_REL)), 'marker exists');
  });

  test('B6 — scaffold run twice is idempotent: 2nd run is a no-op (no new files, exactly one ui_eval, reports skip)', () => {
    const tmp = makeProject({ pubspec: 'flutter' });

    const first = scaffoldUIEval({ projectDir: tmp });
    assert.strictEqual(first.action, 'scaffolded');
    const filesAfterFirst = countFiles(tmp);
    const cfgAfterFirst = fs.readFileSync(path.join(tmp, PLAYWRIGHT_REL), 'utf-8');
    assert.strictEqual(occurrences(cfgAfterFirst, "name: 'ui_eval'"), 1, 'exactly one ui_eval after first run');

    const second = scaffoldUIEval({ projectDir: tmp });
    assert.strictEqual(second.action, 'skip', 'second run reports no-op skip');
    const filesAfterSecond = countFiles(tmp);
    assert.strictEqual(filesAfterSecond, filesAfterFirst, 'no new files on second run');

    const cfgAfterSecond = fs.readFileSync(path.join(tmp, PLAYWRIGHT_REL), 'utf-8');
    assert.strictEqual(occurrences(cfgAfterSecond, "name: 'ui_eval'"), 1, 'still exactly one ui_eval after second run');
  });

  test('B6b — second run on a repo that HAD a pre-existing playwright.config (with ui_eval) does not duplicate', () => {
    const tmp = makeProject({ pubspec: 'flutter', hasPlaywrightProject: true });
    const r = scaffoldUIEval({ projectDir: tmp });
    // playwright_project already present, so it is NOT in missing; other items get scaffolded.
    assert.strictEqual(r.action, 'scaffolded');
    const cfg = fs.readFileSync(path.join(tmp, PLAYWRIGHT_REL), 'utf-8');
    assert.strictEqual(occurrences(cfg, "name: 'ui_eval'"), 1, 'no duplicate ui_eval entry');
  });
});
