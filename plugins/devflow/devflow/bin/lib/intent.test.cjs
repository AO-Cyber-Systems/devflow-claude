'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const intent = require('./intent.cjs');
const fixtures = require('./__fixtures__/intent-fixtures.cjs');

describe('intent.resolve', () => {
  let project;

  afterEach(() => {
    if (project) project.cleanup();
    project = null;
    intent._resetCache();
  });

  describe('happy path', () => {
    test('reads PROJECT.md kind and OBJECTIVE.md work, returns (api, port) defaults', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'port' }],
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.kind, 'api');
      assert.strictEqual(result.work, 'port');
      assert.strictEqual(result.workSource, 'OBJECTIVE.md');
      assert.strictEqual(result.workInherited, false);
      assert.match(result.config.tdd, /build first.*verify API contract parity/);
      assert.strictEqual(result.config.depth, 'comprehensive');
      assert.strictEqual(result.config.model_profile, 'quality');
    });

    test('OBJECTIVE.md missing work → falls back to PROJECT.md default_work', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api', default_work: 'port' },
        objectives: [{ id: '01-foo' }],
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.work, 'port');
      assert.strictEqual(result.workSource, 'PROJECT.md default_work');
      assert.strictEqual(result.workInherited, true);
    });

    test('PROJECT.md missing default_work → falls back to feature', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'app' },
        objectives: [{ id: '01-foo' }],
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.work, 'feature');
      assert.strictEqual(result.workSource, 'fallback');
      assert.strictEqual(result.workInherited, true);
    });
  });

  describe('precedence', () => {
    test('TRD frontmatter type:tdd overrides defaults table tdd:skip for (api, prototype)', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'prototype' }],
      });

      const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
      fs.writeFileSync(trdPath, fixtures.trdMd({ type: 'tdd' }), 'utf-8');

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        trdPath,
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.config.tdd, 'strict');
      assert.match(result.sources.tdd, /TRD frontmatter/);
    });

    test('OBJECTIVE.md overrides.tdd:skip overrides defaults table strict for (api, feature)', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{
          id: '01-foo',
          work: 'feature',
          overrides: { tdd: 'skip' },
        }],
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.config.tdd, 'skip');
      assert.match(result.sources.tdd, /OBJECTIVE.md/);
    });

    test('CLAUDE.md absorption overrides defaults table for (api, prototype)', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'prototype' }],
        claudeMdUser: fixtures.claudeMd({
          tddSection: {
            heading: 'TDD Playbook',
            body: 'Force TDD TRDs at planning time. All features default to TDD strict.',
          },
        }),
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: project.userHome,
      });

      assert.strictEqual(result.config.tdd, 'strict');
      assert.match(result.sources.tdd, /CLAUDE.md/);
    });

    test('OBJECTIVE.md override wins over CLAUDE.md absorption', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{
          id: '01-foo',
          work: 'prototype',
          overrides: { tdd: 'skip' },
        }],
        claudeMdUser: fixtures.claudeMd({
          tddSection: {
            heading: 'TDD Playbook',
            body: 'Force TDD TRDs at planning time. All features default to TDD strict.',
          },
        }),
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: project.userHome,
      });

      assert.strictEqual(result.config.tdd, 'skip');
      assert.match(result.sources.tdd, /OBJECTIVE.md/);
    });
  });

  describe('failure modes', () => {
    test('Unknown kind throws with helpful error listing valid values', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'invalid-kind' },
        objectives: [{ id: '01-foo', work: 'feature' }],
      });

      assert.throws(
        () => intent.resolve({
          projectRoot: project.root,
          objectiveId: '01-foo',
          userHome: '/nonexistent',
        }),
        /Invalid kind.*api.*app.*library.*ui-lib.*cli.*plugin/s
      );
    });

    test('Unknown work throws with helpful error', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'invalid-work' }],
      });

      assert.throws(
        () => intent.resolve({
          projectRoot: project.root,
          objectiveId: '01-foo',
          userHome: '/nonexistent',
        }),
        /Invalid work.*feature.*port.*refactor/s
      );
    });

    test('Missing PROJECT.md throws (no silent fallback)', () => {
      project = fixtures.buildProject({
        projectFrontmatter: false,
      });

      assert.throws(
        () => intent.resolve({
          projectRoot: project.root,
          userHome: '/nonexistent',
        }),
        /No PROJECT.md found/
      );
    });
  });

  describe('edge cases', () => {
    test('PROJECT.md present but missing kind → returns warning, defaults to api', () => {
      project = fixtures.buildProject({
        projectFrontmatter: {},
        objectives: [{ id: '01-foo', work: 'feature' }],
      });

      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.strictEqual(result.kind, 'api');
      assert.ok(result.warnings.length > 0);
      assert.match(result.warnings[0], /missing 'kind'/);
    });

    test('Resolution output is deterministic across calls', () => {
      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'feature' }],
      });

      const r1 = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });
      const r2 = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
      });

      assert.deepStrictEqual(r1, r2);
    });

    test('Malformed defaults-table.md throws with helpful error', () => {
      const badTable = fs.mkdtempSync(path.join(require('os').tmpdir(), 'df-bad-'));
      const badPath = path.join(badTable, 'bad-table.md');
      fs.writeFileSync(badPath, '# No yaml block here\n', 'utf-8');

      project = fixtures.buildProject({
        projectFrontmatter: { kind: 'api' },
        objectives: [{ id: '01-foo', work: 'feature' }],
      });

      assert.throws(
        () => intent.resolve({
          projectRoot: project.root,
          objectiveId: '01-foo',
          userHome: '/nonexistent',
          tablePath: badPath,
        }),
        /missing yaml block/
      );

      fs.rmSync(badTable, { recursive: true, force: true });
    });
  });
});

// =============================================================================
// TRD 0.2 — New resolver schema tests
// =============================================================================

// ---------------------------------------------------------------------------
// Group A — table parsing extension
// ---------------------------------------------------------------------------

describe('new fields — table parse', () => {
  afterEach(() => {
    intent._resetCache();
  });

  test('A1: loadDefaultsTable() returns a cell with all 9 fields populated for (api, feature)', () => {
    const table = intent.loadDefaultsTable();
    const cell = table['api']['feature'];
    for (const field of ['tdd', 'depth', 'model_profile', 'verification',
      'security_isolation', 'back_compat', 'tdd_default', 'test_list_first', 'fixture_strategy']) {
      assert.ok(cell[field] !== undefined, `(api, feature) missing field '${field}'`);
    }
    assert.strictEqual(cell.security_isolation, 'multi_tenant_required');
    assert.strictEqual(cell.tdd_default, 'strict');
    assert.strictEqual(cell.test_list_first, 'required');
    assert.strictEqual(cell.fixture_strategy, 'inline');
  });

  test('A2: loadConstraints() returns an array of 3 entries: no_llm_test_data, no_property_based_default, no_gherkin_layer', () => {
    const constraints = intent.loadConstraints();
    assert.ok(Array.isArray(constraints), 'constraints must be an array');
    assert.strictEqual(constraints.length, 3);
    const ids = constraints.map((c) => c.id);
    assert.ok(ids.includes('no_llm_test_data'), 'missing no_llm_test_data');
    assert.ok(ids.includes('no_property_based_default'), 'missing no_property_based_default');
    assert.ok(ids.includes('no_gherkin_layer'), 'missing no_gherkin_layer');
    // Each entry must have id, description, opt_out_field
    for (const c of constraints) {
      assert.ok(c.id, `constraint missing id: ${JSON.stringify(c)}`);
      assert.ok(c.description, `constraint missing description: ${c.id}`);
      assert.ok(c.opt_out_field, `constraint missing opt_out_field: ${c.id}`);
    }
  });

  test('A3: loadConstraints() returns [] when table has no constraints block (legacy format)', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'df-legacy-'));
    const legacyPath = path.join(tmpDir, 'legacy-table.md');
    // A minimal table with defaults but NO constraints block
    fs.writeFileSync(legacyPath, [
      '# Legacy Table',
      '',
      '```yaml',
      'defaults:',
      '  api:',
      '    feature:',
      '      tdd: "strict"',
      '      depth: comprehensive',
      '      model_profile: quality',
      '      verification: "full integration"',
      '      security_isolation: multi_tenant_required',
      '      back_compat: none',
      '      tdd_default: strict',
      '      test_list_first: required',
      '      fixture_strategy: inline',
      '```',
    ].join('\n'), 'utf-8');

    let result;
    assert.doesNotThrow(() => {
      result = intent.loadConstraints(legacyPath);
    });
    assert.ok(Array.isArray(result), 'should return array');
    assert.strictEqual(result.length, 0, 'should return empty array for legacy table');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('A4: loadDefaultsTable() parses cell with missing new field — field is undefined on cell, no throw', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'df-partial-'));
    const partialPath = path.join(tmpDir, 'partial-table.md');
    // A cell missing fixture_strategy
    fs.writeFileSync(partialPath, [
      '# Partial Table',
      '',
      '```yaml',
      'defaults:',
      '  api:',
      '    feature:',
      '      tdd: "strict"',
      '      depth: comprehensive',
      '      model_profile: quality',
      '      verification: "full"',
      '      security_isolation: multi_tenant_required',
      '      back_compat: none',
      '      tdd_default: strict',
      '      test_list_first: required',
      '```',
    ].join('\n'), 'utf-8');

    let table;
    assert.doesNotThrow(() => {
      table = intent.loadDefaultsTable(partialPath);
    });
    assert.strictEqual(table['api']['feature']['fixture_strategy'], undefined);
    assert.strictEqual(table['api']['feature']['tdd'], 'strict');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Group B — resolve() emits new fields with provenance
// ---------------------------------------------------------------------------

describe('new fields — resolve provenance', () => {
  let project;

  afterEach(() => {
    if (project) project.cleanup();
    project = null;
    intent._resetCache();
  });

  test('B1: (api, feature) with no CLAUDE.md returns all 5 new fields with correct values and provenance', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    assert.strictEqual(result.config.security_isolation, 'multi_tenant_required');
    assert.strictEqual(result.config.back_compat, 'none');
    assert.strictEqual(result.config.tdd_default, 'strict');
    assert.strictEqual(result.config.test_list_first, 'required');
    assert.strictEqual(result.config.fixture_strategy, 'inline');
    assert.strictEqual(result.config.outside_in, true);
    assert.match(result.sources.security_isolation, /defaults table \(api, feature\)/);
    assert.match(result.sources.back_compat, /defaults table \(api, feature\)/);
    assert.match(result.sources.tdd_default, /defaults table \(api, feature\)/);
    assert.match(result.sources.test_list_first, /defaults table \(api, feature\)/);
    assert.match(result.sources.fixture_strategy, /defaults table \(api, feature\)/);
  });

  test('B2: (plugin, feature) returns fixture_strategy: generators with correct provenance', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'plugin' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    assert.strictEqual(result.config.fixture_strategy, 'generators');
    assert.match(result.sources.fixture_strategy, /defaults table \(plugin, feature\)/);
  });

  test('B3: (api, prototype) returns security_isolation: n/a and tdd_default: skip', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'prototype' }],
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    assert.strictEqual(result.config.security_isolation, 'n/a');
    assert.strictEqual(result.config.tdd_default, 'skip');
    assert.match(result.sources.security_isolation, /defaults table \(api, prototype\)/);
  });
});

// ---------------------------------------------------------------------------
// Group C — CLAUDE.md TDD Playbook promotion
// ---------------------------------------------------------------------------

describe('new fields — CLAUDE.md absorption', () => {
  let project;

  afterEach(() => {
    if (project) project.cleanup();
    project = null;
    intent._resetCache();
  });

  test('C1: CLAUDE.md playbook habits 1+6 promote (api, prototype) tdd_default:skip→auto and security_isolation:n/a→multi_tenant_required', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'prototype' }],
      claudeMdUser: fixtures.claudeMd({
        tddSection: {
          heading: 'TDD Playbook',
          body: [
            'Force TDD TRDs at planning time. All features default to TDD strict.',
            'Multitenancy guard in every test. Test the wrong-tenant path always.',
          ].join('\n'),
        },
      }),
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: project.userHome,
    });

    assert.strictEqual(result.config.tdd_default, 'auto');
    assert.strictEqual(result.config.security_isolation, 'multi_tenant_required');
    assert.match(result.sources.tdd_default, /CLAUDE\.md user playbook/);
    assert.match(result.sources.security_isolation, /CLAUDE\.md user playbook/);
  });

  test('C2: CLAUDE.md playbook present but (api, feature) already has tdd_default:strict — stays at strict', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
      claudeMdUser: fixtures.claudeMd({
        tddSection: {
          heading: 'TDD Playbook',
          body: 'Force TDD TRDs at planning time. All features default to TDD strict.',
        },
      }),
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: project.userHome,
    });

    // strict is the ceiling — no change
    assert.strictEqual(result.config.tdd_default, 'strict');
    // provenance stays 'defaults table' because value was unchanged
    assert.match(result.sources.tdd_default, /defaults table/);
  });

  test('C3: CLAUDE.md absorbs "test list first" mention — test_list_first:optional promotes to required', () => {
    // (app, prototype) has test_list_first: optional → should promote to required
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'app' },
      objectives: [{ id: '01-foo', work: 'prototype' }],
      claudeMdUser: fixtures.claudeMd({
        tddSection: {
          heading: 'TDD Playbook',
          body: 'Test list first. Behavior cases checklist required before any test code.',
        },
      }),
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: project.userHome,
    });

    assert.strictEqual(result.config.test_list_first, 'required');
    assert.match(result.sources.test_list_first, /CLAUDE\.md user playbook/);
  });

  test('C4: CLAUDE.md absorbs "fixture builders" mention — fixture_strategy:inline promotes to generators', () => {
    // (api, bugfix) has fixture_strategy: inline → should promote to generators
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'bugfix' }],
      claudeMdUser: fixtures.claudeMd({
        tddSection: {
          heading: 'TDD Playbook',
          body: 'Fixture builders, not LLM-generated test data. Use factory functions.',
        },
      }),
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: project.userHome,
    });

    assert.strictEqual(result.config.fixture_strategy, 'generators');
    assert.match(result.sources.fixture_strategy, /CLAUDE\.md user playbook/);
  });
});

// ---------------------------------------------------------------------------
// Group D — anti-pattern constraints
// ---------------------------------------------------------------------------

describe('new fields — constraints', () => {
  let project;

  afterEach(() => {
    if (project) project.cleanup();
    project = null;
    intent._resetCache();
  });

  test('D1: result.constraints is an array of 3 entries when no TRD opt-out is set', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    assert.ok(Array.isArray(result.constraints), 'constraints must be array');
    assert.strictEqual(result.constraints.length, 3);
    const ids = result.constraints.map((c) => c.id);
    assert.ok(ids.includes('no_llm_test_data'));
    assert.ok(ids.includes('no_property_based_default'));
    assert.ok(ids.includes('no_gherkin_layer'));
  });

  test('D2: TRD allow_generated_test_data:true drops no_llm_test_data from constraints', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({ allow_generated_test_data: true }), 'utf-8');

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      trdPath,
      userHome: '/nonexistent',
    });

    assert.strictEqual(result.constraints.length, 2);
    assert.ok(!result.constraints.some((c) => c.id === 'no_llm_test_data'),
      'no_llm_test_data should be absent');
  });

  test('D3: TRD use_property_based:true drops no_property_based_default from constraints', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({ use_property_based: true }), 'utf-8');

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      trdPath,
      userHome: '/nonexistent',
    });

    assert.strictEqual(result.constraints.length, 2);
    assert.ok(!result.constraints.some((c) => c.id === 'no_property_based_default'),
      'no_property_based_default should be absent');
  });

  test('D4: TRD use_gherkin:true drops no_gherkin_layer from constraints', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({ use_gherkin: true }), 'utf-8');

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      trdPath,
      userHome: '/nonexistent',
    });

    assert.strictEqual(result.constraints.length, 2);
    assert.ok(!result.constraints.some((c) => c.id === 'no_gherkin_layer'),
      'no_gherkin_layer should be absent');
  });

  test('D5: TRD with all three opt-outs set produces result.constraints == []', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({
      allow_generated_test_data: true,
      use_property_based: true,
      use_gherkin: true,
    }), 'utf-8');

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      trdPath,
      userHome: '/nonexistent',
    });

    assert.deepStrictEqual(result.constraints, []);
  });
});

// ---------------------------------------------------------------------------
// Group E — multi-tenancy hard-enforcement
// ---------------------------------------------------------------------------

describe('new fields — multi_tenant_required injection', () => {
  let project;

  afterEach(() => {
    if (project) project.cleanup();
    project = null;
    intent._resetCache();
  });

  test('E1: security_isolation:multi_tenant_required injects wrong-tenant entry into verification_commands', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    assert.ok(Array.isArray(result.config.verification_commands),
      'verification_commands must be array');
    const entry = result.config.verification_commands.find((c) => c.id === 'wrong_tenant_assertion');
    assert.ok(entry, 'wrong_tenant_assertion entry must be present');
    assert.match(entry.pattern, /wrong-tenant|cross-tenant|tenant-isolation/);
    assert.strictEqual(entry.enforcement, 'required');
  });

  test('E2: security_isolation:single_tenant or n/a does NOT carry wrong-tenant entry', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'prototype' }],  // n/a
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    const cmds = result.config.verification_commands || [];
    const entry = cmds.find((c) => c.id === 'wrong_tenant_assertion');
    assert.ok(!entry, 'wrong_tenant_assertion must NOT be present for n/a security_isolation');
  });

  test('E3: skip_multi_tenant_check:true TRD drops wrong-tenant entry and adds warning', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({ skip_multi_tenant_check: true }), 'utf-8');

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      trdPath,
      userHome: '/nonexistent',
    });

    const cmds = result.config.verification_commands || [];
    const entry = cmds.find((c) => c.id === 'wrong_tenant_assertion');
    assert.ok(!entry, 'wrong_tenant_assertion must be absent when skip_multi_tenant_check=true');
    const hasWarning = result.warnings.some((w) => /multi-tenan(t|cy).*skip/i.test(w));
    assert.ok(hasWarning, 'result.warnings must include multi-tenancy skipped message');
  });

  test('E4: every (api, *) non-skip/non-spike cell receives verification_commands wrong-tenant entry', () => {
    const WORKS_WITH_MULTI_TENANT = ['feature', 'port', 'refactor', 'bugfix'];  // multi_tenant_required cells

    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: WORKS_WITH_MULTI_TENANT.map((w, i) => ({
        id: `${String(i + 1).padStart(2, '0')}-api-${w}`,
        work: w,
      })),
    });

    for (let i = 0; i < WORKS_WITH_MULTI_TENANT.length; i++) {
      const work = WORKS_WITH_MULTI_TENANT[i];
      const id = `${String(i + 1).padStart(2, '0')}-api-${work}`;
      intent._resetCache();
      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: id,
        userHome: '/nonexistent',
      });
      const entry = (result.config.verification_commands || []).find((c) => c.id === 'wrong_tenant_assertion');
      assert.ok(entry, `(api, ${work}) must have wrong_tenant_assertion`);
    }
  });
});

// ---------------------------------------------------------------------------
// Group F — backward-compat and field-presence sanity
// ---------------------------------------------------------------------------

describe('new fields — back-compat', () => {
  let project;

  afterEach(() => {
    if (project) project.cleanup();
    project = null;
    intent._resetCache();
  });

  test('F1: existing 4 original fields (tdd, depth, model_profile, verification) still behave correctly', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'port' }],
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    assert.match(result.config.tdd, /build first.*verify API contract parity/);
    assert.strictEqual(result.config.depth, 'comprehensive');
    assert.strictEqual(result.config.model_profile, 'quality');
    assert.ok(result.config.verification);
    assert.match(result.sources.tdd, /defaults table/);
    assert.match(result.sources.depth, /defaults table/);
  });

  test('F2: result.directives array shape is unchanged', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    assert.ok(Array.isArray(result.directives), 'directives must be array');
  });

  test('F3: result.warnings does not throw when cell has new field undefined', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'df-partial2-'));
    const partialPath = path.join(tmpDir, 'partial-table.md');
    fs.writeFileSync(partialPath, [
      '# Partial Table',
      '',
      '```yaml',
      'defaults:',
      '  api:',
      '    feature:',
      '      tdd: "strict"',
      '      depth: comprehensive',
      '      model_profile: quality',
      '      verification: "full"',
      '      security_isolation: multi_tenant_required',
      '      back_compat: none',
      '      tdd_default: strict',
      '      test_list_first: required',
      '```',
    ].join('\n'), 'utf-8');

    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    let result;
    assert.doesNotThrow(() => {
      result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
        tablePath: partialPath,
      });
    });
    assert.ok(Array.isArray(result.warnings));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('F4: df-tools intent resolve CLI output has all 5 new fields under config and top-level constraints array', () => {
    // This test uses the CLI via require() + resolve() directly to check shape
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    // All 5 new fields under config
    for (const f of ['security_isolation', 'back_compat', 'tdd_default', 'test_list_first', 'fixture_strategy']) {
      assert.ok(result.config[f] !== undefined, `config missing field: ${f}`);
    }
    // Top-level constraints array
    assert.ok(Array.isArray(result.constraints), 'top-level constraints must be array');
  });
});

// =============================================================================
// TRD 21-05 — cell_provenance (per-cell defaults-table tier origin)
// =============================================================================
//
// describe('cell_provenance', P group):
//   P1: bundled-only environment → all 10 fields per cell report 'bundled_table'
//   P2: org override on (api, feature, tdd) → cell_provenance.tdd = 'org_table'; other 9 fields = 'bundled_table'
//   P3: project override on (api, feature, depth) → cell_provenance.depth = 'project_table'; other 9 fields = 'bundled_table'
//   P4: project + org overrides on different fields → each field reports its supplying tier
//   P5: TRD frontmatter type:tdd overrides effective value → provenance.tdd = 'trd_override' BUT cell_provenance.tdd still reports the table tier
//   P6: OBJECTIVE.md overrides.tdd → provenance.tdd = 'objective_override' BUT cell_provenance.tdd still reports table tier
//   P7: explicit tablePath (test-only path) → cell_provenance for all fields = 'table_explicit'
//   P8: cell_provenance always has all ALL_FIELDS keys (10 entries)

describe('cell_provenance (TRD 21-05)', () => {
  const fxDefaults = require('./__fixtures__/defaults-table-fixtures.cjs');
  let project;
  afterEach(() => {
    if (project) { try { project.cleanup(); } catch (_) {} }
    project = null;
    intent._resetCache();
  });

  test('P1: bundled-only environment → all 10 fields per cell report bundled_table', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });
    assert.ok(result.cell_provenance, 'cell_provenance must be present');
    // No org/project files exist → all entries should be bundled_table
    for (const f of ['tdd', 'depth', 'model_profile', 'verification', 'security_isolation', 'back_compat', 'tdd_default', 'test_list_first', 'fixture_strategy', 'outside_in']) {
      assert.strictEqual(result.cell_provenance[f], 'bundled_table', `cell_provenance.${f} should be bundled_table`);
    }
  });

  test('P2: org override on (api, feature, tdd) → cell_provenance.tdd = org_table', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    // Write an org-tier defaults table override
    const userHome = path.join(project.root, '.user-home-stub');
    fs.mkdirSync(path.join(userHome, '.claude', 'devflow'), { recursive: true });
    fs.writeFileSync(
      path.join(userHome, '.claude', 'devflow', 'defaults-table.md'),
      fxDefaults.buildPartialDefaultsTable({ cells: { 'api.feature': { tdd: 'org-override-tdd' } } }),
      'utf-8'
    );

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome,
    });

    assert.strictEqual(result.cell_provenance.tdd, 'org_table');
    // Other fields should still be bundled_table
    for (const f of ['depth', 'model_profile', 'verification']) {
      assert.strictEqual(result.cell_provenance[f], 'bundled_table', `${f} should be bundled_table`);
    }
  });

  test('P3: project override on (api, feature, depth) → cell_provenance.depth = project_table', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    fs.writeFileSync(
      path.join(project.root, '.planning', 'defaults-table.md'),
      fxDefaults.buildPartialDefaultsTable({ cells: { 'api.feature': { depth: 'project-depth-override' } } }),
      'utf-8'
    );

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    assert.strictEqual(result.cell_provenance.depth, 'project_table');
    assert.strictEqual(result.cell_provenance.tdd, 'bundled_table');
  });

  test('P4: project + org overrides on different fields → each reports its tier', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const userHome = path.join(project.root, '.user-home-stub');
    fs.mkdirSync(path.join(userHome, '.claude', 'devflow'), { recursive: true });
    fs.writeFileSync(
      path.join(userHome, '.claude', 'devflow', 'defaults-table.md'),
      fxDefaults.buildPartialDefaultsTable({ cells: { 'api.feature': { tdd: 'org-tdd' } } }),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(project.root, '.planning', 'defaults-table.md'),
      fxDefaults.buildPartialDefaultsTable({ cells: { 'api.feature': { depth: 'project-depth' } } }),
      'utf-8'
    );

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome,
    });

    assert.strictEqual(result.cell_provenance.tdd, 'org_table');
    assert.strictEqual(result.cell_provenance.depth, 'project_table');
    assert.strictEqual(result.cell_provenance.model_profile, 'bundled_table');
  });

  test('P5: TRD type:tdd overrides effective tdd value but cell_provenance.tdd still reports table tier', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    // Project-tier override of tdd
    fs.writeFileSync(
      path.join(project.root, '.planning', 'defaults-table.md'),
      fxDefaults.buildPartialDefaultsTable({ cells: { 'api.feature': { tdd: 'project-tdd' } } }),
      'utf-8'
    );

    // TRD frontmatter that triggers type:tdd override path
    const trdPath = path.join(project.root, '.planning', 'objectives', '01-foo', '01-01-TRD.md');
    fs.writeFileSync(trdPath, fixtures.trdMd({ type: 'tdd' }), 'utf-8');

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      trdPath,
      userHome: '/nonexistent',
    });

    // Effective provenance shows TRD override
    assert.strictEqual(result.provenance.tdd, 'trd_override');
    // But cell_provenance still reports the table tier that WOULD have supplied the value
    assert.strictEqual(result.cell_provenance.tdd, 'project_table');
  });

  test('P6: OBJECTIVE.md overrides.tdd → provenance trd_override-style but cell_provenance still reports tier', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature', overrides: { tdd: 'obj-override-tdd' } }],
    });

    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });

    assert.strictEqual(result.provenance.tdd, 'objective_override');
    // cell_provenance should still report the table tier (bundled, since no overrides)
    assert.strictEqual(result.cell_provenance.tdd, 'bundled_table');
  });

  test('P7: explicit tablePath (test path) → cell_provenance for all fields = table_explicit', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    // Write a fixture single-file table outside the bundled path
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'df-tabexpl-'));
    const tablePath = path.join(tmpDir, 'fixture-table.md');
    fs.writeFileSync(tablePath, fxDefaults.buildPartialDefaultsTable({
      cells: { 'api.feature': { tdd: 'fx', depth: 'fx', model_profile: 'fx', verification: 'fx', security_isolation: 'fx', back_compat: 'fx', tdd_default: 'fx', test_list_first: 'fx', fixture_strategy: 'fx', outside_in: 'true' } },
    }), 'utf-8');

    try {
      const result = intent.resolve({
        projectRoot: project.root,
        objectiveId: '01-foo',
        userHome: '/nonexistent',
        tablePath,
      });
      for (const f of ['tdd', 'depth', 'model_profile', 'verification', 'security_isolation', 'back_compat', 'tdd_default', 'test_list_first', 'fixture_strategy', 'outside_in']) {
        assert.strictEqual(result.cell_provenance[f], 'table_explicit', `${f} should be table_explicit`);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('P8: cell_provenance always has all 10 ALL_FIELDS keys', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });
    const expectedFields = ['tdd', 'depth', 'model_profile', 'verification', 'security_isolation', 'back_compat', 'tdd_default', 'test_list_first', 'fixture_strategy', 'outside_in'];
    for (const f of expectedFields) {
      assert.ok(f in result.cell_provenance, `cell_provenance missing field: ${f}`);
    }
    assert.strictEqual(Object.keys(result.cell_provenance).length, expectedFields.length);
  });

  test('D1: references/defaults-table.md documents both provenance vocabularies', () => {
    const refPath = path.join(__dirname, '..', '..', 'references', 'defaults-table.md');
    const content = fs.readFileSync(refPath, 'utf-8');
    assert.match(content, /## Provenance/);
    assert.match(content, /project_table/);
    assert.match(content, /org_table/);
    assert.match(content, /bundled_table/);
    assert.match(content, /cell_provenance/);
  });

  test('D2: intent.resolve() output structure includes cell_provenance with all 10 fields', () => {
    project = fixtures.buildProject({
      projectFrontmatter: { kind: 'api' },
      objectives: [{ id: '01-foo', work: 'feature' }],
    });
    const result = intent.resolve({
      projectRoot: project.root,
      objectiveId: '01-foo',
      userHome: '/nonexistent',
    });
    assert.ok(result.cell_provenance, 'cell_provenance field expected');
    assert.strictEqual(typeof result.cell_provenance, 'object');
    for (const f of ['tdd', 'depth', 'model_profile', 'verification', 'security_isolation', 'back_compat', 'tdd_default', 'test_list_first', 'fixture_strategy', 'outside_in']) {
      assert.ok(f in result.cell_provenance, `cell_provenance.${f} expected`);
    }
  });
});
