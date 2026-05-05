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

// ─── TRD 01-04: syncObjective fixture builders ───────────────────────────────

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Build a tmp project with OBJECTIVE.md + N stub TRD files + M stub SUMMARY files + ROADMAP.md.
 * Returns { root, objectiveId, cleanup, expected }.
 */
function buildSyncTargetProject({
  objectiveId = '01-foo',
  github_issue = 'AO-Cyber-Systems/devflow-claude#10',
  parent_issue = 'AO-Cyber-Systems/devflow-claude#9',
  org_project = 'PVT_kwDODwqLrc4BRsOP',
  github_repo = 'AO-Cyber-Systems/devflow-claude',
  trd_count = 3,
  summary_count = 1,
  goal = 'Test objective goal',
  success_criteria = [
    { id: 'SC-1', text: 'first criterion', done: true },
    { id: 'SC-2', text: 'second criterion', done: false },
  ],
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-sync-test-'));

  // .planning/PROJECT.md
  const planningDir = path.join(root, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(
    path.join(planningDir, 'PROJECT.md'),
    `---\nkind: plugin\ngithub_repo: ${github_repo}\norg_project: ${org_project}\n---\n\n# Test Project\n`,
    'utf-8'
  );

  // .planning/ROADMAP.md with the objective
  const objNum = parseInt(objectiveId.match(/^(\d+)/)?.[1] || '1', 10);
  const roadmapContent = [
    '# ROADMAP',
    '',
    `### Objective ${objNum}: Test Objective`,
    '',
    `**Goal:** ${goal}`,
    '',
    '**Success Criteria:**',
    ...success_criteria.map((sc, i) => `${i + 1}. ${sc.text}`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmapContent, 'utf-8');

  // .planning/objectives/<objectiveId>/
  const objDir = path.join(planningDir, 'objectives', objectiveId);
  fs.mkdirSync(objDir, { recursive: true });

  // OBJECTIVE.md
  const objFm = [
    '---',
    `github_issue: ${github_issue}`,
    `parent_issue: ${parent_issue}`,
    `org_project: ${org_project}`,
    '---',
    '',
    `# Objective ${objNum}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(objDir, 'OBJECTIVE.md'), objFm, 'utf-8');

  // TRD files
  const objPrefix = objectiveId.replace(/^(\d+)-.*$/, (_, n) => n.padStart(2, '0'));
  for (let i = 1; i <= trd_count; i++) {
    const trdName = `${objPrefix}-0${i}-task-${i}-TRD.md`;
    fs.writeFileSync(
      path.join(objDir, trdName),
      `---\ntitle: Task ${i}\nwave: ${i}\n---\n\n# TRD ${i}\n`,
      'utf-8'
    );
  }

  // SUMMARY files (for the first summary_count TRDs)
  for (let i = 1; i <= summary_count; i++) {
    const summaryName = `${objPrefix}-0${i}-task-${i}-SUMMARY.md`;
    fs.writeFileSync(
      path.join(objDir, summaryName),
      `# Summary ${i}\n\nSC-${i} addressed.\n`,
      'utf-8'
    );
  }

  function cleanup() {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }

  return {
    root,
    objectiveId,
    cleanup,
    expected: {
      trd_total: trd_count,
      trd_done: summary_count,
      current_wave: summary_count < trd_count ? summary_count + 1 : trd_count,
      summary_count,
    },
  };
}

/**
 * Canned response for `gh api repos/.../issues/{N}/comments` listing.
 */
function buildGhResponse_commentsList({ comments = [] } = {}) {
  return { ok: true, status: 0, stdout: JSON.stringify(comments), stderr: '' };
}

/**
 * Canned response for `gh issue comment {issue} --body ...` (POST creating new comment).
 * The stdout is the URL of the created comment.
 */
function buildGhResponse_commentCreated({ commentId = 12345678, htmlUrl } = {}) {
  return {
    ok: true,
    status: 0,
    stdout: htmlUrl || `https://github.com/AO-Cyber-Systems/devflow-claude/issues/10#issuecomment-${commentId}`,
    stderr: '',
  };
}

/**
 * Canned response for `gh issue edit --body ...`.
 */
function buildGhResponse_issueEdit({ issueNumber = 10 } = {}) {
  return {
    ok: true,
    status: 0,
    stdout: `https://github.com/AO-Cyber-Systems/devflow-claude/issues/${issueNumber}`,
    stderr: '',
  };
}

/**
 * Canned response for a PATCH on a comment (edit in-place).
 */
function buildGhResponse_commentPatch({ commentId = 12345678 } = {}) {
  return {
    ok: true,
    status: 0,
    stdout: JSON.stringify({ id: commentId, body: '<!-- df:state -->\n...' }),
    stderr: '',
  };
}

// ─── TRD 02-03: walkProject + scanOrg fixtures ───────────────────────────────

/**
 * Canned GraphQL response for `gh api graphql` walking a Project's items.
 * `items` is an array of:
 *   { content_type: 'Issue'|'DraftIssue', issue_ref?, title, body, status, product, quarter,
 *     tracked_total?, tracked_nodes? }
 * `hasNextPage` defaults to false; `endCursor` defaults to null.
 */
function buildGhResponse_projectItemsList({
  items = [],
  hasNextPage = false,
  endCursor = null,
} = {}) {
  const nodes = items.map(item => {
    const content = item.content_type === 'DraftIssue' ? {
      __typename: 'DraftIssue',
      title: item.title || 'Draft',
      body: item.body || '',
    } : (() => {
      const m = (item.issue_ref || '').match(/^([^/]+)\/([^#]+)#(\d+)$/);
      return {
        __typename: 'Issue',
        number: m ? parseInt(m[3], 10) : null,
        title: item.title || 'Issue',
        body: item.body || '',
        repository: m ? { nameWithOwner: `${m[1]}/${m[2]}` } : null,
        trackedIssues: {
          totalCount: (item.tracked_total != null) ? item.tracked_total : 0,
          nodes: item.tracked_nodes || [],
        },
      };
    })();
    const fieldValues = { nodes: [] };
    if (item.status) fieldValues.nodes.push({ name: item.status, field: { name: 'Status' } });
    if (item.product) fieldValues.nodes.push({ name: item.product, field: { name: 'Product' } });
    if (item.quarter) fieldValues.nodes.push({ name: item.quarter, field: { name: 'Quarter' } });
    return { content, fieldValues };
  });

  return {
    ok: true, status: 0,
    stdout: JSON.stringify({
      data: { node: { items: { pageInfo: { hasNextPage, endCursor }, nodes } } },
    }),
    stderr: '',
  };
}

/**
 * Helper: build a trackedIssues node array for use in items[].tracked_nodes.
 * Each entry shapes as { number, title, state, repository: { nameWithOwner } }.
 * subIssues: [{ ref: 'owner/repo#NN', title, state }]
 */
function buildGhResponse_subIssuesByTrackedIssues({ subIssues = [] } = {}) {
  return subIssues.map(s => {
    const m = s.ref.match(/^([^/]+)\/([^#]+)#(\d+)$/);
    return {
      number: m ? parseInt(m[3], 10) : 0,
      title: s.title || 'Sub-issue',
      state: s.state || 'OPEN',
      repository: m ? { nameWithOwner: `${m[1]}/${m[2]}` } : null,
    };
  });
}

/**
 * Helper: build an Issue body string with task-list bullet items for fallback parsing.
 * `entries`: [{ ref, title?, checked? }]
 *   ref: 'AO-Cyber-Systems/aodex#101' or '#50'
 *   title: optional; rendered as `- [ ] <ref> — <title>`
 *   checked: bool, default false
 */
function buildGhResponse_subIssuesByTaskList({ entries = [], header = '## Deliverables\n\n' } = {}) {
  const lines = [header];
  for (const e of entries) {
    const mark = e.checked ? 'x' : ' ';
    const titlePart = e.title ? ` — ${e.title}` : '';
    lines.push(`- [${mark}] ${e.ref}${titlePart}`);
  }
  return lines.join('\n');
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
  // TRD 01-04:
  buildSyncTargetProject,
  buildGhResponse_commentsList,
  buildGhResponse_commentCreated,
  buildGhResponse_issueEdit,
  buildGhResponse_commentPatch,
  // TRD 02-03:
  buildGhResponse_projectItemsList,
  buildGhResponse_subIssuesByTrackedIssues,
  buildGhResponse_subIssuesByTaskList,
};
