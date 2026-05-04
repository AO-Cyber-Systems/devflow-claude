'use strict';

// Hand-built fixture builders for gh resolver tests.
// Per TDD Playbook habit 4: factory functions, not LLM-generated test data.

/**
 * Build a frontmatter dict for resolveChain tests.
 * All fields are optional — pass only the fields relevant to the test case.
 */
function buildFrontmatter({
  github_issue,
  parent_issue,
  org_initiative,
  org_project,
  _objectiveId,   // private — used as fallback cache key
} = {}) {
  const fm = {};
  if (github_issue !== undefined) fm.github_issue = github_issue;
  if (parent_issue !== undefined) fm.parent_issue = parent_issue;
  if (org_initiative !== undefined) fm.org_initiative = org_initiative;
  if (org_project !== undefined) fm.org_project = org_project;
  if (_objectiveId !== undefined) fm._objectiveId = _objectiveId;
  return fm;
}

/**
 * Build a projectCtx dict for resolveChain tests.
 * Mirrors the fields from PROJECT.md frontmatter read by cmdGhResolve.
 */
function buildProjectCtx({ github_repo, org_project } = {}) {
  const ctx = {};
  if (github_repo !== undefined) ctx.github_repo = github_repo;
  if (org_project !== undefined) ctx.org_project = org_project;
  return ctx;
}

/**
 * Build a mock runGh function for unit tests.
 * No live gh CLI calls — returns canned responses keyed by args string.
 *
 * `responses` is a Map<string, { ok, stdout, stderr }> keyed by the joined args string.
 * Matching is: exact match first, then prefix match (longest prefix wins).
 */
function buildMockRunGh(responses = new Map()) {
  let callCount = 0;
  const calls = [];

  function mockRunGh(args, opts) {
    callCount++;
    const key = args.join(' ');
    calls.push({ args, opts, key });

    // Exact match first
    if (responses.has(key)) return responses.get(key);

    // Prefix match (longest prefix wins)
    let bestKey = null;
    let bestLen = -1;
    for (const [k] of responses.entries()) {
      if (key.startsWith(k) && k.length > bestLen) {
        bestKey = k;
        bestLen = k.length;
      }
    }
    if (bestKey !== null) return responses.get(bestKey);

    // Default: not found
    return { ok: false, status: 1, stdout: '', stderr: `[mock] no match for: ${key}` };
  }

  mockRunGh.callCount = () => callCount;
  mockRunGh.calls = () => [...calls];
  return mockRunGh;
}

/**
 * Canned GraphQL response for an issue with a Product Roadmap project item.
 * Hand-edited from observed `gh api graphql` output shape against AO-Cyber-Systems.
 * Only the fields the resolver reads are included — per fixture minimalism.
 */
function buildGhResponse_issueWithProjectItem({
  issueNumber = 9,
  title = '[Roadmap] devflow-claude',
  projectId = 'PVT_kwDODwqLrc4BRsOP',
  projectTitle = 'Product Roadmap',
  product = 'DevFlow',
  quarter = 'Q2 2026',
  status = 'In Progress',
} = {}) {
  return {
    ok: true,
    status: 0,
    stdout: JSON.stringify({
      data: {
        repository: {
          issue: {
            number: issueNumber,
            title,
            projectItems: {
              nodes: [
                {
                  project: { id: projectId, title: projectTitle },
                  fieldValues: {
                    nodes: [
                      { name: status, field: { name: 'Status' } },
                      { name: product, field: { name: 'Product' } },
                      { name: quarter, field: { name: 'Quarter' } },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    }),
    stderr: '',
  };
}

/**
 * Canned response for `gh issue list ... --search '[Roadmap] in:title'`.
 * `hits` is an array of { number, title?, repo? } — minimal shape.
 */
function buildGhResponse_issueListRoadmap({ hits = [] } = {}) {
  return {
    ok: true,
    status: 0,
    stdout: JSON.stringify(
      hits.map(h => ({
        number: h.number,
        title: h.title || `[Roadmap] ${h.repo || 'test'}`,
      }))
    ),
    stderr: '',
  };
}

/**
 * Canned GraphQL response for issue node ID lookup.
 * Used by addToProject and linkSubIssue to look up GitHub-internal node IDs.
 */
function buildGhResponse_issueNodeId({
  owner = 'AO-Cyber-Systems',
  repo = 'devflow-claude',
  number = 9,
  nodeId = 'I_kwDODwqLrc5test1',
} = {}) {
  return {
    ok: true,
    status: 0,
    stdout: JSON.stringify({
      data: {
        repository: {
          issue: { id: nodeId },
        },
      },
    }),
    stderr: '',
  };
}

/**
 * Canned GraphQL response for addProjectV2ItemById mutation.
 * Returns a successful item addition with a canned item ID.
 */
function buildGhResponse_addProjectItem({
  itemId = 'PVTI_lADODwqLrc4BRsOPzgE1test',
} = {}) {
  return {
    ok: true,
    status: 0,
    stdout: JSON.stringify({
      data: {
        addProjectV2ItemById: {
          item: { id: itemId },
        },
      },
    }),
    stderr: '',
  };
}

/**
 * Canned GraphQL response for addSubIssue mutation.
 */
function buildGhResponse_addSubIssue({
  issueId = 'I_kwDODwqLrc5parent1',
} = {}) {
  return {
    ok: true,
    status: 0,
    stdout: JSON.stringify({
      data: {
        addSubIssue: {
          issue: { id: issueId },
        },
      },
    }),
    stderr: '',
  };
}

/**
 * Canned error GraphQL response (simulates authorization failure or schema error).
 */
function buildGhResponse_graphqlError({ message = 'not_authorized' } = {}) {
  return {
    ok: false,
    status: 1,
    stdout: JSON.stringify({ errors: [{ message }] }),
    stderr: message,
  };
}

module.exports = {
  buildFrontmatter,
  buildProjectCtx,
  buildMockRunGh,
  buildGhResponse_issueWithProjectItem,
  buildGhResponse_issueListRoadmap,
  buildGhResponse_issueNodeId,
  buildGhResponse_addProjectItem,
  buildGhResponse_addSubIssue,
  buildGhResponse_graphqlError,
};
