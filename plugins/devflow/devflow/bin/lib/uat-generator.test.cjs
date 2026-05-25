'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { generateUAT } = require('./uat-generator.cjs');

// Hand-built TRD fixtures (habit 4) — no web opt-in flag anywhere; that concept does not exist.
function makeFlutterTRD({ trd, artifacts, platform = ['mobile', 'web'] }) {
  return {
    type: 'ui',
    stack: 'flutter',
    state_management: 'riverpod',
    platform,
    trd,
    must_haves: { artifacts },
  };
}

test.describe('generateUAT (REQ-10-06)', () => {

  test('Case L1 — one Flutter TRD, one artifact, 3 states, platform=[mobile] → 3 state rows', () => {
    const out = generateUAT({
      objective: '10-flutter-ui-verification-process',
      sourceFiles: ['10-01-SUMMARY.md'],
      trds: [
        makeFlutterTRD({
          trd: '10-01',
          platform: ['mobile'],
          artifacts: [{ path: 'lib/screens/user_list.dart', states: ['loading', 'data', 'error'], tests: { widget: 't/u.dart', integration: 'integration_test/u.dart', maestro: '.maestro/u.yaml' } }],
        }),
      ],
      maestroFlows: [],
    });
    const stateRows = out.match(/^### \d+\./gm) || [];
    assert.strictEqual(stateRows.length, 3);
    assert.match(out, /loading/);
    assert.match(out, /data/);
    assert.match(out, /error/);
  });

  test('Case L2 — Maestro flow files produce mobile-only flow rows (no web branching in Maestro)', () => {
    const out = generateUAT({
      objective: '10',
      sourceFiles: [],
      trds: [],
      maestroFlows: ['.maestro/login.yaml', '.maestro/checkout.yaml'],
    });
    const rows = out.match(/^### \d+\./gm) || [];
    assert.strictEqual(rows.length, 2);
    assert.match(out, /maestro test \.maestro\/login\.yaml/);
    assert.match(out, /maestro test \.maestro\/checkout\.yaml/);
    // Mobile-only annotation — no (web) suffix
    assert.doesNotMatch(out, /\(web\)/i);
  });

  test('Case L3 — numbering is continuous across state + maestro + web-integration rows', () => {
    const out = generateUAT({
      objective: '10',
      sourceFiles: [],
      trds: [makeFlutterTRD({
        trd: '10-01',
        platform: ['mobile', 'web'],
        artifacts: [{ path: 'lib/s.dart', states: ['loading', 'data'], tests: { integration: 'integration_test/s.dart' } }],
      })],
      maestroFlows: ['.maestro/foo.yaml'],
    });
    // 2 states × 2 platforms = 4 state rows
    // 1 Maestro flow row
    // 1 web-integration row (since web is in platform)
    // Total: 6
    const rows = out.match(/^### \d+\./gm) || [];
    assert.strictEqual(rows.length, 6);
    assert.ok(out.includes('### 1.'));
    assert.ok(out.includes('### 6.'));
  });

  test('Case L4 — Non-Flutter TRDs contribute zero rows', () => {
    const out = generateUAT({
      objective: '10',
      sourceFiles: [],
      trds: [{ type: 'standard', must_haves: { artifacts: [{ path: 'lib/foo.cjs' }] } }],
      maestroFlows: [],
    });
    const rows = out.match(/^### \d+\./gm) || [];
    assert.strictEqual(rows.length, 0);
  });

  test('Case L5 — Frontmatter shape: status:testing, objective, source', () => {
    const out = generateUAT({
      objective: '10-flutter-ui',
      sourceFiles: ['10-01-SUMMARY.md', '10-02-SUMMARY.md'],
      trds: [],
      maestroFlows: [],
    });
    assert.match(out, /^---/);
    assert.match(out, /^status: testing/m);
    assert.match(out, /^objective: 10-flutter-ui/m);
    assert.match(out, /^source: \[10-01-SUMMARY\.md, 10-02-SUMMARY\.md\]/m);
  });

  test('Case L6 — Human-readable state expected text', () => {
    const out = generateUAT({
      objective: '10',
      sourceFiles: [],
      trds: [makeFlutterTRD({
        trd: '10-01',
        platform: ['mobile'],
        artifacts: [{ path: 'lib/screen.dart', states: ['loading', 'data', 'error', 'empty', 'initial'], tests: {} }],
      })],
      maestroFlows: [],
    });
    assert.match(out, /loading.*spinner|spinner.*loading/i);
    assert.match(out, /error.*message|message.*error/i);
    assert.match(out, /empty.*state|empty.*message/i);
  });

  test('Case L7 — Per-platform expansion: platform=[mobile, web] + 3 states → 6 state rows (each row names its platform)', () => {
    // User correction 2026-05-24: web is DEFAULT coverage, not opt-in.
    // The generator must produce one (state, platform) row pair for every combination.
    const out = generateUAT({
      objective: '10',
      sourceFiles: [],
      trds: [makeFlutterTRD({
        trd: '10-01',
        platform: ['mobile', 'web'],
        artifacts: [{ path: 'lib/s.dart', states: ['loading', 'data', 'error'], tests: { integration: 'integration_test/s.dart' } }],
      })],
      maestroFlows: [],
    });
    // 3 states × 2 platforms = 6 state rows. Plus 1 web-integration row = 7 total.
    const rows = out.match(/^### \d+\./gm) || [];
    assert.ok(rows.length >= 6, `expected at least 6 state rows + web-integration, got ${rows.length}`);
    // Each state row should name its platform
    assert.match(out, /loading.*mobile|mobile.*loading/i);
    assert.match(out, /loading.*web|web.*loading/i);
    assert.match(out, /data.*mobile|mobile.*data/i);
    assert.match(out, /data.*web|web.*data/i);
    assert.match(out, /error.*mobile|mobile.*error/i);
    assert.match(out, /error.*web|web.*error/i);
    // Output must not contain the prohibited flag name
    assert.doesNotMatch(out, /maestro_web/);
  });

  test('Case L8 — Empty inputs → valid frontmatter, 0 test rows', () => {
    const out = generateUAT({
      objective: '10',
      sourceFiles: [],
      trds: [],
      maestroFlows: [],
    });
    assert.match(out, /^---/);
    assert.match(out, /^status: testing/m);
    const rows = out.match(/^### \d+\./gm) || [];
    assert.strictEqual(rows.length, 0);
  });

  test('Case L9 — Web integration row generated per artifact when web in platform', () => {
    const out = generateUAT({
      objective: '10',
      sourceFiles: [],
      trds: [makeFlutterTRD({
        trd: '10-01',
        platform: ['mobile', 'web'],
        artifacts: [{
          path: 'lib/screens/login.dart',
          states: [],
          tests: { integration: 'integration_test/login_flow_test.dart' },
        }],
      })],
      maestroFlows: [],
    });
    // Web-integration row uses flutter drive
    assert.match(out, /flutter drive.*--driver=test_driver\/integration_test\.dart/);
    assert.match(out, /--target=integration_test\/login_flow_test\.dart/);
    assert.match(out, /-d chrome/);
  });

  test('Case L10 — Maestro rows are mobile-only; generator does not emit any web Maestro annotation', () => {
    const out = generateUAT({
      objective: '10',
      sourceFiles: [],
      trds: [makeFlutterTRD({
        trd: '10-01',
        platform: ['mobile', 'web'],
        artifacts: [{ path: 'lib/s.dart', states: [], tests: { maestro: '.maestro/flow.yaml' } }],
      })],
      maestroFlows: ['.maestro/flow.yaml'],
    });
    // Maestro row is mobile (no web annotation)
    assert.match(out, /Maestro flow.*flow\.yaml.*\(mobile\)|maestro test \.maestro\/flow\.yaml/);
    // No (web) suffix on Maestro row, no forbidden flag in output
    assert.doesNotMatch(out, /Maestro.*\(web\)/i);
    assert.doesNotMatch(out, /maestro_web/);
  });
});
