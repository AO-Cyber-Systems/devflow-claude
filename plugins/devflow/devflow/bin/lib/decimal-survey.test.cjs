'use strict';

// ─── Tests: decimal-survey.cjs ────────────────────────────────────────────────
//
// Groups:
//   SU — surveyDecimalObjectives() unit tests (injected FS)
//   CLI — cmdSurveyDecimalObjectives end-to-end via spawnSync
//   EX — export-lock / banner

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  surveyDecimalObjectives,
  _setRunFs,
  _resetMocks,
} = require('./decimal-survey.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

// ─── Fixture builder ──────────────────────────────────────────────────────────
//
// Builds a fake fs object representing a root directory with child project dirs.
// Each project entry is: { name, hasPlanning?, objectives[] }
// objectives[] items are directory name strings.

function buildFakeFs(projects, rootExists = true) {
  const rootName = '/fake-root';

  // index of projects by name for quick lookup
  const byName = {};
  for (const p of projects) {
    byName[p.name] = p;
  }

  return {
    existsSync(p) {
      if (p === rootName) return rootExists;
      // Check for .planning/objectives/ inside a project dir
      for (const proj of projects) {
        const planDir = path.join(rootName, proj.name, '.planning', 'objectives');
        if (p === planDir) {
          return proj.hasPlanning !== false; // default true
        }
      }
      return false;
    },
    readdirSync(p, opts) {
      if (p === rootName) {
        // Return DirEnt-like objects
        return projects.map(proj => ({
          name: proj.name,
          isDirectory: () => true,
        }));
      }
      // Reading objectives dir for a project
      for (const proj of projects) {
        const planDir = path.join(rootName, proj.name, '.planning', 'objectives');
        if (p === planDir) {
          return proj.objectives || [];
        }
      }
      throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    },
  };
}

// ─── Group SU: surveyDecimalObjectives() ─────────────────────────────────────

test('SU1: mixed usage — 2 projects scanned, 8 total, 1 decimal → recommendation keep', () => {
  // Project A: 5 integer + 1 decimal objectives
  // Project B: 3 integers + 0 decimals
  // Project C: no .planning/ (skipped)
  const fake = buildFakeFs([
    {
      name: 'project-a',
      objectives: [
        '01-foundation',
        '02-api',
        '03-auth',
        '04-ui',
        '05-deploy',
        '02.1-hotfix', // decimal
      ],
    },
    {
      name: 'project-b',
      objectives: [
        '01-setup',
        '02-core',
        '03-tests',
      ],
    },
    {
      name: 'project-c',
      hasPlanning: false,
      objectives: [],
    },
  ]);

  _setRunFs(fake);
  const result = surveyDecimalObjectives('/fake-root');
  _resetMocks();

  assert.strictEqual(result.projects_scanned, 2, 'only 2 projects have .planning/');
  assert.strictEqual(result.total_objectives, 9, '6 + 3 = 9 total');
  assert.strictEqual(result.decimal_objectives, 1, '1 decimal');
  // 1/9 = 11.1% → keep
  assert.ok(result.decimal_percentage > 5, 'percentage above threshold');
  assert.strictEqual(result.recommendation, 'keep', 'above 5% → keep');
  assert.strictEqual(result.threshold_percentage, 5.0);
  assert.ok(Array.isArray(result.by_project));
  assert.strictEqual(result.by_project.length, 2);
});

test('SU2: all integer objectives → recommendation drop', () => {
  const fake = buildFakeFs([
    {
      name: 'project-a',
      objectives: ['01-setup', '02-core', '03-tests', '04-deploy'],
    },
    {
      name: 'project-b',
      objectives: ['01-init', '02-api'],
    },
  ]);

  _setRunFs(fake);
  const result = surveyDecimalObjectives('/fake-root');
  _resetMocks();

  assert.strictEqual(result.decimal_objectives, 0, 'no decimals');
  assert.strictEqual(result.decimal_percentage, 0, '0%');
  assert.strictEqual(result.recommendation, 'drop', '0% < 5% → drop');
});

test('SU3: no projects with .planning/ → no_data recommendation', () => {
  const fake = buildFakeFs([
    { name: 'proj-no-planning', hasPlanning: false, objectives: [] },
    { name: 'another-noplanning', hasPlanning: false, objectives: [] },
  ]);

  _setRunFs(fake);
  const result = surveyDecimalObjectives('/fake-root');
  _resetMocks();

  assert.strictEqual(result.projects_scanned, 0, '0 projects scanned');
  assert.strictEqual(result.total_objectives, 0);
  assert.strictEqual(result.decimal_objectives, 0);
  assert.strictEqual(result.recommendation, 'no_data', 'no data → no_data');
});

test('SU4: root path does not exist → error object, no throw', () => {
  const fake = buildFakeFs([], false); // rootExists = false

  _setRunFs(fake);
  const result = surveyDecimalObjectives('/fake-root');
  _resetMocks();

  assert.ok(result.error, 'error field present');
  assert.ok(result.error.includes('not accessible') || result.error.includes('cannot read'));
  assert.strictEqual(result.recommendation, 'no_data');
  assert.strictEqual(result.projects_scanned, 0);
});

test('SU5: 100 integers + 1 decimal → 0.99% → drop', () => {
  const intObjs = Array.from({ length: 100 }, (_, i) => `${String(i + 1).padStart(2, '0')}-obj-${i + 1}`);
  const fake = buildFakeFs([
    {
      name: 'big-project',
      objectives: [...intObjs, '05.1-hotpatch'], // 1 decimal
    },
  ]);

  _setRunFs(fake);
  const result = surveyDecimalObjectives('/fake-root');
  _resetMocks();

  assert.strictEqual(result.total_objectives, 101);
  assert.strictEqual(result.decimal_objectives, 1);
  // 1/101 = 0.99% → drop
  assert.ok(result.decimal_percentage < 5, `${result.decimal_percentage}% should be < 5%`);
  assert.strictEqual(result.recommendation, 'drop', '0.99% → drop');
});

test('SU6: 5 integers + 1 decimal → 16.6% → keep', () => {
  const fake = buildFakeFs([
    {
      name: 'small-project',
      objectives: ['01-a', '02-b', '03-c', '04-d', '05-e', '03.1-hotfix'],
    },
  ]);

  _setRunFs(fake);
  const result = surveyDecimalObjectives('/fake-root');
  _resetMocks();

  assert.strictEqual(result.total_objectives, 6);
  assert.strictEqual(result.decimal_objectives, 1);
  assert.ok(result.decimal_percentage > 5, 'should be >5%');
  assert.strictEqual(result.recommendation, 'keep', '16.6% → keep');
});

// ─── Group CLI: cmdSurveyDecimalObjectives via spawnSync ──────────────────────

test('CLI1: df-tools survey decimal-objectives --root <fixture-root> exits 0, returns JSON shape', () => {
  // Build a real temp dir tree we can survey
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'df-survey-'));
  const projDir = path.join(tmpRoot, 'test-project');
  const objDir = path.join(projDir, '.planning', 'objectives');
  fs.mkdirSync(objDir, { recursive: true });
  fs.mkdirSync(path.join(objDir, '01-setup'));
  fs.mkdirSync(path.join(objDir, '02-core'));

  const r = spawnSync('node', [DF_TOOLS, 'survey', 'decimal-objectives', '--root', tmpRoot], {
    encoding: 'utf-8',
  });

  fs.rmSync(tmpRoot, { recursive: true, force: true });

  assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);

  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    assert.fail(`stdout not valid JSON: ${r.stdout}`);
  }

  assert.ok('projects_scanned' in parsed, 'has projects_scanned');
  assert.ok('total_objectives' in parsed, 'has total_objectives');
  assert.ok('decimal_objectives' in parsed, 'has decimal_objectives');
  assert.ok('decimal_percentage' in parsed, 'has decimal_percentage');
  assert.ok('threshold_percentage' in parsed, 'has threshold_percentage');
  assert.ok('recommendation' in parsed, 'has recommendation');
  assert.ok(Array.isArray(parsed.by_project), 'by_project is array');
  assert.strictEqual(parsed.projects_scanned, 1, '1 project found');
  assert.strictEqual(parsed.total_objectives, 2, '2 integer objectives');
  assert.strictEqual(parsed.decimal_objectives, 0, 'no decimals');
  assert.strictEqual(parsed.recommendation, 'drop', '0% → drop');
});

test('CLI2: df-tools survey decimal-objectives --root /nonexistent exits 1', () => {
  const r = spawnSync(
    'node',
    [DF_TOOLS, 'survey', 'decimal-objectives', '--root', '/nonexistent-df-survey-test-path-' + Date.now()],
    { encoding: 'utf-8' },
  );
  assert.strictEqual(r.status, 1, 'should exit 1 for inaccessible root');
  // Stdout should still be parseable JSON with error field
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    // May emit to stdout as JSON regardless
    parsed = null;
  }
  if (parsed) {
    assert.ok(parsed.error || parsed.recommendation === 'no_data', 'error or no_data');
  }
});

test('CLI3: --raw flag returns JSON-only output (no banner noise)', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'df-survey-raw-'));
  const objDir = path.join(tmpRoot, 'proj', '.planning', 'objectives');
  fs.mkdirSync(objDir, { recursive: true });
  fs.mkdirSync(path.join(objDir, '01-init'));

  const r = spawnSync('node', [DF_TOOLS, 'survey', 'decimal-objectives', '--root', tmpRoot, '--raw'], {
    encoding: 'utf-8',
  });

  fs.rmSync(tmpRoot, { recursive: true, force: true });

  assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  // Raw mode: stdout must be pure JSON parseable without banner text
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    assert.fail(`--raw stdout not valid JSON: ${r.stdout}`);
  }
  assert.ok('recommendation' in parsed, 'has recommendation key in raw output');
});

// ─── Group EX: export-lock + banner ──────────────────────────────────────────

test('EX1: module.exports has exactly 4 entries', () => {
  const mod = require('./decimal-survey.cjs');
  const keys = Object.keys(mod);
  assert.deepStrictEqual(
    keys.sort(),
    ['_resetMocks', '_setRunFs', 'cmdSurveyDecimalObjectives', 'surveyDecimalObjectives'].sort(),
    'exactly 4 exports: surveyDecimalObjectives, cmdSurveyDecimalObjectives, _setRunFs, _resetMocks',
  );
});

test('EX2: BANNER constant is present in source', () => {
  const src = require('fs').readFileSync(path.join(__dirname, 'decimal-survey.cjs'), 'utf-8');
  assert.ok(src.includes('BANNER'), 'BANNER constant referenced in source');
  assert.ok(src.includes('DevFlow'), 'BANNER includes DevFlow branding');
});
