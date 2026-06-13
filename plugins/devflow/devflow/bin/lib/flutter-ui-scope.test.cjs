'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// RED: imports will fail until next task creates the file.
const {
  detectLibDartFiles,
  detectPubspecFlutter,
  detectFlutterKeywords,
  detectFlutterUIScope,
  derivePlatform,
  deriveStateManagement,
} = require('./flutter-ui-scope.cjs');

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'flutter-ui-scope');

const PUBSPEC_FLUTTER = fs.readFileSync(path.join(FIXTURE_DIR, 'pubspec-with-flutter.yaml'), 'utf-8');
const PUBSPEC_NO_FLUTTER = fs.readFileSync(path.join(FIXTURE_DIR, 'pubspec-without-flutter.yaml'), 'utf-8');
const PUBSPEC_WEB = fs.readFileSync(path.join(FIXTURE_DIR, 'pubspec-web-enabled.yaml'), 'utf-8');

// ─── Task 1: Pure detector core (17 cases) ────────────────────────────────────

test.describe('detectLibDartFiles (REQ-10-03 Signal 1)', () => {
  test('Case D1 — fires on lib/foo.dart', () => {
    const result = detectLibDartFiles(['lib/foo.dart']);
    assert.strictEqual(result.fired, true);
    assert.deepStrictEqual(result.matches, ['lib/foo.dart']);
  });

  test('Case D2 — fires on nested lib/screens/user_screen.dart', () => {
    const result = detectLibDartFiles(['lib/screens/user_screen.dart']);
    assert.strictEqual(result.fired, true);
  });

  test('Case D3 — does not fire on empty input', () => {
    assert.strictEqual(detectLibDartFiles([]).fired, false);
  });

  test('Case D4 — does not fire on test/foo.dart (not lib/)', () => {
    assert.strictEqual(detectLibDartFiles(['test/foo.dart']).fired, false);
  });
});

test.describe('detectPubspecFlutter (REQ-10-03 Signal 2)', () => {
  test('Case D5 — fires when pubspec has flutter dep with sdk: flutter', () => {
    assert.strictEqual(detectPubspecFlutter(PUBSPEC_FLUTTER).fired, true);
  });

  test('Case D6 — does not fire for pure-Dart pubspec without flutter dep', () => {
    assert.strictEqual(detectPubspecFlutter(PUBSPEC_NO_FLUTTER).fired, false);
  });

  test('Case D7 — failsafe: null/empty content returns fired:false with error', () => {
    const r1 = detectPubspecFlutter(null);
    assert.strictEqual(r1.fired, false);
    assert.ok(r1.error);
    assert.strictEqual(detectPubspecFlutter('').fired, false);
  });
});

test.describe('detectFlutterKeywords (REQ-10-03 Signal 3)', () => {
  test('Case D8 — fires on "Flutter widget" and "Riverpod"', () => {
    assert.strictEqual(detectFlutterKeywords('add a Flutter widget for login').fired, true);
    assert.strictEqual(detectFlutterKeywords('use Riverpod for state').fired, true);
  });

  test('Case D9 — word-boundary anchored, does not fire on substring matches', () => {
    assert.strictEqual(detectFlutterKeywords('add a kiteflutter feature').fired, false);
    assert.strictEqual(detectFlutterKeywords('add a Flutter widget').fired, true);
  });
});

test.describe('detectFlutterUIScope (REQ-10-03 composed)', () => {
  test('Case D10 — composes signals; detected:true when any fire', () => {
    const result = detectFlutterUIScope({
      trdFiles: ['lib/foo.dart'],
      pubspecContent: PUBSPEC_NO_FLUTTER,  // signal 2 OFF
      descriptions: ['vague description'],  // signal 3 OFF
    });
    assert.strictEqual(result.detected, true);   // signal 1 fired
    assert.strictEqual(result.signals.lib_dart_files.fired, true);
    assert.strictEqual(result.signals.pubspec_flutter_dep.fired, false);
  });

  test('Case D17 — failsafe: empty inputs return detected:false with error, no throw', () => {
    const result = detectFlutterUIScope({});
    assert.strictEqual(result.detected, false);
    assert.ok(result.error);
  });
});

test.describe('derivePlatform (REQ-10-03 derived field)', () => {
  test('Case D11 — defaults to [mobile, web] when scope is detected (no pubspec.platforms.web block)', () => {
    // Per user correction 2026-05-24: BOTH mobile and web are required coverage.
    // derivePlatform ignores pubspec.platforms.web gating.
    assert.deepStrictEqual(derivePlatform(PUBSPEC_FLUTTER).sort(), ['mobile', 'web']);
  });

  test('Case D12 — returns [mobile, web] when pubspec has flutter.platforms.web block (same as D11 — pubspec.platforms does NOT gate the output)', () => {
    // Regression coverage: adding the legacy platforms.web block does not change output.
    assert.deepStrictEqual(derivePlatform(PUBSPEC_WEB).sort(), ['mobile', 'web']);
  });
});

test.describe('deriveStateManagement (REQ-10-03 derived field)', () => {
  test('Case D13 — riverpod from package:flutter_riverpod import', () => {
    const fileContents = [`import 'package:flutter_riverpod/flutter_riverpod.dart';`];
    assert.strictEqual(deriveStateManagement(fileContents), 'riverpod');
  });

  test('Case D14 — bloc from package:flutter_bloc OR package:bloc import', () => {
    assert.strictEqual(deriveStateManagement([`import 'package:flutter_bloc/flutter_bloc.dart';`]), 'bloc');
    assert.strictEqual(deriveStateManagement([`import 'package:bloc/bloc.dart';`]), 'bloc');
  });

  test('Case D15 — setState when files use setState(', () => {
    const fileContents = [`class _MyState extends State<MyWidget> { void _foo() { setState(() {}); } }`];
    assert.strictEqual(deriveStateManagement(fileContents), 'setState');
  });

  test('Case D16 — other when no signals found', () => {
    assert.strictEqual(deriveStateManagement(['// empty file']), 'other');
  });
});

// ─── Task 2: df-tools subcommand + planner gate content (8 cases) ─────────────

test.describe('df-tools detect flutter-ui-scope (REQ-10-03)', () => {
  const { execSync } = require('node:child_process');
  const os = require('node:os');
  const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

  function makeTempObjective(trdFiles) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-scope-obj-'));
    const objDir = path.join(tmp, '.planning', 'objectives', '99-test-objective');
    fs.mkdirSync(objDir, { recursive: true });
    fs.writeFileSync(path.join(objDir, '99-01-TRD.md'),
`---
objective: 99-test-objective
trd: 99-01
type: standard
wave: 1
depends_on: []
files_modified:
${trdFiles.map(f => `  - ${f}`).join('\n')}
autonomous: true
requirements: [REQ-99-01]
must_haves:
  truths: []
  artifacts: []
  key_links: []
---
# body
`);
    return tmp;
  }

  test('Case E1 — fires detected:true for objective with lib/*.dart TRD files', () => {
    const tmp = makeTempObjective(['lib/foo.dart']);
    const out = execSync(`node ${DF_TOOLS} detect flutter-ui-scope 99 --raw`,
      { encoding: 'utf-8', cwd: tmp });
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.detected, true);
    assert.strictEqual(parsed.signals.lib_dart_files.fired, true);
    // Default platform coverage per user correction 2026-05-24
    assert.deepStrictEqual(parsed.platform.sort(), ['mobile', 'web']);
  });

  test('Case E2 — missing objective returns detected:false cleanly', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-scope-empty-'));
    const out = execSync(`node ${DF_TOOLS} detect flutter-ui-scope 999 --raw`,
      { encoding: 'utf-8', cwd: tmp });
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.detected, false);
    assert.ok(parsed.error);
  });

  test('Case E3 — subcommand listed in df-tools detect help', () => {
    let out = '';
    try {
      out = execSync(`node ${DF_TOOLS} detect bogus 2>&1`, { encoding: 'utf-8' });
    } catch (e) {
      out = (e.stdout || '') + (e.stderr || '');
    }
    assert.ok(/flutter-ui-scope/.test(out), `expected help text to mention flutter-ui-scope, got: ${out}`);
  });
});

test.describe('planner.md gate content (REQ-10-03)', () => {
  const PLANNER_MD = path.join(__dirname, '..', '..', '..', 'agents', 'planner.md');
  const content = fs.readFileSync(PLANNER_MD, 'utf-8');

  test('Case P1 — invokes detect flutter-ui-scope', () => {
    assert.match(content, /detect flutter-ui-scope/);
  });

  test('Case P2 — documents PLANNING INCONCLUSIVE exit on missing fields', () => {
    assert.match(content, /PLANNING INCONCLUSIVE/);
  });

  test('Case P3 — cross-references flutter-state-patterns.md', () => {
    assert.match(content, /flutter-state-patterns/);
  });

  test('Case P4 — mentions all 4 type=ui required artifact fields', () => {
    assert.match(content, /\bstates\b/);
    // Accept either dot-notation or YAML block notation for tests.widget
    assert.ok(
      /tests\.widget/.test(content) || /tests:\s*\n\s+widget/.test(content) || /widget:/.test(content),
      'expected planner.md to mention tests.widget or widget:'
    );
    assert.ok(
      /tests\.integration/.test(content) || /tests:\s*\n\s+integration/.test(content) || /integration:/.test(content),
      'expected planner.md to mention tests.integration or integration:'
    );
    assert.ok(
      /tests\.maestro/.test(content) || /tests:\s*\n\s+maestro/.test(content) || /maestro:/.test(content),
      'expected planner.md to mention tests.maestro or maestro:'
    );
  });

  test('Case P5 — documents platform [mobile, web] default (both platforms required)', () => {
    assert.ok(
      /\[mobile,\s*web\]/.test(content) || /both platforms/i.test(content) || /BOTH platforms/.test(content),
      'expected planner.md to document [mobile, web] or both-platforms requirement'
    );
  });
});
