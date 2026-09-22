'use strict';

/**
 * flutter-ui-bootstrap.cjs — Flutter UI bootstrap state detector
 *
 * Implements `df-tools verify flutter-ui-bootstrap <project-dir>`:
 * - Pure logic, no LLM, no network
 * - Checks pubspec.yaml dev_dependencies, integration_test/, .maestro/ dirs,
 *   and .planning/.flutter-ui-bootstrap-done marker
 *
 * REQ-10-07 graceful-bootstrap semantics:
 *   action:'skip' — all checks pass (infra present + optionally marker present)
 *   action:'warn' — missing infra + no marker (first-run graceful; emits setup_task)
 *   action:'fail' — missing infra + marker exists (subsequent-run hard fail)
 *
 * Monorepo support (W0-4): the Flutter package may live at `projectDir/pubspec.yaml`
 * OR `projectDir/flutter/pubspec.yaml` (eden-biz/aodex layout — the executor's cwd and
 * DevFlow's `.planning/` are always the repo root). resolveFlutterPackageDir
 * (flutter-package-dir.cjs) finds it; pubspec/integration_test/.maestro/test_driver
 * checks resolve against the resulting `packageDir`, while the `.planning/` marker
 * always stays at `projectDir` (the repo root).
 *
 * Output shape:
 * {
 *   ready: boolean,
 *   missing: string[],
 *   action: 'skip'|'warn'|'fail',
 *   setup_task?: string,  // XML task block — only when action:'warn'
 *   packageDir: string,   // absolute path to the resolved Flutter package dir
 *   prefix: ''|'flutter'  // '' when the package is at projectDir, 'flutter' in a monorepo
 * }
 */

const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');
const { resolveFlutterPackageDir } = require('./flutter-package-dir.cjs');

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Pattern to detect `integration_test: { sdk: flutter }` under dev_dependencies.
 * Requires indented `integration_test:` line followed by indented `sdk: flutter` line.
 * Uses multiline flag; newline between the two lines.
 */
const INTEGRATION_TEST_DEP_RE = /^\s+integration_test\s*:\s*\n\s+sdk\s*:\s*flutter\s*$/m;

/**
 * Setup task XML block emitted when action:'warn'.
 * Carries caution="pause-before-destructive" so the user reviews pubspec changes
 * before they land (per TRD anti-patterns section).
 *
 * CRITICAL: Must include test_driver/integration_test.dart scaffold — TRD 10-04b's
 * executor calls `flutter drive --driver=test_driver/integration_test.dart` for web
 * verification. Without this file, web tests.integration invocation fails.
 *
 * ATOMIC SEMANTICS: Marker creation (.flutter-ui-bootstrap-done) is the LAST step.
 * If any earlier step fails, the marker must NOT be created. The executor (TRD 10-04b)
 * implements the atomic ordering — this content encodes the intent.
 *
 * PATHS: the task is executed from the repo root (the executor's cwd), so every
 * package path is prefixed with the resolved `prefix` (`flutter/` in a monorepo,
 * nothing in a root-layout project). The `.planning/` marker is DevFlow's own and
 * always stays root-relative.
 *
 * @param {''|'flutter'} prefix - resolved package prefix from resolveFlutterPackageDir
 * @returns {string} XML task block
 */
function setupTaskTemplate(prefix) {
  const p = prefix ? `${prefix}/` : '';
  return `<!-- Auto-emitted Flutter UI bootstrap setup task -->
<task type="auto" caution="pause-before-destructive">
  <name>Bootstrap Flutter UI testing infrastructure</name>
  <files>${p}pubspec.yaml, ${p}integration_test/.gitkeep, ${p}.maestro/.gitkeep, ${p}test_driver/integration_test.dart, .planning/.flutter-ui-bootstrap-done</files>
  <action>
First-time setup for Flutter UI verification (all paths relative to the repo root):

1. Add to ${p}pubspec.yaml dev_dependencies (preserve other dev_dependencies):
   \`\`\`yaml
   dev_dependencies:
     flutter_test:
       sdk: flutter
     integration_test:    # NEW
       sdk: flutter       # NEW
   \`\`\`

2. \`mkdir -p ${p}integration_test && touch ${p}integration_test/.gitkeep\`

3. \`mkdir -p ${p}.maestro && touch ${p}.maestro/.gitkeep\`

4. Scaffold \`${p}test_driver/integration_test.dart\` for Flutter web E2E (REQUIRED — the executor in TRD 10-04b uses
   \`flutter drive --driver=test_driver/integration_test.dart\` to run \`tests.integration\` on web):
   \`\`\`dart
   import 'package:integration_test/integration_test_driver.dart';
   Future<void> main() => integrationDriver();
   \`\`\`

5. \`${p ? `( cd ${prefix} && flutter pub get )` : 'flutter pub get'}\` to install the new dev dep.

6. ONLY AFTER all of 1-5 succeed: touch \`.planning/.flutter-ui-bootstrap-done\` to mark bootstrap complete.
   This marker triggers HARD FAIL on future runs if any of the above goes missing.

The caution attribute pauses execution before this task lands so the user can review the proposed pubspec diff.
  </action>
  <verify>
test -f .planning/.flutter-ui-bootstrap-done && \\
  test -d ${p}integration_test && \\
  test -d ${p}.maestro && \\
  test -f ${p}test_driver/integration_test.dart && \\
  grep -q 'integration_test:' ${p}pubspec.yaml && echo OK
  </verify>
  <done>Flutter UI verification infrastructure present; future TRD executions skip bootstrap.</done>
</task>`;
}

// ─── checkBootstrapState (pure function) ─────────────────────────────────────

/**
 * Pure function: given a project directory, check Flutter UI bootstrap state.
 *
 * @param {object} opts
 * @param {string} opts.projectDir - absolute path to the repo root (Flutter project root,
 *   or the monorepo root above a `flutter/` package)
 * @returns {{ ready: boolean, missing: string[], action: 'skip'|'warn'|'fail', setup_task?: string, packageDir: string, prefix: ''|'flutter' }}
 */
function checkBootstrapState({ projectDir }) {
  if (!projectDir) {
    return { ready: false, missing: ['unknown'], action: 'fail', error: 'projectDir required' };
  }

  // Resolve the Flutter package dir: projectDir/pubspec.yaml first, then
  // projectDir/flutter/pubspec.yaml (monorepo layout). When neither is a
  // detectable Flutter pubspec (including "no pubspec at all"), fall back to
  // projectDir itself so path checks below behave exactly as before — missing
  // pubspec/infra is still reported (graceful warn), not silently skipped.
  const resolved = resolveFlutterPackageDir(projectDir);
  const packageDir = resolved ? resolved.packageDir : projectDir;
  const prefix = resolved ? resolved.prefix : '';

  const pubspecPath = path.join(packageDir, 'pubspec.yaml');
  const integrationTestDir = path.join(packageDir, 'integration_test');
  const maestroDir = path.join(packageDir, '.maestro');
  // The `.planning/` marker is DevFlow's own bookkeeping — it always lives at the
  // repo root (projectDir), never under packageDir, even in the monorepo layout.
  const markerPath = path.join(projectDir, '.planning', '.flutter-ui-bootstrap-done');

  const missing = [];

  // Check pubspec dev_dep: integration_test: { sdk: flutter }
  if (!fs.existsSync(pubspecPath)) {
    missing.push('integration_test_dep');
  } else {
    const pubspecContent = fs.readFileSync(pubspecPath, 'utf-8');
    if (!INTEGRATION_TEST_DEP_RE.test(pubspecContent)) {
      missing.push('integration_test_dep');
    }
  }

  // Check integration_test/ directory
  if (!fs.existsSync(integrationTestDir)) missing.push('integration_test_dir');

  // Check .maestro/ directory
  if (!fs.existsSync(maestroDir)) missing.push('maestro_dir');

  const ready = missing.length === 0;
  const markerExists = fs.existsSync(markerPath);

  // Determine action per REQ-10-07 semantics
  let action;
  if (ready) {
    action = 'skip';
  } else if (markerExists) {
    // Marker present but infra missing → subsequent run hard fail
    action = 'fail';
  } else {
    // No marker, infra missing → first run graceful warn
    action = 'warn';
  }

  const result = { ready, missing, action, packageDir, prefix };

  // Only emit setup_task on first-run warn
  if (action === 'warn') {
    result.setup_task = setupTaskTemplate(prefix);
  }

  return result;
}

// ─── cmdVerifyFlutterUIBootstrap (I/O wrapper) ───────────────────────────────

/**
 * CLI entry point: resolves project dir, calls checkBootstrapState, emits result.
 *
 * @param {string} cwd        - process working directory
 * @param {string} projectDir - optional override path (args[2] from CLI)
 * @param {boolean} raw       - if true, emit compact JSON; otherwise emit pretty JSON
 */
function cmdVerifyFlutterUIBootstrap(cwd, projectDir, raw) {
  const target = projectDir
    ? (path.isAbsolute(projectDir) ? projectDir : path.join(cwd, projectDir))
    : cwd;

  const result = checkBootstrapState({ projectDir: target });
  output(result, raw);
}

module.exports = { checkBootstrapState, cmdVerifyFlutterUIBootstrap };
