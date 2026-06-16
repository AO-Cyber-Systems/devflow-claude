#!/usr/bin/env node

/**
 * DevFlow Commit Verification Hook (SubagentStop hook)
 *
 * Triggers when an executor subagent completes.
 * Verifies that git commits were actually made (checks for recent commits).
 *
 * In autonomous mode: if no recent commits and mid-execution, block once per
 * agent (per-agent marker file) to give the subagent a retry with actionable
 * feedback. The second SubagentStop for the same agent always allows stop.
 *
 * In non-autonomous mode (yolo/interactive): warn-only via stderr (existing
 * behavior preserved verbatim).
 *
 * Hook type: SubagentStop (fires when a subagent finishes)
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── DevFlow project detection ────────────────────────────────────────────────

function findPlanningDir() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) {
      return path.join(dir, '.planning');
    }
    dir = path.dirname(dir);
  }
  return null;
}

// ─── Git commit check ─────────────────────────────────────────────────────────

function hasRecentCommits() {
  try {
    const result = spawnSync(
      'git',
      ['log', '--oneline', '--since=10 minutes ago'],
      { encoding: 'utf8', timeout: 5000 },
    );

    // git binary not found or hard failure
    if (result.error) return null;

    // "not a git repository" — not applicable, silent no-op
    if (result.status !== 0) {
      const stderr = (result.stderr || '').toLowerCase();
      if (stderr.includes('not a git repository')) return null;
      // Empty repo ("no commits yet") or other git error — treat as no recent commits
      return false;
    }

    return result.stdout.trim().length > 0;
  } catch {
    return null; // git unavailable
  }
}

// ─── STATE.md mid-execution check ─────────────────────────────────────────────

function isMidExecution(planningDir) {
  try {
    const stateFile = path.join(planningDir, 'STATE.md');
    if (!fs.existsSync(stateFile)) return false;
    const content = fs.readFileSync(stateFile, 'utf8');
    return content.includes('Executing') || content.includes('In progress');
  } catch {
    return false;
  }
}

// ─── Autonomous mode detection ────────────────────────────────────────────────

function isAutonomousMode(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) return false;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.mode === 'autonomous';
  } catch {
    return false;
  }
}

// ─── Stdin payload parsing ────────────────────────────────────────────────────

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function parsePayload() {
  try { return JSON.parse(readStdin() || '{}'); } catch { return {}; }
}

// ─── Per-agent retry marker ───────────────────────────────────────────────────

/**
 * Return the path for the per-agent retry marker file.
 * agentId is sanitized: only alphanumeric, underscore, hyphen kept.
 * This prevents path traversal attacks since agent_id is external input.
 */
function retryMarkerPath(planningDir, agentId) {
  const sanitized = String(agentId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(planningDir, `.autonomous-retry-${sanitized}`);
}

// ─── Stale marker cleanup ─────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Remove .autonomous-retry-* markers older than 1 hour.
 * Safety net so markers never accumulate indefinitely.
 */
function cleanStaleMarkers(planningDir) {
  try {
    const now = Date.now();
    const entries = fs.readdirSync(planningDir);
    for (const entry of entries) {
      if (!entry.startsWith('.autonomous-retry-')) continue;
      const fullPath = path.join(planningDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > STALE_THRESHOLD_MS) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // Skip unreadable/missing entries
      }
    }
  } catch {
    // Silently fail — never block the hook
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const planningDir = findPlanningDir();
  if (!planningDir) return; // Not a DevFlow project

  try {
    // Clean up stale retry markers first (safety net, runs on every SubagentStop)
    cleanStaleMarkers(planningDir);

    const recent = hasRecentCommits();

    // If git is unavailable (null) or commits exist, nothing to do
    if (recent === null || recent === true) return;

    // No recent commits — check if we're mid-execution
    if (!isMidExecution(planningDir)) return;

    if (isAutonomousMode(planningDir)) {
      // ── Autonomous retry-once path ──────────────────────────────────────
      const payload = parsePayload();
      const agentId = String(payload.agent_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
      const marker = retryMarkerPath(planningDir, agentId);

      if (fs.existsSync(marker)) {
        // Retry already consumed for this agent — allow stop silently
        return;
      }

      // First time: create marker and block with actionable feedback
      fs.writeFileSync(marker, String(Date.now()), 'utf8');

      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SubagentStop',
          decision: 'block',
          reason: 'DevFlow autonomous mode: executor produced no commits in the last 10 minutes during mid-execution work. Retry once: re-read your TRD/plan file, check git status for uncommitted work, commit completed tasks atomically, and write SUMMARY.md. If genuinely blocked, return a structured failure report instead of stopping silently. Never use port 8080 for anything — use 8091.',
        },
      }));
    } else {
      // ── Non-autonomous warn-only path (preserved verbatim) ───────────────
      console.error('\n⚠ DevFlow: No git commits found in last 10 minutes.');
      console.error('  If an executor was running, this may indicate a silent failure.');
      console.error('  Check the SUMMARY.md for the current objective.\n');
    }
  } catch {
    // Silently fail — hook should never block
  }
}

if (require.main === module) main();

module.exports = {
  findPlanningDir,
  hasRecentCommits,
  isMidExecution,
  isAutonomousMode,
  retryMarkerPath,
  cleanStaleMarkers,
};
