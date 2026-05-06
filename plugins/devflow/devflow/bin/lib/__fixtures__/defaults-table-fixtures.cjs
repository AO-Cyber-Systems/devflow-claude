'use strict';

// Hand-built fixture builders for defaults-loader tests (TRD 21-04).
// Per TDD playbook habit 4: factory functions, not LLM-generated test data.

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Build a partial defaults-table markdown file with only specified
 * (kind, work, field) cells populated. Useful for tier-override tests
 * without writing all 42 cells.
 *
 * cells shape: { 'api.feature': { tdd: '...', depth: '...' }, 'cli.port': { ... } }
 */
function buildPartialDefaultsTable({ cells = {}, includeConstraints = false } = {}) {
  const lines = ['---', 'fixture: true', '---', '', '# Partial defaults table (test fixture)', '', '```yaml', 'defaults:'];

  // Group cells by kind
  const byKind = {};
  for (const [pathKey, fields] of Object.entries(cells)) {
    const [kind, work] = pathKey.split('.');
    byKind[kind] = byKind[kind] || {};
    byKind[kind][work] = fields;
  }

  for (const [kind, works] of Object.entries(byKind)) {
    lines.push(`  ${kind}:`);
    for (const [work, fields] of Object.entries(works)) {
      lines.push(`    ${work}:`);
      for (const [field, value] of Object.entries(fields)) {
        const v = (typeof value === 'string') ? `"${value}"` : value;
        lines.push(`      ${field}: ${v}`);
      }
    }
  }

  if (includeConstraints) {
    lines.push('');
    lines.push('constraints:');
    lines.push('  - id: no_llm_test_data');
    lines.push('    description: "test fixture"');
    lines.push('    opt_out_field: "frontmatter.allow_generated_test_data"');
  }

  lines.push('```', '');
  return lines.join('\n');
}

/**
 * Build a temp project + userHome with optional defaults-table files at each tier.
 * Returns { root, userHome, cleanup }.
 */
function buildTempProjectWithDefaults({ projectTable = null, orgTable = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-defaults-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (projectTable !== null) {
    fs.writeFileSync(path.join(root, '.planning', 'defaults-table.md'), projectTable, 'utf-8');
  }

  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-userhome-'));
  if (orgTable !== null) {
    fs.mkdirSync(path.join(userHome, '.claude', 'devflow'), { recursive: true });
    fs.writeFileSync(path.join(userHome, '.claude', 'devflow', 'defaults-table.md'), orgTable, 'utf-8');
  }

  return {
    root,
    userHome,
    cleanup: () => {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
      try { fs.rmSync(userHome, { recursive: true, force: true }); } catch (_) {}
    },
  };
}

module.exports = { buildPartialDefaultsTable, buildTempProjectWithDefaults };
