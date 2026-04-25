#!/usr/bin/env node

/**
 * DevFlow Edit Gate (PreToolUse, Edit|Write|MultiEdit)
 *
 * Warns (does not block) when Claude edits code directly in a DevFlow project
 * that has a planned objective but no executor subagent has been spawned.
 * The warning is fed back as context so the model self-corrects to use
 * /devflow:execute-objective.
 *
 * Permits edits to:
 *   - .planning/**        (planning artifacts are edited directly)
 *   - *.md docs           (documentation updates)
 *   - When running inside a subagent (parent is the executor)
 *
 * Blocks when DEVFLOW_STRICT_EDITS=1 and an in-progress TRD is detected.
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

function hasInProgressTRD(planningDir) {
  const objectivesDir = path.join(planningDir, 'objectives');
  if (!fs.existsSync(objectivesDir)) return null;
  try {
    for (const obj of fs.readdirSync(objectivesDir, { withFileTypes: true })) {
      if (!obj.isDirectory()) continue;
      const objDir = path.join(objectivesDir, obj.name);
      for (const f of fs.readdirSync(objDir)) {
        if (!/-TRD\.md$/.test(f)) continue;
        const content = fs.readFileSync(path.join(objDir, f), 'utf8');
        // Frontmatter status: in-progress | planned (not completed)
        const m = content.match(/^status:\s*(\S+)/m);
        if (m && /^(in-progress|planned|ready)$/i.test(m[1])) {
          return { objective: obj.name, trd: f, status: m[1] };
        }
      }
    }
  } catch {}
  return null;
}

function main() {
  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }

  const tool = input.tool_name;
  if (!/^(Edit|Write|MultiEdit)$/.test(tool)) return;

  const filePath = (input.tool_input && input.tool_input.file_path) || '';
  if (!filePath) return;

  // Permit planning artifacts and markdown docs
  if (/\/\.planning\//.test(filePath)) return;
  if (/\.md$/i.test(filePath)) return;

  const planningDir = findPlanningDir(process.cwd());
  if (!planningDir) return;

  const active = hasInProgressTRD(planningDir);
  if (!active) return;

  const reason = [
    `DevFlow: objective ${active.objective} has a ${active.status} TRD (${active.trd}).`,
    'Direct Edit/Write bypasses atomic per-task commits, STATE tracking, and verification.',
    'Spawn the executor via /devflow:execute-objective (or /devflow:build for end-to-end).',
    'Use /devflow:quick only for small out-of-plan tasks.'
  ].join(' ');

  if (process.env.DEVFLOW_STRICT_EDITS === '1') {
    const out = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason + ' (DEVFLOW_STRICT_EDITS=1 blocks bypass.)'
      }
    };
    process.stdout.write(JSON.stringify(out));
    return;
  }

  // Soft warning — inject as additional context, allow through
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason
    }
  };
  process.stdout.write(JSON.stringify(out));
}

main();
