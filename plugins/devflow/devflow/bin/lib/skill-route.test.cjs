'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawnSync } = require('child_process');

// ─── Test subjects ─────────────────────────────────────────────────────────────

const {
  routeSkill,
  cmdDeprecationLog,
  cmdSkillRoute,
  cmdSkillRouteList,
  SKILL_ROUTES,
  DEPRECATION_MAP,
  _setRunFs,
  _resetMocks,
} = require('./skill-route.cjs');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const {
  buildSkillRouteCall,
  buildSkillRouteResponse,
  buildDeprecationLogEntry,
  buildObjectiveSkillRouteEntry,
  buildDeprecationMapEntry,
} = require('./__fixtures__/skill-route-fixtures.cjs');

// ─── Group R: routeSkill happy path ───────────────────────────────────────────

describe('routeSkill happy path', () => {
  test('R1: objective add routes to add-objective workflow', () => {
    const call = buildSkillRouteCall({ skill: 'objective', args: ['add', 'fix bug'] });
    const result = routeSkill(call.skill, call.args);
    const expected = buildSkillRouteResponse({
      skill: 'objective',
      subcommand: 'add',
      args: ['fix bug'],
      workflow: '~/.claude/devflow/workflows/add-objective.md',
    });
    assert.deepStrictEqual(result, expected);
  });

  test('R2: objective insert is no longer a valid subcommand (removed in TRD 12-06)', () => {
    // 'insert' was removed from SKILL_ROUTES.objective.subcommands per I2 drop.
    const result = routeSkill('objective', ['insert', '5', 'urgent']);
    assert.strictEqual(result.error, 'unknown subcommand', 'insert should be unknown');
    assert.strictEqual(result.got, 'insert');
  });

  test('R3: objective remove routes to remove-objective workflow', () => {
    const result = routeSkill('objective', ['remove', '7']);
    assert.deepStrictEqual(result, {
      skill: 'objective',
      subcommand: 'remove',
      args: ['7'],
      workflow: '~/.claude/devflow/workflows/remove-objective.md',
    });
  });

  test('R4: objective add with no residual args allowed', () => {
    const result = routeSkill('objective', ['add']);
    assert.deepStrictEqual(result, {
      skill: 'objective',
      subcommand: 'add',
      args: [],
      workflow: '~/.claude/devflow/workflows/add-objective.md',
    });
  });
});

// ─── Group RE: routeSkill errors ──────────────────────────────────────────────

describe('routeSkill errors', () => {
  test('RE1: missing subcommand returns error with usage', () => {
    const result = routeSkill('objective', []);
    assert.strictEqual(result.error, 'missing subcommand');
    assert.strictEqual(result.usage, 'objective <add|remove>');
    assert.deepStrictEqual(result.valid_subcommands, ['add', 'remove']);
  });

  test('RE2: unknown subcommand returns error', () => {
    const result = routeSkill('objective', ['unknown']);
    assert.strictEqual(result.error, 'unknown subcommand');
    assert.strictEqual(result.got, 'unknown');
    assert.deepStrictEqual(result.valid_subcommands, ['add', 'remove']);
  });

  test('RE3: unknown skill returns error with valid_skills list', () => {
    const result = routeSkill('nonexistent-skill', ['add']);
    assert.strictEqual(result.error, 'unknown skill');
    assert.strictEqual(result.got, 'nonexistent-skill');
    assert.ok(Array.isArray(result.valid_skills), 'valid_skills must be an array');
    assert.ok(result.valid_skills.includes('objective'), 'valid_skills must include objective');
  });

  test('RE4: null skill returns error', () => {
    const result = routeSkill(null, []);
    assert.ok(result.error, 'should return error for null skill');
  });

  test('RE5: null args returns error', () => {
    const result = routeSkill('objective', null);
    assert.ok(result.error, 'should return error for null args');
  });
});

// ─── Group SR: SKILL_ROUTES structure ─────────────────────────────────────────

describe('SKILL_ROUTES structure', () => {
  test('SR1: SKILL_ROUTES.objective.subcommands is ["add","remove"] (insert removed in TRD 12-06)', () => {
    assert.deepStrictEqual(SKILL_ROUTES.objective.subcommands, ['add', 'remove']);
  });

  test('SR2: SKILL_ROUTES.objective.workflow_for("add") returns add-objective.md', () => {
    const wf = SKILL_ROUTES.objective.workflow_for('add');
    assert.strictEqual(wf, '~/.claude/devflow/workflows/add-objective.md');
  });

  test('SR3: SKILL_ROUTES.objective.workflow_for("insert") returns null (deprecated in TRD 12-06)', () => {
    const wf = SKILL_ROUTES.objective.workflow_for('insert');
    assert.strictEqual(wf, null, 'insert workflow should return null (no longer valid)');
  });

  test('SR4: SKILL_ROUTES only has objective key in this TRD', () => {
    const keys = Object.keys(SKILL_ROUTES);
    assert.deepStrictEqual(keys, ['objective'], 'Only objective in TRD 12-01');
  });
});

// ─── Group F: fixtures ─────────────────────────────────────────────────────────

describe('fixtures', () => {
  test('F1: buildSkillRouteCall() returns canonical objective-add call', () => {
    const call = buildSkillRouteCall();
    assert.strictEqual(call.skill, 'objective');
    assert.deepStrictEqual(call.args, ['add', 'fix login bug']);
  });

  test('F2: buildSkillRouteCall with custom opts returns custom call', () => {
    const call = buildSkillRouteCall({ skill: 'objective', args: ['remove', '7'] });
    assert.strictEqual(call.skill, 'objective');
    assert.deepStrictEqual(call.args, ['remove', '7']);
  });

  test('F3: buildSkillRouteResponse with remove subcommand returns canonical response shape', () => {
    const resp = buildSkillRouteResponse({
      subcommand: 'remove',
      args: ['7'],
      workflow: '~/.claude/devflow/workflows/remove-objective.md',
    });
    assert.strictEqual(resp.skill, 'objective');
    assert.strictEqual(resp.subcommand, 'remove');
    assert.deepStrictEqual(resp.args, ['7']);
    assert.strictEqual(resp.workflow, '~/.claude/devflow/workflows/remove-objective.md');
  });

  test('F4: buildDeprecationLogEntry returns shape with ts, old_name, new_form, project_root', () => {
    const entry = buildDeprecationLogEntry({ old_name: 'add-objective' });
    assert.ok(typeof entry.ts === 'string', 'ts must be string');
    assert.strictEqual(entry.old_name, 'add-objective');
    assert.strictEqual(entry.new_form, 'objective add');
    assert.ok(typeof entry.project_root === 'string', 'project_root must be string');
  });
});

// ─── Group D: deprecation logger ──────────────────────────────────────────────

describe('deprecation logger', () => {
  test('D1: cmdDeprecationLog writes to deprecation log and returns logged:true', (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-skill-route-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    const writtenCalls = [];
    const mockFs = {
      existsSync: () => true,
      mkdirSync: () => {},
      appendFileSync: (filePath, data) => { writtenCalls.push({ filePath, data }); },
      readFileSync: fs.readFileSync.bind(fs),
    };

    _setRunFs(mockFs);
    try {
      const result = cmdDeprecationLog(tmpDir, 'add-objective', false);
      assert.strictEqual(result.logged, true);
      assert.strictEqual(result.old_name, 'add-objective');
      assert.strictEqual(result.new_form, 'objective add');
      assert.strictEqual(writtenCalls.length, 1, 'appendFileSync called once');
      const written = writtenCalls[0];
      assert.ok(written.filePath.includes('.deprecation-log.jsonl'), 'writes to deprecation-log.jsonl');
      const entry = JSON.parse(written.data.trim());
      assert.strictEqual(entry.old_name, 'add-objective');
      assert.strictEqual(entry.new_form, 'objective add');
    } finally {
      _resetMocks();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('D2: cmdDeprecationLog called twice appends (not overwrites)', (t) => {
    const writtenCalls = [];
    const mockFs = {
      existsSync: () => true,
      mkdirSync: () => {},
      appendFileSync: (filePath, data) => { writtenCalls.push({ filePath, data }); },
      readFileSync: fs.readFileSync.bind(fs),
    };

    _setRunFs(mockFs);
    try {
      cmdDeprecationLog('/tmp/test', 'add-objective', false);
      cmdDeprecationLog('/tmp/test', 'add-objective', false);
      assert.strictEqual(writtenCalls.length, 2, 'appendFileSync called twice');
    } finally {
      _resetMocks();
    }
  });

  test('D3: unknown old_name returns error, no file write', () => {
    const writtenCalls = [];
    const mockFs = {
      existsSync: () => true,
      mkdirSync: () => {},
      appendFileSync: (filePath, data) => { writtenCalls.push({ filePath, data }); },
      readFileSync: fs.readFileSync.bind(fs),
    };

    _setRunFs(mockFs);
    try {
      const result = cmdDeprecationLog('/tmp/test', 'foo', false);
      assert.strictEqual(result.error, 'unknown deprecated skill');
      assert.strictEqual(result.got, 'foo');
      assert.strictEqual(writtenCalls.length, 0, 'no file write for unknown skill');
    } finally {
      _resetMocks();
    }
  });

  test('D4: _setRunFs mock injection — appendFileSync called with correct path + payload', () => {
    const writtenCalls = [];
    const mockFs = {
      existsSync: () => true,
      mkdirSync: () => {},
      appendFileSync: (filePath, data) => { writtenCalls.push({ filePath, data }); },
      readFileSync: fs.readFileSync.bind(fs),
    };

    _setRunFs(mockFs);
    try {
      cmdDeprecationLog('/my/project', 'insert-objective', false);
      assert.strictEqual(writtenCalls.length, 1);
      assert.ok(
        writtenCalls[0].filePath.endsWith('.planning/.deprecation-log.jsonl'),
        'path must end with .planning/.deprecation-log.jsonl',
      );
      const entry = JSON.parse(writtenCalls[0].data.trim());
      assert.strictEqual(entry.old_name, 'insert-objective');
      assert.strictEqual(entry.new_form, 'objective add'); // redirected to add (insert deprecated)
      assert.strictEqual(entry.project_root, '/my/project');
    } finally {
      _resetMocks();
    }
  });

  test('D5: DEPRECATION_MAP covers all 3 objective-related entries (insert → add per TRD 12-06)', () => {
    assert.strictEqual(DEPRECATION_MAP['add-objective'], 'objective add');
    // insert-objective was deprecated in TRD 12-06; redirects to objective add (functional equivalent)
    assert.strictEqual(DEPRECATION_MAP['insert-objective'], 'objective add');
    assert.strictEqual(DEPRECATION_MAP['remove-objective'], 'objective remove');
  });
});

// ─── Group C: CLI integration (spawnSync end-to-end) ─────────────────────────

describe('CLI integration', () => {
  const dfToolsPath = path.join(__dirname, '..', 'df-tools.cjs');
  const cwd = path.join(__dirname, '..', '..', '..', '..', '..', '..'); // project root

  test('C1: skill-route objective add exits 0 with valid JSON', () => {
    const result = spawnSync('node', [dfToolsPath, 'skill-route', 'objective', 'add', 'fix bug'], {
      encoding: 'utf-8',
      cwd,
    });
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const json = JSON.parse(result.stdout);
    assert.strictEqual(json.skill, 'objective');
    assert.strictEqual(json.subcommand, 'add');
    assert.deepStrictEqual(json.args, ['fix bug']);
    assert.strictEqual(json.workflow, '~/.claude/devflow/workflows/add-objective.md');
  });

  test('C2: skill-route objective (missing subcommand) exits 1 with error JSON', () => {
    const result = spawnSync('node', [dfToolsPath, 'skill-route', 'objective'], {
      encoding: 'utf-8',
      cwd,
    });
    assert.strictEqual(result.status, 1, `Expected exit 1, got ${result.status}`);
    // error JSON on stderr or stdout
    const raw = result.stderr || result.stdout;
    assert.ok(raw.length > 0, 'should output error JSON');
  });

  test('C3: skill-route --list exits 0 with skills catalog', () => {
    const result = spawnSync('node', [dfToolsPath, 'skill-route', '--list'], {
      encoding: 'utf-8',
      cwd,
    });
    assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const json = JSON.parse(result.stdout);
    assert.ok(Array.isArray(json.skills), 'skills must be an array');
    const objectiveSkill = json.skills.find(s => s.name === 'objective');
    assert.ok(objectiveSkill, 'objective skill must be in list');
    assert.deepStrictEqual(objectiveSkill.subcommands, ['add', 'remove']); // insert removed in TRD 12-06
    assert.ok(typeof json.deprecated === 'object', 'deprecated map must exist');
    assert.ok('add-objective' in json.deprecated, 'add-objective must be in deprecated map');
  });

  test('C4: deprecation log add-objective exits 0, JSONL format', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-depr-test-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    try {
      const result = spawnSync('node', [dfToolsPath, 'deprecation', 'log', 'add-objective'], {
        encoding: 'utf-8',
        cwd: tmpDir,
      });
      assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
      const json = JSON.parse(result.stdout);
      assert.strictEqual(json.logged, true);
      assert.strictEqual(json.old_name, 'add-objective');
      assert.strictEqual(json.new_form, 'objective add');
      // JSONL file should exist
      const logPath = path.join(planningDir, '.deprecation-log.jsonl');
      assert.ok(fs.existsSync(logPath), 'deprecation log file should exist');
      const line = fs.readFileSync(logPath, 'utf-8').trim();
      const entry = JSON.parse(line);
      assert.strictEqual(entry.old_name, 'add-objective');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── Group EX: export-lock ────────────────────────────────────────────────────

describe('export-lock', () => {
  test('EX1: module exports exactly 8 entries per banner', () => {
    const mod = require('./skill-route.cjs');
    const keys = Object.keys(mod).sort();
    const expected = [
      'DEPRECATION_MAP',
      'SKILL_ROUTES',
      '_resetMocks',
      '_setRunFs',
      'cmdDeprecationLog',
      'cmdSkillRoute',
      'cmdSkillRouteList',
      'routeSkill',
    ];
    assert.deepStrictEqual(keys, expected);
  });

  test('EX2: LOCKED banner comment present in source file', () => {
    const src = fs.readFileSync(path.join(__dirname, 'skill-route.cjs'), 'utf-8');
    assert.ok(
      /LOCKED by TRD 12-01/.test(src),
      'Banner comment "LOCKED by TRD 12-01" must be present in skill-route.cjs',
    );
  });
});
