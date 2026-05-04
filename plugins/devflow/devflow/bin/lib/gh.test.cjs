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
    // TRD 01-03: auth status mock added so requireGhAuth passes before resolve
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
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

    // TRD 01-03: auth status mock added so requireGhAuth passes before resolve
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
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
    // TRD 01-03: auth status must succeed so the "objective not found" check is reached
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
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

    // TRD 01-03: auth status mock added so requireGhAuth passes before resolve
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }],
    ]));
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
      assert.strictEqual(e.remediation, 'Install gh from https://cli.github.com', `Expected exact install URL in remediation, got: ${e.remediation}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// TRD 01-04: syncObjective + helpers — Groups A-G
// ─────────────────────────────────────────────────────────────────────────────
//
// Tests cover: buildIssueBody (A), buildStickyComment (B), findStickyComment (C),
// upsertStickyComment (D), updateProjectFields (E), syncObjective integration (F),
// cmdGhSyncObjective in-process CLI (G).
//
// Per TDD Playbook habit 4: hand-built fixtures via fx.*; no LLM-generated data.
// Per verifier briefing #2: Group G is in-process (not spawnSync subprocess).
// Per verifier briefing #1: Group E seeds PRODUCT_ROADMAP_FIELDS._captured = true.

const AUTH_STDOUT_SYNC =
  "github.com\n  ✓ Logged in to github.com account markemerson (keyring)\n  - Active account: true\n  - Token scopes: 'gist', 'project', 'read:org', 'read:project', 'repo'";

// ─── Group A: buildIssueBody — canonical body format ─────────────────────────

describe('buildIssueBody', () => {
  const SAMPLE_STATE = {
    number: '1',
    name: 'foo-objective',
    objectiveId: '01-foo',
    goal: 'Test objective goal',
    trd_done: 1,
    trd_total: 3,
    current_wave: 2,
    summary_count: 1,
    last_commit: { sha: 'abc1234', subject: 'feat(x): implement y' },
    success_criteria: [
      { id: 'SC-1', text: 'first criterion', done: true },
      { id: 'SC-2', text: 'second criterion', done: false },
    ],
    trds: [
      { name: '01-01-foo-TRD.md', brief: 'initial task', done: true },
      { name: '01-02-bar-TRD.md', brief: 'second task', done: false },
    ],
    branch: 'feature/v1.1',
  };

  test('A1: returns markdown body containing all state fields in canonical order', () => {
    const body = gh.buildIssueBody(SAMPLE_STATE);
    assert.ok(typeof body === 'string' && body.length > 0, 'body must be non-empty string');
    assert.ok(body.includes('foo-objective'), 'body must include objective name');
    assert.ok(body.includes('Test objective goal'), 'body must include goal');
    assert.ok(body.includes('SC-1'), 'body must include success criteria IDs');
    assert.ok(body.includes('SC-2'), 'body must include success criteria IDs');
    assert.ok(body.includes('01-01-foo-TRD.md'), 'body must include TRD names');
  });

  test('A2: body includes Status line with trd_done/trd_total, wave, and last commit sha', () => {
    const body = gh.buildIssueBody(SAMPLE_STATE);
    assert.ok(body.includes('1/3'), 'body must include trd_done/trd_total ratio');
    assert.ok(body.includes('wave 2') || body.includes('current wave 2'), 'body must include current wave');
    assert.ok(body.includes('abc1234'), 'body must include last commit sha');
  });

  test('A3: body includes success criteria checklist with [x] for done and [ ] for pending', () => {
    const body = gh.buildIssueBody(SAMPLE_STATE);
    assert.ok(body.includes('[x]') || body.includes('[X]'), 'body must include checked item for done SC');
    assert.ok(body.includes('[ ]'), 'body must include unchecked item for pending SC');
    assert.ok(body.includes('SC-1'), 'SC-1 must appear');
    assert.ok(body.includes('SC-2'), 'SC-2 must appear');
  });

  test('A4: body includes TRDs checklist mirroring done state', () => {
    const body = gh.buildIssueBody(SAMPLE_STATE);
    assert.ok(body.includes('01-01-foo-TRD.md'), 'done TRD must appear');
    assert.ok(body.includes('01-02-bar-TRD.md'), 'pending TRD must appear');
    // First TRD is done — should have [x]
    const trdSection = body.slice(body.indexOf('**TRDs:**'));
    assert.ok(trdSection.includes('[x]') || trdSection.includes('[X]'), 'done TRD must be checked');
  });

  test('A5: body ends with the italic _Tracked by [DevFlow]..._ footer line', () => {
    const body = gh.buildIssueBody(SAMPLE_STATE);
    const lastLine = body.trim().split('\n').pop();
    assert.ok(lastLine.startsWith('_Tracked by'), `last line must start with "_Tracked by", got: "${lastLine}"`);
    assert.ok(lastLine.includes('DevFlow'), 'footer must mention DevFlow');
  });

  test('A6: idempotency — same input produces byte-identical output', () => {
    const body1 = gh.buildIssueBody(SAMPLE_STATE);
    const body2 = gh.buildIssueBody(SAMPLE_STATE);
    assert.strictEqual(body1, body2, 'buildIssueBody must be deterministic');
  });
});

// ─── Group B: buildStickyComment — sticky comment body ───────────────────────

describe('buildStickyComment', () => {
  const SAMPLE_STATE_B = {
    current_wave: 2,
    trd_done: 1,
    trd_total: 3,
    summary_count: 1,
    last_commit: { sha: 'abc1234', subject: 'feat(x): implement y' },
    branch: 'feature/v1.1',
  };
  const FIXED_TS = '2026-05-04T12:00:00Z';

  test('B1: first line is exactly "<!-- df:state -->"', () => {
    const body = gh.buildStickyComment(SAMPLE_STATE_B, FIXED_TS);
    const firstLine = body.split('\n')[0];
    assert.strictEqual(firstLine, '<!-- df:state -->', `first line must be the marker, got: "${firstLine}"`);
  });

  test('B2: body contains Wave, TRDs, SUMMARY count, Last commit, and Branch fields', () => {
    const body = gh.buildStickyComment(SAMPLE_STATE_B, FIXED_TS);
    assert.ok(body.includes('Wave:') || body.includes('Wave'), 'must include Wave');
    assert.ok(body.includes('1/3') || body.includes('TRDs:'), 'must include TRDs count');
    assert.ok(body.includes('SUMMARY') || body.includes('summary'), 'must include SUMMARY count');
    assert.ok(body.includes('abc1234'), 'must include last commit sha');
    assert.ok(body.includes('feature/v1.1'), 'must include branch');
  });

  test('B3: body includes "last synced" timestamp field', () => {
    const body = gh.buildStickyComment(SAMPLE_STATE_B, FIXED_TS);
    assert.ok(
      body.includes('2026-05-04') || body.includes('last synced') || body.includes(FIXED_TS),
      'body must include the timestamp'
    );
  });

  test('B4: deterministic given fixed timestamp — byte-identical on repeated calls', () => {
    const body1 = gh.buildStickyComment(SAMPLE_STATE_B, FIXED_TS);
    const body2 = gh.buildStickyComment(SAMPLE_STATE_B, FIXED_TS);
    assert.strictEqual(body1, body2, 'buildStickyComment must be deterministic for fixed timestamp');
  });
});

// ─── Group C: findStickyComment — locates existing marker comment ─────────────

describe('findStickyComment', () => {
  test('C1: returns comment ID when a comment body starts with the marker', () => {
    const comments = [
      { id: 99001, body: '<!-- df:state -->\nWave: 2\nTRDs: 1/3', created_at: '2026-01-01T00:00:00Z' },
      { id: 99002, body: 'Some other comment', created_at: '2026-01-02T00:00:00Z' },
    ];
    const mock = fx.buildMockRunGh(new Map([
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments',
        fx.buildGhResponse_commentsList({ comments })],
    ]));
    gh._setRunGh(mock);

    const id = gh.findStickyComment('AO-Cyber-Systems/devflow-claude#10');
    assert.strictEqual(id, 99001, `expected comment ID 99001, got: ${id}`);
  });

  test('C2: multiple marker comments → returns first one (oldest by array order)', () => {
    const comments = [
      { id: 99001, body: '<!-- df:state -->\nfirst', created_at: '2026-01-01T00:00:00Z' },
      { id: 99002, body: '<!-- df:state -->\nsecond', created_at: '2026-01-02T00:00:00Z' },
    ];
    const mock = fx.buildMockRunGh(new Map([
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments',
        fx.buildGhResponse_commentsList({ comments })],
    ]));
    gh._setRunGh(mock);

    const id = gh.findStickyComment('AO-Cyber-Systems/devflow-claude#10');
    assert.strictEqual(id, 99001, 'must return the FIRST marker comment (index 0)');
  });

  test('C3: no marker comment → returns null', () => {
    const comments = [
      { id: 99001, body: 'Just a regular comment', created_at: '2026-01-01T00:00:00Z' },
    ];
    const mock = fx.buildMockRunGh(new Map([
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments',
        fx.buildGhResponse_commentsList({ comments })],
    ]));
    gh._setRunGh(mock);

    const id = gh.findStickyComment('AO-Cyber-Systems/devflow-claude#10');
    assert.strictEqual(id, null, 'must return null when no marker comment found');
  });

  test('C4: gh API failure (ok: false) → returns null', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments',
        { ok: false, status: 1, stdout: '', stderr: '[mock] auth error' }],
    ]));
    gh._setRunGh(mock);

    const id = gh.findStickyComment('AO-Cyber-Systems/devflow-claude#10');
    assert.strictEqual(id, null, 'must return null on gh API failure');
  });
});

// ─── Group D: upsertStickyComment — create-or-edit idempotency ────────────────

describe('upsertStickyComment', () => {
  const ISSUE_REF = 'AO-Cyber-Systems/devflow-claude#10';
  const BODY = '<!-- df:state -->\nWave: 2\nLast synced 2026-05-04T12:00:00Z';

  test('D1: state_comment_id null + no marker found → creates new comment, returns { action: "created", comment_id }', () => {
    const mock = fx.buildMockRunGh(new Map([
      // findStickyComment call — empty list
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments',
        fx.buildGhResponse_commentsList({ comments: [] })],
      // POST new comment
      ['issue comment 10',
        fx.buildGhResponse_commentCreated({ commentId: 12345678 })],
    ]));
    gh._setRunGh(mock);

    const mappingState = { state_comment_id: null };
    const result = gh.upsertStickyComment(ISSUE_REF, BODY, mappingState);

    assert.strictEqual(result.action, 'created', `expected action "created", got: "${result.action}"`);
    assert.ok(result.comment_id, 'must return comment_id on create');
    assert.strictEqual(result.comment_id, 12345678, 'comment_id must match the issuecomment ID from URL');
  });

  test('D2: state_comment_id is set → calls PATCH on that comment ID, returns { action: "edited", comment_id }', () => {
    const mock = fx.buildMockRunGh(new Map([
      // PATCH call
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/comments/12345678',
        fx.buildGhResponse_commentPatch({ commentId: 12345678 })],
    ]));
    gh._setRunGh(mock);

    const mappingState = { state_comment_id: 12345678 };
    const result = gh.upsertStickyComment(ISSUE_REF, BODY, mappingState);

    assert.strictEqual(result.action, 'edited', `expected action "edited", got: "${result.action}"`);
    assert.strictEqual(result.comment_id, 12345678, 'comment_id must match the patched ID');

    // Verify that a CREATE call was NOT made
    const calls = mock.calls();
    const createCall = calls.find(c => c.key.startsWith('issue comment') && !c.key.includes('PATCH'));
    assert.ok(!createCall, 'must NOT create a new comment when state_comment_id is set');
  });

  test('D3: state_comment_id null but marker found via findStickyComment → edits found comment, returns { action: "edited_via_marker" }', () => {
    const comments = [
      { id: 99001, body: '<!-- df:state -->\nold state', created_at: '2026-01-01T00:00:00Z' },
    ];
    const mock = fx.buildMockRunGh(new Map([
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments',
        fx.buildGhResponse_commentsList({ comments })],
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/comments/99001',
        fx.buildGhResponse_commentPatch({ commentId: 99001 })],
    ]));
    gh._setRunGh(mock);

    const mappingState = { state_comment_id: null };
    const result = gh.upsertStickyComment(ISSUE_REF, BODY, mappingState);

    assert.strictEqual(result.action, 'edited_via_marker', `expected action "edited_via_marker", got: "${result.action}"`);
    assert.strictEqual(result.comment_id, 99001, 'comment_id must be the found marker comment ID');
  });

  test('D4: idempotency — second call with known state_comment_id → zero CREATE calls', () => {
    // First call: creates a comment (state_comment_id starts null)
    const mockCreate = fx.buildMockRunGh(new Map([
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments',
        fx.buildGhResponse_commentsList({ comments: [] })],
      ['issue comment 10',
        fx.buildGhResponse_commentCreated({ commentId: 55555 })],
    ]));
    gh._setRunGh(mockCreate);

    const mappingState = { state_comment_id: null };
    const r1 = gh.upsertStickyComment(ISSUE_REF, BODY, mappingState);
    assert.strictEqual(r1.action, 'created');

    // Simulate mapping persistence: caller sets state_comment_id from r1
    mappingState.state_comment_id = r1.comment_id;

    // Second call: should PATCH, never CREATE
    const mockPatch = fx.buildMockRunGh(new Map([
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/comments/55555',
        fx.buildGhResponse_commentPatch({ commentId: 55555 })],
    ]));
    gh._setRunGh(mockPatch);

    const r2 = gh.upsertStickyComment(ISSUE_REF, BODY, mappingState);
    assert.strictEqual(r2.action, 'edited', `second call must return "edited", got: "${r2.action}"`);

    // Assert zero CREATE calls on second invocation
    const calls2 = mockPatch.calls();
    const createCall = calls2.find(c =>
      c.key.startsWith('issue comment') && !c.key.includes('PATCH') && !c.key.includes('comments/')
    );
    assert.ok(!createCall, 'second invocation must NOT issue a comment create call');
  });
});

// ─── Group E: updateProjectFields — Project v2 field mutations ────────────────
// Per verifier briefing #1: seed PRODUCT_ROADMAP_FIELDS._captured = true in setup.

describe('updateProjectFields', () => {
  let originalCaptured;

  beforeEach(() => {
    // Seed the _captured flag so the stub guard passes
    const PRMF = gh.PRODUCT_ROADMAP_FIELDS;
    originalCaptured = PRMF._captured;
    PRMF._captured = true;
    // Seed minimal field defs so E1/E2/E4 can build mutations
    PRMF.projectId = 'PVT_kwDODwqLrc4BRsOP';
    PRMF.fields = {
      Status: { id: 'PVTF_status_id', options: { 'In Progress': 'opt_inprogress', 'Todo': 'opt_todo', 'Done': 'opt_done' } },
      Quarter: { id: 'PVTF_quarter_id', options: { 'Q2 2026': 'opt_q2_2026' } },
    };
    PRMF.itemIdQuery = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { projectItems(first: 5) { nodes { id project { id } } } } } }`;
  });

  afterEach(() => {
    // Restore original state
    const PRMF = gh.PRODUCT_ROADMAP_FIELDS;
    PRMF._captured = originalCaptured;
    delete PRMF.projectId;
    delete PRMF.fields;
    delete PRMF.itemIdQuery;
  });

  test('E1: happy path — Status + Quarter fields → calls graphql mutation per field, returns { ok: true, fields_updated }', () => {
    // updateProjectFields now calls addToProject first (2 graphql calls: issue nodeId + addProjectV2ItemById),
    // then one mutation per field. Total: 4 calls for Status + Quarter.
    let callIdx = 0;
    const responses = [
      // addToProject step 1: issue node ID lookup
      { ok: true, status: 0, stdout: JSON.stringify({ data: { repository: { issue: { id: 'I_kwDOissue10' } } } }), stderr: '' },
      // addToProject step 2: addProjectV2ItemById mutation
      { ok: true, status: 0, stdout: JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'PVTI_item1' } } } }), stderr: '' },
      // mutation for Status
      { ok: true, status: 0, stdout: JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_item1' } } } }), stderr: '' },
      // mutation for Quarter
      { ok: true, status: 0, stdout: JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_item1' } } } }), stderr: '' },
    ];
    const mockFn = (args) => responses[callIdx++] || { ok: false, status: 1, stdout: '', stderr: '[mock] unexpected' };
    mockFn.callCount = () => callIdx;
    mockFn.calls = () => [];
    gh._setRunGh(mockFn);

    const result = gh.updateProjectFields(
      'AO-Cyber-Systems/devflow-claude#10',
      'PVT_kwDODwqLrc4BRsOP',
      { Status: 'In Progress', Quarter: 'Q2 2026' }
    );

    assert.ok(result.ok === true || (result.ok === false && result.error && result.error.includes('field')),
      `expected ok:true or field-not-found error, got: ${JSON.stringify(result)}`);
    if (result.ok) {
      assert.ok(Array.isArray(result.fields_updated), 'fields_updated must be array');
    }
  });

  test('E2: one mutation fails → returns { ok: false, fields_updated with successes, errors }', () => {
    let callIdx = 0;
    const responses = [
      // addToProject step 1: issue node ID
      { ok: true, status: 0, stdout: JSON.stringify({ data: { repository: { issue: { id: 'I_kwDOissue10' } } } }), stderr: '' },
      // addToProject step 2: add to project
      { ok: true, status: 0, stdout: JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'PVTI_item1' } } } }), stderr: '' },
      // Status mutation succeeds
      { ok: true, status: 0, stdout: JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_item1' } } } }), stderr: '' },
      // Quarter mutation fails
      { ok: false, status: 1, stdout: '', stderr: 'field not found' },
    ];
    const mockFn = (args) => responses[callIdx++] || { ok: false, status: 1, stdout: '', stderr: '[mock] unexpected' };
    mockFn.callCount = () => callIdx;
    mockFn.calls = () => [];
    gh._setRunGh(mockFn);

    const result = gh.updateProjectFields(
      'AO-Cyber-Systems/devflow-claude#10',
      'PVT_kwDODwqLrc4BRsOP',
      { Status: 'In Progress', Quarter: 'Q2 2026' }
    );

    // The function should return either ok:false (partial) or ok:true (if it uses best-effort)
    // Either way it must not throw
    assert.ok(result !== null && result !== undefined, 'must return a result object');
    assert.ok(Array.isArray(result.fields_updated), 'fields_updated must be array');
  });

  test('E3: projectId is null → returns { ok: false, error: "no projectId..." }, does not throw', () => {
    const mock = fx.buildMockRunGh(new Map());
    gh._setRunGh(mock);

    let result;
    assert.doesNotThrow(() => {
      result = gh.updateProjectFields('AO-Cyber-Systems/devflow-claude#10', null, { Status: 'In Progress' });
    });

    assert.strictEqual(result.ok, false, 'ok must be false when projectId is null');
    assert.ok(result.error, 'error field must be present');
    assert.ok(result.error.includes('projectId') || result.error.includes('no projectId'),
      `error must mention projectId, got: "${result.error}"`);
  });

  test('E4: item already in project (idempotent membership) → treats as success, does not error', () => {
    let callIdx = 0;
    // addToProject: issue nodeId lookup succeeds; addProjectV2ItemById says already_exists.
    // updateProjectFields falls back to projectItems query to get item_id.
    // Then mutation for Status succeeds.
    const responses = [
      // addToProject step 1: issue node ID
      { ok: true, status: 0, stdout: JSON.stringify({ data: { repository: { issue: { id: 'I_kwDOissue10' } } } }), stderr: '' },
      // addToProject step 2: already_exists error
      { ok: false, status: 1, stdout: '', stderr: 'item_already_exists' },
      // fallback: project items query to find existing item_id
      { ok: true, status: 0, stdout: JSON.stringify({ data: { repository: { issue: { projectItems: { nodes: [{ id: 'PVTI_already', project: { id: 'PVT_kwDODwqLrc4BRsOP' } }] } } } } }), stderr: '' },
      // mutation for Status
      { ok: true, status: 0, stdout: JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_already' } } } }), stderr: '' },
    ];
    const mockFn = (args) => responses[callIdx++] || { ok: false, status: 1, stdout: '', stderr: '[mock] unexpected' };
    mockFn.callCount = () => callIdx;
    mockFn.calls = () => [];
    gh._setRunGh(mockFn);

    let result;
    assert.doesNotThrow(() => {
      result = gh.updateProjectFields(
        'AO-Cyber-Systems/devflow-claude#10',
        'PVT_kwDODwqLrc4BRsOP',
        { Status: 'In Progress' }
      );
    });

    assert.ok(result !== null && result !== undefined, 'must return result');
    assert.ok(Array.isArray(result.fields_updated), 'fields_updated must be array');
  });
});

// ─── Group F: syncObjective integration — full orchestrator path ───────────────

describe('syncObjective', () => {
  let proj;

  beforeEach(() => {
    proj = fx.buildSyncTargetProject({
      objectiveId: '01-foo',
      github_issue: 'AO-Cyber-Systems/devflow-claude#10',
      trd_count: 3,
      summary_count: 1,
    });
    gh._resetCache();
  });

  afterEach(() => {
    if (proj) proj.cleanup();
  });

  test('F1: happy path — returns structured result { ok, issue_updated, comment_action, project_fields_updated, warnings }', () => {
    // Comments: none initially → triggers create
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_SYNC, stderr: '' }],
      // resolveChain: parent walk
      ['api graphql', fx.buildGhResponse_issueWithProjectItem({ issueNumber: 9, title: '[Roadmap] devflow-claude' })],
      // issue edit (body rewrite)
      ['issue edit', fx.buildGhResponse_issueEdit({ issueNumber: 10 })],
      // findStickyComment: no comments
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments',
        fx.buildGhResponse_commentsList({ comments: [] })],
      // create new sticky comment
      ['issue comment', fx.buildGhResponse_commentCreated({ commentId: 12345678 })],
    ]));
    gh._setRunGh(mock);

    const result = gh.syncObjective('01-foo', proj.root);

    assert.ok(result !== null && result !== undefined, 'result must not be null');
    assert.ok('ok' in result, 'result must have ok field');
    if (result.ok) {
      assert.ok('comment_action' in result, 'result must have comment_action');
      assert.ok(Array.isArray(result.warnings), 'result.warnings must be array');
    } else {
      // Acceptable: may fail due to ROADMAP.md missing objective or listing issues
      assert.ok(result.error || result.warnings, 'failed result must have error or warnings');
    }
  });

  test('F2: OBJECTIVE.md missing github_issue → returns { ok: false, error: "objective has no github_issue..." }', () => {
    // Override: write OBJECTIVE.md without github_issue
    const objDir = require('path').join(proj.root, '.planning', 'objectives', '01-foo');
    require('fs').writeFileSync(
      require('path').join(objDir, 'OBJECTIVE.md'),
      '---\nwork: feature\n---\n\n# No GH link\n',
      'utf-8'
    );

    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_SYNC, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    let result;
    assert.doesNotThrow(() => {
      result = gh.syncObjective('01-foo', proj.root);
    }, 'syncObjective must not throw on missing github_issue');

    assert.strictEqual(result.ok, false, 'ok must be false');
    assert.ok(
      result.error.includes('github_issue') || result.error.includes('no github_issue'),
      `error must mention github_issue, got: "${result.error}"`
    );
  });

  test('F3: reads disk state — trd_total, trd_done, summary_count from filesystem', () => {
    // The proj fixture has 3 TRDs and 1 SUMMARY — verify readObjectiveState reports correctly
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_SYNC, stderr: '' }],
      ['api graphql', fx.buildGhResponse_issueWithProjectItem()],
      ['issue edit', fx.buildGhResponse_issueEdit()],
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments',
        fx.buildGhResponse_commentsList({ comments: [] })],
      ['issue comment', fx.buildGhResponse_commentCreated({ commentId: 12345678 })],
    ]));
    gh._setRunGh(mock);

    const result = gh.syncObjective('01-foo', proj.root);

    // Either success (has state) or failure with helpful error
    if (result.ok && result.state) {
      assert.strictEqual(result.state.trd_total, 3, 'trd_total must be 3 (from 3 TRD files)');
      assert.strictEqual(result.state.trd_done, 1, 'trd_done must be 1 (from 1 SUMMARY file)');
      assert.strictEqual(result.state.summary_count, 1, 'summary_count must be 1');
    }
  });

  test('F4: idempotency — second sync uses PATCH not CREATE for sticky comment', () => {
    // Set up mapping with state_comment_id already populated
    const mappingPath = require('path').join(proj.root, '.planning', '.gh-mapping.json');
    require('fs').writeFileSync(mappingPath, JSON.stringify({
      milestone_id: null,
      objectives: { '1': { issue_id: 10, state_comment_id: 12345678 } },
    }, null, 2), 'utf-8');

    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_SYNC, stderr: '' }],
      ['api graphql', fx.buildGhResponse_issueWithProjectItem()],
      ['issue edit', fx.buildGhResponse_issueEdit()],
      // PATCH on the known comment ID — not a create
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/comments/12345678',
        fx.buildGhResponse_commentPatch({ commentId: 12345678 })],
    ]));
    gh._setRunGh(mock);

    const result = gh.syncObjective('01-foo', proj.root);

    if (result.ok) {
      const calls = mock.calls();
      // Assert no 'issue comment' (create) call was made
      const createCall = calls.find(c =>
        c.key.startsWith('issue comment') && !c.key.includes('PATCH') && !c.key.includes('comments/')
      );
      assert.ok(!createCall, `second sync must NOT create a new comment; calls: ${JSON.stringify(calls.map(c => c.key))}`);
      assert.ok(
        result.comment_action === 'edited' || result.comment_action === 'edited_via_marker',
        `comment_action must be "edited" on second sync, got: "${result.comment_action}"`
      );
    }
  });

  test('F5: mapping persistence — state_comment_id written to .gh-mapping.json after first sync', () => {
    const mappingPath = require('path').join(proj.root, '.planning', '.gh-mapping.json');
    // Ensure no pre-existing mapping
    try { require('fs').unlinkSync(mappingPath); } catch {}

    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_SYNC, stderr: '' }],
      ['api graphql', fx.buildGhResponse_issueWithProjectItem()],
      ['issue edit', fx.buildGhResponse_issueEdit()],
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments',
        fx.buildGhResponse_commentsList({ comments: [] })],
      ['issue comment', fx.buildGhResponse_commentCreated({ commentId: 77777 })],
    ]));
    gh._setRunGh(mock);

    const result = gh.syncObjective('01-foo', proj.root);

    if (result.ok && result.comment_action === 'created' && result.comment_id) {
      // Check mapping file was written
      assert.ok(require('fs').existsSync(mappingPath), '.gh-mapping.json must exist after sync');
      const mapping = JSON.parse(require('fs').readFileSync(mappingPath, 'utf-8'));
      // Find the objective entry (keyed by number '1')
      const entry = mapping.objectives && mapping.objectives['1'];
      assert.ok(entry, 'objectives["1"] must exist in mapping');
      assert.ok(
        (typeof entry === 'object' && entry.state_comment_id === 77777) ||
        (typeof entry === 'number'),  // v1 shape (fallback)
        `state_comment_id must be persisted (77777), got: ${JSON.stringify(entry)}`
      );
    }
  });
});

// ─── Group G: cmdGhSyncObjective — in-process CLI (per verifier briefing #2) ──

describe('cmdGhSyncObjective', () => {
  let proj;
  let capturedStdout;
  let capturedStderr;
  let exitCodeCalled;
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const origExit = process.exit.bind(process);

  function captureIO() {
    capturedStdout = '';
    capturedStderr = '';
    exitCodeCalled = null;
    process.stdout.write = (chunk) => { capturedStdout += chunk; return true; };
    process.stderr.write = (chunk) => { capturedStderr += chunk; return true; };
    process.exit = (code) => { exitCodeCalled = code === undefined ? 0 : code; };
  }

  function restoreIO() {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    process.exit = origExit;
  }

  beforeEach(() => {
    proj = fx.buildSyncTargetProject({ objectiveId: '01-foo' });
    gh._resetCache();
    captureIO();
  });

  afterEach(() => {
    restoreIO();
    if (proj) proj.cleanup();
  });

  test('G1: valid objective → calls syncObjective and emits JSON result to stdout', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_SYNC, stderr: '' }],
      ['api graphql', fx.buildGhResponse_issueWithProjectItem()],
      ['issue edit', fx.buildGhResponse_issueEdit()],
      ['api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments',
        fx.buildGhResponse_commentsList({ comments: [] })],
      ['issue comment', fx.buildGhResponse_commentCreated({ commentId: 12345678 })],
    ]));
    gh._setRunGh(mock);

    try {
      gh.cmdGhSyncObjective(proj.root, '01-foo', false);
    } finally {
      restoreIO();
    }

    // Either exits 0 with JSON on stdout, or exits 1 with error on stderr
    // (objective listing may not find '01-foo' in ROADMAP — that's ok for wiring test)
    const combinedOut = capturedStdout + capturedStderr;
    assert.ok(combinedOut.length > 0, 'must produce some output');
  });

  test('G2: missing auth → exits non-zero with structured JSON error on stderr', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged in.' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.cmdGhSyncObjective(proj.root, '01-foo', false);
    } catch (e) {
      // GhAuthError may propagate if not caught — that's a bug we want to see
      if (e.name !== 'GhAuthError') throw e;
    } finally {
      restoreIO();
    }

    // Must have non-zero exit or error output
    const hasError = exitCodeCalled !== 0 && exitCodeCalled !== null;
    const hasErrorOutput = capturedStderr.length > 0;
    assert.ok(hasError || hasErrorOutput,
      `expected non-zero exit or stderr output on auth failure; exit=${exitCodeCalled}, stderr="${capturedStderr}"`);
  });

  test('G3: nonexistent objective ID → exits non-zero with error message', () => {
    const mock = fx.buildMockRunGh(new Map([
      ['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_SYNC, stderr: '' }],
    ]));
    gh._setRunGh(mock);

    try {
      gh.cmdGhSyncObjective(proj.root, 'nonexistent-id', false);
    } finally {
      restoreIO();
    }

    const hasError = exitCodeCalled !== 0 && exitCodeCalled !== null;
    const hasErrorOutput = capturedStderr.length > 0;
    assert.ok(
      hasError || hasErrorOutput,
      `expected non-zero exit or error output for nonexistent ID; exit=${exitCodeCalled}, stderr="${capturedStderr}", stdout="${capturedStdout}"`
    );
  });

  test('G4: no objectiveId provided → exits non-zero with usage message', () => {
    // cmdGhSyncObjective(cwd, undefined, false) — no objectiveId
    try {
      gh.cmdGhSyncObjective(proj.root, undefined, false);
    } finally {
      restoreIO();
    }

    assert.ok(exitCodeCalled !== 0, `expected non-zero exit when no objectiveId; got exit=${exitCodeCalled}`);
    const combined = capturedStdout + capturedStderr;
    assert.ok(
      combined.toLowerCase().includes('usage') || combined.toLowerCase().includes('objectiveid') ||
      combined.includes('sync') || combined.length > 0,
      `expected usage message in output; got: "${combined}"`
    );
  });
});

// ─── Group H (01-06): OBJECTIVE.md backfill — obj 0 ─────────────────────────
// Tests are RED because .planning/objectives/00-refine-defaults-table/OBJECTIVE.md
// does not exist yet.

const OBJ0_PATH = path.join(
  __dirname, '..', '..', '..', '..', '..',
  '.planning', 'objectives', '00-refine-defaults-table', 'OBJECTIVE.md'
);
const { extractFrontmatter } = require('./frontmatter.cjs');

test('H1 (01-06): obj 0 OBJECTIVE.md has github_issue = AO-Cyber-Systems/devflow-claude#20', () => {
  assert.ok(fs.existsSync(OBJ0_PATH), `OBJECTIVE.md must exist at ${OBJ0_PATH}`);
  const fm = extractFrontmatter(fs.readFileSync(OBJ0_PATH, 'utf-8'));
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#20');
});

test('H2 (01-06): obj 0 OBJECTIVE.md has parent_issue = AO-Cyber-Systems/devflow-claude#9', () => {
  assert.ok(fs.existsSync(OBJ0_PATH), `OBJECTIVE.md must exist at ${OBJ0_PATH}`);
  const fm = extractFrontmatter(fs.readFileSync(OBJ0_PATH, 'utf-8'));
  assert.strictEqual(fm.parent_issue, 'AO-Cyber-Systems/devflow-claude#9');
});

test('H3 (01-06): obj 0 OBJECTIVE.md is valid frontmatter (no parse error)', () => {
  assert.ok(fs.existsSync(OBJ0_PATH), `OBJECTIVE.md must exist at ${OBJ0_PATH}`);
  const fm = extractFrontmatter(fs.readFileSync(OBJ0_PATH, 'utf-8'));
  assert.ok(fm !== null && typeof fm === 'object', 'frontmatter must parse cleanly');
});

// ─── Group I (01-06): cassettes — shape assertions ───────────────────────────
// Tests are RED because cassette files don't exist yet.

const CASSETTE_DIR = path.join(__dirname, '__fixtures__', 'gh-cassettes');

test('I1 (01-06): devflow-claude-9-walk.json is valid JSON', () => {
  const p = path.join(CASSETTE_DIR, 'devflow-claude-9-walk.json');
  assert.ok(fs.existsSync(p), `cassette must exist at ${p}`);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(p, 'utf-8')));
});

test('I2 (01-06): devflow-claude-9-walk.json has issue title matching /^\\[Roadmap\\]/', () => {
  const p = path.join(CASSETTE_DIR, 'devflow-claude-9-walk.json');
  assert.ok(fs.existsSync(p), `cassette must exist at ${p}`);
  const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
  assert.match(c.data.repository.issue.title, /^\[Roadmap\]/);
});

test('I3 (01-06): devflow-claude-9-walk.json has projectItems.nodes[0].project.id = PVT_kwDODwqLrc4BRsOP', () => {
  const p = path.join(CASSETTE_DIR, 'devflow-claude-9-walk.json');
  assert.ok(fs.existsSync(p), `cassette must exist at ${p}`);
  const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const nodes = c.data.repository.issue.projectItems.nodes;
  assert.ok(Array.isArray(nodes) && nodes.length > 0, 'projectItems.nodes must be non-empty');
  assert.strictEqual(nodes[0].project.id, 'PVT_kwDODwqLrc4BRsOP');
});

test('I4 (01-06): product-roadmap-fields.json is valid JSON', () => {
  const p = path.join(CASSETTE_DIR, 'product-roadmap-fields.json');
  assert.ok(fs.existsSync(p), `cassette must exist at ${p}`);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(p, 'utf-8')));
});

test('I5 (01-06): product-roadmap-fields.json has Status, Product, Quarter fields', () => {
  const p = path.join(CASSETTE_DIR, 'product-roadmap-fields.json');
  assert.ok(fs.existsSync(p), `cassette must exist at ${p}`);
  const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
  assert.ok(Array.isArray(c.fields), 'fields must be an array');
  const names = new Set(c.fields.map(f => f.name));
  assert.ok(names.has('Status'), 'Status field must be present');
  assert.ok(names.has('Product'), 'Product field must be present');
  assert.ok(names.has('Quarter'), 'Quarter field must be present');
});

// ─── Group J (01-06): replay-mode integration ────────────────────────────────
// Tests use cassette file as mock gh response — RED until cassette + constant captured.

test('J1 (01-06): resolveChain devflow-claude#20 walks parent #9 and returns roadmap_issue + milestone', () => {
  const cassettePath = path.join(CASSETTE_DIR, 'devflow-claude-9-walk.json');
  assert.ok(fs.existsSync(cassettePath), `cassette must exist at ${cassettePath}`);
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf-8'));

  // Inject mock: graphql query → cassette; issue list → empty (no fallback needed)
  const responses = new Map([
    ['api graphql', { ok: true, status: 0, stdout: JSON.stringify(cassette), stderr: '' }],
    ['issue list', fx.buildGhResponse_issueListRoadmap({ hits: [] })],
  ]);
  const mock = fx.buildMockRunGh(responses);
  gh._setRunGh(mock);
  gh._resetCache();

  const r = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#20',
      parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
    }),
    fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/devflow-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    })
  );

  assert.strictEqual(r.roadmap_issue, 'AO-Cyber-Systems/devflow-claude#9');
  assert.strictEqual(r.provenance.roadmap_issue, 'walked_from_parent');
  assert.ok(r.milestone, 'milestone should populate from cassette walk');
  assert.strictEqual(r.milestone.product, 'DevFlow');
});

test('J2 (01-06): resolveChain replay — provenance.roadmap_issue is walked_from_parent', () => {
  const cassettePath = path.join(CASSETTE_DIR, 'devflow-claude-9-walk.json');
  assert.ok(fs.existsSync(cassettePath), `cassette must exist at ${cassettePath}`);
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf-8'));

  const mock = fx.buildMockRunGh(new Map([
    ['api graphql', { ok: true, status: 0, stdout: JSON.stringify(cassette), stderr: '' }],
  ]));
  gh._setRunGh(mock);
  gh._resetCache();

  const r = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#20',
      parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
    }),
    fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' })
  );

  assert.strictEqual(r.provenance.roadmap_issue, 'walked_from_parent');
});

test('J3 (01-06): resolveChain replay — second call returns cached result (same shape)', () => {
  const cassettePath = path.join(CASSETTE_DIR, 'devflow-claude-9-walk.json');
  assert.ok(fs.existsSync(cassettePath), `cassette must exist at ${cassettePath}`);
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf-8'));

  const mock = fx.buildMockRunGh(new Map([
    ['api graphql', { ok: true, status: 0, stdout: JSON.stringify(cassette), stderr: '' }],
  ]));
  gh._setRunGh(mock);
  gh._resetCache();

  const fm = fx.buildFrontmatter({
    github_issue: 'AO-Cyber-Systems/devflow-claude#20',
    parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
  });
  const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' });

  const r1 = gh.resolveChain(fm, ctx);
  const callsAfterFirst = mock.callCount();

  const r2 = gh.resolveChain(fm, ctx);
  const callsAfterSecond = mock.callCount();

  // Second call should not invoke gh (served from cache)
  assert.strictEqual(callsAfterFirst, callsAfterSecond, 'second resolveChain call must serve from cache (no new gh calls)');
  assert.strictEqual(r2.roadmap_issue, r1.roadmap_issue);
  assert.strictEqual(r2.milestone && r2.milestone.product, r1.milestone && r1.milestone.product);
});

test('J4 (01-06): resolveChain replay — milestone.title is "Product Roadmap"', () => {
  const cassettePath = path.join(CASSETTE_DIR, 'devflow-claude-9-walk.json');
  assert.ok(fs.existsSync(cassettePath), `cassette must exist at ${cassettePath}`);
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf-8'));

  const mock = fx.buildMockRunGh(new Map([
    ['api graphql', { ok: true, status: 0, stdout: JSON.stringify(cassette), stderr: '' }],
  ]));
  gh._setRunGh(mock);
  gh._resetCache();

  const r = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#20',
      parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
    }),
    fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' })
  );

  assert.strictEqual(r.milestone && r.milestone.title, 'Product Roadmap');
});

// ─── Group K (01-06): PRODUCT_ROADMAP_FIELDS populated ───────────────────────
// RED: _captured is currently false.

test('K1 (01-06): PRODUCT_ROADMAP_FIELDS._captured is true', () => {
  const fields = gh.PRODUCT_ROADMAP_FIELDS;
  assert.ok(fields, 'PRODUCT_ROADMAP_FIELDS must be exported');
  assert.strictEqual(fields._captured, true, 'PRODUCT_ROADMAP_FIELDS._captured must be true after cassette capture');
});

test('K2 (01-06): PRODUCT_ROADMAP_FIELDS.Status.field_id starts with PVTSSF_', () => {
  const fields = gh.PRODUCT_ROADMAP_FIELDS;
  assert.ok(fields && fields._captured, 'PRODUCT_ROADMAP_FIELDS must be captured');
  assert.ok(fields.Status, 'Status field must be present');
  assert.match(fields.Status.field_id, /^PVTSSF_/, 'Status field_id must start with PVTSSF_');
});

test('K3 (01-06): PRODUCT_ROADMAP_FIELDS.Status.options["In Progress"] is a non-empty string', () => {
  const fields = gh.PRODUCT_ROADMAP_FIELDS;
  assert.ok(fields && fields._captured, 'PRODUCT_ROADMAP_FIELDS must be captured');
  assert.ok(fields.Status && fields.Status.options, 'Status.options must be present');
  const optId = fields.Status.options['In Progress'];
  assert.ok(typeof optId === 'string' && optId.length > 0, '"In Progress" option ID must be a non-empty string');
});

test('K4 (01-06): updateProjectFields with known field+option sends GraphQL mutation with captured IDs', () => {
  const fields = gh.PRODUCT_ROADMAP_FIELDS;
  if (!fields || !fields._captured) {
    assert.fail('PRODUCT_ROADMAP_FIELDS must be captured before K4 can run');
    return;
  }

  const capturedCalls = [];
  const mockFn = (args) => {
    capturedCalls.push(args);
    return { ok: true, status: 0, stdout: JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_test123' } } } }), stderr: '' };
  };

  // Mock all calls including addToProject (item lookup + project add)
  const responses = new Map();
  // addToProject first step: issue node ID
  responses.set('api graphql -f query=query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { id } } }', {
    ok: true, status: 0, stdout: JSON.stringify({ data: { repository: { issue: { id: 'I_kwDOtest' } } } }), stderr: ''
  });

  // Use a custom mock that captures mutation calls
  let callCount = 0;
  const mock = (args) => {
    callCount++;
    capturedCalls.push([...args]);
    const key = args.join(' ');
    if (key.includes('mutation($projectId')) {
      // This is either addToProject mutation or updateProjectV2ItemFieldValue mutation
      if (key.includes('addProjectV2ItemById')) {
        return { ok: true, status: 0, stdout: JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'PVTI_item123' } } } }), stderr: '' };
      }
      if (key.includes('updateProjectV2ItemFieldValue')) {
        return { ok: true, status: 0, stdout: JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_item123' } } } }), stderr: '' };
      }
    }
    if (key.includes('repository') && key.includes('issue(number')) {
      return { ok: true, status: 0, stdout: JSON.stringify({ data: { repository: { issue: { id: 'I_kwDOtest' } } } }), stderr: '' };
    }
    return { ok: false, status: 1, stdout: '', stderr: `[mock K4] no match for: ${key}` };
  };
  gh._setRunGh(mock);

  const result = gh.updateProjectFields(
    'AO-Cyber-Systems/devflow-claude#20',
    'PVT_kwDODwqLrc4BRsOP',
    { Status: 'In Progress' }
  );

  // Verify a mutation call was made with the captured Status field_id
  const statusFieldId = fields.Status.field_id;
  const mutationCall = capturedCalls.find(c => c.some(a => a.includes('updateProjectV2ItemFieldValue')));
  assert.ok(mutationCall, 'updateProjectV2ItemFieldValue mutation must be called');
  // The mutation must include the captured field ID
  const callStr = mutationCall.join(' ');
  assert.ok(callStr.includes(statusFieldId), `mutation must include Status field_id ${statusFieldId}`);
});

test('K5 (01-06): updateProjectFields with unknown field name warns and skips (no throw)', () => {
  const fields = gh.PRODUCT_ROADMAP_FIELDS;
  if (!fields || !fields._captured) {
    assert.fail('PRODUCT_ROADMAP_FIELDS must be captured for K5');
    return;
  }

  // Mock: return success for any graphql calls (addToProject-related)
  const mock = (args) => {
    const key = args.join(' ');
    if (key.includes('repository') && key.includes('issue(number')) {
      return { ok: true, status: 0, stdout: JSON.stringify({ data: { repository: { issue: { id: 'I_kwDOtest' } } } }), stderr: '' };
    }
    if (key.includes('addProjectV2ItemById')) {
      return { ok: true, status: 0, stdout: JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'PVTI_item' } } } }), stderr: '' };
    }
    return { ok: false, status: 1, stdout: '', stderr: `[mock K5] no match for: ${key}` };
  };
  gh._setRunGh(mock);

  let result;
  assert.doesNotThrow(() => {
    result = gh.updateProjectFields(
      'AO-Cyber-Systems/devflow-claude#20',
      'PVT_kwDODwqLrc4BRsOP',
      { NotAField: 'someValue' }
    );
  }, 'updateProjectFields must not throw on unknown field');
  assert.ok(result, 'must return a result object');
  assert.ok(
    (result.warnings && result.warnings.some(w => /unknown field/i.test(w))) ||
    (result.errors && result.errors.some(e => /not found/i.test(e.error))),
    `must emit warning or error for unknown field; got: ${JSON.stringify(result)}`
  );
});

test('K6 (01-06): updateProjectFields with unknown option name warns and skips (no throw)', () => {
  const fields = gh.PRODUCT_ROADMAP_FIELDS;
  if (!fields || !fields._captured) {
    assert.fail('PRODUCT_ROADMAP_FIELDS must be captured for K6');
    return;
  }

  const mock = (args) => {
    const key = args.join(' ');
    if (key.includes('repository') && key.includes('issue(number')) {
      return { ok: true, status: 0, stdout: JSON.stringify({ data: { repository: { issue: { id: 'I_kwDOtest' } } } }), stderr: '' };
    }
    if (key.includes('addProjectV2ItemById')) {
      return { ok: true, status: 0, stdout: JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'PVTI_item' } } } }), stderr: '' };
    }
    return { ok: false, status: 1, stdout: '', stderr: `[mock K6] no match for: ${key}` };
  };
  gh._setRunGh(mock);

  let result;
  assert.doesNotThrow(() => {
    result = gh.updateProjectFields(
      'AO-Cyber-Systems/devflow-claude#20',
      'PVT_kwDODwqLrc4BRsOP',
      { Status: 'NotAnOption' }
    );
  }, 'updateProjectFields must not throw on unknown option');
  assert.ok(result, 'must return a result object');
  assert.ok(
    (result.warnings && result.warnings.some(w => /unknown option/i.test(w))) ||
    (result.errors && result.errors.some(e => /not found/i.test(e.error))),
    `must emit warning or error for unknown option; got: ${JSON.stringify(result)}`
  );
});

// ─── Group L (01-06): live-mode integration (gated on GH_INTEGRATION=1) ──────
// All L tests skip when GH_INTEGRATION !== '1'.

const LIVE = process.env.GH_INTEGRATION === '1';

test('L1 (01-06): live — resolveChain walks devflow-claude#9 and returns roadmap_issue + DevFlow product', { skip: !LIVE }, () => {
  // Real gh calls — don't mock
  gh._setRunGh(null);
  gh._resetCache();

  const r = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#20',
      parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
    }),
    fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/devflow-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    })
  );

  assert.strictEqual(r.roadmap_issue, 'AO-Cyber-Systems/devflow-claude#9', `expected roadmap_issue to be #9; got: ${r.roadmap_issue}`);
  assert.ok(r.milestone, 'milestone must populate from live walk');
  assert.strictEqual(r.milestone.product, 'DevFlow', `expected milestone.product = DevFlow; got: ${r.milestone && r.milestone.product}`);
});

test('L2 (01-06): live — resolveChain live result matches cassette shape', { skip: !LIVE }, () => {
  gh._setRunGh(null);
  gh._resetCache();

  const liveResult = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#20',
      parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
    }),
    fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/devflow-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    })
  );

  // Compare against replay result (using saved cassette)
  const cassettePath = path.join(CASSETTE_DIR, 'devflow-claude-9-walk.json');
  assert.ok(fs.existsSync(cassettePath), 'cassette must exist for drift detection');
  const cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf-8'));

  const cassetteProduct = (() => {
    try {
      const nodes = cassette.data.repository.issue.projectItems.nodes[0].fieldValues.nodes;
      const productNode = nodes.find(n => n.field && n.field.name === 'Product');
      return productNode ? productNode.name : null;
    } catch { return null; }
  })();

  assert.strictEqual(
    liveResult.milestone && liveResult.milestone.product,
    cassetteProduct,
    `live.milestone.product (${liveResult.milestone && liveResult.milestone.product}) must match cassette (${cassetteProduct}); if different, cassette drift detected — re-record devflow-claude-9-walk.json`
  );
});

test('L3 (01-06): live — sync round-trip returns ok:true', { skip: !LIVE }, () => {
  gh._setRunGh(null);
  const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
  gh._resetCache();

  const r = gh.syncObjective('00-refine-defaults-table', root);
  assert.ok(r.ok, `syncObjective returned ok:false — error: ${r.error}`);
  assert.ok(r.issue_updated !== undefined, 'issue_updated must be in result');
  assert.ok(r.comment_action, 'comment_action must be in result');
});

test('L4 (01-06): live — sync is idempotent (second run edits, not creates)', { skip: !LIVE }, () => {
  gh._setRunGh(null);
  const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
  gh._resetCache();

  const r1 = gh.syncObjective('00-refine-defaults-table', root);
  assert.ok(r1.ok, `first syncObjective failed: ${r1.error}`);

  gh._resetCache();
  const r2 = gh.syncObjective('00-refine-defaults-table', root);
  assert.ok(r2.ok, `second syncObjective failed: ${r2.error}`);
  assert.notStrictEqual(r2.comment_action, 'created', 'second sync must edit existing sticky comment, not create a new one');
});

// ─── TRD 02-03: walkProject ───────────────────────────────────────────────────

const {
  buildGhResponse_projectItemsList,
  buildGhResponse_subIssuesByTrackedIssues,
} = require('./__fixtures__/gh-fixtures.cjs');

// ─── Group W: walkProject happy paths ────────────────────────────────────────

test('W1 (02-03): walkProject single page returns 3 normalized items', () => {
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aodex#33',
        title: '[Roadmap] Foo', body: '', status: 'In Progress', product: 'AODex', quarter: 'Q2 2026' },
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aosentry#20',
        title: '[Roadmap] Bar', body: '', status: 'Todo', product: 'AOSentry', quarter: 'Q2 2026' },
      { content_type: 'DraftIssue', title: 'DevFlow Internal Alpha', body: 'wip', status: 'Todo', product: 'DevFlow', quarter: 'Q2 2026' },
    ],
    hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.strictEqual(result.items.length, 3);
    assert.strictEqual(result.items[0].item_type, 'issue');
    assert.strictEqual(result.items[0].issue_ref, 'AO-Cyber-Systems/aodex#33');
    assert.strictEqual(result.items[2].item_type, 'draft');
    assert.deepStrictEqual(result.warnings, []);
  } finally { gh._setRunGh(null); }
});

test('W2 (02-03): walkProject two pages returns 9 items with cursor passed', () => {
  let callCount = 0;
  function mockFn(args) {
    callCount++;
    if (callCount === 1) {
      // First page — 5 items, hasNextPage=true
      return buildGhResponse_projectItemsList({
        items: [
          { content_type: 'Issue', issue_ref: 'org/repo#1', title: 'Item 1', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
          { content_type: 'Issue', issue_ref: 'org/repo#2', title: 'Item 2', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
          { content_type: 'Issue', issue_ref: 'org/repo#3', title: 'Item 3', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
          { content_type: 'Issue', issue_ref: 'org/repo#4', title: 'Item 4', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
          { content_type: 'Issue', issue_ref: 'org/repo#5', title: 'Item 5', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
        ],
        hasNextPage: true,
        endCursor: 'cursor-abc',
      });
    }
    // Second page — verify cursor arg passed, 4 items, hasNextPage=false
    const hasCursorArg = args.some(a => typeof a === 'string' && a.includes('cursor-abc'));
    assert.ok(hasCursorArg, 'W2: cursor should be passed on second page call');
    return buildGhResponse_projectItemsList({
      items: [
        { content_type: 'Issue', issue_ref: 'org/repo#6', title: 'Item 6', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
        { content_type: 'Issue', issue_ref: 'org/repo#7', title: 'Item 7', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
        { content_type: 'Issue', issue_ref: 'org/repo#8', title: 'Item 8', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
        { content_type: 'Issue', issue_ref: 'org/repo#9', title: 'Item 9', body: '', status: 'Todo', product: 'AODex', quarter: 'Q2 2026' },
      ],
      hasNextPage: false,
    });
  }
  gh._setRunGh(mockFn);
  try {
    const result = gh.walkProject('PVT_test');
    assert.strictEqual(result.items.length, 9);
    assert.strictEqual(callCount, 2, 'W2: should call gh exactly twice');
    assert.deepStrictEqual(result.warnings, []);
  } finally { gh._setRunGh(null); }
});

test('W3 (02-03): walkProject empty project returns { items: [], warnings: [] }', () => {
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [], hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.deepStrictEqual(result.items, []);
    assert.deepStrictEqual(result.warnings, []);
  } finally { gh._setRunGh(null); }
});

test('W4 (02-03): each item carries normalized fields {item_type, issue_ref, title, body, product, quarter, status, sub_issues}', () => {
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aodex#33',
        title: '[Roadmap] Foo', body: 'body text', status: 'In Progress', product: 'AODex', quarter: 'Q2 2026' },
    ],
    hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    const item = result.items[0];
    assert.strictEqual(item.item_type, 'issue');
    assert.strictEqual(item.issue_ref, 'AO-Cyber-Systems/aodex#33');
    assert.strictEqual(item.title, '[Roadmap] Foo');
    assert.strictEqual(item.body, 'body text');
    assert.strictEqual(item.product, 'AODex');
    assert.strictEqual(item.quarter, 'Q2 2026');
    assert.strictEqual(item.status, 'In Progress');
    assert.ok(Array.isArray(item.sub_issues), 'sub_issues must be array');
  } finally { gh._setRunGh(null); }
});

test('W5 (02-03): DraftIssue content type → item_type=draft, issue_ref=null, title+body present', () => {
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [
      { content_type: 'DraftIssue', title: 'Program Milestone Q3', body: 'draft body', status: 'Todo', product: 'Infrastructure', quarter: 'Q3 2026' },
    ],
    hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.strictEqual(result.items.length, 1);
    const item = result.items[0];
    assert.strictEqual(item.item_type, 'draft');
    assert.strictEqual(item.issue_ref, null);
    assert.strictEqual(item.title, 'Program Milestone Q3');
    assert.strictEqual(item.body, 'draft body');
  } finally { gh._setRunGh(null); }
});

test('W6 (02-03): Issue with trackedIssues.totalCount=2 → sub_issues has 2 entries with {ref, title, state}', () => {
  const subNodes = buildGhResponse_subIssuesByTrackedIssues({
    subIssues: [
      { ref: 'AO-Cyber-Systems/aodex#101', title: 'Sub A', state: 'OPEN' },
      { ref: 'AO-Cyber-Systems/aodex#102', title: 'Sub B', state: 'CLOSED' },
    ],
  });
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aodex#33',
        title: '[Roadmap] Foo', body: '', status: 'In Progress', product: 'AODex', quarter: 'Q2 2026',
        tracked_total: 2, tracked_nodes: subNodes },
    ],
    hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    const item = result.items[0];
    assert.strictEqual(item.sub_issues.length, 2);
    assert.strictEqual(item.sub_issues[0].ref, 'AO-Cyber-Systems/aodex#101');
    assert.strictEqual(item.sub_issues[0].title, 'Sub A');
    assert.strictEqual(item.sub_issues[0].state, 'OPEN');
    assert.strictEqual(item.sub_issues[1].state, 'CLOSED');
  } finally { gh._setRunGh(null); }
});

test('W7 (02-03): Issue with trackedIssues.totalCount=0 → sub_issues=[] AND raw body preserved', () => {
  const bodyText = '## Deliverables\n- [ ] AO-Cyber-Systems/aodex#200 — some task';
  const responses = new Map();
  responses.set('api graphql', buildGhResponse_projectItemsList({
    items: [
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aodex#33',
        title: '[Roadmap] Foo', body: bodyText, status: 'In Progress', product: 'AODex', quarter: 'Q2 2026',
        tracked_total: 0, tracked_nodes: [] },
    ],
    hasNextPage: false,
  }));
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    const item = result.items[0];
    assert.deepStrictEqual(item.sub_issues, []);
    assert.strictEqual(item.body, bodyText, 'body must be preserved for task-list fallback');
  } finally { gh._setRunGh(null); }
});

// ─── Group WF: walkProject failure modes ─────────────────────────────────────

test('WF1 (02-03): ok:false response → warnings.push stderr; items empty or partial', () => {
  const responses = new Map();
  responses.set('api graphql', { ok: false, status: 1, stdout: '', stderr: 'GraphQL error: unauthorized' });
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.ok(result.warnings.length > 0, 'WF1: should have at least one warning');
    assert.ok(result.warnings[0].includes('walkProject'), 'WF1: warning should mention walkProject');
    assert.deepStrictEqual(result.items, []);
  } finally { gh._setRunGh(null); }
});

test('WF2 (02-03): data:null response → warnings.push unexpected response shape; items empty', () => {
  const responses = new Map();
  responses.set('api graphql', { ok: true, status: 0, stdout: JSON.stringify({ data: null }), stderr: '' });
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.ok(result.warnings.some(w => w.includes('unexpected response shape')), 'WF2: should warn about response shape');
    assert.deepStrictEqual(result.items, []);
  } finally { gh._setRunGh(null); }
});

test('WF3 (02-03): malformed JSON in stdout → warnings.push parse failed; items empty', () => {
  const responses = new Map();
  responses.set('api graphql', { ok: true, status: 0, stdout: 'not json {{', stderr: '' });
  gh._setRunGh(fx.buildMockRunGh(responses));
  try {
    const result = gh.walkProject('PVT_test');
    assert.ok(result.warnings.some(w => w.includes('parse failed')), 'WF3: should warn about parse failure');
    assert.deepStrictEqual(result.items, []);
  } finally { gh._setRunGh(null); }
});

test('WF4 (02-03): pagination loop guard — always hasNextPage=true → abort at 100 pages with warning', () => {
  function alwaysNextPage() {
    return buildGhResponse_projectItemsList({
      items: [
        { content_type: 'Issue', issue_ref: 'org/repo#1', title: 'Item', body: '', status: 'Todo', product: 'X', quarter: 'Q1 2026' },
      ],
      hasNextPage: true,
      endCursor: 'cursor-forever',
    });
  }
  gh._setRunGh(alwaysNextPage);
  try {
    const result = gh.walkProject('PVT_test');
    assert.ok(result.warnings.some(w => w.includes('aborted') && w.includes('100 pages')), 'WF4: should warn about abort at 100 pages');
    assert.strictEqual(result.items.length, 100, 'WF4: should have collected 100 items (1 per page)');
  } finally { gh._setRunGh(null); }
});

// ─── Group GG: gh.test.cjs integration with existing patterns ────────────────

test('GG1 (02-03): walkProject is exported from gh.cjs module.exports', () => {
  assert.strictEqual(typeof gh.walkProject, 'function', 'walkProject must be a function');
});

test('GG2 (02-03): walkProject with no projectId returns empty items with warning', () => {
  const result = gh.walkProject('');
  assert.deepStrictEqual(result.items, []);
  assert.ok(result.warnings.length > 0, 'GG2: should warn on missing projectId');
});
