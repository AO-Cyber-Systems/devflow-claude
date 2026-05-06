'use strict';

// Test list (TDD Playbook habit #2 — reviewable artifact, written before implementation):
//
// NEW_DEP signal:
//   1. happy: description mentions `jose`, package.json lacks it → fires, candidates:["jose"]
//   2. happy: scoped package `@aws-sdk/client-s3` mentioned, not installed → fires
//   3. negative: package mentioned IS in dependencies → does not fire
//   4. negative: package mentioned IS in devDependencies → does not fire
//   5. multiple candidates: 3 packages mentioned, 1 installed → 2 fire
//   6. no package-shaped tokens in description → does not fire
//   7. missing package.json → fires for any package-shaped token (treats deps as empty)
// MISSING_PATTERNS signal:
//   8. happy: PATTERNS.md missing entirely → fires
//   9. happy: PATTERNS.md exists, no overlapping heading tokens → fires
//   10. negative: PATTERNS.md has heading matching objective topic → does not fire
// COMPARISON_KEYWORD signal:
//   11. happy: "evaluate three options" → fires, matched:["evaluate"]
//   12. happy: "we should compare X and Y" → fires
//   13. happy: "choose between A and B" → fires
//   14. happy: "Postgres vs. SQLite" → fires (vs. with period)
//   15. negative: "VS Code editor" → does NOT fire (no period after vs)
//   16. negative: clean prose with no comparison verbs → does not fire
//   17. case-insensitive: "EVALUATE" or "Evaluate" → fires
// Aggregator (detectNovelDomain pure function):
//   18. any signal fires → novel:true
//   19. no signal fires → novel:false, recommendation:null
//   20. all three fire → novel:true, signals all show fired:true
// CLI (cmdDetectNovelDomain):
//   21. happy: tmpdir scaffold with description + package.json → returns valid JSON
//   22. missing description sources → error key, novel:false (failsafe)
//   23. --raw mode → JSON only, no human summary
//   24. unknown objective → error, exit non-zero

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  makeDescription,
  makePackageJson,
  makePatternsMd,
  setupObjectiveScaffold,
} = require('./__fixtures__/novel-domain-fixtures.cjs');

const { detectNovelDomain, cmdDetectNovelDomain } = require('./novel-domain.cjs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'novel-domain-test-'));
}

function removeTmp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Capture stdout/stderr and exit code from cmdDetectNovelDomain.
 * Prevents process.exit from terminating the test process.
 */
function runCmd(cwd, objective, raw) {
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
    cmdDetectNovelDomain(cwd, objective, raw);
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

// ─── NEW_DEP signal ───────────────────────────────────────────────────────────

describe('NEW_DEP signal', () => {
  test('1. jose mentioned, not in package.json → fires, candidates:["jose"]', () => {
    const description = makeDescription({ topic: 'jwt', mentionsPkgs: ['jose'] });
    const packageJson = makePackageJson({ deps: [], devDeps: [] });
    const result = detectNovelDomain({ description, packageJson, patternsMd: null });
    assert.strictEqual(result.signals.new_dep.fired, true);
    assert.ok(result.signals.new_dep.candidates.includes('jose'));
  });

  test('2. scoped package @aws-sdk/client-s3 mentioned, not installed → fires', () => {
    const description = makeDescription({ topic: 's3', mentionsPkgs: ['@aws-sdk/client-s3'] });
    const packageJson = makePackageJson({ deps: [], devDeps: [] });
    const result = detectNovelDomain({ description, packageJson, patternsMd: null });
    assert.strictEqual(result.signals.new_dep.fired, true);
    assert.ok(result.signals.new_dep.candidates.includes('@aws-sdk/client-s3'));
  });

  test('3. package IS in dependencies → does not fire', () => {
    const description = makeDescription({ topic: 'jwt', mentionsPkgs: ['jose'] });
    const packageJson = makePackageJson({ deps: ['jose'], devDeps: [] });
    const result = detectNovelDomain({ description, packageJson, patternsMd: null });
    assert.strictEqual(result.signals.new_dep.fired, false);
  });

  test('4. package IS in devDependencies → does not fire', () => {
    const description = makeDescription({ topic: 'testing', mentionsPkgs: ['vitest'] });
    const packageJson = makePackageJson({ deps: [], devDeps: ['vitest'] });
    const result = detectNovelDomain({ description, packageJson, patternsMd: null });
    assert.strictEqual(result.signals.new_dep.fired, false);
  });

  test('5. 3 packages mentioned, 1 installed → 2 candidates fire', () => {
    const description = makeDescription({ topic: 'database', mentionsPkgs: ['knex', 'pg', 'objection'] });
    // 'pg' is installed
    const packageJson = makePackageJson({ deps: ['pg'], devDeps: [] });
    const result = detectNovelDomain({ description, packageJson, patternsMd: null });
    assert.strictEqual(result.signals.new_dep.fired, true);
    assert.ok(result.signals.new_dep.candidates.includes('knex'));
    assert.ok(result.signals.new_dep.candidates.includes('objection'));
    assert.ok(!result.signals.new_dep.candidates.includes('pg'));
    assert.strictEqual(result.signals.new_dep.candidates.length, 2);
  });

  test('6. no package-shaped tokens in description → does not fire', () => {
    const description = 'Add caching to the API. Use the built-in in-memory cache.';
    const packageJson = makePackageJson({ deps: [], devDeps: [] });
    const result = detectNovelDomain({ description, packageJson, patternsMd: null });
    assert.strictEqual(result.signals.new_dep.fired, false);
  });

  test('7. missing package.json (null) → fires for any package-shaped token', () => {
    const description = makeDescription({ topic: 'jwt', mentionsPkgs: ['jose'] });
    const result = detectNovelDomain({ description, packageJson: null, patternsMd: null });
    assert.strictEqual(result.signals.new_dep.fired, true);
    assert.ok(result.signals.new_dep.candidates.includes('jose'));
  });
});

// ─── MISSING_PATTERNS signal ──────────────────────────────────────────────────

describe('MISSING_PATTERNS signal', () => {
  test('8. PATTERNS.md missing entirely → fires', () => {
    const description = makeDescription({ topic: 'authentication' });
    const result = detectNovelDomain({ description, packageJson: null, patternsMd: null });
    assert.strictEqual(result.signals.missing_patterns.fired, true);
  });

  test('9. PATTERNS.md exists, no overlapping heading tokens → fires', () => {
    // Description is about authentication; PATTERNS.md has Database and Caching headings
    const description = makeDescription({ topic: 'authentication' });
    const patternsMd = makePatternsMd({ headings: ['Database', 'Caching'] });
    const result = detectNovelDomain({ description, packageJson: null, patternsMd });
    assert.strictEqual(result.signals.missing_patterns.fired, true);
  });

  test('10. PATTERNS.md has heading matching objective topic → does not fire', () => {
    // Description mentions "authentication"; PATTERNS.md has "Authentication" heading
    const description = makeDescription({ topic: 'authentication' });
    const patternsMd = makePatternsMd({ headings: ['Authentication', 'Database'] });
    const result = detectNovelDomain({ description, packageJson: null, patternsMd });
    assert.strictEqual(result.signals.missing_patterns.fired, false);
  });
});

// ─── COMPARISON_KEYWORD signal ─────────────────────────────────────────────────

describe('COMPARISON_KEYWORD signal', () => {
  test('11. "evaluate three options" → fires, matched:["evaluate"]', () => {
    const description = makeDescription({ hasComparison: 'evaluate' });
    const result = detectNovelDomain({ description, packageJson: null, patternsMd: null });
    assert.strictEqual(result.signals.comparison_keyword.fired, true);
    assert.ok(result.signals.comparison_keyword.matched.some(m => m.toLowerCase() === 'evaluate'));
  });

  test('12. "we should compare X and Y" → fires', () => {
    const description = makeDescription({ hasComparison: 'compare' });
    const result = detectNovelDomain({ description, packageJson: null, patternsMd: null });
    assert.strictEqual(result.signals.comparison_keyword.fired, true);
  });

  test('13. "choose between A and B" → fires', () => {
    const description = makeDescription({ hasComparison: 'choose between' });
    const result = detectNovelDomain({ description, packageJson: null, patternsMd: null });
    assert.strictEqual(result.signals.comparison_keyword.fired, true);
    assert.ok(result.signals.comparison_keyword.matched.some(m => m.toLowerCase().includes('choose between')));
  });

  test('14. "Postgres vs. SQLite" → fires (vs. with period)', () => {
    const description = makeDescription({ hasComparison: 'vs.' });
    const result = detectNovelDomain({ description, packageJson: null, patternsMd: null });
    assert.strictEqual(result.signals.comparison_keyword.fired, true);
    assert.ok(result.signals.comparison_keyword.matched.some(m => m.toLowerCase().includes('vs.')));
  });

  test('15. "VS Code editor" → does NOT fire (no period after vs)', () => {
    const description = 'Use the VS Code editor extension for development workflow integration.';
    const result = detectNovelDomain({ description, packageJson: null, patternsMd: null });
    assert.strictEqual(result.signals.comparison_keyword.fired, false,
      'VS Code should not trigger comparison_keyword — no period after "vs"');
  });

  test('16. clean prose with no comparison verbs → does not fire', () => {
    const description = 'Add an API endpoint to retrieve user profile data. Return JSON with standard fields.';
    const result = detectNovelDomain({ description, packageJson: null, patternsMd: null });
    assert.strictEqual(result.signals.comparison_keyword.fired, false);
  });

  test('17. case-insensitive: "EVALUATE" → fires', () => {
    const description = makeDescription({ hasComparison: 'EVALUATE' });
    const result = detectNovelDomain({ description, packageJson: null, patternsMd: null });
    assert.strictEqual(result.signals.comparison_keyword.fired, true);
  });

  test('17b. case-insensitive: "Evaluate" → fires', () => {
    const description = makeDescription({ hasComparison: 'Evaluate' });
    const result = detectNovelDomain({ description, packageJson: null, patternsMd: null });
    assert.strictEqual(result.signals.comparison_keyword.fired, true);
  });
});

// ─── Aggregator (detectNovelDomain pure function) ────────────────────────────

describe('detectNovelDomain aggregator', () => {
  test('18. any signal fires → novel:true', () => {
    // Only comparison_keyword fires (no packages, PATTERNS.md provided with match)
    const description = makeDescription({ topic: 'authentication', hasComparison: 'evaluate' });
    const patternsMd = makePatternsMd({ headings: ['Authentication'] });
    const packageJson = makePackageJson({ deps: [], devDeps: [] });
    const result = detectNovelDomain({ description, packageJson, patternsMd });
    assert.strictEqual(result.novel, true);
    assert.ok(result.recommendation !== null);
  });

  test('19. no signal fires → novel:false, recommendation:null', () => {
    // Topic is "authentication", PATTERNS.md has matching heading, no new deps, no comparison
    const description = 'Add token-based authentication. Use the existing auth module.';
    const packageJson = makePackageJson({ deps: [], devDeps: [] });
    const patternsMd = makePatternsMd({ headings: ['Authentication', 'Token'] });
    // Use a description that matches PATTERNS.md headings (token appears in both)
    const result = detectNovelDomain({ description, packageJson, patternsMd });
    // new_dep should not fire (no backtick packages), comparison_keyword should not fire
    // missing_patterns: check if "authentication" or "token" appear as heading tokens
    assert.strictEqual(result.novel, result.signals.new_dep.fired ||
      result.signals.missing_patterns.fired ||
      result.signals.comparison_keyword.fired);
    // We specifically verify that when all three are false, novel=false
    if (!result.signals.new_dep.fired && !result.signals.missing_patterns.fired && !result.signals.comparison_keyword.fired) {
      assert.strictEqual(result.novel, false);
      assert.strictEqual(result.recommendation, null);
    }
  });

  test('19b. forced clean scenario → novel:false, recommendation:null', () => {
    // No backtick packages, PATTERNS.md with auth heading, no comparison keywords
    const description = 'Extend the authentication module with session timeout handling.';
    const packageJson = makePackageJson({ deps: [], devDeps: [] });
    // "authentication" tokenizes to "authentication" which matches "Authentication" heading token
    const patternsMd = makePatternsMd({ headings: ['Authentication', 'Sessions'] });
    const result = detectNovelDomain({ description, packageJson, patternsMd });
    assert.strictEqual(result.signals.comparison_keyword.fired, false);
    assert.strictEqual(result.signals.new_dep.fired, false);
    // missing_patterns should not fire since "authentication" matches heading
    assert.strictEqual(result.signals.missing_patterns.fired, false);
    assert.strictEqual(result.novel, false);
    assert.strictEqual(result.recommendation, null);
  });

  test('20. all three signals fire → novel:true, all signals fired:true', () => {
    // new_dep: jose in backticks, not in package.json
    // missing_patterns: PATTERNS.md has no matching heading for the description
    // comparison_keyword: "evaluate" present
    const description = `Evaluate options for JWT auth using \`jose\` library. Choose between strategies.`;
    const packageJson = makePackageJson({ deps: [], devDeps: [] });
    const patternsMd = makePatternsMd({ headings: ['Database', 'Caching'] }); // no auth match
    const result = detectNovelDomain({ description, packageJson, patternsMd });
    assert.strictEqual(result.novel, true);
    assert.strictEqual(result.signals.new_dep.fired, true);
    assert.strictEqual(result.signals.missing_patterns.fired, true);
    assert.strictEqual(result.signals.comparison_keyword.fired, true);
  });
});

// ─── CLI (cmdDetectNovelDomain) ───────────────────────────────────────────────

describe('CLI — cmdDetectNovelDomain', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTmp(); });
  afterEach(() => { removeTmp(tmpDir); });

  test('21. happy: scaffold with description + package.json → valid JSON output', () => {
    const description = makeDescription({ topic: 'jwt', mentionsPkgs: ['jose'] });
    const packageJson = makePackageJson({ deps: [], devDeps: [] });
    const patternsMd = makePatternsMd({ headings: ['Authentication'] });
    setupObjectiveScaffold(tmpDir, {
      objective: '98',
      description,
      packageJson,
      patternsMd,
    });

    const { stdout, exitCode } = runCmd(tmpDir, '98', false);
    assert.strictEqual(exitCode, 0, 'should exit 0 on success');
    const parsed = JSON.parse(stdout);
    assert.ok('novel' in parsed, 'result should have "novel" key');
    assert.ok('signals' in parsed, 'result should have "signals" key');
    assert.ok('recommendation' in parsed, 'result should have "recommendation" key');
    assert.ok('new_dep' in parsed.signals);
    assert.ok('missing_patterns' in parsed.signals);
    assert.ok('comparison_keyword' in parsed.signals);
  });

  test('22. missing description sources → error key, novel:false (failsafe)', () => {
    // Create scaffold but no CONTEXT.md and no description in ROADMAP
    setupObjectiveScaffold(tmpDir, {
      objective: '98',
      description: null,   // omit CONTEXT.md
      packageJson: null,
      patternsMd: null,
    });

    const { stdout, exitCode } = runCmd(tmpDir, '98', false);
    // Failsafe-permissive: returns { novel: false, error: "..." } and exits 0
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.novel, false);
    assert.ok('error' in parsed, 'should have error key when no description found');
  });

  test('23. --raw mode → JSON on stdout (same content)', () => {
    const description = makeDescription({ topic: 'authentication' });
    setupObjectiveScaffold(tmpDir, {
      objective: '98',
      description,
      packageJson: makePackageJson({ deps: [], devDeps: [] }),
      patternsMd: makePatternsMd({ headings: ['Authentication'] }),
    });

    const { stdout: rawOut, exitCode } = runCmd(tmpDir, '98', true);
    assert.strictEqual(exitCode, 0);
    // --raw still produces JSON (the raw parameter affects verbosity, not format)
    const parsed = JSON.parse(rawOut);
    assert.ok('novel' in parsed);
  });

  test('24. unknown objective → error reported, exit non-zero', () => {
    // Create minimal .planning structure but no objective 97
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n', 'utf-8');

    let exitCode = 0;
    let stdout = '';
    let stderr = '';

    const origStdout = process.stdout.write.bind(process.stdout);
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit.bind(process);

    process.stdout.write = (d) => { stdout += String(d); return true; };
    process.stderr.write = (d) => { stderr += String(d); return true; };
    process.exit = (code) => {
      exitCode = code || 0;
      throw new Error(`__process_exit_${code || 0}__`);
    };

    try {
      cmdDetectNovelDomain(tmpDir, '97', false);
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

    assert.notStrictEqual(exitCode, 0, 'should exit non-zero for unknown objective');
  });
});
