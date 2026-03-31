'use strict';

const fs = require('fs');
const path = require('path');
const { output, error, normalizeObjectiveName, findPlanFiles, stripPlanSuffix } = require('./helpers.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { stateReplaceField } = require('./state.cjs');
const { getMilestoneInfo } = require('./roadmap.cjs');

function cmdValidateConsistency(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const errors = [];
  const warnings = [];

  // Check for ROADMAP
  if (!fs.existsSync(roadmapPath)) {
    errors.push('ROADMAP.md not found');
    output({ passed: false, errors, warnings }, raw, 'failed');
    return;
  }

  const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

  // Extract objectives from ROADMAP
  const roadmapObjectives = new Set();
  const objectivePattern = /#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:/gi;
  let m;
  while ((m = objectivePattern.exec(roadmapContent)) !== null) {
    roadmapObjectives.add(m[1]);
  }

  // Get objectives on disk
  const diskObjectives = new Set();
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)/);
      if (dm) diskObjectives.add(dm[1]);
    }
  } catch {}

  // Check: objectives in ROADMAP but not on disk
  for (const p of roadmapObjectives) {
    if (!diskObjectives.has(p) && !diskObjectives.has(normalizeObjectiveName(p))) {
      warnings.push(`Objective ${p} in ROADMAP.md but no directory on disk`);
    }
  }

  // Check: objectives on disk but not in ROADMAP
  for (const p of diskObjectives) {
    const unpadded = String(parseInt(p, 10));
    if (!roadmapObjectives.has(p) && !roadmapObjectives.has(unpadded)) {
      warnings.push(`Objective ${p} exists on disk but not in ROADMAP.md`);
    }
  }

  // Check: sequential objective numbers (integers only)
  const integerObjectives = [...diskObjectives]
    .filter(p => !p.includes('.'))
    .map(p => parseInt(p, 10))
    .sort((a, b) => a - b);

  for (let i = 1; i < integerObjectives.length; i++) {
    if (integerObjectives[i] !== integerObjectives[i - 1] + 1) {
      warnings.push(`Gap in objective numbering: ${integerObjectives[i - 1]} → ${integerObjectives[i]}`);
    }
  }

  // Check: job numbering within objectives
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
      const plans = findPlanFiles(objectiveFiles).sort();

      // Extract job numbers
      const jobNums = plans.map(p => {
        const pm = p.match(/-(\d{2})-(TRD|JOB)\.md$/);
        return pm ? parseInt(pm[1], 10) : null;
      }).filter(n => n !== null);

      for (let i = 1; i < jobNums.length; i++) {
        if (jobNums[i] !== jobNums[i - 1] + 1) {
          warnings.push(`Gap in job numbering in ${dir}: job ${jobNums[i - 1]} → ${jobNums[i]}`);
        }
      }

      // Check: plans without summaries (completed plans)
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md'));
      const jobIds = new Set(plans.map(p => stripPlanSuffix(p)));
      const summaryIds = new Set(summaries.map(s => s.replace('-SUMMARY.md', '')));

      // Summary without matching job is suspicious
      for (const sid of summaryIds) {
        if (!jobIds.has(sid)) {
          warnings.push(`Summary ${sid}-SUMMARY.md in ${dir} has no matching TRD.md or JOB.md`);
        }
      }
    }
  } catch {}

  // Check: frontmatter in plans has required fields
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    for (const dir of dirs) {
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
      const plans = findPlanFiles(objectiveFiles);

      for (const jobFile of plans) {
        const content = fs.readFileSync(path.join(objectivesDir, dir, jobFile), 'utf-8');
        const fm = extractFrontmatter(content);

        if (!fm.wave) {
          warnings.push(`${dir}/${jobFile}: missing 'wave' in frontmatter`);
        }
      }
    }
  } catch {}

  const passed = errors.length === 0;
  output({ passed, errors, warnings, warning_count: warnings.length }, raw, passed ? 'passed' : 'failed');
}

function cmdValidateHealth(cwd, options, raw) {
  const planningDir = path.join(cwd, '.planning');
  const projectPath = path.join(planningDir, 'PROJECT.md');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const statePath = path.join(planningDir, 'STATE.md');
  const configPath = path.join(planningDir, 'config.json');
  const objectivesDir = path.join(planningDir, 'objectives');

  const errors = [];
  const warnings = [];
  const info = [];
  const repairs = [];

  // Helper to add issue
  const addIssue = (severity, code, message, fix, repairable = false) => {
    const issue = { code, message, fix, repairable };
    if (severity === 'error') errors.push(issue);
    else if (severity === 'warning') warnings.push(issue);
    else info.push(issue);
  };

  // ─── Check 1: .planning/ exists ───────────────────────────────────────────
  if (!fs.existsSync(planningDir)) {
    addIssue('error', 'E001', '.planning/ directory not found', 'Run /df:new-project to initialize');
    output({
      status: 'broken',
      errors,
      warnings,
      info,
      repairable_count: 0,
    }, raw);
    return;
  }

  // ─── Check 2: PROJECT.md exists and has required sections ─────────────────
  if (!fs.existsSync(projectPath)) {
    addIssue('error', 'E002', 'PROJECT.md not found', 'Run /df:new-project to create');
  } else {
    const content = fs.readFileSync(projectPath, 'utf-8');
    const requiredSections = ['## What This Is', '## Core Value', '## Requirements'];
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        addIssue('warning', 'W001', `PROJECT.md missing section: ${section}`, 'Add section manually');
      }
    }
  }

  // ─── Check 3: ROADMAP.md exists ───────────────────────────────────────────
  if (!fs.existsSync(roadmapPath)) {
    addIssue('error', 'E003', 'ROADMAP.md not found', 'Run /df:new-milestone to create roadmap');
  }

  // ─── Check 4: STATE.md exists and references valid objectives ─────────────────
  if (!fs.existsSync(statePath)) {
    addIssue('error', 'E004', 'STATE.md not found', 'Run /df:health --repair to regenerate', true);
    repairs.push('regenerateState');
  } else {
    const stateContent = fs.readFileSync(statePath, 'utf-8');
    // Extract objective references from STATE.md
    const phaseRefs = [...stateContent.matchAll(/[Pp]hase\s+(\d+(?:\.\d+)?)/g)].map(m => m[1]);
    // Get disk objectives
    const diskObjectives = new Set();
    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const m = e.name.match(/^(\d+(?:\.\d+)?)/);
          if (m) diskObjectives.add(m[1]);
        }
      }
    } catch {}
    // Check for invalid references
    for (const ref of phaseRefs) {
      const normalizedRef = String(parseInt(ref, 10)).padStart(2, '0');
      if (!diskObjectives.has(ref) && !diskObjectives.has(normalizedRef) && !diskObjectives.has(String(parseInt(ref, 10)))) {
        // Only warn if objectives dir has any content (not just an empty project)
        if (diskObjectives.size > 0) {
          addIssue('warning', 'W002', `STATE.md references objective ${ref}, but only objectives ${[...diskObjectives].sort().join(', ')} exist`, 'Run /df:health --repair to regenerate STATE.md', true);
          if (!repairs.includes('regenerateState')) repairs.push('regenerateState');
        }
      }
    }
  }

  // ─── Check 5: config.json valid JSON + valid schema ───────────────────────
  if (!fs.existsSync(configPath)) {
    addIssue('warning', 'W003', 'config.json not found', 'Run /df:health --repair to create with defaults', true);
    repairs.push('createConfig');
  } else {
    try {
      const rawContent = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(rawContent);
      // Validate known fields
      const validProfiles = ['quality', 'balanced', 'budget'];
      if (parsed.model_profile && !validProfiles.includes(parsed.model_profile)) {
        addIssue('warning', 'W004', `config.json: invalid model_profile "${parsed.model_profile}"`, `Valid values: ${validProfiles.join(', ')}`);
      }
    } catch (err) {
      addIssue('error', 'E005', `config.json: JSON parse error - ${err.message}`, 'Run /df:health --repair to reset to defaults', true);
      repairs.push('resetConfig');
    }
  }

  // ─── Check 6: Objective directory naming (NN-name format) ─────────────────────
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.match(/^\d{2}(?:\.\d+)?-[\w-]+$/)) {
        addIssue('warning', 'W005', `Objective directory "${e.name}" doesn't follow NN-name format`, 'Rename to match pattern (e.g., 01-setup)');
      }
    }
  } catch {}

  // ─── Check 7: Orphaned jobs (JOB without SUMMARY) ─────────────────────────
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, e.name));
      const plans = findPlanFiles(objectiveFiles);
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      const summaryBases = new Set(summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', '')));

      for (const jobFile of plans) {
        const jobBase = stripPlanSuffix(jobFile);
        if (!summaryBases.has(jobBase)) {
          addIssue('info', 'I001', `${e.name}/${jobFile} has no SUMMARY.md`, 'May be in progress');
        }
      }
    }
  } catch {}

  // ─── Check 8: Run existing consistency checks ─────────────────────────────
  // Inline subset of cmdValidateConsistency
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
    const roadmapObjectives = new Set();
    const objectivePattern = /#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:/gi;
    let m;
    while ((m = objectivePattern.exec(roadmapContent)) !== null) {
      roadmapObjectives.add(m[1]);
    }

    const diskObjectives = new Set();
    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const dm = e.name.match(/^(\d+(?:\.\d+)?)/);
          if (dm) diskObjectives.add(dm[1]);
        }
      }
    } catch {}

    // Objectives in ROADMAP but not on disk
    for (const p of roadmapObjectives) {
      const padded = String(parseInt(p, 10)).padStart(2, '0');
      if (!diskObjectives.has(p) && !diskObjectives.has(padded)) {
        addIssue('warning', 'W006', `Objective ${p} in ROADMAP.md but no directory on disk`, 'Create objective directory or remove from roadmap');
      }
    }

    // Objectives on disk but not in ROADMAP
    for (const p of diskObjectives) {
      const unpadded = String(parseInt(p, 10));
      if (!roadmapObjectives.has(p) && !roadmapObjectives.has(unpadded)) {
        addIssue('warning', 'W007', `Objective ${p} exists on disk but not in ROADMAP.md`, 'Add to roadmap or remove directory');
      }
    }
  }

  // ─── Check 9: Legacy JOB.md files (should be TRD.md) ─────────────────────
  const legacyJobFiles = [];
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, e.name));
      for (const f of objectiveFiles) {
        if (f.endsWith('-JOB.md') || f === 'JOB.md') {
          legacyJobFiles.push(path.join(objectivesDir, e.name, f));
        }
      }
    }
  } catch {}
  if (legacyJobFiles.length > 0) {
    addIssue(
      'warning',
      'W008',
      `Legacy JOB.md format found: ${legacyJobFiles.length} file(s). TRD.md is the current format.`,
      'Run /df:health --repair to auto-rename to TRD.md',
      true
    );
    repairs.push('migrateJobFiles');
  }

  // ─── Perform repairs if requested ─────────────────────────────────────────
  const repairActions = [];
  if (options.repair && repairs.length > 0) {
    for (const repair of repairs) {
      try {
        switch (repair) {
          case 'createConfig':
          case 'resetConfig': {
            const defaults = {
              model_profile: 'balanced',
              commit_docs: true,
              search_gitignored: false,
              branching_strategy: 'none',
              research: true,
              job_checker: true,
              verifier: true,
              parallelization: true,
            };
            fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
            repairActions.push({ action: repair, success: true, path: 'config.json' });
            break;
          }
          case 'regenerateState': {
            // Generate minimal STATE.md from ROADMAP.md structure
            const milestone = getMilestoneInfo(cwd);
            let stateContent = `# Session State\n\n`;
            stateContent += `## Project Reference\n\n`;
            stateContent += `See: .planning/PROJECT.md\n\n`;
            stateContent += `## Position\n\n`;
            stateContent += `**Milestone:** ${milestone.version} ${milestone.name}\n`;
            stateContent += `**Current objective:** (determining...)\n`;
            stateContent += `**Status:** Resuming\n\n`;
            stateContent += `## Session Log\n\n`;
            stateContent += `- ${new Date().toISOString().split('T')[0]}: STATE.md regenerated by /df:health --repair\n`;
            fs.writeFileSync(statePath, stateContent, 'utf-8');
            repairActions.push({ action: repair, success: true, path: 'STATE.md' });
            break;
          }
          case 'migrateJobFiles': {
            const migrated = [];
            for (const jobPath of legacyJobFiles) {
              const trdPath = jobPath.replace(/-JOB\.md$/, '-TRD.md').replace(/JOB\.md$/, 'TRD.md');
              fs.renameSync(jobPath, trdPath);
              migrated.push({ from: path.relative(cwd, jobPath), to: path.relative(cwd, trdPath) });
            }
            // Record migration in STATE.md if it exists
            if (fs.existsSync(statePath) && migrated.length > 0) {
              const today = new Date().toISOString().split('T')[0];
              let stateContent = fs.readFileSync(statePath, 'utf-8');
              const note = `- ${today}: Migrated ${migrated.length} JOB.md file(s) to TRD.md format via /df:health --repair\n`;
              stateContent = stateReplaceField(stateContent, 'Status', 'Resumed') || stateContent;
              const logSection = stateContent.indexOf('## Session Log');
              if (logSection !== -1) {
                const insertAt = stateContent.indexOf('\n', logSection) + 1;
                stateContent = stateContent.slice(0, insertAt) + note + stateContent.slice(insertAt);
                fs.writeFileSync(statePath, stateContent, 'utf-8');
              }
            }
            repairActions.push({ action: repair, success: true, migrated });
            break;
          }
        }
      } catch (err) {
        repairActions.push({ action: repair, success: false, error: err.message });
      }
    }
  }

  // ─── Determine overall status ─────────────────────────────────────────────
  let status;
  if (errors.length > 0) {
    status = 'broken';
  } else if (warnings.length > 0) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  const repairableCount = errors.filter(e => e.repairable).length +
                         warnings.filter(w => w.repairable).length;

  output({
    status,
    errors,
    warnings,
    info,
    repairable_count: repairableCount,
    repairs_performed: repairActions.length > 0 ? repairActions : undefined,
  }, raw);
}

module.exports = {
  cmdValidateConsistency,
  cmdValidateHealth,
};
