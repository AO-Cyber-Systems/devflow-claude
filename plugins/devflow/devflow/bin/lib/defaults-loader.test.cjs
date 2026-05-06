'use strict';

// defaults-loader.test.cjs — Test list (TRD 21-04)
//
// mergeDefaultsTables (pure logic, M group):
//   M1: bundled-only input → returns merged = bundled, provenance all = 'bundled_table'
//   M2: bundled + org with org overriding (api, feature, tdd) → merged.api.feature.tdd from org; provenance 'org_table' for that cell only
//   M3: bundled + project with project overriding (cli, port, depth) → merged.cli.port.depth from project; provenance 'project_table' for that cell only
//   M4: bundled + org + project where project overrides org's override → project wins; provenance 'project_table'
//   M5: project tier omits a cell (api.bugfix.tdd) → falls through to bundled; provenance 'bundled_table'
//   M6: project tier introduces NEW (kind, work) cell not in bundled → merged includes it; provenance 'project_table'
//
// loadMergedDefaultsTable (resolver, L group):
//   L1: only bundled present → result.provenance entirely 'bundled_table'
//   L2: bundled + org-fixture present → org overrides flow through
//   L3: bundled + org + project all present → project wins on shared cells
//   L4: malformed project file → throws with clear error
//   L5: missing org file → silent skip, no error
//   L6: cache hit returns same object reference (identity) on second call
//   L7: _resetCache clears cache; next call re-reads files
//
// scaffoldDefaultsTable + cmdDefaultsTableInit (CLI, C group):
//   C1: scaffoldDefaultsTable scope=org → writes ~/.claude/devflow/defaults-table.md = bundled file content
//   C2: scaffoldDefaultsTable scope=project → writes .planning/defaults-table.md = bundled file content
//   C3: scaffoldDefaultsTable scope=org when target exists → ok=false, refuse
//   C4: scaffoldDefaultsTable scope=org --force when target exists → backup to .bak.<ISO> + overwrite
//   C5: scaffoldDefaultsTable scope=project when no .planning/ → ok=false
//   C6: scaffoldDefaultsTable scope=foo → ok=false, invalid scope
//   C7: cmdDefaultsTableInit --help → prints usage (exit 0)

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const loader = require('./defaults-loader.cjs');
const fx = require('./__fixtures__/defaults-table-fixtures.cjs');

describe('mergeDefaultsTables (pure logic)', () => {
  test('M1: bundled-only input → merged = bundled, provenance all = bundled_table', () => {
    const bundled = {
      api: { feature: { tdd: 'strict', depth: 'comprehensive' } },
      cli: { port: { tdd: 'auto', depth: 'standard' } },
    };
    const result = loader.mergeDefaultsTables([
      { table: bundled, name: 'bundled_table' },
    ]);
    assert.deepStrictEqual(result.table, bundled);
    assert.strictEqual(result.provenance['api.feature.tdd'], 'bundled_table');
    assert.strictEqual(result.provenance['api.feature.depth'], 'bundled_table');
    assert.strictEqual(result.provenance['cli.port.tdd'], 'bundled_table');
    assert.strictEqual(result.provenance['cli.port.depth'], 'bundled_table');
  });

  test('M2: bundled + org with org overriding (api, feature, tdd) → org wins on that cell only', () => {
    const bundled = {
      api: { feature: { tdd: 'strict bundled', depth: 'comprehensive' }, port: { tdd: 'port bundled' } },
    };
    const org = { api: { feature: { tdd: 'org override' } } };

    const result = loader.mergeDefaultsTables([
      { table: bundled, name: 'bundled_table' },
      { table: org, name: 'org_table' },
    ]);

    assert.strictEqual(result.table.api.feature.tdd, 'org override');
    assert.strictEqual(result.table.api.feature.depth, 'comprehensive'); // bundled fallthrough
    assert.strictEqual(result.table.api.port.tdd, 'port bundled');        // bundled fallthrough
    assert.strictEqual(result.provenance['api.feature.tdd'], 'org_table');
    assert.strictEqual(result.provenance['api.feature.depth'], 'bundled_table');
    assert.strictEqual(result.provenance['api.port.tdd'], 'bundled_table');
  });

  test('M3: bundled + project with project overriding (cli, port, depth)', () => {
    const bundled = {
      cli: { port: { tdd: 'auto', depth: 'standard' } },
    };
    const project = { cli: { port: { depth: 'comprehensive' } } };

    const result = loader.mergeDefaultsTables([
      { table: bundled, name: 'bundled_table' },
      { table: project, name: 'project_table' },
    ]);

    assert.strictEqual(result.table.cli.port.tdd, 'auto');
    assert.strictEqual(result.table.cli.port.depth, 'comprehensive');
    assert.strictEqual(result.provenance['cli.port.tdd'], 'bundled_table');
    assert.strictEqual(result.provenance['cli.port.depth'], 'project_table');
  });

  test('M4: bundled + org + project — project overrides org override → project wins', () => {
    const bundled = { api: { feature: { tdd: 'bundled' } } };
    const org = { api: { feature: { tdd: 'org' } } };
    const project = { api: { feature: { tdd: 'project' } } };

    const result = loader.mergeDefaultsTables([
      { table: bundled, name: 'bundled_table' },
      { table: org, name: 'org_table' },
      { table: project, name: 'project_table' },
    ]);

    assert.strictEqual(result.table.api.feature.tdd, 'project');
    assert.strictEqual(result.provenance['api.feature.tdd'], 'project_table');
  });

  test('M5: project tier omits a cell → falls through to bundled', () => {
    const bundled = {
      api: { feature: { tdd: 'bundled' }, bugfix: { tdd: 'bundled bugfix' } },
    };
    const project = { api: { feature: { tdd: 'project feature' } } }; // bugfix omitted

    const result = loader.mergeDefaultsTables([
      { table: bundled, name: 'bundled_table' },
      { table: project, name: 'project_table' },
    ]);

    assert.strictEqual(result.table.api.feature.tdd, 'project feature');
    assert.strictEqual(result.table.api.bugfix.tdd, 'bundled bugfix');
    assert.strictEqual(result.provenance['api.feature.tdd'], 'project_table');
    assert.strictEqual(result.provenance['api.bugfix.tdd'], 'bundled_table');
  });

  test('M6: project tier introduces NEW (kind, work) cell not in bundled', () => {
    const bundled = { api: { feature: { tdd: 'bundled' } } };
    const project = { plugin: { spike: { tdd: 'project new', depth: 'shallow' } } };

    const result = loader.mergeDefaultsTables([
      { table: bundled, name: 'bundled_table' },
      { table: project, name: 'project_table' },
    ]);

    assert.strictEqual(result.table.plugin.spike.tdd, 'project new');
    assert.strictEqual(result.table.plugin.spike.depth, 'shallow');
    assert.strictEqual(result.provenance['plugin.spike.tdd'], 'project_table');
    assert.strictEqual(result.provenance['plugin.spike.depth'], 'project_table');
    // Original bundled cells preserved
    assert.strictEqual(result.table.api.feature.tdd, 'bundled');
  });
});

describe('loadMergedDefaultsTable (resolver)', () => {
  beforeEach(() => { loader._resetCache(); });

  test('L1: only bundled present → result.provenance entirely bundled_table', () => {
    const project = fx.buildTempProjectWithDefaults({});
    try {
      const r = loader.loadMergedDefaultsTable({ projectRoot: project.root, userHome: project.userHome });
      // every entry in provenance map should be 'bundled_table'
      const sources = new Set(Object.values(r.provenance));
      assert.deepStrictEqual([...sources], ['bundled_table']);
      // sanity: bundled has the (api, feature) cell
      assert.ok(r.table.api && r.table.api.feature, 'bundled file must have (api, feature)');
    } finally { project.cleanup(); }
  });

  test('L2: bundled + org-fixture present → org overrides flow through', () => {
    const project = fx.buildTempProjectWithDefaults({
      orgTable: fx.buildPartialDefaultsTable({ cells: { 'api.feature': { tdd: 'org-tdd-override' } } }),
    });
    try {
      const r = loader.loadMergedDefaultsTable({ projectRoot: project.root, userHome: project.userHome });
      assert.strictEqual(r.table.api.feature.tdd, 'org-tdd-override');
      assert.strictEqual(r.provenance['api.feature.tdd'], 'org_table');
      // other fields fall through to bundled
      assert.strictEqual(r.provenance['api.feature.depth'], 'bundled_table');
    } finally { project.cleanup(); }
  });

  test('L3: bundled + org + project all present → project wins on shared cells', () => {
    const project = fx.buildTempProjectWithDefaults({
      orgTable: fx.buildPartialDefaultsTable({ cells: { 'api.feature': { tdd: 'org' } } }),
      projectTable: fx.buildPartialDefaultsTable({ cells: { 'api.feature': { tdd: 'project' } } }),
    });
    try {
      const r = loader.loadMergedDefaultsTable({ projectRoot: project.root, userHome: project.userHome });
      assert.strictEqual(r.table.api.feature.tdd, 'project');
      assert.strictEqual(r.provenance['api.feature.tdd'], 'project_table');
    } finally { project.cleanup(); }
  });

  test('L4: malformed project file → throws with clear error', () => {
    const project = fx.buildTempProjectWithDefaults({
      projectTable: '# malformed — no yaml block\n\njust prose, no fenced yaml\n',
    });
    try {
      assert.throws(
        () => loader.loadMergedDefaultsTable({ projectRoot: project.root, userHome: project.userHome }),
        /malformed: missing yaml block/,
      );
    } finally { project.cleanup(); }
  });

  test('L5: missing org file → silent skip, no error', () => {
    // userHome dir exists but no defaults-table.md inside it
    const project = fx.buildTempProjectWithDefaults({});
    try {
      // Should not throw
      const r = loader.loadMergedDefaultsTable({ projectRoot: project.root, userHome: project.userHome });
      assert.ok(r.table, 'result should have table');
      // No org cells in provenance
      const sources = new Set(Object.values(r.provenance));
      assert.ok(!sources.has('org_table'), 'no org_table provenance expected');
    } finally { project.cleanup(); }
  });

  test('L6: cache hit returns same object reference (identity) on second call', () => {
    const project = fx.buildTempProjectWithDefaults({});
    try {
      const r1 = loader.loadMergedDefaultsTable({ projectRoot: project.root, userHome: project.userHome });
      const r2 = loader.loadMergedDefaultsTable({ projectRoot: project.root, userHome: project.userHome });
      assert.strictEqual(r1, r2, 'cache should return identical reference');
    } finally { project.cleanup(); }
  });

  test('L7: _resetCache clears cache; next call re-reads files', () => {
    const project = fx.buildTempProjectWithDefaults({});
    try {
      const r1 = loader.loadMergedDefaultsTable({ projectRoot: project.root, userHome: project.userHome });
      loader._resetCache();
      const r2 = loader.loadMergedDefaultsTable({ projectRoot: project.root, userHome: project.userHome });
      assert.notStrictEqual(r1, r2, 'cache reset should produce a fresh object');
      // But the contents should still match
      assert.deepStrictEqual(r1.provenance, r2.provenance);
    } finally { project.cleanup(); }
  });
});

describe('scaffoldDefaultsTable + cmdDefaultsTableInit (CLI)', () => {
  test('C1: scaffold scope=org → writes <home>/.claude/devflow/defaults-table.md = bundled content', () => {
    const project = fx.buildTempProjectWithDefaults({});
    try {
      const r = loader.scaffoldDefaultsTable({ scope: 'org', cwd: project.root, userHome: project.userHome });
      assert.strictEqual(r.ok, true);
      const target = path.join(project.userHome, '.claude', 'devflow', 'defaults-table.md');
      assert.strictEqual(r.target_path, target);
      assert.ok(fs.existsSync(target));
      // Content should match bundled
      const written = fs.readFileSync(target, 'utf-8');
      const bundled = fs.readFileSync(loader.BUNDLED_PATH, 'utf-8');
      assert.strictEqual(written, bundled);
      assert.strictEqual(r.action, 'created');
    } finally { project.cleanup(); }
  });

  test('C2: scaffold scope=project → writes <root>/.planning/defaults-table.md = bundled content', () => {
    const project = fx.buildTempProjectWithDefaults({});
    try {
      const r = loader.scaffoldDefaultsTable({ scope: 'project', cwd: project.root, userHome: project.userHome });
      assert.strictEqual(r.ok, true);
      const target = path.join(project.root, '.planning', 'defaults-table.md');
      assert.strictEqual(r.target_path, target);
      assert.ok(fs.existsSync(target));
      const written = fs.readFileSync(target, 'utf-8');
      const bundled = fs.readFileSync(loader.BUNDLED_PATH, 'utf-8');
      assert.strictEqual(written, bundled);
    } finally { project.cleanup(); }
  });

  test('C3: scaffold scope=org when target exists → ok=false, refuse without --force', () => {
    const project = fx.buildTempProjectWithDefaults({
      orgTable: '# pre-existing org table\n',
    });
    try {
      const r = loader.scaffoldDefaultsTable({ scope: 'org', cwd: project.root, userHome: project.userHome });
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /already exists.*--force/);
    } finally { project.cleanup(); }
  });

  test('C4: scaffold scope=org --force when target exists → backup + overwrite', () => {
    const project = fx.buildTempProjectWithDefaults({
      orgTable: fx.buildPartialDefaultsTable({ cells: { 'api.feature': { tdd: 'pre-existing-marker' } } }),
    });
    try {
      const r = loader.scaffoldDefaultsTable({ scope: 'org', force: true, cwd: project.root, userHome: project.userHome });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.action, 'overwritten');
      assert.ok(r.backup, 'backup path should be returned');
      assert.ok(fs.existsSync(r.backup), 'backup file should exist');
      // Backup contains pre-existing marker
      assert.match(fs.readFileSync(r.backup, 'utf-8'), /pre-existing-marker/);
      // Target now contains bundled content (which has constraints block)
      const targetContent = fs.readFileSync(r.target_path, 'utf-8');
      assert.match(targetContent, /constraints:/);
    } finally { project.cleanup(); }
  });

  test('C5: scaffold scope=project when no .planning/ → ok=false', () => {
    // Create a tmp dir WITHOUT .planning
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'df-noplanning-'));
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-userhome-'));
    try {
      const r = loader.scaffoldDefaultsTable({ scope: 'project', cwd: tmpRoot, userHome: tmpHome });
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /No \.planning\/ directory/);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test('C6: scaffold scope=foo → ok=false, invalid scope', () => {
    const project = fx.buildTempProjectWithDefaults({});
    try {
      const r = loader.scaffoldDefaultsTable({ scope: 'foo', cwd: project.root, userHome: project.userHome });
      assert.strictEqual(r.ok, false);
      assert.match(r.error, /Invalid scope/);
    } finally { project.cleanup(); }
  });

  test('C7: cmdDefaultsTableInit --help → prints usage, no throw', () => {
    // Capture stdout via process.stdout.write spy
    const originalWrite = process.stdout.write.bind(process.stdout);
    let captured = '';
    process.stdout.write = (chunk) => { captured += chunk; return true; };
    try {
      loader.cmdDefaultsTableInit(process.cwd(), ['--help'], false);
    } finally {
      process.stdout.write = originalWrite;
    }
    assert.match(captured, /Usage:/);
    assert.match(captured, /--scope/);
  });
});
