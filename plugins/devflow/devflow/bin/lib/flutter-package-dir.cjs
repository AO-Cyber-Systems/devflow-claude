'use strict';

/**
 * flutter-package-dir.cjs — shared Flutter package-directory resolver.
 *
 * DevFlow's `.planning/` and the executor's cwd are always the repo root, but a
 * monorepo consumer (eden-biz, aodex) puts the actual Flutter package under
 * `<repo>/flutter/pubspec.yaml` rather than `<repo>/pubspec.yaml`. Two bootstrap
 * modules (flutter-ui-eval-bootstrap.cjs, flutter-ui-bootstrap.cjs) previously
 * assumed `<projectDir>/pubspec.yaml` only and reported `flutter-not-detected` in
 * that layout (aodex objective 510).
 *
 * `resolveFlutterPackageDir` centralizes the search so both bootstrap modules
 * agree on where the Flutter package lives: try `projectDir/pubspec.yaml` first,
 * then `projectDir/flutter/pubspec.yaml`; first Flutter-flavored pubspec wins.
 *
 * Reuses detectPubspecFlutter (flutter-ui-scope.cjs) — no reinvented pubspec parse.
 *
 * Consumers (the monorepo story is closed end-to-end across all of them, W0-4
 * fix round 1): flutter-ui-eval-bootstrap.cjs (checkScaffoldState/scaffoldUIEval),
 * flutter-ui-bootstrap.cjs (checkBootstrapState), flutter-ui-setup.cjs
 * (detectFlutterRepo's `df-tools flutter-ui setup` gate), and
 * agents/executor.md's Flutter UI gates (`PACKAGE_DIR` sourced from the bootstrap
 * detector's `.packageDir`, threaded into every `flutter`/`maestro` invocation).
 */

const fs = require('fs');
const path = require('path');
const { detectPubspecFlutter } = require('./flutter-ui-scope.cjs');

// Candidate prefixes, in priority order: repo root first, then the monorepo
// `flutter/` convention.
const CANDIDATE_PREFIXES = ['', 'flutter'];

/**
 * Locate the Flutter package directory under projectDir.
 *
 * @param {string} projectDir - absolute path to the repo/project root
 * @returns {{ packageDir: string, pubspecPath: string, prefix: ''|'flutter' } | null}
 */
function resolveFlutterPackageDir(projectDir) {
  if (!projectDir) return null;

  for (const prefix of CANDIDATE_PREFIXES) {
    const packageDir = prefix ? path.join(projectDir, prefix) : projectDir;
    const pubspecPath = path.join(packageDir, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) continue;

    const content = safeRead(pubspecPath);
    if (detectPubspecFlutter(content).fired) {
      return { packageDir, pubspecPath, prefix };
    }
  }

  return null;
}

function safeRead(p) {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

module.exports = { resolveFlutterPackageDir };
