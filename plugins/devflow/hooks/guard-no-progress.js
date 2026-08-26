#!/usr/bin/env node

/**
 * DevFlow No-Progress Guard (PreToolUse, all tools) — TRD 28-04
 *
 * Surfaces the case where an agent calls the same tool with the same arguments
 * over and over. Step limits cannot do this: they fire only once the whole
 * budget is spent, so they catch an infinite loop but never a stuck one.
 *
 * Escalation policy this implements (TRD 28-05):
 *   - 3rd identical call  -> warn on stderr. Non-blocking; the agent keeps control.
 *   - 5th identical call  -> permissionDecision 'ask'. The loop is now costing
 *                            more than the interruption, and a human deciding is
 *                            the correct escalation — not a bigger model, which
 *                            cannot fix environment friction.
 *
 * Deliberately NOT wired to tool errors. The 2026-08-18 audit measured a
 * 3.6-4.3% tool-error rate at EVERY model tier, much of it gate false positives.
 * Escalating on raw errors would have spent the whole budget on Opus responding
 * to a mis-scoped worktree guard.
 *
 * Fails open in every direction: any read/parse/write problem returns silently.
 * A guard that breaks the session is worse than no guard.
 *
 * Escape: DEVFLOW_SKIP_PROGRESS_GUARD=1
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Single source of truth. progress-guard.cjs depends only on node:crypto, so it
// is safe to load from a hook — unlike most of bin/lib, which pulls in
// helpers.cjs and reads JSON at module load.
const { record, message } = require('../devflow/bin/lib/progress-guard.cjs');

const STATE_FILE = '.progress-guard.json';
/** Sessions older than this are pruned so the state file stays small. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** Tools whose repetition is normal and not a loop signal. */
const IGNORED_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion']);

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) return path.join(dir, '.planning');
    dir = path.dirname(dir);
  }
  return null;
}

function loadState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

function saveState(file, state) {
  try { fs.writeFileSync(file, JSON.stringify(state), 'utf8'); } catch { /* best effort */ }
}

function prune(all, nowMs) {
  const out = {};
  for (const [sid, entry] of Object.entries(all)) {
    if (entry && typeof entry.updated === 'number' && nowMs - entry.updated < SESSION_TTL_MS) {
      out[sid] = entry;
    }
  }
  return out;
}

function main() {
  if (process.env.DEVFLOW_SKIP_PROGRESS_GUARD === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }

  const tool = input.tool_name;
  if (!tool || IGNORED_TOOLS.has(tool)) return;

  const planningDir = findPlanningDir(process.cwd());
  if (!planningDir) return; // not a DevFlow project

  const sessionId = String(input.session_id || 'unknown');
  const file = path.join(planningDir, STATE_FILE);
  const now = Date.now();

  const all = prune(loadState(file), now);
  const prior = (all[sessionId] && all[sessionId].guard) || null;

  const result = record(prior, { tool, args: input.tool_input || {} });

  all[sessionId] = { guard: result.state, updated: now };
  saveState(file, all);

  if (!result.tripped) return;

  const text = message(result, tool);

  if (result.level === 'stuck') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: text,
      },
    }));
    return;
  }

  // warn: visible, non-blocking — the agent keeps control of its own loop
  process.stderr.write(`${text}\n`);
}

if (require.main === module) main();

module.exports = { findPlanningDir, prune, IGNORED_TOOLS, SESSION_TTL_MS };
