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
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { output } = require('./helpers.cjs');

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
  ghStatus,
  cmdGhStatus,
  cmdGhSyncObjectives,
  cmdGhComment,
  cmdGhCloseIssue,
  cmdGhSyncRelease,
};
