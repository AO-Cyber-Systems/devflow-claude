'use strict';

/**
 * Tests for awareness-cli.cjs pure helpers:
 *   - parseShowFlags(args)   — flag parser (pure)
 *   - renderMarkdown(sections, opts)  — markdown renderer (pure)
 *
 * TRD 02-05 standard type: tests + implementation in one feat commit.
 */

const test = require('node:test');
const assert = require('node:assert');
const { parseShowFlags, renderMarkdown } = require('./awareness-cli.cjs');

// ─── parseShowFlags tests ─────────────────────────────────────────────────────

test('parseShowFlags: empty args → all defaults', () => {
  const r = parseShowFlags([]);
  assert.strictEqual(r.peer_only, false, 'peer_only default false');
  assert.strictEqual(r.org_only, false, 'org_only default false');
  assert.strictEqual(r.refresh, null, 'refresh default null');
  assert.strictEqual(r.no_fetch, false, 'no_fetch default false');
  assert.strictEqual(r.quarter, null, 'quarter default null');
  assert.strictEqual(r.product, null, 'product default null');
  assert.deepStrictEqual(r.errors, [], 'errors empty');
});

test('parseShowFlags: --peer-only sets peer_only=true', () => {
  const r = parseShowFlags(['--peer-only']);
  assert.strictEqual(r.peer_only, true);
  assert.strictEqual(r.org_only, false);
  assert.deepStrictEqual(r.errors, []);
});

test('parseShowFlags: --org-only sets org_only=true', () => {
  const r = parseShowFlags(['--org-only']);
  assert.strictEqual(r.org_only, true);
  assert.strictEqual(r.peer_only, false);
  assert.deepStrictEqual(r.errors, []);
});

test('parseShowFlags: --no-fetch sets no_fetch=true', () => {
  const r = parseShowFlags(['--no-fetch']);
  assert.strictEqual(r.no_fetch, true);
});

test('parseShowFlags: --quarter Q2-2026 sets quarter', () => {
  const r = parseShowFlags(['--quarter', 'Q2-2026']);
  assert.strictEqual(r.quarter, 'Q2-2026');
  assert.deepStrictEqual(r.errors, []);
});

test('parseShowFlags: --product DevFlow sets product', () => {
  const r = parseShowFlags(['--product', 'DevFlow']);
  assert.strictEqual(r.product, 'DevFlow');
  assert.deepStrictEqual(r.errors, []);
});

test('parseShowFlags: --refresh alone → refresh=all', () => {
  const r = parseShowFlags(['--refresh']);
  assert.strictEqual(r.refresh, 'all');
  assert.deepStrictEqual(r.errors, []);
});

test('parseShowFlags: --refresh peer → refresh=peer', () => {
  const r = parseShowFlags(['--refresh', 'peer']);
  assert.strictEqual(r.refresh, 'peer');
  assert.deepStrictEqual(r.errors, []);
});

test('parseShowFlags: --refresh org → refresh=org', () => {
  const r = parseShowFlags(['--refresh', 'org']);
  assert.strictEqual(r.refresh, 'org');
  assert.deepStrictEqual(r.errors, []);
});

test('parseShowFlags: --refresh followed by another flag → refresh=all, flag consumed', () => {
  const r = parseShowFlags(['--refresh', '--peer-only']);
  assert.strictEqual(r.refresh, 'all', 'refresh should be all when next token is a flag');
  assert.strictEqual(r.peer_only, true, '--peer-only still consumed');
  assert.deepStrictEqual(r.errors, []);
});

test('parseShowFlags: --peer-only and --org-only together → error', () => {
  const r = parseShowFlags(['--peer-only', '--org-only']);
  assert.ok(r.errors.length > 0, 'should have at least one error');
  assert.ok(
    r.errors.some(e => e.includes('Cannot pass both')),
    'error should mention Cannot pass both'
  );
});

test('parseShowFlags: --quarter without value → error', () => {
  const r = parseShowFlags(['--quarter']);
  assert.ok(r.errors.length > 0, 'should have error for missing quarter value');
  assert.ok(r.errors.some(e => e.includes('--quarter requires a value')));
});

test('parseShowFlags: --product without value → error', () => {
  const r = parseShowFlags(['--product']);
  assert.ok(r.errors.length > 0, 'should have error for missing product value');
  assert.ok(r.errors.some(e => e.includes('--product requires a value')));
});

test('parseShowFlags: unknown flag → error', () => {
  const r = parseShowFlags(['--bogus-flag']);
  assert.ok(r.errors.length > 0, 'should have error for unknown flag');
  assert.ok(r.errors.some(e => e.includes('Unknown flag: --bogus-flag')));
});

test('parseShowFlags: mixed valid flags + no errors', () => {
  const r = parseShowFlags(['--peer-only', '--quarter', 'Q2-2026', '--no-fetch']);
  assert.strictEqual(r.peer_only, true);
  assert.strictEqual(r.quarter, 'Q2-2026');
  assert.strictEqual(r.no_fetch, true);
  assert.deepStrictEqual(r.errors, []);
});

// ─── renderMarkdown tests ─────────────────────────────────────────────────────

test('renderMarkdown: empty sections → header line present', () => {
  const md = renderMarkdown({});
  assert.match(md, /# DevFlow awareness/);
});

test('renderMarkdown: no peer section → no peer heading', () => {
  const md = renderMarkdown({ org: null });
  assert.doesNotMatch(md, /## Peer activity/);
});

test('renderMarkdown: peer with 1 branch renders correctly', () => {
  const md = renderMarkdown({
    peer: {
      branches: [{
        branch: 'feature/foo',
        objective: '2 — Cross-repo awareness',
        trd: '02-05',
        last_commit: { timestamp: '2026-05-04T12:00:00Z', sha: 'abc123', subject: 'add cli' },
        developer: 'mark',
        github_issue: 'AO-Cyber-Systems/devflow-claude#15',
      }],
    },
  });
  assert.match(md, /## Peer activity/);
  assert.match(md, /feature\/foo/);
  assert.match(md, /by mark/);
  assert.match(md, /2 — Cross-repo awareness/);
  assert.match(md, /TRD 02-05/);
  assert.match(md, /AO-Cyber-Systems\/devflow-claude#15/);
  assert.match(md, /2026-05-04T12:00:00Z/);
});

test('renderMarkdown: peer section always shows stale=invisible footer', () => {
  const md = renderMarkdown({ peer: { branches: [] } });
  assert.match(md, /Stale = invisible/);
  assert.match(md, /30 days/);
});

test('renderMarkdown: peer section with no branches shows placeholder', () => {
  const md = renderMarkdown({ peer: { branches: [] } });
  assert.match(md, /No active branches found/);
});

test('renderMarkdown: peer-only mode hides org section', () => {
  const md = renderMarkdown(
    {
      peer: { branches: [] },
      org: { items: [{ product: 'DevFlow', quarter: 'Q2 2026', title: 'X', issue_ref: 'a/b#1' }] },
    },
    { peer_only: true }
  );
  assert.match(md, /## Peer activity/);
  assert.doesNotMatch(md, /## Org progress/);
});

test('renderMarkdown: org-only mode hides peer section', () => {
  const md = renderMarkdown(
    {
      peer: { branches: [{ branch: 'feature/bar', last_commit: { timestamp: '2026-05-04T00:00:00Z' } }] },
      org: { items: [] },
    },
    { org_only: true }
  );
  assert.match(md, /## Org progress/);
  assert.doesNotMatch(md, /## Peer activity/);
});

test('renderMarkdown: org with 1 item renders product/quarter grouping', () => {
  const md = renderMarkdown({
    org: {
      items: [{
        product: 'DevFlow',
        quarter: 'Q2 2026',
        title: 'Internal Alpha',
        issue_ref: 'AO-Cyber-Systems/devflow#30',
        status: 'In Progress',
        sub_issues: [
          { ref: 'AO-Cyber-Systems/devflow-claude#10', title: 'GH layer', state: 'CLOSED' },
          { ref: 'AO-Cyber-Systems/devflow-claude#11', title: 'Awareness', state: 'OPEN' },
        ],
      }],
    },
  });
  assert.match(md, /## Org progress/);
  assert.match(md, /### DevFlow/);
  assert.match(md, /\*\*Q2 2026\*\*/);
  assert.match(md, /Internal Alpha/);
  assert.match(md, /\[In Progress\]/);
  assert.match(md, /\[x\] AO-Cyber-Systems\/devflow-claude#10/);
  assert.match(md, /\[ \] AO-Cyber-Systems\/devflow-claude#11/);
});

test('renderMarkdown: --quarter filter — Q2 items shown, Q3 filtered', () => {
  const md = renderMarkdown(
    {
      org: {
        items: [
          { product: 'DevFlow', quarter: 'Q2 2026', title: 'Q2 work', issue_ref: 'a/b#1' },
          { product: 'AODex', quarter: 'Q3 2026', title: 'Q3 work', issue_ref: 'a/b#2' },
        ],
      },
    },
    { quarter: 'Q2-2026' }
  );
  assert.match(md, /Q2 work/);
  assert.doesNotMatch(md, /Q3 work/);
});

test('renderMarkdown: --quarter filter normalizes dash/space', () => {
  // "Q2-2026" filter should match "Q2 2026" item
  const md = renderMarkdown(
    { org: { items: [{ product: 'DevFlow', quarter: 'Q2 2026', title: 'Alpha', issue_ref: 'a/b#1' }] } },
    { quarter: 'Q2-2026' }
  );
  assert.match(md, /Alpha/, 'dash-normalized quarter filter should match space-separated item');
});

test('renderMarkdown: --product filter (exact match, case-insensitive)', () => {
  const md = renderMarkdown(
    {
      org: {
        items: [
          { product: 'DevFlow', quarter: 'Q2 2026', title: 'DF item', issue_ref: 'a/b#1' },
          { product: 'AODex', quarter: 'Q2 2026', title: 'AODex item', issue_ref: 'a/b#2' },
        ],
      },
    },
    { product: 'devflow' }
  );
  assert.match(md, /DF item/);
  assert.doesNotMatch(md, /AODex item/);
});

test('renderMarkdown: zero items after filter shows placeholder', () => {
  const md = renderMarkdown(
    { org: { items: [{ product: 'AODex', quarter: 'Q3 2026', title: 'B', issue_ref: 'a/b#2' }] } },
    { quarter: 'Q1-2026' }
  );
  assert.match(md, /No items match the filters/);
});

test('renderMarkdown: warnings from peer + org both shown', () => {
  const md = renderMarkdown({
    peer: { branches: [], warnings: ['git fetch failed: timeout'] },
    org: { items: [], warnings: ['org auth failed: missing scopes'] },
  });
  assert.match(md, /## Warnings/);
  assert.match(md, /git fetch failed: timeout/);
  assert.match(md, /org auth failed: missing scopes/);
});

test('renderMarkdown: branches sorted DESC by last_commit.timestamp', () => {
  const md = renderMarkdown({
    peer: {
      branches: [
        {
          branch: 'feature/old',
          objective: 'old',
          last_commit: { timestamp: '2026-04-01T00:00:00Z', sha: 'a', subject: 'x' },
        },
        {
          branch: 'feature/new',
          objective: 'new',
          last_commit: { timestamp: '2026-05-04T00:00:00Z', sha: 'b', subject: 'y' },
        },
      ],
    },
  });
  const oldPos = md.indexOf('feature/old');
  const newPos = md.indexOf('feature/new');
  assert.ok(newPos < oldPos, 'newer branch should appear before older branch (DESC sort)');
});
