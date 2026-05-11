'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { scaffold, expand, SUPPORTED_AREAS } = require('./scaffold.js');

const TEMPLATE_ROOT = path.resolve(__dirname, '..', '..', '..', 'templates', 'monorepo-scaffold');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-')); }

test('expand replaces known tokens, leaves unknown intact', () => {
  const out = expand('hello {{NAME}} from {{OTHER}}', { NAME: 'world' });
  assert.strictEqual(out, 'hello world from {{OTHER}}');
});

test('scaffold: stamps full layout with all areas', () => {
  const target = tmp();
  const res = scaffold({
    templateRoot: TEMPLATE_ROOT,
    target,
    productName: 'Test Product',
    productSlug: 'test-product',
    description: 'A test product',
    areas: ['go', 'flutter', 'admin', 'proto']
  });
  assert.ok(res.written.length > 0);
  // Root files
  assert.ok(fs.existsSync(path.join(target, 'CLAUDE.md')));
  assert.ok(fs.existsSync(path.join(target, 'README.md')));
  assert.ok(fs.existsSync(path.join(target, '.gitignore')));
  assert.ok(fs.existsSync(path.join(target, '.devflow', 'no-binaries.yml')));
  // Workflows
  for (const a of ['go', 'flutter', 'admin', 'proto']) {
    assert.ok(
      fs.existsSync(path.join(target, '.github', 'workflows', `${a}.yml`)),
      `${a}.yml should exist`
    );
  }
  assert.ok(fs.existsSync(path.join(target, '.github', 'workflows', 'monorepo-doctor.yml')));
  // Area CLAUDE.md
  for (const a of ['go', 'flutter', 'admin', 'proto']) {
    assert.ok(
      fs.existsSync(path.join(target, a, 'CLAUDE.md')),
      `${a}/CLAUDE.md should exist`
    );
  }
});

test('scaffold: token expansion populates PRODUCT_NAME', () => {
  const target = tmp();
  scaffold({
    templateRoot: TEMPLATE_ROOT,
    target,
    productName: 'Eden Biz',
    productSlug: 'eden-biz',
    description: 'Eden ops',
    areas: ['go']
  });
  const root = fs.readFileSync(path.join(target, 'CLAUDE.md'), 'utf8');
  assert.match(root, /Eden Biz/);
  assert.match(root, /Eden ops/);
  const readme = fs.readFileSync(path.join(target, 'README.md'), 'utf8');
  assert.match(readme, /Eden Biz/);
  assert.match(readme, /eden-biz/);
});

test('scaffold: areas filter omits unrelated workflows + CLAUDE.md', () => {
  const target = tmp();
  scaffold({
    templateRoot: TEMPLATE_ROOT,
    target,
    productName: 'Mini',
    productSlug: 'mini',
    areas: ['go', 'proto']
  });
  assert.ok(fs.existsSync(path.join(target, 'go', 'CLAUDE.md')));
  assert.ok(fs.existsSync(path.join(target, 'proto', 'CLAUDE.md')));
  assert.ok(!fs.existsSync(path.join(target, 'flutter', 'CLAUDE.md')));
  assert.ok(!fs.existsSync(path.join(target, 'admin', 'CLAUDE.md')));
  assert.ok(fs.existsSync(path.join(target, '.github', 'workflows', 'go.yml')));
  assert.ok(!fs.existsSync(path.join(target, '.github', 'workflows', 'flutter.yml')));
  assert.ok(!fs.existsSync(path.join(target, '.github', 'workflows', 'admin.yml')));
  // monorepo-doctor always present
  assert.ok(fs.existsSync(path.join(target, '.github', 'workflows', 'monorepo-doctor.yml')));
});

test('scaffold: rejects unsupported areas', () => {
  const target = tmp();
  assert.throws(() => scaffold({
    templateRoot: TEMPLATE_ROOT,
    target,
    productName: 'x', productSlug: 'x',
    areas: ['bogus-area']
  }), /unsupported area/);
});

test('scaffold: does not overwrite existing files without --force', () => {
  const target = tmp();
  fs.writeFileSync(path.join(target, 'CLAUDE.md'), '# pre-existing\n');
  const res = scaffold({
    templateRoot: TEMPLATE_ROOT,
    target,
    productName: 'x', productSlug: 'x',
    areas: ['go']
  });
  assert.ok(res.skipped.some((p) => p.endsWith('CLAUDE.md')));
  const content = fs.readFileSync(path.join(target, 'CLAUDE.md'), 'utf8');
  assert.strictEqual(content, '# pre-existing\n');
});

test('scaffold: force overwrites existing files', () => {
  const target = tmp();
  fs.writeFileSync(path.join(target, 'CLAUDE.md'), '# pre-existing\n');
  scaffold({
    templateRoot: TEMPLATE_ROOT,
    target, productName: 'x', productSlug: 'x',
    areas: ['go'], force: true
  });
  const content = fs.readFileSync(path.join(target, 'CLAUDE.md'), 'utf8');
  assert.match(content, /Layout/);
});

test('scaffold: result passes monorepo-doctor audit', () => {
  const target = tmp();
  scaffold({
    templateRoot: TEMPLATE_ROOT,
    target,
    productName: 'Doctor Test',
    productSlug: 'doctor-test',
    description: 'verify the template self-validates',
    areas: ['go', 'flutter', 'admin', 'proto']
  });
  // Need to delete the leftover "areas/" or anything that would look
  // undeclared. Currently the template only writes recognised dirs.
  const { audit } = require('../../monorepo-doctor/lib/doctor.js');
  const r = audit(target);
  // The scaffold writes assets/ via no scaffold? No — it doesn't.
  // .github / .devflow are in ALWAYS_IGNORE_TOPLEVEL.
  assert.strictEqual(r.hasClaudeMd, true);
  assert.deepStrictEqual(r.layoutMissing, []);
  assert.deepStrictEqual(r.missingAreaClaudeMd, []);
  assert.deepStrictEqual(r.layoutUndeclared, []);
  assert.deepStrictEqual(r.binaries, []);
  assert.strictEqual(r.ok, true, `scaffold should self-validate, got: ${JSON.stringify(r, null, 2)}`);
});

test('SUPPORTED_AREAS is the documented set', () => {
  assert.deepStrictEqual(SUPPORTED_AREAS.sort(), ['admin', 'flutter', 'go', 'proto']);
});
