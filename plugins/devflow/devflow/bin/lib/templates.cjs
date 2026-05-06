'use strict';

const fs = require('fs');
const path = require('path');
const { output, error, normalizeObjectiveName, generateSlugInternal } = require('./helpers.cjs');
const { reconstructFrontmatter } = require('./frontmatter.cjs');
const { findObjectiveInternal } = require('./objective.cjs');

function cmdTemplateSelect(cwd, jobPath, raw) {
  if (!jobPath) {
    error('job-path required');
  }

  // Phase I4: Canonicalized to single template (TRD 12-06).
  // Heuristic-based selection (minimal/standard/complex) removed.
  // Future: respect config.json `summary_verbosity` flag (reserved field, not yet wired).
  try {
    const fullPath = path.join(cwd, jobPath);
    // Read file to validate it exists (surface error if not)
    fs.readFileSync(fullPath, 'utf-8');
    const result = {
      template: 'templates/summary.md',
      type: 'standard',
      canonicalized_by: 'TRD 12-06',
    };
    output(result, raw, 'templates/summary.md');
  } catch (e) {
    // Fallback to canonical on any error
    output({ template: 'templates/summary.md', type: 'standard', canonicalized_by: 'TRD 12-06', error: e.message }, raw, 'templates/summary.md');
  }
}

function cmdTemplateFill(cwd, templateType, options, raw) {
  if (!templateType) { error('template type required: summary, job, or verification'); }
  if (!options.objective) { error('--objective required'); }

  const objectiveInfo = findObjectiveInternal(cwd, options.objective);
  if (!objectiveInfo || !objectiveInfo.found) { output({ error: 'Objective not found', objective: options.objective }, raw); return; }

  const padded = normalizeObjectiveName(options.objective);
  const today = new Date().toISOString().split('T')[0];
  const objectiveName = options.name || objectiveInfo.objective_name || 'Unnamed';
  const objectiveSlug = objectiveInfo.objective_slug || generateSlugInternal(objectiveName);
  const objectiveId = `${padded}-${objectiveSlug}`;
  const jobNum = (options.job || '01').padStart(2, '0');
  const fields = options.fields || {};

  let frontmatter, body, fileName;

  switch (templateType) {
    case 'summary': {
      frontmatter = {
        objective: objectiveId,
        job: jobNum,
        subsystem: '[primary category]',
        tags: [],
        provides: [],
        affects: [],
        'tech-stack': { added: [], patterns: [] },
        'key-files': { created: [], modified: [] },
        'key-decisions': [],
        'patterns-established': [],
        duration: '[X]min',
        completed: today,
        ...fields,
      };
      body = [
        `# Objective ${options.objective}: ${objectiveName} Summary`,
        '',
        '**[Substantive one-liner describing outcome]**',
        '',
        '## Performance',
        '- **Duration:** [time]',
        '- **Tasks:** [count completed]',
        '- **Files modified:** [count]',
        '',
        '## Accomplishments',
        '- [Key outcome 1]',
        '- [Key outcome 2]',
        '',
        '## Task Commits',
        '1. **Task 1: [task name]** - `hash`',
        '',
        '## Files Created/Modified',
        '- `path/to/file.ts` - What it does',
        '',
        '## Decisions & Deviations',
        '[Key decisions or "None - followed plan as specified"]',
        '',
        '## Next Objective Readiness',
        '[What\'s ready for next objective]',
      ].join('\n');
      fileName = `${padded}-${jobNum}-SUMMARY.md`;
      break;
    }
    case 'job': {
      const jobType = options.type || 'execute';
      const wave = parseInt(options.wave) || 1;
      frontmatter = {
        objective: objectiveId,
        job: jobNum,
        type: jobType,
        wave,
        depends_on: [],
        files_modified: [],
        autonomous: true,
        user_setup: [],
        must_haves: { truths: [], artifacts: [], key_links: [] },
        ...fields,
      };
      body = [
        `# Objective ${options.objective} Job ${jobNum}: [Title]`,
        '',
        '## Objective',
        '- **What:** [What this job builds]',
        '- **Why:** [Why it matters for the objective goal]',
        '- **Output:** [Concrete deliverable]',
        '',
        '## Context',
        '@.planning/PROJECT.md',
        '@.planning/ROADMAP.md',
        '@.planning/STATE.md',
        '',
        '## Tasks',
        '',
        '<task type="code">',
        '  <name>[Task name]</name>',
        '  <files>[file paths]</files>',
        '  <action>[What to do]</action>',
        '  <verify>[How to verify]</verify>',
        '  <done>[Definition of done]</done>',
        '</task>',
        '',
        '## Verification',
        '[How to verify this job achieved its objective]',
        '',
        '## Success Criteria',
        '- [ ] [Criterion 1]',
        '- [ ] [Criterion 2]',
      ].join('\n');
      fileName = `${padded}-${jobNum}-TRD.md`;
      break;
    }
    case 'verification': {
      frontmatter = {
        objective: objectiveId,
        verified: new Date().toISOString(),
        status: 'pending',
        score: '0/0 must-haves verified',
        ...fields,
      };
      body = [
        `# Objective ${options.objective}: ${objectiveName} — Verification`,
        '',
        '## Observable Truths',
        '| # | Truth | Status | Evidence |',
        '|---|-------|--------|----------|',
        '| 1 | [Truth] | pending | |',
        '',
        '## Required Artifacts',
        '| Artifact | Expected | Status | Details |',
        '|----------|----------|--------|---------|',
        '| [path] | [what] | pending | |',
        '',
        '## Key Link Verification',
        '| From | To | Via | Status | Details |',
        '|------|----|----|--------|---------|',
        '| [source] | [target] | [connection] | pending | |',
        '',
        '## Requirements Coverage',
        '| Requirement | Status | Blocking Issue |',
        '|-------------|--------|----------------|',
        '| [req] | pending | |',
        '',
        '## Result',
        '[Pending verification]',
      ].join('\n');
      fileName = `${padded}-VERIFICATION.md`;
      break;
    }
    default:
      error(`Unknown template type: ${templateType}. Available: summary, job, verification`);
      return;
  }

  const fullContent = `---\n${reconstructFrontmatter(frontmatter)}\n---\n\n${body}\n`;
  const outPath = path.join(cwd, objectiveInfo.directory, fileName);

  if (fs.existsSync(outPath)) {
    output({ error: 'File already exists', path: path.relative(cwd, outPath) }, raw);
    return;
  }

  fs.writeFileSync(outPath, fullContent, 'utf-8');
  const relPath = path.relative(cwd, outPath);
  output({ created: true, path: relPath, template: templateType }, raw, relPath);
}

module.exports = {
  cmdTemplateSelect,
  cmdTemplateFill,
};
