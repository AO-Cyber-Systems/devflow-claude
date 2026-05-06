#!/usr/bin/env node

/**
 * DevFlow Intent Routing Hook (UserPromptSubmit)
 *
 * When a DevFlow-initialized project is detected (.planning/ exists) and the
 * user prompt signals build/plan/verify/debug intent WITHOUT invoking a
 * /devflow: skill, inject a box-drawn OBLIGATORY directive telling Claude to
 * route through the appropriate skill rather than editing code directly.
 *
 * Regexes require imperative/possessive form -- bare verbs without article+noun
 * do NOT fire (prevents Q&A false positives).
 *
 * Phase G consolidated skill names only.
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

// INTENT_MAP -- EXPORTED for unit tests.
// Rules require imperative verb + article/possessive + project noun.
// No bare-verb matches -- prevents Q&A prompts from firing.

const INTENT_MAP = [
  // MICRO: imperative + article + trivial-noun (typo / line / semicolon / import / comment / whitespace / property name)
  // Routes ONLY trivial single-token changes; "small change" stays with quick.
  {
    rx: /\b(?:fix|correct|update|change|rename)\s+(?:the|this|that|a|an)\s+(?:typo|spelling|misspelling|comment|whitespace|indent(?:ation)?|semicolon|import|line|prop(?:erty)?\s+name|variable\s+name|function\s+name|filename)\b/i,
    skill: '/devflow:micro',
    label: 'micro',
  },
  // BUILD: imperative + article + noun
  {
    rx: /\b(?:build|implement|ship|make|create|add)\s+(?:the|a|an|this|that|some)\s+\w+/i,
    skill: '/devflow:build',
    label: 'build',
  },
  // DEBUG: imperative + article + optional-adjectives + bug-noun
  {
    rx: /\b(?:fix|debug|investigate|diagnose|troubleshoot)\s+(?:the|this|that|a|an)\s+(?:\w+\s+){0,3}(?:bug|error|crash|failure|issue|problem|test|build|ci)\b/i,
    skill: '/devflow:debug',
    label: 'debug',
  },
  // PLAN: plan + article + optional-adj + objective-noun
  {
    rx: /\b(?:plan|break\s+down|design)\s+(?:the|this|an|a)\s+(?:next\s+)?(?:objective|feature|task|work|milestone)\b|\bplan\s+next\s+(?:objective|feature|task|work|milestone)\b/i,
    skill: '/devflow:plan-objective',
    label: 'plan',
  },
  // VERIFY: verify + (the)? + work-noun
  {
    rx: /\b(?:verify|test|validate|check)\s+(?:the\s+)?(?:work|build|objective|feature|implementation)\b/i,
    skill: '/devflow:verify-work',
    label: 'verify',
  },
  // STATUS: possessive phrase "our/the progress/status" or "where are we"
  {
    rx: /\b(?:what'?s?\s+(?:our|the)\s+(?:progress|status))|\b(?:show|check)\s+(?:the\s+)?(?:progress|status)\b|\bwhere\s+are\s+we\b/i,
    skill: '/devflow:status',
    label: 'status',
  },
  // RESUME (consolidated): resume/continue/pick up + work/project/objective
  {
    rx: /\b(?:resume|continue|pick\s+up)\s+(?:the\s+)?(?:work|project|objective)\b|\bwhere\s+(?:we|I)\s+left\s+off\b/i,
    skill: '/devflow:status resume',
    label: 'resume',
  },
  // PAUSE (consolidated): pause/stop + work/project
  {
    rx: /\b(?:pause|stop)\s+(?:the\s+)?(?:work|project)\b|\b(?:pause|stop)\s+(?:for\s+(?:now|today|tonight|the\s+day))\b|\bsave\s+(?:the\s+)?context\b/i,
    skill: '/devflow:status pause',
    label: 'pause',
  },
  // OBJECTIVE ADD (consolidated): add/create + a/an/the + objective
  {
    rx: /\b(?:add|create)\s+(?:a|an|the)\s+objective\b/i,
    skill: '/devflow:objective add',
    label: 'objective-add',
  },
  // NEW PROJECT: new project / start a project / initialize devflow
  {
    rx: /\b(?:new\s+project|start\s+a\s+(?:new\s+)?project|initialize\s+(?:devflow|planning))\b/i,
    skill: '/devflow:new-project',
    label: 'new-project',
  },
  // RESEARCH: research/explore + objective/approach/library
  {
    rx: /\b(?:research|explore\s+options\s+for)\s+(?:the\s+)?(?:objective|approach|library|framework)\b/i,
    skill: '/devflow:research-objective',
    label: 'research',
  },
];

// matchIntent -- Returns deduplicated array of skill strings matching the prompt.
// Q&A skip-rule: prompts starting with interrogative words (Why/How/Can/etc) return [].
// NOTE: "What" NOT in skip-list -- "What's our progress?" is a status fire prompt.

function matchIntent(prompt) {
  if (!prompt) return [];
  if (/^\s*\/(devflow:|df:)/i.test(prompt)) return [];
  if (/^\s*(?:why|how|can|could|would|should|is|are|does|did|do)\b/i.test(prompt)) return [];
  const matches = INTENT_MAP.filter(e => e.rx.test(prompt));
  return [...new Set(matches.map(m => m.skill))];
}

// renderDirective -- box-drawn obligatory directive for additionalContext injection.

function padEnd(s, width) {
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

function renderDirective(skills) {
  const skillList = skills.join(' or ');
  const BOX_TOP    = '╔' + '═'.repeat(70) + '╗';
  const BOX_DIV    = '╠' + '═'.repeat(70) + '╣';
  const BOX_BOT    = '╚' + '═'.repeat(70) + '╝';
  const L = '║';
  const pad = (s, w) => L + ' ' + padEnd(s, w) + L;
  return [
    BOX_TOP,
    pad('           DEVFLOW ROUTING DIRECTIVE — OBLIGATORY', 68),
    BOX_DIV,
    pad('This is a DEVFLOW project (.planning/ exists).', 68),
    pad('Intent matched: ' + skillList, 68),
    pad('', 68),
    pad('You MUST invoke ' + skillList, 68),
    pad('via the Skill tool BEFORE editing any code.', 68),
    pad('', 68),
    pad('Do NOT call Edit, Write, or MultiEdit first.', 68),
    pad('gate-edits.js will DENY edits in ambient mode without a skill.', 68),
    pad('', 68),
    pad('If the request is out of scope (a question, tiny ad-hoc fix),', 68),
    pad('you may proceed -- but prefer /devflow:quick for <5 file changes.', 68),
    BOX_BOT,
  ].join('\n');
}

// main -- entry point when executed directly

function main() {
  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  const prompt = (input.prompt || '').trim();
  if (!prompt) return;

  if (!findPlanningDir(process.cwd())) return;

  const skills = matchIntent(prompt);
  if (skills.length === 0) return;

  const out = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: renderDirective(skills),
    },
  };
  process.stdout.write(JSON.stringify(out));
}

if (require.main === module) main();

module.exports = { INTENT_MAP, matchIntent, renderDirective, findPlanningDir };
