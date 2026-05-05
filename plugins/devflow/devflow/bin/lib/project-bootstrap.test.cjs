'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const { bootstrapProjectMd } = require('./project-bootstrap.cjs');

// Helper: scaffold a tmp git repo with optional remote + optional PROJECT.md content.
function makeRepo({ remote, projectMd }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-'));
  execSync('git init -q', { cwd: root });
  if (remote) execSync(`git remote add origin ${remote}`, { cwd: root });
  if (projectMd !== undefined) {
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(root, '.planning', 'PROJECT.md'), projectMd, 'utf-8');
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
