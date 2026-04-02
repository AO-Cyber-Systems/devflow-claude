'use strict';

const fs = require('fs');
const path = require('path');
const { output, error, findPlanFiles } = require('./helpers.cjs');
const { loadConfig } = require('./config.cjs');

// ─── State JSON Sidecar ───────────────────────────────────────────────────────
// state.json holds machine-readable fields alongside the human-readable STATE.md.
// Functions read JSON first; fall back to markdown parsing for backward compat.
// First write lazily creates state.json if it doesn't exist.

const STATE_JSON_DEFAULTS = {
  current_objective: null,
  current_job: 0,
  total_jobs: 0,
  progress_pct: 0,
  status: null,
  last_activity: null,
  metrics: { jobs_completed: 0, jobs_failed: 0, sessions: 0 },
  decisions: [],
  blockers: [],
  session_log: [],
};

function readStateJson(cwd) {
  const jsonPath = path.join(cwd, '.planning', 'state.json');
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeStateJson(cwd, data) {
  const jsonPath = path.join(cwd, '.planning', 'state.json');
  const existing = readStateJson(cwd) || Object.assign({}, STATE_JSON_DEFAULTS);
  const merged = Object.assign({}, existing, data);
  // Deep-merge metrics sub-object
  if (data.metrics) {
    merged.metrics = Object.assign({}, existing.metrics || {}, data.metrics);
  }
  fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

// ─── State Archive Helper ───────────────────────────────────────────────────

const ARCHIVE_SEED = `# State Archive

Append-only log. Written by df-tools \`add-decision\` and \`record-metric\`.
STATE.md stays lean; this file grows over time.

## Decisions

- *(none yet)*

## Performance Metrics

| Objective | Duration | Tasks | Files |
|-----------|----------|-------|-------|
`;

function ensureArchive(cwd) {
  const archivePath = path.join(cwd, '.planning', 'STATE_ARCHIVE.md');
  if (!fs.existsSync(archivePath)) {
    if (!fs.existsSync(path.join(cwd, '.planning'))) {
      error('.planning directory not found');
    }
    fs.writeFileSync(archivePath, ARCHIVE_SEED, 'utf-8');
  }
}

// ─── State Field Helpers (markdown) ──────────────────────────────────────────

function stateExtractField(content, fieldName) {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function stateReplaceField(content, fieldName, newValue) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(\\*\\*${escaped}:\\*\\*\\s*)(.*)`, 'i');
  if (pattern.test(content)) {
    return content.replace(pattern, `$1${newValue}`);
  }
  return null;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdStateLoad(cwd, raw) {
  const config = loadConfig(cwd);
  const planningDir = path.join(cwd, '.planning');

  let stateRaw = '';
  try {
    stateRaw = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf-8');
  } catch {}

  const configExists = fs.existsSync(path.join(planningDir, 'config.json'));
  const roadmapExists = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
  const stateExists = stateRaw.length > 0;

  const result = {
    config,
    state_raw: stateRaw,
    state_exists: stateExists,
    roadmap_exists: roadmapExists,
    config_exists: configExists,
  };

  // For --raw, output a condensed key=value format
  if (raw) {
    const c = config;
    const lines = [
      `model_profile=${c.model_profile}`,
      `commit_docs=${c.commit_docs}`,
      `branching_strategy=${c.branching_strategy}`,
      `objective_branch_template=${c.objective_branch_template}`,
      `milestone_branch_template=${c.milestone_branch_template}`,
      `parallelization=${c.parallelization}`,
      `research=${c.research}`,
      `job_checker=${c.job_checker}`,
      `verifier=${c.verifier}`,
      `config_exists=${configExists}`,
      `roadmap_exists=${roadmapExists}`,
      `state_exists=${stateExists}`,
    ];
    process.stdout.write(lines.join('\n'));
    process.exit(0);
  }

  output(result);
}

function cmdStateGet(cwd, section, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  try {
    const content = fs.readFileSync(statePath, 'utf-8');

    if (!section) {
      output({ content }, raw, content);
      return;
    }

    // Try to find markdown section or field
    const fieldEscaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Check for **field:** value
    const fieldPattern = new RegExp(`\\*\\*${fieldEscaped}:\\*\\*\\s*(.*)`, 'i');
    const fieldMatch = content.match(fieldPattern);
    if (fieldMatch) {
      output({ [section]: fieldMatch[1].trim() }, raw, fieldMatch[1].trim());
      return;
    }

    // Check for ## Section
    const sectionPattern = new RegExp(`##\\s*${fieldEscaped}\\s*\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const sectionMatch = content.match(sectionPattern);
    if (sectionMatch) {
      output({ [section]: sectionMatch[1].trim() }, raw, sectionMatch[1].trim());
      return;
    }

    output({ error: `Section or field "${section}" not found` }, raw, '');
  } catch {
    error('STATE.md not found');
  }
}

function cmdStatePatch(cwd, patches, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  try {
    let content = fs.readFileSync(statePath, 'utf-8');
    const results = { updated: [], failed: [] };

    for (const [field, value] of Object.entries(patches)) {
      const fieldEscaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(\\*\\*${fieldEscaped}:\\*\\*\\s*)(.*)`, 'i');

      if (pattern.test(content)) {
        content = content.replace(pattern, `$1${value}`);
        results.updated.push(field);
      } else {
        results.failed.push(field);
      }
    }

    if (results.updated.length > 0) {
      fs.writeFileSync(statePath, content, 'utf-8');
    }

    output(results, raw, results.updated.length > 0 ? 'true' : 'false');
  } catch {
    error('STATE.md not found');
  }
}

function cmdStateUpdate(cwd, field, value) {
  if (!field || value === undefined) {
    error('field and value required for state update');
  }

  const statePath = path.join(cwd, '.planning', 'STATE.md');
  try {
    let content = fs.readFileSync(statePath, 'utf-8');
    const fieldEscaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(\\*\\*${fieldEscaped}:\\*\\*\\s*)(.*)`, 'i');
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1${value}`);
      fs.writeFileSync(statePath, content, 'utf-8');
      output({ updated: true });
    } else {
      output({ updated: false, reason: `Field "${field}" not found in STATE.md` });
    }
  } catch {
    output({ updated: false, reason: 'STATE.md not found' });
  }
}

function cmdStateAdvanceJob(cwd, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];

  // Prefer JSON sidecar; fall back to markdown parsing
  const stateJson = readStateJson(cwd);
  let currentJob = stateJson?.current_job ?? parseInt(stateExtractField(content, 'Current Job'), 10);
  let totalJobs  = stateJson?.total_jobs  ?? parseInt(stateExtractField(content, 'Total Jobs in Objective'), 10);

  if (isNaN(currentJob) || isNaN(totalJobs)) {
    output({ error: 'Cannot parse Current Job or Total Jobs in Objective from STATE.md or state.json' }, raw);
    return;
  }

  if (currentJob >= totalJobs) {
    content = stateReplaceField(content, 'Status', 'Objective complete — ready for verification') || content;
    content = stateReplaceField(content, 'Last Activity', today) || content;
    fs.writeFileSync(statePath, content, 'utf-8');
    writeStateJson(cwd, { current_job: currentJob, total_jobs: totalJobs, status: 'ready_for_verification', last_activity: today });
    output({ advanced: false, reason: 'last_job', current_job: currentJob, total_jobs: totalJobs, status: 'ready_for_verification' }, raw, 'false');
  } else {
    const newJob = currentJob + 1;
    content = stateReplaceField(content, 'Current Job', String(newJob)) || content;
    content = stateReplaceField(content, 'Status', 'Ready to execute') || content;
    content = stateReplaceField(content, 'Last Activity', today) || content;
    fs.writeFileSync(statePath, content, 'utf-8');
    writeStateJson(cwd, { current_job: newJob, total_jobs: totalJobs, status: 'Ready to execute', last_activity: today });
    output({ advanced: true, previous_job: currentJob, current_job: newJob, total_jobs: totalJobs }, raw, 'true');
  }
}

function cmdStateRecordMetric(cwd, options, raw) {
  const archivePath = path.join(cwd, '.planning', 'STATE_ARCHIVE.md');
  ensureArchive(cwd);

  let content = fs.readFileSync(archivePath, 'utf-8');
  const { objective, job, duration, tasks, files } = options;

  if (!objective || !job || !duration) {
    output({ error: 'objective, job, and duration required' }, raw);
    return;
  }

  // Find Performance Metrics section and its table
  const metricsPattern = /(##\s*Performance Metrics[\s\S]*?\n\|[^\n]+\n\|[-|\s]+\n)([\s\S]*?)(?=\n##|\n$|$)/i;
  const metricsMatch = content.match(metricsPattern);

  if (metricsMatch) {
    const tableHeader = metricsMatch[1];
    let tableBody = metricsMatch[2].trimEnd();
    const newRow = `| Objective ${objective} P${job} | ${duration} | ${tasks || '-'} tasks | ${files || '-'} files |`;

    if (tableBody.trim() === '' || tableBody.includes('None yet')) {
      tableBody = newRow;
    } else {
      tableBody = tableBody + '\n' + newRow;
    }

    content = content.replace(metricsPattern, `${tableHeader}${tableBody}\n`);
    fs.writeFileSync(archivePath, content, 'utf-8');
    output({ recorded: true, objective, job, duration }, raw, 'true');
  } else {
    output({ recorded: false, reason: 'Performance Metrics section not found in STATE_ARCHIVE.md' }, raw, 'false');
  }
}

function cmdStateUpdateProgress(cwd, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');

  // Count summaries across all objectives
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  let totalJobs = 0;
  let totalSummaries = 0;

  if (fs.existsSync(objectivesDir)) {
    const objectiveDirs = fs.readdirSync(objectivesDir, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
    for (const dir of objectiveDirs) {
      const files = fs.readdirSync(path.join(objectivesDir, dir));
      totalJobs += findPlanFiles(files).length;
      totalSummaries += files.filter(f => f.match(/-SUMMARY\.md$/i)).length;
    }
  }

  const percent = totalJobs > 0 ? Math.round(totalSummaries / totalJobs * 100) : 0;
  const barWidth = 10;
  const filled = Math.round(percent / 100 * barWidth);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
  const progressStr = `[${bar}] ${percent}%`;

  const progressPattern = /(\*\*Progress:\*\*\s*).*/i;
  if (progressPattern.test(content)) {
    content = content.replace(progressPattern, `$1${progressStr}`);
    fs.writeFileSync(statePath, content, 'utf-8');
    writeStateJson(cwd, { progress_pct: percent });
    output({ updated: true, percent, completed: totalSummaries, total: totalJobs, bar: progressStr }, raw, progressStr);
  } else {
    // No markdown field — still persist to JSON
    writeStateJson(cwd, { progress_pct: percent });
    output({ updated: false, reason: 'Progress field not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateAddDecision(cwd, options, raw) {
  const archivePath = path.join(cwd, '.planning', 'STATE_ARCHIVE.md');
  ensureArchive(cwd);

  const { objective, summary, rationale } = options;
  if (!summary) { output({ error: 'summary required' }, raw); return; }

  let content = fs.readFileSync(archivePath, 'utf-8');
  const entry = `- [Objective ${objective || '?'}]: ${summary}${rationale ? ` — ${rationale}` : ''}`;

  // Find Decisions section (various heading patterns)
  const sectionPattern = /(###?\s*(?:Decisions|Decisions Made|Accumulated.*Decisions)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = content.match(sectionPattern);

  if (match) {
    let sectionBody = match[2];
    // Remove placeholders
    sectionBody = sectionBody.replace(/None yet\.?\s*\n?/gi, '').replace(/No decisions yet\.?\s*\n?/gi, '').replace(/\*\(none yet\)\*\s*\n?/gi, '');
    sectionBody = sectionBody.trimEnd() + '\n' + entry + '\n';
    content = content.replace(sectionPattern, `${match[1]}${sectionBody}`);
    fs.writeFileSync(archivePath, content, 'utf-8');
    // Mirror to JSON sidecar
    const sj = readStateJson(cwd) || Object.assign({}, STATE_JSON_DEFAULTS);
    const decisions = [...(sj.decisions || []), { objective: objective || '?', summary, rationale: rationale || null }];
    writeStateJson(cwd, { decisions });
    output({ added: true, decision: entry }, raw, 'true');
  } else {
    output({ added: false, reason: 'Decisions section not found in STATE_ARCHIVE.md' }, raw, 'false');
  }
}

function cmdStateAddBlocker(cwd, text, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }
  if (!text) { output({ error: 'text required' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const entry = `- ${text}`;

  const sectionPattern = /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = content.match(sectionPattern);

  if (match) {
    let sectionBody = match[2];
    sectionBody = sectionBody.replace(/None\.?\s*\n?/gi, '').replace(/None yet\.?\s*\n?/gi, '');
    sectionBody = sectionBody.trimEnd() + '\n' + entry + '\n';
    content = content.replace(sectionPattern, `${match[1]}${sectionBody}`);
    fs.writeFileSync(statePath, content, 'utf-8');
    // Mirror to JSON sidecar
    const sj = readStateJson(cwd) || Object.assign({}, STATE_JSON_DEFAULTS);
    writeStateJson(cwd, { blockers: [...(sj.blockers || []), text] });
    output({ added: true, blocker: text }, raw, 'true');
  } else {
    output({ added: false, reason: 'Blockers section not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateResolveBlocker(cwd, text, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }
  if (!text) { output({ error: 'text required' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');

  const sectionPattern = /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = content.match(sectionPattern);

  if (match) {
    const sectionBody = match[2];
    const lines = sectionBody.split('\n');
    const filtered = lines.filter(line => {
      if (!line.startsWith('- ')) return true;
      return !line.toLowerCase().includes(text.toLowerCase());
    });

    let newBody = filtered.join('\n');
    // If section is now empty, add placeholder
    if (!newBody.trim() || !newBody.includes('- ')) {
      newBody = 'None\n';
    }

    content = content.replace(sectionPattern, `${match[1]}${newBody}`);
    fs.writeFileSync(statePath, content, 'utf-8');
    // Mirror removal to JSON sidecar
    const sj = readStateJson(cwd);
    if (sj) {
      const remaining = (sj.blockers || []).filter(b => !b.toLowerCase().includes(text.toLowerCase()));
      writeStateJson(cwd, { blockers: remaining });
    }
    output({ resolved: true, blocker: text }, raw, 'true');
  } else {
    output({ resolved: false, reason: 'Blockers section not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateRecordSession(cwd, options, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const now = new Date().toISOString();
  const updated = [];

  // Update Last session / Last Date
  let result = stateReplaceField(content, 'Last session', now);
  if (result) { content = result; updated.push('Last session'); }
  result = stateReplaceField(content, 'Last Date', now);
  if (result) { content = result; updated.push('Last Date'); }

  // Update Stopped at
  if (options.stopped_at) {
    result = stateReplaceField(content, 'Stopped At', options.stopped_at);
    if (!result) result = stateReplaceField(content, 'Stopped at', options.stopped_at);
    if (result) { content = result; updated.push('Stopped At'); }
  }

  // Update Resume file
  const resumeFile = options.resume_file || 'None';
  result = stateReplaceField(content, 'Resume File', resumeFile);
  if (!result) result = stateReplaceField(content, 'Resume file', resumeFile);
  if (result) { content = result; updated.push('Resume File'); }

  if (updated.length > 0) {
    fs.writeFileSync(statePath, content, 'utf-8');
    output({ recorded: true, updated }, raw, 'true');
  } else {
    output({ recorded: false, reason: 'No session fields found in STATE.md' }, raw, 'false');
  }
}

function cmdStateSnapshot(cwd, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');

  if (!fs.existsSync(statePath)) {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }

  const content = fs.readFileSync(statePath, 'utf-8');
  const stateJson = readStateJson(cwd);

  // Helper to extract **Field:** value patterns from markdown (fallback)
  const extractField = (fieldName) => {
    const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
    const match = content.match(pattern);
    return match ? match[1].trim() : null;
  };

  // Prefer JSON sidecar values; fall back to markdown extraction
  const currentObjective    = stateJson?.current_objective    ?? extractField('Current Objective');
  const currentJob          = stateJson?.current_job          ?? extractField('Current Job');
  const totalJobsInObjective = stateJson?.total_jobs          ?? (extractField('Total Jobs in Objective') ? parseInt(extractField('Total Jobs in Objective'), 10) : null);
  const progressPercent     = stateJson?.progress_pct         ?? (extractField('Progress') ? parseInt(String(extractField('Progress')).replace('%', ''), 10) : null);
  const status              = stateJson?.status               ?? extractField('Status');
  const lastActivity        = stateJson?.last_activity        ?? extractField('Last Activity');

  // Markdown-only fields (not yet in JSON)
  const currentObjectiveName = extractField('Current Objective Name');
  const totalObjectivesRaw   = extractField('Total Objectives');
  const totalObjectives      = totalObjectivesRaw ? parseInt(totalObjectivesRaw, 10) : null;
  const lastActivityDesc     = extractField('Last Activity Description');
  const pausedAt             = extractField('Paused At');

  // Prefer JSON arrays for decisions and blockers
  let decisions = stateJson?.decisions ?? null;
  if (!decisions) {
    decisions = [];
    const decisionsMatch = content.match(/##\s*Decisions Made[\s\S]*?\n\|[^\n]+\n\|[-|\s]+\n([\s\S]*?)(?=\n##|\n$|$)/i);
    if (decisionsMatch) {
      const rows = decisionsMatch[1].trim().split('\n').filter(r => r.includes('|'));
      for (const row of rows) {
        const cells = row.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length >= 3) decisions.push({ objective: cells[0], summary: cells[1], rationale: cells[2] });
      }
    }
  }

  let blockers = stateJson?.blockers ?? null;
  if (!blockers) {
    blockers = [];
    const blockersMatch = content.match(/##\s*Blockers\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (blockersMatch) {
      const items = blockersMatch[1].match(/^-\s+(.+)$/gm) || [];
      blockers = items.map(i => i.replace(/^-\s+/, '').trim());
    }
  }

  // Session info — still from markdown (or JSON session_log last entry)
  const session = { last_date: null, stopped_at: null, resume_file: null };
  const sessionMatch = content.match(/##\s*Session\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (sessionMatch) {
    const sec = sessionMatch[1];
    const ld = sec.match(/\*\*Last Date:\*\*\s*(.+)/i);
    const sa = sec.match(/\*\*Stopped At:\*\*\s*(.+)/i);
    const rf = sec.match(/\*\*Resume File:\*\*\s*(.+)/i);
    if (ld) session.last_date  = ld[1].trim();
    if (sa) session.stopped_at = sa[1].trim();
    if (rf) session.resume_file = rf[1].trim();
  }

  const result = {
    current_objective: currentObjective,
    current_objective_name: currentObjectiveName,
    total_objectives: totalObjectives,
    current_job: currentJob,
    total_jobs_in_objective: totalJobsInObjective,
    status,
    progress_percent: progressPercent,
    last_activity: lastActivity,
    last_activity_desc: lastActivityDesc,
    decisions,
    blockers,
    paused_at: pausedAt,
    session,
  };

  output(result, raw);
}

module.exports = {
  readStateJson,
  writeStateJson,
  STATE_JSON_DEFAULTS,
  stateExtractField,
  stateReplaceField,
  cmdStateLoad,
  cmdStateGet,
  cmdStatePatch,
  cmdStateUpdate,
  cmdStateAdvanceJob,
  cmdStateRecordMetric,
  cmdStateUpdateProgress,
  cmdStateAddDecision,
  cmdStateAddBlocker,
  cmdStateResolveBlocker,
  cmdStateRecordSession,
  cmdStateSnapshot,
};
