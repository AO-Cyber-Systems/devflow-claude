'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation):
//
// detectBrownfieldMap (pure function):
//   1. all three conditions hold → should_offer_map:true
//   2. planning_exists:false → should_offer_map:false
//   3. codebase_map_exists:true → should_offer_map:false
//   4. source_file_count below threshold → should_offer_map:false
//   5. exactly at threshold (50) → should_offer_map:true (>= not >)
//   6. one below threshold (49) → should_offer_map:false
//   7. custom threshold parameter respected
// cmdDetectBrownfieldMap (CLI):
//   8. tmpdir scaffold: empty repo → planning_exists:false, should_offer:false
//   9. tmpdir: .planning/ only, 0 source files → should_offer:false (count below threshold)
//   10. tmpdir: .planning/ only, 60 source files → should_offer:true
//   11. tmpdir: .planning/ + .planning/codebase/ + 100 source files → should_offer:false
//   12. tmpdir: 100 source files but no .planning → should_offer:false
// File counting edge cases:
//   13. node_modules subdir with 200 files → not counted
//   14. .git subdir with 50 files → not counted
//   15. .planning/ subdir contents not counted in source count
//   16. nested src/components/ counted recursively
//   17. mixed extensions (.ts, .py, .go) all counted
//   18. unknown extension (.txt, .md) NOT counted
// Error handling:
//   19. cwd does not exist → error key, exit non-zero
//   20. permission denied on subdir → walks rest of tree, no crash
//   21. --raw mode → JSON only, no human summary

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  makeScaffold,
  makeSourceFile,
  makeNestedSourceTree,
} = require('./__fixtures__/brownfield-fixtures.cjs');

const { detectBrownfieldMap, cmdDetectBrownfieldMap } = require('./brownfield-detector.cjs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'brownfield-test-'));
}

function removeTmp(dir) {
  // Restore permissions before removing (for Test 20 — chmod 0o000 blocks rmSync)
  try {
    // Walk looking for locked directories and restore them
    function restorePerms(p) {
      let entries;
      try {
        entries = fs.readdirSync(p, { withFileTypes: true });
      } catch {
        // Directory may be unreadable — try to chmod it first
        try { fs.chmodSync(p, 0o755); } catch {}
        try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }
      }
      for (const e of entries) {
        const full = path.join(p, e.name);
        if (e.isDirectory()) {
          try { fs.chmodSync(full, 0o755); } catch {}
          restorePerms(full);
        }
      }
    }
    restorePerms(dir);
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Capture stdout/stderr and exit code from cmdDetectBrownfieldMap.
 * Prevents process.exit from terminating the test process.
 */
function runCmd(cwd, targetCwd, raw) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);
  const origExit = process.exit.bind(process);

  process.stdout.write = (data) => { stdout += String(data); return true; };
  process.stderr.write = (data) => { stderr += String(data); return true; };
  process.exit = (code) => {
    exitCode = code || 0;
    throw new Error(`__process_exit_${code || 0}__`);
  };

  try {
    cmdDetectBrownfieldMap(cwd, targetCwd, raw);
  } catch (e) {
    if (!e.message.startsWith('__process_exit_')) {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
      process.exit = origExit;
      throw e;
    }
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    process.exit = origExit;
  }

  return { stdout, stderr, exitCode };
}

// ─── detectBrownfieldMap (pure function) ─────────────────────────────────────

describe('detectBrownfieldMap — pure function', () => {
  test('1. all three conditions hold → should_offer_map:true', () => {
    const result = detectBrownfieldMap({
      planningExists: true,
      codebaseMapExists: false,
      sourceFileCount: 60,
    });
    assert.strictEqual(result.should_offer_map, true);
    assert.strictEqual(result.planning_exists, true);
    assert.strictEqual(result.codebase_map_exists, false);
    assert.strictEqual(result.source_file_count, 60);
    assert.strictEqual(result.threshold, 50);
  });

  test('2. planning_exists:false → should_offer_map:false', () => {
    const result = detectBrownfieldMap({
      planningExists: false,
      codebaseMapExists: false,
      sourceFileCount: 100,
    });
    assert.strictEqual(result.should_offer_map, false);
    assert.strictEqual(result.planning_exists, false);
  });

  test('3. codebase_map_exists:true → should_offer_map:false', () => {
    const result = detectBrownfieldMap({
      planningExists: true,
      codebaseMapExists: true,
      sourceFileCount: 100,
    });
    assert.strictEqual(result.should_offer_map, false);
    assert.strictEqual(result.codebase_map_exists, true);
  });

  test('4. source_file_count below threshold → should_offer_map:false', () => {
    const result = detectBrownfieldMap({
      planningExists: true,
      codebaseMapExists: false,
      sourceFileCount: 10,
    });
    assert.strictEqual(result.should_offer_map, false);
  });

  test('5. exactly at threshold (50) → should_offer_map:true (>= not >)', () => {
    const result = detectBrownfieldMap({
      planningExists: true,
      codebaseMapExists: false,
      sourceFileCount: 50,
    });
    assert.strictEqual(result.should_offer_map, true);
    assert.strictEqual(result.source_file_count, 50);
    assert.strictEqual(result.threshold, 50);
  });

  test('6. one below threshold (49) → should_offer_map:false', () => {
    const result = detectBrownfieldMap({
      planningExists: true,
      codebaseMapExists: false,
      sourceFileCount: 49,
    });
    assert.strictEqual(result.should_offer_map, false);
  });

  test('7. custom threshold parameter respected', () => {
    const result = detectBrownfieldMap({
      planningExists: true,
      codebaseMapExists: false,
      sourceFileCount: 10,
      threshold: 5,
    });
    assert.strictEqual(result.should_offer_map, true);
    assert.strictEqual(result.threshold, 5);
  });
});

// ─── cmdDetectBrownfieldMap (CLI) ─────────────────────────────────────────────

describe('cmdDetectBrownfieldMap — CLI scaffold tests', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmp();
  });

  afterEach(() => {
    removeTmp(tmpDir);
  });

  test('8. empty repo → planning_exists:false, should_offer:false', () => {
    makeScaffold(tmpDir, {});
    const { stdout, exitCode } = runCmd(tmpDir, null, false);
    assert.strictEqual(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.planning_exists, false);
    assert.strictEqual(result.should_offer_map, false);
  });

  test('9. .planning/ only, 0 source files → should_offer:false (count below threshold)', () => {
    makeScaffold(tmpDir, { hasPlanning: true });
    const { stdout, exitCode } = runCmd(tmpDir, null, false);
    assert.strictEqual(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.planning_exists, true);
    assert.strictEqual(result.codebase_map_exists, false);
    assert.strictEqual(result.source_file_count, 0);
    assert.strictEqual(result.should_offer_map, false);
  });

  test('10. .planning/ only, 60 source files → should_offer:true', () => {
    makeScaffold(tmpDir, {
      hasPlanning: true,
      sourceFiles: { count: 60, exts: ['.ts'] },
    });
    const { stdout, exitCode } = runCmd(tmpDir, null, false);
    assert.strictEqual(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.planning_exists, true);
    assert.strictEqual(result.codebase_map_exists, false);
    assert.strictEqual(result.source_file_count, 60);
    assert.strictEqual(result.should_offer_map, true);
  });

  test('11. .planning/ + .planning/codebase/ + 100 source files → should_offer:false', () => {
    makeScaffold(tmpDir, {
      hasPlanning: true,
      hasCodebaseMap: true,
      sourceFiles: { count: 100, exts: ['.ts'] },
    });
    const { stdout, exitCode } = runCmd(tmpDir, null, false);
    assert.strictEqual(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.planning_exists, true);
    assert.strictEqual(result.codebase_map_exists, true);
    assert.strictEqual(result.should_offer_map, false);
  });

  test('12. 100 source files but no .planning → should_offer:false', () => {
    makeScaffold(tmpDir, {
      sourceFiles: { count: 100, exts: ['.ts'] },
    });
    const { stdout, exitCode } = runCmd(tmpDir, null, false);
    assert.strictEqual(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.planning_exists, false);
    assert.strictEqual(result.should_offer_map, false);
  });
});

// ─── File counting edge cases ─────────────────────────────────────────────────

describe('file counting edge cases', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmp();
    makeScaffold(tmpDir, { hasPlanning: true });
  });

  afterEach(() => {
    removeTmp(tmpDir);
  });

  test('13. node_modules subdir with 200 files → not counted', () => {
    makeScaffold(tmpDir, {
      hasPlanning: true,
      sourceFiles: { count: 10, exts: ['.ts'] },
      otherDirs: { 'node_modules': 200 },
    });
    const { stdout } = runCmd(tmpDir, null, false);
    const result = JSON.parse(stdout);
    // node_modules .js files must NOT be counted; only our 10 .ts files count
    assert.strictEqual(result.source_file_count, 10);
  });

  test('14. .git subdir with 50 files → not counted', () => {
    // Create a fresh scaffold including .planning (already done in beforeEach)
    // Add .git directory with 50 .js files
    const gitDir = path.join(tmpDir, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    for (let i = 0; i < 50; i++) {
      fs.writeFileSync(path.join(gitDir, `file${i}.js`), `// file${i}\n`, 'utf-8');
    }
    // Add 5 real source files
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      makeSourceFile(srcDir, `file${i}`, '.ts');
    }
    const { stdout } = runCmd(tmpDir, null, false);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.source_file_count, 5);
  });

  test('15. .planning/ subdir contents not counted in source count', () => {
    // Ensure .planning exists
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    // Place source files inside .planning (should not count)
    const planSrcDir = path.join(planningDir, 'scripts');
    fs.mkdirSync(planSrcDir, { recursive: true });
    for (let i = 0; i < 30; i++) {
      fs.writeFileSync(path.join(planSrcDir, `script${i}.js`), `// script${i}\n`, 'utf-8');
    }
    // Only 3 real source files outside .planning
    const srcDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(srcDir, { recursive: true });
    for (let i = 0; i < 3; i++) {
      makeSourceFile(srcDir, `lib${i}`, '.ts');
    }
    const { stdout } = runCmd(tmpDir, null, false);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.source_file_count, 3);
  });

  test('16. nested src/components/ counted recursively', () => {
    const count = makeNestedSourceTree(tmpDir);
    const { stdout } = runCmd(tmpDir, null, false);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.source_file_count, count);
  });

  test('17. mixed extensions (.ts, .py, .go) all counted', () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    makeSourceFile(srcDir, 'app', '.ts');
    makeSourceFile(srcDir, 'server', '.py');
    makeSourceFile(srcDir, 'main', '.go');
    const { stdout } = runCmd(tmpDir, null, false);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.source_file_count, 3);
  });

  test('18. unknown extension (.txt, .md) NOT counted', () => {
    const srcDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'readme.md'), '# readme\n', 'utf-8');
    fs.writeFileSync(path.join(srcDir, 'notes.txt'), 'notes\n', 'utf-8');
    fs.writeFileSync(path.join(srcDir, 'data.json'), '{}', 'utf-8');
    // 2 real source files
    makeSourceFile(srcDir, 'index', '.ts');
    makeSourceFile(srcDir, 'util', '.js');
    const { stdout } = runCmd(tmpDir, null, false);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.source_file_count, 2);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  test('19. cwd does not exist → error key, exit non-zero', () => {
    const nonExistentPath = path.join(os.tmpdir(), 'does-not-exist-' + Date.now());
    const { stdout, stderr, exitCode } = runCmd(process.cwd(), nonExistentPath, false);
    // Should exit non-zero or return error key
    const allOutput = stdout + stderr;
    const isError = exitCode !== 0 || allOutput.includes('error') || allOutput.includes('Error');
    assert.ok(isError, `Expected error indication, got stdout="${stdout}" stderr="${stderr}" exitCode=${exitCode}`);
  });

  test('20. permission denied on subdir → walks rest of tree, no crash', function() {
    // Skip on environments where chmod may not be enforced (e.g. root user)
    if (process.getuid && process.getuid() === 0) {
      this.skip('Running as root — chmod enforcement not reliable');
    }
    const tmpDir2 = createTmp();
    try {
      makeScaffold(tmpDir2, { hasPlanning: true });
      // Create a subdir with 5 source files
      const accessibleDir = path.join(tmpDir2, 'src');
      fs.mkdirSync(accessibleDir, { recursive: true });
      for (let i = 0; i < 5; i++) {
        makeSourceFile(accessibleDir, `file${i}`, '.ts');
      }
      // Create a locked subdir
      const lockedDir = path.join(tmpDir2, 'locked');
      fs.mkdirSync(lockedDir, { recursive: true });
      // Write a file first, then lock
      makeSourceFile(lockedDir, 'secret', '.ts');
      fs.chmodSync(lockedDir, 0o000);

      const { stdout, exitCode } = runCmd(tmpDir2, null, false);
      // Must not crash — exits 0 with valid JSON
      assert.strictEqual(exitCode, 0, `Expected exit 0, got ${exitCode}`);
      const result = JSON.parse(stdout);
      // Should have counted at least the 5 accessible files (locked dir skipped)
      assert.ok(typeof result.source_file_count === 'number', 'source_file_count must be a number');
      assert.ok(result.source_file_count >= 5, `Expected >= 5 accessible files, got ${result.source_file_count}`);
    } finally {
      removeTmp(tmpDir2);
    }
  });

  test('21. --raw mode → JSON only, no human summary', () => {
    const tmpDir3 = createTmp();
    try {
      makeScaffold(tmpDir3, { hasPlanning: true });
      const { stdout } = runCmd(tmpDir3, null, true); // raw=true
      // In raw mode the output should be parseable as-is with no extra text
      const result = JSON.parse(stdout);
      assert.ok('should_offer_map' in result);
      assert.ok('planning_exists' in result);
      assert.ok('source_file_count' in result);
    } finally {
      removeTmp(tmpDir3);
    }
  });
});
