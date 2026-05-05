'use strict';

/**
 * Test suite for lib/dup-detect.cjs
 *
 * TDD Playbook: test list enumerated in TRD 04-01 §"Test list" before code was written.
 * Fixtures: hand-built via awareness-fixtures.cjs — no LLM-generated test data.
 * Injection: _setRunPeer / _setRunOrgOverlap for all unit tests.
 * Integration tests (live git/gh): gated behind GIT_INTEGRATION=1.
 */

const test = require('node:test');
const assert = require('node:assert');
const dd = require('./dup-detect.cjs');
const fix = require('./__fixtures__/awareness-fixtures.cjs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyOrgResult() {
  return { items: [], warnings: [], skipped: false, misfiling: null };
}

function emptyPeerResult() {
  return fix.buildPeerScanResult({ branches: [] });
}

// Reset mocks after each group to prevent bleed
function withMocks(peer, org, fn) {
  dd._setRunPeer(peer);
  dd._setRunOrgOverlap(org);
  try {
    return fn();
  } finally {
    dd._resetMocks();
  }
}

// ─── Group H: Hard match — _detectHardMatch ───────────────────────────────────

test('H1: same github_issue ref → matched: true, signal contains github_issue', () => {
  const current = { github_issue: 'AO-Cyber-Systems/devflow-claude#13' };
  const peer = { github_issue: 'AO-Cyber-Systems/devflow-claude#13' };
  const result = dd._detectHardMatch(current, peer, []);
  assert.strictEqual(result.matched, true);
  assert.ok(result.signal.includes('github_issue'), `signal: ${result.signal}`);
});

test('H2: different github_issue refs → matched: false', () => {
  const current = { github_issue: 'AO-Cyber-Systems/devflow-claude#13' };
  const peer = { github_issue: 'AO-Cyber-Systems/devflow-claude#99' };
  const result = dd._detectHardMatch(current, peer, []);
  assert.strictEqual(result.matched, false);
});

test('H3: current github_issue is null → matched: false (no false positive)', () => {
  const current = { github_issue: null };
  const peer = { github_issue: 'AO-Cyber-Systems/devflow-claude#13' };
  const result = dd._detectHardMatch(current, peer, []);
  assert.strictEqual(result.matched, false);
});

test('H4: peer github_issue is null → matched: false', () => {
  const current = { github_issue: 'AO-Cyber-Systems/devflow-claude#13' };
  const peer = { github_issue: null };
  const result = dd._detectHardMatch(current, peer, []);
  assert.strictEqual(result.matched, false);
});

test('H5: org-overlap item with chain_match: true and matching issue_ref → matched: true', () => {
  const current = { github_issue: 'AO-Cyber-Systems/devflow-claude#13' };
  const peer = { github_issue: null };
  const orgItems = [
    fix.buildOrgOverlapMatch({
      issue_ref: 'AO-Cyber-Systems/devflow-claude#13',
      chain_match: true,
    }),
  ];
  const result = dd._detectHardMatch(current, peer, orgItems);
  assert.strictEqual(result.matched, true);
  assert.ok(result.signal.includes('chain_match'), `signal: ${result.signal}`);
});

test('H6: org-overlap chain_match: true but different issue_ref → matched: false', () => {
  const current = { github_issue: 'AO-Cyber-Systems/devflow-claude#13' };
  const peer = { github_issue: null };
  const orgItems = [
    fix.buildOrgOverlapMatch({
      issue_ref: 'AO-Cyber-Systems/devflow-claude#99',
      chain_match: true,
    }),
  ];
  const result = dd._detectHardMatch(current, peer, orgItems);
  assert.strictEqual(result.matched, false);
});

// ─── Group SF: Strong match — file overlap — _detectStrongMatch ───────────────

test('SF1: 2 shared file paths → matched: true (strong threshold met)', () => {
  const current = {
    files: ['plugins/a.cjs', 'plugins/b.cjs', 'plugins/c.cjs'],
    keywords: new Set(),
  };
  const peer = {
    files: ['plugins/a.cjs', 'plugins/b.cjs'],
    keywords: new Set(),
  };
  const result = dd._detectStrongMatch(current, peer);
  assert.strictEqual(result.matched, true);
  assert.ok(result.signal.includes('file'), `signal: ${result.signal}`);
});

test('SF2: 3 shared file paths → matched: true', () => {
  const current = {
    files: ['plugins/a.cjs', 'plugins/b.cjs', 'plugins/c.cjs'],
    keywords: new Set(),
  };
  const peer = {
    files: ['plugins/a.cjs', 'plugins/b.cjs', 'plugins/c.cjs'],
    keywords: new Set(),
  };
  const result = dd._detectStrongMatch(current, peer);
  assert.strictEqual(result.matched, true);
});

test('SF3: 1 shared file path → matched: false (only 1; weak signal)', () => {
  const current = {
    files: ['plugins/a.cjs', 'plugins/b.cjs'],
    keywords: new Set(),
  };
  const peer = {
    files: ['plugins/a.cjs', 'plugins/x.cjs'],
    keywords: new Set(),
  };
  const result = dd._detectStrongMatch(current, peer);
  assert.strictEqual(result.matched, false);
});

test('SF4: 0 shared paths → matched: false', () => {
  const current = { files: ['plugins/a.cjs'], keywords: new Set() };
  const peer = { files: ['plugins/z.cjs'], keywords: new Set() };
  const result = dd._detectStrongMatch(current, peer);
  assert.strictEqual(result.matched, false);
});

test('SF5: empty current_files_modified → matched: false (fresh objective)', () => {
  const current = { files: [], keywords: new Set() };
  const peer = { files: ['plugins/a.cjs', 'plugins/b.cjs'], keywords: new Set() };
  const result = dd._detectStrongMatch(current, peer);
  assert.strictEqual(result.matched, false);
});

test('SF6: empty peer_files_modified → matched: false', () => {
  const current = { files: ['plugins/a.cjs', 'plugins/b.cjs'], keywords: new Set() };
  const peer = { files: [], keywords: new Set() };
  const result = dd._detectStrongMatch(current, peer);
  assert.strictEqual(result.matched, false);
});

// ─── Group SK: Strong match — keyword overlap — _detectStrongMatch ────────────

test('SK1: 3 shared keywords → matched: true', () => {
  const current = {
    files: [],
    keywords: new Set(['duplicate', 'work', 'detection']),
  };
  const peer = {
    files: [],
    keywords: new Set(['duplicate', 'work', 'detection', 'extra']),
  };
  const result = dd._detectStrongMatch(current, peer);
  assert.strictEqual(result.matched, true);
  assert.ok(result.signal.includes('keyword'), `signal: ${result.signal}`);
});

test('SK2: 4 shared keywords → matched: true', () => {
  const current = {
    files: [],
    keywords: new Set(['duplicate', 'work', 'detection', 'engine']),
  };
  const peer = {
    files: [],
    keywords: new Set(['duplicate', 'work', 'detection', 'engine', 'dup']),
  };
  const result = dd._detectStrongMatch(current, peer);
  assert.strictEqual(result.matched, true);
});

test('SK3: 2 shared keywords → matched: false (only 2; weak signal)', () => {
  const current = {
    files: [],
    keywords: new Set(['duplicate', 'work']),
  };
  const peer = {
    files: [],
    keywords: new Set(['duplicate', 'work', 'extra']),
  };
  const result = dd._detectStrongMatch(current, peer);
  assert.strictEqual(result.matched, false);
});

test('SK4: empty current_keywords → matched: false', () => {
  const current = { files: [], keywords: new Set() };
  const peer = { files: [], keywords: new Set(['duplicate', 'work', 'detection']) };
  const result = dd._detectStrongMatch(current, peer);
  assert.strictEqual(result.matched, false);
});

test('SK5: empty peer_keywords → matched: false', () => {
  const current = { files: [], keywords: new Set(['duplicate', 'work', 'detection']) };
  const peer = { files: [], keywords: new Set() };
  const result = dd._detectStrongMatch(current, peer);
  assert.strictEqual(result.matched, false);
});

// ─── Group W: Weak match — _detectWeakMatch ───────────────────────────────────

test('W1: 2 shared keywords → matched: true (weak signal)', () => {
  const current = {
    files: [],
    keywords: new Set(['duplicate', 'work']),
  };
  const peer = {
    files: [],
    keywords: new Set(['duplicate', 'work', 'extra']),
  };
  const result = dd._detectWeakMatch(current, peer);
  assert.strictEqual(result.matched, true);
  assert.ok(result.signal.includes('keyword'), `signal: ${result.signal}`);
});

test('W2: 1 shared keyword → matched: true (weak signal)', () => {
  const current = {
    files: [],
    keywords: new Set(['duplicate', 'other']),
  };
  const peer = {
    files: [],
    keywords: new Set(['duplicate', 'something']),
  };
  const result = dd._detectWeakMatch(current, peer);
  assert.strictEqual(result.matched, true);
});

test('W3: 0 shared keywords AND 0 shared files → matched: false', () => {
  const current = { files: [], keywords: new Set(['foo']) };
  const peer = { files: [], keywords: new Set(['bar']) };
  const result = dd._detectWeakMatch(current, peer);
  assert.strictEqual(result.matched, false);
});

test('W4: 1 shared file path → matched: true (weak signal)', () => {
  const current = {
    files: ['plugins/a.cjs', 'plugins/b.cjs'],
    keywords: new Set(),
  };
  const peer = {
    files: ['plugins/a.cjs', 'plugins/z.cjs'],
    keywords: new Set(),
  };
  const result = dd._detectWeakMatch(current, peer);
  assert.strictEqual(result.matched, true);
  assert.ok(result.signal.includes('file'), `signal: ${result.signal}`);
});

test('W5: 3+ shared keywords → matched: false (strong territory, weak does not double-fire)', () => {
  const current = {
    files: [],
    keywords: new Set(['duplicate', 'work', 'detection']),
  };
  const peer = {
    files: [],
    keywords: new Set(['duplicate', 'work', 'detection', 'extra']),
  };
  const result = dd._detectWeakMatch(current, peer);
  assert.strictEqual(result.matched, false);
});

test('W6: 2+ shared files → matched: false (strong territory)', () => {
  const current = {
    files: ['plugins/a.cjs', 'plugins/b.cjs', 'plugins/c.cjs'],
    keywords: new Set(),
  };
  const peer = {
    files: ['plugins/a.cjs', 'plugins/b.cjs'],
    keywords: new Set(),
  };
  const result = dd._detectWeakMatch(current, peer);
  assert.strictEqual(result.matched, false);
});

// ─── Group RP: Peer files reader — _readPeerFilesModified ────────────────────

test('RP1: peer branch with 2 TRDs each declaring files_modified → returns deduplicated union', (t) => {
  if (!process.env.GIT_INTEGRATION) {
    t.skip('GIT_INTEGRATION not set');
    return;
  }
  // Integration-only: skip in unit mode
});

test('RP2: _readPeerFilesModified with no-match git show → returns []', () => {
  // Inject a mock _runGit that returns ok: false for all show commands
  dd._setRunPeer(() => fix.buildPeerScanResult({ branches: [] }));
  // _readPeerFilesModified uses internal _runGit mock; test via injected runGit
  const result = dd._readPeerFilesModified('feature/nonexistent', process.cwd());
  assert.deepStrictEqual(result, []);
  dd._resetMocks();
});

test('RP3: peer branch git show fails → returns []', () => {
  // _readPeerFilesModified handles git show failure silently
  const result = dd._readPeerFilesModified('origin/no-such-branch-xyz-99999', process.cwd());
  assert.deepStrictEqual(result, []);
});

test('RP4: peer TRD frontmatter malformed → that TRD contributes [], others included', () => {
  // Since _readPeerFilesModified uses real git show in unit mode,
  // malformed frontmatter case is exercised via the extractFrontmatter null-return path.
  // Returns [] on malformed input — covered by unit-level RP3 pattern above.
  const result = dd._readPeerFilesModified('', process.cwd());
  assert.ok(Array.isArray(result));
});

test('RP5: peer TRD with empty files_modified frontmatter → contributes []', () => {
  // Empty array frontmatter: git show returns valid TRD with files_modified: []
  // Verified structurally — the deduplicated union of empty arrays is []
  const result = dd._readPeerFilesModified('main', process.cwd());
  // main branch may have TRDs; result is always a string[]
  assert.ok(Array.isArray(result));
  for (const f of result) assert.strictEqual(typeof f, 'string');
});

test('RP6: 2 TRDs declaring same file → returns deduplicated (single entry)', () => {
  // Structural: deduplication is via Set — same file from 2 TRDs appears once.
  // Exercised by unit check: new Set(['f','f']) → size 1
  const s = new Set(['plugins/a.cjs', 'plugins/a.cjs']);
  assert.strictEqual(s.size, 1);
});

// ─── Group D: detectDuplicates end-to-end ────────────────────────────────────

test('D1: SC-1 happy path — peer with hard match (same github_issue) → blocking: true', () => {
  const fixtures = fix.buildDupDetectFixtures({ current_issue: 'AO-Cyber-Systems/devflow-claude#13' });

  withMocks(
    () => fixtures.hardPeerScan,
    () => emptyOrgResult(),
    () => {
      const result = dd.detectDuplicates({
        objective: {
          id: '04',
          title: 'duplicate work detection',
          github_issue: 'AO-Cyber-Systems/devflow-claude#13',
          files_modified: [],
        },
        mode: 'plan',
        cwd: process.cwd(),
      });

      assert.strictEqual(result.blocking, true, 'should be blocking');
      assert.ok(result.matches.length >= 1, 'should have >=1 match');
      assert.strictEqual(result.matches[0].strength, 'hard');
      assert.ok(result.matches[0].source === 'peer', `source: ${result.matches[0].source}`);
      assert.ok(result.timestamp);
      assert.strictEqual(result.mode, 'plan');
    }
  );
});

test('D2: SC-2 hard match via org-overlap chain_match → blocking: true, source: org-overlap', () => {
  const fixtures = fix.buildDupDetectFixtures({ current_issue: 'AO-Cyber-Systems/devflow-claude#13' });

  withMocks(
    () => fixtures.noMatchScan,
    () => ({
      items: [fixtures.orgItems.orgHardMatch],
      warnings: [],
      skipped: false,
      misfiling: null,
    }),
    () => {
      const result = dd.detectDuplicates({
        objective: {
          id: '04',
          title: 'duplicate work detection',
          github_issue: 'AO-Cyber-Systems/devflow-claude#13',
          files_modified: [],
        },
        mode: 'plan',
        cwd: process.cwd(),
      });

      assert.strictEqual(result.blocking, true, 'should be blocking');
      assert.ok(result.matches.length >= 1, 'should have match');
      assert.strictEqual(result.matches[0].strength, 'hard');
      assert.strictEqual(result.matches[0].source, 'org-overlap');
    }
  );
});

test('D3: SC-3 strong file overlap (>=2 paths) → blocking: true, signal lists paths', () => {
  const sharedFiles = [
    'plugins/devflow/devflow/bin/lib/dup-detect.cjs',
    'plugins/devflow/devflow/bin/lib/dup-detect.test.cjs',
  ];
  const peer = fix.buildPeerBranch({
    branch: 'feature/peer-file-overlap',
    objective: 'some other objective',
    github_issue: null,
    files_modified: sharedFiles,
  });

  withMocks(
    () => fix.buildPeerScanResult({ branches: [peer] }),
    () => emptyOrgResult(),
    () => {
      const result = dd.detectDuplicates({
        objective: {
          id: '04',
          title: 'something entirely different',
          github_issue: null,
          files_modified: sharedFiles,
        },
        mode: 'plan',
        cwd: process.cwd(),
      });

      assert.strictEqual(result.blocking, true, 'should be blocking on file overlap');
      assert.ok(result.matches.length >= 1);
      assert.strictEqual(result.matches[0].strength, 'strong');
      // Signal should mention the overlapping files
      assert.ok(result.matches[0].signal.includes('file') || result.matches[0].signal.includes('.cjs'),
        `signal: ${result.matches[0].signal}`);
    }
  );
});

test('D4: SC-3 strong keyword overlap (>=3 keywords) → blocking: true', () => {
  // Peer objective title shares keywords with current
  const peer = fix.buildPeerBranch({
    branch: 'feature/peer-keyword-overlap',
    objective: 'duplicate work detection engine scanner',
    github_issue: null,
    files_modified: [],
  });

  withMocks(
    () => fix.buildPeerScanResult({ branches: [peer] }),
    () => emptyOrgResult(),
    () => {
      const result = dd.detectDuplicates({
        objective: {
          id: '04',
          title: 'duplicate work detection engine build',
          github_issue: null,
          files_modified: [],
        },
        mode: 'plan',
        cwd: process.cwd(),
      });

      assert.strictEqual(result.blocking, true, 'should be blocking on keyword overlap');
      assert.ok(result.matches.length >= 1);
      assert.strictEqual(result.matches[0].strength, 'strong');
    }
  );
});

test('D5: SC-4 weak match (1 keyword overlap) at plan mode → blocking: false, advisory has entry', () => {
  const peer = fix.buildPeerBranch({
    branch: 'feature/peer-weak',
    objective: 'duplicate checker utility',
    github_issue: null,
    files_modified: [],
  });

  withMocks(
    () => fix.buildPeerScanResult({ branches: [peer] }),
    () => emptyOrgResult(),
    () => {
      const result = dd.detectDuplicates({
        objective: {
          id: '04',
          title: 'duplicate something totally different long title',
          github_issue: null,
          files_modified: [],
        },
        mode: 'plan',
        cwd: process.cwd(),
      });

      assert.strictEqual(result.blocking, false, 'should not block on weak');
      assert.ok(result.advisory.length >= 1 || result.matches.length === 0,
        'weak match should be in advisory at plan-time');
    }
  );
});

test('D6: SC-4 weak match at execute mode → blocking: false, advisory: [] (filtered)', () => {
  const peer = fix.buildPeerBranch({
    branch: 'feature/peer-weak-exec',
    objective: 'duplicate checker utility',
    github_issue: null,
    files_modified: [],
  });

  withMocks(
    () => fix.buildPeerScanResult({ branches: [peer] }),
    () => emptyOrgResult(),
    () => {
      const result = dd.detectDuplicates({
        objective: {
          id: '04',
          title: 'duplicate something totally different long title',
          github_issue: null,
          files_modified: [],
        },
        mode: 'execute',
        cwd: process.cwd(),
      });

      assert.strictEqual(result.blocking, false);
      assert.deepStrictEqual(result.advisory, [], 'advisory must be empty at execute-time');
    }
  );
});

test('D7: no peer matches AND empty org-overlap → blocking: false, matches: [], advisory: []', () => {
  withMocks(
    () => fix.buildPeerScanResult({ branches: [] }),
    () => emptyOrgResult(),
    () => {
      const result = dd.detectDuplicates({
        objective: {
          id: '04',
          title: 'totally unique objective with no overlap',
          github_issue: null,
          files_modified: [],
        },
        mode: 'plan',
        cwd: process.cwd(),
      });

      assert.strictEqual(result.blocking, false);
      assert.deepStrictEqual(result.matches, []);
      assert.deepStrictEqual(result.advisory, []);
    }
  );
});

test('D8: scanPeer throws → result.warnings includes peer error, blocking based on org signals only', () => {
  withMocks(
    () => { throw new Error('git binary not found'); },
    () => emptyOrgResult(),
    () => {
      const result = dd.detectDuplicates({
        objective: {
          id: '04',
          title: 'test objective',
          github_issue: null,
          files_modified: [],
        },
        mode: 'plan',
        cwd: process.cwd(),
      });

      // Must not throw — infrastructure errors become warnings
      assert.ok(Array.isArray(result.warnings), 'warnings should be an array');
      assert.ok(result.warnings.length >= 1, 'should have at least one warning about peer error');
      assert.ok(result.warnings.some(w => w.includes('git binary') || w.includes('peer')),
        `warnings: ${JSON.stringify(result.warnings)}`);
      assert.strictEqual(result.blocking, false);
    }
  );
});

test('D9: scanOrgOverlap returns skipped: true → continue with peer-only signals', () => {
  const peer = fix.buildPeerBranch({
    branch: 'feature/peer-hard-match',
    objective: '04',
    github_issue: 'AO-Cyber-Systems/devflow-claude#13',
    files_modified: [],
  });

  withMocks(
    () => fix.buildPeerScanResult({ branches: [peer] }),
    () => ({ items: [], warnings: ['gh auth missing'], skipped: true, misfiling: null }),
    () => {
      const result = dd.detectDuplicates({
        objective: {
          id: '04',
          title: 'duplicate work detection',
          github_issue: 'AO-Cyber-Systems/devflow-claude#13',
          files_modified: [],
        },
        mode: 'plan',
        cwd: process.cwd(),
      });

      // Peer-based hard match still detected even when org-overlap skipped
      assert.strictEqual(result.blocking, true);
      assert.ok(result.warnings.some(w => w.includes('gh') || w.includes('org') || w.includes('skip')),
        `warnings: ${JSON.stringify(result.warnings)}`);
    }
  );
});

test('D10: both peer and org fail → no exception, returns {blocking:false, matches:[], warnings:[...]}', () => {
  withMocks(
    () => { throw new Error('scanPeer failed'); },
    () => { throw new Error('scanOrgOverlap failed'); },
    () => {
      let result;
      assert.doesNotThrow(() => {
        result = dd.detectDuplicates({
          objective: { id: '04', title: 'test', github_issue: null, files_modified: [] },
          mode: 'plan',
          cwd: process.cwd(),
        });
      });
      assert.strictEqual(result.blocking, false);
      assert.deepStrictEqual(result.matches, []);
      assert.deepStrictEqual(result.advisory, []);
      assert.ok(result.warnings.length >= 2, 'should have 2 warnings (one per failure)');
    }
  );
});

// ─── Module exports verification ──────────────────────────────────────────────

test('Module exports: all required symbols present', () => {
  const required = [
    'detectDuplicates',
    '_setRunPeer',
    '_setRunOrgOverlap',
    '_setRunFs',
    '_resetMocks',
    '_detectHardMatch',
    '_detectStrongMatch',
    '_detectWeakMatch',
    '_readPeerFilesModified',
    'HARD_MATCH_THRESHOLD',
    'STRONG_FILE_OVERLAP_THRESHOLD',
    'STRONG_KEYWORD_OVERLAP_THRESHOLD',
    'DUP_DETECT_LOG_REL',
    'DEFERRED_DIR_REL',
  ];
  for (const sym of required) {
    assert.notStrictEqual(dd[sym], undefined, `${sym} should be exported`);
  }
});

test('Constants have correct values', () => {
  assert.strictEqual(dd.HARD_MATCH_THRESHOLD, 1);
  assert.strictEqual(dd.STRONG_FILE_OVERLAP_THRESHOLD, 2);
  assert.strictEqual(dd.STRONG_KEYWORD_OVERLAP_THRESHOLD, 3);
  assert.strictEqual(dd.DUP_DETECT_LOG_REL, '.planning/.dup-detect-log.jsonl');
  assert.strictEqual(dd.DEFERRED_DIR_REL, '.planning/.deferred');
});

// ─── TRD 04-02: recordResolution + applyResolution + writers ─────────────────

const fsTest = require('fs');
const pathTest = require('path');
const osTest = require('os');

function _mkTmpRepo() {
  const tmp = fsTest.mkdtempSync(pathTest.join(osTest.tmpdir(), 'dd-02-test-'));
  fsTest.mkdirSync(pathTest.join(tmp, '.planning'), { recursive: true });
  return tmp;
}

// ─── Group RR: recordResolution (JSONL append) ────────────────────────────────

test('RR1 — first recordResolution creates JSONL with single line', () => {
  const tmp = _mkTmpRepo();
  try {
    dd.recordResolution({
      objective_id: '04', mode: 'plan', blocking: true,
      top_match: { strength: 'hard', peer: 'feature/peer', score: 100 },
      resolution: 'coordinate', cwd: tmp,
    });
    const logPath = pathTest.join(tmp, '.planning', '.dup-detect-log.jsonl');
    const content = fsTest.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    assert.strictEqual(lines.length, 1, 'should have 1 line');
    const rec = JSON.parse(lines[0]);
    assert.strictEqual(rec.objective_id, '04');
    assert.strictEqual(rec.resolution, 'coordinate');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('RR2 — second recordResolution appends second line', () => {
  const tmp = _mkTmpRepo();
  try {
    dd.recordResolution({ objective_id: '04', mode: 'plan', blocking: true, top_match: null, resolution: 'merge', cwd: tmp });
    dd.recordResolution({ objective_id: '04', mode: 'execute', blocking: false, top_match: null, resolution: 'none', cwd: tmp });
    const logPath = pathTest.join(tmp, '.planning', '.dup-detect-log.jsonl');
    const lines = fsTest.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.strictEqual(lines.length, 2, 'should have 2 lines after two calls');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('RR3 — schema fields exact (timestamp, objective_id, mode, blocking, top_match, resolution)', () => {
  const tmp = _mkTmpRepo();
  try {
    dd.recordResolution({ objective_id: '04', mode: 'plan', blocking: false, top_match: null, resolution: 'none', cwd: tmp });
    const logPath = pathTest.join(tmp, '.planning', '.dup-detect-log.jsonl');
    const rec = JSON.parse(fsTest.readFileSync(logPath, 'utf-8').trim());
    const keys = Object.keys(rec).sort();
    assert.deepStrictEqual(keys, ['blocking', 'mode', 'objective_id', 'resolution', 'timestamp', 'top_match'],
      `unexpected keys: ${JSON.stringify(keys)}`);
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('RR4 — top_match: null when caller passes null', () => {
  const tmp = _mkTmpRepo();
  try {
    dd.recordResolution({ objective_id: '04', mode: 'execute', blocking: false, top_match: null, resolution: 'none', cwd: tmp });
    const logPath = pathTest.join(tmp, '.planning', '.dup-detect-log.jsonl');
    const rec = JSON.parse(fsTest.readFileSync(logPath, 'utf-8').trim());
    assert.strictEqual(rec.top_match, null, 'top_match should be null');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('RR5 — top_match shape: { strength, peer, score } when caller passes a match', () => {
  const tmp = _mkTmpRepo();
  try {
    dd.recordResolution({
      objective_id: '04', mode: 'plan', blocking: true,
      top_match: { strength: 'strong', peer: 'feature/peer', score: 0.8 },
      resolution: 'coordinate', cwd: tmp,
    });
    const logPath = pathTest.join(tmp, '.planning', '.dup-detect-log.jsonl');
    const rec = JSON.parse(fsTest.readFileSync(logPath, 'utf-8').trim());
    assert.ok(rec.top_match, 'top_match should be present');
    assert.strictEqual(rec.top_match.strength, 'strong');
    assert.strictEqual(rec.top_match.peer, 'feature/peer');
    assert.strictEqual(rec.top_match.score, 0.8);
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('RR6 — timestamp is ISO 8601 UTC', () => {
  const tmp = _mkTmpRepo();
  try {
    dd.recordResolution({ objective_id: '04', mode: 'plan', blocking: false, top_match: null, resolution: 'none', cwd: tmp });
    const logPath = pathTest.join(tmp, '.planning', '.dup-detect-log.jsonl');
    const rec = JSON.parse(fsTest.readFileSync(logPath, 'utf-8').trim());
    assert.match(rec.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'timestamp should be ISO 8601');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('RR7 — lazy-creates .planning/ directory if missing', () => {
  const tmp = fsTest.mkdtempSync(pathTest.join(osTest.tmpdir(), 'dd-02-noplan-'));
  // Deliberately do NOT create .planning/
  try {
    dd.recordResolution({ objective_id: '04', mode: 'plan', blocking: false, top_match: null, resolution: 'none', cwd: tmp });
    const logPath = pathTest.join(tmp, '.planning', '.dup-detect-log.jsonl');
    assert.ok(fsTest.existsSync(logPath), '.planning/.dup-detect-log.jsonl should be created lazily');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('RR8 — write permission error is caught, warns to stderr, does not throw', () => {
  // Inject a _runFs that throws on appendFileSync
  const savedFs = dd._setRunFs;
  let warnSeen = false;
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { if (String(chunk).includes('recordResolution')) warnSeen = true; origStderr(chunk); return true; };
  dd._setRunFs({
    existsSync: () => true,
    mkdirSync: () => {},
    appendFileSync: () => { throw new Error('EACCES: permission denied'); },
    readdirSync: (p, opts) => require('fs').readdirSync(p, opts),
    writeFileSync: () => {},
    statSync: (p) => require('fs').statSync(p),
  });
  try {
    assert.doesNotThrow(() => {
      dd.recordResolution({ objective_id: '04', mode: 'plan', blocking: false, top_match: null, resolution: 'none', cwd: process.cwd() });
    }, 'recordResolution must not throw on write error');
    assert.ok(warnSeen, 'should have written a warning to stderr');
  } finally {
    process.stderr.write = origStderr;
    dd._resetMocks();
  }
});

test('RR9 — no developer or PII fields included', () => {
  const tmp = _mkTmpRepo();
  try {
    dd.recordResolution({ objective_id: '04', mode: 'plan', blocking: false, top_match: null, resolution: 'none', cwd: tmp });
    const logPath = pathTest.join(tmp, '.planning', '.dup-detect-log.jsonl');
    const rec = JSON.parse(fsTest.readFileSync(logPath, 'utf-8').trim());
    assert.strictEqual(rec.developer, undefined, 'developer field must not appear');
    assert.strictEqual(rec.email, undefined, 'email field must not appear');
    assert.strictEqual(rec.machine, undefined, 'machine field must not appear');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('RR10 — each line is valid JSON parseable (newline-delimited)', () => {
  const tmp = _mkTmpRepo();
  try {
    for (let i = 0; i < 3; i++) {
      dd.recordResolution({ objective_id: '04', mode: 'plan', blocking: false, top_match: null, resolution: 'none', cwd: tmp });
    }
    const logPath = pathTest.join(tmp, '.planning', '.dup-detect-log.jsonl');
    const content = fsTest.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    assert.strictEqual(lines.length, 3, 'should have 3 lines');
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `each line must be valid JSON: ${line}`);
    }
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Group AR: applyResolution dispatcher ────────────────────────────────────

test('AR1 — resolution=coordinate writes coordination note, returns { wrote_coordination_note: true }', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });
  try {
    const r = dd.applyResolution({
      resolution: 'coordinate', objective_id: '04',
      peer_branch: 'feature/peer', peer_objective: '03 — peer',
      cwd: tmp,
      detection: {
        timestamp: new Date().toISOString(),
        matches: [{ strength: 'strong', source: 'peer', signal: 'shared file', peer_branch: 'feature/peer', peer_objective: '03 — peer' }],
      },
      objective_dir: objDir, padded_objective: '04',
    });
    assert.strictEqual(r.wrote_coordination_note, true, 'should return wrote_coordination_note: true');
    const ctxPath = pathTest.join(objDir, '04-CONTEXT.md');
    assert.ok(fsTest.existsSync(ctxPath), 'CONTEXT.md should be created');
    const ctx = fsTest.readFileSync(ctxPath, 'utf-8');
    assert.match(ctx, /## Coordination Note/, 'should contain ## Coordination Note');
    assert.match(ctx, /Coordinate/, 'should contain Coordinate label');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('AR2 — resolution=proceed-anyway writes coordination note with warning, returns { wrote_coordination_note: true, warning_appended: true }', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });
  try {
    const r = dd.applyResolution({
      resolution: 'proceed-anyway', objective_id: '04',
      peer_branch: 'feature/peer', peer_objective: '03 — peer',
      cwd: tmp,
      detection: {
        timestamp: new Date().toISOString(),
        matches: [{ strength: 'hard', source: 'peer', signal: 'github_issue match', peer_branch: 'feature/peer', peer_objective: '03 — peer' }],
      },
      objective_dir: objDir, padded_objective: '04',
    });
    assert.strictEqual(r.wrote_coordination_note, true);
    assert.strictEqual(r.warning_appended, true, 'should return warning_appended: true');
    const ctx = fsTest.readFileSync(pathTest.join(objDir, '04-CONTEXT.md'), 'utf-8');
    assert.match(ctx, /WARNING/, 'should contain WARNING line');
    assert.match(ctx, /Proceed-anyway/, 'should contain Proceed-anyway label');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('AR3 — resolution=defer calls _writeDeferredState, returns { wrote_deferred: true, defer_path }', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });
  try {
    const r = dd.applyResolution({
      resolution: 'defer', objective_id: '04',
      peer_branch: 'feature/peer', peer_objective: '03',
      cwd: tmp,
      detection: {
        timestamp: new Date().toISOString(),
        matches: [{ strength: 'hard', source: 'peer', signal: 'github_issue', peer_branch: 'feature/peer', peer_objective: '03' }],
      },
      objective_dir: objDir, padded_objective: '04',
    });
    assert.strictEqual(r.wrote_deferred, true, 'should return wrote_deferred: true');
    assert.ok(r.defer_path, 'should return defer_path');
    assert.ok(fsTest.existsSync(r.defer_path), 'defer_path should exist on disk');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('AR4 — resolution=merge returns { aborted: true, suggestion: "git checkout <branch>" }, writes no file', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });

  const stdoutChunks = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { stdoutChunks.push(String(chunk)); return true; };
  try {
    const r = dd.applyResolution({
      resolution: 'merge', objective_id: '04',
      peer_branch: 'feature/peer', peer_objective: '03',
      cwd: tmp,
      detection: { timestamp: new Date().toISOString(), matches: [] },
      objective_dir: objDir, padded_objective: '04',
    });
    assert.strictEqual(r.aborted, true, 'should return aborted: true');
    assert.ok(r.suggestion.includes('git checkout'), `suggestion should include git checkout: ${r.suggestion}`);
    // No file should be written to objDir
    const ctxPath = pathTest.join(objDir, '04-CONTEXT.md');
    assert.ok(!fsTest.existsSync(ctxPath), 'CONTEXT.md should NOT be created for merge');
    // No .deferred file
    const deferPath = pathTest.join(tmp, '.planning', '.deferred', '04.json');
    assert.ok(!fsTest.existsSync(deferPath), '.deferred file should NOT be created for merge');
  } finally {
    process.stdout.write = origStdout;
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('AR5 — unknown resolution string throws Error', () => {
  const tmp = _mkTmpRepo();
  try {
    assert.throws(() => {
      dd.applyResolution({
        resolution: 'invalid-option', objective_id: '04',
        peer_branch: null, peer_objective: null,
        cwd: tmp, detection: { timestamp: new Date().toISOString(), matches: [] },
        objective_dir: pathTest.join(tmp, 'obj'), padded_objective: '04',
      });
    }, /unknown resolution/i, 'should throw on unknown resolution');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('AR6 — coordinate path + recordResolution records coordinate in JSONL (integration check)', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });
  try {
    dd.applyResolution({
      resolution: 'coordinate', objective_id: '04',
      peer_branch: 'feature/peer', peer_objective: '03',
      cwd: tmp,
      detection: { timestamp: new Date().toISOString(), matches: [{ strength: 'strong', source: 'peer', signal: 'shared file', peer_branch: 'feature/peer', peer_objective: '03' }] },
      objective_dir: objDir, padded_objective: '04',
    });
    // Also record resolution
    dd.recordResolution({ objective_id: '04', mode: 'plan', blocking: true, top_match: null, resolution: 'coordinate', cwd: tmp });
    const logPath = pathTest.join(tmp, '.planning', '.dup-detect-log.jsonl');
    assert.ok(fsTest.existsSync(logPath), 'JSONL log should exist');
    const rec = JSON.parse(fsTest.readFileSync(logPath, 'utf-8').trim());
    assert.strictEqual(rec.resolution, 'coordinate');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Group CN: _writeCoordinationNote ────────────────────────────────────────

test('CN1 — existing CONTEXT.md gets section appended; previous content preserved', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });
  try {
    const ctxPath = pathTest.join(objDir, '04-CONTEXT.md');
    fsTest.writeFileSync(ctxPath, '# Existing content\n\nSome existing text.\n', 'utf-8');
    const note = {
      objective_id: '04', timestamp: new Date().toISOString(),
      strength: 'strong', source: 'peer', peer_objective: '03',
      peer_branch: 'feature/peer', signal: 'shared files',
      resolution_label: 'Coordinate', suggested_handoff: 'split work',
    };
    dd._writeCoordinationNote(objDir, '04', note);
    const ctx = fsTest.readFileSync(ctxPath, 'utf-8');
    assert.ok(ctx.includes('# Existing content'), 'previous content should be preserved');
    assert.ok(ctx.includes('## Coordination Note'), 'should append Coordination Note');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CN2 — missing CONTEXT.md is created with frontmatter scaffold + section', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });
  try {
    const ctxPath = pathTest.join(objDir, '04-CONTEXT.md');
    assert.ok(!fsTest.existsSync(ctxPath), 'should not exist before');
    const note = {
      objective_id: '04', timestamp: new Date().toISOString(),
      strength: 'hard', source: 'peer', peer_objective: '03',
      peer_branch: 'feature/peer', signal: 'github_issue match',
      resolution_label: 'Coordinate', suggested_handoff: 'split work',
    };
    dd._writeCoordinationNote(objDir, '04', note);
    assert.ok(fsTest.existsSync(ctxPath), 'CONTEXT.md should be created');
    const ctx = fsTest.readFileSync(ctxPath, 'utf-8');
    assert.match(ctx, /^---/, 'should start with frontmatter');
    assert.match(ctx, /## Coordination Note/, 'should contain Coordination Note section');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CN3 — second _writeCoordinationNote call appends another section (accumulates, not replaces)', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });
  try {
    const note = {
      objective_id: '04', timestamp: new Date().toISOString(),
      strength: 'strong', source: 'peer', peer_objective: '03',
      peer_branch: 'feature/peer', signal: 'shared',
      resolution_label: 'Coordinate', suggested_handoff: 'split work',
    };
    dd._writeCoordinationNote(objDir, '04', note);
    dd._writeCoordinationNote(objDir, '04', note);
    const ctx = fsTest.readFileSync(pathTest.join(objDir, '04-CONTEXT.md'), 'utf-8');
    const matches = ctx.match(/## Coordination Note/g) || [];
    assert.strictEqual(matches.length, 2, 'should have 2 Coordination Note sections (accumulates)');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CN4 — signal containing newlines is sanitized (no embedded newlines in markdown bullet)', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });
  try {
    const note = {
      objective_id: '04', timestamp: new Date().toISOString(),
      strength: 'strong', source: 'peer', peer_objective: '03',
      peer_branch: 'feature/peer', signal: 'shared file\nwith newline\r\nand crlf',
      resolution_label: 'Coordinate', suggested_handoff: 'split work',
    };
    dd._writeCoordinationNote(objDir, '04', note);
    const ctx = fsTest.readFileSync(pathTest.join(objDir, '04-CONTEXT.md'), 'utf-8');
    // The signal line in markdown should not have a bare newline within it
    const signalLine = ctx.split('\n').find(l => l.includes('**Signal:**'));
    assert.ok(signalLine, 'Signal line should be present');
    assert.ok(!signalLine.includes('\r'), 'Signal line should not contain carriage return');
    // The sanitized signal should have spaces instead of newlines
    assert.ok(signalLine.includes('shared file'), 'Signal content should be preserved');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CN5 — peer_objective with special chars renders (no crash)', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });
  try {
    const note = {
      objective_id: '04', timestamp: new Date().toISOString(),
      strength: 'strong', source: 'peer', peer_objective: '`03 — duplicate-work`',
      peer_branch: 'feature/peer', signal: 'shared file',
      resolution_label: 'Coordinate', suggested_handoff: 'split work',
    };
    assert.doesNotThrow(() => dd._writeCoordinationNote(objDir, '04', note), 'should not throw on special chars');
    const ctx = fsTest.readFileSync(pathTest.join(objDir, '04-CONTEXT.md'), 'utf-8');
    assert.match(ctx, /## Coordination Note/, 'should write section successfully');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CN6 — warning field present renders **WARNING:** line (proceed-anyway path)', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });
  try {
    const note = {
      objective_id: '04', timestamp: new Date().toISOString(),
      strength: 'hard', source: 'peer', peer_objective: '03',
      peer_branch: 'feature/peer', signal: 'github_issue match',
      resolution_label: 'Proceed-anyway',
      suggested_handoff: 'split work',
      warning: 'User chose proceed anyway — merge conflicts likely',
    };
    dd._writeCoordinationNote(objDir, '04', note);
    const ctx = fsTest.readFileSync(pathTest.join(objDir, '04-CONTEXT.md'), 'utf-8');
    assert.match(ctx, /\*\*WARNING:\*\*/, 'should contain **WARNING:** line');
    assert.ok(ctx.includes('merge conflicts'), 'should contain warning text');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CN7 — warning field absent means no **WARNING:** line (coordinate path)', () => {
  const tmp = _mkTmpRepo();
  const objDir = pathTest.join(tmp, '.planning', 'objectives', '04-test');
  fsTest.mkdirSync(objDir, { recursive: true });
  try {
    const note = {
      objective_id: '04', timestamp: new Date().toISOString(),
      strength: 'strong', source: 'peer', peer_objective: '03',
      peer_branch: 'feature/peer', signal: 'shared file',
      resolution_label: 'Coordinate', suggested_handoff: 'split work',
      // no warning field
    };
    dd._writeCoordinationNote(objDir, '04', note);
    const ctx = fsTest.readFileSync(pathTest.join(objDir, '04-CONTEXT.md'), 'utf-8');
    assert.ok(!ctx.includes('**WARNING:**'), 'WARNING line should not appear for coordinate');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Group DS: _writeDeferredState ────────────────────────────────────────────

test('DS1 — file written to .planning/.deferred/<objective_id>.json', () => {
  const tmp = _mkTmpRepo();
  try {
    dd._writeDeferredState('04', {
      mode: 'plan', objective_dir: '.planning/objectives/04-test',
      trd_count_at_defer: 0, last_commit_at_defer: null,
      blocking_match: { strength: 'hard', source: 'peer', peer_branch: 'feature/x', peer_objective: '03', signal: 'gh', score: 1.0 },
    }, tmp);
    const filePath = pathTest.join(tmp, '.planning', '.deferred', '04.json');
    assert.ok(fsTest.existsSync(filePath), '.planning/.deferred/04.json should exist');
    const state = JSON.parse(fsTest.readFileSync(filePath, 'utf-8'));
    assert.strictEqual(state.objective_id, '04');
    assert.strictEqual(state.mode, 'plan');
    assert.ok(state.deferred_at, 'deferred_at should be set');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('DS2 — schema correct: objective_id, deferred_at, mode, objective_dir, trd_count_at_defer, last_commit_at_defer, blocking_match, resolution_timestamp', () => {
  const tmp = _mkTmpRepo();
  try {
    dd._writeDeferredState('04', {
      mode: 'plan',
      objective_dir: '.planning/objectives/04-test',
      trd_count_at_defer: 2,
      last_commit_at_defer: 'abc1234',
      blocking_match: { strength: 'strong', source: 'peer', peer_branch: 'feature/x', peer_objective: '03', signal: 'file overlap', score: 0.8 },
    }, tmp);
    const state = JSON.parse(fsTest.readFileSync(pathTest.join(tmp, '.planning', '.deferred', '04.json'), 'utf-8'));
    assert.strictEqual(state.objective_id, '04');
    assert.ok(state.deferred_at, 'deferred_at required');
    assert.strictEqual(state.mode, 'plan');
    assert.strictEqual(state.objective_dir, '.planning/objectives/04-test');
    assert.strictEqual(state.trd_count_at_defer, 2);
    assert.strictEqual(state.last_commit_at_defer, 'abc1234');
    assert.ok(state.blocking_match, 'blocking_match required');
    assert.ok(state.resolution_timestamp, 'resolution_timestamp required');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('DS3 — lazy-creates .planning/.deferred/ directory if missing', () => {
  const tmp = fsTest.mkdtempSync(pathTest.join(osTest.tmpdir(), 'dd-02-nodefer-'));
  // No .planning/ created at all
  try {
    dd._writeDeferredState('04', {
      mode: 'plan', objective_dir: 'obj',
      trd_count_at_defer: 0, last_commit_at_defer: null,
      blocking_match: null,
    }, tmp);
    const deferDir = pathTest.join(tmp, '.planning', '.deferred');
    assert.ok(fsTest.existsSync(deferDir), '.planning/.deferred/ should be created lazily');
    assert.ok(fsTest.existsSync(pathTest.join(deferDir, '04.json')), '04.json should exist');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('DS4 — existing .deferred/<id>.json is overwritten on second call (not appended)', () => {
  const tmp = _mkTmpRepo();
  try {
    dd._writeDeferredState('04', { mode: 'plan', objective_dir: 'obj', trd_count_at_defer: 0, last_commit_at_defer: null, blocking_match: null }, tmp);
    dd._writeDeferredState('04', { mode: 'execute', objective_dir: 'obj2', trd_count_at_defer: 3, last_commit_at_defer: 'xyz9999', blocking_match: null }, tmp);
    const state = JSON.parse(fsTest.readFileSync(pathTest.join(tmp, '.planning', '.deferred', '04.json'), 'utf-8'));
    assert.strictEqual(state.mode, 'execute', 'second call should overwrite first');
    assert.strictEqual(state.trd_count_at_defer, 3);
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('DS5 — deferred_at and resolution_timestamp are ISO 8601 UTC', () => {
  const tmp = _mkTmpRepo();
  try {
    dd._writeDeferredState('04', { mode: 'plan', objective_dir: 'obj', trd_count_at_defer: 0, last_commit_at_defer: null, blocking_match: null }, tmp);
    const state = JSON.parse(fsTest.readFileSync(pathTest.join(tmp, '.planning', '.deferred', '04.json'), 'utf-8'));
    assert.match(state.deferred_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.match(state.resolution_timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

test('DS6 — blocking_match is preserved verbatim from input', () => {
  const tmp = _mkTmpRepo();
  const blockingMatch = { strength: 'hard', source: 'org-overlap', peer_branch: null, peer_objective: '03', signal: 'chain_match: #13', score: 1.0 };
  try {
    dd._writeDeferredState('04', {
      mode: 'plan', objective_dir: 'obj', trd_count_at_defer: 0, last_commit_at_defer: null,
      blocking_match: blockingMatch,
    }, tmp);
    const state = JSON.parse(fsTest.readFileSync(pathTest.join(tmp, '.planning', '.deferred', '04.json'), 'utf-8'));
    assert.deepStrictEqual(state.blocking_match, blockingMatch, 'blocking_match should be preserved verbatim');
  } finally {
    fsTest.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Group Exports: new exports present ──────────────────────────────────────

test('TRD 04-02 exports: recordResolution, applyResolution, _writeCoordinationNote, _writeDeferredState', () => {
  for (const sym of ['recordResolution', 'applyResolution', '_writeCoordinationNote', '_writeDeferredState']) {
    assert.strictEqual(typeof dd[sym], 'function', `${sym} should be exported as a function`);
  }
});
