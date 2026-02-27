#!/usr/bin/env node

/**
 * DevFlow Commit Verification Hook (SubagentStop hook)
 *
 * Triggers when an executor subagent completes.
 * Verifies that git commits were actually made (checks for recent commits).
 * Warns if no commits found (possible silent failure).
 *
 * Hook type: SubagentStop (fires when a subagent finishes)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Find the .planning directory
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

function main() {
  const planningDir = findPlanningDir();
  if (!planningDir) return; // Not a DevFlow project

  // Check if there are recent commits (within last 10 minutes)
  try {
    const result = execSync(
      'git log --oneline --since="10 minutes ago" 2>/dev/null',
      { encoding: 'utf8', timeout: 5000 }
    ).trim();

    if (!result) {
      // No recent commits — this might indicate a silent failure
      // Only warn if we're in a DevFlow execution context
      const stateFile = path.join(planningDir, 'STATE.md');
      if (fs.existsSync(stateFile)) {
        const stateContent = fs.readFileSync(stateFile, 'utf8');
        // Check if we're mid-execution (status indicates active work)
        if (stateContent.includes('Executing') || stateContent.includes('In progress')) {
          console.error('\n⚠ DevFlow: No git commits found in last 10 minutes.');
          console.error('  If an executor was running, this may indicate a silent failure.');
          console.error('  Check the SUMMARY.md for the current objective.\n');
        }
      }
    }
  } catch (e) {
    // Silently fail — hook should never block
  }
}

main();
