'use strict';
const test = require('node:test');
const assert = require('node:assert');
const pm = require('./pm-backend.cjs');

test('getBackend — defaults to github when projectConfig is null', () => {
  const b = pm.getBackend(null);
  assert.strictEqual(typeof b.resolveChain, 'function');
  assert.strictEqual(typeof b.syncObjective, 'function');
  assert.strictEqual(typeof b.addToProject, 'function');
  assert.strictEqual(typeof b.linkSubIssue, 'function');
});

test('getBackend — defaults to github when pm.backend is unset', () => {
  const b = pm.getBackend({});
  assert.strictEqual(typeof b.resolveChain, 'function');
});

test('getBackend — explicit github returns gh.cjs module', () => {
  const b = pm.getBackend({ pm: { backend: 'github' } });
  // Verify it's the same module — has the canonical exports
  assert.strictEqual(typeof b.resolveChain, 'function');
  assert.strictEqual(typeof b.requireGhAuth, 'function');
  assert.strictEqual(typeof b.cmdGhResolve, 'function');
});

test('getBackend — linear throws with v1.2+ message', () => {
  assert.throws(() => pm.getBackend({ pm: { backend: 'linear' } }), /v1\.2/);
});

test('getBackend — jira throws with v1.2+ message', () => {
  assert.throws(() => pm.getBackend({ pm: { backend: 'jira' } }), /v1\.2/);
});

test('getBackend — unknown backend throws with name in message', () => {
  assert.throws(() => pm.getBackend({ pm: { backend: 'gitlab' } }), /gitlab/);
});

test('VALID_BACKENDS — v1.1 has only github', () => {
  assert.deepStrictEqual(pm.VALID_BACKENDS, ['github']);
});
