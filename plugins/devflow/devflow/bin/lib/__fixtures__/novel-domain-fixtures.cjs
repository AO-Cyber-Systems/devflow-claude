'use strict';

// Hand-built fixture factories for novel-domain detector module tests.
// Per TDD Playbook habit 4: factory functions, not LLM-generated test data.
// Hand-written realistic objective text; no lorem ipsum; no randomized inputs.

const fs = require('fs');
const path = require('path');

// ─── makeDescription ──────────────────────────────────────────────────────────

/**
 * Build a realistic objective description string.
 *
 * @param {object} opts
 * @param {string} [opts.topic] - Base topic for the description
 * @param {string[]} [opts.mentionsPkgs] - Package names to embed in backticks
 * @param {string|false} [opts.hasComparison] - Comparison keyword to embed ("evaluate"|"compare"|"choose between"|"vs.")
 * @returns {string}
 */
function makeDescription({ topic = 'authentication', mentionsPkgs = [], hasComparison = false } = {}) {
  let desc = '';

  // Build base description around the topic
  switch (topic) {
    case 'authentication':
      desc = 'Implement token-based authentication for the API. Sessions will be managed server-side.';
      break;
    case 'jwt':
      desc = 'Add JWT signing and verification to the auth layer. Tokens expire after 24 hours.';
      break;
    case 's3':
      desc = 'Integrate file storage using S3-compatible object storage. Support upload and presigned URLs.';
      break;
    case 'database':
      desc = 'Add database migration runner and connection pooling. Schema changes are managed via versioned files.';
      break;
    case 'testing':
      desc = 'Expand the test suite with integration tests covering all API endpoints.';
      break;
    default:
      desc = `Implement ${topic} feature for the application.`;
  }

  // Embed package mentions in backticks (per GOTCHA: filter to backtick/npm-install context)
  if (mentionsPkgs.length > 0) {
    const pkgList = mentionsPkgs.map(p => `\`${p}\``).join(' and ');
    desc += ` Use ${pkgList} for this implementation.`;
  }

  // Embed comparison keyword
  if (hasComparison) {
    switch (hasComparison) {
      case 'evaluate':
        desc += ' Evaluate three options before choosing the best approach.';
        break;
      case 'compare':
        desc += ' We should compare the available libraries before committing to one.';
        break;
      case 'choose between':
        desc += ' Choose between the two approaches based on performance benchmarks.';
        break;
      case 'vs.':
        desc += ' Postgres vs. SQLite performance characteristics differ significantly at scale.';
        break;
      case 'select between':
        desc += ' Select between the two strategies based on latency requirements.';
        break;
      case 'EVALUATE':
        desc += ' EVALUATE the tradeoffs before finalizing the architecture.';
        break;
      case 'Evaluate':
        desc += ' Evaluate the current state of the ecosystem.';
        break;
      default:
        desc += ` ${hasComparison} the options available.`;
    }
  }

  return desc;
}

// ─── makePackageJson ──────────────────────────────────────────────────────────

/**
 * Build a package.json string with the given dependencies.
 *
 * @param {object} opts
 * @param {string[]} [opts.deps] - Runtime dependency names (value set to "^1.0.0")
 * @param {string[]} [opts.devDeps] - Dev dependency names
 * @returns {string} JSON string
 */
function makePackageJson({ deps = [], devDeps = [] } = {}) {
  const dependencies = {};
  const devDependencies = {};

  for (const d of deps) {
    dependencies[d] = '^1.0.0';
  }
  for (const d of devDeps) {
    devDependencies[d] = '^1.0.0';
  }

  return JSON.stringify({ name: 'test-project', version: '1.0.0', dependencies, devDependencies }, null, 2);
}

// ─── makePatternsMd ───────────────────────────────────────────────────────────

/**
 * Build a PATTERNS.md string with the given section headings.
 * Headings are emitted as `## <heading>` blocks with stub body text.
 *
 * @param {object} opts
 * @param {string[]} [opts.headings] - Section heading texts (e.g. ["Authentication", "Database"])
 * @returns {string}
 */
function makePatternsMd({ headings = [] } = {}) {
  if (headings.length === 0) {
    return '# Patterns\n\n_(no sections defined)_\n';
  }

  const sections = headings.map(h =>
    `## ${h}\n\nPattern notes for ${h.toLowerCase()}.\n`
  );

  return `# Codebase Patterns\n\n${sections.join('\n')}\n`;
}

// ─── setupObjectiveScaffold ────────────────────────────────────────────────────

/**
 * Write a minimal project scaffold into tmpRoot so that cmdDetectNovelDomain can resolve
 * the objective and read description / package.json / PATTERNS.md.
 *
 * Directory layout:
 *   <tmpRoot>/
 *     package.json                                    ← optional
 *     .planning/
 *       objectives/
 *         <NN>-<name>/
 *           <NN>-CONTEXT.md                           ← description source
 *       codebase/
 *         PATTERNS.md                                 ← optional
 *       ROADMAP.md                                    ← minimal, required by findObjectiveInternal
 *
 * @param {string} tmpRoot - absolute path to temp directory
 * @param {object} opts
 * @param {string} opts.objective - objective id, e.g. "98" → dir name "98-test-obj"
 * @param {string|null} opts.description - description text for CONTEXT.md (null = omit CONTEXT.md)
 * @param {string|null} opts.packageJson - JSON string for package.json (null = omit file)
 * @param {string|null} opts.patternsMd - PATTERNS.md content (null = omit file)
 * @returns {{ objectiveDir: string, objectiveNum: string }}
 */
function setupObjectiveScaffold(tmpRoot, { objective = '98', description = null, packageJson = null, patternsMd = null } = {}) {
  const objectiveNum = String(objective).padStart(2, '0');
  const objectiveDirName = `${objectiveNum}-test-obj`;
  const objectiveDir = path.join(tmpRoot, '.planning', 'objectives', objectiveDirName);

  // Create directories
  fs.mkdirSync(objectiveDir, { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, '.planning', 'codebase'), { recursive: true });

  // Write ROADMAP.md (minimal — required so findObjectiveInternal can parse objective number)
  const roadmapContent = `# Roadmap\n\n### Objective ${parseInt(objectiveNum, 10)}: Test objective\n\n**Goal:** Test.\n\n**Status:** In progress\n`;
  fs.writeFileSync(path.join(tmpRoot, '.planning', 'ROADMAP.md'), roadmapContent, 'utf-8');

  // Write CONTEXT.md if description provided
  if (description !== null) {
    const contextContent = `# Objective ${objectiveNum} Context\n\n## Goal\n\n${description}\n`;
    fs.writeFileSync(path.join(objectiveDir, `${objectiveNum}-CONTEXT.md`), contextContent, 'utf-8');
  }

  // Write package.json if provided
  if (packageJson !== null) {
    fs.writeFileSync(path.join(tmpRoot, 'package.json'), packageJson, 'utf-8');
  }

  // Write PATTERNS.md if provided
  if (patternsMd !== null) {
    fs.writeFileSync(path.join(tmpRoot, '.planning', 'codebase', 'PATTERNS.md'), patternsMd, 'utf-8');
  }

  return { objectiveDir, objectiveNum };
}

module.exports = {
  makeDescription,
  makePackageJson,
  makePatternsMd,
  setupObjectiveScaffold,
};
