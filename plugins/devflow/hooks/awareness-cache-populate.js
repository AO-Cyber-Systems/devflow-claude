#!/usr/bin/env node
'use strict';

/**
 * SessionStart hook — populate awareness cache lazily when stale or missing.
 *
 * Fire-and-forget: spawns child process as detached + unref() so the parent
 * exits within milliseconds regardless of how long the scan takes (30s+).
 * Never blocks session start.
 *
 * Staleness strategy (read-path only):
 * - Both fresh (within TTL)  → no-op
 * - Peer stale + org fresh   → spawns `df-tools awareness scan-peer --no-fetch`
 *   NOTE: --no-fetch is deliberate. When only the peer cache is stale, skipping
 *   git fetch avoids a potentially slow remote call that would keep the child
 *   process running far longer than necessary. Local refs are still walked,
 *   giving useful peer data without blocking on the network. If the user wants
 *   a full fetch they can run `df-tools awareness show --refresh` manually.
 * - Org stale + peer fresh   → spawns `df-tools awareness scan-org`
 * - Both stale (or no cache) → spawns `df-tools awareness show --refresh --raw`
 *   (single process, covers both sections)
 *
 * Escape hatches:
 * - DEVFLOW_SKIP_AWARENESS_POPULATE=1  → bypass entirely
 * - .planning/ absent in cwd          → not a DevFlow project, no-op
 *
 * @module awareness-cache-populate
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawn } = require('child_process');

const DEFAULT_TTL_MINUTES = 10;
const CACHE_REL = path.join('.planning', '.awareness-cache.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the absolute path to df-tools.cjs.
 *
 * Priority:
 *   1. ${CLAUDE_PLUGIN_ROOT}/devflow/bin/df-tools.cjs  (hook runtime context)
 *   2. ~/.claude/devflow/bin/df-tools.cjs              (mirror fallback)
 *
 * @param {object} env - process.env or injected env
 * @returns {string}
 */
function _findDfTools(env) {
  const root = env.CLAUDE_PLUGIN_ROOT;
  if (root) {
    return path.join(root, 'devflow', 'bin', 'df-tools.cjs');
  }
  return path.join(os.homedir(), '.claude', 'devflow', 'bin', 'df-tools.cjs');
}

/**
 * Read the awareness cache file.
 * Returns null on missing / empty / parse error (silent; regeneration is cheap).
 *
 * @param {string} cwd
 * @returns {{ peer?: object, org?: object } | null}
 */
function _readCache(cwd) {
  const p = path.join(cwd, CACHE_REL);
  if (!fs.existsSync(p)) return null;
  try {
    const content = fs.readFileSync(p, 'utf-8').trim();
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Returns true when fetched_at is stale relative to ttl_minutes.
 *
 * Rules (mirrors lib/awareness.cjs::isStale):
 * - null / undefined / non-string → stale
 * - non-parseable ISO string → stale
 * - future timestamp → fresh (clock-skew tolerance)
 * - age > ttl * 60_000 ms → stale
 *
 * @param {string|null|undefined} fetched_at
 * @param {number} ttl_minutes
 * @returns {boolean}
 */
function _isStale(fetched_at, ttl_minutes) {
  if (fetched_at == null || typeof fetched_at !== 'string') return true;
  const ts = Date.parse(fetched_at);
  if (!Number.isFinite(ts)) return true;
  const age_ms = Date.now() - ts;
  if (age_ms < 0) return false; // future timestamp → treat as fresh
  return age_ms > (ttl_minutes * 60_000);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Main hook logic — testable via injection.
 *
 * @param {object} opts
 * @param {string}   [opts.cwd]    - working directory (defaults to process.cwd())
 * @param {object}   [opts.env]    - environment object (defaults to process.env)
 * @param {function} [opts._spawn] - child_process.spawn replacement for testing
 */
function _main({ cwd = process.cwd(), env = process.env, _spawn = spawn } = {}) {
  // Escape hatch: allow bypassing entirely for CI or testing environments
  if (env.DEVFLOW_SKIP_AWARENESS_POPULATE === '1') return;

  // Not a DevFlow project — no .planning/ directory
  if (!fs.existsSync(path.join(cwd, '.planning'))) return;

  const cache  = _readCache(cwd) || {};
  const ttl    = DEFAULT_TTL_MINUTES;
  const peerStale = _isStale(cache.peer && cache.peer.fetched_at, ttl);
  const orgStale  = _isStale(cache.org  && cache.org.fetched_at,  ttl);

  // Both sections fresh — no-op, respect TTL
  if (!peerStale && !orgStale) return;

  const dfTools = _findDfTools(env);
  let spawnArgs;

  if (peerStale && !orgStale) {
    // Peer stale, org fresh → scan peer only.
    // --no-fetch: skip git fetch to avoid slow network call on session start.
    // See module-level JSDoc for the full trade-off rationale.
    spawnArgs = [dfTools, 'awareness', 'scan-peer', '--no-fetch'];
  } else if (!peerStale && orgStale) {
    // Org stale, peer fresh → scan org only
    spawnArgs = [dfTools, 'awareness', 'scan-org'];
  } else {
    // Both stale (or no cache at all) → single combined refresh
    spawnArgs = [dfTools, 'awareness', 'show', '--refresh', '--raw'];
  }

  // Fire-and-forget: detached + stdio:'ignore' + unref().
  // - detached:true   — child runs in its own process group
  // - stdio:'ignore'  — no open pipe fd's that would prevent parent exit
  // - unref()         — parent event loop does not wait for child to finish
  const child = _spawn('node', spawnArgs, {
    cwd,
    env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

if (require.main === module) {
  _main();
}

module.exports = { _main, _isStale, _readCache, _findDfTools };
