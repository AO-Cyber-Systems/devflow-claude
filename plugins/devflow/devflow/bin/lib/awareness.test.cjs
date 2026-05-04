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
