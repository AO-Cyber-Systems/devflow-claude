'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { output, error, normalizeObjectiveName, findPlanFiles, stripPlanSuffix, pluginVersion, installedPlugin, marketplaceCheckout } = require('./helpers.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { stateReplaceField, stateExtractField, readStateJson, writeStateJson, STATE_JSON_DEFAULTS } = require('./state.cjs');
const { getMilestoneInfo } = require('./roadmap.cjs');

// ─── Engine lag helpers (Check 11 in cmdValidateHealth) ───────────────────────

// Compares two "x.y.z" semver strings as 3-tuples. Non-numeric/missing segments
// treat as 0. Returns 1 if a > b, -1 if a < b, 0 if equal.
function compareSemver(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

// Reads plugins/devflow/.claude-plugin/plugin.json as committed on origin/main,
// from the LOCAL MARKETPLACE CHECKOUT the plugin manager maintains at
// ~/.claude/plugins/marketplaces/aocyber (via helpers.marketplaceCheckout()) —
// not a devflow-claude dev checkout relative to the running file, which
// doesn't exist when df-tools runs from the ~/.claude/devflow mirror (every
// skill invocation). Best-effort `git fetch` first so origin/main isn't
// read stale; the fetch's own failure (offline, etc.) is ignored — `git show`
// still runs against whatever origin/main currently resolves to locally.
// Returns the version string, or null on any failure (no marketplace
// checkout, no git, bad JSON, etc.) — never fails health for a missing
// checkout, it just means W021 can't be evaluated.
function defaultMainVersionFn() {
  try {
    const checkout = marketplaceCheckout();
    if (!checkout) return null;
    // Never let git block on a credential prompt — health runs unattended.
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    try {
      execFileSync('git', ['-C', checkout, 'fetch', '--quiet', 'origin', 'main'], { timeout: 5000, encoding: 'utf-8', env: gitEnv });
    } catch {
      // Offline / no network / fetch failed — fall through and read whatever
      // origin/main already resolves to locally.
    }
    const out = execFileSync(
      'git',
      ['-C', checkout, 'show', 'origin/main:plugins/devflow/.claude-plugin/plugin.json'],
      { timeout: 5000, encoding: 'utf-8', env: gitEnv }
    );
    const parsed = JSON.parse(out);
    return (parsed && typeof parsed.version === 'string' && parsed.version) ? parsed.version : null;
  } catch {
    return null;
  }
}

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
      engine_version: pluginVersion(),
      schema_version: 1,
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

  // ─── Check 10: state.json sidecar missing ─────────────────────────────────
  const stateJsonPath = path.join(planningDir, 'state.json');
  if (fs.existsSync(statePath) && !fs.existsSync(stateJsonPath)) {
    addIssue(
      'warning',
      'W009',
      'state.json sidecar not found. Machine-readable state fields use slower markdown parsing.',
      'Run /df:health --repair to create state.json from existing STATE.md',
      true
    );
    repairs.push('createStateJson');
  }

  // ─── Check 11: Engine lag (installed vs mirror vs origin/main) ────────────
  // Skills invoke df-tools via the ~/.claude/devflow mirror, not the plugin
  // checkout — sync-runtime.js re-mirrors on session start, but a session that
  // never restarted keeps running a stale mirror silently. Surface both kinds
  // of drift: the mirror falling behind the installed plugin (E020), and the
  // installed plugin falling behind origin/main (W021, best-effort only).
  //
  // `installed` and `main` deliberately do NOT come from helpers.pluginVersion():
  // when df-tools runs from the mirror (every skill invocation), that
  // function's first candidate (a .claude-plugin/plugin.json relative to
  // __dirname) doesn't exist there, so it silently falls through to the same
  // ~/.claude/devflow/.plugin-version file `mirror` below also reads — making
  // "installed" and "mirror" identical by construction and E020 structurally
  // unfireable in production. `installed` reads the plugin manager's own
  // ~/.claude/plugins/installed_plugins.json instead (helpers.installedPlugin);
  // `main` reads the plugin manager's marketplace checkout
  // (helpers.marketplaceCheckout), not a devflow-claude dev checkout relative
  // to the running file (which also doesn't exist from the mirror).
  const installedPluginFn = options.installedPluginFn || installedPlugin;
  const homeDir = options.homeDir || os.homedir();
  const mainVersionFn = options.mainVersionFn || defaultMainVersionFn;

  const runningVer = pluginVersion();

  let installedInfo = null;
  try {
    // Threads homeDir through so a test can point BOTH the mirror-file read
    // below AND the default helpers.installedPlugin() lookup at one fixture
    // home, without needing a separate installedPluginFn override (the
    // mirror-path end-to-end case below relies on exactly this).
    installedInfo = installedPluginFn({ homeDir });
  } catch {
    installedInfo = null;
  }
  const installedVer = (installedInfo && typeof installedInfo.version === 'string' && installedInfo.version)
    ? installedInfo.version
    : null;

  const mirrorVersionPath = path.join(homeDir, '.claude', 'devflow', '.plugin-version');
  let mirrorVer = null;
  if (fs.existsSync(mirrorVersionPath)) {
    try {
      mirrorVer = fs.readFileSync(mirrorVersionPath, 'utf-8').trim();
    } catch {
      mirrorVer = null;
    }
  }

  let mainVer = null;
  try {
    mainVer = mainVersionFn();
  } catch {
    mainVer = null;
  }

  // Only compare when both sides are known — a fresh machine has no mirror
  // yet (not staleness), and installed may be unknown on a dev checkout with
  // no plugin-manager registry.
  if (mirrorVer && installedVer && mirrorVer !== installedVer) {
    addIssue(
      'error',
      'E020',
      `mirror-stale: ~/.claude/devflow is ${mirrorVer} but the installed plugin is ${installedVer}`,
      'Start a new session so sync-runtime re-mirrors, or run the sync hook, or run `/plugin update devflow@aocyber`'
    );
  }

  if (mainVer && installedVer && compareSemver(mainVer, installedVer) > 0) {
    addIssue(
      'warning',
      'W021',
      `plugin-behind-main: installed ${installedVer}, origin/main ${mainVer}`,
      'Update the plugin from the marketplace'
    );
  }

  const engine = { running: runningVer, mirror: mirrorVer, installed: installedVer, main: mainVer };

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
          case 'createStateJson': {
            // Seed state.json from existing STATE.md content
            const stateContent = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf-8') : '';
            const seeded = Object.assign({}, STATE_JSON_DEFAULTS);

            // Extract what we can from markdown
            const extractMd = (field) => stateExtractField(stateContent, field);
            const currentJobRaw  = extractMd('Current Job');
            const totalJobsRaw   = extractMd('Total Jobs in Objective');
            const progressRaw    = extractMd('Progress');
            const statusRaw      = extractMd('Status');
            const lastActivityRaw = extractMd('Last Activity');
            const currentObjRaw  = extractMd('Current Objective');

            if (currentJobRaw) seeded.current_job = parseInt(currentJobRaw, 10) || 0;
            if (totalJobsRaw)  seeded.total_jobs  = parseInt(totalJobsRaw, 10)  || 0;
            if (progressRaw)   seeded.progress_pct = parseInt(String(progressRaw).replace('%', ''), 10) || 0;
            if (statusRaw)     seeded.status = statusRaw;
            if (lastActivityRaw) seeded.last_activity = lastActivityRaw;
            if (currentObjRaw) seeded.current_objective = currentObjRaw;

            // Extract blockers list
            const blockersMatch = stateContent.match(/##\s*Blockers[^#]*\n([\s\S]*?)(?=\n##|$)/i);
            if (blockersMatch) {
              const items = blockersMatch[1].match(/^-\s+(.+)$/gm) || [];
              seeded.blockers = items.map(i => i.replace(/^-\s+/, '').trim()).filter(Boolean);
            }

            writeStateJson(cwd, seeded);
            repairActions.push({ action: repair, success: true, path: 'state.json', seeded_fields: Object.keys(seeded).filter(k => seeded[k] !== STATE_JSON_DEFAULTS[k]) });
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
    // Every tool output carries these two (spec): a consumer can reject a
    // report produced by a stale engine. Present on the E001 early return too.
    engine_version: pluginVersion(),
    schema_version: 1,
    status,
    errors,
    warnings,
    info,
    engine,
    repairable_count: repairableCount,
    repairs_performed: repairActions.length > 0 ? repairActions : undefined,
  }, raw);
}

module.exports = {
  cmdValidateConsistency,
  cmdValidateHealth,
  compareSemver,
};
