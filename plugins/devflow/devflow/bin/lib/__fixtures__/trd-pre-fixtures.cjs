'use strict';

// Hand-built fixture builders for trd-pre-check module tests.
// Per TDD Playbook habit 4: factory functions, not LLM-generated test data.

const fs = require('fs');
const path = require('path');

// ─── makeTrdContent ───────────────────────────────────────────────────────────

/**
 * Builds a TRD markdown string for use in trd-pre-check tests.
 *
 * @param {object} opts
 * @param {string} opts.objective - e.g. "99-test"
 * @param {string} opts.trd - e.g. "01"
 * @param {string[]|string} [opts.requirements] - requirement IDs (e.g. ["F1","F2"] or "F1, F2")
 * @param {string[]} [opts.depends_on] - e.g. ["99-02"]
 * @param {Array<{type?, hasName?, hasAction?, hasVerify?, hasDone?}>} [opts.tasks]
 *   - type: "auto" | "tdd" | "checkpoint:human-verify" (default "auto")
 *   - hasName/hasAction/hasVerify/hasDone: booleans (default true)
 * @returns {string}
 */
function makeTrdContent({
  objective = '99-test',
  trd = '01',
  requirements = [],
  depends_on = [],
  tasks = [{ type: 'auto', hasName: true, hasAction: true, hasVerify: true, hasDone: true }],
} = {}) {
  // Build frontmatter requirements line
  const reqValue = Array.isArray(requirements)
    ? (requirements.length === 0 ? '[]' : `[${requirements.join(', ')}]`)
    : String(requirements);

  const depValue = Array.isArray(depends_on)
    ? (depends_on.length === 0 ? '[]' : `[${depends_on.join(', ')}]`)
    : String(depends_on);

  const frontmatter = `---
objective: ${objective}
trd: "${trd}"
type: tdd
wave: 1
depends_on: ${depValue}
requirements: ${reqValue}
autonomous: true
---`;

  const taskBlocks = tasks.map((t, i) => {
    const type = t.type || 'auto';
    const n = i + 1;
    const isCheckpoint = /^checkpoint/.test(type);

    const nameLine = t.hasName !== false ? `  <name>Task ${n}: some task</name>` : '';
    const actionLine = t.hasAction !== false ? `  <action>Do the thing.</action>` : '';
    const verifyLine = t.hasVerify !== false ? `  <verify>echo ok</verify>` : '';
    const doneLine = t.hasDone !== false ? `  <done>Done.</done>` : '';

    // Checkpoint tasks typically only have a name (no verify/done required)
    if (isCheckpoint) {
      return `\n<task type="${type}">
${nameLine}
  <instructions>Verify the thing looks right.</instructions>
</task>`;
    }

    return `\n<task type="${type}">
${nameLine}
${actionLine}
${verifyLine}
${doneLine}
</task>`;
  });

  return `${frontmatter}

<objective>
Test TRD for trd-pre-check fixtures.
</objective>

<tasks>
${taskBlocks.join('\n')}
</tasks>
`;
}

// ─── setupObjectiveDir ────────────────────────────────────────────────────────

/**
 * Creates a .planning/ scaffold in tmpRoot for use in trd-pre-check tests.
 *
 * @param {string} tmpRoot - absolute path to a temp directory
 * @param {object} opts
 * @param {string} opts.objective - objective directory name, e.g. "99-test"
 * @param {string[]|string} [opts.roadmap_requirements] - requirement IDs to put in ROADMAP.md
 *   ("F1, F2" or ["F1","F2"]). Pass null/undefined to omit **Requirements:** line entirely.
 * @param {Array<{trd: string, content: string}>} opts.trds - array of TRD file descriptors.
 *   Each has `trd` (e.g. "01") and either `content` (raw string) or is built via makeTrdContent.
 * @returns {string} absolute path to the objective directory
 */
function setupObjectiveDir(tmpRoot, {
  objective = '99-test',
  roadmap_requirements,
  trds = [],
} = {}) {
  const objectiveDir = path.join(tmpRoot, '.planning', 'objectives', objective);
  fs.mkdirSync(objectiveDir, { recursive: true });

  // Write TRD files
  for (const trdSpec of trds) {
    const filename = `${trdSpec.trd}-TRD.md`;
    const content = trdSpec.content || makeTrdContent({
      objective,
      trd: trdSpec.trd,
      requirements: trdSpec.requirements,
      depends_on: trdSpec.depends_on,
      tasks: trdSpec.tasks,
    });
    fs.writeFileSync(path.join(objectiveDir, filename), content, 'utf-8');
  }

  // Write ROADMAP.md with objective section
  let roadmapContent = `# Roadmap\n\n### Objective ${objective.split('-')[0]}: Test objective\n\n**Goal:** Test.\n\n`;
  if (roadmap_requirements !== undefined && roadmap_requirements !== null) {
    const reqStr = Array.isArray(roadmap_requirements)
      ? roadmap_requirements.join(', ')
      : String(roadmap_requirements);
    roadmapContent += `**Requirements:** [${reqStr}]\n\n`;
  }
  roadmapContent += `**Status:** In progress\n`;

  fs.writeFileSync(path.join(tmpRoot, '.planning', 'ROADMAP.md'), roadmapContent, 'utf-8');

  return objectiveDir;
}

module.exports = { makeTrdContent, setupObjectiveDir };
