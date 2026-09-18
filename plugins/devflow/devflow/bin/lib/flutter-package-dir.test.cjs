'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// RED: import resolves to the not-yet-implemented module under test.
const { resolveFlutterPackageDir } = require('./flutter-package-dir.cjs');

// ─── Hand-built fixtures (habit 4 — no LLM-generated data) ───────────────────

const FLUTTER_PUBSPEC = `name: x\ndependencies:\n  flutter:\n    sdk: flutter\n`;
const NON_FLUTTER_PUBSPEC = `name: x\ndependencies:\n  http: ^1.0.0\n`;

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-package-dir-'));
}

function writePubspec(dir, content) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'pubspec.yaml'), content);
}

test.describe('resolveFlutterPackageDir', () => {

  test('root pubspec.yaml (Flutter) present → resolves to root, prefix ""', () => {
    const tmp = makeTmpDir();
    writePubspec(tmp, FLUTTER_PUBSPEC);

    const result = resolveFlutterPackageDir(tmp);
    assert.ok(result, 'result is non-null');
    assert.strictEqual(result.packageDir, tmp);
    assert.strictEqual(result.pubspecPath, path.join(tmp, 'pubspec.yaml'));
    assert.strictEqual(result.prefix, '');
  });

  test('root pubspec (Flutter) AND flutter/pubspec.yaml (Flutter) both present → root wins', () => {
    const tmp = makeTmpDir();
    writePubspec(tmp, FLUTTER_PUBSPEC);
    writePubspec(path.join(tmp, 'flutter'), FLUTTER_PUBSPEC);

    const result = resolveFlutterPackageDir(tmp);
    assert.ok(result, 'result is non-null');
    assert.strictEqual(result.packageDir, tmp);
    assert.strictEqual(result.prefix, '');
  });

  test('no root pubspec, flutter/pubspec.yaml (Flutter) present → resolves to flutter/, prefix "flutter"', () => {
    const tmp = makeTmpDir();
    writePubspec(path.join(tmp, 'flutter'), FLUTTER_PUBSPEC);

    const result = resolveFlutterPackageDir(tmp);
    assert.ok(result, 'result is non-null');
    assert.strictEqual(result.packageDir, path.join(tmp, 'flutter'));
    assert.strictEqual(result.pubspecPath, path.join(tmp, 'flutter', 'pubspec.yaml'));
    assert.strictEqual(result.prefix, 'flutter');
  });

  test('non-Flutter root pubspec + Flutter flutter/pubspec.yaml → resolves to flutter/ (monorepo case)', () => {
    const tmp = makeTmpDir();
    writePubspec(tmp, NON_FLUTTER_PUBSPEC);
    writePubspec(path.join(tmp, 'flutter'), FLUTTER_PUBSPEC);

    const result = resolveFlutterPackageDir(tmp);
    assert.ok(result, 'result is non-null');
    assert.strictEqual(result.packageDir, path.join(tmp, 'flutter'));
    assert.strictEqual(result.prefix, 'flutter');
  });

  test('neither root nor flutter/ has a Flutter pubspec → null', () => {
    const tmp = makeTmpDir();
    writePubspec(tmp, NON_FLUTTER_PUBSPEC);

    const result = resolveFlutterPackageDir(tmp);
    assert.strictEqual(result, null);
  });

  test('no pubspec anywhere → null', () => {
    const tmp = makeTmpDir();
    const result = resolveFlutterPackageDir(tmp);
    assert.strictEqual(result, null);
  });

  test('projectDir falsy → null', () => {
    assert.strictEqual(resolveFlutterPackageDir(''), null);
    assert.strictEqual(resolveFlutterPackageDir(undefined), null);
  });
});
