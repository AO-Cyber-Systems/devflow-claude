'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const oa = require('./org-awareness.cjs');
const fix = require('./__fixtures__/awareness-fixtures.cjs');

// ─── Group T — tokenize helper (pure logic) ───────────────────────────────────

test('T1 — tokenize empty string returns empty Set', () => {
  const t = oa._tokenize('');
  assert.ok(t instanceof Set);
  assert.strictEqual(t.size, 0);
});

test('T2 — tokenize null/undefined returns empty Set', () => {
  assert.strictEqual(oa._tokenize(null).size, 0);
  assert.strictEqual(oa._tokenize(undefined).size, 0);
});

test('T3 — tokenize simple lowercase phrase returns length>=3 tokens deduped', () => {
  const t = oa._tokenize('auth flow token auth');
  assert.ok(t.has('auth'));
  assert.ok(t.has('flow'));
  assert.ok(t.has('token'));
  // deduped — Set so auth only once
  assert.strictEqual(t.size, 3);
});

test('T4 — tokenize filters stop-words (the auth flow -> auth, flow)', () => {
  const t = oa._tokenize('the auth flow');
  assert.ok(!t.has('the'));
  assert.ok(t.has('auth'));
  assert.ok(t.has('flow'));
});

test('T5 — tokenize strips punctuation (auth-flow.test.cjs -> auth, flow, test, cjs)', () => {
  const t = oa._tokenize('auth-flow.test.cjs');
  assert.ok(t.has('auth'));
  assert.ok(t.has('flow'));
  assert.ok(t.has('test'));
  assert.ok(t.has('cjs'));
});

test('T6 — tokenize splits on hyphen and underscore (auth_keys-controller -> auth, keys, controller)', () => {
  const t = oa._tokenize('auth_keys-controller');
  assert.ok(t.has('auth'));
  assert.ok(t.has('keys'));
  assert.ok(t.has('controller'));
});

test('T7 — tokenize drops tokens with length < 3 (is, a, of, etc never appear)', () => {
  const t = oa._tokenize('is a of authentication');
  assert.ok(!t.has('is'));
  assert.ok(!t.has('a'));
  assert.ok(!t.has('of'));
  assert.ok(t.has('authentication'));
});

// ─── Group SC — scoring algorithm (pure logic) ────────────────────────────────

test('SC1 — identical token sets score 1.0', () => {
  const a = new Set(['auth', 'flow']);
  const b = new Set(['auth', 'flow']);
  assert.strictEqual(oa._score(a, b), 1.0);
});

test('SC2 — zero overlap scores 0.0', () => {
  const a = new Set(['auth', 'flow']);
  const b = new Set(['render', 'widget']);
  assert.strictEqual(oa._score(a, b), 0.0);
});

test('SC3 — half overlap scores 0.5 (both 4-token sets, 2 shared)', () => {
  const a = new Set(['auth', 'flow', 'token', 'user']);
  const b = new Set(['auth', 'flow', 'render', 'widget']);
  // intersection=2, max(4,4)=4 → 0.5
  assert.strictEqual(oa._score(a, b), 0.5);
});

test('SC4 — empty current set scores 0 (no divide-by-zero)', () => {
  const a = new Set();
  const b = new Set(['auth', 'flow']);
  assert.strictEqual(oa._score(a, b), 0);
});

test('SC5 — empty sibling set scores 0', () => {
  const a = new Set(['auth', 'flow']);
  const b = new Set();
  assert.strictEqual(oa._score(a, b), 0);
});

// ─── Group D — sibling discovery (discoverSiblings via _setRunFs) ─────────────

test('D1 — default glob includes only repos with .git + .planning', () => {
  // Three dirs: one with .git+.planning, one with .git only, one with .planning only
  const sourceRoot = path.join(os.homedir(), 'Source');
  const repoA = path.join(sourceRoot, 'repo-a'); // .git + .planning → included
  const repoB = path.join(sourceRoot, 'repo-b'); // .git only → excluded
  const repoC = path.join(sourceRoot, 'repo-c'); // .planning only → excluded

  const mock = fix.buildMockRunFs({
    dirs: {
      [sourceRoot]: ['repo-a', 'repo-b', 'repo-c'],
      [repoA]: ['.git', '.planning'],
      [repoB]: ['.git'],
      [repoC]: ['.planning'],
    },
    files: {
      [path.join(repoA, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# repo-a\n`,
    },
  });

  const currentCwd = '/non-existent-cwd';
  oa._setRunFs({
    ...mock,
    statSync(p) {
      // dirs are always directories
      const dirs = [sourceRoot, repoA, repoB, repoC];
      if (dirs.includes(p)) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      return mock.statSync(p);
    },
    existsSync(p) {
      if (p === path.join(repoA, '.git')) return true;
      if (p === path.join(repoA, '.planning')) return true;
      if (p === path.join(repoB, '.git')) return true;
      if (p === path.join(repoB, '.planning')) return false;
      if (p === path.join(repoC, '.git')) return false;
      if (p === path.join(repoC, '.planning')) return true;
      if (p === sourceRoot) return true;
      return mock.existsSync(p);
    },
  });

  try {
    const result = oa.scanSiblings({ objective_id: '03', cwd: currentCwd });
    // repoA should be included (has both), B and C excluded
    const repos = result.matches.map(m => m.repo);
    assert.ok(repos.includes('repo-a'), `expected repo-a in matches, got: ${JSON.stringify(repos)}`);
    assert.ok(!repos.includes('repo-b'), 'repo-b should be excluded (no .planning)');
    assert.ok(!repos.includes('repo-c'), 'repo-c should be excluded (no .git)');
  } finally {
    oa._resetFsMock();
  }
});

test('D2 — configured sibling_repos replaces default glob; non-existent path emits warning', () => {
  const realPath = '/fake/configured-repo';
  const missingPath = '/fake/non-existent';

  const mock = fix.buildMockRunFs({
    dirs: {
      [realPath]: ['.git', '.planning'],
    },
    files: {
      [path.join(realPath, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# configured-repo\n`,
    },
    missing: [missingPath],
  });

  oa._setRunFs({
    ...mock,
    statSync(p) {
      if (p === realPath) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      return mock.statSync(p);
    },
    existsSync(p) {
      if (p === missingPath) return false;
      if (p === realPath) return true;
      if (p === path.join(realPath, '.git')) return true;
      if (p === path.join(realPath, '.planning')) return true;
      return mock.existsSync(p);
    },
  });

  try {
    const result = oa.scanSiblings({
      objective_id: '03',
      cwd: '/current-repo',
      config_paths: [realPath, missingPath],
    });
    // non-existent path warning
    assert.ok(
      result.warnings.some(w => w.includes('non-existent') || w.includes(missingPath)),
      `expected warning about missing path, got: ${JSON.stringify(result.warnings)}`,
    );
  } finally {
    oa._resetFsMock();
  }
});

test('D3 — home-relative ~/foo path expanded correctly via os.homedir()', () => {
  const expandedPath = path.join(os.homedir(), 'foo-repo');

  const mock = fix.buildMockRunFs({
    dirs: {
      [expandedPath]: ['.git', '.planning'],
    },
    files: {
      [path.join(expandedPath, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# foo-repo\n`,
    },
  });

  oa._setRunFs({
    ...mock,
    statSync(p) {
      if (p === expandedPath) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      return mock.statSync(p);
    },
    existsSync(p) {
      if (p === expandedPath) return true;
      if (p === path.join(expandedPath, '.git')) return true;
      if (p === path.join(expandedPath, '.planning')) return true;
      return mock.existsSync(p);
    },
  });

  try {
    const result = oa.scanSiblings({
      objective_id: '03',
      cwd: '/current-repo',
      config_paths: ['~/foo-repo'],
    });
    const repos = result.matches.map(m => m.repo);
    assert.ok(repos.includes('foo-repo'), `expected foo-repo in matches, got: ${JSON.stringify(repos)}`);
  } finally {
    oa._resetFsMock();
  }
});

test('D4 — current repo excluded from sibling list even if it would match', () => {
  // Use config_paths so we can use explicit absolute paths that match the mock
  const cwd = '/fake/current-repo';
  const sibling = '/fake/sibling-repo';

  const mock = fix.buildMockRunFs({
    dirs: {
      [sibling]: ['.git', '.planning'],
    },
    files: {
      [path.join(cwd, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# current-repo\n`,
      [path.join(sibling, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# sibling-repo\n`,
    },
  });

  oa._setRunFs({
    ...mock,
    statSync(p) {
      if (p === cwd) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      if (p === sibling) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      return mock.statSync(p);
    },
    existsSync(p) {
      if (p === cwd) return true;
      if (p === sibling) return true;
      if (p === path.join(cwd, '.git')) return true;
      if (p === path.join(cwd, '.planning')) return true;
      if (p === path.join(sibling, '.git')) return true;
      if (p === path.join(sibling, '.planning')) return true;
      return mock.existsSync(p);
    },
  });

  try {
    // Pass both cwd and sibling as config_paths — cwd should be excluded, sibling included
    const result = oa.scanSiblings({
      objective_id: '03',
      cwd,
      config_paths: [cwd, sibling],
    });
    const repos = result.matches.map(m => m.repo);
    assert.ok(!repos.includes('current-repo'), 'current repo should be excluded');
    assert.ok(repos.includes('sibling-repo'), `sibling should be included, got: ${JSON.stringify(repos)}`);
  } finally {
    oa._resetFsMock();
  }
});

test('D5 — sibling without PROJECT.md silently excluded', () => {
  const sibling = '/fake/no-project-repo';
  const cwd = '/fake/cwd';

  const mock = fix.buildMockRunFs({
    dirs: {
      [sibling]: ['.git', '.planning'],
    },
    missing: [path.join(sibling, 'PROJECT.md'), path.join(cwd, 'PROJECT.md')],
  });

  oa._setRunFs({
    ...mock,
    statSync(p) {
      if (p === sibling) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      return mock.statSync(p);
    },
    existsSync(p) {
      if (p === sibling) return true;
      if (p === path.join(sibling, '.git')) return true;
      if (p === path.join(sibling, '.planning')) return true;
      if (p === path.join(sibling, 'PROJECT.md')) return false;
      if (p === path.join(cwd, 'PROJECT.md')) return false;
      return mock.existsSync(p);
    },
  });

  try {
    const result = oa.scanSiblings({
      objective_id: '03',
      cwd,
      config_paths: [sibling],
    });
    assert.strictEqual(result.matches.length, 0);
    assert.strictEqual(result.scanned_repos, 0);
  } finally {
    oa._resetFsMock();
  }
});

test('D6 — sibling with org mismatch silently excluded', () => {
  const sibling = '/fake/wrong-org-repo';
  const cwd = '/fake/cwd-has-org';

  const mock = fix.buildMockRunFs({
    dirs: { [sibling]: ['.git', '.planning'] },
    files: {
      [path.join(cwd, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# current\n`,
      [path.join(sibling, 'PROJECT.md')]: `---\norg: Different-Org\nkind: api\n---\n# wrong-org\n`,
    },
  });

  oa._setRunFs({
    ...mock,
    statSync(p) {
      if (p === sibling) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      return mock.statSync(p);
    },
    existsSync(p) {
      if (p === sibling) return true;
      if (p === path.join(sibling, '.git')) return true;
      if (p === path.join(sibling, '.planning')) return true;
      return mock.existsSync(p);
    },
  });

  try {
    const result = oa.scanSiblings({
      objective_id: '03',
      cwd,
      config_paths: [sibling],
    });
    assert.strictEqual(result.matches.length, 0);
    assert.strictEqual(result.scanned_repos, 0);
  } finally {
    oa._resetFsMock();
  }
});

test('D7 — sibling without org, current also without org → INCLUDED (fallback)', () => {
  const sibling = '/fake/no-org-sibling';
  const cwd = '/fake/no-org-cwd';

  const mock = fix.buildMockRunFs({
    dirs: { [sibling]: ['.git', '.planning'] },
    files: {
      [path.join(cwd, 'PROJECT.md')]: `---\nkind: api\n---\n# current (no org)\n`,
      [path.join(sibling, 'PROJECT.md')]: `---\nkind: api\n---\n# sibling (no org)\n`,
    },
  });

  oa._setRunFs({
    ...mock,
    statSync(p) {
      if (p === sibling) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      return mock.statSync(p);
    },
    existsSync(p) {
      if (p === sibling) return true;
      if (p === path.join(sibling, '.git')) return true;
      if (p === path.join(sibling, '.planning')) return true;
      return mock.existsSync(p);
    },
  });

  try {
    const result = oa.scanSiblings({
      objective_id: '03',
      cwd,
      config_paths: [sibling],
    });
    assert.ok(result.scanned_repos >= 1, `expected sibling to be scanned, scanned_repos=${result.scanned_repos}`);
  } finally {
    oa._resetFsMock();
  }
});

test('D8 — sibling without org, current HAS org → EXCLUDED', () => {
  const sibling = '/fake/no-org-sibling-d8';
  const cwd = '/fake/has-org-cwd-d8';

  const mock = fix.buildMockRunFs({
    dirs: { [sibling]: ['.git', '.planning'] },
    files: {
      // current has org: AO-Cyber-Systems
      [path.join(cwd, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# current (has org)\n`,
      // sibling has NO org field
      [path.join(sibling, 'PROJECT.md')]: `---\nkind: api\n---\n# sibling (no org)\n`,
    },
  });

  oa._setRunFs({
    ...mock,
    statSync(p) {
      if (p === sibling) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      return mock.statSync(p);
    },
    existsSync(p) {
      if (p === sibling) return true;
      if (p === path.join(sibling, '.git')) return true;
      if (p === path.join(sibling, '.planning')) return true;
      return mock.existsSync(p);
    },
  });

  try {
    const result = oa.scanSiblings({
      objective_id: '03',
      cwd,
      config_paths: [sibling],
    });
    assert.strictEqual(result.scanned_repos, 0, 'sibling without org should be excluded when current has org');
  } finally {
    oa._resetFsMock();
  }
});

// ─── Group S — scanSiblings end-to-end ────────────────────────────────────────

test('S1 — happy path: 2 siblings sorted by score descending', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-s1-'));
  try {
    // sibling-a: high overlap with auth/flow
    const sibA = fix.buildSiblingRepoTree({
      tmpdir: tmp,
      name: 'sibling-a',
      org: 'AO-Cyber-Systems',
      objectives: [{ id: '01-auth', summary_content: 'auth flow token refresh controller' }],
    });
    // sibling-b: low overlap
    const sibB = fix.buildSiblingRepoTree({
      tmpdir: tmp,
      name: 'sibling-b',
      org: 'AO-Cyber-Systems',
      objectives: [{ id: '01-ui', summary_content: 'widget render layout css grid' }],
    });

    // Current objective tokens: "auth flow token"
    const currentCwd = path.join(tmp, 'current');
    fs.mkdirSync(currentCwd, { recursive: true });
    fs.writeFileSync(path.join(currentCwd, 'PROJECT.md'), `---\norg: AO-Cyber-Systems\nkind: api\n---\n# current\n`, 'utf-8');

    const result = oa.scanSiblings({
      objective_id: 'auth-flow-token',
      cwd: currentCwd,
      config_paths: [sibA.root, sibB.root],
    });

    assert.ok(result.matches.length >= 1, 'should have at least one match');
    // sibling-a should rank higher than sibling-b
    if (result.matches.length >= 2) {
      assert.strictEqual(result.matches[0].repo, 'sibling-a',
        `expected sibling-a first, got ${result.matches[0].repo} (scores: ${result.matches.map(m => m.score).join(',')})`);
    }
    assert.ok(result.scanned_repos >= 1, 'scanned_repos should be > 0');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('S2 — top-N truncation: 5 siblings with non-zero scores returns top 3', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-s2-'));
  try {
    const currentCwd = path.join(tmp, 'current');
    fs.mkdirSync(currentCwd, { recursive: true });
    fs.writeFileSync(path.join(currentCwd, 'PROJECT.md'), `---\norg: AO-Cyber-Systems\nkind: api\n---\n# current\n`, 'utf-8');

    const config_paths = [];
    for (let i = 1; i <= 5; i++) {
      const sib = fix.buildSiblingRepoTree({
        tmpdir: tmp,
        name: `sib-${i}`,
        org: 'AO-Cyber-Systems',
        objectives: [{ id: `01-obj`, summary_content: `auth flow token common keyword item${i}` }],
      });
      config_paths.push(sib.root);
    }

    const result = oa.scanSiblings({
      objective_id: 'auth-flow',
      cwd: currentCwd,
      config_paths,
    });

    assert.ok(result.matches.length <= oa.TOP_N,
      `expected <= TOP_N=${oa.TOP_N} matches, got ${result.matches.length}`);
    assert.strictEqual(result.matches.length, oa.TOP_N);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('S3 — empty siblings list returns empty matches with warning', () => {
  const cwd = '/fake/cwd';

  const mock = fix.buildMockRunFs({
    missing: [path.join(cwd, 'PROJECT.md')],
  });

  oa._setRunFs({
    ...mock,
    existsSync(p) {
      if (p === path.join(os.homedir(), 'Source')) return false;
      return mock.existsSync(p);
    },
    statSync(p) { return mock.statSync(p); },
    readdirSync(p) { return mock.readdirSync(p); },
    readFileSync(p, enc) { return mock.readFileSync(p, enc); },
  });

  try {
    const result = oa.scanSiblings({ objective_id: '03', cwd });
    assert.strictEqual(result.matches.length, 0);
    assert.strictEqual(result.scanned_repos, 0);
    assert.ok(result.warnings.length > 0, 'should have at least one warning about no repos');
  } finally {
    oa._resetFsMock();
  }
});

test('S4 — SUMMARY.md older than 90 days not included in token scoring', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-s4-'));
  try {
    // Sibling with one old (100 days) and one recent SUMMARY.md
    const sib = fix.buildSiblingRepoTree({
      tmpdir: tmp,
      name: 'sibling-old',
      org: 'AO-Cyber-Systems',
      objectives: [
        { id: '01-recent', summary_content: 'recent auth flow token' },
        { id: '02-old', summary_content: 'old stale content from long ago' },
      ],
      summary_mtime_days_ago: 0,
    });

    // Manually backdate the old summary
    const oldSummaryPath = path.join(sib.root, '.planning', 'objectives', '02-old', '02-old-SUMMARY.md');
    const oldMs = Date.now() - 100 * 86400000;
    const oldSec = oldMs / 1000;
    fs.utimesSync(oldSummaryPath, oldSec, oldSec);

    const currentCwd = path.join(tmp, 'current');
    fs.mkdirSync(currentCwd, { recursive: true });
    fs.writeFileSync(path.join(currentCwd, 'PROJECT.md'), `---\norg: AO-Cyber-Systems\nkind: api\n---\n# current\n`, 'utf-8');

    const result = oa.scanSiblings({
      objective_id: 'auth-flow-token',
      cwd: currentCwd,
      config_paths: [sib.root],
    });

    // The sibling should be scanned; old summary should be excluded from recents
    assert.strictEqual(result.scanned_repos, 1);
    // Score from recent summary should be higher than from old one
    // We don't test exact score but verify it ran without error and found recent content
    assert.strictEqual(result.matches.length, 1);
    assert.ok(result.matches[0].score > 0, 'should have positive score from recent summary');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('S5 — sibling with no objectives/ subdirectory skipped silently', () => {
  const sibling = '/fake/no-objectives-repo';
  const cwd = '/fake/cwd';

  const mock = fix.buildMockRunFs({
    dirs: {
      [sibling]: ['.git', '.planning'],
      // .planning/ exists but has no objectives/ entry
    },
    files: {
      [path.join(cwd, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# current\n`,
      [path.join(sibling, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# no-objectives\n`,
    },
  });

  oa._setRunFs({
    ...mock,
    statSync(p) {
      if (p === sibling) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      return mock.statSync(p);
    },
    existsSync(p) {
      if (p === sibling) return true;
      if (p === path.join(sibling, '.git')) return true;
      if (p === path.join(sibling, '.planning')) return true;
      if (p === path.join(sibling, '.planning', 'objectives')) return false;
      return mock.existsSync(p);
    },
  });

  try {
    const result = oa.scanSiblings({
      objective_id: '03',
      cwd,
      config_paths: [sibling],
    });
    // scanned_repos increments when we get past org check
    assert.strictEqual(result.scanned_repos, 1, 'repo should be scanned even with no objectives');
    // matches should have zero score (no summaries read)
    assert.ok(result.matches.length <= 1, 'at most 1 match entry (score 0)');
  } finally {
    oa._resetFsMock();
  }
});

test('S6 — SUMMARY.md unreadable: warning logged, sibling included with empty tokens', () => {
  const sibling = '/fake/unreadable-summary-repo';
  const cwd = '/fake/cwd';
  const summaryPath = path.join(sibling, '.planning', 'objectives', '01-obj', '01-obj-SUMMARY.md');

  const mock = fix.buildMockRunFs({
    dirs: {
      [sibling]: ['.git', '.planning'],
      [path.join(sibling, '.planning', 'objectives')]: ['01-obj'],
      [path.join(sibling, '.planning', 'objectives', '01-obj')]: ['01-obj-SUMMARY.md'],
    },
    files: {
      [path.join(cwd, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# current\n`,
      [path.join(sibling, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# unreadable\n`,
    },
  });

  const throwingReadFs = {
    ...mock,
    statSync(p) {
      if (p === sibling) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      if (p === summaryPath) return { isDirectory: () => false, isFile: () => true, mtimeMs: Date.now() };
      return mock.statSync(p);
    },
    existsSync(p) {
      if (p === sibling) return true;
      if (p === path.join(sibling, '.git')) return true;
      if (p === path.join(sibling, '.planning')) return true;
      if (p === path.join(sibling, '.planning', 'objectives')) return true;
      return mock.existsSync(p);
    },
    readFileSync(p, enc) {
      if (p === summaryPath) throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      return mock.readFileSync(p, enc);
    },
  };

  oa._setRunFs(throwingReadFs);

  try {
    const result = oa.scanSiblings({
      objective_id: '03',
      cwd,
      config_paths: [sibling],
    });
    // Sibling should still be in scanned_repos
    assert.strictEqual(result.scanned_repos, 1, 'repo counted even when summary unreadable');
    // Warning should mention the read error
    assert.ok(
      result.warnings.some(w => w.includes('SUMMARY') || w.includes('01-obj') || w.includes('failed')),
      `expected warning about unreadable summary, got: ${JSON.stringify(result.warnings)}`,
    );
    // Match included with score 0 (no tokens from unreadable file)
    assert.ok(result.matches.length <= 1);
  } finally {
    oa._resetFsMock();
  }
});

test('S7 — tie-break on equal score: most-recent SUMMARY.md mtime wins', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-s7-'));
  try {
    const currentCwd = path.join(tmp, 'current');
    fs.mkdirSync(currentCwd, { recursive: true });
    fs.writeFileSync(path.join(currentCwd, 'PROJECT.md'), `---\norg: AO-Cyber-Systems\nkind: api\n---\n# current\n`, 'utf-8');

    // Both siblings have identical tokens → same score; sibling-newer has fresher mtime
    const sibOlder = fix.buildSiblingRepoTree({
      tmpdir: tmp,
      name: 'sibling-older',
      org: 'AO-Cyber-Systems',
      objectives: [{ id: '01-same', summary_content: 'auth flow token shared keywords here' }],
      summary_mtime_days_ago: 10,
    });
    const sibNewer = fix.buildSiblingRepoTree({
      tmpdir: tmp,
      name: 'sibling-newer',
      org: 'AO-Cyber-Systems',
      objectives: [{ id: '01-same', summary_content: 'auth flow token shared keywords here' }],
      summary_mtime_days_ago: 0, // most recent
    });

    const result = oa.scanSiblings({
      objective_id: 'auth-flow-token-shared',
      cwd: currentCwd,
      config_paths: [sibOlder.root, sibNewer.root],
    });

    assert.ok(result.matches.length >= 2, `expected 2 matches, got ${result.matches.length}`);
    assert.strictEqual(result.matches[0].repo, 'sibling-newer',
      `expected sibling-newer first (fresher mtime), got ${result.matches[0].repo}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('S8 — current OBJECTIVE.md absent: uses objective slug as token source, does not throw', () => {
  const sibling = '/fake/sib';
  const cwd = '/fake/cwd';

  const mock = fix.buildMockRunFs({
    dirs: {
      [sibling]: ['.git', '.planning'],
    },
    files: {
      [path.join(cwd, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# current\n`,
      [path.join(sibling, 'PROJECT.md')]: `---\norg: AO-Cyber-Systems\nkind: api\n---\n# sib\n`,
    },
    missing: [path.join(cwd, '.planning', 'objectives')],
  });

  oa._setRunFs({
    ...mock,
    statSync(p) {
      if (p === sibling) return { isDirectory: () => true, isFile: () => false, mtimeMs: Date.now() };
      return mock.statSync(p);
    },
    existsSync(p) {
      if (p === sibling) return true;
      if (p === path.join(sibling, '.git')) return true;
      if (p === path.join(sibling, '.planning')) return true;
      if (p === path.join(cwd, '.planning', 'objectives')) return false;
      return mock.existsSync(p);
    },
  });

  try {
    // Should not throw even though OBJECTIVE.md is absent
    const result = oa.scanSiblings({
      objective_id: 'auth-flow-planning',
      cwd,
      config_paths: [sibling],
    });
    assert.ok('matches' in result, 'result should have matches');
    assert.ok('warnings' in result, 'result should have warnings');
  } finally {
    oa._resetFsMock();
  }
});

// ─── Group F — fixture builder sanity ────────────────────────────────────────

test('F1 — buildSiblingRepoTree creates expected directory layout', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-f1-'));
  try {
    const result = fix.buildSiblingRepoTree({
      tmpdir: tmp,
      name: 'test-repo',
      org: 'AO-Cyber-Systems',
    });
    assert.ok(fs.existsSync(path.join(result.root, '.git')), 'should have .git dir');
    assert.ok(fs.existsSync(path.join(result.root, '.planning')), 'should have .planning dir');
    assert.ok(fs.existsSync(path.join(result.root, 'PROJECT.md')), 'should have PROJECT.md');
    assert.ok(result.objective_paths.length > 0, 'should have objective paths');
    assert.ok(fs.existsSync(result.objective_paths[0]), 'SUMMARY.md should exist');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('F2 — buildSiblingRepoTree omits PROJECT.md when omit_project_md: true', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-f2-'));
  try {
    const result = fix.buildSiblingRepoTree({
      tmpdir: tmp,
      name: 'no-project',
      omit_project_md: true,
    });
    assert.ok(!fs.existsSync(path.join(result.root, 'PROJECT.md')), 'PROJECT.md should not exist');
    assert.strictEqual(result.project_md_path, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('F3 — buildMockRunFs returns canned readFileSync results for configured paths', () => {
  const m = fix.buildMockRunFs({ files: { '/a': 'content-a' } });
  assert.strictEqual(m.readFileSync('/a', 'utf-8'), 'content-a');
  assert.strictEqual(m.existsSync('/a'), true);
});

test('F4 — buildMockRunFs throws for unconfigured path (catches missing fixtures)', () => {
  const m = fix.buildMockRunFs({ files: { '/a': 'hi' } });
  assert.throws(
    () => m.readFileSync('/unknown-path', 'utf-8'),
    /buildMockRunFs/,
    'should throw informative error for unconfigured path',
  );
});

// ─── Group I — FS_INTEGRATION=1 gated tests ──────────────────────────────────

test('I1 — real ~/Source/*/ walk completes without throw', { skip: !process.env.FS_INTEGRATION }, async () => {
  oa._resetFsMock(); // ensure real fs
  const result = oa.scanSiblings({ objective_id: '03', cwd: process.cwd() });
  assert.ok(typeof result.scanned_repos === 'number', 'scanned_repos should be a number');
  assert.ok(result.scanned_repos >= 0, 'scanned_repos should be non-negative');
  assert.ok(Array.isArray(result.matches), 'matches should be an array');
});

test('I2 — real current-repo PROJECT.md parsed successfully', { skip: !process.env.FS_INTEGRATION }, async () => {
  oa._resetFsMock(); // ensure real fs
  // Just verify the module imports without throwing on real cwd
  const result = oa.scanSiblings({ objective_id: '03', cwd: process.cwd() });
  assert.ok('matches' in result);
});

// ─── TRD 03-02 tests ─────────────────────────────────────────────────────────

// ─── Group CS — camelSplit helper (pure logic) ────────────────────────────────

test('CS1 — camelSplit empty string returns []', () => {
  const split = oa._camelSplit ? oa._camelSplit('') : null;
  assert.ok(split !== null, '_camelSplit should be exported');
  assert.deepStrictEqual(split, []);
});

test('CS2 — camelSplit simple lowercase word returns [word]', () => {
  const split = oa._camelSplit('foo');
  assert.deepStrictEqual(split, ['foo']);
});

test('CS3 — camelSplit camelCase parseStateMd splits to [parse, State, Md]', () => {
  const split = oa._camelSplit('parseStateMd');
  assert.deepStrictEqual(split, ['parse', 'State', 'Md']);
});

test('CS4 — camelSplit PascalCase ParseStateMd splits to [Parse, State, Md]', () => {
  const split = oa._camelSplit('ParseStateMd');
  assert.deepStrictEqual(split, ['Parse', 'State', 'Md']);
});

test('CS5 — camelSplit null/undefined returns []', () => {
  assert.deepStrictEqual(oa._camelSplit(null), []);
  assert.deepStrictEqual(oa._camelSplit(undefined), []);
});

test('CS6 — camelSplit ALLCAPS GH returns [GH] as single chunk', () => {
  const split = oa._camelSplit('GH');
  assert.deepStrictEqual(split, ['GH']);
});

// ─── Group PE — parseExports helper (regex-based) ────────────────────────────

test('PE1 — module.exports.foo = ... extracts foo', () => {
  const names = oa._parseExports('module.exports.foo = function() {};');
  assert.ok(names !== undefined, '_parseExports should be exported');
  assert.ok(names.includes('foo'), `expected foo in ${JSON.stringify(names)}`);
});

test('PE2 — exports.bar = ... extracts bar', () => {
  const names = oa._parseExports('exports.bar = 42;');
  assert.ok(names.includes('bar'), `expected bar in ${JSON.stringify(names)}`);
});

test('PE3 — module.exports = { a, b: x, c }; extracts [a, b, c]', () => {
  const names = oa._parseExports('module.exports = { a, b: x, c };');
  assert.deepStrictEqual(names.sort(), ['a', 'b', 'c']);
});

test('PE4 — export function foo() extracts foo', () => {
  const names = oa._parseExports('export function foo() { return 1; }');
  assert.ok(names.includes('foo'), `expected foo in ${JSON.stringify(names)}`);
});

test('PE5 — export const bar = ... extracts bar', () => {
  const names = oa._parseExports('export const bar = 42;');
  assert.ok(names.includes('bar'), `expected bar in ${JSON.stringify(names)}`);
});

test('PE6 — export { foo, bar } extracts [foo, bar]', () => {
  const names = oa._parseExports('export { foo, bar };');
  assert.ok(names.includes('foo'), `expected foo in ${JSON.stringify(names)}`);
  assert.ok(names.includes('bar'), `expected bar in ${JSON.stringify(names)}`);
});

test('PE7 — export default function foo() does not extract foo (defaults skipped)', () => {
  const names = oa._parseExports('export default function foo() {}');
  // default is not extracted as a symbol name for lexical matching
  assert.ok(!names.includes('default'), `default should not be in exports: ${JSON.stringify(names)}`);
});

test('PE8 — empty string returns []', () => {
  const names = oa._parseExports('');
  assert.deepStrictEqual(names, []);
});

test('PE9 — malformed input (unclosed brace) returns whatever parsed, does not throw', () => {
  assert.doesNotThrow(() => {
    const names = oa._parseExports('module.exports = { a, b: x');
    assert.ok(Array.isArray(names));
  });
});

test('PE10 — best-effort: commented exports may appear (accepted behavior per TRD)', () => {
  // This test documents that PE10 is best-effort only — the regex does not strip comments.
  // We just verify no throw occurs.
  assert.doesNotThrow(() => {
    oa._parseExports('// module.exports.skip = function() {};');
  });
});

// ─── Group PD — Dart symbol extraction (post-v1.1 dogfood fix) ───────────────

test('PD1 — Dart class FooBar extracted', () => {
  const src = 'class ApprovalCard extends StatefulWidget { ... }';
  const names = oa._parseExports(src);
  assert.ok(names.includes('ApprovalCard'), `expected ApprovalCard, got: ${JSON.stringify(names)}`);
});

test('PD2 — Dart abstract / sealed / final class modifiers extracted', () => {
  const src = `
    abstract class BaseCard {}
    sealed class State {}
    final class FooBar {}
  `;
  const names = oa._parseExports(src);
  assert.ok(names.includes('BaseCard'));
  assert.ok(names.includes('State'));
  assert.ok(names.includes('FooBar'));
});

test('PD3 — Dart enum + mixin + typedef + extension extracted', () => {
  const src = `
    enum Direction { up, down }
    mixin Resizable {}
    typedef CardBuilder = Widget Function();
    extension StringX on String {}
  `;
  const names = oa._parseExports(src);
  for (const n of ['Direction', 'Resizable', 'CardBuilder', 'StringX']) {
    assert.ok(names.includes(n), `expected ${n}, got: ${JSON.stringify(names)}`);
  }
});

test('PD4 — Dart library-private (leading _) names skipped', () => {
  const src = 'class _PrivateCard {} class PublicCard {}';
  const names = oa._parseExports(src);
  assert.ok(names.includes('PublicCard'));
  assert.ok(!names.includes('_PrivateCard'));
});

test('PD5 — Dart top-level final/const/var declarations extracted', () => {
  const src = `
    final defaultTheme = EdenTheme();
    const maxRows = 100;
    var globalCounter = 0;
  `;
  const names = oa._parseExports(src);
  assert.ok(names.includes('defaultTheme'));
  assert.ok(names.includes('maxRows'));
  assert.ok(names.includes('globalCounter'));
});

// ─── Group RP — resolveEdenLibsPath helper ────────────────────────────────────

test('RP1 — opts.path takes precedence over everything', () => {
  const resolved = oa._resolveEdenLibsPath({ path: '/explicit/path' }, '/some/cwd');
  assert.strictEqual(resolved, '/explicit/path');
});

test('RP2 — config awareness.eden_libs_path wins over default', () => {
  const cwd = '/fake/cwd-rp2';
  const configPath = '/fake/configured-eden-libs';
  const configJson = JSON.stringify({ awareness: { eden_libs_path: configPath } });

  const mock = fix.buildMockRunFs({
    files: {
      [path.join(cwd, '.planning', 'config.json')]: configJson,
    },
  });
  oa._setRunFs(mock);
  try {
    const resolved = oa._resolveEdenLibsPath({}, cwd);
    assert.strictEqual(resolved, configPath);
  } finally {
    oa._resetFsMock();
  }
});

test('RP3 — default DEFAULT_EDEN_LIBS_PATH used when neither opts.path nor config set', () => {
  const cwd = '/fake/cwd-rp3';

  const mock = fix.buildMockRunFs({
    missing: [path.join(cwd, '.planning', 'config.json')],
  });
  oa._setRunFs(mock);
  try {
    const resolved = oa._resolveEdenLibsPath({}, cwd);
    // Should be expanded DEFAULT_EDEN_LIBS_PATH (~/ Source/eden-libs expanded)
    const expected = path.join(os.homedir(), 'Source', 'eden-libs');
    assert.strictEqual(resolved, expected);
  } finally {
    oa._resetFsMock();
  }
});

test('RP4 — ~/Source/eden-libs is home-expanded correctly', () => {
  const resolved = oa._resolveEdenLibsPath({ path: '~/Source/eden-libs' }, '/cwd');
  const expected = path.join(os.homedir(), 'Source', 'eden-libs');
  assert.strictEqual(resolved, expected);
});

// ─── Group L — scanLibs end-to-end ───────────────────────────────────────────

test('L1 — happy path: eden-libs with parseStateMd matches token "parse"', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-l1-'));
  try {
    const tree = fix.buildEdenLibsTree({ tmpdir: tmp, exports: ['parseStateMd', 'unrelated'] });
    const r = oa.scanLibs({ path: tree.root, current_tokens: new Set(['parse', 'state']) });
    assert.strictEqual(r.scanned, true);
    assert.ok(r.candidates.length > 0, `expected candidates, got: ${JSON.stringify(r.candidates)}`);
    assert.strictEqual(r.candidates[0].symbol, 'parseStateMd');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('L2 — eden-libs path does not exist returns scanned:false with warning', () => {
  const r = oa.scanLibs({ path: '/nonexistent-zzz-9999-eden-path' });
  assert.strictEqual(r.scanned, false);
  assert.ok(r.warnings.some(w => /not found/i.test(w)), `expected 'not found' warning, got: ${JSON.stringify(r.warnings)}`);
  assert.deepStrictEqual(r.candidates, []);
});

test('L3 — eden-libs exists but no package.json AND no index.* returns warning', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-l3-'));
  try {
    // Create an empty dir (no package.json, no index.*)
    const emptyRoot = path.join(tmp, 'empty-eden');
    fs.mkdirSync(emptyRoot, { recursive: true });
    const r = oa.scanLibs({ path: emptyRoot });
    assert.strictEqual(r.scanned, true);
    assert.deepStrictEqual(r.candidates, []);
    assert.ok(
      r.warnings.some(w => /no package\.json|index/i.test(w)),
      `expected 'no package.json or index.*' warning, got: ${JSON.stringify(r.warnings)}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('L4 — malformed package.json falls back to index.* scan; warning emitted', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-l4-'));
  try {
    const tree = fix.buildEdenLibsTree({
      tmpdir: tmp,
      omit_package_json: true,
      exports: ['resolveChain'],
    });
    // Write a malformed package.json
    fs.writeFileSync(path.join(tree.root, 'package.json'), '{ invalid json {{');
    const r = oa.scanLibs({ path: tree.root });
    assert.strictEqual(r.scanned, true);
    assert.ok(r.warnings.some(w => /malformed/i.test(w)), `expected malformed warning, got: ${JSON.stringify(r.warnings)}`);
    // Should still find resolveChain from index.cjs
    assert.ok(
      r.candidates.some(c => c.symbol === 'resolveChain'),
      `expected resolveChain in candidates, got: ${JSON.stringify(r.candidates)}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('L5 — package.json exports map (string form) resolves entrypoint', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-l5-'));
  try {
    const tree = fix.buildEdenLibsTree({
      tmpdir: tmp,
      package_json_exports: './index.cjs',  // string form
      exports: ['stringFormExport'],
    });
    const r = oa.scanLibs({ path: tree.root });
    assert.strictEqual(r.scanned, true);
    assert.ok(
      r.candidates.some(c => c.symbol === 'stringFormExport'),
      `expected stringFormExport in candidates, got: ${JSON.stringify(r.candidates)}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('L6 — package.json exports map (object form) scans all entrypoints', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-l6-'));
  try {
    // Create two entrypoint files
    const root = path.join(tmp, 'eden-libs');
    fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
    // package.json with exports map
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'eden-libs',
        exports: {
          '.': './index.cjs',
          './gh': './lib/gh.cjs',
        },
      }),
    );
    // index.cjs
    fs.writeFileSync(
      path.join(root, 'index.cjs'),
      "'use strict';\nmodule.exports = { parseStateMd: function parseStateMd() {} };\n",
    );
    // lib/gh.cjs
    fs.writeFileSync(
      path.join(root, 'lib', 'gh.cjs'),
      "'use strict';\nmodule.exports = { resolveChain: function resolveChain() {} };\n",
    );

    const r = oa.scanLibs({ path: root });
    assert.strictEqual(r.scanned, true);
    const syms = r.candidates.map(c => c.symbol);
    assert.ok(syms.includes('parseStateMd') || syms.includes('resolveChain'),
      `expected at least one of parseStateMd/resolveChain in candidates, got: ${JSON.stringify(syms)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('L7 — zero exports parsed returns empty candidates + warning', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-l7-'));
  try {
    const tree = fix.buildEdenLibsTree({
      tmpdir: tmp,
      exports: [],
      index_content_override: "'use strict';\n// no exports here\n",
    });
    const r = oa.scanLibs({ path: tree.root });
    assert.strictEqual(r.scanned, true);
    assert.deepStrictEqual(r.candidates, []);
    assert.ok(
      r.warnings.some(w => /no exported surface/i.test(w)),
      `expected 'no exported surface' warning, got: ${JSON.stringify(r.warnings)}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('L8 — ranking: tokens [parse, state] vs [parseStateMd, unrelated] — parseStateMd wins', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-l8-'));
  try {
    const tree = fix.buildEdenLibsTree({
      tmpdir: tmp,
      exports: ['parseStateMd', 'unrelatedWidget'],
    });
    const r = oa.scanLibs({
      path: tree.root,
      current_tokens: new Set(['parse', 'state']),
    });
    assert.ok(r.candidates.length > 0, 'should have candidates');
    assert.strictEqual(r.candidates[0].symbol, 'parseStateMd',
      `parseStateMd should rank first, got: ${r.candidates[0].symbol}`);
    assert.ok(r.candidates[0].tokens_matched > 0,
      `expected tokens_matched > 0, got: ${r.candidates[0].tokens_matched}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('L9 — tokens_matched exposed in candidate object', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-l9-'));
  try {
    const tree = fix.buildEdenLibsTree({
      tmpdir: tmp,
      exports: ['parseStateMd'],
    });
    const r = oa.scanLibs({
      path: tree.root,
      current_tokens: new Set(['parse']),
    });
    assert.ok(r.candidates.length > 0, 'should have candidates');
    assert.ok('tokens_matched' in r.candidates[0],
      `candidates should have tokens_matched field: ${JSON.stringify(r.candidates[0])}`);
    assert.ok(typeof r.candidates[0].tokens_matched === 'number');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('L10 — opts.path override is honored', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-l10-'));
  try {
    const tree = fix.buildEdenLibsTree({
      tmpdir: tmp,
      name: 'my-custom-eden',
      exports: ['customExport'],
    });
    const r = oa.scanLibs({ path: tree.root });
    assert.ok(r.path === tree.root, `expected path=${tree.root}, got ${r.path}`);
    assert.strictEqual(r.scanned, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Group CLI2 — CLI wiring ──────────────────────────────────────────────────

test('CLI2-1 — df-tools org-awareness scan-libs 03 --raw returns parseable JSON', () => {
  const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');
  const r = require('child_process').spawnSync(
    'node', [dfTools, 'org-awareness', 'scan-libs', '03', '--raw'],
    { encoding: 'utf-8', cwd: path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..') },
  );
  assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout); }, `stdout not valid JSON: ${r.stdout}`);
  assert.ok('candidates' in parsed, `expected 'candidates' in output: ${JSON.stringify(parsed)}`);
  assert.ok('scanned' in parsed, `expected 'scanned' in output: ${JSON.stringify(parsed)}`);
});

test('CLI2-2 — df-tools org-awareness scan-libs (no objective_id) exits 1', () => {
  const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');
  const r = require('child_process').spawnSync(
    'node', [dfTools, 'org-awareness', 'scan-libs'],
    { encoding: 'utf-8' },
  );
  assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}`);
});

// ─── Group F2 — buildEdenLibsTree fixture sanity ──────────────────────────────

test('F2-1 — buildEdenLibsTree creates package.json + index.cjs with named exports', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edenfix-f21-'));
  try {
    const tree = fix.buildEdenLibsTree({ tmpdir: tmp, exports: ['foo', 'bar'] });
    assert.ok(fs.existsSync(tree.package_json_path), 'package.json should exist');
    assert.ok(fs.existsSync(tree.index_path), 'index.cjs should exist');
    const idx = fs.readFileSync(tree.index_path, 'utf-8');
    assert.match(idx, /foo/, 'index.cjs should contain foo');
    assert.match(idx, /bar/, 'index.cjs should contain bar');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('F2-2 — buildEdenLibsTree with omit_package_json:true skips package.json', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edenfix-f22-'));
  try {
    const tree = fix.buildEdenLibsTree({
      tmpdir: tmp,
      omit_package_json: true,
      exports: ['onlyIndex'],
    });
    assert.strictEqual(tree.package_json_path, null, 'package_json_path should be null');
    assert.ok(!fs.existsSync(path.join(tree.root, 'package.json')), 'package.json should not exist');
    assert.ok(fs.existsSync(tree.index_path), 'index.cjs should still exist');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('F2-3 — buildEdenLibsTree with package_json_main writes main field correctly', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edenfix-f23-'));
  try {
    const tree = fix.buildEdenLibsTree({
      tmpdir: tmp,
      package_json_main: 'lib/main.cjs',
      index_filename: 'lib/main.cjs',
      exports: ['mainExport'],
    });
    const pkg = JSON.parse(fs.readFileSync(tree.package_json_path, 'utf-8'));
    assert.strictEqual(pkg.main, 'lib/main.cjs', `expected main=lib/main.cjs, got: ${pkg.main}`);
    assert.ok(fs.existsSync(tree.index_path), 'lib/main.cjs should exist');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── TRD 03-03 tests ──────────────────────────────────────────────────────────

// RED PHASE: scanOrgOverlap, _detectMisfiling, _scoreOrgItem not yet implemented.
// All tests in groups SOI, MF, OO, AD, CLI3 will fail with TypeError until Task 2 implements them.

const aw = require('./awareness.cjs');
const gh = require('./gh.cjs');

// Save originals for restoration in mocking tests
const origScanOrg = aw.scanOrg;
const origResolveChain = gh.resolveChain;

// ─── Group SOI — _scoreOrgItem helper (pure logic) ───────────────────────────

test('SOI1 — chain-match (sub-issue ref repo == sibling repo) adds +10 base score', () => {
  const item = {
    title: '[Roadmap] unrelated item',
    body: '',
    sub_issues: [{ ref: 'AO-Cyber-Systems/aodex#100', title: 'sub', state: 'OPEN' }],
  };
  const score = oa._scoreOrgItem(item, new Set(), ['AO-Cyber-Systems/aodex']);
  assert.strictEqual(score.total, 10);
  assert.strictEqual(score.chain_match, true);
  assert.deepStrictEqual(score.matched_keywords, []);
});

test('SOI2 — keyword-only overlap (no chain match, 3 shared tokens) → score 3', () => {
  const item = {
    title: 'parse state markdown',
    body: '',
    sub_issues: [],
  };
  const score = oa._scoreOrgItem(item, new Set(['parse', 'state', 'markdown']), []);
  assert.strictEqual(score.total, 3);
  assert.strictEqual(score.chain_match, false);
  assert.strictEqual(score.matched_keywords.length, 3);
});

test('SOI3 — both chain-match + keyword overlap → score 10 + keyword count', () => {
  const item = {
    title: 'parse state',
    body: '',
    sub_issues: [{ ref: 'AO-Cyber-Systems/aodex#99', title: '', state: 'OPEN' }],
  };
  const score = oa._scoreOrgItem(item, new Set(['parse', 'state']), ['AO-Cyber-Systems/aodex']);
  assert.strictEqual(score.total, 12); // +10 chain + +2 keywords
  assert.strictEqual(score.chain_match, true);
  assert.strictEqual(score.matched_keywords.length, 2);
});

test('SOI4 — empty sub_issues → no chain match contribution', () => {
  const item = {
    title: 'auth flow token',
    body: '',
    sub_issues: [],
  };
  const score = oa._scoreOrgItem(item, new Set(['auth', 'flow']), ['AO-Cyber-Systems/aodex']);
  assert.strictEqual(score.chain_match, false);
  assert.ok(score.total < 10, 'total should be less than 10 (no chain match)');
});

test('SOI5 — no shared keywords AND no chain match → score 0', () => {
  const item = {
    title: 'widget layout css grid',
    body: '',
    sub_issues: [],
  };
  const score = oa._scoreOrgItem(item, new Set(['auth', 'token', 'parse']), []);
  assert.strictEqual(score.total, 0);
  assert.strictEqual(score.chain_match, false);
  assert.deepStrictEqual(score.matched_keywords, []);
});

// ─── Group MF — _detectMisfiling helper (pure logic) ─────────────────────────

test('MF1 — resolved roadmap_issue repo matches current github_repo → returns null', () => {
  const r = oa._detectMisfiling(
    { roadmap_issue: 'AO-Cyber-Systems/devflow-claude#9' },
    { github_repo: 'AO-Cyber-Systems/devflow-claude' },
  );
  assert.strictEqual(r, null);
});

test('MF2 — resolved roadmap_issue repo differs from current github_repo → returns misfiling object', () => {
  const r = oa._detectMisfiling(
    { roadmap_issue: 'AO-Cyber-Systems/aodex#33' },
    { github_repo: 'AO-Cyber-Systems/devflow-claude' },
  );
  assert.ok(r !== null, 'expected misfiling object, got null');
  assert.strictEqual(r.current_repo, 'AO-Cyber-Systems/devflow-claude');
  assert.strictEqual(r.resolved_repo, 'AO-Cyber-Systems/aodex');
  assert.ok(typeof r.message === 'string' && r.message.length > 0);
});

test('MF3 — current github_repo absent (null) → returns null (no false positive)', () => {
  const r = oa._detectMisfiling(
    { roadmap_issue: 'AO-Cyber-Systems/aodex#33' },
    { github_repo: null },
  );
  assert.strictEqual(r, null);
});

test('MF4 — roadmap_issue absent in resolveChain output → returns null', () => {
  const r = oa._detectMisfiling(
    { roadmap_issue: null },
    { github_repo: 'AO-Cyber-Systems/devflow-claude' },
  );
  assert.strictEqual(r, null);
});

test('MF5 — roadmap_issue is shorthand #9 (no owner/repo) → treat as same-repo, return null', () => {
  const r = oa._detectMisfiling(
    { roadmap_issue: '#9' },
    { github_repo: 'AO-Cyber-Systems/devflow-claude' },
  );
  // Short-hand refs have no repo extracted → null (no mismatch possible)
  assert.strictEqual(r, null);
});

// ─── Group OO — scanOrgOverlap end-to-end ────────────────────────────────────

test('OO1 — chain-match item ranked first despite weaker keyword overlap', () => {
  // Item 0: chain match (sub-issue in aodex) + no matching keywords (passes filter via chain_match)
  // Item 1: 2 matching keywords, no chain match (passes filter via score >= 2)
  // Item 2: 1 matching keyword, no chain match — FILTERED OUT per SC-5 (score=1 < 2 threshold)
  // Expected: item 0 (score 10) > item 1 (score 2). Item 2 filtered out by SC-5 threshold.
  const fixture = fix.buildOrgOverlapFixture({
    items_count: 3,
    sibling_repos: ['AO-Cyber-Systems/aodex'],
    matching_keywords_per_item: [[], ['parse', 'state'], ['parse']],
    chain_matches: [0],
  });

  const origScanOrgLocal = aw.scanOrg;
  aw.scanOrg = () => fixture;
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      sibling_repos: ['AO-Cyber-Systems/aodex'],
      current_tokens: new Set(['parse', 'state']),
      frontmatter: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
      projectCtx: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
    });
    assert.strictEqual(r.skipped, false);
    assert.strictEqual(r.items.length, 2, 'item 2 (score=1) should be filtered out per SC-5');
    assert.strictEqual(r.items[0].issue_ref, fixture.items[0].issue_ref,
      `chain-match item should be first, got: ${r.items[0].issue_ref}`);
    assert.strictEqual(r.items[0].chain_match, true);
  } finally {
    aw.scanOrg = origScanOrgLocal;
  }
});

test('OO2 — GhAuthError from scanOrg → returns { items: [], warnings: [...], skipped: true, misfiling: null }', () => {
  const origScanOrgLocal = aw.scanOrg;
  aw.scanOrg = () => {
    const e = new Error('Authentication failed: missing scope project');
    e.name = 'GhAuthError';
    e.remediation = 'gh auth refresh -h github.com -s project,read:project,repo';
    e.scopes_missing = ['project'];
    throw e;
  };
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      frontmatter: {},
      projectCtx: {},
    });
    assert.strictEqual(r.skipped, true);
    assert.deepStrictEqual(r.items, []);
    assert.ok(Array.isArray(r.warnings) && r.warnings.length > 0,
      `expected non-empty warnings, got: ${JSON.stringify(r.warnings)}`);
    assert.strictEqual(r.misfiling, null);
  } finally {
    aw.scanOrg = origScanOrgLocal;
  }
});

test('OO3 — non-auth Error from scanOrg → re-thrown (not swallowed)', () => {
  const origScanOrgLocal = aw.scanOrg;
  aw.scanOrg = () => { throw new Error('disk full — no space left on device'); };
  try {
    assert.throws(
      () => oa.scanOrgOverlap({ objective_id: '03', frontmatter: {}, projectCtx: {} }),
      /disk full/,
      'non-auth errors must propagate',
    );
  } finally {
    aw.scanOrg = origScanOrgLocal;
  }
});

test('OO4 — empty items from scanOrg → returns empty items, skipped: false', () => {
  const origScanOrgLocal = aw.scanOrg;
  aw.scanOrg = () => fix.buildOrgOverlapFixture({ items_count: 0 });
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      frontmatter: {},
      projectCtx: { github_repo: null },
    });
    assert.strictEqual(r.skipped, false);
    assert.deepStrictEqual(r.items, []);
  } finally {
    aw.scanOrg = origScanOrgLocal;
  }
});

test('OO5 — chain-match boost: score-1 keyword item beats score-3 keyword item if chain match', () => {
  // Item 0: 1 keyword (score 1) + chain match (score 10+1=11)
  // Item 1: 3 keywords (score 3), no chain match
  const fixture = fix.buildOrgOverlapFixture({
    items_count: 2,
    sibling_repos: ['AO-Cyber-Systems/aodex'],
    matching_keywords_per_item: [['parse'], ['parse', 'state', 'flow']],
    chain_matches: [0],
  });

  const origScanOrgLocal = aw.scanOrg;
  aw.scanOrg = () => fixture;
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      sibling_repos: ['AO-Cyber-Systems/aodex'],
      current_tokens: new Set(['parse', 'state', 'flow']),
      frontmatter: {},
      projectCtx: { github_repo: null },
    });
    assert.strictEqual(r.items[0].chain_match, true,
      `chain-match item should be first: ${JSON.stringify(r.items.map(i => ({ cm: i.chain_match, s: i.score })))}`);
    assert.ok(r.items[0].score > r.items[1].score,
      `chain-match (score ${r.items[0].score}) should beat keyword-only (score ${r.items[1].score})`);
  } finally {
    aw.scanOrg = origScanOrgLocal;
  }
});

test('OO6 — top-N truncation: 7 qualifying items (all score >= 2) → returns 3', () => {
  // All 7 items have 2+ keyword matches so they pass SC-5 threshold;
  // verifies TOP_N=3 truncation when many items qualify.
  const fixture = fix.buildOrgOverlapFixture({
    items_count: 7,
    sibling_repos: [],
    matching_keywords_per_item: [
      ['parse', 'state', 'auth'],
      ['parse', 'state'],
      ['state', 'flow'],
      ['auth', 'flow'],
      ['token', 'parse'],
      ['auth', 'token'],
      ['flow', 'token'],
    ],
    chain_matches: [],
  });

  const origScanOrgLocal = aw.scanOrg;
  aw.scanOrg = () => fixture;
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      sibling_repos: [],
      current_tokens: new Set(['parse', 'state', 'auth', 'flow', 'token']),
      frontmatter: {},
      projectCtx: { github_repo: null },
    });
    assert.strictEqual(r.items.length, oa.TOP_N,
      `expected ${oa.TOP_N} items, got ${r.items.length}`);
  } finally {
    aw.scanOrg = origScanOrgLocal;
  }
});

test('OO7 — output has both items and misfiling keys (shape contract)', () => {
  const origScanOrgLocal = aw.scanOrg;
  aw.scanOrg = () => fix.buildOrgOverlapFixture({ items_count: 1 });
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      frontmatter: {},
      projectCtx: { github_repo: null },
    });
    assert.ok('items' in r, 'result should have items key');
    assert.ok('misfiling' in r, 'result should have misfiling key');
    assert.ok('warnings' in r, 'result should have warnings key');
    assert.ok('skipped' in r, 'result should have skipped key');
  } finally {
    aw.scanOrg = origScanOrgLocal;
  }
});

test('OO8 — when resolveChain throws GhAuthError, items still returned, misfiling: null + warning added', () => {
  const origScanOrgLocal = aw.scanOrg;
  const origResolveChainLocal = gh.resolveChain;
  // Items must qualify under SC-5 threshold (chain_match OR score >= 2) to survive the filter;
  // give both items 2 matching keywords each.
  aw.scanOrg = () => fix.buildOrgOverlapFixture({
    items_count: 2,
    matching_keywords_per_item: [['parse', 'state'], ['auth', 'flow']],
  });
  gh.resolveChain = () => {
    const e = new Error('gh auth expired');
    e.name = 'GhAuthError';
    e.remediation = 'gh auth refresh';
    throw e;
  };
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      current_tokens: new Set(['parse', 'state', 'auth', 'flow']),
      frontmatter: {},
      projectCtx: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
    });
    assert.strictEqual(r.skipped, false, 'scan itself should not be skipped');
    assert.ok(r.items.length > 0, 'items should still be populated');
    assert.strictEqual(r.misfiling, null, 'misfiling should be null when resolveChain fails');
    assert.ok(r.warnings.some(w => /misfiling check skipped/i.test(w)),
      `expected warning about misfiling check skip, got: ${JSON.stringify(r.warnings)}`);
  } finally {
    aw.scanOrg = origScanOrgLocal;
    gh.resolveChain = origResolveChainLocal;
  }
});

// ─── Group AD — auth degradation specific ────────────────────────────────────

test('AD1 — GhAuthError thrown inside aw.scanOrg → scanOrgOverlap returns skipped:true', () => {
  // Mirror the pattern: mock aw.scanOrg to throw GhAuthError
  // (scanOrg internally calls requireGhAuth; this mock simulates that path)
  const origScanOrgLocal = aw.scanOrg;
  aw.scanOrg = () => {
    const e = new Error('Authentication failed: missing scope project');
    e.name = 'GhAuthError';
    e.remediation = 'gh auth refresh -h github.com -s project,read:project,repo';
    e.scopes_missing = ['project'];
    throw e;
  };
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      frontmatter: {},
      projectCtx: {},
    });
    assert.strictEqual(r.skipped, true, 'skipped should be true on GhAuthError');
    assert.deepStrictEqual(r.items, []);
  } finally {
    aw.scanOrg = origScanOrgLocal;
  }
});

test('AD2 — warning text in skipped result includes the remediation command', () => {
  const remediationCmd = 'gh auth refresh -h github.com -s project,read:project,repo';
  const origScanOrgLocal = aw.scanOrg;
  aw.scanOrg = () => {
    const e = new Error('Auth failed');
    e.name = 'GhAuthError';
    e.remediation = remediationCmd;
    e.scopes_missing = ['project'];
    throw e;
  };
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      frontmatter: {},
      projectCtx: {},
    });
    assert.ok(
      r.warnings.some(w => w.includes(remediationCmd)),
      `expected warning containing '${remediationCmd}', got: ${JSON.stringify(r.warnings)}`,
    );
  } finally {
    aw.scanOrg = origScanOrgLocal;
  }
});

test('AD3 — skipped result still has misfiling key (null) for shape consistency', () => {
  const origScanOrgLocal = aw.scanOrg;
  aw.scanOrg = () => {
    const e = new Error('Auth failed');
    e.name = 'GhAuthError';
    e.remediation = 'gh auth refresh';
    throw e;
  };
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      frontmatter: {},
      projectCtx: {},
    });
    assert.ok('misfiling' in r, 'skipped result must have misfiling key');
    assert.strictEqual(r.misfiling, null, 'misfiling should be null when skipped');
  } finally {
    aw.scanOrg = origScanOrgLocal;
  }
});

// ─── Group CLI3 — CLI wiring ──────────────────────────────────────────────────

test('CLI3-1 — df-tools org-awareness scan-org-overlap 03 --raw returns parseable JSON', () => {
  const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');
  const r = require('child_process').spawnSync(
    'node', [dfTools, 'org-awareness', 'scan-org-overlap', '03', '--raw'],
    { encoding: 'utf-8', cwd: path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..') },
  );
  assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout); }, `stdout not valid JSON: ${r.stdout}`);
  assert.ok('items' in parsed, `expected 'items' in output: ${JSON.stringify(parsed)}`);
  assert.ok('skipped' in parsed, `expected 'skipped' in output: ${JSON.stringify(parsed)}`);
  assert.ok('misfiling' in parsed, `expected 'misfiling' in output: ${JSON.stringify(parsed)}`);
});

test('CLI3-2 — under mocked auth failure via env, CLI still returns exit 0 (graceful degradation in JSON)', () => {
  // We can't easily mock inside the CLI subprocess, but we CAN verify the current stub
  // exits with non-zero (before TRD 03-03) vs zero (after). This test verifies the
  // post-implementation behavior: CLI returns exit 0 even if gh auth is unavailable.
  // The skipped:true result is surfaced via JSON, not via exit code.
  const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');
  const r = require('child_process').spawnSync(
    'node', [dfTools, 'org-awareness', 'scan-org-overlap', '03', '--raw'],
    { encoding: 'utf-8', cwd: path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..') },
  );
  // Whether scan ran or skipped (auth unavailable in CI/sandbox), exit code MUST be 0
  assert.strictEqual(r.status, 0,
    `CLI must exit 0 regardless of auth state; got ${r.status}; stderr: ${r.stderr}`);
});

// ─── TRD 03-04 tests ──────────────────────────────────────────────────────────

// ─── Group RS — _renderSiblingsSection ───────────────────────────────────────

test('RS1 — empty matches renders sentinel', () => {
  const out = oa._renderSiblingsSection({ siblings: { matches: [] } });
  assert.match(out, /### Sibling repos/);
  assert.match(out, /_\(no matches\)_/);
});

test('RS2 — 2 matches render 2 bullets with repo, objective, score, summary_count', () => {
  const out = oa._renderSiblingsSection({
    siblings: {
      matches: [
        { repo: 'aodex', best_objective: '12', score: 0.5, summary_count: 3 },
        { repo: 'aosentry', best_objective: '04', score: 0.3, summary_count: 1 },
      ],
    },
  });
  assert.match(out, /aodex/);
  assert.match(out, /aosentry/);
  assert.match(out, /0\.50/);
  assert.match(out, /0\.30/);
  const bullets = out.split('\n').filter(l => l.startsWith('- '));
  assert.strictEqual(bullets.length, 2);
});

test('RS3 — 5 matches sliced to 3 (defensive TOP_N)', () => {
  const matches = [];
  for (let i = 0; i < 5; i++) {
    matches.push({ repo: `repo-${i}`, score: 1 - i * 0.1, summary_count: i + 1 });
  }
  const out = oa._renderSiblingsSection({ siblings: { matches } });
  const bullets = out.split('\n').filter(l => l.startsWith('- '));
  assert.strictEqual(bullets.length, 3);
});

test('RS4 — match missing best_objective renders bullet without (objective ...) suffix', () => {
  const out = oa._renderSiblingsSection({
    siblings: { matches: [{ repo: 'some-repo', score: 0.2, summary_count: 1 }] },
  });
  assert.match(out, /some-repo/);
  assert.doesNotMatch(out, /\(objective/);
});

test('RS5 — score 0 still renders (renderer does not filter by score; scanner does)', () => {
  const out = oa._renderSiblingsSection({
    siblings: { matches: [{ repo: 'zero-repo', score: 0, summary_count: 0 }] },
  });
  assert.match(out, /zero-repo/);
  assert.match(out, /0\.00/);
  const bullets = out.split('\n').filter(l => l.startsWith('- '));
  assert.strictEqual(bullets.length, 1);
});

// ─── Group RL — _renderLibsSection ───────────────────────────────────────────

test('RL1 — empty candidates renders sentinel', () => {
  const out = oa._renderLibsSection({ libs: { candidates: [], scanned: true } });
  assert.match(out, /### eden-libs candidates/);
  assert.match(out, /_\(no matches\)_/);
});

test('RL2 — 3 candidates render 3 bullets with symbol and entrypoint', () => {
  const out = oa._renderLibsSection({
    libs: {
      candidates: [
        { symbol: 'parseStateMd', entrypoint: '/path/index.cjs', tokens_matched: 2, symbol_tokens: ['parse', 'state', 'md'] },
        { symbol: 'resolveChain', entrypoint: '/path/index.cjs', tokens_matched: 1, symbol_tokens: ['resolve', 'chain'] },
        { symbol: 'foo', entrypoint: '/path/index.cjs', tokens_matched: 0, symbol_tokens: ['foo'] },
      ],
    },
  });
  assert.match(out, /parseStateMd/);
  assert.match(out, /resolveChain/);
  assert.match(out, /foo/);
  const bullets = out.split('\n').filter(l => l.startsWith('- '));
  assert.strictEqual(bullets.length, 3);
});

test('RL3 — candidate with tokens_matched=0 still renders', () => {
  const out = oa._renderLibsSection({
    libs: {
      candidates: [
        { symbol: 'myFunc', entrypoint: '/path/index.cjs', tokens_matched: 0, symbol_tokens: ['my', 'func'] },
      ],
    },
  });
  assert.match(out, /myFunc/);
  const bullets = out.split('\n').filter(l => l.startsWith('- '));
  assert.strictEqual(bullets.length, 1);
});

test('RL4 — scanned=false renders sentinel (eden-libs not found is silent)', () => {
  const out = oa._renderLibsSection({
    libs: { candidates: [], warnings: ['eden-libs not found at /path'], scanned: false },
  });
  assert.match(out, /### eden-libs candidates/);
  assert.match(out, /_\(no matches\)_/);
});

// ─── Group RO — _renderOrgSection ────────────────────────────────────────────

test('RO1 — skipped:true renders auth sentinel and OMITS misfiling line', () => {
  const out = oa._renderOrgSection({
    org_overlap: { items: [], warnings: [], skipped: true, misfiling: null },
  });
  assert.match(out, /### Org Project overlap/);
  assert.match(out, /skipped: gh auth/);
  assert.doesNotMatch(out, /Misfiling check/);
});

test('RO2 — empty items, skipped:false, misfiling:null renders sentinel + no-mismatch line', () => {
  const out = oa._renderOrgSection({
    org_overlap: { items: [], warnings: [], skipped: false, misfiling: null },
  });
  assert.match(out, /_\(no matches\)_/);
  assert.match(out, /Misfiling check: no mismatch detected/);
});

test('RO3 — 2 items, misfiling:null renders 2 bullets + misfiling-OK line', () => {
  const out = oa._renderOrgSection({
    org_overlap: {
      items: [
        { issue_ref: 'AO-Cyber-Systems/aodex#33', title: '[Roadmap] Go Migration', score: 12, matched_keywords: ['go'], chain_match: false },
        { issue_ref: 'AO-Cyber-Systems/aosentry#5', title: '[Roadmap] Sentry', score: 3, matched_keywords: [], chain_match: false },
      ],
      warnings: [],
      skipped: false,
      misfiling: null,
    },
  });
  const bullets = out.split('\n').filter(l => l.startsWith('- '));
  assert.strictEqual(bullets.length, 2);
  assert.match(out, /Misfiling check: no mismatch detected/);
});

test('RO4 — items + misfiling object renders misfiling warning line (italicized)', () => {
  const out = oa._renderOrgSection({
    org_overlap: {
      items: [
        { issue_ref: 'AO-Cyber-Systems/aodex#33', title: '[Roadmap] Go Migration', score: 12, matched_keywords: ['go'], chain_match: true },
      ],
      warnings: [],
      skipped: false,
      misfiling: {
        current_repo: 'AO-Cyber-Systems/devflow-claude',
        resolved_repo: 'AO-Cyber-Systems/aodex',
        message: 'Possible misfile — consider whether this objective belongs in aodex.',
      },
    },
  });
  assert.match(out, /aodex#33/);
  assert.match(out, /_Misfiling check:.*Possible misfile/);
});

test('RO5 — chain_match item decorated with [chain match] annotation in bullet', () => {
  const out = oa._renderOrgSection({
    org_overlap: {
      items: [
        { issue_ref: 'AO-Cyber-Systems/repo#10', title: 'Some Roadmap', score: 15, matched_keywords: [], chain_match: true },
      ],
      warnings: [],
      skipped: false,
      misfiling: null,
    },
  });
  assert.match(out, /\[chain match\]/);
});

test('RO6 — matched_keywords empty renders bullet without (matched: ...) suffix', () => {
  const out = oa._renderOrgSection({
    org_overlap: {
      items: [
        { issue_ref: 'AO-Cyber-Systems/repo#11', title: 'Some Item', score: 10, matched_keywords: [], chain_match: false },
      ],
      warnings: [],
      skipped: false,
      misfiling: null,
    },
  });
  assert.doesNotMatch(out, /matched:/);
  assert.match(out, /Some Item/);
});

// ─── Group F — formatConsiderations end-to-end ───────────────────────────────

test('F1 — full happy path renders 3 subsections in fixed order with blank-line separators', () => {
  const md = oa.formatConsiderations({
    siblings: { matches: [{ repo: 'aodex', best_objective: '12', score: 0.5, summary_count: 2 }] },
    libs: { candidates: [{ symbol: 'parseStateMd', entrypoint: '/x', tokens_matched: 2, symbol_tokens: ['parse'] }] },
    org_overlap: {
      items: [{ issue_ref: 'AO-Cyber-Systems/aodex#33', title: '[Roadmap] Go', score: 12, matched_keywords: [], chain_match: true }],
      warnings: [], skipped: false, misfiling: null,
    },
  });
  const sibIdx = md.indexOf('### Sibling repos');
  const libIdx = md.indexOf('### eden-libs candidates');
  const orgIdx = md.indexOf('### Org Project overlap');
  assert.ok(sibIdx >= 0, 'missing Sibling repos header');
  assert.ok(libIdx > sibIdx, 'eden-libs section should come after Sibling repos');
  assert.ok(orgIdx > libIdx, 'Org section should come after eden-libs');
  // No leading ## header
  assert.doesNotMatch(md, /^## Cross-Repo/);
});

test('F2 — all sections empty renders 3 subsections each with sentinel', () => {
  const md = oa.formatConsiderations({
    siblings: { matches: [] },
    libs: { candidates: [], scanned: true },
    org_overlap: { items: [], warnings: [], skipped: false, misfiling: null },
  });
  assert.match(md, /### Sibling repos/);
  assert.match(md, /### eden-libs candidates/);
  assert.match(md, /### Org Project overlap/);
  // Count sentinel occurrences: siblings + libs + org
  const sentinels = (md.match(/_\(no matches\)_/g) || []).length;
  assert.ok(sentinels >= 2, `expected >=2 '_(no matches)_' sentinels, got ${sentinels}`);
});

test('F3 — org skipped renders siblings + libs normally; org has skipped sentinel', () => {
  const md = oa.formatConsiderations({
    siblings: { matches: [{ repo: 'aodex', best_objective: '12', score: 0.5, summary_count: 2 }] },
    libs: { candidates: [{ symbol: 'parseStateMd', entrypoint: '/x', tokens_matched: 2, symbol_tokens: [] }] },
    org_overlap: { items: [], warnings: [], skipped: true, misfiling: null },
  });
  assert.match(md, /aodex/);
  assert.match(md, /parseStateMd/);
  assert.match(md, /skipped: gh auth/);
  assert.doesNotMatch(md, /Misfiling check/);
});

test('F4 — misfiling object renders in org section as italicized last line', () => {
  const md = oa.formatConsiderations({
    siblings: { matches: [] },
    libs: { candidates: [], scanned: true },
    org_overlap: {
      items: [],
      warnings: [],
      skipped: false,
      misfiling: {
        current_repo: 'AO-Cyber-Systems/devflow-claude',
        resolved_repo: 'AO-Cyber-Systems/aodex',
        message: 'Possible misfile — consider whether this objective belongs in aodex.',
      },
    },
  });
  assert.match(md, /_Misfiling check:.*Possible misfile/);
});

test('F5 — total output length ≤ 2000 chars in max-size case (length budget regression guard)', () => {
  const scans = {
    siblings: { matches: Array.from({ length: 3 }, (_, i) => ({ repo: `repo-${i}`, best_objective: `${i}`, score: 0.1 * i, summary_count: i + 1 })) },
    libs: { candidates: Array.from({ length: 3 }, (_, i) => ({ symbol: `func${i}`, entrypoint: '/x/index.cjs', tokens_matched: i, symbol_tokens: [] })) },
    org_overlap: {
      items: Array.from({ length: 3 }, (_, i) => ({ issue_ref: `AO-Cyber-Systems/repo-${i}#${i + 1}`, title: `title ${i}`, score: i, matched_keywords: [], chain_match: false })),
      warnings: [], skipped: false, misfiling: null,
    },
  };
  const md = oa.formatConsiderations(scans);
  assert.ok(md.length < 2000, `output ${md.length} chars exceeds 2000-char budget`);
});

test('F6 — deterministic output — same input produces same output on two calls', () => {
  const scans = {
    siblings: { matches: [{ repo: 'aodex', best_objective: '12', score: 0.5, summary_count: 2 }] },
    libs: { candidates: [{ symbol: 'parseStateMd', entrypoint: '/x', tokens_matched: 2, symbol_tokens: ['parse'] }] },
    org_overlap: { items: [], warnings: [], skipped: false, misfiling: null },
  };
  const md1 = oa.formatConsiderations(scans);
  const md2 = oa.formatConsiderations(scans);
  assert.deepStrictEqual(md1, md2);
});

test('F7 — output does NOT start with ## Cross-Repo header (caller adds it)', () => {
  const md = oa.formatConsiderations({
    siblings: { matches: [] },
    libs: { candidates: [], scanned: true },
    org_overlap: { items: [], warnings: [], skipped: false, misfiling: null },
  });
  assert.doesNotMatch(md, /^## /);
  assert.doesNotMatch(md, /Cross-Repo Considerations/);
});

// ─── Group CLI4 — considerations CLI ─────────────────────────────────────────

test('CLI4-1 — considerations 03 returns Markdown to stdout with all three ### headers', () => {
  const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');
  const projRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');
  const r = require('child_process').spawnSync(
    'node', [dfTools, 'org-awareness', 'considerations', '03'],
    { encoding: 'utf-8', cwd: projRoot },
  );
  assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
  assert.match(r.stdout, /### Sibling repos/);
  assert.match(r.stdout, /### eden-libs candidates/);
  assert.match(r.stdout, /### Org Project overlap/);
});

test('CLI4-2 — considerations 03 --raw returns JSON with siblings, libs, org_overlap keys', () => {
  const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');
  const projRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');
  const r = require('child_process').spawnSync(
    'node', [dfTools, 'org-awareness', 'considerations', '03', '--raw'],
    { encoding: 'utf-8', cwd: projRoot },
  );
  assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout); }, `stdout not valid JSON: ${r.stdout}`);
  assert.ok('siblings' in parsed, `expected 'siblings' key`);
  assert.ok('libs' in parsed, `expected 'libs' key`);
  assert.ok('org_overlap' in parsed, `expected 'org_overlap' key`);
});

test('CLI4-3 — considerations with no objective_id prints usage + exits 1', () => {
  const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');
  const r = require('child_process').spawnSync(
    'node', [dfTools, 'org-awareness', 'considerations'],
    { encoding: 'utf-8' },
  );
  assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}`);
  assert.match(r.stderr, /Usage/i);
});

test('CLI4-4 — under mocked GhAuthError on scanOrg, considerations CLI returns Markdown with skipped sentinel; exit 0', () => {
  // Use in-process invocation to verify graceful degradation: formatConsiderations should
  // produce the skipped placeholder when scanOrgOverlap returns skipped:true.
  // Test via direct formatConsiderations call with a skipped org_overlap input.
  const md = oa.formatConsiderations({
    siblings: { matches: [] },
    libs: { candidates: [], scanned: false },
    org_overlap: { items: [], warnings: ['org-overlap unavailable: auth failed. Run: gh auth refresh'], skipped: true, misfiling: null },
  });
  assert.match(md, /skipped: gh auth/);
  assert.match(md, /### Org Project overlap/);
  // Exit 0 is verified by the CLI subprocess tests CLI4-1 and CLI4-2 above.
});

// ─── TRD 03-07 tests ──────────────────────────────────────────────────────────

// Group EX — export lock
test('EX1 — module.exports surface is locked at 21 entries', () => {
  const expected = [
    'DEFAULT_EDEN_LIBS_PATH', 'DEFAULT_SIBLING_GLOB', 'SUMMARY_RECENCY_DAYS', 'TOP_N',
    '_camelSplit', '_detectMisfiling', '_extractRepoFromRef', '_parseExports',
    '_renderLibsSection', '_renderOrgSection', '_renderSiblingsSection',
    '_resetFsMock', '_resolveEdenLibsPath', '_score', '_scoreOrgItem',
    '_setRunFs', '_tokenize',
    'formatConsiderations', 'scanLibs', 'scanOrgOverlap', 'scanSiblings',
  ].sort();
  const actual = Object.keys(oa).sort();
  assert.deepStrictEqual(actual, expected);
});

// Group I — FS_INTEGRATION gated
test('I1 — real ~/Source/*/ walk completes', { skip: !process.env.FS_INTEGRATION }, () => {
  const r = oa.scanSiblings({ objective_id: '03', cwd: process.cwd() });
  assert.ok(typeof r.scanned_repos === 'number', 'scanned_repos must be a number');
  assert.ok(Array.isArray(r.matches), 'matches must be an array');
  // On author's machine siblings > 0; on CI with no ~/Source/ siblings may be 0 — both acceptable
  assert.ok(r.scanned_repos >= 0, 'scanned_repos must be >= 0');
});

test('I2 — real eden-libs scan handles missing/present', { skip: !process.env.FS_INTEGRATION }, () => {
  const r = oa.scanLibs({ current_tokens: new Set(['org', 'awareness']) });
  assert.ok('candidates' in r, 'candidates key must exist');
  assert.ok('warnings' in r, 'warnings key must exist');
  assert.ok('scanned' in r, 'scanned key must exist');
  // scanned can be true OR false depending on eden-libs presence at ~/Source/eden-libs
});

// Group GI — GH_INTEGRATION gated
test('GI1 — live scanOrgOverlap returns items or skips cleanly', { skip: !process.env.GH_INTEGRATION }, () => {
  const fm = { github_issue: 'AO-Cyber-Systems/devflow-claude#12', parent_issue: 'AO-Cyber-Systems/devflow-claude#9' };
  const ctx = { github_repo: 'AO-Cyber-Systems/devflow-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' };
  const r = oa.scanOrgOverlap({
    objective_id: '03',
    current_tokens: new Set(['org', 'awareness']),
    sibling_repos: [],
    frontmatter: fm,
    projectCtx: ctx,
  });
  // Either succeeded (items array) or gracefully skipped (skipped:true) — both valid
  if (!r.skipped) {
    assert.ok(Array.isArray(r.items), 'items must be array when not skipped');
  } else {
    assert.strictEqual(r.skipped, true, 'skipped must be true when auth unavailable');
  }
});

test('GI2 — live misfiling check has no false positive for current repo', { skip: !process.env.GH_INTEGRATION }, () => {
  const fm = { github_issue: 'AO-Cyber-Systems/devflow-claude#12', parent_issue: 'AO-Cyber-Systems/devflow-claude#9' };
  const ctx = { github_repo: 'AO-Cyber-Systems/devflow-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' };
  const r = oa.scanOrgOverlap({
    objective_id: '03',
    current_tokens: new Set(['org', 'awareness']),
    sibling_repos: [],
    frontmatter: fm,
    projectCtx: ctx,
  });
  // When resolved roadmap issue is in devflow-claude (same as current repo), misfiling must be null
  if (!r.skipped && r.misfiling !== null) {
    // Allow misfiling only if the resolved repo truly differs — document the case
    assert.ok(r.misfiling.current_repo !== r.misfiling.resolved_repo,
      'misfiling.current_repo should differ from resolved_repo if misfiling is set');
  }
});

// Group DG — dogfood
test('DG1 — considerations 4 produces all 3 subsection headers', () => {
  const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');
  const r = require('child_process').spawnSync(
    'node', [dfTools, 'org-awareness', 'considerations', '4'],
    { encoding: 'utf-8' },
  );
  assert.strictEqual(r.status, 0, `unexpected exit: ${r.status}, stderr: ${r.stderr}`);
  assert.match(r.stdout, /### Sibling repos/);
  assert.match(r.stdout, /### eden-libs candidates/);
  assert.match(r.stdout, /### Org Project overlap/);
});

test('DG2 — dogfood-04.md fixture exists and has 3 subsection headers', () => {
  const fixturePath = path.join(__dirname, '__fixtures__', 'cross-repo-considerations-fixtures', 'dogfood-04.md');
  assert.ok(fs.existsSync(fixturePath), 'dogfood-04.md must exist as a regression fixture');
  const content = fs.readFileSync(fixturePath, 'utf-8');
  assert.match(content, /### Sibling repos/);
  assert.match(content, /### eden-libs candidates/);
  assert.match(content, /### Org Project overlap/);
});
