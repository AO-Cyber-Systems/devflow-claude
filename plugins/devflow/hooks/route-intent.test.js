/**
 * Tests for route-intent.js UserPromptSubmit hook
 *
 * TDD suite for TRD 15-02 (A2 — route-intent tightening):
 *   - INTENT_MAP shape assertions (exported for unit testing)
 *   - 10 fire fixtures — each prompt fires and maps to its expected consolidated skill
 *   - 5 no-fire fixtures — each Q&A/explanation prompt produces no match
 *   - Skill-prefix exclusion (/devflow: and /df: prompts → no match)
 *   - renderDirective shape (box-drawn, OBLIGATORY, gate-edits mention)
 *   - Subprocess e2e (2 cases: ambient tmpdir fires, non-devflow project silent)
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'route-intent.js');

// Pure-function imports — these tests drive the RED phase failures
// (route-intent.js currently has no exports)
const { INTENT_MAP, matchIntent, renderDirective } = require('./route-intent.js');

// Fixture imports
const { FIRE_FIXTURES, NO_FIRE_FIXTURES } = require(
  '../devflow/bin/lib/__fixtures__/intent-fixtures.cjs'
);

// ---------------------------------------------------------------------------
// INTENT_MAP shape
// ---------------------------------------------------------------------------

describe('INTENT_MAP — exported shape', () => {
  test('INTENT_MAP is an array', () => {
    assert.ok(Array.isArray(INTENT_MAP), 'INTENT_MAP should be an array');
  });

  test('INTENT_MAP has at least 10 entries', () => {
    assert.ok(INTENT_MAP.length >= 10,
      `expected >= 10 INTENT_MAP entries, got ${INTENT_MAP.length}`);
  });

  test('every entry has rx (RegExp), skill (string), label (string)', () => {
    for (const entry of INTENT_MAP) {
      assert.ok(entry.rx instanceof RegExp,
        `entry missing RegExp rx: ${JSON.stringify(entry)}`);
      assert.equal(typeof entry.skill, 'string',
        `entry missing string skill: ${JSON.stringify(entry)}`);
      assert.equal(typeof entry.label, 'string',
        `entry missing string label: ${JSON.stringify(entry)}`);
    }
  });

  test('INTENT_MAP contains consolidated skills: build, debug, plan-objective, verify-work, status, status resume, status pause, objective add, new-project, research-objective, micro, execute-objective, todo add, quick', () => {
    const skills = new Set(INTENT_MAP.map(e => e.skill));
    const required = [
      '/devflow:build',
      '/devflow:debug',
      '/devflow:plan-objective',
      '/devflow:verify-work',
      '/devflow:status',
      '/devflow:status resume',
      '/devflow:status pause',
      '/devflow:objective add',
      '/devflow:new-project',
      '/devflow:research-objective',
      '/devflow:micro',
      '/devflow:execute-objective',
      '/devflow:todo add',
      '/devflow:quick',
    ];
    for (const skill of required) {
      assert.ok(skills.has(skill),
        `INTENT_MAP missing consolidated skill: ${skill} (found: ${[...skills].join(', ')})`);
    }
  });

  test('INTENT_MAP does NOT contain deprecated pre-Phase-G skill names', () => {
    const skills = INTENT_MAP.map(e => e.skill);
    const deprecated = [
      '/devflow:progress',
      '/devflow:resume-work',
      '/devflow:pause-work',
      '/devflow:add-objective',
    ];
    for (const dep of deprecated) {
      assert.ok(!skills.includes(dep),
        `INTENT_MAP still references deprecated skill: ${dep}`);
    }
  });
});

// ---------------------------------------------------------------------------
// matchIntent — 10 fire fixtures
// ---------------------------------------------------------------------------

describe('matchIntent — 10 fire fixtures (must match)', () => {
  for (const f of FIRE_FIXTURES) {
    test(`fires on "${f.prompt}" → ${f.expected_skill} (${f.label})`, () => {
      const skills = matchIntent(f.prompt);
      assert.ok(skills.length > 0,
        `expected >= 1 match for "${f.prompt}", got: ${JSON.stringify(skills)}\nwhy_fires: ${f.why_fires}`);
      assert.ok(skills.includes(f.expected_skill),
        `expected ${f.expected_skill} in results for "${f.prompt}"\ngot: ${JSON.stringify(skills)}\nlabel: ${f.label}`);
    });
  }
});

// ---------------------------------------------------------------------------
// matchIntent — 5 no-fire fixtures
// ---------------------------------------------------------------------------

describe('matchIntent — 5 no-fire fixtures (must NOT match)', () => {
  for (const f of NO_FIRE_FIXTURES) {
    test(`does NOT fire on "${f.prompt}" (${f.label})`, () => {
      const skills = matchIntent(f.prompt);
      assert.equal(skills.length, 0,
        `expected 0 matches for "${f.prompt}", got: ${JSON.stringify(skills)}\nwhy_no_fire: ${f.why_no_fire}`);
    });
  }
});

// ---------------------------------------------------------------------------
// matchIntent — skill-prefix exclusion
// ---------------------------------------------------------------------------

describe('matchIntent — skill-prefix exclusion', () => {
  test('returns [] when prompt starts with /devflow:', () => {
    assert.deepEqual(matchIntent('/devflow:build the login feature'), []);
  });

  test('returns [] when prompt starts with /df:', () => {
    assert.deepEqual(matchIntent('/df:plan-objective the next thing'), []);
  });

  test('returns [] for empty string', () => {
    assert.deepEqual(matchIntent(''), []);
  });

  test('returns [] for null/undefined', () => {
    assert.deepEqual(matchIntent(null), []);
    assert.deepEqual(matchIntent(undefined), []);
  });
});

// ---------------------------------------------------------------------------
// renderDirective — box-drawn shape
// ---------------------------------------------------------------------------

describe('renderDirective — box-drawn directive', () => {
  const directive = renderDirective(['/devflow:debug']);

  test('returns a string', () => {
    assert.equal(typeof directive, 'string');
  });

  test('contains "OBLIGATORY"', () => {
    assert.ok(directive.includes('OBLIGATORY'),
      `renderDirective output missing "OBLIGATORY":\n${directive}`);
  });

  test('contains "DEVFLOW"', () => {
    assert.ok(directive.includes('DEVFLOW'),
      `renderDirective output missing "DEVFLOW":\n${directive}`);
  });

  test('contains "gate-edits.js will DENY"', () => {
    assert.ok(directive.includes('gate-edits.js will DENY'),
      `renderDirective output missing "gate-edits.js will DENY":\n${directive}`);
  });

  test('contains the passed-in skill name', () => {
    assert.ok(directive.includes('/devflow:debug'),
      `renderDirective output missing skill name "/devflow:debug":\n${directive}`);
  });

  test('is multi-line with box-drawn top-left corner ╔', () => {
    assert.ok(directive.includes('╔'),
      `renderDirective output missing box-drawn corner ╔:\n${directive}`);
    assert.ok(directive.includes('\n'),
      'renderDirective output should be multi-line');
  });

  test('is multi-line with box-drawn bottom-left corner ╚', () => {
    assert.ok(directive.includes('╚'),
      `renderDirective output missing box-drawn corner ╚:\n${directive}`);
  });

  // 23-02: byte-budget assertion — compact rewrite must keep injection <=400 bytes
  test('byte length of renderDirective(["/devflow:debug"]) is <=400', () => {
    const bytes = Buffer.byteLength(renderDirective(['/devflow:debug']), 'utf8');
    assert.ok(bytes <= 400,
      `renderDirective output is ${bytes} bytes — must be <=400 (compact rewrite needed)`);
  });
});

// ---------------------------------------------------------------------------
// matchIntent — exclusivity (BUILD suppression post-filter)
// ---------------------------------------------------------------------------

describe('matchIntent — exclusivity (BUILD suppressed when todo/quick/objective-add fires)', () => {
  test('matchIntent("Add an objective for caching") deep-equals ["/devflow:objective add"]', () => {
    assert.deepEqual(
      matchIntent('Add an objective for caching'),
      ['/devflow:objective add'],
      'BUILD must be suppressed when objective-add fires'
    );
  });

  test('matchIntent("add a todo to refactor the parser") deep-equals ["/devflow:todo add"]', () => {
    assert.deepEqual(
      matchIntent('add a todo to refactor the parser'),
      ['/devflow:todo add'],
      'BUILD must be suppressed when todo-add fires'
    );
  });

  test('matchIntent("make a quick pass over the error handling") deep-equals ["/devflow:quick"]', () => {
    assert.deepEqual(
      matchIntent('make a quick pass over the error handling'),
      ['/devflow:quick'],
      'BUILD must be suppressed when quick fires'
    );
  });
});

// ---------------------------------------------------------------------------
// matchIntent — skillActive option (pure, no fs)
// ---------------------------------------------------------------------------

describe('matchIntent — skillActive option', () => {
  test('matchIntent("Fix the login bug", { skillActive: true }) returns []', () => {
    assert.deepEqual(
      matchIntent('Fix the login bug', { skillActive: true }),
      [],
      'skillActive: true must suppress all matches'
    );
  });

  test('matchIntent("Fix the login bug") still fires (back-compat, single-arg)', () => {
    const skills = matchIntent('Fix the login bug');
    assert.ok(skills.length > 0, 'single-arg call must still fire');
    assert.ok(skills.includes('/devflow:debug'), 'must include /devflow:debug');
  });
});

// ---------------------------------------------------------------------------
// Subprocess e2e tests (2 cases — keep overhead low)
// ---------------------------------------------------------------------------

function mkAmbientTmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'route-intent-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function runHook(payload, cwd) {
  return spawnSync('node', [HOOK_PATH], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
  });
}

describe('hook subprocess — e2e', () => {
  test('ambient project: "Fix the login bug" → JSON with additionalContext containing /devflow:debug and OBLIGATORY', () => {
    const { root, cleanup } = mkAmbientTmpProject();
    try {
      const result = runHook({ prompt: 'Fix the login bug' }, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.ok(result.stdout.length > 0,
        'expected non-empty stdout for a fire prompt in ambient project');
      const out = JSON.parse(result.stdout);
      const ctx = out.hookSpecificOutput.additionalContext;
      assert.ok(ctx.includes('/devflow:debug'),
        `additionalContext missing "/devflow:debug":\n${ctx}`);
      assert.ok(ctx.includes('OBLIGATORY'),
        `additionalContext missing "OBLIGATORY":\n${ctx}`);
    } finally {
      cleanup();
    }
  });

  test('non-devflow project (no .planning/): same prompt → empty stdout', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'route-no-planning-'));
    try {
      const result = runHook({ prompt: 'Fix the login bug' }, root);
      assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);
      assert.equal(result.stdout, '',
        'expected empty stdout when no .planning/ directory exists');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
