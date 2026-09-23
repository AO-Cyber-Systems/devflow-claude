'use strict';

/**
 * The scratch monorepo factory (TRD 34-10).
 *
 * HAND-WRITTEN, never copied from a real project and never generated (CLAUDE.md habit 4,
 * TRD anti-pattern "do NOT copy a real Flutter project into the fixture"). Every file
 * below is the MINIMUM that makes the REAL `df-tools verify flutter-ui-bootstrap`
 * detector answer `action: 'skip'` with an absolute `packageDir` ending in `/flutter` —
 * the W0-4 contract `agents/executor.md`'s bootstrap prose depends on.
 *
 * Layout (the eden-biz / aodex monorepo shape the prose documents):
 *
 *   <root>/
 *     flutter/pubspec.yaml                      name + sdk constraint + the dev dep
 *     flutter/lib/main.dart                     one line
 *     flutter/integration_test/app_test.dart    the `flutter test` / `flutter drive` target
 *     flutter/test_driver/integration_test.dart the web driver the bootstrap task scaffolds
 *     flutter/.maestro/flow.yaml                the `maestro test .maestro/` target
 *     .planning/objectives/34-demo/             where the evidence `mv` must land
 *     .git/                                     one commit, so `git rev-parse --show-toplevel` works
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Every file, written out by name. Nothing here is derived from a real project.
const FILES = {
  'flutter/pubspec.yaml': [
    'name: scratch_app',
    'description: Hand-built scratch package for the agent shell harness.',
    'environment:',
    "  sdk: '>=3.0.0 <4.0.0'",
    'dependencies:',
    '  flutter:',
    '    sdk: flutter',
    'dev_dependencies:',
    '  flutter_test:',
    '    sdk: flutter',
    '  integration_test:',
    '    sdk: flutter',
    '',
  ].join('\n'),
  'flutter/lib/main.dart': 'void main() {}\n',
  'flutter/integration_test/app_test.dart': "// scratch integration test\nvoid main() {}\n",
  'flutter/test_driver/integration_test.dart': [
    "import 'package:integration_test/integration_test_driver.dart';",
    'Future<void> main() => integrationDriver();',
    '',
  ].join('\n'),
  'flutter/.maestro/flow.yaml': 'appId: com.example.scratch\n---\n- launchApp\n',
  '.planning/objectives/34-demo/.gitkeep': '',
};

function stubBinDir() {
  return path.resolve(__dirname, '..', 'bin');
}

function makeScratchRepo() {
  // realpath: bash's $PWD is the PHYSICAL path and os.tmpdir() is a symlink on macOS
  // (/var -> /private/var). Without this every call would look like a cwd leak.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-shell-scratch-')));

  for (const [rel, body] of Object.entries(FILES)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }

  const git = args => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
  git(['init', '-q']);
  git(['add', '-A']);
  git([
    '-c', 'user.email=harness@example.invalid',
    '-c', 'user.name=Agent Shell Harness',
    '-c', 'commit.gpgsign=false',
    'commit', '-q', '-m', 'scratch monorepo',
  ]);

  return root;
}

/**
 * The evidence-landing case (TRD 34-10 E1/E2) as ONE piece of prose, run from two
 * different starting working directories.
 *
 * This is the block the whole `<worktree_command_discipline>` claim rests on: evidence
 * paths are absolute from `$REPO_ROOT`, so the file lands in the SAME place whether the
 * session's persisted cwd is the repo root or a package subdirectory. Asserting it from
 * one cwd only proves the author's intent, not the prose.
 *
 * The probe and the tests share this one code path deliberately.
 */
const EVIDENCE_BLOCK = [
  '# harness: derive REPO_ROOT={root}',
  '# harness: derive OBJECTIVE_DIR=34-demo',
  'mkdir -p "$REPO_ROOT"/.planning/objectives/$OBJECTIVE_DIR/evidence/',
  '# harness: derive PACKAGE_DIR={root}/flutter',
  '( cd "$PACKAGE_DIR" && flutter test integration_test/ )',
  '# harness: derive REPO_ROOT={root}',
  '# harness: derive OBJECTIVE_DIR=34-demo',
  '# harness: derive PACKAGE_DIR={root}/flutter',
  '# harness: expect .planning/objectives/34-demo/evidence/shot.png',
  'mv "$PACKAGE_DIR"/build/integration_test_screenshots/* '
    + '"$REPO_ROOT"/.planning/objectives/$OBJECTIVE_DIR/evidence/ 2>/dev/null || true',
].join('\n');

const LANDED = '.planning/objectives/34-demo/evidence/shot.png';

function runEvidenceCaseFromBothCwds(harness) {
  const out = {};
  for (const [label, rel] of [['root', '.'], ['subdir', 'flutter']]) {
    const root = makeScratchRepo();
    try {
      const res = harness.runSection(harness.splitCalls(EVIDENCE_BLOCK), {
        root,
        cwd: path.join(root, rel),
        pathPrepend: stubBinDir(),
      });
      const landedAbs = path.join(root, LANDED);
      out[label] = {
        ok: res.ok,
        // The scratch root differs between the two runs, so compare the path RELATIVE to
        // it — otherwise "the same place" is trivially false.
        landed: fs.existsSync(landedAbs) ? LANDED : null,
        findings: res.findings.map(f => f.type),
      };
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  return out;
}

module.exports = {
  makeScratchRepo,
  stubBinDir,
  runEvidenceCaseFromBothCwds,
  EVIDENCE_BLOCK,
  LANDED,
};
