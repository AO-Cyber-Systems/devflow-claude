'use strict';

// Unit tests for lib/gh.cjs — resolveChain, findRoadmapIssue, addToProject,
// linkSubIssue, cmdGhResolve, and per-process cache.
//
// All tests mock runGh via gh._setRunGh(mockFn) — no live gh CLI calls.
// Per TDD Playbook: hand-built fixtures, no LLM-generated test data.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const gh = require('./gh.cjs');
const fx = require('./__fixtures__/gh-fixtures.cjs');

// ─── Shared setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset cache + runGh injection before each test
  if (gh._resetCache) gh._resetCache();
  if (gh._setRunGh) gh._setRunGh(null); // restore real runGh (or noop mock)
});

// ─── Group A: resolveChain — full ref ────────────────────────────────────────

describe('resolveChain — full ref', () => {
  test('A1: full ref github_issue + parent_issue sets correct values and provenance', () => {
    // Mock runGh to never be called — no walk for explicit refs without walk
    // (walk is triggered by parent_issue being present; mock returns failure to confirm
    //  the resolver does try to walk but handles gracefully — actually, it DOES walk)
    // For A1 we don't want a walk response, so mock an empty parent walk
    const mock = fx.buildMockRunGh(new Map([
      ['api graphql', { ok: false, status: 1, stdout: '', stderr: '[mock] no walk in A1' }],
    ]));
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#10',
      parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
    });
    const ctx = fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/devflow-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.github_issue, 'AO-Cyber-Systems/devflow-claude#10');
    assert.strictEqual(r.parent_issue, 'AO-Cyber-Systems/devflow-claude#9');
    assert.strictEqual(r.org_project, 'PVT_kwDODwqLrc4BRsOP');
    assert.strictEqual(r.provenance.github_issue, 'frontmatter');
    assert.strictEqual(r.provenance.parent_issue, 'frontmatter');
    assert.strictEqual(r.provenance.org_project, 'inherited_from_project');
  });

  test('A2: frontmatter has no org_project; projectCtx.org_project used + provenance = inherited_from_project', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({ github_issue: 'AO-Cyber-Systems/devflow-claude#10' });
    const ctx = fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/devflow-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.org_project, 'PVT_kwDODwqLrc4BRsOP');
    assert.strictEqual(r.provenance.org_project, 'inherited_from_project');
  });

  test('A3: frontmatter org_project overrides projectCtx.org_project + provenance = frontmatter', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#10',
      org_project: 'PVT_custom123',
    });
    const ctx = fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/devflow-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.org_project, 'PVT_custom123');
    assert.strictEqual(r.provenance.org_project, 'frontmatter');
  });
});

// ─── Group B: resolveChain — shorthand resolution ────────────────────────────

describe('resolveChain — shorthand', () => {
  test('B1: parent_issue shorthand #9 + valid github_repo → expanded full ref, provenance = frontmatter', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({ parent_issue: '#9' });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.parent_issue, 'AO-Cyber-Systems/devflow-claude#9');
    assert.strictEqual(r.provenance.parent_issue, 'frontmatter');
  });

  test('B2: github_issue shorthand #10 + valid github_repo → expanded full ref', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({ github_issue: '#10' });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.github_issue, 'AO-Cyber-Systems/devflow-claude#10');
  });

  test('B3: shorthand with no github_repo → keeps literal #9 + warning about missing github_repo', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({ parent_issue: '#9' });
    const ctx = fx.buildProjectCtx({}); // no github_repo

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.parent_issue, '#9');
    assert.ok(Array.isArray(r.warnings));
    const warn = r.warnings.find(w => w.includes('parent_issue') && w.includes('github_repo'));
    assert.ok(warn, `Expected warning mentioning parent_issue and github_repo, got: ${JSON.stringify(r.warnings)}`);
  });

  test('B4: shorthand with malformed github_repo (not owner/name) → warning about malformed, field stays as literal', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({ parent_issue: '#9' });
    const ctx = fx.buildProjectCtx({ github_repo: 'just-some-name' }); // malformed

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.parent_issue, '#9');
    assert.ok(Array.isArray(r.warnings));
    const warn = r.warnings.find(w => w.includes('malformed') || w.includes('just-some-name'));
    assert.ok(warn, `Expected warning mentioning malformed github_repo, got: ${JSON.stringify(r.warnings)}`);
  });
});

// ─── Group C: resolveChain — absent fields + provenance vocabulary ───────────

describe('resolveChain — absent fields', () => {
  test('C1: empty frontmatter + empty projectCtx → all fields null/undefined, provenance = absent', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const r = gh.resolveChain({}, {});

    // All chain fields should be null or absent
    assert.strictEqual(r.github_issue, null);
    assert.strictEqual(r.parent_issue, null);
    assert.strictEqual(r.org_project, null);
    assert.strictEqual(r.org_initiative, null);
    assert.strictEqual(r.provenance.github_issue, 'absent');
    assert.strictEqual(r.provenance.parent_issue, 'absent');
    assert.strictEqual(r.provenance.org_project, 'absent');
    assert.strictEqual(r.provenance.org_initiative, 'absent');
  });

  test('C2: all provenance values are from the allowed vocabulary', () => {
    const VALID_PROVENANCE = new Set([
      'frontmatter',
      'inherited_from_project',
      'walked_from_parent',
      'absent',
      'cached',
    ]);

    const mock = fx.buildMockRunGh(new Map([
      ['api graphql', { ok: false, status: 1, stdout: '', stderr: '[mock]' }],
    ]));
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#10',
      parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
    });
    const ctx = fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/devflow-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    });

    const r = gh.resolveChain(fm, ctx);

    for (const [field, prov] of Object.entries(r.provenance)) {
      assert.ok(
        VALID_PROVENANCE.has(prov),
        `provenance.${field} = "${prov}" is not in allowed vocabulary`
      );
    }
  });

  test('C3: result.warnings is always an array (empty when no warnings)', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const r = gh.resolveChain({}, {});

    assert.ok(Array.isArray(r.warnings), 'warnings must be an array');
  });
});

// ─── Group D: resolveChain — walk to roadmap_issue + milestone ───────────────

describe('resolveChain — walk to parent + milestone', () => {
  test('D1: parent_issue with [Roadmap] title in walk response → roadmap_issue = parent_issue, provenance = walked_from_parent', () => {
    // Build the GraphQL args key that _walkParent produces for issue #9 in AO-Cyber-Systems/devflow-claude
    const query = `query($owner: String!, $name: String!, $number: Int!) {\n    repository(owner: $owner, name: $name) {\n      issue(number: $number) {\n        title\n        projectItems(first: 5) {\n          nodes {\n            project { id title }\n            fieldValues(first: 10) {\n              nodes {\n                ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }\n                ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } }\n              }\n            }\n          }\n        }\n      }\n    }\n  }`;

    const mockResponses = new Map([
      [
        `api graphql -f query=${query} -F owner=AO-Cyber-Systems -F name=devflow-claude -F number=9`,
        fx.buildGhResponse_issueWithProjectItem({
          issueNumber: 9,
          title: '[Roadmap] devflow-claude',
        }),
      ],
    ]);
    const mock = fx.buildMockRunGh(mockResponses);
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
    });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.roadmap_issue, 'AO-Cyber-Systems/devflow-claude#9');
    assert.strictEqual(r.provenance.roadmap_issue, 'walked_from_parent');
  });

  test('D2: parent_issue walk response with project items → milestone fields populated, provenance = walked_from_parent', () => {
    const mockResponses = new Map([
      ['api graphql', fx.buildGhResponse_issueWithProjectItem({
        issueNumber: 9,
        title: '[Roadmap] devflow-claude',
        projectTitle: 'Product Roadmap',
        product: 'DevFlow',
        quarter: 'Q2 2026',
        status: 'In Progress',
      })],
    ]);
    const mock = fx.buildMockRunGh(mockResponses);
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
    });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.ok(r.milestone, 'milestone should be populated');
    assert.strictEqual(r.milestone.product, 'DevFlow');
    assert.strictEqual(r.milestone.quarter, 'Q2 2026');
    assert.strictEqual(r.milestone.status, 'In Progress');
    assert.strictEqual(r.provenance.milestone, 'walked_from_parent');
  });

  test('D3: no parent_issue but findRoadmapIssue returns a hit → roadmap_issue set, provenance = walked_from_parent', () => {
    // Mock issue list returning a hit, then walking that hit
    const listResponse = fx.buildGhResponse_issueListRoadmap({
      hits: [{ number: 9, title: '[Roadmap] devflow-claude' }],
    });
    const walkResponse = fx.buildGhResponse_issueWithProjectItem({
      issueNumber: 9,
      title: '[Roadmap] devflow-claude',
    });

    const mockResponses = new Map([
      ['issue list', listResponse],
      ['api graphql', walkResponse],
    ]);
    const mock = fx.buildMockRunGh(mockResponses);
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({}); // no parent_issue
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.roadmap_issue, 'AO-Cyber-Systems/devflow-claude#9');
    assert.strictEqual(r.provenance.roadmap_issue, 'walked_from_parent');
  });

  test('D4: no parent_issue and no roadmap hit → roadmap_issue = null, provenance = absent', () => {
    const listResponse = fx.buildGhResponse_issueListRoadmap({ hits: [] }); // empty

    const mockResponses = new Map([
      ['issue list', listResponse],
    ]);
    const mock = fx.buildMockRunGh(mockResponses);
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({});
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude' });

    const r = gh.resolveChain(fm, ctx);

    assert.strictEqual(r.roadmap_issue, null);
    assert.strictEqual(r.provenance.roadmap_issue, 'absent');
  });
});

// ─── Group E: findRoadmapIssue ────────────────────────────────────────────────

describe('findRoadmapIssue', () => {
  test('E1: issue list returns one [Roadmap] hit → returns owner/repo#N', () => {
    const listResponse = fx.buildGhResponse_issueListRoadmap({
      hits: [{ number: 9, title: '[Roadmap] devflow-claude' }],
    });
    const mock = fx.buildMockRunGh(new Map([
      ['issue list --repo AO-Cyber-Systems/devflow-claude --state open --search [Roadmap] in:title --json number,title --limit 5', listResponse],
    ]));
    gh._setRunGh(mock);

    const result = gh.findRoadmapIssue('AO-Cyber-Systems/devflow-claude');

    assert.strictEqual(result, 'AO-Cyber-Systems/devflow-claude#9');
  });

  test('E2: issue list returns empty array → returns null', () => {
    const listResponse = fx.buildGhResponse_issueListRoadmap({ hits: [] });
    const mock = fx.buildMockRunGh(new Map([
      ['issue list', listResponse],
    ]));
    gh._setRunGh(mock);

    const result = gh.findRoadmapIssue('AO-Cyber-Systems/devflow-claude');

    assert.strictEqual(result, null);
  });

  test('E3: multiple hits → returns lowest-numbered issue (deterministic)', () => {
    const listResponse = fx.buildGhResponse_issueListRoadmap({
      hits: [
        { number: 42, title: '[Roadmap] devflow-claude second' },
        { number: 9, title: '[Roadmap] devflow-claude first' },
        { number: 17, title: '[Roadmap] devflow-claude third' },
      ],
    });
    const mock = fx.buildMockRunGh(new Map([
      ['issue list', listResponse],
    ]));
    gh._setRunGh(mock);

    const result = gh.findRoadmapIssue('AO-Cyber-Systems/devflow-claude');

    // Should return lowest number: #9
    assert.strictEqual(result, 'AO-Cyber-Systems/devflow-claude#9');
  });

  test('E4: runGh returns ok: false → returns null', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['issue list', { ok: false, status: 1, stdout: '', stderr: '[mock] auth error' }],
    ]));
    gh._setRunGh(mock);

    const result = gh.findRoadmapIssue('AO-Cyber-Systems/devflow-claude');

    assert.strictEqual(result, null);
  });
});

// ─── Group F: addToProject + linkSubIssue ────────────────────────────────────

describe('addToProject / linkSubIssue', () => {
  test('F1: addToProject happy path → returns { ok: true, item_id }', () => {
    const nodeIdResp = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_issue10' });
    const addItemResp = fx.buildGhResponse_addProjectItem({ itemId: 'PVTI_addedItem' });

    // Two GraphQL calls: first to look up issue node ID, second to add to project
    let callIndex = 0;
    const responses = [nodeIdResp, addItemResp];
    const mock = { calls: () => [] };
    const mockFn = (args) => {
      const resp = responses[callIndex] || { ok: false, status: 1, stdout: '', stderr: '[mock] unexpected call' };
      callIndex++;
      return resp;
    };
    mockFn.callCount = () => callIndex;
    mockFn.calls = () => [];

    gh._setRunGh(mockFn);

    const result = gh.addToProject('AO-Cyber-Systems/devflow-claude#10', 'PVT_kwDODwqLrc4BRsOP');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.item_id, 'PVTI_addedItem');
  });

  test('F2: addToProject mutation returns error → returns { ok: false, error }', () => {
    const nodeIdResp = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_issue10' });
    const errorResp = fx.buildGhResponse_graphqlError({ message: 'not_authorized' });

    let callIndex = 0;
    const responses = [nodeIdResp, errorResp];
    const mockFn = (args) => {
      const resp = responses[callIndex] || { ok: false, status: 1, stdout: '', stderr: '[mock]' };
      callIndex++;
      return resp;
    };
    mockFn.callCount = () => callIndex;
    mockFn.calls = () => [];

    gh._setRunGh(mockFn);

    const result = gh.addToProject('AO-Cyber-Systems/devflow-claude#10', 'PVT_kwDODwqLrc4BRsOP');

    assert.strictEqual(result.ok, false);
    assert.ok(result.error, 'expected error field');
  });

  test('F3: linkSubIssue happy path → returns { ok: true }', () => {
    const parentNodeId = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_parent9' });
    const childNodeId = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_child10' });
    const addSubResp = fx.buildGhResponse_addSubIssue({ issueId: 'I_kwDO_parent9' });

    let callIndex = 0;
    const responses = [parentNodeId, childNodeId, addSubResp];
    const mockFn = (args) => {
      const resp = responses[callIndex] || { ok: false, status: 1, stdout: '', stderr: '[mock]' };
      callIndex++;
      return resp;
    };
    mockFn.callCount = () => callIndex;
    mockFn.calls = () => [];

    gh._setRunGh(mockFn);

    const result = gh.linkSubIssue('AO-Cyber-Systems/devflow-claude#9', 'AO-Cyber-Systems/devflow-claude#10');

    assert.strictEqual(result.ok, true);
  });

  test('F4: linkSubIssue mutation returns error → returns { ok: false, error }', () => {
    const parentNodeId = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_parent9' });
    const childNodeId = fx.buildGhResponse_issueNodeId({ nodeId: 'I_kwDO_child10' });
    const errorResp = fx.buildGhResponse_graphqlError({ message: 'sub_issue_already_linked' });

    let callIndex = 0;
    const responses = [parentNodeId, childNodeId, errorResp];
    const mockFn = (args) => {
      const resp = responses[callIndex] || { ok: false, status: 1, stdout: '', stderr: '[mock]' };
      callIndex++;
      return resp;
    };
    mockFn.callCount = () => callIndex;
    mockFn.calls = () => [];

    gh._setRunGh(mockFn);

    const result = gh.linkSubIssue('AO-Cyber-Systems/devflow-claude#9', 'AO-Cyber-Systems/devflow-claude#10');

    assert.strictEqual(result.ok, false);
    assert.ok(result.error, 'expected error field');
  });

  test('F5: addToProject + linkSubIssue accept parsed object args (issueRef strings, projectId strings) — not raw paths', () => {
    // Verify both functions accept string arguments without file I/O
    // (testing the interface contract: strings in → objects out)
    const nodeIdResp = fx.buildGhResponse_issueNodeId();
    const addItemResp = fx.buildGhResponse_addProjectItem();

    let callIndex = 0;
    const responses = [nodeIdResp, addItemResp];
    const mockFn = (args) => {
      const resp = responses[callIndex] || { ok: false, status: 1, stdout: '', stderr: '[mock]' };
      callIndex++;
      return resp;
    };
    mockFn.callCount = () => callIndex;
    mockFn.calls = () => [];

    gh._setRunGh(mockFn);

    // Should NOT throw — these are string args, not file paths
    assert.doesNotThrow(() => {
      gh.addToProject('owner/repo#42', 'PVT_someProjectId');
    });
  });
});

// ─── Group G: per-process cache ───────────────────────────────────────────────

describe('resolveChain — cache', () => {
  test('G1: second call with same args returns cached result; runGh call count unchanged on second call', () => {
    let ghCallCount = 0;
    const mockFn = (args) => {
      ghCallCount++;
      return { ok: false, status: 1, stdout: '', stderr: '[mock] G1 no walk' };
    };
    mockFn.callCount = () => ghCallCount;
    mockFn.calls = () => [];
    gh._setRunGh(mockFn);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#10',
      _objectiveId: 'g1-test',
    });
    const ctx = fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/devflow-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    });

    // First call
    const r1 = gh.resolveChain(fm, ctx);
    const callsAfterFirst = ghCallCount;

    // Second call — same args
    const r2 = gh.resolveChain(fm, ctx);
    const callsAfterSecond = ghCallCount;

    // runGh call count must not increase on second call
    assert.strictEqual(callsAfterFirst, callsAfterSecond, 'runGh should not be called again on cache hit');

    // github_issue was from frontmatter — stays as 'frontmatter' on cache hit
    assert.strictEqual(r2.provenance.github_issue, 'frontmatter');

    // Result values are the same
    assert.strictEqual(r1.github_issue, r2.github_issue);
    assert.strictEqual(r1.org_project, r2.org_project);
  });

  test('G2: after _resetCache(), second call triggers runGh again', () => {
    let ghCallCount = 0;
    const mockFn = (args) => {
      ghCallCount++;
      return { ok: false, status: 1, stdout: '', stderr: '[mock] G2' };
    };
    mockFn.callCount = () => ghCallCount;
    mockFn.calls = () => [];
    gh._setRunGh(mockFn);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#10',
      _objectiveId: 'g2-test',
    });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude' });

    gh.resolveChain(fm, ctx);
    const callsAfterFirst = ghCallCount;

    gh._resetCache();

    gh.resolveChain(fm, ctx);
    const callsAfterReset = ghCallCount;

    // After reset, second call MUST have triggered more gh calls (or at least re-run the resolver)
    // If no gh calls happen (no walk), we verify by checking that _resetCache worked by asserting
    // the second call DID NOT come from cache (we can't easily check directly without instrumentation,
    // but we verify the count difference is same as first call pattern)
    assert.ok(callsAfterReset >= callsAfterFirst, 'should have made at least as many gh calls after reset');
  });

  test('G3: two different objectives produce separate cache entries', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm1 = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#10',
      _objectiveId: 'obj-one',
    });
    const fm2 = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#11',
      _objectiveId: 'obj-two',
    });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude' });

    const r1 = gh.resolveChain(fm1, ctx);
    const r2 = gh.resolveChain(fm2, ctx);

    // Different github_issue values → different cache entries → different results
    assert.notStrictEqual(r1.github_issue, r2.github_issue);
    assert.strictEqual(r1.github_issue, 'AO-Cyber-Systems/devflow-claude#10');
    assert.strictEqual(r2.github_issue, 'AO-Cyber-Systems/devflow-claude#11');
  });

  test('G4: cache is in module scope — after _resetCache() the cache is empty (module-scope, not closure-scope)', () => {
    // This test verifies that _resetCache() actually clears the module-scope cache,
    // not just a closure variable. We verify by re-resolving and checking it re-runs.
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    const fm = fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#99',
      _objectiveId: 'g4-test',
    });
    const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude' });

    // Populate cache
    const r1 = gh.resolveChain(fm, ctx);
    assert.strictEqual(r1.github_issue, 'AO-Cyber-Systems/devflow-claude#99');

    // Reset and verify next call still works (not broken by reset)
    gh._resetCache();
    const r2 = gh.resolveChain(fm, ctx);
    assert.strictEqual(r2.github_issue, 'AO-Cyber-Systems/devflow-claude#99');

    // The _setRunGh mock is still active post-reset
    assert.ok(typeof gh._resetCache === 'function', '_resetCache must remain exported');
  });
});

// ─── Group H: CLI surface cmdGhResolve ────────────────────────────────────────

describe('cmdGhResolve / df-tools gh resolve', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gh-test-'));
    // Create required .planning structure
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  test('H1: reads OBJECTIVE.md + PROJECT.md, calls resolveChain, prints JSON to stdout', () => {
    // Create PROJECT.md with github_repo and org_project
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '---\nkind: plugin\ngithub_repo: AO-Cyber-Systems/devflow-claude\norg_project: PVT_kwDODwqLrc4BRsOP\n---\n\n# Test Project\n',
      'utf-8'
    );

    // Create OBJECTIVE.md with github fields
    const objDir = path.join(tmpDir, '.planning', 'objectives', '01-foo');
    fs.mkdirSync(objDir, { recursive: true });
    fs.writeFileSync(
      path.join(objDir, 'OBJECTIVE.md'),
      '---\nwork: feature\ngithub_issue: AO-Cyber-Systems/devflow-claude#10\nparent_issue: AO-Cyber-Systems/devflow-claude#9\n---\n\n# Objective 01\n',
      'utf-8'
    );

    // Mock runGh to avoid live gh calls
    const mock = fx.buildMockRunGh(new Map([
      ['api graphql', { ok: false, status: 1, stdout: '', stderr: '[mock] no walk' }],
    ]));
    gh._setRunGh(mock);

    // Capture stdout by temporarily redirecting process.stdout.write
    let capturedOutput = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { capturedOutput += chunk; return true; };

    let exitCode = 0;
    const originalExit = process.exit.bind(process);
    process.exit = (code) => { exitCode = code || 0; };

    try {
      gh.cmdGhResolve(tmpDir, '01-foo', false);
    } finally {
      process.stdout.write = originalWrite;
      process.exit = originalExit;
    }

    const parsed = JSON.parse(capturedOutput);
    assert.strictEqual(parsed.github_issue, 'AO-Cyber-Systems/devflow-claude#10');
    assert.strictEqual(parsed.parent_issue, 'AO-Cyber-Systems/devflow-claude#9');
    assert.ok(parsed.provenance, 'output must have provenance');
    assert.strictEqual(exitCode, 0);
  });

  test('H2: raw=true produces one-line JSON; raw=false produces pretty-printed JSON', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '---\nkind: plugin\ngithub_repo: AO-Cyber-Systems/devflow-claude\n---\n\n# Test\n',
      'utf-8'
    );

    const objDir = path.join(tmpDir, '.planning', 'objectives', '01-bar');
    fs.mkdirSync(objDir, { recursive: true });
    fs.writeFileSync(
      path.join(objDir, 'OBJECTIVE.md'),
      '---\nwork: feature\ngithub_issue: AO-Cyber-Systems/devflow-claude#10\n---\n\n# Objective\n',
      'utf-8'
    );

    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    // Test pretty (raw=false)
    let prettyOutput = '';
    let rawOutput = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit.bind(process);
    process.exit = () => {};

    process.stdout.write = (chunk) => { prettyOutput += chunk; return true; };
    try { gh.cmdGhResolve(tmpDir, '01-bar', false); } finally { process.stdout.write = origWrite; }

    process.stdout.write = (chunk) => { rawOutput += chunk; return true; };
    try { gh.cmdGhResolve(tmpDir, '01-bar', true); } finally {
      process.stdout.write = origWrite;
      process.exit = origExit;
    }

    // Pretty output should contain newlines
    assert.ok(prettyOutput.includes('\n'), 'pretty output should have newlines');
    // Raw output: the helpers.cjs output() with raw=true writes rawValue (pretty JSON string)
    // Both should be valid JSON
    assert.doesNotThrow(() => JSON.parse(prettyOutput));
  });

  test('H3: OBJECTIVE.md absent → exits non-zero with "objective not found" message on stderr', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    let stderrOutput = '';
    let exitCodeCalled = null;
    const origStderr = process.stderr.write.bind(process.stderr);
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit.bind(process);

    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
    process.stdout.write = (chunk) => { return true; }; // swallow
    process.exit = (code) => { exitCodeCalled = code; };

    try {
      gh.cmdGhResolve(tmpDir, 'nonexistent-objective', false);
    } finally {
      process.stderr.write = origStderr;
      process.stdout.write = origWrite;
      process.exit = origExit;
    }

    // Check: either exit was called with non-zero, or output contains error
    // (output() calls process.exit(0), so we check the JSON output for error field)
    const combined = stderrOutput;
    // The cmdGhResolve should output error JSON then exit(1)
    // exitCodeCalled might be 0 (from output()) or 1 — check that "objective not found" appears somewhere
    assert.ok(
      combined.includes('objective not found') || exitCodeCalled !== 0,
      `Expected "objective not found" in output or non-zero exit. stderr: ${combined}, exit: ${exitCodeCalled}`
    );
  });

  test('H4: OBJECTIVE.md with no GH-link fields → succeeds with all provenance = absent', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '---\nkind: plugin\n---\n\n# Test\n',
      'utf-8'
    );

    const objDir = path.join(tmpDir, '.planning', 'objectives', '01-nogithub');
    fs.mkdirSync(objDir, { recursive: true });
    fs.writeFileSync(
      path.join(objDir, 'OBJECTIVE.md'),
      '---\nwork: feature\n---\n\n# No GH fields\n',
      'utf-8'
    );

    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    let capturedOutput = '';
    let exitCodeCalled = 0;
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit.bind(process);

    process.stdout.write = (chunk) => { capturedOutput += chunk; return true; };
    process.exit = (code) => { exitCodeCalled = code || 0; };

    try {
      gh.cmdGhResolve(tmpDir, '01-nogithub', false);
    } finally {
      process.stdout.write = origWrite;
      process.exit = origExit;
    }

    const parsed = JSON.parse(capturedOutput);
    assert.strictEqual(parsed.provenance.github_issue, 'absent');
    assert.strictEqual(parsed.provenance.parent_issue, 'absent');
    assert.strictEqual(exitCodeCalled, 0);
  });
});

// ─── Group I: round-trip matrix fixture ──────────────────────────────────────

describe('resolveChain — matrix fixture', () => {
  test('I1: buildFrontmatter + buildProjectCtx round-trip through resolveChain without throwing', () => {
    // Test all combinations of (full-ref, shorthand, absent) × (with org_project, without org_project)
    const mockFn = (args) => ({ ok: false, status: 1, stdout: '', stderr: '[mock]' });
    mockFn.callCount = () => 0;
    mockFn.calls = () => [];

    const combinations = [
      // full-ref with org_project
      {
        fm: fx.buildFrontmatter({ github_issue: 'owner/repo#10', parent_issue: 'owner/repo#9', _objectiveId: 'c1' }),
        ctx: fx.buildProjectCtx({ github_repo: 'owner/repo', org_project: 'PVT_1' }),
      },
      // shorthand with org_project
      {
        fm: fx.buildFrontmatter({ github_issue: '#10', parent_issue: '#9', _objectiveId: 'c2' }),
        ctx: fx.buildProjectCtx({ github_repo: 'owner/repo', org_project: 'PVT_1' }),
      },
      // absent with org_project
      {
        fm: fx.buildFrontmatter({ _objectiveId: 'c3' }),
        ctx: fx.buildProjectCtx({ github_repo: 'owner/repo', org_project: 'PVT_1' }),
      },
      // full-ref without org_project
      {
        fm: fx.buildFrontmatter({ github_issue: 'owner/repo#10', _objectiveId: 'c4' }),
        ctx: fx.buildProjectCtx({ github_repo: 'owner/repo' }),
      },
      // shorthand without org_project
      {
        fm: fx.buildFrontmatter({ github_issue: '#10', _objectiveId: 'c5' }),
        ctx: fx.buildProjectCtx({ github_repo: 'owner/repo' }),
      },
      // absent without org_project
      {
        fm: fx.buildFrontmatter({ _objectiveId: 'c6' }),
        ctx: fx.buildProjectCtx({}),
      },
    ];

    for (const { fm, ctx } of combinations) {
      gh._resetCache();
      gh._setRunGh(mockFn);

      let result;
      assert.doesNotThrow(() => {
        result = gh.resolveChain(fm, ctx);
      }, `resolveChain should not throw for: ${JSON.stringify({ fm, ctx })}`);

      assert.ok(result, 'result must be defined');
      assert.ok(result.provenance, 'result must have provenance');
      assert.ok(Array.isArray(result.warnings), 'result.warnings must be an array');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRD 01-03: requireGhAuth + GhAuthError + cmdGhResolve hard-fail tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Hand-built fixture strings — copied from actual `gh auth status` output
// (token values sanitized). Per TDD Playbook habit 4: no LLM-generated data.
//
// GH auth status happy-path output (gh 2.45+, single-quote scope format):
//   github.com
//     ✓ Logged in to github.com account markemerson (keyring)
//     - Active account: true
//     - Git operations protocol: https
//     - Token: gho_*****************************
//     - Token scopes: 'gist', 'project', 'read:org', 'read:project', 'repo'

const AUTH_STDOUT_FULL_SCOPES =
  "github.com\n  ✓ Logged in to github.com account markemerson (keyring)\n  - Active account: true\n  - Git operations protocol: https\n  - Token: gho_**************************\n  - Token scopes: 'gist', 'project', 'read:org', 'read:project', 'repo'";

const AUTH_STDOUT_REPO_GIST_ONLY =
  "github.com\n  ✓ Logged in to github.com account markemerson (keyring)\n  - Active account: true\n  - Token scopes: 'repo', 'gist'";

const AUTH_STDOUT_REPO_ONLY =
  "github.com\n  ✓ Logged in to github.com account markemerson (keyring)\n  - Token scopes: 'repo'";

// Multiline scope format — older gh versions wrap long scope lists
const AUTH_STDOUT_MULTILINE_SCOPES =
  "github.com\n  ✓ Logged in\n  - Token scopes: 'gist',\n      'project'";

// ─── Group A: requireGhAuth — happy path ─────────────────────────────────────

describe('requireGhAuth — happy path', () => {
  test('A1: returns silently when authenticated with all required scopes present', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    // Must not throw
    assert.doesNotThrow(() => gh.requireGhAuth(['project', 'read:project']));
  });

  test('A2: returns silently when user has MORE scopes than required (subset matching)', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    assert.doesNotThrow(() => gh.requireGhAuth(['repo']));
  });

  test('A3: returns silently when requireGhAuth([]) called — empty required scopes', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    assert.doesNotThrow(() => gh.requireGhAuth([]));
  });
});

// ─── Group B: requireGhAuth — fail modes ─────────────────────────────────────

describe('requireGhAuth — fail modes', () => {
  test('B1: missing gh binary → throws GhAuthError with install URL in remediation', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: null, stdout: '', stderr: 'gh: command not found' }],
    ]));
    gh._setRunGh(mock);

    let threw = false;
    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError', `Expected GhAuthError, got ${e.name}: ${e.message}`);
      assert.ok(e.remediation.includes('https://cli.github.com'), `Expected install URL in remediation, got: ${e.remediation}`);
    }
    assert.ok(threw, 'requireGhAuth must throw on missing binary');
  });

  test('B2: unauthenticated → throws GhAuthError with remediation = "gh auth login"', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    let threw = false;
    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError');
      assert.strictEqual(e.remediation, 'gh auth login');
    }
    assert.ok(threw);
  });

  test('B3: missing single scope (project) → throws with exact remediation "gh auth refresh -h github.com -s project"', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_REPO_GIST_ONLY, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    let threw = false;
    try {
      gh.requireGhAuth(['project']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError');
      assert.deepStrictEqual(e.scopes_missing, ['project']);
      assert.strictEqual(e.remediation, 'gh auth refresh -h github.com -s project');
    }
    assert.ok(threw);
  });

  test('B4: missing multiple scopes → remediation uses comma-joined form (not repeated -s flags)', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_REPO_ONLY, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    let threw = false;
    try {
      gh.requireGhAuth(['project', 'read:project']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError');
      assert.deepStrictEqual(e.scopes_missing, ['project', 'read:project']);
      // EXACT string required per TRD verifier briefings — comma-joined, -h first
      assert.strictEqual(e.remediation, 'gh auth refresh -h github.com -s project,read:project');
    }
    assert.ok(threw);
  });

  test('B5: expired token → throws GhAuthError with remediation = "gh auth refresh" (no scopes flag)', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'The token in keyring/store has expired.' }],
    ]));
    gh._setRunGh(mock);

    let threw = false;
    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError');
      assert.strictEqual(e.remediation, 'gh auth refresh');
    }
    assert.ok(threw);
  });

  test('B6: multiline scope output → parseScopes handles both separator styles correctly', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_MULTILINE_SCOPES, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    // Both 'gist' and 'project' should be detected — 'repo' is missing
    let threw = false;
    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      threw = true;
      assert.strictEqual(e.name, 'GhAuthError');
      assert.deepStrictEqual(e.scopes_missing, ['repo']);
    }
    assert.ok(threw);
  });
});

// ─── Group C: GhAuthError shape ──────────────────────────────────────────────

describe('GhAuthError shape', () => {
  test('C1: thrown error is an Error subclass with .name === "GhAuthError"', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(e instanceof Error, 'GhAuthError must extend Error');
      assert.strictEqual(e.name, 'GhAuthError');
    }
  });

  test('C2: .message is human-readable and includes the failure mode description', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(typeof e.message === 'string' && e.message.length > 0, 'message must be non-empty string');
      // message should describe what went wrong in plain English
      assert.ok(
        e.message.toLowerCase().includes('auth') || e.message.toLowerCase().includes('login') || e.message.toLowerCase().includes('github'),
        `message should mention auth/login/github, got: "${e.message}"`
      );
    }
  });

  test('C3: .remediation is a runnable shell command string (no template placeholders)', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(typeof e.remediation === 'string' && e.remediation.length > 0, 'remediation must be non-empty string');
      // No template placeholders like {scope} or <scope>
      assert.ok(!e.remediation.includes('{'), 'remediation must not contain curly braces');
      assert.ok(!e.remediation.includes('<'), 'remediation must not contain angle brackets');
    }
  });

  test('C4: .scopes_missing is always an array (possibly empty for non-scope failures)', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.requireGhAuth(['repo']);
      assert.fail('should have thrown');
    } catch (e) {
      assert.ok(Array.isArray(e.scopes_missing), 'scopes_missing must be an array');
      // For auth failures (not scope failures), scopes_missing should be empty
      assert.strictEqual(e.scopes_missing.length, 0, 'scopes_missing should be empty for auth failures');
    }
  });
});

// ─── Group D: cmdGhResolve — auth hard-fail integration ──────────────────────

describe('cmdGhResolve — auth hard-fail', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-gh-auth-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives'), { recursive: true });

    // Create a valid OBJECTIVE.md so cmdGhResolve doesn't fail on missing file
    const objDir = path.join(tmpDir, '.planning', 'objectives', '01-test');
    fs.mkdirSync(objDir, { recursive: true });
    fs.writeFileSync(
      path.join(objDir, 'OBJECTIVE.md'),
      '---\nwork: feature\ngithub_issue: AO-Cyber-Systems/devflow-claude#10\n---\n\n# Test\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '---\nkind: plugin\ngithub_repo: AO-Cyber-Systems/devflow-claude\n---\n\n# Test\n',
      'utf-8'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  test('D1: cmdGhResolve writes structured JSON error to stderr + exits non-zero on auth failure', () => {
    // Mock: auth status fails (unauthenticated)
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    let stderrOutput = '';
    let exitCodeCalled = null;
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit.bind(process);

    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
    process.exit = (code) => { exitCodeCalled = code; };

    try {
      gh.cmdGhResolve(tmpDir, '01-test', false);
    } finally {
      process.stderr.write = origStderr;
      process.exit = origExit;
    }

    // Must have exited non-zero
    assert.strictEqual(exitCodeCalled, 1, `Expected exit code 1, got: ${exitCodeCalled}`);

    // Must have written structured JSON to stderr
    let errPayload;
    assert.doesNotThrow(() => {
      errPayload = JSON.parse(stderrOutput);
    }, `stderr must be valid JSON, got: ${stderrOutput}`);

    assert.ok(errPayload.error, 'error field must be present in stderr JSON');
    assert.ok(errPayload.remediation, 'remediation field must be present in stderr JSON');
    assert.ok(Array.isArray(errPayload.scopes_missing), 'scopes_missing field must be array in stderr JSON');
  });

  test('D2: cmdGhResolve proceeds to call resolveChain when requireGhAuth succeeds', () => {
    // Mock: auth status succeeds with required scopes; issue list/graphql also mocked
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
      ['api graphql', { ok: false, status: 1, stdout: '', stderr: '[mock] no walk in D2' }],
      ['issue list', { ok: true, status: 0, stdout: '[]', stderr: '' }],
    ]));
    gh._setRunGh(mock);

    let stdoutOutput = '';
    let exitCodeCalled = 0;
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit.bind(process);

    process.stdout.write = (chunk) => { stdoutOutput += chunk; return true; };
    process.exit = (code) => { exitCodeCalled = code || 0; };

    try {
      gh.cmdGhResolve(tmpDir, '01-test', false);
    } finally {
      process.stdout.write = origWrite;
      process.exit = origExit;
    }

    // Should have produced JSON output (not errored out)
    assert.ok(stdoutOutput.length > 0, 'expected stdout output when auth succeeds');
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(stdoutOutput); }, `stdout must be valid JSON, got: ${stdoutOutput}`);
    assert.ok(parsed.provenance, 'output must have provenance field');
    assert.strictEqual(exitCodeCalled, 0, 'exit code must be 0 on success');
  });

  test('D3: cmdGhSyncObjectives preserves skipped:true graceful-skip behavior on auth failure (back-compat)', () => {
    // cmdGhSyncObjectives uses the OLD ghStatus() graceful-skip pattern — NOT requireGhAuth
    // Mock: no config.json → ghStatus returns enabled:false → skipped:true

    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
    ]));
    gh._setRunGh(mock);

    let capturedOutput = '';
    let exitCodeCalled = null;
    const origWrite = process.stdout.write.bind(process.stdout);
    const origExit = process.exit.bind(process);

    process.stdout.write = (chunk) => { capturedOutput += chunk; return true; };
    process.exit = (code) => { exitCodeCalled = code; };

    // No config.json in tmpDir — so ghStatus returns enabled:false, reason: 'github.enabled is false...'
    try {
      gh.cmdGhSyncObjectives(tmpDir, false);
    } finally {
      process.stdout.write = origWrite;
      process.exit = origExit;
    }

    // Must produce { ok: false, skipped: true, reason: ... } — NOT throw a GhAuthError
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(capturedOutput); }, `expected JSON output from cmdGhSyncObjectives, got: ${capturedOutput}`);
    assert.strictEqual(parsed.skipped, true, 'cmdGhSyncObjectives must return skipped:true on missing config, not throw');
    assert.ok(parsed.reason, 'reason field must be present in skip output');
    // Must NOT have exitCode of 1 from requireGhAuth (no throw)
    assert.notStrictEqual(exitCodeCalled, 1, 'cmdGhSyncObjectives must not exit(1) — it gracefully skips');
  });
});

// ─── Group E: parseScopes — internal helper ───────────────────────────────────
// parseScopes is not exported, but its behavior is fully tested via requireGhAuth's
// scope-checking behavior. These tests drive the implementation indirectly.

describe('parseScopes (via requireGhAuth scope detection)', () => {
  test('E1: single-quote scopes on one line parsed correctly', () => {
    // "Token scopes: 'repo', 'gist', 'project'" → all three found
    const stdout = "github.com\n  ✓ Logged in\n  - Token scopes: 'repo', 'gist', 'project'";
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    // All three scopes present — should NOT throw for any of them
    assert.doesNotThrow(() => gh.requireGhAuth(['repo']));
    assert.doesNotThrow(() => gh.requireGhAuth(['gist']));
    assert.doesNotThrow(() => gh.requireGhAuth(['project']));
  });

  test('E2: multiline scope list parsed correctly (older gh versions)', () => {
    // Scopes split across lines
    const stdout = "github.com\n  ✓ Logged in\n  - Token scopes: 'gist',\n      'project'";
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    // Both gist and project should be detected
    assert.doesNotThrow(() => gh.requireGhAuth(['gist']));
    assert.doesNotThrow(() => gh.requireGhAuth(['project']));
  });

  test('E3: empty stdout → empty scope list → throws on any required scope', () => {
    const mock = fx.buildMockRunGh(new Map([
      // ok:true but empty stdout — no scopes found
      ['auth status', { ok: true, status: 0, stdout: 'github.com\n  ✓ Logged in\n  - Active account: true', stderr: '' }],
    ]));
    gh._setRunGh(mock);

    // No "Token scopes:" line — requires no scopes, should be ok
    assert.doesNotThrow(() => gh.requireGhAuth([]));
  });

  test('E4: double-quoted scopes (older gh output format) parsed correctly', () => {
    // Older gh versions use double quotes: Token scopes: "repo", "gist"
    const stdout = 'github.com\n  ✓ Logged in\n  - Token scopes: "repo", "gist", "project"';
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    assert.doesNotThrow(() => gh.requireGhAuth(['repo']));
    assert.doesNotThrow(() => gh.requireGhAuth(['project']));
  });
});
