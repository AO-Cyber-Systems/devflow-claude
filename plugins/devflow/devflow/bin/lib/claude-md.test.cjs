'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const claudeMd = require('./claude-md.cjs');
const fixtures = require('./__fixtures__/intent-fixtures.cjs');

describe('claude-md.absorb', () => {
  let cleanupFns = [];

  afterEach(() => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];
  });

  test('returns directives for CLAUDE.md with TDD section', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cm-'));
    cleanupFns.push(() => fs.rmSync(home, { recursive: true, force: true }));
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.claude', 'CLAUDE.md'),
      fixtures.claudeMd({
        tddSection: {
          heading: 'TDD Playbook',
          body: 'Force TDD TRDs at planning time. All features default to TDD.',
        },
      }),
      'utf-8'
    );

    const directives = claudeMd.absorb({ userHome: home });

    assert.strictEqual(directives.tdd.length, 1);
    assert.strictEqual(directives.tdd[0].source, 'user');
    assert.match(directives.tdd[0].body, /Force TDD/);
  });

  test('returns empty directives for CLAUDE.md without relevant sections', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cm-'));
    cleanupFns.push(() => fs.rmSync(home, { recursive: true, force: true }));
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.claude', 'CLAUDE.md'),
      '# CLAUDE.md\n\n## Architecture\n\nSome architecture notes.\n',
      'utf-8'
    );

    const directives = claudeMd.absorb({ userHome: home });

    assert.strictEqual(directives.tdd.length, 0);
    assert.strictEqual(directives.test.length, 0);
    assert.strictEqual(directives.quality.length, 0);
    assert.strictEqual(directives.scope.length, 0);
  });

  test('reads both user-level and project-level CLAUDE.md; project wins on conflict', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cm-'));
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'df-pr-'));
    cleanupFns.push(() => fs.rmSync(home, { recursive: true, force: true }));
    cleanupFns.push(() => fs.rmSync(proj, { recursive: true, force: true }));

    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.claude', 'CLAUDE.md'),
      fixtures.claudeMd({
        tddSection: { heading: 'TDD Playbook', body: 'User-level TDD policy.' },
      }),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(proj, 'CLAUDE.md'),
      fixtures.claudeMd({
        tddSection: { heading: 'TDD', body: 'Project-level TDD policy.' },
      }),
      'utf-8'
    );

    const directives = claudeMd.absorb({ userHome: home, projectRoot: proj });

    assert.strictEqual(directives.tdd.length, 2);
    const userEntry = directives.tdd.find((d) => d.source === 'user');
    const projectEntry = directives.tdd.find((d) => d.source === 'project');
    assert.ok(userEntry);
    assert.ok(projectEntry);
    assert.match(projectEntry.body, /Project-level/);
  });

  test('returns empty when no CLAUDE.md exists at either location', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cm-'));
    cleanupFns.push(() => fs.rmSync(home, { recursive: true, force: true }));

    const directives = claudeMd.absorb({ userHome: home });

    assert.strictEqual(directives.tdd.length, 0);
    assert.strictEqual(directives._sources.length, 0);
  });
});

describe('claude-md.deriveOverrides', () => {
  test('extracts tdd:strict from "all features default to TDD" body', () => {
    const directives = {
      tdd: [{ source: 'user', heading: 'TDD Playbook', body: 'All features default to TDD strict.' }],
      test: [],
      quality: [],
      scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    assert.strictEqual(overrides.tdd, 'strict');
  });

  test('extracts tdd:strict from "Force TDD TRDs at planning time" body', () => {
    const directives = {
      tdd: [{ source: 'user', heading: 'TDD Playbook', body: 'Force TDD TRDs at planning time when invoking the planner.' }],
      test: [],
      quality: [],
      scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    assert.strictEqual(overrides.tdd, 'strict');
  });

  test('returns empty overrides for vague body without policy phrasing', () => {
    const directives = {
      tdd: [{ source: 'user', heading: 'TDD', body: 'TDD is helpful sometimes.' }],
      test: [],
      quality: [],
      scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    assert.strictEqual(overrides.tdd, undefined);
  });

  test('extracts multitenancy:required from playbook clause', () => {
    const directives = {
      tdd: [{
        source: 'user',
        heading: 'TDD Playbook',
        body: 'Multitenancy guard in every test (when applicable). Test the wrong-tenant isolation always.',
      }],
      test: [],
      quality: [],
      scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    assert.strictEqual(overrides.multitenancy, 'required');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRD 0.4 — TDD Playbook habits — new test groups (RED phase)
// ─────────────────────────────────────────────────────────────────────────────

// Helper: build a sandboxed CLAUDE.md fixture in a temp dir and absorb it.
// Returns { overrides, directives, cleanup }.
function absorbFixture(claudeMdContent, { projectContent } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cm-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), claudeMdContent, 'utf-8');

  let projectRoot;
  if (projectContent !== undefined) {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'df-pr-'));
    fs.writeFileSync(path.join(projectRoot, 'CLAUDE.md'), projectContent, 'utf-8');
  }

  const directives = claudeMd.absorb({ userHome: home, projectRoot });
  const overrides = claudeMd.deriveOverrides(directives);

  return {
    directives,
    overrides,
    cleanup() {
      fs.rmSync(home, { recursive: true, force: true });
      if (projectRoot) fs.rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

describe('TDD Playbook habits — individual detection', () => {
  // A1: Habit 1 — "Force TDD TRDs at planning time" → tdd_default: 'auto'
  test('A1: habit 1 — Force TDD TRDs at planning time → tdd_default: auto', () => {
    const content = '# CLAUDE.md\n\n## TDD Playbook\n\nForce TDD TRDs at planning time.\n';
    const { overrides, cleanup } = absorbFixture(content);
    try {
      assert.ok(overrides._playbookDetected, '_playbookDetected should be true');
      assert.strictEqual(overrides.tdd_default, 'auto');
    } finally { cleanup(); }
  });

  // A2: Habit 2 — "Test list first" → test_list_first: 'required'
  test('A2: habit 2 — Test list first → test_list_first: required', () => {
    const content = '# CLAUDE.md\n\n## TDD Playbook\n\nTest list first. Each TRD must include a checklist.\n';
    const { overrides, cleanup } = absorbFixture(content);
    try {
      assert.strictEqual(overrides.test_list_first, 'required');
    } finally { cleanup(); }
  });

  // A3: Habit 4 — "Fixture generators, not LLM-generated test data" → fixture_strategy: 'generators'
  test('A3: habit 4 — Fixture generators, not LLM-generated test data → fixture_strategy: generators', () => {
    const content = '# CLAUDE.md\n\n## TDD Playbook\n\nFixture generators, not LLM-generated test data. Hand-built factory functions.\n';
    const { overrides, cleanup } = absorbFixture(content);
    try {
      assert.strictEqual(overrides.fixture_strategy, 'generators');
    } finally { cleanup(); }
  });

  // A4: Habit 5 — "Outside-in for UI / portal flows" → outside_in: true
  test('A4: habit 5 — Outside-in for UI / portal flows → outside_in: true', () => {
    const content = '# CLAUDE.md\n\n## TDD Playbook\n\nOutside-in for UI / portal flows. Start at the highest user-observable layer.\n';
    const { overrides, cleanup } = absorbFixture(content);
    try {
      assert.strictEqual(overrides.outside_in, true);
    } finally { cleanup(); }
  });

  // A5: Habit 6 — "Multitenancy guard in every test" → multitenancy: 'required' + security_isolation: 'multi_tenant_required'
  test('A5: habit 6 — Multitenancy guard in every test → multitenancy:required + security_isolation:multi_tenant_required', () => {
    const content = '# CLAUDE.md\n\n## TDD Playbook\n\nMultitenancy guard in every test (when applicable). Include a "wrong-tenant isolation" assertion.\n';
    const { overrides, cleanup } = absorbFixture(content);
    try {
      assert.strictEqual(overrides.multitenancy, 'required');
      assert.strictEqual(overrides.security_isolation, 'multi_tenant_required');
    } finally { cleanup(); }
  });

  // A6: Habit 3 — "One test at a time" / "RED → GREEN → REFACTOR" → NO structured field; tdd_red_green_refactor undefined
  test('A6: habit 3 — One test at a time / RED→GREEN→REFACTOR → no structured override field', () => {
    const content = '# CLAUDE.md\n\n## TDD Playbook\n\nOne test at a time through RED → GREEN → REFACTOR.\n';
    const { overrides, cleanup } = absorbFixture(content);
    try {
      // Habit 3 is freeform-only — it MUST NOT create a structured override field
      assert.strictEqual(overrides.tdd_red_green_refactor, undefined);
      assert.strictEqual(overrides.red_green_refactor, undefined);
      // _playbookDetected is set because the heading was matched
      assert.ok(overrides._playbookDetected, '_playbookDetected should be true from heading');
    } finally { cleanup(); }
  });
});

describe('TDD Playbook habits — composite real-world', () => {
  // B1: Full real CLAUDE.md round-trip — all 6 habits → all 5 structured fields + _playbookDetected
  test('B1: real CLAUDE.md round-trip — all 6 habits detected, 5 structured fields emitted', () => {
    const content = fixtures.realCLAUDEMd();
    assert.ok(content.length > 1500, `realCLAUDEMd() fixture too short: ${content.length} chars`);
    const { overrides, cleanup } = absorbFixture(content);
    try {
      assert.ok(overrides._playbookDetected, '_playbookDetected must be true');
      assert.strictEqual(overrides.tdd_default, 'auto', 'habit 1 → tdd_default:auto');
      assert.strictEqual(overrides.test_list_first, 'required', 'habit 2 → test_list_first:required');
      assert.strictEqual(overrides.fixture_strategy, 'generators', 'habit 4 → fixture_strategy:generators');
      assert.strictEqual(overrides.outside_in, true, 'habit 5 → outside_in:true');
      assert.strictEqual(overrides.multitenancy, 'required', 'habit 6 → multitenancy:required');
      assert.strictEqual(overrides.security_isolation, 'multi_tenant_required', 'habit 6 → security_isolation:multi_tenant_required');
    } finally { cleanup(); }
  });

  // B2: Subset of habits (1, 4, 6 only) → only those 3 structured fields; outside_in and test_list_first absent
  test('B2: subset CLAUDE.md (habits 1+4+6) — only 3 structured fields; outside_in and test_list_first absent', () => {
    const content = [
      '# CLAUDE.md',
      '',
      '## TDD Playbook',
      '',
      '1. **Force TDD TRDs at planning time.** Use type=tdd for all features.',
      '4. **Fixture generators, not LLM-generated test data.** Factory functions.',
      '6. **Multitenancy guard in every test (when applicable).** Wrong-tenant isolation.',
      '',
    ].join('\n');
    const { overrides, cleanup } = absorbFixture(content);
    try {
      assert.strictEqual(overrides.tdd_default, 'auto', 'habit 1 → tdd_default:auto');
      assert.strictEqual(overrides.fixture_strategy, 'generators', 'habit 4 → fixture_strategy:generators');
      assert.strictEqual(overrides.security_isolation, 'multi_tenant_required', 'habit 6 → security_isolation:multi_tenant_required');
      // Absent: test_list_first and outside_in must NOT be set
      assert.strictEqual(overrides.test_list_first, undefined, 'test_list_first must be absent');
      assert.strictEqual(overrides.outside_in, undefined, 'outside_in must be absent');
    } finally { cleanup(); }
  });

  // B3: "## Testing Strategy" heading (not "## TDD Playbook") with habit 4 body text → fixture_strategy: 'generators'
  test('B3: non-TDD-heading section with fixture-generators body → fixture_strategy:generators still detected', () => {
    const content = [
      '# CLAUDE.md',
      '',
      '## Testing Strategy',
      '',
      'Use fixture generators, not LLM-generated test data. Hand-built factory functions.',
      '',
    ].join('\n');
    const { overrides, cleanup } = absorbFixture(content);
    try {
      assert.strictEqual(overrides.fixture_strategy, 'generators');
    } finally { cleanup(); }
  });
});

describe('TDD Playbook habits — edge cases', () => {
  // C1: "## TDD Playbook" heading with empty body → _playbookDetected:true but no structured fields
  test('C1: TDD Playbook heading with empty body → _playbookDetected:true, no structured fields', () => {
    const content = '# CLAUDE.md\n\n## TDD Playbook\n\n';
    const { overrides, cleanup } = absorbFixture(content);
    try {
      assert.ok(overrides._playbookDetected, '_playbookDetected must be true from heading alone');
      assert.strictEqual(overrides.tdd_default, undefined, 'no tdd_default from empty body');
      assert.strictEqual(overrides.test_list_first, undefined, 'no test_list_first from empty body');
      assert.strictEqual(overrides.fixture_strategy, undefined, 'no fixture_strategy from empty body');
      assert.strictEqual(overrides.outside_in, undefined, 'no outside_in from empty body');
      assert.strictEqual(overrides.security_isolation, undefined, 'no security_isolation from empty body');
    } finally { cleanup(); }
  });

  // C2: "TDD Playbook" in a normal paragraph (not H2) → _playbookDetected:false (no false-positive)
  test('C2: TDD Playbook in inline paragraph only → _playbookDetected:false (no false-positive)', () => {
    const content = [
      '# CLAUDE.md',
      '',
      '## Architecture',
      '',
      'We use the TDD Playbook approach for feature development.',
      '',
    ].join('\n');
    const { overrides, cleanup } = absorbFixture(content);
    try {
      assert.strictEqual(overrides._playbookDetected, false, '_playbookDetected must be false — TDD Playbook not in H2');
    } finally { cleanup(); }
  });

  // C3: User-level CLAUDE.md sets fixture_strategy:inline (via no habit 4 text), project-level has habit 4 → project wins
  test('C3: project-level CLAUDE.md wins over user-level on fixture_strategy', () => {
    const userContent = [
      '# CLAUDE.md',
      '',
      '## TDD Playbook',
      '',
      'Force TDD TRDs at planning time.',
      '',
    ].join('\n');
    const projectContent = [
      '# CLAUDE.md',
      '',
      '## TDD',
      '',
      'Fixture generators, not LLM-generated test data. Factory functions only.',
      '',
    ].join('\n');
    const { overrides, cleanup } = absorbFixture(userContent, { projectContent });
    try {
      assert.strictEqual(overrides.fixture_strategy, 'generators', 'project-level habit 4 must set fixture_strategy');
      // Both levels contribute: user sets tdd_default, project sets fixture_strategy
      assert.strictEqual(overrides.tdd_default, 'auto', 'user-level habit 1 preserved');
    } finally { cleanup(); }
  });

  // C4: "property-based testing" in "What to skip" context → propertyBased: 'skip' (back-compat, no new behavior)
  test('C4: property-based testing in skip context → propertyBased:skip (back-compat preserved)', () => {
    const content = [
      '# CLAUDE.md',
      '',
      '## TDD Playbook',
      '',
      'Skip property-based testing unless high-cardinality math.',
      '',
    ].join('\n');
    const { overrides, cleanup } = absorbFixture(content);
    try {
      assert.strictEqual(overrides.propertyBased, 'skip');
    } finally { cleanup(); }
  });
});

describe('TDD Playbook habits — back-compat', () => {
  // D1: Existing tdd:strict extraction still works
  test('D1a: back-compat — tdd:strict from "all features default to TDD" still works', () => {
    const directives = {
      tdd: [{ source: 'user', heading: 'TDD Playbook', body: 'All features default to TDD strict.' }],
      test: [], quality: [], scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    assert.strictEqual(overrides.tdd, 'strict');
  });

  test('D1b: back-compat — multitenancy:required from playbook clause still works', () => {
    const directives = {
      tdd: [{ source: 'user', heading: 'TDD Playbook', body: 'Multitenancy guard in every test (when applicable). Test the wrong-tenant isolation always.' }],
      test: [], quality: [], scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    assert.strictEqual(overrides.multitenancy, 'required');
  });

  // D2: _playbookDetected flag added without breaking callers that don't read it
  test('D2: _playbookDetected coexists with existing fields without breaking callers', () => {
    const directives = {
      tdd: [{ source: 'user', heading: 'TDD Playbook', body: 'Force TDD TRDs at planning time.' }],
      test: [], quality: [], scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    // _playbookDetected must be present as boolean
    assert.strictEqual(typeof overrides._playbookDetected, 'boolean');
    // Existing tdd:strict field must coexist with new tdd_default field
    assert.strictEqual(overrides.tdd, 'strict', 'legacy tdd field preserved');
    assert.strictEqual(overrides.tdd_default, 'auto', 'new tdd_default field present');
  });

  // D3: Both tdd:'strict' and tdd_default coexist on the same overrides map
  test('D3: tdd:strict (legacy) and tdd_default (new) coexist on overrides map', () => {
    const directives = {
      tdd: [{ source: 'user', heading: 'TDD Playbook', body: 'Force TDD TRDs at planning time. All features default to TDD.' }],
      test: [], quality: [], scope: [],
    };
    const overrides = claudeMd.deriveOverrides(directives);
    assert.ok('tdd' in overrides, 'legacy tdd field must be present');
    assert.ok('tdd_default' in overrides, 'new tdd_default field must be present');
    assert.strictEqual(overrides.tdd, 'strict');
    assert.strictEqual(overrides.tdd_default, 'auto');
  });
});

describe('claude-md.isRelevantHeading', () => {
  test('matches H2 headings with TDD, Test, Quality, Scope keywords', () => {
    assert.ok(claudeMd.isRelevantHeading('## TDD Playbook'));
    assert.ok(claudeMd.isRelevantHeading('## Testing'));
    assert.ok(claudeMd.isRelevantHeading('## Test Strategy'));
    assert.ok(claudeMd.isRelevantHeading('## Quality Bar'));
    assert.ok(claudeMd.isRelevantHeading('## Scope'));
  });

  test('rejects unrelated H2 headings', () => {
    assert.ok(!claudeMd.isRelevantHeading('## Architecture'));
    assert.ok(!claudeMd.isRelevantHeading('## Commands'));
    assert.ok(!claudeMd.isRelevantHeading('## Conventions'));
  });

  test('rejects H1 and H3', () => {
    assert.ok(!claudeMd.isRelevantHeading('# TDD'));
    assert.ok(!claudeMd.isRelevantHeading('### TDD details'));
  });
});
