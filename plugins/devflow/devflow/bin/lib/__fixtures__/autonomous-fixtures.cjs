'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Build a temporary directory with an optional .planning/config.json fixture.
 *
 * @param {string} tmpdir  - Root temp directory (caller allocates via fs.mkdtempSync)
 * @param {object|string|null} configObj
 *   - null   → no config.json written (simulates missing-config case)
 *   - string → written raw (enables malformed-JSON case)
 *   - object → written as JSON.stringify(obj, null, 2)
 * @returns {string} tmpdir (pass-through for chaining)
 */
function buildPlanningDirWithConfig(tmpdir, configObj) {
  const planning = path.join(tmpdir, '.planning');
  fs.mkdirSync(planning, { recursive: true });
  if (configObj !== null) {
    fs.writeFileSync(
      path.join(planning, 'config.json'),
      typeof configObj === 'string' ? configObj : JSON.stringify(configObj, null, 2)
    );
  }
  return tmpdir;
}

/**
 * Build a spec-conformant DECISION-NNN.md file in dir.
 *
 * @param {string} dir - Directory to write the file into (e.g. .planning/decisions/pending/)
 * @param {object} opts
 * @param {string} opts.id       - e.g. "DECISION-001"
 * @param {string} [opts.status] - "pending" | "resolved" (default: "pending")
 * @param {string} [opts.objective] - e.g. "10"
 * @param {string} [opts.trd]    - e.g. "10-03"
 * @param {number|string} [opts.wave] - e.g. 2
 * @param {string} [opts.type]   - default: "checkpoint:decision"
 * @param {string} [opts.created] - ISO timestamp
 * @param {string[]} [opts.blocks] - array of TRD ids blocked by this decision
 * @param {string[]} [opts.independent] - array of TRD ids independent of this decision
 * @param {string} [opts.recommendation] - e.g. "option-a"
 * @param {string} [opts.resolution] - only for resolved files
 * @param {string} [opts.resolved_at] - only for resolved files
 * @param {string} [opts.title] - decision title
 * @param {string} [opts.context] - context text
 * @param {string[]} [opts.options] - option names e.g. ["option-a", "option-b"]
 * @returns {string} full path of written file
 */
function buildDecisionFile(dir, opts = {}) {
  const id = opts.id || 'DECISION-001';
  const status = opts.status || 'pending';
  const objective = opts.objective || '10';
  const trd = opts.trd || '10-03';
  const wave = opts.wave != null ? opts.wave : 2;
  const type = opts.type || 'checkpoint:decision';
  const created = opts.created || '2026-06-12T14:30:00Z';
  const blocks = opts.blocks || [];
  const independent = opts.independent || [];
  const recommendation = opts.recommendation || 'option-a';
  const title = opts.title || 'Test decision';
  const context = opts.context || 'Why this matters';
  const options = opts.options || ['option-a', 'option-b'];

  fs.mkdirSync(dir, { recursive: true });

  let frontmatter = `---\nid: ${id}\nobjective: ${objective}\nwave: ${wave}\ntrd: ${trd}\ntype: ${type}\ncreated: ${created}\nstatus: ${status}\nblocks: [${blocks.join(', ')}]\nindependent: [${independent.join(', ')}]\nrecommendation: ${recommendation}`;
  if (status === 'resolved') {
    frontmatter += `\nresolution: ${opts.resolution || 'option-a'}`;
    frontmatter += `\nresolved_at: ${opts.resolved_at || '2026-06-12T15:00:00Z'}`;
  }
  frontmatter += '\n---';

  const optionsList = options.map((opt, i) => {
    return `\n${i + 1}. **${opt}** — Option ${i + 1}\n   - Pros: benefit\n   - Cons: tradeoff`;
  }).join('\n');

  const body = `\n## Decision: ${title}\n\n**Context:** ${context}\n\n**Options:**\n${optionsList}\n\n## To Resolve\n\nReply: \`/devflow:decide ${id} ${recommendation}\`\n`;

  const content = `${frontmatter}\n${body}`;
  const filePath = path.join(dir, `${id}.md`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Build a minimal objective directory with TRD files for computeBlockedSet tests.
 *
 * @param {string} tmpdir - Root temp directory
 * @param {Array<object>} trdSpecs - Array of TRD spec objects:
 *   @param {string} trdSpecs[].id       - e.g. "10-01"
 *   @param {string[]} [trdSpecs[].depends_on] - e.g. ["10-01"]
 *   @param {string} [trdSpecs[].decision_gate] - e.g. "DECISION-001"
 * @returns {string} path to the objective directory
 */
function buildObjectiveDirWithTrds(tmpdir, trdSpecs) {
  const objDir = path.join(tmpdir, 'obj');
  fs.mkdirSync(objDir, { recursive: true });

  for (const spec of trdSpecs) {
    const id = spec.id;
    const dependsOn = spec.depends_on || [];
    const decisionGate = spec.decision_gate;

    let frontmatter = `---\ntrd: ${id}\ndepends_on: [${dependsOn.join(', ')}]`;
    if (decisionGate) {
      frontmatter += `\ndecision_gate: ${decisionGate}`;
    }
    frontmatter += '\n---\n\n# TRD ' + id + '\n';

    const fileName = `${id}-TRD.md`;
    fs.writeFileSync(path.join(objDir, fileName), frontmatter, 'utf-8');
  }

  return objDir;
}

module.exports = {
  buildPlanningDirWithConfig,
  buildDecisionFile,
  buildObjectiveDirWithTrds,
};
