#!/usr/bin/env node

/**
 * DevFlow Intent Routing Hook (UserPromptSubmit)
 *
 * When a DevFlow-initialized project is detected (.planning/ exists) and the
 * user's prompt signals build/plan/verify/debug intent WITHOUT invoking a
 * /devflow: skill, inject a system reminder telling Claude to route through
 * the appropriate skill rather than editing code directly.
 *
 * Mechanism: stdout JSON with additionalContext is injected as a system note
 * the model must consider before responding.
 *
 * Never blocks. Silent for non-DevFlow repos and for explicit skill calls.
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

// Intent -> recommended skill
const INTENT_MAP = [
  { rx: /\b(build|implement|ship|make|create)\s+(the|a|this|that|feature|it)\b/i, skill: '/devflow:build' },
  { rx: /\b(discuss|shape|preferences?\s+for|decisions?\s+for)\s+(objective|the|this|it)\b/i, skill: '/devflow:discuss-objective' },
  { rx: /\b(plan|break\s*down|design)\s+(objective|the|this|it)\b/i, skill: '/devflow:plan-objective' },
  { rx: /\b(execute|run|start)\s+(objective|the\s+plan|build)\b/i, skill: '/devflow:execute-objective' },
  { rx: /\b(verify|test|validate|check)\s+(work|it|the|what|objective)\b/i, skill: '/devflow:verify-work' },
  { rx: /\b(debug|not\s+working|broken|error|bug|crash|fail(ed|ing)?)\b/i, skill: '/devflow:debug' },
  { rx: /\b(new\s+project|start\s+a\s+project|initialize)\b/i, skill: '/devflow:new-project' },
  { rx: /\b(research|investigate|explore\s+options)\b/i, skill: '/devflow:research-objective' },
  { rx: /\b(resume|continue|pick\s+up|where\s+(we|I)\s+left)\b/i, skill: '/devflow:resume-work' },
  { rx: /\b(pause|stop\s+for\s+now|save\s+context)\b/i, skill: '/devflow:pause-work' },
  { rx: /\b(progress|status|where\s+are\s+we|what'?s?\s+next)\b/i, skill: '/devflow:progress' },
  { rx: /\b(audit|security\s+(scan|check|audit))\b/i, skill: '/devflow:security-audit' },
  { rx: /\b(map|analyze|understand)\s+(the\s+)?codebase\b/i, skill: '/devflow:map-codebase' },
  { rx: /\b(sync.*github|push.*(issues|objectives).*github|github\s+(release|notes|issues))\b/i, skill: '/devflow:gh-sync' },
];

function main() {
  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  const prompt = (input.prompt || '').trim();
  if (!prompt) return;

  // Already invoking a skill — do nothing
  if (/^\s*\/(devflow:|df:)/i.test(prompt)) return;

  const planningDir = findPlanningDir(process.cwd());
  if (!planningDir) return; // Not a DevFlow project

  // Detect intent
  const matches = INTENT_MAP.filter(e => e.rx.test(prompt));
  if (matches.length === 0) return;

  const skills = [...new Set(matches.map(m => m.skill))];
  const reminder = [
    'DevFlow project detected (.planning/ exists).',
    `The user's request signals intent matching: ${skills.join(', ')}.`,
    'You MUST invoke the appropriate skill via the Skill tool before editing code directly.',
    'Skills enforce atomic commits, state tracking, and verification. Bypassing them causes drift.',
    'If the request is genuinely out-of-scope for DevFlow (docs, small ad-hoc fix), proceed — but prefer /devflow:quick for small tasks.'
  ].join(' ');

  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: reminder
    }
  };
  process.stdout.write(JSON.stringify(output));
}

main();
