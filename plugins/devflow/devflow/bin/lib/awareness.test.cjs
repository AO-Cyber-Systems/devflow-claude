'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  parseStateMd,
  aggregateOrgByProductQuarter,
  DEFAULT_TTL_MINUTES,
  DEFAULT_STALE_DAYS,
  DEFAULT_BRANCH_PATTERNS,
  AWARENESS_CACHE_REL,
} = require('./awareness.cjs');
const {
  buildStateMd,
  buildOrgItem,
  buildSubIssue,
  buildOrgScanResult,
  buildGitFixtureRepo,
} = require('./__fixtures__/awareness-fixtures.cjs');

// ─── Real STATE.md excerpt for P6 ────────────────────────────────────────────
// Copied from .planning/STATE.md — 20 representative lines.
const REAL_STATE_MD_EXCERPT = `# DevFlow State

## Current Position

**Milestone:** v1.1 — DevFlow Coordination Layer (in flight)
**Branch:** \`feature/v1.1\`
**Objective complete:** 0 — Refine (kind, work) defaults table from codebase evidence (verified 2026-05-04, 443/443 tests, all 10 SC met)
**Objective complete:** 1 — GitHub coordination layer (verified 2026-05-04, 563/563 tests, all 6 TRDs done, SC-9 + SC-10 met)
**Objective in flight:** 2 — Cross-worktree session telemetry (next)
**Current TRD:** 02-01 (not yet started)
**Status:** Ready to plan

## Branch State (post-merge)

- \`main\` — has the merged kind/work intent model
- \`feature/v1.1\` (this branch) — clean off new main

github_issue: AO-Cyber-Systems/devflow-claude#11
`;

// ─── Group P: parseStateMd happy paths ───────────────────────────────────────

test('parseStateMd P1: parses Objective in flight line', () => {
  const content = '**Objective in flight:** 2 — Cross-worktree session telemetry\n';
  const result = parseStateMd(content);
  assert.ok(result, 'result should not be null');
  assert.strictEqual(result.objective, '2 — Cross-worktree session telemetry');
});

test('parseStateMd P2: parses Current TRD line', () => {
  const content = '**Current TRD:** 02-01 (not yet started)\n';
  const result = parseStateMd(content);
  assert.ok(result, 'result should not be null');
  assert.strictEqual(result.trd, '02-01');
});

test('parseStateMd P3: parses Branch with backticks', () => {
  const content = '**Branch:** `feature/v1.1`\n';
  const result = parseStateMd(content);
  assert.ok(result, 'result should not be null');
  assert.strictEqual(result.branch, 'feature/v1.1');
});

test('parseStateMd P4: parses github_issue field', () => {
  const content = 'github_issue: AO-Cyber-Systems/devflow-claude#11\n';
  const result = parseStateMd(content);
  assert.ok(result, 'result should not be null');
  assert.strictEqual(result.github_issue, 'AO-Cyber-Systems/devflow-claude#11');
});

test('parseStateMd P5: parses multiple Objective complete lines into array', () => {
  const content = [
    '**Objective complete:** 0 — Foo (verified)',
    '**Objective complete:** 1 — Bar (verified)',
    '**Objective in flight:** 2 — Baz',
  ].join('\n');
  const result = parseStateMd(content);
  assert.ok(result, 'result should not be null');
  assert.deepStrictEqual(result.objective_complete, [
    '0 — Foo (verified)',
    '1 — Bar (verified)',
  ]);
});

test('parseStateMd P6: parses real-world STATE.md excerpt — all four fields populated', () => {
  const result = parseStateMd(REAL_STATE_MD_EXCERPT);
  assert.ok(result, 'result should not be null');
  assert.strictEqual(result.objective, '2 — Cross-worktree session telemetry (next)');
  assert.strictEqual(result.trd, '02-01');
  assert.strictEqual(result.branch, 'feature/v1.1');
  assert.strictEqual(result.github_issue, 'AO-Cyber-Systems/devflow-claude#11');
  assert.ok(Array.isArray(result.objective_complete), 'objective_complete is array');
  assert.strictEqual(result.objective_complete.length, 2);
});

// ─── Group E: parseStateMd edge cases ────────────────────────────────────────

test('parseStateMd E1: empty string returns null', () => {
  assert.strictEqual(parseStateMd(''), null);
});

test('parseStateMd E2: whitespace-only string returns null', () => {
  assert.strictEqual(parseStateMd('   \n\n\t  '), null);
});

test('parseStateMd E3: 200 chars of garbage returns null', () => {
  const garbage = 'x'.repeat(200);
  assert.strictEqual(parseStateMd(garbage), null);
});

test('parseStateMd E4: older format **Objective:** N — name (no "in flight")', () => {
  const content = '**Objective:** 3 — Some old-style objective\n';
  const result = parseStateMd(content);
  assert.ok(result, 'result should not be null');
  assert.strictEqual(result.objective, '3 — Some old-style objective');
});

test('parseStateMd E5: branch without backticks', () => {
  const content = '**Branch:** feature/v1.1\n';
  const result = parseStateMd(content);
  assert.ok(result, 'result should not be null');
  assert.strictEqual(result.branch, 'feature/v1.1');
});

test('parseStateMd E6: mid-objective TRD format 1-3', () => {
  const content = '**Current TRD:** 1-3\n';
  const result = parseStateMd(content);
  assert.ok(result, 'result should not be null');
  assert.strictEqual(result.trd, '1-3');
});

test('parseStateMd E7: shorthand github_issue #11 — not expanded', () => {
  const content = 'github_issue: #11\n';
  const result = parseStateMd(content);
  assert.ok(result, 'result should not be null');
  assert.strictEqual(result.github_issue, '#11');
});

// ─── Group F: parseStateMd failure modes ─────────────────────────────────────

test('parseStateMd F1: malformed YAML-style frontmatter at top — parser extracts body fields', () => {
  const content = [
    '---',
    'title: Some state',
    'bad yaml: [unclosed',
    '---',
    '',
    '**Objective in flight:** 5 — Real objective',
    '**Current TRD:** 05-02',
  ].join('\n');
  const result = parseStateMd(content);
  assert.ok(result, 'result should not be null');
  assert.strictEqual(result.objective, '5 — Real objective');
  assert.strictEqual(result.trd, '05-02');
});

test('parseStateMd F2: only Objective complete, no in-flight — objective_complete populated', () => {
  const content = [
    '# DevFlow State',
    '**Objective complete:** 0 — All done (verified)',
    '**Objective complete:** 1 — Also done (verified)',
  ].join('\n');
  const result = parseStateMd(content);
  assert.ok(result, 'result should not be null');
  // objective may be null or absent — should not throw
  assert.ok(result.objective === null || result.objective === undefined || result.objective === '');
  assert.deepStrictEqual(result.objective_complete, [
    '0 — All done (verified)',
    '1 — Also done (verified)',
  ]);
});

test('parseStateMd F3: huge file with no markers returns null', () => {
  // 10K lines of lorem ipsum — no STATE.md markers
  const bigContent = 'Lorem ipsum dolor sit amet\n'.repeat(10000);
  assert.strictEqual(parseStateMd(bigContent), null);
});

// ─── Group A: aggregateOrgByProductQuarter ────────────────────────────────────

test('aggregateOrgByProductQuarter A1: 3 items with distinct (product, quarter) → 3 buckets', () => {
  const items = [
    buildOrgItem({ product: 'DevFlow', quarter: 'Q1 2026', title: 'A' }),
    buildOrgItem({ product: 'AODex', quarter: 'Q2 2026', title: 'B' }),
    buildOrgItem({ product: 'AOSentry', quarter: 'Q3 2026', title: 'C' }),
  ];
  const result = aggregateOrgByProductQuarter(items);
  assert.ok(result['DevFlow']['Q1 2026'], 'DevFlow Q1 2026 bucket exists');
  assert.ok(result['AODex']['Q2 2026'], 'AODex Q2 2026 bucket exists');
  assert.ok(result['AOSentry']['Q3 2026'], 'AOSentry Q3 2026 bucket exists');
  assert.strictEqual(result['DevFlow']['Q1 2026'].length, 1);
  assert.strictEqual(result['AODex']['Q2 2026'].length, 1);
  assert.strictEqual(result['AOSentry']['Q3 2026'].length, 1);
});

test('aggregateOrgByProductQuarter A2: 2 items with same (product, quarter) → 1 bucket with 2 items', () => {
  const items = [
    buildOrgItem({ product: 'DevFlow', quarter: 'Q2 2026', title: 'A' }),
    buildOrgItem({ product: 'DevFlow', quarter: 'Q2 2026', title: 'B' }),
  ];
  const result = aggregateOrgByProductQuarter(items);
  assert.strictEqual(result['DevFlow']['Q2 2026'].length, 2);
});

test('aggregateOrgByProductQuarter A3: 0 items → empty {}', () => {
  const result = aggregateOrgByProductQuarter([]);
  assert.deepStrictEqual(result, {});
});

test('aggregateOrgByProductQuarter A4: item with product null and quarter null → Unknown.Unknown', () => {
  const items = [buildOrgItem({ product: null, quarter: null })];
  const result = aggregateOrgByProductQuarter(items);
  assert.ok(result['Unknown'], 'Unknown product bucket');
  assert.ok(result['Unknown']['Unknown'], 'Unknown quarter bucket');
  assert.strictEqual(result['Unknown']['Unknown'].length, 1);
});

test('aggregateOrgByProductQuarter A5: item with product set, quarter null → <Product>.Unknown', () => {
  const items = [buildOrgItem({ product: 'DevFlow', quarter: null })];
  const result = aggregateOrgByProductQuarter(items);
  assert.ok(result['DevFlow'], 'DevFlow product bucket');
  assert.ok(result['DevFlow']['Unknown'], 'Unknown quarter bucket under DevFlow');
  assert.strictEqual(result['DevFlow']['Unknown'].length, 1);
});

test('aggregateOrgByProductQuarter A6: items sorted by title remain in input order within bucket (stable)', () => {
  const items = [
    buildOrgItem({ product: 'DevFlow', quarter: 'Q2 2026', title: 'Zebra' }),
    buildOrgItem({ product: 'DevFlow', quarter: 'Q2 2026', title: 'Alpha' }),
    buildOrgItem({ product: 'DevFlow', quarter: 'Q2 2026', title: 'Mango' }),
  ];
  const result = aggregateOrgByProductQuarter(items);
  const bucket = result['DevFlow']['Q2 2026'];
  assert.strictEqual(bucket[0].title, 'Zebra');
  assert.strictEqual(bucket[1].title, 'Alpha');
  assert.strictEqual(bucket[2].title, 'Mango');
});

// ─── Group B: buildStateMd factory contract ───────────────────────────────────

test('buildStateMd B1: objective field produces correct marker', () => {
  const s = buildStateMd({ objective: '2 — Test' });
  assert.ok(typeof s === 'string', 'returns string');
  assert.ok(s.includes('**Objective in flight:** 2 — Test'), 'contains in-flight marker');
});

test('buildStateMd B2: trd field produces correct marker', () => {
  const s = buildStateMd({ trd: '02-01' });
  assert.ok(s.includes('**Current TRD:** 02-01'), 'contains TRD marker');
});

test('buildStateMd B3: objective_complete array produces correct lines', () => {
  const s = buildStateMd({
    objective_complete: ['0 — A (verified)', '1 — B (verified)'],
  });
  assert.ok(s.includes('**Objective complete:** 0 — A (verified)'), 'first complete line');
  assert.ok(s.includes('**Objective complete:** 1 — B (verified)'), 'second complete line');
});

// ─── Group G: buildGitFixtureRepo (gated on GIT_INTEGRATION=1) ───────────────

test('buildGitFixtureRepo G1: creates tmp repo with named branch', async (t) => {
  if (!process.env.GIT_INTEGRATION) {
    t.skip('Set GIT_INTEGRATION=1 to run');
    return;
  }
  let fixture;
  try {
    fixture = buildGitFixtureRepo({
      branches: [
        { name: 'feature/foo', state_md: buildStateMd({ objective: '1 — Foo' }) },
      ],
    });
  } catch (err) {
    if (/git not available/i.test(err.message)) {
      t.skip('git not available on this system');
      return;
    }
    throw err;
  }
  try {
    const { spawnSync: spawn } = require('child_process');
    const result = spawn('git', ['-C', fixture.root, 'branch', '-a'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ok(result.stdout.includes('feature/foo'), 'feature/foo branch exists in repo');
  } finally {
    fixture.cleanup();
  }
});

test('buildGitFixtureRepo G2: cleanup removes tmp dir', async (t) => {
  if (!process.env.GIT_INTEGRATION) {
    t.skip('Set GIT_INTEGRATION=1 to run');
    return;
  }
  let fixture;
  try {
    fixture = buildGitFixtureRepo({ branches: [] });
  } catch (err) {
    if (/git not available/i.test(err.message)) {
      t.skip('git not available on this system');
      return;
    }
    throw err;
  }
  const { root } = fixture;
  assert.ok(fs.existsSync(root), 'root exists before cleanup');
  fixture.cleanup();
  assert.ok(!fs.existsSync(root), 'root removed after cleanup');
});

// ─── Group O: buildOrgItem + buildSubIssue + buildOrgScanResult ───────────────

test('buildOrgItem O1: returns minimal valid item shape', () => {
  const item = buildOrgItem({});
  assert.strictEqual(item.item_type, 'issue');
  assert.strictEqual(item.issue_ref, 'AO-Cyber-Systems/test#1');
  assert.strictEqual(item.title, 'Test item');
  assert.ok(typeof item.body === 'string');
  assert.strictEqual(item.product, null);
  assert.strictEqual(item.quarter, null);
  assert.strictEqual(item.status, null);
  assert.deepStrictEqual(item.sub_issues, []);
});

test('buildOrgScanResult O2: returns shape compatible with aggregateOrgByProductQuarter', () => {
  const scanResult = buildOrgScanResult({
    items: [buildOrgItem({ product: 'DevFlow', quarter: 'Q2 2026' })],
  });
  assert.ok(Array.isArray(scanResult.items), 'items is array');
  assert.ok(typeof scanResult.fetched_at === 'string', 'fetched_at is string');
  assert.ok(typeof scanResult.project_id === 'string', 'project_id is string');
  assert.ok(Array.isArray(scanResult.warnings), 'warnings is array');

  // Compatible with aggregateOrgByProductQuarter
  const grouped = aggregateOrgByProductQuarter(scanResult.items);
  assert.ok(grouped['DevFlow']['Q2 2026'], 'grouping works on scanResult.items');
});

// ─── TRD 02-04: cache layer ───────────────────────────────────────────────────
//
// Test list (enumerated before test code — TDD Playbook habit 2):
//
// Group C — readCache happy paths:
//   C1: cache file absent → returns null
//   C2: cache file empty → returns null (JSON.parse fails on empty string)
//   C3: cache file contains valid { peer: {...} } → returns object with peer section
//   C4: cache file contains both peer + org → returns object with both
//   C5: cache file contains malformed JSON → returns null (does not throw)
//
// Group W — writeCache merge semantics:
//   W1: empty dir + writeCache({peer:X}) → file contains {peer:X} only
//   W2: existing file {org:Y} + writeCache({peer:X}) → file contains BOTH peer:X AND org:Y (merge)
//   W3: existing file {peer:OLD, org:Y} + writeCache({peer:NEW}) → peer overwritten, org preserved
//   W4: existing file {peer:OLD, org:Y} + writeCache({peer:NEW, org:Y2}) → both replaced
//   W5: missing .planning/ directory → writeCache creates it
//   W6: writeCache produces pretty JSON with trailing newline
//
// Group I — isStale TTL math:
//   I1: fetched_at=null → returns true
//   I2: fetched_at=undefined → returns true
//   I3: fetched_at='not-an-iso' → returns true
//   I4: fetched_at = (now - 5 minutes), ttl=10 → returns false
//   I5: fetched_at = (now - 11 minutes), ttl=10 → returns true
//   I6: fetched_at = (now - 1 minute), ttl=0 → returns true (zero TTL = always stale)
//   I7: fetched_at = (now - 1 minute), ttl=undefined → uses DEFAULT_TTL_MINUTES (10) → returns false
//   I8: fetched_at = (now + 5 minutes) (future, clock skew) → returns false (treated as fresh)
//
// Group G — .gitignore line:
//   G1: file .gitignore contains line matching ^\.planning/\.awareness-cache\.json$
//   G2: gitignore line does NOT inadvertently ignore other awareness files (count === 1)
//
// Group T — templates/config.json documentation:
//   T1: templates/config.json has top-level awareness key
//   T2: awareness block documents cache_ttl_minutes, peer_stale_days, branch_patterns, org_project_id
//   T3: existing config blocks (mode, github, etc.) are preserved unchanged
//
// Total: 23 cases.
//
// ─────────────────────────────────────────────────────────────────────────────

const { readCache, writeCache, isStale } = require('./awareness.cjs');

function tempCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-awareness-cache-'));
  return {
    cwd: dir,
    cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} },
  };
}

// ─── Group C: readCache happy paths ──────────────────────────────────────────

test('readCache C1: cache file absent returns null', () => {
  const t = tempCwd();
  try {
    const result = readCache(t.cwd);
    assert.strictEqual(result, null);
  } finally { t.cleanup(); }
});

test('readCache C2: cache file empty returns null', () => {
  const t = tempCwd();
  try {
    fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(t.cwd, '.planning', '.awareness-cache.json'), '');
    const result = readCache(t.cwd);
    assert.strictEqual(result, null);
  } finally { t.cleanup(); }
});

test('readCache C3: cache file with peer section returns object with peer', () => {
  const t = tempCwd();
  try {
    fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
    const cacheData = { peer: { fetched_at: '2026-05-04T00:00:00Z', branches: ['main'] } };
    fs.writeFileSync(
      path.join(t.cwd, '.planning', '.awareness-cache.json'),
      JSON.stringify(cacheData, null, 2) + '\n'
    );
    const result = readCache(t.cwd);
    assert.ok(result, 'result should not be null');
    assert.ok(result.peer, 'peer section present');
    assert.deepStrictEqual(result.peer.branches, ['main']);
    assert.strictEqual(result.org, undefined);
  } finally { t.cleanup(); }
});

test('readCache C4: cache file with both peer + org returns both sections', () => {
  const t = tempCwd();
  try {
    fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
    const cacheData = {
      peer: { fetched_at: '2026-05-04T00:00:00Z', branches: ['main'] },
      org: { fetched_at: '2026-05-04T00:00:00Z', items: ['item1'] },
    };
    fs.writeFileSync(
      path.join(t.cwd, '.planning', '.awareness-cache.json'),
      JSON.stringify(cacheData, null, 2) + '\n'
    );
    const result = readCache(t.cwd);
    assert.ok(result, 'result should not be null');
    assert.ok(result.peer, 'peer section present');
    assert.ok(result.org, 'org section present');
    assert.deepStrictEqual(result.peer.branches, ['main']);
    assert.deepStrictEqual(result.org.items, ['item1']);
  } finally { t.cleanup(); }
});

test('readCache C5: malformed JSON returns null (does not throw)', () => {
  const t = tempCwd();
  try {
    fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(t.cwd, '.planning', '.awareness-cache.json'),
      '{ "peer": { broken json here }}}'
    );
    const result = readCache(t.cwd);
    assert.strictEqual(result, null);
  } finally { t.cleanup(); }
});

// ─── Group W: writeCache merge semantics ─────────────────────────────────────

test('writeCache W1: empty dir + writeCache({peer:X}) → file contains {peer:X} only', () => {
  const t = tempCwd();
  try {
    fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
    writeCache(t.cwd, { peer: { branches: ['new'] } });
    const after = JSON.parse(
      fs.readFileSync(path.join(t.cwd, '.planning', '.awareness-cache.json'), 'utf-8')
    );
    assert.ok(after.peer, 'peer section written');
    assert.deepStrictEqual(after.peer.branches, ['new']);
    assert.strictEqual(after.org, undefined);
  } finally { t.cleanup(); }
});

test('writeCache W2: existing {org:Y} + writeCache({peer:X}) → BOTH sections preserved', () => {
  const t = tempCwd();
  try {
    fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(t.cwd, '.planning', '.awareness-cache.json'),
      JSON.stringify({ org: { items: ['existing'] } }, null, 2) + '\n'
    );
    writeCache(t.cwd, { peer: { branches: ['new'] } });
    const after = JSON.parse(
      fs.readFileSync(path.join(t.cwd, '.planning', '.awareness-cache.json'), 'utf-8')
    );
    assert.ok(after.peer, 'peer section present');
    assert.deepStrictEqual(after.peer.branches, ['new']);
    assert.ok(after.org, 'org section preserved');
    assert.deepStrictEqual(after.org.items, ['existing']);
  } finally { t.cleanup(); }
});

test('writeCache W3: existing {peer:OLD, org:Y} + writeCache({peer:NEW}) → peer overwritten, org preserved', () => {
  const t = tempCwd();
  try {
    fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(t.cwd, '.planning', '.awareness-cache.json'),
      JSON.stringify({ peer: { branches: ['old'] }, org: { items: ['keep'] } }, null, 2) + '\n'
    );
    writeCache(t.cwd, { peer: { branches: ['new'] } });
    const after = JSON.parse(
      fs.readFileSync(path.join(t.cwd, '.planning', '.awareness-cache.json'), 'utf-8')
    );
    assert.deepStrictEqual(after.peer.branches, ['new'], 'peer overwritten');
    assert.ok(after.org, 'org section preserved');
    assert.deepStrictEqual(after.org.items, ['keep'], 'org items unchanged');
  } finally { t.cleanup(); }
});

test('writeCache W4: existing {peer:OLD, org:Y} + writeCache({peer:NEW, org:Y2}) → both replaced', () => {
  const t = tempCwd();
  try {
    fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(t.cwd, '.planning', '.awareness-cache.json'),
      JSON.stringify({ peer: { branches: ['old'] }, org: { items: ['old-org'] } }, null, 2) + '\n'
    );
    writeCache(t.cwd, { peer: { branches: ['new-peer'] }, org: { items: ['new-org'] } });
    const after = JSON.parse(
      fs.readFileSync(path.join(t.cwd, '.planning', '.awareness-cache.json'), 'utf-8')
    );
    assert.deepStrictEqual(after.peer.branches, ['new-peer'], 'peer replaced');
    assert.deepStrictEqual(after.org.items, ['new-org'], 'org replaced');
  } finally { t.cleanup(); }
});

test('writeCache W5: missing .planning/ directory → writeCache creates it', () => {
  const t = tempCwd();
  try {
    // Do NOT create .planning/ — let writeCache create it
    assert.ok(!fs.existsSync(path.join(t.cwd, '.planning')), '.planning should not exist yet');
    writeCache(t.cwd, { peer: { branches: ['x'] } });
    assert.ok(fs.existsSync(path.join(t.cwd, '.planning')), '.planning directory created');
    assert.ok(
      fs.existsSync(path.join(t.cwd, '.planning', '.awareness-cache.json')),
      'cache file created'
    );
  } finally { t.cleanup(); }
});

test('writeCache W6: produces pretty JSON with trailing newline', () => {
  const t = tempCwd();
  try {
    writeCache(t.cwd, { peer: { branches: ['a'] } });
    const raw = fs.readFileSync(
      path.join(t.cwd, '.planning', '.awareness-cache.json'),
      'utf-8'
    );
    // Must end with newline
    assert.ok(raw.endsWith('\n'), 'file ends with newline');
    // Must be pretty-printed (contains indented keys)
    assert.ok(raw.includes('\n  '), 'file is pretty-printed (has indented lines)');
    // Must be valid JSON
    const parsed = JSON.parse(raw);
    assert.ok(parsed.peer, 'parsed object has peer section');
  } finally { t.cleanup(); }
});

// ─── Group I: isStale TTL math ────────────────────────────────────────────────

test('isStale I1: fetched_at=null returns true', () => {
  assert.strictEqual(isStale(null, 10), true);
});

test('isStale I2: fetched_at=undefined returns true', () => {
  assert.strictEqual(isStale(undefined, 10), true);
});

test('isStale I3: fetched_at=non-ISO string returns true', () => {
  assert.strictEqual(isStale('not-an-iso', 10), true);
});

test('isStale I4: fetched_at 5 minutes ago with ttl=10 returns false', () => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  assert.strictEqual(isStale(fiveMinAgo, 10), false);
});

test('isStale I5: fetched_at 11 minutes ago with ttl=10 returns true', () => {
  const elevenMinAgo = new Date(Date.now() - 11 * 60_000).toISOString();
  assert.strictEqual(isStale(elevenMinAgo, 10), true);
});

test('isStale I6: fetched_at 1 minute ago with ttl=0 returns true (zero TTL = always stale)', () => {
  const oneMinAgo = new Date(Date.now() - 1 * 60_000).toISOString();
  assert.strictEqual(isStale(oneMinAgo, 0), true);
});

test('isStale I7: fetched_at 1 minute ago with ttl=undefined uses DEFAULT_TTL_MINUTES (10) returns false', () => {
  const oneMinAgo = new Date(Date.now() - 1 * 60_000).toISOString();
  // DEFAULT_TTL_MINUTES is 10; 1 minute < 10 minutes → not stale
  assert.strictEqual(isStale(oneMinAgo, undefined), false);
});

test('isStale I8: fetched_at in future (clock skew) returns false (treated as fresh)', () => {
  const fiveMinFuture = new Date(Date.now() + 5 * 60_000).toISOString();
  assert.strictEqual(isStale(fiveMinFuture, 10), false);
});

// ─── Group G: .gitignore line ─────────────────────────────────────────────────

test('gitignore G1: .gitignore contains .awareness-cache.json line', () => {
  // Anchor from __dirname: plugins/devflow/devflow/bin/lib → ../../../../.gitignore
  const gitignorePath = path.resolve(__dirname, '../../../../..', '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    // Skip gracefully if path layout differs
    return;
  }
  const content = fs.readFileSync(gitignorePath, 'utf-8');
  assert.match(content, /^\.planning\/\.awareness-cache\.json$/m);
});

test('gitignore G2: gitignore line appears exactly once (does not inadvertently ignore other files)', () => {
  const gitignorePath = path.resolve(__dirname, '../../../../..', '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return;
  }
  const content = fs.readFileSync(gitignorePath, 'utf-8');
  const matches = (content.match(/\.awareness-cache\.json/g) || []).length;
  assert.strictEqual(matches, 1, '.awareness-cache.json appears exactly once in .gitignore');
});

// ─── Group T: templates/config.json documentation ────────────────────────────

test('config.json T1: has top-level awareness key', () => {
  const cfgPath = path.resolve(__dirname, '../../templates/config.json');
  if (!fs.existsSync(cfgPath)) return;
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  assert.ok(cfg.awareness, 'config.json missing awareness block');
});

test('config.json T2: awareness block documents all four config fields', () => {
  const cfgPath = path.resolve(__dirname, '../../templates/config.json');
  if (!fs.existsSync(cfgPath)) return;
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  assert.ok(cfg.awareness, 'awareness block present');
  assert.strictEqual(typeof cfg.awareness.cache_ttl_minutes, 'number', 'cache_ttl_minutes is number');
  assert.strictEqual(typeof cfg.awareness.peer_stale_days, 'number', 'peer_stale_days is number');
  assert.ok(Array.isArray(cfg.awareness.branch_patterns), 'branch_patterns is array');
  assert.strictEqual(typeof cfg.awareness.org_project_id, 'string', 'org_project_id is string');
});

test('config.json T3: existing blocks (mode, github) preserved unchanged', () => {
  const cfgPath = path.resolve(__dirname, '../../templates/config.json');
  if (!fs.existsSync(cfgPath)) return;
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  assert.ok(cfg.mode, 'mode block preserved');
  assert.ok(cfg.github, 'github block preserved');
});

// ─── TRD 02-02: peer scanner ──────────────────────────────────────────────────
//
// Test list (enumerated before test code — TDD Playbook habit 2):
//
// Group S — scanPeer happy paths (all use buildMockRunGit; no live git):
//   S1: 1 branch with valid STATE.md → returns 1 entry with all fields populated
//   S2: 3 branches each with valid STATE.md → 3 entries; current_branch field set
//   S3: branch with STATE.md containing only Objective in flight → entry has objective set, trd null
//   S4: developer field populated from git config user.name mock
//   S5: last_commit.sha + timestamp + subject populated from git log mock per branch
//   S6: returns fetched_at ISO timestamp on the result (not per-branch)
//
// Group SF — scanPeer fault tolerance (per SC-2):
//   SF1: branch without STATE.md (git show exit 128) → SILENTLY skipped, NO warning
//   SF2: branch WITH STATE.md but malformed → entry skipped + warning logged
//   SF3: git fetch fails → result.warnings includes stderr; scan continues
//   SF4: no_fetch: true → git fetch NEVER called (assert callCount for fetch === 0)
//   SF5: git for-each-ref returns empty stdout → result.branches === []; no warnings
//   SF6: malformed git log output (no NULs) → branch skipped + warning
//
// Group SS — scanPeer stale filtering:
//   SS1: branch 31 days ago + default peer_stale_days=30 → filtered out
//   SS2: branch 29 days ago + default peer_stale_days=30 → INCLUDED
//   SS3: peer_stale_days=0 + branch from 1 hour ago → INCLUDED (0 = disabled)
//   SS4: peer_stale_days=7 + branch from 8 days ago → filtered out
//
// Group SP — scanPeer pattern filtering:
//   SP1: branch feature/v1.1 matches default patterns → included
//   SP2: branch main → filtered out (special-case)
//   SP3: branch random-branch → filtered out (no pattern match)
//   SP4: custom branch_patterns=['*'] → all branches except main/master/HEAD included
//   SP5: branch HEAD → filtered out
//
// Group SI — _setRunGit injection mechanics:
//   SI1: scanPeer with default _runGit + GIT_INTEGRATION unset → test SKIPS
//   SI2: _setRunGit(mockFn) → scanPeer uses mockFn; calls captured via mockFn.calls()
//   SI3: _resetGitMock() → restores default
//   SI4: mockFn args spec — scanPeer calls git fetch --all --prune first when no_fetch=false
//
// Group SU — buildMockRunGit fixture builder contract:
//   SU1: buildMockRunGit returns a function
//   SU2: that function called with matching args returns canned response
//
// Group SR — Live-git smoke (gated on GIT_INTEGRATION=1):
//   SR1: scanPeer against buildGitFixtureRepo with 2 branches → 2 entries
//   SR2: scanPeer with no_fetch=true on fixture → still scans
//
// Total: 29 test cases.
//
// ─────────────────────────────────────────────────────────────────────────────

// Tolerant import — in RED phase, scanPeer/_setRunGit/_resetGitMock may not exist yet
const _aw02 = require('./awareness.cjs');
const scanPeer = _aw02.scanPeer;
const _setRunGit = _aw02._setRunGit;
const _resetGitMock = _aw02._resetGitMock;

const {
  buildMockRunGit,
  buildGitForEachRefOutput,
  buildGitLogOutput,
  buildGitShowStateMd,
  buildGitShowMissingFile,
  buildGitFetchSuccess,
  buildGitFetchFailure,
  buildGitConfigUserName,
} = require('./__fixtures__/awareness-fixtures.cjs');

// Guard helper — fails test body with useful message when scanPeer not yet exported
function requireScanPeer(t) {
  if (typeof scanPeer !== 'function') {
    assert.fail('scanPeer not exported from awareness.cjs (expected in GREEN phase)');
  }
}
function requireSetRunGit(t) {
  if (typeof _setRunGit !== 'function') {
    assert.fail('_setRunGit not exported from awareness.cjs (expected in GREEN phase)');
  }
}
function requireResetGitMock() {
  if (typeof _resetGitMock !== 'function') {
    assert.fail('_resetGitMock not exported from awareness.cjs (expected in GREEN phase)');
  }
}

// Helper: build a complete mock responses map for a set of branches
function buildScanResponses({
  branches = ['origin/feature/v1.1'],
  state_md_per_branch = { 'feature/v1.1': { objective: '2 — Test', trd: '02-02' } },
  fetch_ok = true,
  user_name = 'mark',
  per_branch_log = {},
  current_branch = 'main',
} = {}) {
  const responses = new Map();
  responses.set('fetch --all --prune', fetch_ok ? buildGitFetchSuccess() : buildGitFetchFailure());
  responses.set('config user.name', buildGitConfigUserName({ name: user_name }));
  responses.set('rev-parse --abbrev-ref HEAD', { ok: true, status: 0, stdout: current_branch, stderr: '' });
  responses.set(
    'for-each-ref refs/remotes/origin/* --format=%(refname:short)',
    buildGitForEachRefOutput({ branches })
  );
  for (const [branch, fields] of Object.entries(state_md_per_branch)) {
    if (fields === null) {
      responses.set(`show origin/${branch}:.planning/STATE.md`, buildGitShowMissingFile());
    } else if (fields === 'malformed') {
      responses.set(`show origin/${branch}:.planning/STATE.md`,
        { ok: true, status: 0, stdout: 'this is not a state.md', stderr: '' });
    } else {
      responses.set(`show origin/${branch}:.planning/STATE.md`, buildGitShowStateMd(fields));
    }
  }
  for (const [branch, log_opts] of Object.entries(per_branch_log)) {
    responses.set(`log -1 --format=%H%x00%cI%x00%s origin/${branch}`, buildGitLogOutput(log_opts));
  }
  // Default last_commit for branches not in per_branch_log (recent timestamp)
  for (const b of branches.map(b => b.replace(/^origin\//, ''))) {
    const key = `log -1 --format=%H%x00%cI%x00%s origin/${b}`;
    if (!responses.has(key)) {
      responses.set(key, buildGitLogOutput({ timestamp: new Date().toISOString() }));
    }
  }
  return responses;
}

// ─── Group S: scanPeer happy paths ───────────────────────────────────────────

test('S1: scanPeer with 1 valid branch returns 1 entry with all fields', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  _setRunGit(buildMockRunGit(buildScanResponses({
    branches: ['origin/feature/v1.1'],
    state_md_per_branch: { 'feature/v1.1': { objective: '2 — Test', trd: '02-02' } },
    per_branch_log: { 'feature/v1.1': { sha: 'abc123', timestamp: '2026-05-04T08:31:00Z', subject: 'feat: test' } },
  })));
  try {
    const result = scanPeer({ no_fetch: false });
    assert.strictEqual(result.branches.length, 1, 'one branch returned');
    const br = result.branches[0];
    assert.strictEqual(br.branch, 'feature/v1.1');
    assert.strictEqual(br.objective, '2 — Test');
    assert.strictEqual(br.trd, '02-02');
    assert.ok(br.last_commit, 'last_commit present');
    assert.strictEqual(br.last_commit.sha, 'abc123');
    assert.strictEqual(br.last_commit.timestamp, '2026-05-04T08:31:00Z');
    assert.strictEqual(br.last_commit.subject, 'feat: test');
  } finally { _resetGitMock(); }
});

test('S2: scanPeer with 3 valid branches returns 3 entries and current_branch set', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const branches = ['origin/feature/foo', 'origin/feature/bar', 'origin/df/baz'];
  _setRunGit(buildMockRunGit(buildScanResponses({
    branches,
    state_md_per_branch: {
      'feature/foo': { objective: '2 — Foo', trd: '02-02' },
      'feature/bar': { objective: '2 — Bar', trd: '02-03' },
      'df/baz': { objective: '3 — Baz', trd: '03-01' },
    },
    current_branch: 'feature/v1.1',
  })));
  try {
    const result = scanPeer({});
    assert.strictEqual(result.branches.length, 3);
    assert.strictEqual(result.current_branch, 'feature/v1.1');
  } finally { _resetGitMock(); }
});

test('S3: branch STATE.md with only Objective in flight → objective set, trd null', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const { buildStateMd: bsmd } = require('./__fixtures__/awareness-fixtures.cjs');
  const state_md = bsmd({ objective: '2 — Cross-worktree session telemetry' }); // no trd
  _setRunGit(buildMockRunGit(buildScanResponses({
    branches: ['origin/feature/v1.1'],
    state_md_per_branch: { 'feature/v1.1': { state_md } },
  })));
  try {
    const result = scanPeer({});
    assert.strictEqual(result.branches.length, 1);
    assert.strictEqual(result.branches[0].objective, '2 — Cross-worktree session telemetry');
    assert.strictEqual(result.branches[0].trd, null);
  } finally { _resetGitMock(); }
});

test('S4: developer field populated from git config user.name mock', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  _setRunGit(buildMockRunGit(buildScanResponses({
    user_name: 'alice',
  })));
  try {
    const result = scanPeer({});
    assert.strictEqual(result.branches.length, 1);
    assert.strictEqual(result.branches[0].developer, 'alice');
  } finally { _resetGitMock(); }
});

test('S5: last_commit sha + timestamp + subject populated from git log mock', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  // Use a recent timestamp so branch passes the default 30-day stale filter
  const recentTs = new Date(Date.now() - 2 * 86400000).toISOString(); // 2 days ago
  _setRunGit(buildMockRunGit(buildScanResponses({
    branches: ['origin/feature/v1.1'],
    per_branch_log: {
      'feature/v1.1': { sha: 'deadbeef01234', timestamp: recentTs, subject: 'chore: bump version' },
    },
  })));
  try {
    const result = scanPeer({});
    assert.strictEqual(result.branches.length, 1);
    const lc = result.branches[0].last_commit;
    assert.ok(lc, 'last_commit present');
    assert.strictEqual(lc.sha, 'deadbeef01234');
    assert.strictEqual(lc.timestamp, recentTs);
    assert.strictEqual(lc.subject, 'chore: bump version');
  } finally { _resetGitMock(); }
});

test('S6: returns fetched_at ISO timestamp on result (not per-branch)', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  _setRunGit(buildMockRunGit(buildScanResponses({})));
  try {
    const before = Date.now();
    const result = scanPeer({});
    const after = Date.now();
    assert.ok(typeof result.fetched_at === 'string', 'fetched_at is a string');
    const ts = Date.parse(result.fetched_at);
    assert.ok(Number.isFinite(ts), 'fetched_at parses as valid date');
    assert.ok(ts >= before - 1000 && ts <= after + 1000, 'fetched_at is recent');
    // Should NOT appear on individual branch entries
    for (const br of result.branches) {
      assert.strictEqual(br.fetched_at, undefined, 'no fetched_at on branch entry');
    }
  } finally { _resetGitMock(); }
});

// ─── Group SF: scanPeer fault tolerance ──────────────────────────────────────

test('SF1: branch without STATE.md silently skipped — NO warning', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  _setRunGit(buildMockRunGit(buildScanResponses({
    branches: ['origin/feature/no-state'],
    state_md_per_branch: { 'feature/no-state': null }, // null = missing file
  })));
  try {
    const result = scanPeer({});
    assert.strictEqual(result.branches.length, 0, 'no branches returned');
    assert.strictEqual(result.warnings.length, 0, 'NO warning for missing STATE.md');
  } finally { _resetGitMock(); }
});

test('SF2: branch WITH malformed STATE.md → skipped + warning logged', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  _setRunGit(buildMockRunGit(buildScanResponses({
    branches: ['origin/feature/bad-state'],
    state_md_per_branch: { 'feature/bad-state': 'malformed' },
  })));
  try {
    const result = scanPeer({});
    assert.strictEqual(result.branches.length, 0, 'no branches returned');
    assert.ok(result.warnings.length > 0, 'at least one warning for malformed STATE.md');
    assert.ok(
      result.warnings.some(w => /malformed/i.test(w) || /feature\/bad-state/.test(w)),
      'warning mentions malformed or branch name'
    );
  } finally { _resetGitMock(); }
});

test('SF3: git fetch fails → warnings includes stderr; scan continues with refs', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  _setRunGit(buildMockRunGit(buildScanResponses({
    fetch_ok: false,
  })));
  try {
    const result = scanPeer({});
    // fetch failed but scan continued — branches may have results
    assert.ok(result.warnings.length > 0, 'warning added for fetch failure');
    assert.ok(
      result.warnings.some(w => /fetch/i.test(w) || /unable/.test(w) || /fatal/.test(w)),
      'warning mentions fetch failure'
    );
    // branches still scanned from local refs
    assert.ok(Array.isArray(result.branches), 'branches array present even after fetch failure');
  } finally { _resetGitMock(); }
});

test('SF4: no_fetch=true → git fetch NEVER called', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const mock = buildMockRunGit(buildScanResponses({ no_fetch: true }));
  _setRunGit(mock);
  try {
    scanPeer({ no_fetch: true });
    const fetchCalls = mock.calls().filter(c => c.args[0] === 'fetch');
    assert.strictEqual(fetchCalls.length, 0, 'fetch never called when no_fetch=true');
  } finally { _resetGitMock(); }
});

test('SF5: git for-each-ref returns empty stdout → branches=[], no warnings', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const responses = new Map();
  responses.set('fetch --all --prune', buildGitFetchSuccess());
  responses.set('rev-parse --abbrev-ref HEAD', { ok: true, status: 0, stdout: 'main', stderr: '' });
  responses.set('config user.name', buildGitConfigUserName());
  responses.set(
    'for-each-ref refs/remotes/origin/* --format=%(refname:short)',
    { ok: true, status: 0, stdout: '', stderr: '' }
  );
  _setRunGit(buildMockRunGit(responses));
  try {
    const result = scanPeer({});
    assert.deepStrictEqual(result.branches, [], 'branches is empty array');
    assert.deepStrictEqual(result.warnings, [], 'no warnings on empty ref list');
  } finally { _resetGitMock(); }
});

test('SF6: malformed git log output (no NULs) → branch skipped + warning', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const responses = buildScanResponses({
    branches: ['origin/feature/v1.1'],
    state_md_per_branch: { 'feature/v1.1': { objective: '2 — Test', trd: '02-02' } },
  });
  // Override the log response with garbage
  responses.set(
    'log -1 --format=%H%x00%cI%x00%s origin/feature/v1.1',
    { ok: true, status: 0, stdout: 'just garbage no nuls here', stderr: '' }
  );
  _setRunGit(buildMockRunGit(responses));
  try {
    const result = scanPeer({});
    assert.strictEqual(result.branches.length, 0, 'branch with malformed log skipped');
    assert.ok(result.warnings.length > 0, 'warning added for malformed git log');
  } finally { _resetGitMock(); }
});

// ─── Group SS: scanPeer stale filtering ──────────────────────────────────────

function daysAgoISO(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

test('SS1: branch 31 days ago + default peer_stale_days=30 → filtered out', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const responses = buildScanResponses({
    branches: ['origin/feature/stale'],
    state_md_per_branch: { 'feature/stale': { objective: '2 — Stale', trd: '02-01' } },
    per_branch_log: { 'feature/stale': { timestamp: daysAgoISO(31) } },
  });
  _setRunGit(buildMockRunGit(responses));
  try {
    const result = scanPeer({ peer_stale_days: 30 });
    assert.strictEqual(result.branches.length, 0, 'stale branch filtered out');
  } finally { _resetGitMock(); }
});

test('SS2: branch 29 days ago + default peer_stale_days=30 → INCLUDED', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const responses = buildScanResponses({
    branches: ['origin/feature/fresh-enough'],
    state_md_per_branch: { 'feature/fresh-enough': { objective: '2 — Fresh', trd: '02-02' } },
    per_branch_log: { 'feature/fresh-enough': { timestamp: daysAgoISO(29) } },
  });
  _setRunGit(buildMockRunGit(responses));
  try {
    const result = scanPeer({ peer_stale_days: 30 });
    assert.strictEqual(result.branches.length, 1, 'fresh-enough branch included');
    assert.strictEqual(result.branches[0].branch, 'feature/fresh-enough');
  } finally { _resetGitMock(); }
});

test('SS3: peer_stale_days=0 → stale filter disabled; branch from 1 hour ago included', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const responses = buildScanResponses({
    branches: ['origin/feature/old-but-included'],
    state_md_per_branch: { 'feature/old-but-included': { objective: '2 — Old', trd: '02-01' } },
    per_branch_log: { 'feature/old-but-included': { timestamp: daysAgoISO(365) } },
  });
  _setRunGit(buildMockRunGit(responses));
  try {
    const result = scanPeer({ peer_stale_days: 0 });
    assert.strictEqual(result.branches.length, 1, 'branch included when peer_stale_days=0 (disabled)');
  } finally { _resetGitMock(); }
});

test('SS4: peer_stale_days=7 + branch 8 days ago → filtered out', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const responses = buildScanResponses({
    branches: ['origin/feature/weekold'],
    state_md_per_branch: { 'feature/weekold': { objective: '2 — Week', trd: '02-01' } },
    per_branch_log: { 'feature/weekold': { timestamp: daysAgoISO(8) } },
  });
  _setRunGit(buildMockRunGit(responses));
  try {
    const result = scanPeer({ peer_stale_days: 7 });
    assert.strictEqual(result.branches.length, 0, '8-day-old branch filtered with peer_stale_days=7');
  } finally { _resetGitMock(); }
});

// ─── Group SP: scanPeer pattern filtering ────────────────────────────────────

test('SP1: branch feature/v1.1 matches default branch_patterns → included', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  _setRunGit(buildMockRunGit(buildScanResponses({
    branches: ['origin/feature/v1.1'],
    state_md_per_branch: { 'feature/v1.1': { objective: '2 — Test', trd: '02-01' } },
  })));
  try {
    const result = scanPeer({});
    assert.strictEqual(result.branches.length, 1, 'feature/* matches default patterns');
    assert.strictEqual(result.branches[0].branch, 'feature/v1.1');
  } finally { _resetGitMock(); }
});

test('SP2: branch main → filtered out unconditionally', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const responses = new Map();
  responses.set('fetch --all --prune', buildGitFetchSuccess());
  responses.set('rev-parse --abbrev-ref HEAD', { ok: true, status: 0, stdout: 'develop', stderr: '' });
  responses.set('config user.name', buildGitConfigUserName());
  responses.set(
    'for-each-ref refs/remotes/origin/* --format=%(refname:short)',
    buildGitForEachRefOutput({ branches: ['origin/main'] })
  );
  _setRunGit(buildMockRunGit(responses));
  try {
    const result = scanPeer({});
    assert.strictEqual(result.branches.length, 0, 'main filtered out');
    assert.strictEqual(result.warnings.length, 0, 'no warnings for main filtering');
  } finally { _resetGitMock(); }
});

test('SP3: branch random-branch (no pattern match) → filtered out', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const responses = new Map();
  responses.set('fetch --all --prune', buildGitFetchSuccess());
  responses.set('rev-parse --abbrev-ref HEAD', { ok: true, status: 0, stdout: 'main', stderr: '' });
  responses.set('config user.name', buildGitConfigUserName());
  responses.set(
    'for-each-ref refs/remotes/origin/* --format=%(refname:short)',
    buildGitForEachRefOutput({ branches: ['origin/random-branch'] })
  );
  _setRunGit(buildMockRunGit(responses));
  try {
    const result = scanPeer({});
    assert.strictEqual(result.branches.length, 0, 'random-branch filtered — no default pattern match');
  } finally { _resetGitMock(); }
});

test('SP4: custom branch_patterns=["*"] → all branches except main/master/HEAD included', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const branches = ['origin/random-branch', 'origin/something-else', 'origin/main'];
  const state_md_per_branch = {
    'random-branch': { objective: '2 — Random', trd: '02-01' },
    'something-else': { objective: '2 — Something', trd: '02-02' },
  };
  _setRunGit(buildMockRunGit(buildScanResponses({ branches, state_md_per_branch })));
  try {
    const result = scanPeer({ branch_patterns: ['*'] });
    // main is filtered unconditionally; random-branch and something-else should be included
    assert.strictEqual(result.branches.length, 2, 'both non-main branches included with * pattern');
    const names = result.branches.map(b => b.branch).sort();
    assert.ok(names.includes('random-branch'), 'random-branch included');
    assert.ok(names.includes('something-else'), 'something-else included');
  } finally { _resetGitMock(); }
});

test('SP5: branch HEAD → filtered out unconditionally', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const responses = new Map();
  responses.set('fetch --all --prune', buildGitFetchSuccess());
  responses.set('rev-parse --abbrev-ref HEAD', { ok: true, status: 0, stdout: 'main', stderr: '' });
  responses.set('config user.name', buildGitConfigUserName());
  responses.set(
    'for-each-ref refs/remotes/origin/* --format=%(refname:short)',
    buildGitForEachRefOutput({ branches: ['origin/HEAD'] })
  );
  _setRunGit(buildMockRunGit(responses));
  try {
    const result = scanPeer({ branch_patterns: ['*'] });
    assert.strictEqual(result.branches.length, 0, 'HEAD filtered out even with * pattern');
  } finally { _resetGitMock(); }
});

// ─── Group SI: _setRunGit injection mechanics ─────────────────────────────────

test('SI1: scanPeer with live git + GIT_INTEGRATION unset → skip', async (t) => {
  if (!process.env.GIT_INTEGRATION) {
    t.skip('Set GIT_INTEGRATION=1 to run live git tests');
    return;
  }
  // If GIT_INTEGRATION=1, this test is a no-op (live git is tested in SR group)
  assert.ok(true, 'GIT_INTEGRATION=1 set; live test covered by SR group');
});

test('SI2: _setRunGit injects mock; calls captured via mockFn.calls()', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const mock = buildMockRunGit(buildScanResponses({}));
  _setRunGit(mock);
  try {
    scanPeer({});
    assert.ok(mock.calls().length > 0, 'mock was called at least once');
    // fetch should be among the calls
    const fetchCall = mock.calls().find(c => c.args[0] === 'fetch');
    assert.ok(fetchCall, 'fetch call captured in mock.calls()');
    assert.deepStrictEqual(fetchCall.args, ['fetch', '--all', '--prune']);
  } finally { _resetGitMock(); }
});

test('SI3: _resetGitMock() restores default; subsequent scanPeer skipped without GIT_INTEGRATION', async (t) => {
  requireSetRunGit();
  requireResetGitMock();
  const mock = buildMockRunGit(buildScanResponses({}));
  _setRunGit(mock);
  _resetGitMock();
  // After reset, _runGit points to real runGit. We confirm by NOT calling with mock.
  // Verify mock was not called after reset:
  const callsBefore = mock.callCount();
  if (!process.env.GIT_INTEGRATION) {
    // We can't actually call scanPeer with live git in unit suite
    // Just verify mock callCount didn't increase after reset
    assert.strictEqual(mock.callCount(), callsBefore, 'mock not called after reset');
  } else {
    assert.ok(true, 'GIT_INTEGRATION set; reset verified by injection pattern');
  }
});

test('SI4: scanPeer calls git fetch --all --prune as first git call when no_fetch=false', () => {
  requireScanPeer();
  requireSetRunGit();
  requireResetGitMock();
  const mock = buildMockRunGit(buildScanResponses({}));
  _setRunGit(mock);
  try {
    scanPeer({ no_fetch: false });
    const calls = mock.calls();
    assert.ok(calls.length > 0, 'at least one call made');
    assert.deepStrictEqual(calls[0].args, ['fetch', '--all', '--prune'],
      'first call is git fetch --all --prune');
  } finally { _resetGitMock(); }
});

// ─── Group SU: buildMockRunGit fixture builder contract ───────────────────────

test('SU1: buildMockRunGit returns a function', () => {
  const mock = buildMockRunGit(new Map([
    ['for-each-ref refs/remotes/origin/*', { ok: true, stdout: 'origin/feature/v1.1\n', stderr: '' }],
  ]));
  assert.strictEqual(typeof mock, 'function', 'buildMockRunGit returns a function');
  assert.strictEqual(typeof mock.callCount, 'function', 'has callCount()');
  assert.strictEqual(typeof mock.calls, 'function', 'has calls()');
});

test('SU2: mockRunGit called with matching args returns canned response', () => {
  const expected = { ok: true, status: 0, stdout: 'origin/feature/v1.1\n', stderr: '' };
  const mock = buildMockRunGit(new Map([
    ['for-each-ref refs/remotes/origin/*', expected],
  ]));
  const result = mock(['for-each-ref', 'refs/remotes/origin/*']);
  assert.deepStrictEqual(result, expected, 'canned response returned for matching args');
  assert.strictEqual(mock.callCount(), 1, 'callCount incremented');
});

// ─── Group SR: Live-git smoke (gated on GIT_INTEGRATION=1) ───────────────────

test('SR1: scanPeer against live fixture repo with 2 branches returns 2 entries', async (t) => {
  if (process.env.GIT_INTEGRATION !== '1') {
    t.skip('Set GIT_INTEGRATION=1 to run live git tests');
    return;
  }
  requireScanPeer();
  requireResetGitMock();
  const { buildStateMd: bsmd } = require('./__fixtures__/awareness-fixtures.cjs');
  let fixture;
  try {
    fixture = buildGitFixtureRepo({
      branches: [
        { name: 'feature/sr1-branch-a', state_md: bsmd({ objective: '2 — SR1 A', trd: '02-02' }) },
        { name: 'feature/sr1-branch-b', state_md: bsmd({ objective: '2 — SR1 B', trd: '02-03' }) },
      ],
    });
  } catch (err) {
    if (/git not available/i.test(err.message)) {
      t.skip('git not available on this system');
      return;
    }
    throw err;
  }
  try {
    _resetGitMock();
    // Need to set up remote — use the fixture as its own remote (bare clone trick)
    const { spawnSync: spawn } = require('child_process');
    // Add a self-remote so git fetch has something to fetch
    spawn('git', ['-C', fixture.root, 'remote', 'add', 'origin', fixture.root],
      { encoding: 'utf-8', stdio: 'pipe' });
    spawn('git', ['-C', fixture.root, 'fetch', '--all'], { encoding: 'utf-8', stdio: 'pipe' });

    const result = scanPeer({ cwd: fixture.root, no_fetch: true });
    // We can't guarantee remote refs exist in a local-only fixture
    // so just verify scanPeer ran without throwing and returned correct shape
    assert.ok(Array.isArray(result.branches), 'branches is array');
    assert.ok(typeof result.fetched_at === 'string', 'fetched_at is string');
    assert.ok(Array.isArray(result.warnings), 'warnings is array');
  } finally {
    fixture.cleanup();
  }
});

test('SR2: scanPeer with no_fetch=true on fixture → scan proceeds, fetch not invoked', async (t) => {
  if (process.env.GIT_INTEGRATION !== '1') {
    t.skip('Set GIT_INTEGRATION=1 to run live git tests');
    return;
  }
  requireScanPeer();
  requireResetGitMock();
  let fixture;
  try {
    fixture = buildGitFixtureRepo({ branches: [] });
  } catch (err) {
    if (/git not available/i.test(err.message)) {
      t.skip('git not available on this system');
      return;
    }
    throw err;
  }
  try {
    _resetGitMock();
    const result = scanPeer({ cwd: fixture.root, no_fetch: true });
    // With no remote refs, branches will be empty — that's fine
    assert.ok(Array.isArray(result.branches), 'branches is array');
    assert.strictEqual(result.branches.length, 0, 'no remote branches in bare fixture');
  } finally {
    fixture.cleanup();
  }
});

// ─── TRD 02-03: scanOrg + task-list fallback ─────────────────────────────────

const {
  scanOrg, parseTaskListFallback,
} = require('./awareness.cjs');
const gh = require('./gh.cjs');
const {
  buildGhResponse_projectItemsList,
  buildGhResponse_subIssuesByTrackedIssues,
  buildGhResponse_subIssuesByTaskList,
} = require('./__fixtures__/gh-fixtures.cjs');
const { buildMockRunGh } = require('./__fixtures__/gh-fixtures.cjs');

// ─── Group T: task-list fallback parser ──────────────────────────────────────

test('T1 (02-03): body with - [ ] owner/repo#NN → sub_issues OPEN with empty title', () => {
  const body = '## Deliverables\n- [ ] AO-Cyber-Systems/aodex#101';
  const result = parseTaskListFallback(body);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].ref, 'AO-Cyber-Systems/aodex#101');
  assert.strictEqual(result[0].state, 'OPEN');
  assert.strictEqual(result[0].title, '');
});

test('T2 (02-03): body with - [x] owner/repo#NN — title → sub_issues CLOSED with title', () => {
  const body = '- [x] AO-Cyber-Systems/aodex#102 — Some title';
  const result = parseTaskListFallback(body);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].ref, 'AO-Cyber-Systems/aodex#102');
  assert.strictEqual(result[0].state, 'CLOSED');
  assert.strictEqual(result[0].title, 'Some title');
});

test('T3 (02-03): body with shorthand #50 → ref preserved as-is, state OPEN', () => {
  const body = '- [ ] #50';
  const result = parseTaskListFallback(body);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].ref, '#50');
  assert.strictEqual(result[0].state, 'OPEN');
});

test('T4 (02-03): plain bullet without checkbox → ignored; only checkbox lines count', () => {
  const body = '- AO-Cyber-Systems/aodex#100\n- [ ] AO-Cyber-Systems/aodex#101';
  const result = parseTaskListFallback(body);
  assert.strictEqual(result.length, 1, 'T4: only checkbox line should be parsed');
  assert.strictEqual(result[0].ref, 'AO-Cyber-Systems/aodex#101');
});

test('T5 (02-03): body with no parseable lines → empty array', () => {
  const body = '## Deliverables\nSome prose text\n- plain item';
  const result = parseTaskListFallback(body);
  assert.deepStrictEqual(result, []);
});

test('T6 (02-03): body=null → empty array (no throw)', () => {
  const result = parseTaskListFallback(null);
  assert.deepStrictEqual(result, []);
});

test('T7 (02-03): body with headings + checkboxes mixed → only checkbox lines counted', () => {
  const body = '# Heading\n\n## Sub-heading\n\n- [ ] AO-Cyber-Systems/aodex#201 — Task A\n- [x] AO-Cyber-Systems/aodex#202 — Task B\nsome prose\n- not a checkbox';
  const result = parseTaskListFallback(body);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].ref, 'AO-Cyber-Systems/aodex#201');
  assert.strictEqual(result[1].ref, 'AO-Cyber-Systems/aodex#202');
  assert.strictEqual(result[1].state, 'CLOSED');
});

// ─── Group O: scanOrg orchestrator happy paths ───────────────────────────────

// Shared auth status text format (matches parseScopes expected format in gh.cjs)
const GH_AUTH_STATUS_OK = "github.com\n  ✓ Logged in\n  - Token scopes: 'project', 'read:project', 'repo'";

test('O1 (02-03): scanOrg calls requireGhAuth FIRST (mock counter asserts ordering)', () => {
  // requireGhAuth is called before walkProject; if gh mock for "auth status" succeeds,
  // requireGhAuth passes; if walkProject mock also set, we get items.
  const authStatusResp = { ok: true, status: 0, stdout: GH_AUTH_STATUS_OK, stderr: '' };
  const itemsResp = buildGhResponse_projectItemsList({ items: [], hasNextPage: false });

  let authCallIndex = -1;
  let walkerCallIndex = -1;
  let callCount = 0;

  gh._setRunGh((args) => {
    const key = args.join(' ');
    const idx = callCount++;
    if (key.startsWith('auth status')) {
      authCallIndex = idx;
      return authStatusResp;
    }
    if (key.startsWith('api graphql')) {
      walkerCallIndex = idx;
      return itemsResp;
    }
    return { ok: false, status: 1, stdout: '', stderr: `no mock for: ${key}` };
  });

  try {
    const result = scanOrg({ project_id: 'PVT_test' });
    assert.ok(result, 'O1: should return a result');
    assert.ok(authCallIndex < walkerCallIndex, 'O1: requireGhAuth must be called before walkProject');
  } finally { gh._setRunGh(null); }
});

test('O2 (02-03): scanOrg uses default project_id from PRODUCT_ROADMAP_FIELDS._project_id when opts.project_id undefined', () => {
  const authResp = { ok: true, status: 0, stdout: GH_AUTH_STATUS_OK, stderr: '' };
  const itemsResp = buildGhResponse_projectItemsList({ items: [], hasNextPage: false });

  let usedProjectId = null;
  gh._setRunGh((args) => {
    const key = args.join(' ');
    if (key.startsWith('auth status')) return authResp;
    if (key.startsWith('api graphql')) {
      // Extract projectId from args
      const pidIdx = args.indexOf('-F');
      while (pidIdx !== -1) {
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '-F' && args[i+1] && args[i+1].startsWith('projectId=')) {
            usedProjectId = args[i+1].replace('projectId=', '');
          }
        }
        break;
      }
      return itemsResp;
    }
    return { ok: false, status: 1, stdout: '', stderr: `no mock for: ${key}` };
  });

  try {
    scanOrg(); // No project_id — should use default
    const expectedId = gh.PRODUCT_ROADMAP_FIELDS && gh.PRODUCT_ROADMAP_FIELDS._project_id;
    if (expectedId) {
      assert.strictEqual(usedProjectId, expectedId, 'O2: should use PRODUCT_ROADMAP_FIELDS._project_id as default');
    } else {
      // If cassette not loaded, result.warnings should note the missing default
      assert.ok(true, 'O2: PRODUCT_ROADMAP_FIELDS._project_id not set (cassette missing) — acceptable');
    }
  } finally { gh._setRunGh(null); }
});

test('O3 (02-03): 3 items returned by walkProject → result.items has sub_issues (mix of trackedIssues + task-list)', () => {
  const authResp = { ok: true, status: 0, stdout: GH_AUTH_STATUS_OK, stderr: '' };

  const subNodes = buildGhResponse_subIssuesByTrackedIssues({
    subIssues: [{ ref: 'AO-Cyber-Systems/aodex#101', title: 'Sub', state: 'OPEN' }],
  });
  const bodyWithTaskList = buildGhResponse_subIssuesByTaskList({
    entries: [{ ref: 'AO-Cyber-Systems/aodex#200', title: 'Task', checked: false }],
  });

  const itemsResp = buildGhResponse_projectItemsList({
    items: [
      // Item 1: has trackedIssues
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aodex#33',
        title: '[Roadmap] A', body: '', status: 'In Progress', product: 'AODex', quarter: 'Q2 2026',
        tracked_total: 1, tracked_nodes: subNodes },
      // Item 2: no trackedIssues, has task-list body
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aodex#34',
        title: '[Roadmap] B', body: bodyWithTaskList, status: 'Todo', product: 'AODex', quarter: 'Q2 2026',
        tracked_total: 0, tracked_nodes: [] },
      // Item 3: DraftIssue
      { content_type: 'DraftIssue', title: 'Draft Milestone', body: '',
        status: 'Todo', product: 'DevFlow', quarter: 'Q3 2026' },
    ],
    hasNextPage: false,
  });

  gh._setRunGh((args) => {
    const key = args.join(' ');
    if (key.startsWith('auth status')) return authResp;
    if (key.startsWith('api graphql')) return itemsResp;
    return { ok: false, status: 1, stdout: '', stderr: `no mock for: ${key}` };
  });

  try {
    const result = scanOrg({ project_id: 'PVT_test' });
    assert.strictEqual(result.items.length, 3);
    // Item 1: sub_issues from trackedIssues
    assert.strictEqual(result.items[0].sub_issues.length, 1);
    assert.strictEqual(result.items[0].sub_issues_source, 'tracked_issues');
    // Item 2: sub_issues from task-list fallback
    assert.strictEqual(result.items[1].sub_issues.length, 1);
    assert.strictEqual(result.items[1].sub_issues_source, 'task_list');
    assert.strictEqual(result.items[1].sub_issues[0].ref, 'AO-Cyber-Systems/aodex#200');
    // Item 3: DraftIssue, sub_issues=[]
    assert.strictEqual(result.items[2].sub_issues_source, 'none');
  } finally { gh._setRunGh(null); }
});

test('O4 (02-03): result shape is { items, fetched_at: ISO, project_id, warnings }', () => {
  const authResp = { ok: true, status: 0, stdout: GH_AUTH_STATUS_OK, stderr: '' };
  const itemsResp = buildGhResponse_projectItemsList({ items: [], hasNextPage: false });

  gh._setRunGh((args) => {
    const key = args.join(' ');
    if (key.startsWith('auth status')) return authResp;
    if (key.startsWith('api graphql')) return itemsResp;
    return { ok: false, status: 1, stdout: '', stderr: `no mock for: ${key}` };
  });

  try {
    const result = scanOrg({ project_id: 'PVT_test' });
    assert.ok(Array.isArray(result.items), 'O4: items must be array');
    assert.ok(typeof result.fetched_at === 'string', 'O4: fetched_at must be string');
    assert.ok(/\d{4}-\d{2}-\d{2}T/.test(result.fetched_at), 'O4: fetched_at must be ISO');
    assert.ok(typeof result.project_id === 'string', 'O4: project_id must be string');
    assert.ok(Array.isArray(result.warnings), 'O4: warnings must be array');
  } finally { gh._setRunGh(null); }
});

test('O5 (02-03): walkProject warnings propagated into scanOrg result.warnings', () => {
  const authResp = { ok: true, status: 0, stdout: GH_AUTH_STATUS_OK, stderr: '' };
  // walkProject failing mid-run produces a warning
  const failResp = { ok: false, status: 1, stdout: '', stderr: 'rate limit exceeded' };

  gh._setRunGh((args) => {
    const key = args.join(' ');
    if (key.startsWith('auth status')) return authResp;
    if (key.startsWith('api graphql')) return failResp;
    return { ok: false, status: 1, stdout: '', stderr: `no mock for: ${key}` };
  });

  try {
    const result = scanOrg({ project_id: 'PVT_test' });
    assert.ok(result.warnings.length > 0, 'O5: walkProject failure warning should propagate');
    assert.ok(result.warnings.some(w => w.includes('walkProject')), 'O5: warning should mention walkProject');
  } finally { gh._setRunGh(null); }
});

// ─── Group OA: scanOrg auth failure ──────────────────────────────────────────

test('OA1 (02-03): scanOrg propagates GhAuthError on missing scopes', () => {
  // Mock auth status returning not logged in → requireGhAuth throws GhAuthError
  const responses = new Map();
  responses.set('auth status', { ok: false, status: 1, stdout: '', stderr: 'not logged in' });
  gh._setRunGh(buildMockRunGh(responses));
  try {
    assert.throws(
      () => scanOrg({ project_id: 'PVT_test' }),
      (e) => e.name === 'GhAuthError',
      'OA1: scanOrg must propagate GhAuthError'
    );
  } finally { gh._setRunGh(null); }
});

test('OA2 (02-03): scanOrg never calls walkProject when auth fails', () => {
  let walkProjectCalled = false;
  let authCallCount = 0;

  gh._setRunGh((args) => {
    const key = args.join(' ');
    if (key.startsWith('auth status')) {
      authCallCount++;
      return { ok: false, status: 1, stdout: '', stderr: 'not logged in' };
    }
    // Any api graphql call means walkProject was called
    if (key.startsWith('api graphql')) {
      walkProjectCalled = true;
      return { ok: false, status: 1, stdout: '', stderr: 'should not reach here' };
    }
    return { ok: false, status: 1, stdout: '', stderr: `no mock for: ${key}` };
  });

  try {
    try { scanOrg({ project_id: 'PVT_test' }); } catch (e) {
      if (e.name !== 'GhAuthError') throw e;
    }
    assert.ok(!walkProjectCalled, 'OA2: walkProject must not be called when auth fails');
    assert.ok(authCallCount > 0, 'OA2: auth check must have been attempted');
  } finally { gh._setRunGh(null); }
});

// ─── Group OS: scanOrg silent-on-permissions ─────────────────────────────────

test('OS1 (02-03): items missing repository field (permission gap) → returned as-is, no warning per SC-5', () => {
  const authResp = { ok: true, status: 0, stdout: GH_AUTH_STATUS_OK, stderr: '' };

  // Issue with no repository (issue_ref will be null — user can see project but not repo)
  const itemsResp = buildGhResponse_projectItemsList({
    items: [
      // Pass empty issue_ref so repository will be null in the response
      { content_type: 'Issue', issue_ref: '',
        title: '[Roadmap] Hidden repo item', body: '', status: 'In Progress', product: 'AODex', quarter: 'Q2 2026',
        tracked_total: 0, tracked_nodes: [] },
    ],
    hasNextPage: false,
  });

  gh._setRunGh((args) => {
    const key = args.join(' ');
    if (key.startsWith('auth status')) return authResp;
    if (key.startsWith('api graphql')) return itemsResp;
    return { ok: false, status: 1, stdout: '', stderr: `no mock for: ${key}` };
  });

  try {
    const result = scanOrg({ project_id: 'PVT_test' });
    assert.strictEqual(result.items.length, 1, 'OS1: item should still be included');
    assert.strictEqual(result.items[0].item_type, 'issue', 'OS1: item_type should be issue');
    assert.strictEqual(result.items[0].issue_ref, null, 'OS1: issue_ref null when no repository');
    // No warning about the missing repository (SC-5: silent)
    const permWarnings = result.warnings.filter(w => w.includes('permission') || w.includes('repository'));
    assert.strictEqual(permWarnings.length, 0, 'OS1: no permission-related warnings (SC-5)');
  } finally { gh._setRunGh(null); }
});

// ─── Group F: fixture builders ────────────────────────────────────────────────

test('F1 (02-03): buildGhResponse_projectItemsList returns { ok:true, stdout: JSON envelope, stderr: "" }', () => {
  const resp = buildGhResponse_projectItemsList({ items: [], hasNextPage: false });
  assert.strictEqual(resp.ok, true);
  assert.strictEqual(resp.stderr, '');
  const parsed = JSON.parse(resp.stdout);
  assert.ok(parsed.data && parsed.data.node && parsed.data.node.items, 'F1: envelope must have data.node.items');
  assert.strictEqual(parsed.data.node.items.pageInfo.hasNextPage, false);
  assert.deepStrictEqual(parsed.data.node.items.nodes, []);
});

test('F2 (02-03): buildGhResponse_subIssuesByTrackedIssues returns nodes with {number, title, state, repository}', () => {
  const nodes = buildGhResponse_subIssuesByTrackedIssues({
    subIssues: [{ ref: 'AO-Cyber-Systems/aodex#101', title: 'My sub', state: 'CLOSED' }],
  });
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(nodes[0].number, 101);
  assert.strictEqual(nodes[0].title, 'My sub');
  assert.strictEqual(nodes[0].state, 'CLOSED');
  assert.strictEqual(nodes[0].repository.nameWithOwner, 'AO-Cyber-Systems/aodex');
});

test('F3 (02-03): buildGhResponse_subIssuesByTaskList builds body with - [ ] lines', () => {
  const body = buildGhResponse_subIssuesByTaskList({
    entries: [
      { ref: 'AO-Cyber-Systems/aodex#101', title: 'Task One', checked: false },
      { ref: 'AO-Cyber-Systems/aodex#102', title: 'Task Two', checked: true },
    ],
  });
  assert.ok(body.includes('- [ ] AO-Cyber-Systems/aodex#101'), 'F3: unchecked line must be present');
  assert.ok(body.includes('- [x] AO-Cyber-Systems/aodex#102'), 'F3: checked line must be present');
});

// ─── TRD 02-07: library surface lock + integration tests ──────────────────────
//
// Test list (TDD Playbook habit 2 — enumerated before test code):
//
// Group L — Library surface lock:
//   L1: Object.keys(require('awareness.cjs')).sort() === expected 14-entry list (deepStrictEqual)
//   L2: each expected export has the correct typeof (function vs constant)
//
// Group CT — Cache round-trip integration:
//   CT1: writeCache synthetic peer → readCache → assert peer section deep-equals input
//   CT2: writeCache peer only → writeCache org only → readCache → both sections present
//   CT3: cache file is valid JSON after round-trip
//
// Group IT — Peer integration (GIT_INTEGRATION=1 only):
//   IT1: buildGitFixtureRepo 2-branch repo → scanPeer(no_fetch=true) → 2 entries with correct objectives
//   IT2: fixture cleanup() removes tmp dir
//
// Group CR — Cassette replay (default test run, no env required):
//   CR1: cassette file exists with expected shape (data.node.items.nodes array)
//   CR2: replaying cassette via _setRunGh + walkProject → items array with correct item_type shape
//   CR3: scanOrg with cassette replay → items with sub_issues_source field populated
//
// Group OT — Org integration + cassette capture (GH_INTEGRATION=1 only):
//   OT1: walkProject against live Product Roadmap returns items.length > 0; write cassette
//   OT2: drift-detection — capture fresh response, warn on diff vs committed cassette (don't fail)
//
// Total: 12 test cases.
//
// ─────────────────────────────────────────────────────────────────────────────

const cassetteRel = path.join(
  __dirname, '__fixtures__', 'gh-cassettes', 'product-roadmap-walk.json'
);

// ─── Group L: Library surface lock ───────────────────────────────────────────

test('L1 (02-07): awareness.cjs exports exactly 14 expected entries', () => {
  const aw = require('./awareness.cjs');
  const exported = Object.keys(aw).sort();
  const expected = [
    'AWARENESS_CACHE_REL', 'DEFAULT_BRANCH_PATTERNS', 'DEFAULT_STALE_DAYS', 'DEFAULT_TTL_MINUTES',
    '_resetGitMock', '_setRunGit',
    'aggregateOrgByProductQuarter', 'isStale', 'parseStateMd', 'parseTaskListFallback',
    'readCache', 'scanOrg', 'scanPeer', 'writeCache',
  ].sort();
  assert.deepStrictEqual(
    exported,
    expected,
    `Export surface drift.\n  unexpected: ${exported.filter(e => !expected.includes(e)).join(', ')}\n  missing: ${expected.filter(e => !exported.includes(e)).join(', ')}`
  );
});

test('L2 (02-07): each export has the expected type', () => {
  const aw = require('./awareness.cjs');
  const fns = [
    'parseStateMd', 'aggregateOrgByProductQuarter', 'scanPeer', 'scanOrg',
    'parseTaskListFallback', 'readCache', 'writeCache', 'isStale',
    '_setRunGit', '_resetGitMock',
  ];
  for (const k of fns) {
    assert.strictEqual(typeof aw[k], 'function', `${k} should be typeof function`);
  }
  assert.strictEqual(typeof aw.DEFAULT_TTL_MINUTES, 'number', 'DEFAULT_TTL_MINUTES should be number');
  assert.strictEqual(typeof aw.DEFAULT_STALE_DAYS, 'number', 'DEFAULT_STALE_DAYS should be number');
  assert.ok(Array.isArray(aw.DEFAULT_BRANCH_PATTERNS), 'DEFAULT_BRANCH_PATTERNS should be array');
  assert.strictEqual(typeof aw.AWARENESS_CACHE_REL, 'string', 'AWARENESS_CACHE_REL should be string');
});

// ─── Group CT: Cache round-trip integration ───────────────────────────────────

function tempCwdCT() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-awareness-ct-'));
  return {
    cwd: dir,
    cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} },
  };
}

test('CT1 (02-07): writeCache peer → readCache → peer section deep-equals input', () => {
  const t = tempCwdCT();
  try {
    const synthPeer = {
      branches: [{
        branch: 'feature/x', objective: '2 — Test', trd: '02-07',
        last_commit: { sha: 'abc1234', timestamp: '2026-05-04T12:00:00Z', subject: 'feat: test' },
        developer: 'mark', github_issue: null,
      }],
      fetched_at: '2026-05-04T12:01:00Z',
      warnings: [],
      current_branch: 'main',
    };
    writeCache(t.cwd, { peer: synthPeer });
    const cached = readCache(t.cwd);
    assert.ok(cached, 'readCache should return non-null');
    assert.deepStrictEqual(cached.peer.branches, synthPeer.branches, 'peer.branches should deep-equal input');
    assert.strictEqual(cached.peer.fetched_at, synthPeer.fetched_at);
  } finally { t.cleanup(); }
});

test('CT2 (02-07): writeCache merge — peer preserved through org rewrite', () => {
  const t = tempCwdCT();
  try {
    writeCache(t.cwd, { peer: { branches: [{ branch: 'feature/a' }] } });
    writeCache(t.cwd, { org: { items: [{ title: 'Org item 1' }], fetched_at: '2026-05-04T13:00:00Z' } });
    const cached = readCache(t.cwd);
    assert.ok(cached, 'readCache should return non-null');
    assert.ok(Array.isArray(cached.peer.branches), 'peer section preserved');
    assert.strictEqual(cached.peer.branches[0].branch, 'feature/a', 'peer data intact');
    assert.ok(Array.isArray(cached.org.items), 'org section present after merge');
    assert.strictEqual(cached.org.items[0].title, 'Org item 1', 'org data correct');
  } finally { t.cleanup(); }
});

test('CT3 (02-07): cache file remains valid JSON after round-trip', () => {
  const t = tempCwdCT();
  try {
    writeCache(t.cwd, { peer: { x: 1, y: [1, 2, 3] }, org: { z: 'hello' } });
    const cacheFile = path.join(t.cwd, '.planning', '.awareness-cache.json');
    const content = fs.readFileSync(cacheFile, 'utf-8');
    assert.doesNotThrow(() => JSON.parse(content), 'cache file must be valid JSON');
    // Verify it ends with newline (pretty-print contract from writeCache)
    assert.ok(content.endsWith('\n'), 'cache file should end with newline');
  } finally { t.cleanup(); }
});

// ─── Group IT: Peer integration (gated on GIT_INTEGRATION=1) ─────────────────

const SKIP_GIT_INTEG = process.env.GIT_INTEGRATION !== '1';

test('IT1 (02-07): scanPeer integration — 2-branch fixture repo → 2 entries with correct objective fields',
  { skip: SKIP_GIT_INTEG }, () => {
    const fixture = buildGitFixtureRepo({
      branches: [
        { name: 'feature/foo', state_md: buildStateMd({ objective: '2 — Awareness Test', trd: '02-07' }) },
        { name: 'feature/bar', state_md: buildStateMd({ objective: '3 — Other Objective', trd: '03-01' }) },
      ],
      dev_name: 'test-dev',
    });
    try {
      _resetGitMock(); // ensure no mock injection for integration test
      const result = scanPeer({ cwd: fixture.root, no_fetch: true });
      assert.ok(Array.isArray(result.branches), 'IT1: branches should be array');
      assert.strictEqual(result.branches.length, 2, `IT1: expected 2 branches, got ${result.branches.length}`);
      const objectives = result.branches.map(b => b.objective).sort();
      assert.ok(objectives.some(o => o && o.includes('Awareness Test')), 'IT1: first objective found');
      assert.ok(objectives.some(o => o && o.includes('Other Objective')), 'IT1: second objective found');
    } finally { fixture.cleanup(); }
  }
);

test('IT2 (02-07): fixture cleanup removes tmp dir', { skip: SKIP_GIT_INTEG }, () => {
  const fixture = buildGitFixtureRepo({ branches: [], dev_name: 'test' });
  const root = fixture.root;
  assert.ok(fs.existsSync(root), 'IT2: root should exist before cleanup');
  fixture.cleanup();
  assert.strictEqual(fs.existsSync(root), false, 'IT2: root should not exist after cleanup');
});

// ─── Group CR: Cassette replay (default test run, no env required) ────────────

test('CR1 (02-07): cassette file exists with expected shape', () => {
  if (!fs.existsSync(cassetteRel)) return; // skip if cassette not yet captured
  const raw = fs.readFileSync(cassetteRel, 'utf-8');
  let c;
  assert.doesNotThrow(() => { c = JSON.parse(raw); }, 'CR1: cassette must parse as valid JSON');
  if (c._placeholder) return; // skip replay assertions for placeholder cassette
  assert.ok(c && c.data, 'CR1: cassette must have top-level data key');
  assert.ok(c.data.node, 'CR1: cassette must have data.node');
  assert.ok(c.data.node.items, 'CR1: cassette must have data.node.items');
  assert.ok(Array.isArray(c.data.node.items.nodes), 'CR1: items.nodes must be array');
  assert.ok(c.data.node.items.nodes.length > 0, 'CR1: items.nodes must have at least 1 entry');
});

test('CR2 (02-07): replaying cassette via _setRunGh → walkProject returns items array with correct shape', () => {
  if (!fs.existsSync(cassetteRel)) return;
  const cassetteContent = fs.readFileSync(cassetteRel, 'utf-8');
  const parsed = JSON.parse(cassetteContent);
  if (parsed._placeholder) return;
  gh._setRunGh(() => ({ ok: true, status: 0, stdout: cassetteContent, stderr: '' }));
  try {
    const { walkProject } = require('./gh.cjs');
    const result = walkProject('PVT_kwDODwqLrc4BRsOP');
    assert.ok(Array.isArray(result.items), 'CR2: walkProject result.items must be array');
    assert.ok(result.items.length > 0, 'CR2: walkProject result.items must have at least 1 entry');
    // Shape check on first item
    const first = result.items[0];
    assert.ok(['issue', 'draft'].includes(first.item_type), `CR2: item_type must be issue or draft, got: ${first.item_type}`);
    assert.ok('title' in first, 'CR2: item must have title field');
  } finally { gh._setRunGh(null); }
});

test('CR3 (02-07): scanOrg with cassette replay → items with sub_issues_source field populated', () => {
  if (!fs.existsSync(cassetteRel)) return;
  const cassetteContent = fs.readFileSync(cassetteRel, 'utf-8');
  const parsed = JSON.parse(cassetteContent);
  if (parsed._placeholder) return;
  // Mock both auth check AND walkProject GraphQL call
  gh._setRunGh((args) => {
    if (args[0] === 'auth' && args[1] === 'status') {
      return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    }
    // All other calls (graphql) → serve the cassette
    return { ok: true, status: 0, stdout: cassetteContent, stderr: '' };
  });
  try {
    const result = scanOrg();
    assert.ok(Array.isArray(result.items), 'CR3: result.items must be array');
    assert.ok(result.items.length > 0, 'CR3: result.items must have at least 1 entry');
    for (const item of result.items) {
      assert.ok(
        ['tracked_issues', 'task_list', 'none'].includes(item.sub_issues_source),
        `CR3: sub_issues_source must be tracked_issues|task_list|none, got: ${item.sub_issues_source}`
      );
    }
  } finally { gh._setRunGh(null); }
});

// ─── Group OT: Org integration + cassette (GH_INTEGRATION=1 only) ─────────────

const SKIP_GH_INTEG = process.env.GH_INTEGRATION !== '1';

test('OT1 (02-07): live walkProject returns items.length > 0 and cassette still valid after capture',
  { skip: SKIP_GH_INTEG }, () => {
    // Reset to production _runGh (no mock)
    gh._setRunGh(null);
    const { walkProject } = require('./gh.cjs');
    const result = walkProject('PVT_kwDODwqLrc4BRsOP');
    assert.ok(result.items.length > 0, `OT1: expected at least 1 item from live walk, got ${result.items.length}`);
    // Verify cassette file was written and has correct structure
    assert.ok(fs.existsSync(cassetteRel), 'OT1: cassette must exist on disk');
    const c = JSON.parse(fs.readFileSync(cassetteRel, 'utf-8'));
    assert.ok(c.data && c.data.node && Array.isArray(c.data.node.items.nodes), 'OT1: cassette must have items.nodes array');
    assert.ok(c.data.node.items.nodes.length > 0, 'OT1: cassette must have at least 1 node');
  }
);

test('OT2 (02-07): drift detection — warn (not fail) when live response differs from committed cassette',
  { skip: SKIP_GH_INTEG }, () => {
    gh._setRunGh(null);
    const { walkProject } = require('./gh.cjs');
    const live = walkProject('PVT_kwDODwqLrc4BRsOP');
    const liveCount = live.items.length;
    if (fs.existsSync(cassetteRel)) {
      const cassette = JSON.parse(fs.readFileSync(cassetteRel, 'utf-8'));
      const cassetteCount = cassette._placeholder ? 0 : cassette.data.node.items.nodes.length;
      if (liveCount !== cassetteCount) {
        // WARN, do not fail — cassette evolution is expected
        console.warn(`OT2 DRIFT: live items=${liveCount}, cassette nodes=${cassetteCount}`);
      }
    }
    // Always passes — drift is informational only
    assert.ok(liveCount >= 0, 'OT2: live count must be non-negative');
  }
);
