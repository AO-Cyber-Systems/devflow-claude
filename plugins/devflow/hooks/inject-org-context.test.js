/**
 * Tests for inject-org-context SessionStart hook (DRAFT, v1.1).
 *
 * Covers:
 *   - findPlanningDir walks up from cwd
 *   - readCurrentObjective parses STATE.md objective line
 *   - renderPreamble shape with various resolver outputs
 *   - subprocess: passes through (no output) when planning dir missing
 *   - subprocess: passes through when STATE.md missing or no objective
 *   - subprocess: passes through when resolver unavailable (df-tools not in expected path)
 *   - DEVFLOW_SKIP_ORG_CONTEXT=1 escape hatch
 *
 * The full resolver-call path is integration-tested by stubbing df-tools.cjs
 * on PATH; for unit purposes we focus on the pure functions and the
 * fail-open subprocess behavior.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'inject-org-context.js');
const { findPlanningDir, readCurrentObjective, renderPreamble } = require('./inject-org-context.js');

function mkProject({ stateContent } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-ctx-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (stateContent !== undefined) {
    fs.writeFileSync(path.join(root, '.planning', 'STATE.md'), stateContent, 'utf-8');
  }
  return root;
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

describe('findPlanningDir', () => {
  test('returns null when no .planning/ found walking up', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'no-plan-'));
    try {
      assert.equal(findPlanningDir(tmp), null);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('finds .planning/ at start dir', () => {
    const root = mkProject();
    try {
      assert.equal(findPlanningDir(root), path.join(root, '.planning'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('finds .planning/ in ancestor', () => {
    const root = mkProject();
    const child = path.join(root, 'src', 'sub', 'deep');
    fs.mkdirSync(child, { recursive: true });
    try {
      assert.equal(findPlanningDir(child), path.join(root, '.planning'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('readCurrentObjective', () => {
  test('returns null when no STATE.md', () => {
    const root = mkProject();
    try {
      assert.equal(readCurrentObjective(path.join(root, '.planning')), null);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('parses **Objective:** N format', () => {
    const root = mkProject({
      stateContent: '# State\n\n**Objective:** 04 — REST API Core\n',
    });
    try {
      assert.equal(readCurrentObjective(path.join(root, '.planning')), '04');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('parses **Objective:** N-name format', () => {
    const root = mkProject({
      stateContent: '**Objective:** 06-flutter-macos-app of 6 — IN PROGRESS\n',
    });
    try {
      assert.equal(readCurrentObjective(path.join(root, '.planning')), '06-flutter-macos-app');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns null when STATE.md has no objective line', () => {
    const root = mkProject({ stateContent: '# Empty state\n' });
    try {
      assert.equal(readCurrentObjective(path.join(root, '.planning')), null);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('renderPreamble', () => {
  test('renders objective + parent + milestone + siblings', () => {
    const ctx = {
      objective: { id: '01-foo', title: 'Foo Bar', kind: 'plugin', work: 'feature' },
      parent_issue: {
        ref: 'AO-Cyber-Systems/devflow#15',
        title: '[Epic] Coordination Layer',
        progress: { done: 2, total: 8 },
      },
      milestone: {
        title: 'DevFlow Internal Alpha',
        product: 'DevFlow',
        quarter: 'Q2 2026',
        status: 'In Progress',
      },
      siblings: [
        {
          repo: 'aodex',
          objective: '12-mcp-go',
          session: { developer: 'justin' },
          match_score: 0.62,
          match_reasons: ['shares parent_epic devflow#15'],
        },
      ],
      warnings: [],
    };
    const out = renderPreamble(ctx);
    assert.match(out, /## DevFlow org context/);
    assert.match(out, /\*\*Objective:\*\* 01-foo — Foo Bar/);
    assert.match(out, /kind=plugin, work=feature/);
    assert.match(out, /\[Epic\] Coordination Layer/);
    assert.match(out, /2\/8 sub-issues done/);
    assert.match(out, /DevFlow Internal Alpha .*Q2 2026/);
    assert.match(out, /aodex\/12-mcp-go by justin/);
    assert.match(out, /score 0\.62/);
  });

  test('omits sibling section when none', () => {
    const ctx = {
      objective: { id: '01-x', title: 'X' },
      parent_issue: { ref: 'a/b#1', title: 'P' },
      milestone: { title: 'M', product: 'P', quarter: 'Q', status: 'S' },
      siblings: [],
    };
    const out = renderPreamble(ctx);
    assert.ok(!out.includes('Sibling activity'));
  });

  test('renders warnings section', () => {
    const ctx = {
      objective: { id: '01-x' },
      siblings: [],
      warnings: ['GH timeout — milestone facet stale'],
    };
    const out = renderPreamble(ctx);
    assert.match(out, /Resolver warnings/);
    assert.match(out, /GH timeout/);
  });
});

// ---------------------------------------------------------------------------
// Subprocess integration — fail-open behavior
// ---------------------------------------------------------------------------

function runHook(cwd, env = {}) {
  return spawnSync('node', [HOOK_PATH], {
    cwd,
    encoding: 'utf-8',
    input: '',
    env: { ...process.env, ...env },
  });
}

describe('hook subprocess — fail-open', () => {
  test('emits nothing when not in a DevFlow project', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'no-plan-'));
    try {
      const r = runHook(tmp);
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('emits nothing when STATE.md absent', () => {
    const root = mkProject();
    try {
      const r = runHook(root);
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('emits nothing when current objective cannot be parsed', () => {
    const root = mkProject({ stateContent: '# state\nno objective here\n' });
    try {
      const r = runHook(root);
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('emits nothing when resolver is not installed (df-tools.cjs missing)', () => {
    // The resolver lives at ~/.claude/devflow/bin/df-tools.cjs in production.
    // We can't easily mock that without permissions surgery, but we can
    // verify the hook falls back to silent when the spawnSync result is
    // non-zero or stdout is empty — by pointing HOME at a fresh tempdir
    // so the resolver path does not exist there.
    const root = mkProject({ stateContent: '**Objective:** 01-foo — Foo\n' });
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-home-'));
    try {
      const r = runHook(root, { HOME: fakeHome });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '', 'should fail-open silently when resolver unavailable');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test('DEVFLOW_SKIP_ORG_CONTEXT=1 bypasses everything', () => {
    const root = mkProject({ stateContent: '**Objective:** 01-foo — Foo\n' });
    try {
      const r = runHook(root, { DEVFLOW_SKIP_ORG_CONTEXT: '1' });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
