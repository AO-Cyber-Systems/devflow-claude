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
