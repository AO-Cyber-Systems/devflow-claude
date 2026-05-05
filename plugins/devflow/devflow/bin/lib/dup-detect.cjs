'use strict';

/**
 * Duplicate-work detection engine.
 *
 * Detects overlapping work between the current objective and peer sessions
 * via two signal sources:
 *   1. Peer scanner (awareness.scanPeer) — git-branch state aggregation
 *   2. Org-overlap scanner (org-awareness.scanOrgOverlap) — org Project walker
 *
 * Three signal classes (lexical, no LLM scoring — locked per CONTEXT.md decision #2):
 *   - Hard:   same github_issue ref OR org chain_match with issue equality → blocks
 *   - Strong: >=2 file path overlap OR >=3 keyword overlap → blocks
 *   - Weak:   1-2 keyword overlap OR 1 shared file → advisory only (silent at execute-time)
 *
 * Iron Law: detectDuplicates NEVER throws. Infrastructure errors → warnings array.
 *
 * Module growth across waves:
 *   TRD 04-01: skeleton + detectDuplicates + signal helpers + _readPeerFilesModified
 *              + injection hooks + constants                         (THIS TRD)
 *   TRD 04-02: recordResolution + applyResolution + _writeCoordinationNote
 *              + _writeDeferredState
 *   TRD 04-03: formatDetectionMarkdown
 *   TRD 04-06: module.exports finalization + integration tests
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { extractFrontmatter } = require('./frontmatter.cjs');
const aw = require('./awareness.cjs');
const orgaw = require('./org-awareness.cjs');

// ─── TRD 04-01: Constants ─────────────────────────────────────────────────────

const HARD_MATCH_THRESHOLD = 1;
const STRONG_FILE_OVERLAP_THRESHOLD = 2;
const STRONG_KEYWORD_OVERLAP_THRESHOLD = 3;
const DUP_DETECT_LOG_REL = '.planning/.dup-detect-log.jsonl';
const DEFERRED_DIR_REL = '.planning/.deferred';

// ─── TRD 04-01: Injection hooks ───────────────────────────────────────────────
//
// _setRunPeer / _setRunOrgOverlap: higher-level mocks for scanner composition.
// _setRunFs: mirror of org-awareness.cjs pattern for fs operations.
// _resetMocks: reset all three back to real implementations.

let _runPeer = (opts) => aw.scanPeer(opts);
let _runOrgOverlap = (opts) => orgaw.scanOrgOverlap(opts);

const fs = require('fs');
const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
  // TRD 04-02: write operations for recordResolution + _writeDeferredState + _writeCoordinationNote
  appendFileSync: (p, data, opts) => fs.appendFileSync(p, data, opts),
  writeFileSync: (p, data, opts) => fs.writeFileSync(p, data, opts),
  mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
};
let _runFs = realFs;

function _setRunPeer(fn) { _runPeer = (fn != null) ? fn : ((opts) => aw.scanPeer(opts)); }
function _setRunOrgOverlap(fn) { _runOrgOverlap = (fn != null) ? fn : ((opts) => orgaw.scanOrgOverlap(opts)); }
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() {
  _runPeer = (opts) => aw.scanPeer(opts);
  _runOrgOverlap = (opts) => orgaw.scanOrgOverlap(opts);
  _runFs = realFs;
}

// ─── TRD 04-01: Git helper (internal) ────────────────────────────────────────

function _runGit(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    ...opts,
  });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: (r.stderr || '').trim() };
}

// ─── TRD 04-01: _readPeerFilesModified ───────────────────────────────────────

/**
 * Read files_modified from a peer branch's TRD frontmatter files.
 *
 * Uses `git show <branch>:.planning/objectives/<dir>/<file>-TRD.md` for each
 * TRD file on the peer branch. Branches without TRDs return [].
 * Missing TRDs are silently skipped (mirror obj 2's scanPeer STATE.md-missing pattern).
 *
 * @param {string} peer_branch - e.g. "feature/v1.1-obj-04-dup-detect"
 * @param {string} cwd        - working directory for git commands
 * @returns {string[]} - deduplicated union of all files_modified from all peer TRDs
 */
function _readPeerFilesModified(peer_branch, cwd) {
  if (!peer_branch || typeof peer_branch !== 'string' || peer_branch.trim() === '') {
    return [];
  }

  const filesSet = new Set();

  try {
    // 1. Find peer's STATE.md to get the objective dir name
    const stateR = _runGit(['show', `${peer_branch}:.planning/STATE.md`], { cwd });
    if (!stateR.ok) return [];

    // 2. Parse objective dir from STATE.md
    const { parseStateMd } = require('./awareness.cjs');
    const stateData = parseStateMd(stateR.stdout);
    if (!stateData || !stateData.objective) return [];

    // 3. Find the objective directory under .planning/objectives/
    // Try to match by objective id prefix (e.g. "04-") or full name
    const objectiveStr = stateData.objective;
    // Extract objective number from strings like "04 — duplicate-work-detection" or "04-dup"
    const numMatch = objectiveStr.match(/^(\d+)/);
    if (!numMatch) return [];
    const objNum = numMatch[1].padStart(2, '0');

    // 4. List peer's objectives directory to find the matching subdir
    const lsTreeR = _runGit([
      'ls-tree', '--name-only', peer_branch, '.planning/objectives/',
    ], { cwd });
    if (!lsTreeR.ok) return [];

    // Parse directory entries — git ls-tree returns full paths like ".planning/objectives/04-foo/"
    const dirEntries = lsTreeR.stdout.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    // Find the matching objective subdir
    const objDirEntry = dirEntries.find((entry) => {
      const basename = path.basename(entry.replace(/\/$/, ''));
      return basename.startsWith(objNum + '-') || basename === objNum;
    });
    if (!objDirEntry) return [];

    const objPath = objDirEntry.replace(/\/$/, '');

    // 5. List TRD files in that objective dir
    const trdListR = _runGit([
      'ls-tree', '--name-only', '-r', peer_branch, `${objPath}/`,
    ], { cwd });
    if (!trdListR.ok) return [];

    const trdFiles = trdListR.stdout.split('\n')
      .map(l => l.trim())
      .filter(l => l.endsWith('-TRD.md'));

    // 6. For each TRD file, git show and extract frontmatter.files_modified
    for (const trdPath of trdFiles) {
      const showR = _runGit(['show', `${peer_branch}:${trdPath}`], { cwd });
      if (!showR.ok) continue;

      try {
        const fm = extractFrontmatter(showR.stdout);
        if (fm && Array.isArray(fm.files_modified)) {
          for (const f of fm.files_modified) {
            if (typeof f === 'string' && f.trim()) {
              filesSet.add(f.trim());
            }
          }
        }
      } catch {
        // Malformed frontmatter — skip silently
        continue;
      }
    }
  } catch {
    // Any unexpected error → return empty (never throws)
    return [];
  }

  return Array.from(filesSet);
}

// ─── TRD 04-01: Signal helpers ────────────────────────────────────────────────

/**
 * Detect hard match between current objective and a peer session.
 *
 * Hard match conditions (either is sufficient):
 *   1. current.github_issue === peer.github_issue (string equality, both non-null)
 *   2. An org-overlap item has chain_match: true AND issue_ref === current.github_issue
 *
 * @param {{ github_issue: string|null }} current
 * @param {{ github_issue: string|null }} peer
 * @param {object[]} orgItems - from scanOrgOverlap result.items
 * @returns {{ matched: bool, signal: string }}
 */
function _detectHardMatch(current, peer, orgItems = []) {
  // Path 1: peer github_issue equality
  if (
    current.github_issue &&
    peer.github_issue &&
    current.github_issue === peer.github_issue
  ) {
    return {
      matched: true,
      signal: `github_issue match: ${current.github_issue}`,
    };
  }

  // Path 2: org-overlap chain_match with issue_ref equality
  if (current.github_issue && Array.isArray(orgItems)) {
    for (const item of orgItems) {
      if (item.chain_match === true && item.issue_ref === current.github_issue) {
        return {
          matched: true,
          signal: `chain_match via org-overlap: issue_ref=${item.issue_ref}`,
        };
      }
    }
  }

  return { matched: false, signal: '' };
}

/**
 * Detect strong match between current objective and a peer session.
 *
 * Strong match conditions (either is sufficient):
 *   1. |current.files ∩ peer.files| >= STRONG_FILE_OVERLAP_THRESHOLD (2)
 *   2. |current.keywords ∩ peer.keywords| >= STRONG_KEYWORD_OVERLAP_THRESHOLD (3)
 *
 * @param {{ files: string[], keywords: Set<string> }} current
 * @param {{ files: string[], keywords: Set<string> }} peer
 * @returns {{ matched: bool, signal: string }}
 */
function _detectStrongMatch(current, peer) {
  // File overlap check
  if (current.files && current.files.length > 0 && peer.files && peer.files.length > 0) {
    const peerFilesSet = new Set(peer.files);
    const overlappingFiles = current.files.filter(f => peerFilesSet.has(f));
    if (overlappingFiles.length >= STRONG_FILE_OVERLAP_THRESHOLD) {
      return {
        matched: true,
        signal: `file overlap (${overlappingFiles.length}): ${overlappingFiles.slice(0, 3).join(', ')}`,
      };
    }
  }

  // Keyword overlap check
  if (current.keywords && current.keywords.size > 0 && peer.keywords && peer.keywords.size > 0) {
    let kwIntersection = 0;
    const sharedKw = [];
    for (const t of current.keywords) {
      if (peer.keywords.has(t)) {
        kwIntersection++;
        sharedKw.push(t);
      }
    }
    if (kwIntersection >= STRONG_KEYWORD_OVERLAP_THRESHOLD) {
      return {
        matched: true,
        signal: `keyword overlap (${kwIntersection}): ${sharedKw.slice(0, 5).join(', ')}`,
      };
    }
  }

  return { matched: false, signal: '' };
}

/**
 * Detect weak match between current objective and a peer session.
 *
 * Weak match conditions (either is sufficient, but NOT if strong/hard thresholds met):
 *   1. 1-2 keyword overlap (less than STRONG_KEYWORD_OVERLAP_THRESHOLD)
 *   2. 1 shared file (less than STRONG_FILE_OVERLAP_THRESHOLD)
 *
 * Returns false if strong or hard thresholds are met (those are handled by other helpers).
 *
 * @param {{ files: string[], keywords: Set<string> }} current
 * @param {{ files: string[], keywords: Set<string> }} peer
 * @returns {{ matched: bool, signal: string }}
 */
function _detectWeakMatch(current, peer) {
  // Check file overlap
  let fileOverlap = 0;
  const overlappingFiles = [];
  if (current.files && current.files.length > 0 && peer.files && peer.files.length > 0) {
    const peerFilesSet = new Set(peer.files);
    for (const f of current.files) {
      if (peerFilesSet.has(f)) {
        fileOverlap++;
        overlappingFiles.push(f);
      }
    }
  }

  // Check keyword overlap
  let kwOverlap = 0;
  const sharedKw = [];
  if (current.keywords && current.keywords.size > 0 && peer.keywords && peer.keywords.size > 0) {
    for (const t of current.keywords) {
      if (peer.keywords.has(t)) {
        kwOverlap++;
        sharedKw.push(t);
      }
    }
  }

  // Weak is ONLY 1 to (threshold-1) — not strong territory
  if (fileOverlap >= STRONG_FILE_OVERLAP_THRESHOLD || kwOverlap >= STRONG_KEYWORD_OVERLAP_THRESHOLD) {
    // Strong territory — weak helper doesn't fire
    return { matched: false, signal: '' };
  }

  if (fileOverlap === 1) {
    return {
      matched: true,
      signal: `single file overlap: ${overlappingFiles[0]}`,
    };
  }

  if (kwOverlap >= 1 && kwOverlap < STRONG_KEYWORD_OVERLAP_THRESHOLD) {
    return {
      matched: true,
      signal: `keyword overlap (${kwOverlap}): ${sharedKw.join(', ')}`,
    };
  }

  return { matched: false, signal: '' };
}

// ─── TRD 04-01: detectDuplicates ─────────────────────────────────────────────

/**
 * Main detection engine. Runs peer + org-overlap scanners and classifies matches.
 *
 * Never throws. Infrastructure failures become warnings.
 *
 * @param {object} opts
 * @param {object}   opts.objective            - { id, title, github_issue, files_modified }
 * @param {object}   [opts.projectCtx]         - { github_repo, org_project }
 * @param {'plan'|'execute'} opts.mode         - detection mode
 * @param {string}   opts.cwd                  - working directory
 * @param {object}   [opts.peer_scan]          - pre-fetched peer scan result (skips live call)
 * @param {object}   [opts.org_overlap]        - pre-fetched org-overlap result (skips live call)
 * @param {string[]} [opts.current_files_modified] - override current files_modified
 * @param {Set<string>} [opts.current_keywords]    - override current keywords (pre-tokenized)
 * @param {string}   [opts.current_github_issue]   - override current github_issue
 * @returns {{ blocking: bool, matches: object[], advisory: object[], warnings: string[], mode: string, timestamp: string }}
 */
function detectDuplicates({
  objective = {},
  projectCtx = {},
  mode = 'plan',
  cwd = process.cwd(),
  peer_scan = null,
  org_overlap = null,
  current_files_modified = null,
  current_keywords = null,
  current_github_issue = null,
} = {}) {
  const timestamp = new Date().toISOString();
  const result = {
    blocking: false,
    matches: [],
    advisory: [],
    warnings: [],
    mode,
    timestamp,
  };

  // ── 1. Resolve current objective state ────────────────────────────────────

  const currentIssue = current_github_issue !== null
    ? current_github_issue
    : (objective.github_issue || null);

  const currentFiles = current_files_modified !== null
    ? current_files_modified
    : (Array.isArray(objective.files_modified) ? objective.files_modified : []);

  let currentKeywords;
  if (current_keywords !== null && current_keywords instanceof Set) {
    currentKeywords = current_keywords;
  } else {
    // Tokenize from objective title
    const title = objective.title || objective.id || '';
    currentKeywords = orgaw._tokenize(title);
  }

  const currentCtx = {
    github_issue: currentIssue,
    files: currentFiles,
    keywords: currentKeywords,
  };

  // ── 2. Fetch peer scan ────────────────────────────────────────────────────

  let peerBranches = [];
  if (peer_scan !== null) {
    peerBranches = peer_scan.branches || [];
  } else {
    try {
      const scanResult = _runPeer({ cwd });
      peerBranches = scanResult.branches || [];
    } catch (e) {
      result.warnings.push(`peer scanner error: ${e.message}`);
    }
  }

  // ── 3. Fetch org-overlap ──────────────────────────────────────────────────

  let orgItems = [];
  let orgSkipped = false;
  if (org_overlap !== null) {
    orgItems = org_overlap.items || [];
    orgSkipped = org_overlap.skipped || false;
    if (orgSkipped && Array.isArray(org_overlap.warnings)) {
      for (const w of org_overlap.warnings) result.warnings.push(w);
    }
  } else {
    try {
      const orgResult = _runOrgOverlap({
        objective_id: objective.id || '',
        current_tokens: currentKeywords,
        sibling_repos: [],
        frontmatter: objective,
        projectCtx,
      });
      if (orgResult.skipped) {
        orgSkipped = true;
        for (const w of (orgResult.warnings || [])) result.warnings.push(w);
      } else {
        orgItems = orgResult.items || [];
      }
    } catch (e) {
      result.warnings.push(`org-overlap scanner error: ${e.message}`);
    }
  }

  // ── 4. Collect org hard-match candidates (chain_match=true items) ─────────

  const orgHardCandidates = orgItems.filter(item => item.chain_match === true);

  // ── 5. Check org-overlap hard match (without peer comparison) ─────────────
  //
  // Org-overlap hard match doesn't need a peer branch — it's a direct issue match.
  // We emit this as a synthetic "org-overlap" match entry.

  for (const orgItem of orgHardCandidates) {
    if (currentIssue && orgItem.issue_ref === currentIssue) {
      result.matches.push({
        strength: 'hard',
        source: 'org-overlap',
        peer_objective: null,
        peer_branch: null,
        signal: `chain_match via org-overlap: issue_ref=${orgItem.issue_ref}`,
        score: 1.0,
      });
      result.blocking = true;
    }
  }

  // ── 6. Detect matches per peer branch ────────────────────────────────────

  for (const peer of peerBranches) {
    // Read peer's files_modified from their TRD frontmatter.
    // If the peer entry already carries a files_modified array (e.g. from cache or
    // a fixture), use it directly to avoid an unnecessary git show round-trip.
    const peerFiles = Array.isArray(peer.files_modified) && peer.files_modified.length > 0
      ? peer.files_modified
      : _readPeerFilesModified(peer.branch || '', cwd);
    const peerKeywords = orgaw._tokenize(peer.objective || '');

    const peerCtx = {
      github_issue: peer.github_issue || null,
      files: peerFiles,
      keywords: peerKeywords,
    };

    // Hard match check (peer github_issue only — org path handled above)
    const hardResult = _detectHardMatch(currentCtx, peerCtx, []);
    if (hardResult.matched) {
      result.matches.push({
        strength: 'hard',
        source: 'peer',
        peer_objective: peer.objective || null,
        peer_branch: peer.branch || null,
        signal: hardResult.signal,
        score: 1.0,
      });
      result.blocking = true;
      continue; // Hard match found — no need to check strong/weak for this peer
    }

    // Strong match check
    const strongResult = _detectStrongMatch(currentCtx, peerCtx);
    if (strongResult.matched) {
      result.matches.push({
        strength: 'strong',
        source: 'peer',
        peer_objective: peer.objective || null,
        peer_branch: peer.branch || null,
        signal: strongResult.signal,
        score: 0.8,
      });
      result.blocking = true;
      continue;
    }

    // Weak match check (plan-time only — filtered at execute-time)
    const weakResult = _detectWeakMatch(currentCtx, peerCtx);
    if (weakResult.matched) {
      result.advisory.push({
        strength: 'weak',
        source: 'peer',
        peer_objective: peer.objective || null,
        peer_branch: peer.branch || null,
        signal: weakResult.signal,
        score: 0.3,
      });
    }
  }

  // ── 7. Execute-time filtering: advisory is always empty ───────────────────
  //
  // Per locked decision #5: mode='execute' filters advisory at construction time.
  if (mode === 'execute') {
    result.advisory = [];
  }

  return result;
}

// ─── TRD 04-02: recordResolution + applyResolution + writers ─────────────────

/**
 * Append a single record to .planning/.dup-detect-log.jsonl.
 *
 * Schema (locked per CONTEXT.md decision #7):
 *   { timestamp, objective_id, mode, blocking, top_match: {strength, peer, score}|null, resolution }
 *
 * Lazy-creates .planning/ if missing. Atomic per-call (POSIX appendFileSync).
 * Never throws; on write error, warns to stderr.
 *
 * @param {object} opts
 * @param {string}      opts.objective_id
 * @param {'plan'|'execute'} opts.mode
 * @param {boolean}     opts.blocking
 * @param {{ strength: string, peer: string|null, score: number|null } | null} opts.top_match
 * @param {'merge'|'defer'|'coordinate'|'proceed-anyway'|'none'} opts.resolution
 * @param {string}      [opts.cwd]
 */
function recordResolution({ objective_id, mode, blocking, top_match, resolution, cwd = process.cwd() } = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    objective_id,
    mode,
    blocking: !!blocking,
    top_match: top_match || null,
    resolution: resolution || 'none',
  };
  const planningDir = path.join(cwd, '.planning');
  const logPath = path.join(cwd, DUP_DETECT_LOG_REL);
  try {
    if (!_runFs.existsSync(planningDir)) _runFs.mkdirSync(planningDir, { recursive: true });
    _runFs.appendFileSync(logPath, JSON.stringify(record) + '\n');
  } catch (e) {
    process.stderr.write(`Warning: recordResolution failed: ${e && e.message ? e.message : String(e)}\n`);
  }
}

/**
 * Append a `## Coordination Note` section to <objective_dir>/<padded>-CONTEXT.md.
 * Always appends; never replaces (multiple plan-time runs accumulate).
 * Lazy-creates CONTEXT.md with frontmatter scaffold if missing.
 *
 * @param {string} objective_dir  - absolute path to objective dir
 * @param {string} padded         - padded objective number (e.g. '04')
 * @param {object} note_data
 *   { objective_id, timestamp, strength, source, peer_objective, peer_branch,
 *     signal, resolution_label, suggested_handoff, warning? }
 */
function _writeCoordinationNote(objective_dir, padded, note_data) {
  const contextPath = path.join(objective_dir, `${padded}-CONTEXT.md`);
  const sanitize = (s) => (s == null ? '' : String(s).replace(/[\r\n]+/g, ' '));

  const noteLines = [
    '## Coordination Note',
    '',
    `Detected duplicate-work signals at plan-time on \`${note_data.timestamp}\`:`,
    '',
    `- **Strength:** ${sanitize(note_data.strength)}`,
    `- **Source:** ${sanitize(note_data.source)}`,
    `- **Peer objective:** \`${sanitize(note_data.peer_objective) || '(unknown)'}\``,
    `- **Peer branch:** \`${sanitize(note_data.peer_branch) || '(n/a)'}\``,
    `- **Signal:** ${sanitize(note_data.signal) || '(none)'}`,
    `- **User resolution:** ${sanitize(note_data.resolution_label)}`,
    '',
  ];
  if (note_data.warning) {
    noteLines.push(`**WARNING:** ${sanitize(note_data.warning)}`, '');
  }
  noteLines.push('**Suggested handoff points:**');
  noteLines.push(`- ${sanitize(note_data.suggested_handoff) || '(see signal description)'}`);
  noteLines.push('');

  let prefix = '';
  if (!_runFs.existsSync(contextPath)) {
    // Lazy-create parent directory if needed
    try {
      if (!_runFs.existsSync(objective_dir)) _runFs.mkdirSync(objective_dir, { recursive: true });
    } catch { /* swallow */ }
    // Create CONTEXT.md with frontmatter scaffold (mirrors obj 3 pattern)
    prefix = `---\nobjective: ${note_data.objective_id || ''}\ncreated: ${note_data.timestamp}\n---\n\n# Objective ${note_data.objective_id || ''} — Context\n\n`;
  } else {
    prefix = '\n';
  }
  _runFs.appendFileSync(contextPath, prefix + noteLines.join('\n') + '\n');
}

/**
 * Write .planning/.deferred/<objective_id>.json with locked schema.
 * Lazy-creates .planning/.deferred/ if missing.
 *
 * @param {string} objective_id
 * @param {object} state - partial state object (objective_id + timestamps merged in)
 * @param {string} [cwd]
 * @returns {string} the absolute path written
 */
function _writeDeferredState(objective_id, state, cwd = process.cwd()) {
  const deferDir = path.join(cwd, DEFERRED_DIR_REL);
  if (!_runFs.existsSync(deferDir)) _runFs.mkdirSync(deferDir, { recursive: true });
  const filePath = path.join(deferDir, `${objective_id}.json`);
  const now = new Date().toISOString();
  const payload = Object.assign({
    objective_id,
    deferred_at: now,
    resolution_timestamp: now,
  }, state);
  _runFs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n');
  return filePath;
}

/**
 * Dispatch a resolution choice to the appropriate writer helper.
 *
 * @param {object} opts
 * @param {'merge'|'defer'|'coordinate'|'proceed-anyway'} opts.resolution
 * @param {string} opts.objective_id
 * @param {string|null} opts.peer_branch
 * @param {string|null} opts.peer_objective
 * @param {string} [opts.cwd]
 * @param {object} opts.detection - the detectDuplicates result that triggered the resolution
 * @param {string} opts.objective_dir - absolute path to objective directory
 * @param {string} opts.padded_objective - padded objective number (e.g. '04')
 * @returns {object} dispatch result (varies by resolution)
 */
function applyResolution({
  resolution,
  objective_id,
  peer_branch = null,
  peer_objective = null,
  cwd = process.cwd(),
  detection = {},
  objective_dir,
  padded_objective,
} = {}) {
  // Build note_data from top match in detection result
  const topMatch = (Array.isArray(detection.matches) && detection.matches.length > 0)
    ? detection.matches[0]
    : null;

  const note_data = {
    objective_id,
    timestamp: detection.timestamp || new Date().toISOString(),
    strength: topMatch ? topMatch.strength : 'unknown',
    source: topMatch ? topMatch.source : 'unknown',
    peer_objective: peer_objective || (topMatch ? topMatch.peer_objective : null),
    peer_branch: peer_branch || (topMatch ? topMatch.peer_branch : null),
    signal: topMatch ? topMatch.signal : '',
    suggested_handoff: topMatch && topMatch.signal && String(topMatch.signal).includes('file')
      ? `shared files; consider splitting ${objective_dir} into a sub-task that depends on ${peer_objective || (topMatch ? topMatch.peer_objective : '') || '(peer)'}`
      : 'sync with peer before continuing',
  };

  switch (resolution) {
    case 'merge': {
      const cmd = peer_branch ? `git checkout ${peer_branch}` : 'git checkout <peer_branch>';
      const msg = [
        `This objective overlaps with \`${peer_objective || '(peer)'}\` on \`${peer_branch || '(unknown)'}\`.`,
        `Switch to that branch and continue there:\n  ${cmd}`,
        'Current objective directory left intact for manual cleanup.',
      ].join('\n');
      // Write abort message to stderr so callers (CLI output() / skill workflow) receive
      // clean JSON on stdout. Per CONTEXT.md: PRINT only, do not execute.
      process.stderr.write(msg + '\n');
      return { aborted: true, suggestion: cmd, message: msg };
    }

    case 'defer': {
      const filePath = _writeDeferredState(objective_id, {
        mode: detection.mode || 'plan',
        objective_dir,
        trd_count_at_defer: 0,
        last_commit_at_defer: null,
        blocking_match: topMatch ? {
          strength: topMatch.strength,
          source: topMatch.source,
          peer_objective: topMatch.peer_objective,
          peer_branch: topMatch.peer_branch,
          signal: topMatch.signal,
          score: topMatch.score,
        } : null,
      }, cwd);
      return { wrote_deferred: true, defer_path: filePath };
    }

    case 'coordinate': {
      _writeCoordinationNote(objective_dir, padded_objective, Object.assign({}, note_data, {
        resolution_label: 'Coordinate',
      }));
      return { wrote_coordination_note: true };
    }

    case 'proceed-anyway': {
      _writeCoordinationNote(objective_dir, padded_objective, Object.assign({}, note_data, {
        resolution_label: 'Proceed-anyway',
        warning: 'User chose "Proceed anyway" despite blocking match — likely merge conflicts at commit time.',
      }));
      return { wrote_coordination_note: true, warning_appended: true };
    }

    default:
      throw new Error(`applyResolution: unknown resolution '${resolution}' (expected: merge | defer | coordinate | proceed-anyway)`);
  }
}

// ─── TRD 04-03: formatDetectionMarkdown — pure renderer ──────────────────────

/**
 * Sanitize text for safe inclusion in markdown bullets:
 *   - replace backticks with single quotes (v1.1 cheap escape)
 *   - replace newlines with spaces (one-line bullet contract)
 *
 * @param {*} s
 * @returns {string}
 */
function _sanitize(s) {
  if (s == null) return '';
  return String(s).replace(/`/g, "'").replace(/[\r\n]+/g, ' ');
}

function _formatScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'N/A';
  return String(Math.round(score));
}

function _renderMatchEntry(m) {
  const peer = m.peer_branch || m.peer_objective || '(unknown peer)';
  const lines = [];
  lines.push(`- **${_sanitize(m.strength)}** match — source: \`${_sanitize(m.source)}\` — peer: \`${_sanitize(peer)}\` — score: ${_formatScore(m.score)}`);
  lines.push(`  - signal: ${_sanitize(m.signal) || '(no signal description)'}`);
  return lines.join('\n');
}

function _renderAdvisoryEntry(m) {
  const peer = m.peer_branch || m.peer_objective || '(unknown peer)';
  return `- _${_sanitize(m.strength)}_ — peer \`${_sanitize(peer)}\` — ${_sanitize(m.signal) || '(no signal)'}`;
}

function _renderWarnings(warnings) {
  const arr = Array.isArray(warnings) ? warnings : [];
  if (arr.length === 0) return '';
  return arr.map(w => `> **Note:** ${_sanitize(w)}`).join('\n');
}

function _renderResolutionOptions() {
  return [
    '### Resolution options',
    '',
    '1. **Merge** — abort planning, switch to peer branch and continue there.',
    '2. **Defer** — pause this objective; save state to `.planning/.deferred/<id>.json`.',
    '3. **Coordinate** — continue planning; record a Coordination Note in CONTEXT.md.',
    '4. **Proceed-anyway** — continue with full warning logged in CONTEXT.md.',
  ].join('\n');
}

/**
 * Render a detectDuplicates() result as Markdown for human display.
 *
 * @param {object|null} detection - the structured result from detectDuplicates()
 * @param {object} [opts]
 * @param {'askuser'|'context'} [opts.purpose='askuser']
 * @returns {string}
 */
function formatDetectionMarkdown(detection, opts) {
  if (detection == null) return '_(no detection result available)_';
  const purpose = (opts && (opts.purpose === 'context' || opts.purpose === 'askuser')) ? opts.purpose : 'askuser';

  const matches = Array.isArray(detection.matches) ? detection.matches : [];
  const advisory = Array.isArray(detection.advisory) ? detection.advisory : [];
  const warnings = Array.isArray(detection.warnings) ? detection.warnings : [];
  const mode = detection.mode || 'plan';

  // Empty case: no matches, no advisory, no warnings
  if (matches.length === 0 && advisory.length === 0 && warnings.length === 0) {
    return '_(no duplicate-work signals detected — proceeding without coordination note)_';
  }

  const sections = [];

  // Title
  const title = (mode === 'execute')
    ? '## Duplicate-Work Recheck (execute-time)'
    : '## Duplicate-Work Match Detected';
  sections.push(title);

  // Matches section (blocking)
  if (matches.length > 0) {
    const matchLines = ['### Matches (blocking)'];
    for (const m of matches.slice(0, 5)) {
      matchLines.push(_renderMatchEntry(m));
    }
    sections.push(matchLines.join('\n'));
  }

  // Advisory section (plan-mode only and when present)
  if (mode === 'plan' && advisory.length > 0) {
    const advLines = ['### Advisory (informational)'];
    for (const m of advisory.slice(0, 5)) {
      advLines.push(_renderAdvisoryEntry(m));
    }
    sections.push(advLines.join('\n'));
  }

  // Warnings blockquote
  const warningsBlock = _renderWarnings(warnings);
  if (warningsBlock) sections.push(warningsBlock);

  // Resolution options (askuser variant only, and only when there's something to resolve)
  if (purpose === 'askuser' && matches.length > 0) {
    sections.push(_renderResolutionOptions());
  }

  return sections.join('\n\n');
}

// ─── TRD 04-01 + 04-02 + 04-03: Partial module.exports ──────────────────────

module.exports = {
  // TRD 04-01: Public API
  detectDuplicates,

  // TRD 04-01: Signal helpers (exposed for tests)
  _detectHardMatch,
  _detectStrongMatch,
  _detectWeakMatch,
  _readPeerFilesModified,

  // TRD 04-01: Injection hooks
  _setRunPeer,
  _setRunOrgOverlap,
  _setRunFs,
  _resetMocks,

  // TRD 04-01: Constants
  HARD_MATCH_THRESHOLD,
  STRONG_FILE_OVERLAP_THRESHOLD,
  STRONG_KEYWORD_OVERLAP_THRESHOLD,
  DUP_DETECT_LOG_REL,
  DEFERRED_DIR_REL,

  // TRD 04-02: Resolution recorder + dispatcher + writers
  recordResolution,
  applyResolution,
  _writeCoordinationNote,
  _writeDeferredState,

  // TRD 04-03: Pure markdown renderer
  formatDetectionMarkdown,
};
