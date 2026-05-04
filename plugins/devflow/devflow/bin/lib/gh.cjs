'use strict';

/**
 * GitHub integration for DevFlow.
 *
 * One-way push from .planning/ -> GitHub via the `gh` CLI. Planning files
 * remain authoritative; if GitHub is unavailable or this module fails the
 * caller must continue without error.
 *
 * Issue/milestone IDs are persisted to .planning/.gh-mapping.json:
 *
 *   { "milestone_id": 12, "objectives": { "1": 42, "2.1": 43 } }
 *
 * TRD 01-02 extensions:
 *   resolveChain(frontmatter, projectCtx) — walks objective → [Roadmap] issue →
 *     org Project, returns structured result with per-field provenance.
 *   findRoadmapIssue(repo) — searches for [Roadmap] parent issue in repo.
 *   addToProject(issueRef, projectId) — adds issue to a Project v2.
 *   linkSubIssue(parentRef, childRef) — links child as sub-issue of parent.
 *   cmdGhResolve(cwd, objectiveId, raw) — CLI entry point for `gh resolve`.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { output } = require('./helpers.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

const MAPPING_REL = path.join('.planning', '.gh-mapping.json');

function readConfig(cwd) {
  const cfgPath = path.join(cwd, '.planning', 'config.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  } catch {
    return null;
  }
}

function readMapping(cwd) {
  const p = path.join(cwd, MAPPING_REL);
  if (!fs.existsSync(p)) return { milestone_id: null, objectives: {} };
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return { milestone_id: m.milestone_id || null, objectives: m.objectives || {} };
  } catch {
    return { milestone_id: null, objectives: {} };
  }
}

function writeMapping(cwd, mapping) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(path.join(cwd, MAPPING_REL), JSON.stringify(mapping, null, 2) + '\n');
}

function runGh(args, opts = {}) {
  const r = spawnSync('gh', args, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    ...opts,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

// ─── Test injection + per-process cache (TRD 01-02) ──────────────────────────

// Test injection hook — production code always calls _runGh; tests inject a mock.
// Existing functions (cmdGhSyncObjectives etc.) keep using runGh directly (back-compat).
let _runGh = runGh;
function _setRunGh(fn) { _runGh = (fn != null) ? fn : runGh; }

// Per-process in-memory cache for resolveChain (SC-3).
// Module-scope Map; dies with the process. NEVER persisted to disk.
let _cachedChains = new Map();
function _resetCache() { _cachedChains = new Map(); }

// ─── Resolver helpers (TRD 01-02) ────────────────────────────────────────────

/**
 * Resolve a frontmatter field's ref value and compute its provenance.
 * Handles: full ref (owner/repo#N), shorthand (#N), absent.
 * Returns { value, provenance, warning? }.
 */
function _resolveRef(fmValue, projectCtxRepo, fieldName) {
  if (!fmValue) return { value: null, provenance: 'absent' };

  // Full ref: contains slash before #NN (owner/repo#N pattern)
  if (typeof fmValue === 'string' && /^[^/]+\/[^#]+#\d+$/.test(fmValue)) {
    return { value: fmValue, provenance: 'frontmatter' };
  }

  // Shorthand: starts with # followed by digits
  if (typeof fmValue === 'string' && /^#\d+$/.test(fmValue)) {
    if (projectCtxRepo && /^[^/]+\/[^/]+$/.test(projectCtxRepo)) {
      // Valid owner/repo — expand
      return { value: `${projectCtxRepo}${fmValue}`, provenance: 'frontmatter' };
    }
    // Missing or malformed github_repo
    if (projectCtxRepo) {
      return {
        value: fmValue,
        provenance: 'frontmatter',
        warning: `Cannot resolve shorthand ${fieldName}=${fmValue}: PROJECT.md github_repo "${projectCtxRepo}" is malformed (expected owner/name format)`,
      };
    }
    return {
      value: fmValue,
      provenance: 'frontmatter',
      warning: `Cannot resolve shorthand ${fieldName}=${fmValue}: PROJECT.md github_repo is missing`,
    };
  }

  // Unrecognized format — pass through with warning
  return {
    value: fmValue,
    provenance: 'frontmatter',
    warning: `Unrecognized ${fieldName} format: ${fmValue}`,
  };
}

/**
 * Walk a parent issue ref via GraphQL to find roadmap_issue + milestone.
 * Returns { roadmap_issue, milestone, provenance: { roadmap_issue, milestone }, warnings }.
 * Uses _runGh so tests can inject a mock.
 */
function _walkParent(parentIssueRef) {
  if (!parentIssueRef || !/^[^/]+\/[^#]+#\d+$/.test(parentIssueRef)) {
    return {
      roadmap_issue: null,
      milestone: null,
      provenance: { roadmap_issue: 'absent', milestone: 'absent' },
      warnings: [],
    };
  }

  const m = parentIssueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  const [, owner, repo, num] = m;

  const query = `query($owner: String!, $name: String!, $number: Int!) {\n    repository(owner: $owner, name: $name) {\n      issue(number: $number) {\n        title\n        projectItems(first: 5) {\n          nodes {\n            project { id title }\n            fieldValues(first: 10) {\n              nodes {\n                ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }\n                ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } }\n              }\n            }\n          }\n        }\n      }\n    }\n  }`;

  const r = _runGh(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);

  if (!r.ok) {
    return {
      roadmap_issue: null,
      milestone: null,
      provenance: { roadmap_issue: 'absent', milestone: 'absent' },
      warnings: [`Walk to ${parentIssueRef} failed: ${r.stderr || 'unknown gh error'}`],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    return {
      roadmap_issue: null,
      milestone: null,
      provenance: { roadmap_issue: 'absent', milestone: 'absent' },
      warnings: [`Walk response not valid JSON: ${r.stdout.slice(0, 100)}`],
    };
  }

  const issue = parsed && parsed.data && parsed.data.repository && parsed.data.repository.issue;
  if (!issue) {
    return {
      roadmap_issue: null,
      milestone: null,
      provenance: { roadmap_issue: 'absent', milestone: 'absent' },
      warnings: [`Issue ${parentIssueRef} not found in walk response`],
    };
  }

  const isRoadmap = typeof issue.title === 'string' && issue.title.includes('[Roadmap]');
  const projectItems = (issue.projectItems && issue.projectItems.nodes) || [];
  const item = projectItems[0] || null;

  // Extract known field values from project item
  const fields = {};
  if (item) {
    for (const fv of ((item.fieldValues && item.fieldValues.nodes) || [])) {
      const fieldName = fv.field && fv.field.name;
      if (!fieldName) continue;
      fields[fieldName] = fv.name || fv.text || null;
    }
  }

  const milestone = item ? {
    draft_or_issue_ref: parentIssueRef,
    title: (item.project && item.project.title) || null,
    product: fields.Product || null,
    quarter: fields.Quarter || null,
    status: fields.Status || null,
  } : null;

  return {
    roadmap_issue: isRoadmap ? parentIssueRef : null,
    milestone,
    provenance: {
      roadmap_issue: isRoadmap ? 'walked_from_parent' : 'absent',
      milestone: milestone ? 'walked_from_parent' : 'absent',
    },
    warnings: [],
  };
}

// ─── Public resolver functions (TRD 01-02) ───────────────────────────────────

/**
 * Find the [Roadmap] parent issue for a repo.
 * Returns 'owner/repo#NN' or null.
 */
function findRoadmapIssue(repo) {
  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) return null;

  const r = _runGh([
    'issue', 'list',
    '--repo', repo,
    '--state', 'open',
    '--search', '[Roadmap] in:title',
    '--json', 'number,title',
    '--limit', '5',
  ]);

  if (!r.ok) return null;

  let arr;
  try { arr = JSON.parse(r.stdout); } catch { return null; }

  if (!Array.isArray(arr) || arr.length === 0) return null;

  // Sort ascending by number — lowest number wins (deterministic)
  arr.sort((a, b) => a.number - b.number);
  return `${repo}#${arr[0].number}`;
}

/**
 * Walk an objective's frontmatter through the full org chain.
 * Returns { objective, github_issue, parent_issue, roadmap_issue,
 *           org_initiative, org_project, milestone, provenance, warnings }.
 *
 * Provenance vocabulary: 'frontmatter' | 'inherited_from_project' |
 *   'walked_from_parent' | 'absent' | 'cached'
 *
 * SC-3: per-process in-memory cache; second call with same key returns
 * cached result with walked/inherited fields marked 'cached'.
 */
function resolveChain(frontmatter, projectCtx) {
  frontmatter = frontmatter || {};
  projectCtx = projectCtx || {};

  const cacheKey = `${projectCtx.github_repo || 'no-repo'}#${frontmatter.github_issue || frontmatter._objectiveId || 'no-id'}`;

  if (_cachedChains.has(cacheKey)) {
    const cached = _cachedChains.get(cacheKey);
    // Clone provenance: walked/inherited fields become 'cached'; frontmatter + absent stay as-is
    const cachedProvenance = {};
    for (const [k, v] of Object.entries(cached.provenance)) {
      cachedProvenance[k] = (v === 'walked_from_parent' || v === 'inherited_from_project') ? 'cached' : v;
    }
    return Object.assign({}, cached, { provenance: cachedProvenance });
  }

  const warnings = [];
  const result = {
    objective: frontmatter._objectiveId || null,
    github_issue: null,
    parent_issue: null,
    roadmap_issue: null,
    org_initiative: null,
    org_project: null,
    milestone: null,
    provenance: {},
    warnings,
  };

  // github_issue: frontmatter value → shorthand resolution → absent
  const gi = _resolveRef(frontmatter.github_issue, projectCtx.github_repo, 'github_issue');
  result.github_issue = gi.value;
  result.provenance.github_issue = gi.provenance;
  if (gi.warning) warnings.push(gi.warning);

  // parent_issue: frontmatter value → shorthand resolution → absent
  const pi = _resolveRef(frontmatter.parent_issue, projectCtx.github_repo, 'parent_issue');
  result.parent_issue = pi.value;
  result.provenance.parent_issue = pi.provenance;
  if (pi.warning) warnings.push(pi.warning);

  // org_initiative: frontmatter only (objectives-scoped; not inherited from project per CONTEXT.md)
  if (frontmatter.org_initiative) {
    result.org_initiative = frontmatter.org_initiative;
    result.provenance.org_initiative = 'frontmatter';
  } else {
    result.org_initiative = null;
    result.provenance.org_initiative = 'absent';
  }

  // org_project: frontmatter wins; else inherit from projectCtx; else absent
  if (frontmatter.org_project) {
    result.org_project = frontmatter.org_project;
    result.provenance.org_project = 'frontmatter';
  } else if (projectCtx.org_project) {
    result.org_project = projectCtx.org_project;
    result.provenance.org_project = 'inherited_from_project';
  } else {
    result.org_project = null;
    result.provenance.org_project = 'absent';
  }

  // Walk parent_issue → roadmap_issue + milestone
  if (result.parent_issue && /^[^/]+\/[^#]+#\d+$/.test(result.parent_issue)) {
    const walk = _walkParent(result.parent_issue);
    result.roadmap_issue = walk.roadmap_issue;
    result.milestone = walk.milestone;
    result.provenance.roadmap_issue = walk.provenance.roadmap_issue;
    result.provenance.milestone = walk.provenance.milestone;
    for (const w of walk.warnings) warnings.push(w);
  } else if (projectCtx.github_repo) {
    // Fallback: search for [Roadmap] issue in the repo directly
    const found = findRoadmapIssue(projectCtx.github_repo);
    if (found) {
      result.roadmap_issue = found;
      result.provenance.roadmap_issue = 'walked_from_parent';
      const walk = _walkParent(found);
      result.milestone = walk.milestone;
      result.provenance.milestone = walk.provenance.milestone;
      for (const w of walk.warnings) warnings.push(w);
    } else {
      result.roadmap_issue = null;
      result.provenance.roadmap_issue = 'absent';
      result.provenance.milestone = 'absent';
    }
  } else {
    result.roadmap_issue = null;
    result.provenance.roadmap_issue = 'absent';
    result.provenance.milestone = 'absent';
  }

  _cachedChains.set(cacheKey, result);
  return result;
}

/**
 * Add an issue to a Project v2 by ID.
 * issueRef: 'owner/repo#NN', projectId: 'PVT_...'
 * Returns { ok: true, item_id } or { ok: false, error }.
 */
function addToProject(issueRef, projectId) {
  if (!issueRef || !projectId) {
    return { ok: false, error: 'issueRef and projectId are required' };
  }
  const m = issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return { ok: false, error: `malformed issueRef: ${issueRef}` };
  const [, owner, repo, num] = m;

  // Step 1: Look up the issue's GitHub-internal node ID
  const idQuery = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { id } } }`;
  const idR = _runGh(['api', 'graphql', '-f', `query=${idQuery}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);
  if (!idR.ok) return { ok: false, error: idR.stderr || 'failed to look up issue node ID' };

  let issueId;
  try {
    issueId = JSON.parse(idR.stdout).data.repository.issue.id;
  } catch {
    return { ok: false, error: 'failed to parse issue node ID from response' };
  }

  // Step 2: Add issue to project via mutation
  const mutation = `mutation($projectId: ID!, $contentId: ID!) { addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } } }`;
  const r = _runGh(['api', 'graphql', '-f', `query=${mutation}`, '-F', `projectId=${projectId}`, '-F', `contentId=${issueId}`]);
  if (!r.ok) return { ok: false, error: r.stderr || 'addProjectV2ItemById mutation failed' };

  let item_id;
  try {
    item_id = JSON.parse(r.stdout).data.addProjectV2ItemById.item.id;
  } catch {
    return { ok: false, error: 'failed to parse item ID from addProjectV2ItemById response' };
  }

  return { ok: true, item_id };
}

/**
 * Link childRef as a sub-issue of parentRef using the GitHub addSubIssue mutation.
 * parentRef, childRef: 'owner/repo#NN'
 * Returns { ok: true } or { ok: false, error }.
 */
function linkSubIssue(parentRef, childRef) {
  if (!parentRef || !childRef) {
    return { ok: false, error: 'parentRef and childRef are required' };
  }

  // Helper: look up a GitHub-internal node ID for an issue ref
  function lookupNodeId(ref) {
    const m = ref.match(/^([^/]+)\/([^#]+)#(\d+)$/);
    if (!m) return null;
    const [, owner, repo, num] = m;
    const q = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { id } } }`;
    const r = _runGh(['api', 'graphql', '-f', `query=${q}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);
    if (!r.ok) return null;
    try {
      return JSON.parse(r.stdout).data.repository.issue.id;
    } catch {
      return null;
    }
  }

  const parentId = lookupNodeId(parentRef);
  const childId = lookupNodeId(childRef);

  if (!parentId || !childId) {
    return {
      ok: false,
      error: `failed to look up issue IDs: parent=${parentRef} (${parentId ? 'ok' : 'failed'}) child=${childRef} (${childId ? 'ok' : 'failed'})`,
    };
  }

  const mutation = `mutation($issueId: ID!, $subIssueId: ID!) { addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) { issue { id } } }`;
  const r = _runGh(['api', 'graphql', '-f', `query=${mutation}`, '-F', `issueId=${parentId}`, '-F', `subIssueId=${childId}`]);
  if (!r.ok) return { ok: false, error: r.stderr || 'addSubIssue mutation failed' };

  return { ok: true };
}

/**
 * CLI entry point for `df-tools gh resolve <objectiveId>`.
 * Reads OBJECTIVE.md + PROJECT.md from cwd, calls resolveChain, writes JSON.
 */
function cmdGhResolve(cwd, objectiveId, raw) {
  const USAGE = 'Usage: df-tools gh resolve <objectiveId> [--raw]\n' +
    '  Walks objective frontmatter through the org chain and prints JSON result.\n' +
    '  Options: --raw  emit compact JSON instead of pretty-print\n';

  if (!objectiveId || objectiveId === '--help' || objectiveId === '-h') {
    process.stderr.write(USAGE);
    process.exit(objectiveId ? 0 : 1);
    return;
  }

  const objPath = path.join(cwd, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) {
    process.stderr.write(`Error: objective not found: ${objectiveId}\n`);
    process.stderr.write(`  expected: ${objPath}\n`);
    process.stderr.write(`  Hint: run \`df-tools gh resolve --help\` for usage.\n`);
    process.exit(1);
    return;
  }

  const objContent = fs.readFileSync(objPath, 'utf-8');
  const objFm = extractFrontmatter(objContent) || {};
  objFm._objectiveId = objectiveId;

  const projectPath = path.join(cwd, '.planning', 'PROJECT.md');
  let projectFm = {};
  if (fs.existsSync(projectPath)) {
    projectFm = extractFrontmatter(fs.readFileSync(projectPath, 'utf-8')) || {};
  }

  const projectCtx = {
    github_repo: projectFm.github_repo || null,
    org_project: projectFm.org_project || null,
  };

  const result = resolveChain(objFm, projectCtx);
  const prettyJson = JSON.stringify(result, null, 2);
  output(result, raw, prettyJson);
}

function ghStatus(cwd) {
  const cfg = readConfig(cwd);
  const ghCfg = cfg && cfg.github ? cfg.github : null;
  if (!ghCfg || !ghCfg.enabled) {
    return { enabled: false, reason: 'github.enabled is false in .planning/config.json' };
  }
  if (!ghCfg.repo || !/^[^/]+\/[^/]+$/.test(ghCfg.repo)) {
    return { enabled: false, reason: 'github.repo must be set as "owner/name"' };
  }
  const which = spawnSync('which', ['gh'], { encoding: 'utf-8' });
  if (which.status !== 0) {
    return { enabled: false, reason: 'gh CLI not installed (https://cli.github.com)' };
  }
  const auth = runGh(['auth', 'status']);
  if (!auth.ok) {
    return { enabled: false, reason: 'gh not authenticated — run `gh auth login`' };
  }
  return { enabled: true, repo: ghCfg.repo, labels: ghCfg.labels || {}, milestone_prefix: ghCfg.milestone_prefix || 'v' };
}

// ─── ROADMAP parsing ─────────────────────────────────────────────────────────

function listObjectives(cwd) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return [];
  const content = fs.readFileSync(roadmapPath, 'utf-8');
  const headerRe = /#{2,4}\s*Objective\s+([\d.]+):\s*([^\n]+)/gi;
  const objectives = [];
  let m;
  while ((m = headerRe.exec(content)) !== null) {
    const num = m[1];
    const name = m[2].trim();
    const headerIdx = m.index;
    const tail = content.slice(headerIdx);
    const next = tail.slice(1).match(/\n#{2,4}\s+Objective\s+\d/i);
    const sectionEnd = next ? headerIdx + 1 + next.index : content.length;
    const section = content.slice(headerIdx, sectionEnd).trim();
    const goalMatch = section.match(/\*\*Goal:\*\*\s*([^\n]+)/i);
    const criteriaMatch = section.match(/\*\*Success Criteria\*\*[^\n]*:\s*\n((?:\s*\d+\.\s*[^\n]+\n?)+)/i);
    const successCriteria = criteriaMatch
      ? criteriaMatch[1].trim().split('\n').map(l => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
      : [];
    objectives.push({
      number: num,
      name,
      goal: goalMatch ? goalMatch[1].trim() : null,
      success_criteria: successCriteria,
    });
  }
  return objectives;
}

function getProjectName(cwd) {
  const projectPath = path.join(cwd, '.planning', 'project.md');
  if (!fs.existsSync(projectPath)) return path.basename(cwd);
  const content = fs.readFileSync(projectPath, 'utf-8');
  const m = content.match(/^#\s+([^\n]+)/m);
  return m ? m[1].trim() : path.basename(cwd);
}

function getMilestoneVersion(cwd) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return null;
  const content = fs.readFileSync(roadmapPath, 'utf-8');
  const m = content.match(/v(\d+\.\d+)/);
  return m ? m[0] : null;
}

// ─── Issue / milestone formatting ────────────────────────────────────────────

function formatIssueBody(obj, projectName) {
  const lines = [
    `**Objective ${obj.number}: ${obj.name}**`,
    '',
    obj.goal ? `**Goal:** ${obj.goal}` : null,
    '',
    obj.success_criteria.length
      ? '**Success criteria:**\n' + obj.success_criteria.map(c => `- ${c}`).join('\n')
      : null,
    '',
    `_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). Source of truth: \`.planning/objectives/\` in this repo._`,
  ].filter(l => l !== null);
  return lines.join('\n');
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdGhStatus(cwd, raw) {
  const status = ghStatus(cwd);
  output(status, raw, status.enabled ? 'enabled' : status.reason);
}

function cmdGhSyncObjectives(cwd, raw) {
  const status = ghStatus(cwd);
  if (!status.enabled) {
    output({ ok: false, skipped: true, reason: status.reason }, raw, '');
    return;
  }

  const objectives = listObjectives(cwd);
  if (objectives.length === 0) {
    output({ ok: false, reason: 'No objectives found in ROADMAP.md' }, raw, '');
    return;
  }

  const mapping = readMapping(cwd);
  const projectName = getProjectName(cwd);
  const milestoneVersion = getMilestoneVersion(cwd) || 'v1.0';
  const milestoneTitle = `${status.milestone_prefix || 'v'}${milestoneVersion.replace(/^v/, '')}`;
  const repo = status.repo;
  const baseLabel = (status.labels && status.labels.objective) || 'devflow:objective';
  const result = { ok: true, repo, milestone: null, objectives: [] };

  // Ensure milestone exists (best-effort — gh has no `milestone create`, use API)
  if (!mapping.milestone_id) {
    const create = runGh(['api', `repos/${repo}/milestones`, '-f', `title=${milestoneTitle}`, '-f', `description=DevFlow milestone for ${projectName}`]);
    if (create.ok) {
      try {
        const json = JSON.parse(create.stdout);
        mapping.milestone_id = json.number;
        result.milestone = { number: json.number, title: milestoneTitle, created: true };
      } catch {}
    } else if (/already_exists/i.test(create.stderr)) {
      // Look up existing milestone
      const list = runGh(['api', `repos/${repo}/milestones?state=all`]);
      if (list.ok) {
        try {
          const arr = JSON.parse(list.stdout);
          const found = arr.find(m => m.title === milestoneTitle);
          if (found) {
            mapping.milestone_id = found.number;
            result.milestone = { number: found.number, title: milestoneTitle, created: false };
          }
        } catch {}
      }
    }
  } else {
    result.milestone = { number: mapping.milestone_id, title: milestoneTitle, created: false };
  }

  // Ensure label exists
  runGh(['label', 'create', baseLabel, '--repo', repo, '--color', '0e8a16', '--description', 'DevFlow objective tracking']);

  for (const obj of objectives) {
    const existingIssue = mapping.objectives[obj.number];
    const title = `[Objective ${obj.number}] ${obj.name}`;
    const body = formatIssueBody(obj, projectName);

    if (existingIssue) {
      const edit = runGh([
        'issue', 'edit', String(existingIssue),
        '--repo', repo,
        '--title', title,
        '--body', body,
      ]);
      result.objectives.push({
        number: obj.number,
        issue: existingIssue,
        action: edit.ok ? 'updated' : 'failed',
        error: edit.ok ? null : edit.stderr,
      });
    } else {
      const args = ['issue', 'create', '--repo', repo, '--title', title, '--body', body, '--label', baseLabel];
      if (mapping.milestone_id) {
        // gh issue create takes --milestone by title, not number
        args.push('--milestone', milestoneTitle);
      }
      const create = runGh(args);
      if (create.ok) {
        const m = create.stdout.match(/\/issues\/(\d+)/);
        if (m) {
          mapping.objectives[obj.number] = parseInt(m[1], 10);
          result.objectives.push({ number: obj.number, issue: parseInt(m[1], 10), action: 'created' });
        }
      } else {
        result.objectives.push({ number: obj.number, action: 'failed', error: create.stderr });
      }
    }
  }

  writeMapping(cwd, mapping);
  output(result, raw, '');
}

function cmdGhComment(cwd, issueOrObjective, body, raw) {
  const status = ghStatus(cwd);
  if (!status.enabled) {
    output({ ok: false, skipped: true, reason: status.reason }, raw, '');
    return;
  }
  if (!issueOrObjective || body === undefined) {
    output({ ok: false, reason: 'Usage: gh comment <issue#|objective#> <body|@file:path>' }, raw, '');
    return;
  }

  // Resolve objective number to issue number via mapping
  const mapping = readMapping(cwd);
  let issue = parseInt(issueOrObjective, 10);
  if (!issueOrObjective.match(/^\d+$/) || mapping.objectives[issueOrObjective]) {
    const mapped = mapping.objectives[issueOrObjective];
    if (mapped) issue = mapped;
  }
  if (!issue) {
    output({ ok: false, reason: `No issue mapped for ${issueOrObjective}` }, raw, '');
    return;
  }

  // Body may be @file:/path/to/file.md
  let actualBody = body;
  if (body.startsWith('@file:')) {
    const filePath = body.slice('@file:'.length);
    if (!fs.existsSync(filePath)) {
      output({ ok: false, reason: `File not found: ${filePath}` }, raw, '');
      return;
    }
    actualBody = fs.readFileSync(filePath, 'utf-8');
  }

  const r = runGh(['issue', 'comment', String(issue), '--repo', status.repo, '--body', actualBody]);
  output(
    { ok: r.ok, issue, error: r.ok ? null : r.stderr, url: r.ok ? r.stdout : null },
    raw,
    ''
  );
}

function cmdGhCloseIssue(cwd, objectiveOrIssue, comment, raw) {
  const status = ghStatus(cwd);
  if (!status.enabled) {
    output({ ok: false, skipped: true, reason: status.reason }, raw, '');
    return;
  }
  const mapping = readMapping(cwd);
  let issue = mapping.objectives[objectiveOrIssue] || parseInt(objectiveOrIssue, 10);
  if (!issue) {
    output({ ok: false, reason: `No issue mapped for ${objectiveOrIssue}` }, raw, '');
    return;
  }
  const args = ['issue', 'close', String(issue), '--repo', status.repo];
  if (comment) args.push('--comment', comment);
  const r = runGh(args);
  output({ ok: r.ok, issue, error: r.ok ? null : r.stderr }, raw, '');
}

function cmdGhSyncRelease(cwd, tag, raw) {
  const status = ghStatus(cwd);
  if (!status.enabled) {
    output({ ok: false, skipped: true, reason: status.reason }, raw, '');
    return;
  }
  if (!tag) {
    output({ ok: false, reason: 'Usage: gh sync-release <tag>' }, raw, '');
    return;
  }

  // Find previous tag
  const prevTag = spawnSync('git', ['describe', '--tags', '--abbrev=0', `${tag}^`], {
    encoding: 'utf-8', cwd,
  });
  const prev = prevTag.status === 0 ? prevTag.stdout.trim() : null;
  const range = prev ? `${prev}..${tag}` : tag;

  // Pull SUMMARY.md and metadata commits in range
  const log = spawnSync(
    'git',
    ['log', range, '--no-merges', '--pretty=format:%h|%s', '--name-only', '-z'],
    { encoding: 'utf-8', cwd }
  );

  const lines = [`# Release ${tag}`, '', prev ? `Changes since ${prev}.` : 'Initial release.', ''];

  // Group commits by type prefix (feat/fix/docs/etc)
  const groups = { feat: [], fix: [], perf: [], refactor: [], chore: [], docs: [], other: [] };
  if (log.status === 0 && log.stdout) {
    const commitRe = /([a-f0-9]+)\|([^\n\0]+)/g;
    let m;
    while ((m = commitRe.exec(log.stdout)) !== null) {
      const subject = m[2];
      const typeMatch = subject.match(/^(feat|fix|perf|refactor|chore|docs|test)(?:\([^)]+\))?:/);
      const bucket = typeMatch && groups[typeMatch[1]] ? typeMatch[1] : 'other';
      groups[bucket].push({ sha: m[1], subject });
    }
  }

  const labels = { feat: 'Features', fix: 'Fixes', perf: 'Performance', refactor: 'Refactors', chore: 'Chores', docs: 'Docs', other: 'Other' };
  for (const key of ['feat', 'fix', 'perf', 'refactor', 'docs', 'chore', 'other']) {
    if (groups[key].length === 0) continue;
    lines.push(`## ${labels[key]}`, '');
    for (const c of groups[key]) lines.push(`- ${c.subject} (${c.sha})`);
    lines.push('');
  }

  // Append SUMMARY.md highlights from objectives completed in range
  const summaryFiles = [];
  if (log.status === 0 && log.stdout) {
    const filePartRe = /\0([^\0\n]+SUMMARY\.md)/g;
    let m;
    while ((m = filePartRe.exec(log.stdout)) !== null) {
      const f = m[1];
      if (!summaryFiles.includes(f) && fs.existsSync(path.join(cwd, f))) summaryFiles.push(f);
    }
  }
  if (summaryFiles.length > 0) {
    lines.push('## Objectives shipped', '');
    for (const f of summaryFiles) {
      const content = fs.readFileSync(path.join(cwd, f), 'utf-8');
      const titleMatch = content.match(/^#\s+([^\n]+)/m);
      const title = titleMatch ? titleMatch[1].trim() : path.basename(f);
      lines.push(`### ${title}`, '', `_Source: \`${f}\`_`, '');
    }
  }

  const tmpNotes = path.join(require('os').tmpdir(), `df-release-${Date.now()}.md`);
  fs.writeFileSync(tmpNotes, lines.join('\n'));

  // Check if release already exists
  const existing = runGh(['release', 'view', tag, '--repo', status.repo]);
  let r;
  if (existing.ok) {
    r = runGh(['release', 'edit', tag, '--repo', status.repo, '--notes-file', tmpNotes]);
  } else {
    r = runGh(['release', 'create', tag, '--repo', status.repo, '--title', tag, '--notes-file', tmpNotes]);
  }

  output(
    { ok: r.ok, tag, prev_tag: prev, range, notes_file: tmpNotes, action: existing.ok ? 'edited' : 'created', error: r.ok ? null : r.stderr, url: r.ok ? r.stdout : null },
    raw,
    ''
  );
}

module.exports = {
  // EXISTING (preserved unchanged):
  ghStatus,
  cmdGhStatus,
  cmdGhSyncObjectives,
  cmdGhComment,
  cmdGhCloseIssue,
  cmdGhSyncRelease,

  // NEW in TRD 01-02:
  resolveChain,
  findRoadmapIssue,
  addToProject,
  linkSubIssue,
  cmdGhResolve,

  // Test hooks (TRD 01-02):
  _resetCache,
  _setRunGh,
};
