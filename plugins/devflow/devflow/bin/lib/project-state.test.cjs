'use strict';

/**
 * project-state.test.cjs — TDD test suite for lib/project-state.cjs
 *
 * Test list (25 cases, per TDD Playbook habit 2):
 *
 * isSubstantive pure function (cases 1-8):
 *   1. typical substantive project (git>7 + files>10 + manifest + not scratch) → true
 *   2. small young project (git=2d, files=5) → false
 *   3. git-age threshold only (git=240d, files=5) → true
 *   4. file-count threshold only (git=2d, files=20) → true
 *   5. no manifest → false
 *   6. scratch dir → false
 *   7. null git_age + files>10 → true (file threshold; null age is not-substantive by age but OK via files)
 *   8. null git_age + files≤10 → false
 *
 * isScratchDir pure function (cases 9-13):
 *   9.  /tmp/foo → true
 *   10. /var/folders/abc/T/xyz → true
 *   11. <homedir>/Downloads/repo → true
 *   12. /Users/x/Source/repo → false
 *   13. /home/user/projects/myapp → false
 *
 * detectManifest pure function via fixture dirs (cases 14-20 + 20b):
 *   14. package.json + tsconfig.json → typescript
 *   15. package.json only → javascript
 *   16. Cargo.toml → rust
 *   17. pyproject.toml → python
 *   18. go.mod → go
 *   19. Gemfile → ruby
 *   20. pom.xml → java
 *   20b. no manifest → has_manifest:false, primary_lang:null
 *
 * gitAgeDays I/O wrapper (cases 21a-21c):
 *   21a. real git repo with backdated commit ~30d → returns integer ≥7
 *   21b. dir without .git → null
 *   21c. dir with .git but no commits → null
 *
 * getProjectState integration — 5 acceptance fixtures from #28 (cases 21-25):
 *   21. ambient project (planning + git + manifest + 5 files) → has_planning:true, is_substantive:false
 *   22. brownfield substantive (git repo, manifest, 50 files, no planning) → is_substantive:true
 *   23. scratch dir in /tmp → is_substantive:false
 *   24. no-git project (manifest + 5 files, no .git) → has_git:false, git_age_days:null
 *   25. declined project → previously_declined:true, decline_expires:non-null
 *
 * cmdProjectState CLI (cases 26-28):
 *   26. raw mode with valid cwd → valid JSON with 8 fields
 *   27. nonexistent path → process.exit(1) behavior
 *   28. subprocess: node df-tools.cjs project-state <fixture> --raw → exit 0, valid JSON
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  isSubstantive,
  isScratchDir,
  detectManifest,
  getProjectState,
} = require('./project-state.cjs');

const {
  mkAmbientProject,
  mkBrownfieldSubstantive,
  mkScratchDirInTmp,
  mkNoGitProject,
  mkManifestVariant,
  mkNoManifest,
  buildSubstantiveInputs,
} = require('./__fixtures__/project-state-fixtures.cjs');

const { writeDecline, _setDeclinePath, _resetMocks } = require('./decline-tracker.cjs');

// ─── Git availability guard ───────────────────────────────────────────────────

let gitAvailable = true;
try {
  spawnSync('git', ['--version'], { stdio: 'ignore', timeout: 2000 });
} catch {
  gitAvailable = false;
}

// ─── Helper: cleanup ──────────────────────────────────────────────────────────

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ─── isSubstantive (cases 1–8) ────────────────────────────────────────────────

test('case 1: typical substantive project → true', () => {
  const inputs = buildSubstantiveInputs({ git_age_days: 240, code_files: 47, has_manifest: true, is_scratch: false });
  assert.equal(isSubstantive(inputs), true);
});

test('case 2: small young project (git=2d, files=5, manifest) → false', () => {
  const inputs = buildSubstantiveInputs({ git_age_days: 2, code_files: 5, has_manifest: true, is_scratch: false });
  assert.equal(isSubstantive(inputs), false);
});

test('case 3: git-age threshold only (git=240d, files=5) → true', () => {
  const inputs = buildSubstantiveInputs({ git_age_days: 240, code_files: 5, has_manifest: true, is_scratch: false });
  assert.equal(isSubstantive(inputs), true);
});

test('case 4: file-count threshold only (git=2d, files=20) → true', () => {
  const inputs = buildSubstantiveInputs({ git_age_days: 2, code_files: 20, has_manifest: true, is_scratch: false });
  assert.equal(isSubstantive(inputs), true);
});

test('case 5: no manifest → false', () => {
  const inputs = buildSubstantiveInputs({ git_age_days: 240, code_files: 47, has_manifest: false, is_scratch: false });
  assert.equal(isSubstantive(inputs), false);
});

test('case 6: scratch dir → false', () => {
  const inputs = buildSubstantiveInputs({ git_age_days: 240, code_files: 47, has_manifest: true, is_scratch: true });
  assert.equal(isSubstantive(inputs), false);
});

test('case 7: null git_age + files > 10 → true (file threshold; null age treated as 0)', () => {
  const inputs = buildSubstantiveInputs({ git_age_days: null, code_files: 20, has_manifest: true, is_scratch: false });
  assert.equal(isSubstantive(inputs), true);
});

test('case 8: null git_age + files ≤ 10 → false', () => {
  const inputs = buildSubstantiveInputs({ git_age_days: null, code_files: 5, has_manifest: true, is_scratch: false });
  assert.equal(isSubstantive(inputs), false);
});

// ─── isScratchDir (cases 9–13) ───────────────────────────────────────────────

test('case 9: /tmp/foo → isScratchDir true', () => {
  assert.equal(isScratchDir('/tmp/foo'), true);
});

test('case 10: /var/folders/abc/T/xyz → isScratchDir true', () => {
  assert.equal(isScratchDir('/var/folders/abc/T/xyz'), true);
});

test('case 11: <homedir>/Downloads/repo → isScratchDir true', () => {
  const downloadsRepo = path.join(os.homedir(), 'Downloads', 'some-repo');
  assert.equal(isScratchDir(downloadsRepo), true);
});

test('case 12: /Users/x/Source/repo → isScratchDir false', () => {
  assert.equal(isScratchDir('/Users/x/Source/repo'), false);
});

test('case 13: /home/user/projects/myapp → isScratchDir false', () => {
  assert.equal(isScratchDir('/home/user/projects/myapp'), false);
});

// ─── detectManifest (cases 14–20 + 20b) ─────────────────────────────────────

test('case 14: package.json + tsconfig.json → typescript', () => {
  const root = mkManifestVariant('typescript');
  try {
    const result = detectManifest(root);
    assert.equal(result.has_manifest, true);
    assert.equal(result.primary_lang, 'typescript');
  } finally {
    cleanup(root);
  }
});

test('case 15: package.json only → javascript', () => {
  const root = mkManifestVariant('javascript');
  try {
    const result = detectManifest(root);
    assert.equal(result.has_manifest, true);
    assert.equal(result.primary_lang, 'javascript');
  } finally {
    cleanup(root);
  }
});

test('case 16: Cargo.toml → rust', () => {
  const root = mkManifestVariant('rust');
  try {
    const result = detectManifest(root);
    assert.equal(result.has_manifest, true);
    assert.equal(result.primary_lang, 'rust');
  } finally {
    cleanup(root);
  }
});

test('case 17: pyproject.toml → python', () => {
  const root = mkManifestVariant('python');
  try {
    const result = detectManifest(root);
    assert.equal(result.has_manifest, true);
    assert.equal(result.primary_lang, 'python');
  } finally {
    cleanup(root);
  }
});

test('case 18: go.mod → go', () => {
  const root = mkManifestVariant('go');
  try {
    const result = detectManifest(root);
    assert.equal(result.has_manifest, true);
    assert.equal(result.primary_lang, 'go');
  } finally {
    cleanup(root);
  }
});

test('case 19: Gemfile → ruby', () => {
  const root = mkManifestVariant('ruby');
  try {
    const result = detectManifest(root);
    assert.equal(result.has_manifest, true);
    assert.equal(result.primary_lang, 'ruby');
  } finally {
    cleanup(root);
  }
});

test('case 20: pom.xml → java', () => {
  const root = mkManifestVariant('java');
  try {
    const result = detectManifest(root);
    assert.equal(result.has_manifest, true);
    assert.equal(result.primary_lang, 'java');
  } finally {
    cleanup(root);
  }
});

test('case 20b: no manifest → has_manifest:false, primary_lang:null', () => {
  const root = mkNoManifest();
  try {
    const result = detectManifest(root);
    assert.equal(result.has_manifest, false);
    assert.equal(result.primary_lang, null);
  } finally {
    cleanup(root);
  }
});

// ─── gitAgeDays I/O wrapper (cases 21a–21c) ──────────────────────────────────

test('case 21a: real git repo with backdated commit → returns integer ≥ 7', () => {
  if (!gitAvailable) {
    test.skip('git unavailable');
    return;
  }
  // Import gitAgeDays — it's not exported directly, so we test it via getProjectState
  // (or we can destructure if it's exported). We use mkBrownfieldSubstantive which
  // commits 30d ago, then verify via getProjectState that git_age_days >= 7.
  const root = mkBrownfieldSubstantive();
  try {
    const state = getProjectState(root);
    assert.ok(state.git_age_days !== null, 'git_age_days should not be null');
    assert.ok(state.git_age_days >= 7, `git_age_days expected ≥ 7, got ${state.git_age_days}`);
    assert.ok(state.git_age_days <= 35, `git_age_days expected ≤ 35, got ${state.git_age_days}`);
  } finally {
    cleanup(root);
  }
});

test('case 21b: dir without .git → git_age_days null', () => {
  const root = mkNoGitProject();
  try {
    const state = getProjectState(root);
    assert.equal(state.git_age_days, null);
  } finally {
    cleanup(root);
  }
});

test('case 21c: dir with .git but no commits → git_age_days null', () => {
  if (!gitAvailable) {
    test.skip('git unavailable');
    return;
  }
  // Create dir with .git/ stub (empty, not initialized via git init — simulates empty repo)
  // Actually we need a real git repo with no commits. git init creates one with no commits.
  const root = fs.mkdtempSync(path.join(os.homedir(), '.devflow-test-fixtures', 'ps-emptyrepo-'));
  try {
    fs.mkdirSync(path.join(root, '.git'));
    // Minimal .git structure to fool has_git check but have no commits
    // git log will fail (non-zero exit) → gitAgeDays returns null
    const state = getProjectState(root);
    assert.equal(state.git_age_days, null, 'empty .git stub should yield null git_age_days');
  } finally {
    cleanup(root);
  }
});

// ─── getProjectState integration — 5 acceptance fixtures (cases 22–26) ──────
// Note: numbering follows #28 acceptance fixture list (not the gitAgeDays subcases above)

test('case 22: ambient project (planning + git + manifest + 5 files) → has_planning:true, is_substantive:false', () => {
  const root = mkAmbientProject();
  try {
    const state = getProjectState(root);
    assert.equal(state.has_planning, true, 'has_planning should be true');
    assert.equal(state.has_git, true, 'has_git should be true');
    // 5 files < 10 threshold; null git_age_days (no commits) → is_substantive:false
    assert.equal(state.is_substantive, false, 'is_substantive should be false for ambient project with 5 files');
    assert.equal(typeof state.code_files, 'number');
    assert.ok(state.code_files >= 5, `code_files expected ≥ 5, got ${state.code_files}`);
    assert.equal(state.primary_lang, 'javascript');
    assert.equal(state.previously_declined, false);
    assert.equal(state.decline_expires, null);
  } finally {
    cleanup(root);
  }
});

test('case 23: brownfield substantive (git+manifest+50 files, no planning) → is_substantive:true', () => {
  if (!gitAvailable) {
    test.skip('git unavailable');
    return;
  }
  const root = mkBrownfieldSubstantive();
  try {
    const state = getProjectState(root);
    assert.equal(state.has_planning, false, 'has_planning should be false');
    assert.equal(state.has_git, true, 'has_git should be true');
    assert.ok(state.git_age_days >= 7, `git_age_days expected ≥ 7, got ${state.git_age_days}`);
    assert.equal(state.code_files, 50, `code_files expected 50, got ${state.code_files}`);
    assert.equal(state.primary_lang, 'javascript');
    assert.equal(state.is_substantive, true, 'is_substantive should be true for brownfield with backdated git');
    assert.equal(state.previously_declined, false);
    assert.equal(state.decline_expires, null);
  } finally {
    cleanup(root);
  }
});

test('case 24: scratch dir in /tmp → is_substantive:false', () => {
  const root = mkScratchDirInTmp();
  try {
    const state = getProjectState(root);
    assert.equal(state.is_substantive, false, 'scratch dir should not be substantive');
    assert.equal(state.primary_lang, 'javascript', 'should detect manifest in scratch dir');
    assert.equal(state.previously_declined, false);
  } finally {
    cleanup(root);
  }
});

test('case 25: no-git project (manifest + 5 files, no .git/) → has_git:false, git_age_days:null', () => {
  const root = mkNoGitProject();
  try {
    const state = getProjectState(root);
    assert.equal(state.has_git, false, 'has_git should be false');
    assert.equal(state.git_age_days, null, 'git_age_days should be null when no git');
    assert.equal(state.is_substantive, false, '5 files + no git → not substantive');
    assert.equal(state.primary_lang, 'javascript');
    assert.equal(state.previously_declined, false);
  } finally {
    cleanup(root);
  }
});

test('case 26: declined project → previously_declined:true, decline_expires:non-null', () => {
  if (!gitAvailable) {
    test.skip('git unavailable');
    return;
  }
  const root = mkBrownfieldSubstantive();
  // Redirect decline-tracker to a test-specific path so we don't pollute real ~/.claude/devflow/
  const declinePath = path.join(root, '.devflow-test-decline.json');
  _setDeclinePath(declinePath);
  try {
    const now = '2026-05-04T12:00:00.000Z';
    writeDecline(root, { now, durationDays: 30 });

    const state = getProjectState(root, { now });
    assert.equal(state.previously_declined, true, 'previously_declined should be true');
    assert.ok(state.decline_expires !== null, 'decline_expires should be non-null');
    assert.ok(typeof state.decline_expires === 'string', 'decline_expires should be ISO string');
  } finally {
    _resetMocks();
    cleanup(root);
  }
});

// ─── cmdProjectState CLI (cases 27–28) ────────────────────────────────────────

test('case 27: raw mode with valid cwd → valid JSON with 8 required fields', () => {
  const root = mkNoGitProject();
  try {
    // We test via subprocess to avoid process.exit propagation issues
    const dfToolsPath = path.resolve(__dirname, '..', 'df-tools.cjs');
    const result = spawnSync(process.execPath, [dfToolsPath, 'project-state', root, '--raw'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    let parsed;
    try {
      parsed = JSON.parse(result.stdout.trim());
    } catch (e) {
      assert.fail(`Output is not valid JSON: ${result.stdout}\nError: ${e.message}`);
    }
    // Verify all 8 required fields are present
    const required = [
      'has_planning', 'has_git', 'git_age_days', 'code_files',
      'primary_lang', 'is_substantive', 'previously_declined', 'decline_expires',
    ];
    for (const field of required) {
      assert.ok(Object.prototype.hasOwnProperty.call(parsed, field), `Missing field: ${field}`);
    }
    // Type checks
    assert.equal(typeof parsed.has_planning, 'boolean');
    assert.equal(typeof parsed.has_git, 'boolean');
    assert.equal(typeof parsed.is_substantive, 'boolean');
    assert.equal(typeof parsed.previously_declined, 'boolean');
    assert.equal(typeof parsed.code_files, 'number');
  } finally {
    cleanup(root);
  }
});

test('case 28: nonexistent path → exit 1 with stderr', () => {
  const dfToolsPath = path.resolve(__dirname, '..', 'df-tools.cjs');
  const result = spawnSync(
    process.execPath,
    [dfToolsPath, 'project-state', '/nonexistent/path/that/does/not/exist/xyz123', '--raw'],
    { encoding: 'utf-8', timeout: 5000 },
  );
  assert.equal(result.status, 1, `Expected exit 1, got ${result.status}`);
  assert.ok(result.stderr.length > 0, 'Should emit error to stderr');
});

test('case 29: subprocess smoke — df-tools project-state <brownfield> --raw → valid JSON', () => {
  if (!gitAvailable) {
    test.skip('git unavailable');
    return;
  }
  const root = mkBrownfieldSubstantive();
  try {
    const dfToolsPath = path.resolve(__dirname, '..', 'df-tools.cjs');
    const result = spawnSync(process.execPath, [dfToolsPath, 'project-state', root, '--raw'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    let parsed;
    try {
      parsed = JSON.parse(result.stdout.trim());
    } catch (e) {
      assert.fail(`Output is not valid JSON: ${result.stdout}`);
    }
    // Validate brownfield-substantive expectations
    assert.equal(parsed.has_planning, false);
    assert.equal(parsed.has_git, true);
    assert.ok(parsed.git_age_days >= 7, `git_age_days expected ≥ 7, got ${parsed.git_age_days}`);
    assert.equal(parsed.code_files, 50);
    assert.equal(parsed.primary_lang, 'javascript');
    assert.equal(parsed.is_substantive, true);
    assert.equal(parsed.previously_declined, false);
    assert.equal(parsed.decline_expires, null);
  } finally {
    cleanup(root);
  }
});
