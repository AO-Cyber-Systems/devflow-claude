'use strict';

// Hand-built fixture generators for intent resolution tests.
// Per TDD playbook: factory functions, not LLM-generated test data.

const fs = require('fs');
const path = require('path');
const os = require('os');

function projectMd({ kind, default_work, body = 'Test project.' } = {}) {
  const lines = ['---'];
  if (kind !== undefined) lines.push(`kind: ${kind}`);
  if (default_work !== undefined) lines.push(`default_work: ${default_work}`);
  lines.push('---', '', '# Test Project', '', body, '');
  return lines.join('\n');
}

function objectiveMd({ work, overrides, body = 'Test objective.' } = {}) {
  const lines = ['---'];
  if (work !== undefined) lines.push(`work: ${work}`);
  if (overrides) {
    lines.push('overrides:');
    for (const [k, v] of Object.entries(overrides)) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  lines.push('---', '', '# Test Objective', '', body, '');
  return lines.join('\n');
}

function trdMd({ type, confidence, work, body = 'Test TRD.' } = {}) {
  const lines = ['---', 'objective: 01-test', 'trd: 01'];
  if (type !== undefined) lines.push(`type: ${type}`);
  if (confidence !== undefined) lines.push(`confidence: ${confidence}`);
  if (work !== undefined) lines.push(`work: ${work}`);
  lines.push('---', '', body, '');
  return lines.join('\n');
}

function claudeMd({ tddSection, otherSections = [] } = {}) {
  const lines = ['# CLAUDE.md', ''];
  for (const section of otherSections) {
    lines.push(`## ${section.heading}`, '', section.body, '');
  }
  if (tddSection) {
    lines.push(`## ${tddSection.heading || 'TDD Playbook'}`, '', tddSection.body, '');
  }
  return lines.join('\n');
}

// Build a temporary project tree on disk. Returns the project root path
// plus a `cleanup()` function. Tests call cleanup() in afterEach.
function buildProject({
  projectFrontmatter,
  objectives = [],     // [{ id, work, overrides, body }]
  claudeMdProject,     // string content for ./CLAUDE.md (project-level)
  claudeMdUser,        // string content for ~/.claude/CLAUDE.md replacement (we redirect via env)
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-intent-'));
  fs.mkdirSync(path.join(root, '.planning', 'objectives'), { recursive: true });

  if (projectFrontmatter !== false) {
    fs.writeFileSync(
      path.join(root, '.planning', 'PROJECT.md'),
      projectMd(projectFrontmatter || {}),
      'utf-8'
    );
  }

  for (const obj of objectives) {
    const dir = path.join(root, '.planning', 'objectives', obj.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'OBJECTIVE.md'),
      objectiveMd(obj),
      'utf-8'
    );
  }

  if (claudeMdProject !== undefined) {
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), claudeMdProject, 'utf-8');
  }

  // For user-CLAUDE.md absorption tests, write to a sandboxed home dir
  let userHome;
  if (claudeMdUser !== undefined) {
    userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-home-'));
    fs.mkdirSync(path.join(userHome, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(userHome, '.claude', 'CLAUDE.md'), claudeMdUser, 'utf-8');
  }

  return {
    root,
    userHome,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
      if (userHome) fs.rmSync(userHome, { recursive: true, force: true });
    },
  };
}

module.exports = {
  projectMd,
  objectiveMd,
  trdMd,
  claudeMd,
  buildProject,
};
