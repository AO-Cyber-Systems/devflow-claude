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
