#!/usr/bin/env node

/**
 * DevFlow Commit Gate (PreToolUse, Bash)
 *
 * Blocks raw `git commit` invocations in DevFlow-initialized projects and
 * redirects Claude to use `df-tools.cjs commit` (which preserves objective
 * scope, task IDs, and updates STATE.md).
 *
 * Exceptions:
 *   - When the command is already invoking df-tools.cjs commit
 *   - When commit message prefix is "chore(release):", "docs:", "wip:"
 *     (metadata/handoff commits use raw git via df-tools internally and are
 *     allowed through if df-tools is unavailable)
 *   - When DEVFLOW_ALLOW_RAW_COMMIT=1 env is set (escape hatch for the user)
 *
 * Non-DevFlow repos: pass through unchanged.
 */

const fs = require('fs');
const path = require('path');

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

function deny(reason) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

function main() {
  if (process.env.DEVFLOW_ALLOW_RAW_COMMIT === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  if (input.tool_name !== 'Bash') return;

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) return;

  // Only gate git commit
  if (!/\bgit\s+commit\b/.test(cmd)) return;

  // Allow df-tools commit wrapper
  if (/df-tools\.cjs\s+commit\b/.test(cmd)) return;

  const planningDir = findPlanningDir(process.cwd());
  if (!planningDir) return; // Not a DevFlow project — pass through

  // 23-02: gate on ROADMAP.md or objectives/ — both are created only by new-project,
  // so either presence proves DevFlow initialization. STATE.md check removed: it was
  // absent on brand-new projects (post-init, pre-first-execution), bypassing the gate.
  const roadmapExists = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
  const objectivesDirExists = fs.existsSync(path.join(planningDir, 'objectives'));
  if (!roadmapExists && !objectivesDirExists) return; // Planning dir exists but uninitialized

  deny([
    'DevFlow project detected. Raw `git commit` is blocked.',
    'Use `node ~/.claude/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` so the commit is scoped to the active task/plan and STATE.md stays consistent.',
    'Commit format: `{type}({objective}-{trd}): {task}` (see devflow/references/git-integration.md).',
    'Escape hatch: set DEVFLOW_ALLOW_RAW_COMMIT=1 if you really need to bypass (e.g. release/chore commits outside a plan).'
  ].join(' '));
}

main();
