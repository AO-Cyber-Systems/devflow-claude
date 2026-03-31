#!/usr/bin/env node

/**
 * DevFlow Completion Verification Hook (Stop hook)
 *
 * Triggers when a DevFlow execution completes.
 * Validates that SUMMARY.md exists and has proper evidence sections.
 * Warns if FAILED markers are found.
 *
 * Hook type: Stop (fires when conversation ends or context resets)
 */

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

  // Find the most recent SUMMARY.md (modified in last 10 minutes)
  const objectivesDir = path.join(planningDir, 'objectives');
  if (!fs.existsSync(objectivesDir)) return;

  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const recentSummaries = [];

  try {
    const objectives = fs.readdirSync(objectivesDir, { withFileTypes: true });
    for (const obj of objectives) {
      if (!obj.isDirectory()) continue;
      const objDir = path.join(objectivesDir, obj.name);
      const files = fs.readdirSync(objDir);
      for (const file of files) {
        if (!file.endsWith('-SUMMARY.md')) continue;
        const filePath = path.join(objDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs > tenMinutesAgo) {
          recentSummaries.push(filePath);
        }
      }
    }
  } catch (e) {
    return; // Silently fail — hook should never block
  }

  if (recentSummaries.length === 0) return;

  // Check each recent SUMMARY for issues
  const warnings = [];
  for (const summaryPath of recentSummaries) {
    try {
      const content = fs.readFileSync(summaryPath, 'utf8');
      const fileName = path.basename(summaryPath);

      // Check for Self-Check: FAILED
      if (content.includes('Self-Check: FAILED')) {
        warnings.push(`${fileName}: Self-Check FAILED — review missing items`);
      }

      // Check for Task Evidence table
      if (!content.includes('## Task Evidence')) {
        warnings.push(`${fileName}: Missing Task Evidence table`);
      }

      // Check for empty evidence
      if (content.includes('| - | - | - | - |')) {
        warnings.push(`${fileName}: Task Evidence table appears empty`);
      }
    } catch (e) {
      // Skip unreadable files
    }
  }

  if (warnings.length > 0) {
    console.error('\n⚠ DevFlow Completion Check:');
    for (const w of warnings) {
      console.error(`  - ${w}`);
    }
    console.error('');
  }
}

main();
