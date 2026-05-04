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
