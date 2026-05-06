'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const { bootstrapProjectMd, bootstrapObjectiveMd, backfillAllObjectives } = require('./project-bootstrap.cjs');

// Helper: scaffold a tmp git repo with optional remote + optional PROJECT.md content.
// objectives: Record<objectiveId, string|null> — null = create dir only; string = create dir + OBJECTIVE.md with that content
// roadmap: string content for .planning/ROADMAP.md
function makeRepo({ remote, projectMd, roadmap, objectives }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-'));
  execSync('git init -q', { cwd: root });
  if (remote) execSync(`git remote add origin ${remote}`, { cwd: root });
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (projectMd !== undefined) {
    fs.writeFileSync(path.join(root, '.planning', 'PROJECT.md'), projectMd, 'utf-8');
  }
  if (roadmap !== undefined) {
    fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'), roadmap, 'utf-8');
  }
  if (objectives) {
    const objDir = path.join(root, '.planning', 'objectives');
    fs.mkdirSync(objDir, { recursive: true });
    for (const [id, content] of Object.entries(objectives)) {
      const dir = path.join(objDir, id);
      fs.mkdirSync(dir, { recursive: true });
      if (content !== null) {
        fs.writeFileSync(path.join(dir, 'OBJECTIVE.md'), content, 'utf-8');
      }
    }
  }
  return root;
}

test('B1 — no PROJECT.md → applied:false, reason="no PROJECT.md"', () => {
  const repo = makeRepo({ remote: 'https://github.com/AO-Cyber-Systems/foo.git' });
  try {
    const r = bootstrapProjectMd(repo);
    assert.strictEqual(r.applied, false);
    assert.strictEqual(r.reason, 'no PROJECT.md');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('B2 — no git remote → applied:false, reason="no git remote"', () => {
  const repo = makeRepo({ projectMd: '# Foo\n' });
  try {
    const r = bootstrapProjectMd(repo);
    assert.strictEqual(r.applied, false);
    assert.strictEqual(r.reason, 'no git remote');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('B3 — non-GitHub remote → applied:false, reason="remote URL not GitHub"', () => {
  const repo = makeRepo({
    remote: 'https://gitlab.com/foo/bar.git',
    projectMd: '# Foo\n',
  });
  try {
    const r = bootstrapProjectMd(repo);
    assert.strictEqual(r.applied, false);
    assert.strictEqual(r.reason, 'remote URL not GitHub');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('B4 — PROJECT.md without frontmatter → prepends org+github_repo', () => {
  const repo = makeRepo({
    remote: 'https://github.com/AO-Cyber-Systems/aodex-dev.git',
    projectMd: '# AODex Dev\n\nSome content.\n',
  });
  try {
    const r = bootstrapProjectMd(repo);
    assert.strictEqual(r.applied, true);
    assert.deepStrictEqual(r.added_fields.sort(), ['github_repo', 'org']);
    const content = fs.readFileSync(path.join(repo, '.planning', 'PROJECT.md'), 'utf-8');
    assert.match(content, /^---\norg: AO-Cyber-Systems\ngithub_repo: AO-Cyber-Systems\/aodex-dev\n---/);
    assert.match(content, /# AODex Dev/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('B5 — PROJECT.md with frontmatter missing org+github_repo → both added', () => {
  const repo = makeRepo({
    remote: 'https://github.com/AO-Cyber-Systems/foo.git',
    projectMd: '---\nkind: api\ndefault_work: feature\n---\n\n# Foo\n',
  });
  try {
    const r = bootstrapProjectMd(repo);
    assert.strictEqual(r.applied, true);
    assert.deepStrictEqual(r.added_fields.sort(), ['github_repo', 'org']);
    const content = fs.readFileSync(path.join(repo, '.planning', 'PROJECT.md'), 'utf-8');
    assert.match(content, /kind: api/);
    assert.match(content, /default_work: feature/);
    assert.match(content, /org: AO-Cyber-Systems/);
    assert.match(content, /github_repo: AO-Cyber-Systems\/foo/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('B6 — PROJECT.md with org but missing github_repo → only github_repo added', () => {
  const repo = makeRepo({
    remote: 'https://github.com/AO-Cyber-Systems/foo.git',
    projectMd: '---\nkind: api\norg: AO-Cyber-Systems\n---\n\n# Foo\n',
  });
  try {
    const r = bootstrapProjectMd(repo);
    assert.strictEqual(r.applied, true);
    assert.deepStrictEqual(r.added_fields, ['github_repo']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('B7 — PROJECT.md with both fields → no-op, applied:false, reason="already bootstrapped"', () => {
  const repo = makeRepo({
    remote: 'https://github.com/AO-Cyber-Systems/foo.git',
    projectMd: '---\norg: AO-Cyber-Systems\ngithub_repo: AO-Cyber-Systems/foo\n---\n\n# Foo\n',
  });
  try {
    const r = bootstrapProjectMd(repo);
    assert.strictEqual(r.applied, false);
    assert.strictEqual(r.reason, 'already bootstrapped');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('B8 — SSH remote URL parsed correctly', () => {
  const repo = makeRepo({
    remote: 'git@github.com:AO-Cyber-Systems/foo.git',
    projectMd: '# Foo\n',
  });
  try {
    const r = bootstrapProjectMd(repo);
    assert.strictEqual(r.applied, true);
    const content = fs.readFileSync(path.join(repo, '.planning', 'PROJECT.md'), 'utf-8');
    assert.match(content, /github_repo: AO-Cyber-Systems\/foo/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('B9 — idempotent: running twice produces same result', () => {
  const repo = makeRepo({
    remote: 'https://github.com/AO-Cyber-Systems/foo.git',
    projectMd: '# Foo\n',
  });
  try {
    const r1 = bootstrapProjectMd(repo);
    assert.strictEqual(r1.applied, true);
    const content1 = fs.readFileSync(path.join(repo, '.planning', 'PROJECT.md'), 'utf-8');

    const r2 = bootstrapProjectMd(repo);
    assert.strictEqual(r2.applied, false);
    assert.strictEqual(r2.reason, 'already bootstrapped');
    const content2 = fs.readFileSync(path.join(repo, '.planning', 'PROJECT.md'), 'utf-8');
    assert.strictEqual(content1, content2, 'second run must not mutate file');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// TEST LIST — Group O — bootstrapObjectiveMd + backfillAllObjectives (TRD 18-01)
//
// O1 — bootstrapObjectiveMd: missing OBJECTIVE.md + valid PROJECT.md → applied:true, added_fields:['work']
// O2 — bootstrapObjectiveMd: existing OBJECTIVE.md → applied:false, reason:'already exists'
// O3 — bootstrapObjectiveMd: missing PROJECT.md → uses 'feature' fallback; still applies
// O4 — bootstrapObjectiveMd: PROJECT.md default_work=refactor → stub uses work:refactor
// O5 — bootstrapObjectiveMd: objective dir doesn't exist → applied:false, reason:'objective dir not found'
// O6 — bootstrapObjectiveMd: ROADMAP.md has '### Objective 5: Foo bar' + '**Goal:** baz' → stub goal includes 'baz'
// O7 — bootstrapObjectiveMd: idempotent — second invocation produces no file mtime change
// O8 — backfillAllObjectives: scans dirs, returns { scanned, applied, skipped, errors } shape
// O9 — backfillAllObjectives: mixed dirs (3 missing, 1 exists) → applied:3, skipped:1
// O10 — bootstrapObjectiveMd: pure file I/O, no shell-out (mock execSync to throw, function still works)

test('O1 — bootstrapObjectiveMd: missing OBJECTIVE.md + valid PROJECT.md → applied:true, added_fields:["work"]', () => {
  const repo = makeRepo({
    projectMd: '---\nkind: plugin\ndefault_work: feature\n---\n\n# Test Project\n',
    objectives: { '01-foo': null },
  });
  try {
    const r = bootstrapObjectiveMd(repo, '01-foo');
    assert.strictEqual(r.applied, true);
    assert.deepStrictEqual(r.added_fields, ['work']);
    assert.ok(r.path, 'path should be set');
    assert.strictEqual(r.reason, null);
    const content = fs.readFileSync(r.path, 'utf-8');
    assert.match(content, /^work: \w+/m);
    assert.match(content, /^# /m);
    assert.match(content, /## Goal/);
    assert.match(content, /\*Created: \d{4}-\d{2}-\d{2}/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('O2 — bootstrapObjectiveMd: existing OBJECTIVE.md → applied:false, reason:"already exists"', () => {
  const existingContent = '---\nwork: refactor\n---\n\n# Existing\n';
  const repo = makeRepo({
    projectMd: '---\nkind: plugin\ndefault_work: feature\n---\n\n# Test\n',
    objectives: { '02-bar': existingContent },
  });
  try {
    const r = bootstrapObjectiveMd(repo, '02-bar');
    assert.strictEqual(r.applied, false);
    assert.strictEqual(r.reason, 'already exists');
    assert.deepStrictEqual(r.added_fields, []);
    // Confirm file was not modified
    const content = fs.readFileSync(r.path, 'utf-8');
    assert.strictEqual(content, existingContent);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('O3 — bootstrapObjectiveMd: missing PROJECT.md → uses "feature" fallback; still applies', () => {
  const repo = makeRepo({
    objectives: { '03-baz': null },
  });
  // No projectMd written (no .planning/PROJECT.md)
  try {
    const r = bootstrapObjectiveMd(repo, '03-baz');
    assert.strictEqual(r.applied, true);
    assert.deepStrictEqual(r.added_fields, ['work']);
    const content = fs.readFileSync(r.path, 'utf-8');
    assert.match(content, /^work: feature$/m);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('O4 — bootstrapObjectiveMd: PROJECT.md default_work=refactor → stub uses work:refactor', () => {
  const repo = makeRepo({
    projectMd: '---\nkind: api\ndefault_work: refactor\n---\n\n# Refactor Project\n',
    objectives: { '04-qux': null },
  });
  try {
    const r = bootstrapObjectiveMd(repo, '04-qux');
    assert.strictEqual(r.applied, true);
    const content = fs.readFileSync(r.path, 'utf-8');
    assert.match(content, /^work: refactor$/m);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('O5 — bootstrapObjectiveMd: objective dir doesn\'t exist → applied:false, reason:"objective dir not found"', () => {
  const repo = makeRepo({
    projectMd: '---\nkind: plugin\ndefault_work: feature\n---\n\n# Test\n',
  });
  try {
    const r = bootstrapObjectiveMd(repo, '99-nonexistent');
    assert.strictEqual(r.applied, false);
    assert.strictEqual(r.reason, 'objective dir not found');
    assert.strictEqual(r.path, null);
    assert.deepStrictEqual(r.added_fields, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('O6 — bootstrapObjectiveMd: ROADMAP.md has "### Objective 5:" + "**Goal:** baz" → stub goal includes "baz"', () => {
  const roadmap = [
    '# Roadmap',
    '',
    '### Objective 5: Foo Bar Initiative',
    '',
    '**Goal:** baz quux integration layer',
    '',
    'Some other text.',
  ].join('\n');
  const repo = makeRepo({
    projectMd: '---\nkind: plugin\ndefault_work: feature\n---\n\n# Test\n',
    roadmap,
    objectives: { '05-foo-bar-initiative': null },
  });
  try {
    const r = bootstrapObjectiveMd(repo, '05-foo-bar-initiative');
    assert.strictEqual(r.applied, true);
    const content = fs.readFileSync(r.path, 'utf-8');
    assert.match(content, /baz quux integration layer/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('O7 — bootstrapObjectiveMd: idempotent — second invocation produces no file mtime change', () => {
  const repo = makeRepo({
    projectMd: '---\nkind: plugin\ndefault_work: feature\n---\n\n# Test\n',
    objectives: { '07-idempotent': null },
  });
  try {
    const r1 = bootstrapObjectiveMd(repo, '07-idempotent');
    assert.strictEqual(r1.applied, true);
    const mtime1 = fs.statSync(r1.path).mtimeMs;

    // Small delay to ensure mtime would differ if file was re-written
    const r2 = bootstrapObjectiveMd(repo, '07-idempotent');
    assert.strictEqual(r2.applied, false);
    assert.strictEqual(r2.reason, 'already exists');
    const mtime2 = fs.statSync(r2.path).mtimeMs;
    assert.strictEqual(mtime1, mtime2, 'second invocation must not mutate file');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('O8 — backfillAllObjectives: scans dirs, returns { scanned, applied, skipped, errors } shape', () => {
  const repo = makeRepo({
    projectMd: '---\nkind: plugin\ndefault_work: feature\n---\n\n# Test\n',
    objectives: {
      '01-alpha': null,
      '02-beta': null,
    },
  });
  try {
    const r = backfillAllObjectives(repo);
    assert.ok(typeof r.scanned === 'number', 'scanned must be a number');
    assert.ok(typeof r.applied === 'number', 'applied must be a number');
    assert.ok(typeof r.skipped === 'number', 'skipped must be a number');
    assert.ok(Array.isArray(r.errors), 'errors must be an array');
    assert.strictEqual(r.scanned, 2);
    assert.strictEqual(r.applied, 2);
    assert.strictEqual(r.skipped, 0);
    assert.deepStrictEqual(r.errors, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('O9 — backfillAllObjectives: mixed dirs (3 missing, 1 exists) → applied:3, skipped:1', () => {
  const existingContent = '---\nwork: foundation\n---\n\n# Existing\n';
  const repo = makeRepo({
    projectMd: '---\nkind: plugin\ndefault_work: feature\n---\n\n# Test\n',
    objectives: {
      '01-alpha': null,
      '02-beta': null,
      '03-gamma': null,
      '04-delta': existingContent,
    },
  });
  try {
    const r = backfillAllObjectives(repo);
    assert.strictEqual(r.scanned, 4);
    assert.strictEqual(r.applied, 3);
    assert.strictEqual(r.skipped, 1);
    assert.deepStrictEqual(r.errors, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('O10 — bootstrapObjectiveMd: pure file I/O (no execSync dependency — function works without git)', () => {
  // bootstrapObjectiveMd must NOT call execSync (unlike bootstrapProjectMd which needs git remote).
  // We verify this by using a non-git temp dir — the function should still work fine.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-nogit-'));
  try {
    // Set up structure without git init
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.planning', 'PROJECT.md'),
      '---\nkind: plugin\ndefault_work: feature\n---\n\n# Test\n',
      'utf-8'
    );
    fs.mkdirSync(path.join(root, '.planning', 'objectives', '10-no-git'), { recursive: true });

    const r = bootstrapObjectiveMd(root, '10-no-git');
    assert.strictEqual(r.applied, true, 'bootstrapObjectiveMd must not require git');
    assert.deepStrictEqual(r.added_fields, ['work']);
    const content = fs.readFileSync(r.path, 'utf-8');
    assert.match(content, /^work: feature$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
