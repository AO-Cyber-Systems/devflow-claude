'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { extractFrontmatter, reconstructFrontmatter, spliceFrontmatter } = require('./frontmatter.cjs');

test('extractFrontmatter — baseline parse (existing fields unchanged)', () => {
  const c = `---\nkind: api\ndefault_work: feature\n---\n\n# Test`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.kind, 'api');
  assert.strictEqual(fm.default_work, 'feature');
});

test('extractFrontmatter — PROJECT.md new fields', () => {
  const c = `---\nkind: plugin\ngithub_repo: AO-Cyber-Systems/devflow-claude\norg_project: PVT_kwDODwqLrc4BRsOP\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.github_repo, 'AO-Cyber-Systems/devflow-claude');
  assert.strictEqual(fm.org_project, 'PVT_kwDODwqLrc4BRsOP');
});

test('extractFrontmatter — OBJECTIVE.md new fields with full ref', () => {
  const c = `---\nwork: feature\ngithub_issue: AO-Cyber-Systems/devflow-claude#20\nparent_issue: AO-Cyber-Systems/devflow-claude#9\norg_initiative: devflow-internal-alpha\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#20');
  assert.strictEqual(fm.parent_issue, 'AO-Cyber-Systems/devflow-claude#9');
  assert.strictEqual(fm.org_initiative, 'devflow-internal-alpha');
});

test('extractFrontmatter — OBJECTIVE.md shorthand parse', () => {
  // The # character makes the parser quote-handle it. Both quoted and unquoted should work.
  const cQuoted = `---\nwork: feature\nparent_issue: "#9"\n---\n\n# x`;
  const cUnquoted = `---\nwork: feature\nparent_issue: #9\n---\n\n# x`;
  const fmQ = extractFrontmatter(cQuoted);
  const fmU = extractFrontmatter(cUnquoted);
  assert.strictEqual(fmQ.parent_issue, '#9', 'quoted shorthand should yield #9 literal');
  assert.strictEqual(fmU.parent_issue, '#9', 'unquoted shorthand should yield #9 literal');
});

test('extractFrontmatter — absence of new fields is silent', () => {
  const c = `---\nwork: feature\n---\n\n# Existing file`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, undefined);
  assert.strictEqual(fm.parent_issue, undefined);
  assert.strictEqual(fm.org_initiative, undefined);
  assert.strictEqual(fm.org_project, undefined);
});

test('extractFrontmatter — TRD frontmatter per-TRD github_issue override', () => {
  const c = `---\nobjective: 01-test\ntrd: 01\ntype: tdd\ngithub_issue: AO-Cyber-Systems/devflow-claude#52\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#52');
});

test('reconstructFrontmatter — preserves new fields round-trip', () => {
  const orig = {
    work: 'feature',
    github_issue: 'AO-Cyber-Systems/devflow-claude#20',
    parent_issue: '#9',
  };
  const yaml = reconstructFrontmatter(orig);
  assert.match(yaml, /github_issue:.*devflow-claude#20/);
  assert.match(yaml, /parent_issue:.*"#9"/, 'shorthand should round-trip with quotes (parser quotes # values)');
});

test('extractFrontmatter — combined: all new + existing fields together', () => {
  const c = `---\nwork: feature\ngithub_issue: AO-Cyber-Systems/devflow-claude#20\nparent_issue: "#9"\norg_initiative: devflow-internal-alpha\norg_project: PVT_kwDODwqLrc4BRsOP\noverrides:\n  tdd: strict\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#20');
  assert.strictEqual(fm.parent_issue, '#9');
  assert.strictEqual(fm.org_initiative, 'devflow-internal-alpha');
  assert.strictEqual(fm.org_project, 'PVT_kwDODwqLrc4BRsOP');
  assert.deepStrictEqual(fm.overrides, { tdd: 'strict' });
});
