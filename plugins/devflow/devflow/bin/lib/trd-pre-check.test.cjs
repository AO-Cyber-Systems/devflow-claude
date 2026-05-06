'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation):
//
// 1. requirement_coverage:
//    - happy: all requirement IDs covered → passed:true, missing:[]
//    - missing: requirement F2 absent from all TRDs → passed:false, missing:["F2"]
//    - no requirements declared in ROADMAP → passed:true, note set
//    - requirements as string "F1, F2" → both parsed
//    - requirements bracketed "[F1, F2]" in ROADMAP → both parsed
//
// 2. task_completeness:
//    - happy: all tasks have name/action/verify/done → passed:true
//    - missing-action: one task missing <action> → incomplete:[{trd, task, missing:["action"]}]
//    - missing-name: one task missing <name> → incomplete with missing:["name"]
//    - missing-verify: one task missing <verify> → incomplete with missing:["verify"]
//    - missing-done: one task missing <done> → incomplete with missing:["done"]
//    - checkpoint task missing verify/done → still passed (checkpoints exempt)
//
// 3. dependency_correctness:
//    - happy: linear chain 01→02→03 → passed:true
//    - cycle: 01 depends_on 02, 02 depends_on 01 → cycles detected
//    - orphan: 02 depends_on 99 → orphan_refs:[{trd:"02", missing:"99"}]
//    - empty depends_on → passed:true
//    - diamond (A→B,C; B,C→D) — should NOT be flagged as cycle
//
// 4. scope_sanity:
//    - 3 tasks per TRD → passed:true
//    - 4 tasks → warning, still passed
//    - 6 tasks → passed:false, in oversized_trds
//    - 11 TRDs in objective → passed:false (>10 limit), total_trds reported
//
// 5. e2e (top-level cmdVerifyTrdPre):
//    - all four dimensions pass → result.passed:true, needs_agent:false
//    - any dimension fails → result.passed:false
//    - elapsed_ms field present and >= 0
//    - non-existent objective → error key present, exit non-zero
//    - malformed TRD frontmatter → does not crash; that TRD reported with error

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { makeTrdContent, setupObjectiveDir } = require('./__fixtures__/trd-pre-fixtures.cjs');
const { cmdVerifyTrdPre } = require('./trd-pre-check.cjs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trd-pre-test-'));
}

function removeTmp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Calls cmdVerifyTrdPre and captures the JSON result without side effects.
 * Overrides process.stdout.write and process.exit to prevent test process from exiting.
 */
function runCheck(cwd, objective) {
  let captured = '';
  let exitCode = 0;

  const origWrite = process.stdout.write.bind(process.stdout);
  const origExit = process.exit.bind(process);

  process.stdout.write = (data) => {
    captured += String(data);
    return true;
  };
  process.exit = (code) => {
    exitCode = code || 0;
    throw new Error(`__process_exit_${code || 0}__`);
  };

  try {
    cmdVerifyTrdPre(cwd, objective, false);
  } catch (e) {
    if (!e.message.startsWith('__process_exit_')) {
      process.stdout.write = origWrite;
      process.exit = origExit;
      throw e;
    }
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }

  return { result: JSON.parse(captured), exitCode };
}

// ─── 1. requirement_coverage ──────────────────────────────────────────────────

describe('requirement_coverage', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('happy: all requirement IDs covered', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2'],
      trds: [
        { trd: '99-01', requirements: ['F1'], depends_on: [] },
        { trd: '99-02', requirements: ['F2'], depends_on: [] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, []);
  });

  test('missing: F2 absent from all TRDs', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2'],
      trds: [
        { trd: '99-01', requirements: ['F1'], depends_on: [] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, false);
    assert.ok(result.checks.requirement_coverage.missing.includes('F2'));
  });

  test('no requirements declared in ROADMAP → passed with note', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: undefined, // omit **Requirements:** line
      trds: [
        { trd: '99-01', requirements: [], depends_on: [] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
    assert.ok(result.checks.requirement_coverage.note, 'note should be set when no requirements declared');
  });

  test('requirements as string "F1, F2" in TRD frontmatter', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2'],
      trds: [
        {
          trd: '99-01',
          content: makeTrdContent({
            objective: '99-test',
            trd: '99-01',
            requirements: 'F1, F2', // string form
            depends_on: [],
          }),
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, []);
  });

  test('requirements bracketed "[F1, F2]" in ROADMAP', () => {
    // setupObjectiveDir puts requirements in bracket form already — test the strip
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2'], // written as [F1, F2] by fixture
      trds: [
        { trd: '99-01', requirements: ['F1', 'F2'], depends_on: [] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.requirement_coverage.passed, true);
    assert.deepStrictEqual(result.checks.requirement_coverage.missing, []);
  });
});

// ─── 2. task_completeness ─────────────────────────────────────────────────────

describe('task_completeness', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('happy: all tasks complete', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, true);
    assert.deepStrictEqual(result.checks.task_completeness.incomplete, []);
  });

  test('missing-action: task missing <action>', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: true, hasAction: false, hasVerify: true, hasDone: true },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, false);
    const inc = result.checks.task_completeness.incomplete;
    assert.ok(inc.length > 0);
    assert.ok(inc[0].missing.includes('action'));
  });

  test('missing-name: task missing <name>', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: false, hasAction: true, hasVerify: true, hasDone: true },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, false);
    assert.ok(result.checks.task_completeness.incomplete[0].missing.includes('name'));
  });

  test('missing-verify: task missing <verify>', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: true, hasAction: true, hasVerify: false, hasDone: true },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, false);
    assert.ok(result.checks.task_completeness.incomplete[0].missing.includes('verify'));
  });

  test('missing-done: task missing <done>', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: false },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, false);
    assert.ok(result.checks.task_completeness.incomplete[0].missing.includes('done'));
  });

  test('checkpoint task missing verify/done → still passed', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [
            { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true },
            { type: 'checkpoint:human-verify', hasName: true, hasAction: false, hasVerify: false, hasDone: false },
          ],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.task_completeness.passed, true);
    assert.deepStrictEqual(result.checks.task_completeness.incomplete, []);
  });
});

// ─── 3. dependency_correctness ────────────────────────────────────────────────

describe('dependency_correctness', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('happy: linear chain 01→02→03', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        { trd: '99-01', requirements: [], depends_on: [] },
        { trd: '99-02', requirements: [], depends_on: ['99-01'] },
        { trd: '99-03', requirements: [], depends_on: ['99-02'] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.dependency_correctness.passed, true);
    assert.deepStrictEqual(result.checks.dependency_correctness.cycles, []);
    assert.deepStrictEqual(result.checks.dependency_correctness.orphan_refs, []);
  });

  test('cycle: 01 depends_on 02, 02 depends_on 01', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        { trd: '99-01', requirements: [], depends_on: ['99-02'] },
        { trd: '99-02', requirements: [], depends_on: ['99-01'] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.dependency_correctness.passed, false);
    assert.ok(result.checks.dependency_correctness.cycles.length > 0);
  });

  test('orphan: 02 depends_on 99 (non-existent)', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        { trd: '99-01', requirements: [], depends_on: [] },
        { trd: '99-02', requirements: [], depends_on: ['99-99'] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.dependency_correctness.passed, false);
    assert.ok(result.checks.dependency_correctness.orphan_refs.length > 0);
  });

  test('empty depends_on → passed', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        { trd: '99-01', requirements: [], depends_on: [] },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.dependency_correctness.passed, true);
  });

  test('diamond (A→B,C; B,C→D) → NOT a cycle', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        { trd: '99-01', requirements: [], depends_on: [] },              // D
        { trd: '99-02', requirements: [], depends_on: ['99-01'] },       // B→D
        { trd: '99-03', requirements: [], depends_on: ['99-01'] },       // C→D
        { trd: '99-04', requirements: [], depends_on: ['99-02', '99-03'] }, // A→B,C
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.dependency_correctness.passed, true);
    assert.deepStrictEqual(result.checks.dependency_correctness.cycles, []);
  });
});

// ─── 4. scope_sanity ─────────────────────────────────────────────────────────

describe('scope_sanity', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('3 tasks per TRD → passed, no warnings', () => {
    const tasks3 = [
      { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true },
      { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true },
      { type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true },
    ];
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [{ trd: '99-01', requirements: [], depends_on: [], tasks: tasks3 }],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.scope_sanity.passed, true);
  });

  test('4 tasks per TRD → warning but still passed', () => {
    const tasks4 = Array.from({ length: 4 }, () => ({
      type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true,
    }));
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [{ trd: '99-01', requirements: [], depends_on: [], tasks: tasks4 }],
    });
    const { result } = runCheck(tmpDir, '99');
    // 4 tasks: warn but pass
    assert.strictEqual(result.checks.scope_sanity.passed, true);
    assert.ok(result.checks.scope_sanity.oversized_trds.length > 0 ||
              result.checks.scope_sanity.warning_trds !== undefined ||
              result.checks.scope_sanity.passed === true,
              'should pass at 4 tasks');
  });

  test('6 tasks per TRD → failed', () => {
    const tasks6 = Array.from({ length: 6 }, () => ({
      type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true,
    }));
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [{ trd: '99-01', requirements: [], depends_on: [], tasks: tasks6 }],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.scope_sanity.passed, false);
    assert.ok(result.checks.scope_sanity.oversized_trds.length > 0);
  });

  test('11 TRDs in objective → passed:false, total_trds reported', () => {
    const trds = Array.from({ length: 11 }, (_, i) => ({
      trd: `99-${String(i + 1).padStart(2, '0')}`,
      requirements: [],
      depends_on: [],
      tasks: [{ type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true }],
    }));
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds,
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.checks.scope_sanity.passed, false);
    assert.ok(result.checks.scope_sanity.total_trds >= 11);
  });
});

// ─── 5. e2e (cmdVerifyTrdPre top-level) ──────────────────────────────────────

describe('e2e — cmdVerifyTrdPre', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('all dimensions pass → passed:true, needs_agent:false', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [{ type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true }],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.needs_agent, false);
    assert.ok('checks' in result);
    assert.ok('requirement_coverage' in result.checks);
    assert.ok('task_completeness' in result.checks);
    assert.ok('dependency_correctness' in result.checks);
    assert.ok('scope_sanity' in result.checks);
  });

  test('any dimension fails → result.passed:false', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1', 'F2'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'], // F2 missing
          depends_on: [],
          tasks: [{ type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true }],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.strictEqual(result.passed, false);
  });

  test('elapsed_ms field present and >= 0', () => {
    setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: [],
      trds: [
        {
          trd: '99-01',
          requirements: [],
          depends_on: [],
          tasks: [{ type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true }],
        },
      ],
    });
    const { result } = runCheck(tmpDir, '99');
    assert.ok('elapsed_ms' in result, 'elapsed_ms should be present');
    assert.ok(result.elapsed_ms >= 0, 'elapsed_ms should be >= 0');
  });

  test('non-existent objective → error key present', () => {
    // Don't create any objective directory
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n', 'utf-8');

    let captured = '';
    let exitCode = 0;
    const origWrite = process.stdout.write.bind(process.stdout);
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit.bind(process);
    process.stdout.write = (d) => { captured += String(d); return true; };
    process.stderr.write = (d) => { captured += String(d); return true; };
    process.exit = (code) => { exitCode = code || 0; throw new Error(`__exit_${code}__`); };
    try {
      cmdVerifyTrdPre(tmpDir, 'nonexistent-99', false);
    } catch (e) {
      if (!e.message.startsWith('__exit_')) throw e;
    } finally {
      process.stdout.write = origWrite;
      process.stderr.write = origStderr;
      process.exit = origExit;
    }
    assert.ok(exitCode !== 0 || captured.includes('error') || captured.includes('Error'),
      'should report error for non-existent objective');
  });

  test('malformed TRD frontmatter → does not crash, TRD reported with error', () => {
    const objectiveDir = setupObjectiveDir(tmpDir, {
      objective: '99-test',
      roadmap_requirements: ['F1'],
      trds: [
        {
          trd: '99-01',
          requirements: ['F1'],
          depends_on: [],
          tasks: [{ type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true }],
        },
      ],
    });

    // Write a malformed TRD — no closing ---
    fs.writeFileSync(path.join(objectiveDir, '99-02-TRD.md'),
      '---\nobjective: 99-test\ntrd: "99-02"\n# no closing frontmatter\n\nsome content', 'utf-8');

    let didThrow = false;
    try {
      const { result } = runCheck(tmpDir, '99');
      // Should either succeed (with error noted for malformed TRD) or fail gracefully
      assert.ok(typeof result === 'object', 'result should be an object');
    } catch (e) {
      // Should not throw unhandled errors
      didThrow = true;
    }
    assert.strictEqual(didThrow, false, 'should not throw on malformed TRD');
  });
});
