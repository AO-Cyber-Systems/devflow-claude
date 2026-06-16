/**
 * Tests for hooks/lib/edit-override.js
 *
 * Covers:
 *   1. hasOverridePhrase — 4 phrases + null/undefined/empty/non-matching
 *   2. writeEditOverrideMarker — creates file; false for null planningDir; no-throw
 *   3. consumeEditOverrideMarker — fresh marker → true + deleted
 *   4. consumeEditOverrideMarker — stale marker → false + deleted
 *   5. consumeEditOverrideMarker — missing marker → false; null → false
 *   6. OVERRIDE_PHRASES is exactly ['skip devflow','just edit','bypass devflow','force edit']
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  OVERRIDE_PHRASES,
  EDIT_OVERRIDE_TTL_MS,
  hasOverridePhrase,
  writeEditOverrideMarker,
  consumeEditOverrideMarker,
  editOverrideMarkerPath,
} = require('./edit-override.js');

// ---------------------------------------------------------------------------
// Test 6: OVERRIDE_PHRASES exact contents
// ---------------------------------------------------------------------------

describe('OVERRIDE_PHRASES — exact array contents', () => {
  test('is exactly the 4 canonical phrases in order', () => {
    assert.deepStrictEqual(OVERRIDE_PHRASES, [
      'skip devflow',
      'just edit',
      'bypass devflow',
      'force edit',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Test 1: hasOverridePhrase — phrase detection + null safety
// ---------------------------------------------------------------------------

describe('hasOverridePhrase — phrase detection', () => {
  for (const phrase of ['skip devflow', 'just edit', 'bypass devflow', 'force edit']) {
    test(`detects "${phrase}" case-insensitively (lowercase)`, () => {
      assert.equal(hasOverridePhrase(`please ${phrase} the file`), true);
    });
    test(`detects "${phrase.toUpperCase()}" (uppercase)`, () => {
      assert.equal(hasOverridePhrase(phrase.toUpperCase()), true);
    });
    test(`detects mixed-case "${phrase}"`, () => {
      const mixed = phrase.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c).join('');
      assert.equal(hasOverridePhrase(mixed), true);
    });
  }

  test('returns false for null', () => {
    assert.equal(hasOverridePhrase(null), false);
  });
  test('returns false for undefined', () => {
    assert.equal(hasOverridePhrase(undefined), false);
  });
  test('returns false for empty string', () => {
    assert.equal(hasOverridePhrase(''), false);
  });
  test('returns false for non-matching: "skip this check"', () => {
    assert.equal(hasOverridePhrase('skip this check'), false);
  });
  test('returns false for non-matching: "edit this file for me"', () => {
    assert.equal(hasOverridePhrase('edit this file for me'), false);
  });
});

// ---------------------------------------------------------------------------
// Test 2: writeEditOverrideMarker
// ---------------------------------------------------------------------------

describe('writeEditOverrideMarker', () => {
  test('creates .edit-override file in planningDir', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-override-write-'));
    try {
      const result = writeEditOverrideMarker(tmp);
      assert.equal(result, true);
      const markerPath = path.join(tmp, '.edit-override');
      assert.ok(fs.existsSync(markerPath), 'marker file should exist');
      const contents = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      assert.ok(typeof contents.created_at === 'string', 'should have created_at string');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('returns false and does not throw for null planningDir', () => {
    assert.doesNotThrow(() => {
      const result = writeEditOverrideMarker(null);
      assert.equal(result, false);
    });
  });

  test('returns false and does not throw for undefined planningDir', () => {
    assert.doesNotThrow(() => {
      const result = writeEditOverrideMarker(undefined);
      assert.equal(result, false);
    });
  });
});

// ---------------------------------------------------------------------------
// Test 3: consumeEditOverrideMarker — fresh marker → true + deleted
// ---------------------------------------------------------------------------

describe('consumeEditOverrideMarker — fresh marker', () => {
  test('returns true and deletes the marker file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-override-consume-fresh-'));
    try {
      const markerPath = path.join(tmp, '.edit-override');
      fs.writeFileSync(markerPath, JSON.stringify({ created_at: new Date().toISOString() }));
      const nowMs = Date.now();
      const result = consumeEditOverrideMarker(tmp, nowMs);
      assert.equal(result, true);
      assert.equal(fs.existsSync(markerPath), false, 'marker should be deleted');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('returns true when marker mtime is exactly at TTL boundary (0ms old)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-override-boundary-'));
    try {
      const markerPath = path.join(tmp, '.edit-override');
      fs.writeFileSync(markerPath, JSON.stringify({ created_at: new Date().toISOString() }));
      const stat = fs.statSync(markerPath);
      // nowMs == mtimeMs → age is 0 → 0 <= TTL → fresh
      const result = consumeEditOverrideMarker(tmp, stat.mtimeMs);
      assert.equal(result, true);
      assert.equal(fs.existsSync(markerPath), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Test 4: consumeEditOverrideMarker — stale marker (mtime backdated past TTL) → false + deleted
// ---------------------------------------------------------------------------

describe('consumeEditOverrideMarker — stale marker', () => {
  test('returns false and deletes stale marker (backdated 10 min, TTL 5 min)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-override-stale-'));
    try {
      const markerPath = path.join(tmp, '.edit-override');
      fs.writeFileSync(markerPath, JSON.stringify({ created_at: new Date().toISOString() }));
      // Backdate mtime to 10 minutes ago
      const tenMinAgo = (Date.now() - 10 * 60 * 1000) / 1000;
      fs.utimesSync(markerPath, tenMinAgo, tenMinAgo);
      const nowMs = Date.now();
      const result = consumeEditOverrideMarker(tmp, nowMs);
      assert.equal(result, false);
      assert.equal(fs.existsSync(markerPath), false, 'stale marker should also be deleted');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Test 5: consumeEditOverrideMarker — missing / null
// ---------------------------------------------------------------------------

describe('consumeEditOverrideMarker — missing marker', () => {
  test('returns false when no marker file exists', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-override-missing-'));
    try {
      const result = consumeEditOverrideMarker(tmp);
      assert.equal(result, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('returns false for null planningDir (no throw)', () => {
    assert.doesNotThrow(() => {
      const result = consumeEditOverrideMarker(null);
      assert.equal(result, false);
    });
  });

  test('returns false for undefined planningDir (no throw)', () => {
    assert.doesNotThrow(() => {
      const result = consumeEditOverrideMarker(undefined);
      assert.equal(result, false);
    });
  });
});

// ---------------------------------------------------------------------------
// editOverrideMarkerPath helper
// ---------------------------------------------------------------------------

describe('editOverrideMarkerPath', () => {
  test('returns path.join(planningDir, ".edit-override")', () => {
    assert.equal(editOverrideMarkerPath('/proj/.planning'), '/proj/.planning/.edit-override');
  });
});

// ---------------------------------------------------------------------------
// EDIT_OVERRIDE_TTL_MS constant
// ---------------------------------------------------------------------------

describe('EDIT_OVERRIDE_TTL_MS', () => {
  test('is 5 minutes in ms', () => {
    assert.equal(EDIT_OVERRIDE_TTL_MS, 5 * 60 * 1000);
  });
});
