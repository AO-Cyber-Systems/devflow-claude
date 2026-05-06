'use strict';

/**
 * classifier-fixtures.cjs — Test fixtures for classifier.cjs pure-logic tests
 * and classify-session.js hook subprocess tests.
 *
 * Provides:
 *   buildClassifyInput({...})      — factory for classifySession inputs
 *   SCENARIOS                      — named input presets for each branch
 *   mkAmbientTmpProject()          — tmpdir with .planning/ + .git/
 *   mkInitOfferTmpProject()        — tmpdir with .git/ only
 *   mkScratchDir()                 — tmpdir with nothing
 *   mkDeclineMarkerProject()       — tmpdir with .planning/ + .git/ + decline marker
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// ─── Factory builder ──────────────────────────────────────────────────────────

/**
 * Build a classifySession input object.
 * @param {object} opts
 * @param {string|null} opts.planningDir
 * @param {boolean}     opts.hasGitDir
 * @param {boolean}     opts.hasDeclineMarker
 * @returns {{ planningDir: string|null, hasGitDir: boolean, hasDeclineMarker: boolean }}
 */
function buildClassifyInput({
  planningDir = null,
  hasGitDir = false,
  hasDeclineMarker = false,
} = {}) {
  return { planningDir, hasGitDir, hasDeclineMarker };
}

// ─── Named scenarios (pure, no filesystem) ────────────────────────────────────

const SCENARIOS = {
  /** Ambient: has .planning/ and no decline marker → 'ambient' */
  ambient: () => buildClassifyInput({ planningDir: '/tmp/p/.planning', hasGitDir: true }),
  /** Init-offer: git repo, no .planning/, no decline marker → 'init-offer' */
  initOffer: () => buildClassifyInput({ planningDir: null, hasGitDir: true }),
  /** Scratch dir: no planning, no git → 'skip' */
  scratchDir: () => buildClassifyInput({ planningDir: null, hasGitDir: false }),
  /** No-git dir: same as scratch — no planning, no git → 'skip' */
  noGitDir: () => buildClassifyInput({ planningDir: null, hasGitDir: false }),
  /** Decline marker: has .planning/ but marker present → 'skip' */
  declineMarker: () => buildClassifyInput({ planningDir: '/tmp/p/.planning', hasGitDir: true, hasDeclineMarker: true }),
};

// ─── Tmpdir scaffolds (used by classify-session subprocess tests) ─────────────

/**
 * Create a temp dir with both .planning/ and .git/ — classifies as 'ambient'.
 * Caller must clean up: fs.rmSync(root, { recursive: true, force: true })
 * @returns {string} absolute path to project root
 */
function mkAmbientTmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-ambient-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

/**
 * Create a temp dir with .git/ only — classifies as 'init-offer'.
 * Caller must clean up.
 * @returns {string} absolute path to project root
 */
function mkInitOfferTmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-init-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

/**
 * Create a bare temp dir (no .planning/, no .git/) — classifies as 'skip'.
 * Caller must clean up.
 * @returns {string} absolute path to scratch dir
 */
function mkScratchDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'classify-scratch-'));
}

/**
 * Create a temp dir with .planning/ + .git/ + .planning/.devflow-init-declined marker.
 * Despite having .planning/, this classifies as 'skip' due to decline marker.
 * Caller must clean up.
 * @returns {string} absolute path to project root
 */
function mkDeclineMarkerProject() {
  const root = mkAmbientTmpProject();
  fs.writeFileSync(path.join(root, '.planning', '.devflow-init-declined'), '');
  return root;
}

module.exports = {
  buildClassifyInput,
  SCENARIOS,
  mkAmbientTmpProject,
  mkInitOfferTmpProject,
  mkScratchDir,
  mkDeclineMarkerProject,
};
