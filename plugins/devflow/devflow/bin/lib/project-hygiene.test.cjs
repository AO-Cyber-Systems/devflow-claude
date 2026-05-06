'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ph = require('./project-hygiene.cjs');

function buildHygieneFixture({ projectFm = { github_repo: 'AO-Cyber-Systems/devflow-claude' }, objectives = {}, archivedObjectives = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-hygiene-test-'));
  fs.mkdirSync(path.join(dir, '.planning', 'objectives'), { recursive: true });

  if (projectFm !== null) {
    const fmYaml = Object.entries(projectFm).map(([k, v]) => `${k}: ${v}`).join('\n');
    fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'), `---\n${fmYaml}\n---\n# Project\n`);
  }

  for (const [name, frontmatter] of Object.entries(objectives)) {
    const objDir = path.join(dir, '.planning', 'objectives', name);
    fs.mkdirSync(objDir, { recursive: true });
    if (frontmatter === '__missing__') continue;
    if (frontmatter === '__corrupt__') {
      fs.writeFileSync(path.join(objDir, 'OBJECTIVE.md'), 'no frontmatter here\n');
    } else {
      const fmYaml = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join('\n');
      fs.writeFileSync(path.join(objDir, 'OBJECTIVE.md'), `---\n${fmYaml}\n---\n# ${name}\n`);
    }
  }

  for (const [name, frontmatter] of Object.entries(archivedObjectives)) {
    const archDir = path.join(dir, '.planning', 'milestones', 'v1.0-objectives', name);
    fs.mkdirSync(archDir, { recursive: true });
    const fmYaml = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join('\n');
    fs.writeFileSync(path.join(archDir, 'OBJECTIVE.md'), `---\n${fmYaml}\n---\n# ${name}\n`);
  }

  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

describe('scanForMisfiled', () => {
  test('22B1 — empty objectives dir returns ok with empty buckets', () => {
    const fx = buildHygieneFixture({ objectives: {} });
    try {
      const r = ph.scanForMisfiled({ cwd: fx.dir });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.project_repo, 'AO-Cyber-Systems/devflow-claude');
      assert.strictEqual(r.objectives_scanned, 0);
      assert.deepStrictEqual(r.misfiled, []);
      assert.deepStrictEqual(r.no_link, []);
      assert.strictEqual(r.skipped, false);
    } finally { fx.cleanup(); }
  });

  test('22B2 — parent_issue in different repo flags as misfiled', () => {
    const fx = buildHygieneFixture({
      objectives: { '01-foo': { parent_issue: 'AO-Cyber-Systems/aodex-go#42' } },
    });
    try {
      const r = ph.scanForMisfiled({ cwd: fx.dir });
      assert.strictEqual(r.misfiled.length, 1);
      assert.strictEqual(r.misfiled[0].objective, '01-foo');
      assert.strictEqual(r.misfiled[0].resolved_repo, 'AO-Cyber-Systems/aodex-go');
      assert.strictEqual(r.misfiled[0].via, 'parent_issue');
      assert.strictEqual(r.misfiled[0].ref, 'AO-Cyber-Systems/aodex-go#42');
      assert.strictEqual(r.misfiled[0].current_repo, 'AO-Cyber-Systems/devflow-claude');
    } finally { fx.cleanup(); }
  });

  test('22B3 — parent_issue matching own repo is NOT misfiled', () => {
    const fx = buildHygieneFixture({
      objectives: { '01-foo': { parent_issue: 'AO-Cyber-Systems/devflow-claude#42' } },
    });
    try {
      const r = ph.scanForMisfiled({ cwd: fx.dir });
      assert.deepStrictEqual(r.misfiled, []);
      assert.deepStrictEqual(r.no_link, []);
    } finally { fx.cleanup(); }
  });

  test('22B4 — github_issue in different repo flags as misfiled via github_issue', () => {
    const fx = buildHygieneFixture({
      objectives: { '02-bar': { github_issue: 'OtherOrg/other-repo#15' } },
    });
    try {
      const r = ph.scanForMisfiled({ cwd: fx.dir });
      assert.strictEqual(r.misfiled.length, 1);
      assert.strictEqual(r.misfiled[0].via, 'github_issue');
      assert.strictEqual(r.misfiled[0].ref, 'OtherOrg/other-repo#15');
    } finally { fx.cleanup(); }
  });

  test('22B5 — objective without parent_issue or github_issue → no_link', () => {
    const fx = buildHygieneFixture({
      objectives: { '03-baz': { kind: 'plugin', work: 'feature' } },
    });
    try {
      const r = ph.scanForMisfiled({ cwd: fx.dir });
      assert.strictEqual(r.no_link.length, 1);
      assert.strictEqual(r.no_link[0].objective, '03-baz');
      assert.deepStrictEqual(r.misfiled, []);
    } finally { fx.cleanup(); }
  });

  test('22B6 — corrupt OBJECTIVE.md (no frontmatter) is added to no_link as expected', () => {
    const fx = buildHygieneFixture({
      objectives: { '04-broken': '__corrupt__' },
    });
    try {
      const r = ph.scanForMisfiled({ cwd: fx.dir });
      // No frontmatter → no parent_issue or github_issue → no_link
      assert.strictEqual(r.no_link.length, 1);
    } finally { fx.cleanup(); }
  });

  test('22B7 — PROJECT.md missing github_repo returns reason', () => {
    const fx = buildHygieneFixture({
      projectFm: { name: 'something-else' },
      objectives: { '01-foo': { parent_issue: 'AO/other#1' } },
    });
    try {
      const r = ph.scanForMisfiled({ cwd: fx.dir });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.project_repo, null);
      assert.strictEqual(r.reason, 'github_repo absent in PROJECT.md');
    } finally { fx.cleanup(); }
  });

  test('22B8 — .planning/objectives missing returns warning', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-hygiene-test-'));
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.planning', 'PROJECT.md'),
      '---\ngithub_repo: own/repo\n---\n# P\n');
    try {
      const r = ph.scanForMisfiled({ cwd: dir });
      assert.strictEqual(r.objectives_scanned, 0);
      assert.ok(r.warnings.some(w => w.includes('not found')));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('22B9 — archived: true PROJECT.md sets project_archived but continues scanning', () => {
    const fx = buildHygieneFixture({
      projectFm: { github_repo: 'own/repo', archived: 'true' },
      objectives: { '01-foo': { parent_issue: 'other/repo#1' } },
    });
    try {
      const r = ph.scanForMisfiled({ cwd: fx.dir });
      assert.strictEqual(r.project_archived, true);
      assert.strictEqual(r.misfiled.length, 1);
    } finally { fx.cleanup(); }
  });

  test('22B10 — shorthand parent_issue (#9) collapses to no_link', () => {
    const fx = buildHygieneFixture({
      objectives: { '01-foo': { parent_issue: '#9' } },
    });
    try {
      const r = ph.scanForMisfiled({ cwd: fx.dir });
      assert.strictEqual(r.no_link.length, 1);
      assert.deepStrictEqual(r.misfiled, []);
    } finally { fx.cleanup(); }
  });

  test('22B11 — multiple objectives bucketed correctly', () => {
    const fx = buildHygieneFixture({
      objectives: {
        '01-mis': { parent_issue: 'other/a#1' },
        '02-own': { parent_issue: 'AO-Cyber-Systems/devflow-claude#2' },
        '03-mis2': { github_issue: 'other/b#3' },
        '04-no': { kind: 'plugin' },
      },
    });
    try {
      const r = ph.scanForMisfiled({ cwd: fx.dir });
      assert.strictEqual(r.objectives_scanned, 4);
      assert.strictEqual(r.misfiled.length, 2);
      assert.strictEqual(r.no_link.length, 1);
    } finally { fx.cleanup(); }
  });

  test('22B17 — excludes archived milestone objectives', () => {
    const fx = buildHygieneFixture({
      objectives: { '01-foo': { parent_issue: 'AO-Cyber-Systems/devflow-claude#1' } },
      archivedObjectives: { '02-bar': { parent_issue: 'other/repo#2' } },
    });
    try {
      const r = ph.scanForMisfiled({ cwd: fx.dir });
      assert.strictEqual(r.objectives_scanned, 1);
      assert.deepStrictEqual(r.misfiled, []);
    } finally { fx.cleanup(); }
  });
});

describe('cmdProjectHygieneCheck (subprocess)', () => {
  const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');

  test('22B13 — project-hygiene check returns valid JSON exit 0', () => {
    const fx = buildHygieneFixture({
      objectives: { '01-foo': { parent_issue: 'AO-Cyber-Systems/devflow-claude#1' } },
    });
    try {
      const out = execSync(`node ${dfTools} project-hygiene check`, { cwd: fx.dir, encoding: 'utf-8' });
      const parsed = JSON.parse(out.trim());
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.objectives_scanned, 1);
    } finally { fx.cleanup(); }
  });

  test('22B15 — project-hygiene with no subcommand exits non-zero', () => {
    const fx = buildHygieneFixture({ objectives: {} });
    try {
      assert.throws(
        () => execSync(`node ${dfTools} project-hygiene`, { cwd: fx.dir, encoding: 'utf-8', stdio: 'pipe' }),
        /Unknown project-hygiene/i
      );
    } finally { fx.cleanup(); }
  });

  test('22B16 — project-hygiene unknown subcommand exits non-zero', () => {
    const fx = buildHygieneFixture({ objectives: {} });
    try {
      assert.throws(
        () => execSync(`node ${dfTools} project-hygiene bogus`, { cwd: fx.dir, encoding: 'utf-8', stdio: 'pipe' }),
        /Unknown project-hygiene/i
      );
    } finally { fx.cleanup(); }
  });
});
