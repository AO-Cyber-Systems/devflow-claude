'use strict';

const fs = require('fs');
const path = require('path');
const { output, error, normalizeObjectiveName, findPlanFiles, safeReadFile } = require('./helpers.cjs');

function cmdWorkstreamsAnalyze(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    error('ROADMAP.md not found');
  }

  const content = fs.readFileSync(roadmapPath, 'utf-8');

  // Parse all objectives with their dependencies
  const objectivePattern = /#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:\s*([^\n]+)/gi;
  const objectives = [];
  let match;

  while ((match = objectivePattern.exec(content)) !== null) {
    const objectiveNum = match[1];
    const objectiveName = match[2].replace(/\(INSERTED\)/i, '').trim();

    const sectionStart = match.index;
    const restOfContent = content.slice(sectionStart);
    const nextHeader = restOfContent.match(/\n#{2,4}\s+Objective\s+\d/i);
    const sectionEnd = nextHeader ? sectionStart + nextHeader.index : content.length;
    const section = content.slice(sectionStart, sectionEnd);

    // Match both **Depends on:** and **Depends on**:
    const dependsMatch = section.match(/\*\*Depends on(?::\*\*|\*\*:)\s*([^\n]+)/i);
    const dependsRaw = dependsMatch ? dependsMatch[1].trim() : '';
    // Match both **Goal:** and **Goal**:
    const goalMatch = section.match(/\*\*Goal(?::\*\*|\*\*:)\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : '';

    // Parse depends_on into list of objective numbers
    const depPhases = [];
    if (dependsRaw && !/nothing|none|n\/a/i.test(dependsRaw)) {
      const depMatches = dependsRaw.match(/Objective\s+(\d+(?:\.\d+)?)/gi) || [];
      for (const dm of depMatches) {
        const numMatch = dm.match(/(\d+(?:\.\d+)?)/);
        if (numMatch) depPhases.push(numMatch[1]);
      }
    }

    // Check completion status from ROADMAP checkbox
    const checkboxPattern = new RegExp(`-\\s*\\[(x| )\\]\\s*.*Objective\\s+${objectiveNum.replace('.', '\\.')}`, 'i');
    const checkboxMatch = content.match(checkboxPattern);
    const isComplete = checkboxMatch ? checkboxMatch[1] === 'x' : false;

    // Check disk status
    const objectivesDir = path.join(cwd, '.planning', 'objectives');
    const normalized = normalizeObjectiveName(objectiveNum);
    let diskComplete = false;
    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      const dirMatch = dirs.find(d => d.startsWith(normalized + '-') || d === normalized);
      if (dirMatch) {
        const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dirMatch));
        const jobCount = findPlanFiles(objectiveFiles).length;
        const summaryCount = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;
        diskComplete = summaryCount >= jobCount && jobCount > 0;
      }
    } catch {}

    objectives.push({
      number: objectiveNum,
      name: objectiveName,
      goal,
      depends_on: depPhases,
      complete: isComplete || diskComplete,
    });
  }

  // Build adjacency list and find workstream candidates
  // An objective is eligible for a workstream if all its dependencies are complete
  const completedSet = new Set(objectives.filter(p => p.complete).map(p => p.number));

  // Find objectives whose deps are all complete but are themselves not complete
  const eligible = objectives.filter(p =>
    !p.complete && p.depends_on.every(d => completedSet.has(d))
  );

  // Group independent eligible objectives (objectives that don't depend on each other)
  // Two eligible objectives are independent if neither appears in the other's dependency chain
  const eligibleNums = new Set(eligible.map(p => p.number));

  const workstreamGroups = eligible.map(p => {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return {
      id: `ws-${slug}`,
      name: p.name,
      objectives: [p.number],
      depends_on_completed: p.depends_on,
      goal: p.goal,
    };
  });

  // Find join points: incomplete objectives that depend on multiple incomplete objectives
  const joinPhases = objectives
    .filter(p => !p.complete && p.depends_on.some(d => eligibleNums.has(d)))
    .filter(p => !eligibleNums.has(p.number))
    .map(p => ({
      objective: p.number,
      name: p.name,
      waits_for: p.depends_on.filter(d => !completedSet.has(d)),
    }));

  const parallelismPossible = workstreamGroups.length >= 2;

  output({
    workstream_groups: workstreamGroups,
    join_objectives: joinPhases,
    parallelism_possible: parallelismPossible,
    max_concurrent: workstreamGroups.length,
    completed_objectives: [...completedSet],
    total_objectives: objectives.length,
  }, raw);
}

function cmdWorkstreamsProvision(cwd, wsId, worktreePath, raw) {
  if (!wsId || !worktreePath) {
    error('Usage: workstreams provision <ws-id> <worktree-path>');
  }

  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) {
    error('.planning/ directory not found');
  }

  // Read workstreams.json to get this workstream's details
  const wsJsonPath = path.join(planningDir, 'workstreams.json');
  if (!fs.existsSync(wsJsonPath)) {
    error('.planning/workstreams.json not found. Run workstreams setup first.');
  }

  const wsData = JSON.parse(fs.readFileSync(wsJsonPath, 'utf-8'));
  const ws = wsData.workstreams.find(w => w.id === wsId);
  if (!ws) {
    error(`Workstream "${wsId}" not found in workstreams.json`);
  }

  const targetPlanning = path.join(worktreePath, '.planning');
  fs.mkdirSync(targetPlanning, { recursive: true });

  // Copy shared files
  const sharedFiles = ['PROJECT.md', 'REQUIREMENTS.md', 'ROADMAP.md', 'config.json'];
  for (const file of sharedFiles) {
    const src = path.join(planningDir, file);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(targetPlanning, file));
    }
  }

  // Copy shared directories
  const sharedDirs = ['research', 'codebase'];
  for (const dir of sharedDirs) {
    const src = path.join(planningDir, dir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(targetPlanning, dir), { recursive: true });
    }
  }

  // Copy only this workstream's objective directories
  const objectivesDir = path.join(planningDir, 'objectives');
  const targetObjectivesDir = path.join(targetPlanning, 'objectives');
  fs.mkdirSync(targetObjectivesDir, { recursive: true });

  if (fs.existsSync(objectivesDir)) {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const objectiveDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    for (const objectiveNum of ws.objectives) {
      const normalized = normalizeObjectiveName(String(objectiveNum));
      const dirMatch = objectiveDirs.find(d => d.startsWith(normalized + '-') || d === normalized);
      if (dirMatch) {
        fs.cpSync(
          path.join(objectivesDir, dirMatch),
          path.join(targetObjectivesDir, dirMatch),
          { recursive: true }
        );
      } else {
        // Create empty directory for the objective
        const slug = ws.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        fs.mkdirSync(path.join(targetObjectivesDir, `${normalized}-${slug}`), { recursive: true });
      }
    }

    // Also copy completed objective directories (for reference context)
    for (const dep of (ws.depends_on_completed || [])) {
      const normalized = normalizeObjectiveName(String(dep));
      const dirMatch = objectiveDirs.find(d => d.startsWith(normalized + '-') || d === normalized);
      if (dirMatch) {
        fs.cpSync(
          path.join(objectivesDir, dirMatch),
          path.join(targetObjectivesDir, dirMatch),
          { recursive: true }
        );
      }
    }
  }

  // Generate filtered STATE.md
  const statePath = path.join(planningDir, 'STATE.md');
  const stateContent = safeReadFile(statePath) || '';
  const objectiveNames = ws.objectives.map(p => `Objective ${p}`).join(', ');

  const filteredState = `# Project State

## Workstream Context

**Workstream:** ${ws.name} (${ws.id})
**Scope:** ${objectiveNames}
**Main worktree:** ${path.relative(worktreePath, cwd) || '..'}

> This is a workstream worktree. Run normal DevFlow commands here.
> When done, return to the main worktree and run \`/df:workstreams merge\`.

## Project Reference

See: .planning/PROJECT.md
**Current focus:** ${ws.name}

## Current Position

Objective: ${ws.objectives[0]} of ${ws.objectives[ws.objectives.length - 1]}
Job: Not started
Status: Ready to plan
Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

(inherited from main worktree)

### Blockers/Concerns

(none)

## Session Continuity

Last session: ${new Date().toISOString().split('T')[0]}
Stopped at: Workstream provisioned, ready to plan
Resume file: None
`;

  fs.writeFileSync(path.join(targetPlanning, 'STATE.md'), filteredState);

  // Write workstream-marker.json
  const marker = {
    id: ws.id,
    name: ws.name,
    objectives: ws.objectives,
    main_worktree: path.relative(worktreePath, cwd) || '..',
  };
  fs.writeFileSync(
    path.join(targetPlanning, 'workstream-marker.json'),
    JSON.stringify(marker, null, 2) + '\n'
  );

  output({
    success: true,
    workstream: ws.id,
    worktree_path: worktreePath,
    files_copied: sharedFiles.filter(f => fs.existsSync(path.join(planningDir, f))),
    dirs_copied: sharedDirs.filter(d => fs.existsSync(path.join(planningDir, d))),
    phases_provisioned: ws.objectives,
    marker_written: true,
  }, raw);
}

function cmdWorkstreamsReconcile(cwd, raw) {
  const planningDir = path.join(cwd, '.planning');
  const wsJsonPath = path.join(planningDir, 'workstreams.json');

  if (!fs.existsSync(wsJsonPath)) {
    error('.planning/workstreams.json not found');
  }

  const wsData = JSON.parse(fs.readFileSync(wsJsonPath, 'utf-8'));
  const objectivesDir = path.join(planningDir, 'objectives');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const reqsPath = path.join(planningDir, 'REQUIREMENTS.md');

  const reconciledPhases = [];
  const allDecisions = [];
  const allBlockers = [];

  // For each completed workstream, update progress from disk
  for (const ws of wsData.workstreams) {
    if (ws.status !== 'merged' && ws.status !== 'complete') continue;

    for (const objectiveNum of ws.objectives) {
      const normalized = normalizeObjectiveName(String(objectiveNum));
      try {
        const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
        const dirMatch = dirs.find(d => d.startsWith(normalized + '-') || d === normalized);

        if (dirMatch) {
          const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dirMatch));
          const jobCount = findPlanFiles(objectiveFiles).length;
          const summaryCount = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;
          reconciledPhases.push({
            objective: objectiveNum,
            jobs: jobCount,
            summaries: summaryCount,
            complete: summaryCount >= jobCount && jobCount > 0,
          });
        }
      } catch {}
    }

    // Collect accumulated context from workstream STATE.md if worktree still exists
    if (ws.worktree_path) {
      const wsStatePath = path.join(ws.worktree_path, '.planning', 'STATE.md');
      const wsState = safeReadFile(wsStatePath);
      if (wsState) {
        // Extract decisions
        const decisionsMatch = wsState.match(/### Decisions\n([\s\S]*?)(?=\n###|\n## |$)/);
        if (decisionsMatch) {
          const lines = decisionsMatch[1].trim().split('\n').filter(l => l.startsWith('- '));
          allDecisions.push(...lines.map(l => `[${ws.name}] ${l.slice(2)}`));
        }
        // Extract blockers
        const blockersMatch = wsState.match(/### Blockers\/Concerns\n([\s\S]*?)(?=\n###|\n## |$)/);
        if (blockersMatch) {
          const lines = blockersMatch[1].trim().split('\n').filter(l => l.startsWith('- '));
          allBlockers.push(...lines.map(l => l.slice(2)));
        }
      }
    }
  }

  // Update ROADMAP.md progress from disk for each reconciled objective
  if (fs.existsSync(roadmapPath)) {
    let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

    for (const rp of reconciledPhases) {
      if (rp.complete) {
        // Mark objective checkbox as complete
        const checkboxPattern = new RegExp(
          `(- \\[)( )(\\]\\s*\\*\\*Objective\\s+${String(rp.objective).replace('.', '\\.')})`
        );
        roadmapContent = roadmapContent.replace(checkboxPattern, '$1x$3');

        // Update progress table row
        const tablePattern = new RegExp(
          `(\\|\\s*${String(rp.objective).replace('.', '\\.')}\\.[^|]+\\|\\s*)\\d+\\/\\d+(\\s*\\|\\s*)\\w[^|]*(\\s*\\|)`,
        );
        const today = new Date().toISOString().split('T')[0];
        roadmapContent = roadmapContent.replace(
          tablePattern,
          `$1${rp.summaries}/${rp.jobs}$2Complete | ${today} |`
        );
      }
    }

    fs.writeFileSync(roadmapPath, roadmapContent);
  }

  // Union REQUIREMENTS.md checkbox completions
  // (handled during git merge — checkboxes from each branch are already merged)

  // Determine next objective (join objective)
  const nextObjective = wsData.join_objectives && wsData.join_objectives.length > 0
    ? wsData.join_objectives[0]
    : null;

  // Regenerate STATE.md for join objective
  const statePath = path.join(planningDir, 'STATE.md');
  const projectPath = path.join(planningDir, 'PROJECT.md');
  const projectContent = safeReadFile(projectPath) || '';
  const coreValueMatch = projectContent.match(/\*\*Core value:\*\*\s*([^\n]+)/i) ||
                         projectContent.match(/## What This Is\s*\n+([^\n]+)/);
  const coreValue = coreValueMatch ? coreValueMatch[1].trim() : 'See PROJECT.md';

  // Read current roadmap to find join objective name
  const roadmapContent = safeReadFile(roadmapPath) || '';
  let joinPhaseName = 'Next objective';
  if (nextObjective) {
    const joinMatch = roadmapContent.match(
      new RegExp(`#{2,4}\\s*Objective\\s+${String(nextObjective).replace('.', '\\.')}\\s*:\\s*([^\\n]+)`, 'i')
    );
    if (joinMatch) {
      joinPhaseName = joinMatch[1].replace(/\(INSERTED\)/i, '').trim();
    }
  }

  // Count total completed
  const allPhasesDone = reconciledPhases.filter(rp => rp.complete).length;
  const totalJobs = reconciledPhases.reduce((s, rp) => s + rp.jobs, 0);
  const totalSummaries = reconciledPhases.reduce((s, rp) => s + rp.summaries, 0);

  const today = new Date().toISOString().split('T')[0];
  const newStateContent = `# Project State

## Project Reference

See: .planning/PROJECT.md (updated ${today})
**Core value:** ${coreValue}
**Current focus:** ${joinPhaseName}

## Current Position

Objective: ${nextObjective || 'N/A'}
Job: Not started
Status: Ready to plan
Progress: [${reconciledPhases.length > 0 ? '█'.repeat(Math.min(10, allPhasesDone)) + '░'.repeat(Math.max(0, 10 - allPhasesDone)) : '░░░░░░░░░░'}] ${totalJobs > 0 ? Math.round((totalSummaries / totalJobs) * 100) : 0}%

## Performance Metrics

**Velocity:**
- Workstreams merged: ${wsData.workstreams.filter(w => w.status === 'merged' || w.status === 'complete').length}
- Objectives completed via workstreams: ${allPhasesDone}

## Accumulated Context

### Decisions

${allDecisions.length > 0 ? allDecisions.map(d => `- ${d}`).join('\n') : '(none)'}

### Blockers/Concerns

${allBlockers.length > 0 ? allBlockers.map(b => `- ${b}`).join('\n') : '(none)'}

## Session Continuity

Last session: ${today}
Stopped at: Workstreams merged, ready to plan ${nextObjective ? `Objective ${nextObjective}: ${joinPhaseName}` : 'next objective'}
Resume file: None
`;

  fs.writeFileSync(statePath, newStateContent);

  // Update workstreams.json
  wsData.status = 'merged';
  for (const ws of wsData.workstreams) {
    if (ws.status === 'complete' || ws.status === 'merged') {
      if (!wsData.completed_workstreams) wsData.completed_workstreams = [];
      wsData.completed_workstreams.push({
        ...ws,
        merged_at: new Date().toISOString(),
      });
    }
  }
  wsData.workstreams = wsData.workstreams.filter(
    w => w.status !== 'complete' && w.status !== 'merged'
  );
  fs.writeFileSync(wsJsonPath, JSON.stringify(wsData, null, 2) + '\n');

  output({
    success: true,
    reconciled_objectives: reconciledPhases,
    decisions_merged: allDecisions.length,
    blockers_merged: allBlockers.length,
    next_objective: nextObjective,
    next_objective_name: joinPhaseName,
    state_regenerated: true,
    roadmap_updated: true,
  }, raw);
}

module.exports = {
  cmdWorkstreamsAnalyze,
  cmdWorkstreamsProvision,
  cmdWorkstreamsReconcile,
};
