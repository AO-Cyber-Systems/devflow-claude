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

// ─── 22-03 moveObjective tests ──────────────────────────────────────────────

function buildTargetRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-target-'));
  fs.mkdirSync(path.join(dir, '.planning', 'objectives'), { recursive: true });
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function writeObjectiveContent(srcDir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(srcDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

describe('moveObjective', () => {
  test('22C1 — successful move returns ok with file/byte counts', () => {
    const src = buildHygieneFixture({
      objectives: { '05-foo': { kind: 'plugin', work: 'feature' } },
    });
    const dst = buildTargetRepo();
    try {
      writeObjectiveContent(path.join(src.dir, '.planning', 'objectives', '05-foo'), {
        'CONTEXT.md': '# Context\n',
        'sub/note.md': 'note\n',
      });
      const r = ph.moveObjective({ cwd: src.dir, objectiveId: '05-foo', targetRepoPath: dst.dir });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.source_removed, true);
      assert.ok(r.files_copied >= 3);
      assert.ok(r.bytes_copied > 0);
      assert.ok(Array.isArray(r.next_steps) && r.next_steps.length === 2);
    } finally { src.cleanup(); dst.cleanup(); }
  });

  test('22C2 — after move source gone, target has same content', () => {
    const src = buildHygieneFixture({ objectives: { '05-foo': { kind: 'plugin' } } });
    const dst = buildTargetRepo();
    try {
      const srcObj = path.join(src.dir, '.planning', 'objectives', '05-foo');
      writeObjectiveContent(srcObj, { 'CONTEXT.md': 'hello\n' });
      const r = ph.moveObjective({ cwd: src.dir, objectiveId: '05-foo', targetRepoPath: dst.dir });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(fs.existsSync(srcObj), false);
      const movedFile = path.join(dst.dir, '.planning', 'objectives', '05-foo', 'CONTEXT.md');
      assert.strictEqual(fs.readFileSync(movedFile, 'utf-8'), 'hello\n');
    } finally { src.cleanup(); dst.cleanup(); }
  });

  test('22C3 — target dir already exists refuses, source preserved', () => {
    const src = buildHygieneFixture({ objectives: { '05-foo': { kind: 'plugin' } } });
    const dst = buildTargetRepo();
    try {
      fs.mkdirSync(path.join(dst.dir, '.planning', 'objectives', '05-foo'), { recursive: true });
      const r = ph.moveObjective({ cwd: src.dir, objectiveId: '05-foo', targetRepoPath: dst.dir });
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /destination already exists/);
      assert.ok(fs.existsSync(path.join(src.dir, '.planning', 'objectives', '05-foo')));
    } finally { src.cleanup(); dst.cleanup(); }
  });

  test('22C4 — target lacking .planning/objectives/ refuses', () => {
    const src = buildHygieneFixture({ objectives: { '05-foo': { kind: 'plugin' } } });
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'df-bad-target-'));
    try {
      const r = ph.moveObjective({ cwd: src.dir, objectiveId: '05-foo', targetRepoPath: bad });
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /devflow project/i);
    } finally { src.cleanup(); fs.rmSync(bad, { recursive: true, force: true }); }
  });

  test('22C5 — non-existent objective returns not found', () => {
    const src = buildHygieneFixture({ objectives: { '05-foo': { kind: 'plugin' } } });
    const dst = buildTargetRepo();
    try {
      const r = ph.moveObjective({ cwd: src.dir, objectiveId: '99-nope', targetRepoPath: dst.dir });
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /not found/);
    } finally { src.cleanup(); dst.cleanup(); }
  });

  test('22C7 — verify failure rolls back dest, source preserved', () => {
    const src = buildHygieneFixture({ objectives: { '05-foo': { kind: 'plugin' } } });
    const dst = buildTargetRepo();
    try {
      writeObjectiveContent(path.join(src.dir, '.planning', 'objectives', '05-foo'), {
        'CONTEXT.md': 'hi\n',
      });
      let call = 0;
      ph._setWalkStats(() => {
        call++;
        return call === 1 ? { files: 999, bytes: 999 } : { files: 1, bytes: 3 };
      });
      const r = ph.moveObjective({ cwd: src.dir, objectiveId: '05-foo', targetRepoPath: dst.dir });
      ph._resetWalkStats();
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /verify failed/);
      assert.strictEqual(r.source_removed, false);
      assert.ok(fs.existsSync(path.join(src.dir, '.planning', 'objectives', '05-foo')));
      assert.strictEqual(fs.existsSync(path.join(dst.dir, '.planning', 'objectives', '05-foo')), false);
    } finally { src.cleanup(); dst.cleanup(); ph._resetWalkStats(); }
  });

  test('22C10 — _walkStats empty dir returns zeros', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-walk-'));
    try {
      assert.deepStrictEqual(ph._walkStats(dir), { files: 0, bytes: 0 });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('22C11 — _walkStats counts files + bytes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-walk-'));
    try {
      fs.writeFileSync(path.join(dir, 'a.txt'), 'abc');
      fs.writeFileSync(path.join(dir, 'b.txt'), 'defgh');
      assert.deepStrictEqual(ph._walkStats(dir), { files: 2, bytes: 8 });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('22C12 — _walkStats traverses nested dirs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-walk-'));
    try {
      fs.mkdirSync(path.join(dir, 'sub'));
      fs.writeFileSync(path.join(dir, 'sub', 'x.txt'), 'xyz');
      assert.deepStrictEqual(ph._walkStats(dir), { files: 1, bytes: 3 });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('22C13 — _walkStats includes dotfiles', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-walk-'));
    try {
      fs.writeFileSync(path.join(dir, '.gitkeep'), '');
      fs.writeFileSync(path.join(dir, 'visible.txt'), 'v');
      assert.deepStrictEqual(ph._walkStats(dir), { files: 2, bytes: 1 });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('22C14 — _walkStats missing path returns zeros', () => {
    assert.deepStrictEqual(ph._walkStats('/nonexistent/path/zzz'), { files: 0, bytes: 0 });
  });
});

describe('cmdProjectHygieneMove (subprocess)', () => {
  const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');

  test('22C16 — move with no args errors', () => {
    const src = buildHygieneFixture({ objectives: {} });
    try {
      assert.throws(
        () => execSync(`node ${dfTools} project-hygiene move`, { cwd: src.dir, encoding: 'utf-8', stdio: 'pipe' }),
        /objective-id required/
      );
    } finally { src.cleanup(); }
  });

  test('22C17 — move with no --to errors', () => {
    const src = buildHygieneFixture({ objectives: { '05-foo': { kind: 'plugin' } } });
    try {
      assert.throws(
        () => execSync(`node ${dfTools} project-hygiene move 05-foo`, { cwd: src.dir, encoding: 'utf-8', stdio: 'pipe' }),
        /--to/
      );
    } finally { src.cleanup(); }
  });
});

// ─── 22-04 archive tests ────────────────────────────────────────────────────

describe('detectArchiveCandidates', () => {
  test('22D1 — archived flag flags candidate', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'df-ws-'));
    try {
      const repoDir = path.join(ws, 'old-repo');
      fs.mkdirSync(path.join(repoDir, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(repoDir, '.planning', 'PROJECT.md'),
        '---\ngithub_repo: org/old-repo\narchived: true\n---\n# old\n');
      const r = ph.detectArchiveCandidates({ workspaceDir: ws });
      assert.strictEqual(r.candidates.length, 1);
      assert.strictEqual(r.candidates[0].archived_flag, true);
      assert.strictEqual(r.candidates[0].name, 'old-repo');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('22D2 — active project not flagged', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'df-ws-'));
    try {
      const repoDir = path.join(ws, 'live-repo');
      fs.mkdirSync(path.join(repoDir, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(repoDir, '.planning', 'PROJECT.md'),
        '---\ngithub_repo: org/live-repo\n---\n# live\n');
      const r = ph.detectArchiveCandidates({ workspaceDir: ws });
      // No archived flag, no git history (returns null timestamp = not stale)
      assert.strictEqual(r.candidates.length, 0);
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('22D3 — workspace missing returns error', () => {
    const r = ph.detectArchiveCandidates({ workspaceDir: '/nonexistent/zzz' });
    assert.strictEqual(r.errors.length, 1);
  });
});

describe('applyArchive', () => {
  test('22D4 — applies archive moves .planning to archived-projects/', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'df-ws-'));
    try {
      const repoDir = path.join(ws, 'old-repo');
      fs.mkdirSync(path.join(repoDir, '.planning', 'objectives'), { recursive: true });
      fs.writeFileSync(path.join(repoDir, '.planning', 'PROJECT.md'),
        '---\ngithub_repo: org/old-repo\narchived: true\n---\n# old\n');
      const r = ph.applyArchive({ workspaceDir: ws, name: 'old-repo' });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(fs.existsSync(path.join(repoDir, '.planning')), false);
      assert.strictEqual(fs.existsSync(path.join(ws, 'archived-projects', 'old-repo', '.planning')), true);
      assert.strictEqual(r.gh_archive_command, 'gh repo archive org/old-repo');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('22D5 — refuses self-archive', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'df-self-archive-'));
    try {
      const wsName = path.basename(ws);
      const r = ph.applyArchive({ workspaceDir: ws, name: wsName });
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /self-archive/);
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('22D6 — repo without .planning errors', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'df-ws-'));
    try {
      fs.mkdirSync(path.join(ws, 'no-planning'));
      const r = ph.applyArchive({ workspaceDir: ws, name: 'no-planning' });
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /no \.planning/);
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('22D7 — refuses if archive destination exists', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'df-ws-'));
    try {
      const repoDir = path.join(ws, 'old-repo');
      fs.mkdirSync(path.join(repoDir, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(repoDir, '.planning', 'PROJECT.md'),
        '---\ngithub_repo: org/old\narchived: true\n---\n# x\n');
      fs.mkdirSync(path.join(ws, 'archived-projects', 'old-repo', '.planning'), { recursive: true });
      const r = ph.applyArchive({ workspaceDir: ws, name: 'old-repo' });
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /already exists/);
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });
});

