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
 *
 * TRD 24-02 additions:
 *   - EXECUTE rule (/devflow:execute-objective)
 *   - TODO rule (/devflow:todo add)
 *   - QUICK rule (/devflow:quick)
 *   - BUILD rule extended (bare objective, this/that, let's build, start building)
 *   - BUILD suppression post-filter: if todo-add/quick/objective-add matched, drop build
 *   - Override phrase suppression via hasOverridePhrase (from lib/edit-override.js)
 *   - matchIntent opts.skillActive: pure second-arg option suppresses all matches
 *   - main() writes .edit-override marker before early-return on override prompts
 */

const fs = require('fs');
const path = require('path');
const { hasOverridePhrase, writeEditOverrideMarker } = require('./lib/edit-override.js');

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
  // BUILD: imperative + article + noun (original)
  //      | build/implement + objective (bare, no article required)
  //      | build/implement + this/that (no trailing noun required)
  //      | let's/lets + build/implement
  //      | start building
  {
    rx: /\b(?:build|implement|ship|make|create|add)\s+(?:the|a|an|this|that|some)\s+\w+|\b(?:build|implement)\s+objective\b|\b(?:build|implement)\s+(?:this|that)\b|let'?s\s+(?:build|implement)\b|\bstart\s+building\b/i,
    skill: '/devflow:build',
    label: 'build',
  },
  // EXECUTE: execute/run + (the)? + objective
  {
    rx: /\b(?:execute|run)\s+(?:the\s+)?(?:planned\s+)?objective\b/i,
    skill: '/devflow:execute-objective',
    label: 'execute',
  },
  // TODO: add/create + (a)? + todo | remember to
  {
    rx: /\b(?:add|create)\s+(?:a\s+)?todo\b|\bremember\s+to\b/i,
    skill: '/devflow:todo add',
    label: 'todo-add',
  },
  // QUICK: make/take/do + a + quick pass | small change
  {
    rx: /\b(?:make|take|do)\s+a\s+quick\s+pass\b|\bsmall\s+change\b/i,
    skill: '/devflow:quick',
    label: 'quick',
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
//
// TRD 24-02 additions:
//   opts.skillActive {boolean} -- if true, suppress all matches (pure option, no fs)
//   Override phrase suppression via hasOverridePhrase (imported from lib/edit-override.js)
//   BUILD suppression post-filter: drop 'build' entry whenever any of
//     {todo-add, quick, objective-add} are in the matched labels.

function matchIntent(prompt, opts = {}) {
  if (!prompt) return [];
  if (/^\s*\/(devflow:|df:)/i.test(prompt)) return [];
  if (/^\s*(?:why|how|can|could|would|should|is|are|does|did|do)\b/i.test(prompt)) return [];
  // Override phrase suppression — returns [] (no directive; main() writes marker separately)
  if (hasOverridePhrase(prompt)) return [];
  // skillActive suppression — pure option, no fs I/O
  if (opts.skillActive) return [];
  const matched = INTENT_MAP.filter(e => e.rx.test(prompt));
  // BUILD suppression post-filter (option c — smallest diff):
  // If any of {todo-add, quick, objective-add} matched, drop the build entry
  const suppressBuild = matched.some(e => ['todo-add', 'quick', 'objective-add'].includes(e.label));
  const filtered = suppressBuild ? matched.filter(e => e.label !== 'build') : matched;
  return [...new Set(filtered.map(m => m.skill))];
}

// renderDirective -- 23-02: compact box-drawn directive (<=400 bytes).
// Five-line box: top border, OBLIGATORY header, skill list, DENY notice, bottom border.
// Inner width adapts to the longest content line (min 38).

function renderDirective(skills) {
  const skillList = skills.join(' or ');
  const lines = [
    'DEVFLOW ROUTING — OBLIGATORY',
    'Use ' + skillList,
    'gate-edits.js will DENY ambient edits',
  ];
  const innerWidth = Math.max(38, ...lines.map(l => l.length));
  const row = s => '║ ' + s + ' '.repeat(innerWidth - s.length) + ' ║';
  const BOX_TOP = '╔' + '═'.repeat(innerWidth + 2) + '╗';
  const BOX_BOT = '╚' + '═'.repeat(innerWidth + 2) + '╝';
  return [BOX_TOP, ...lines.map(row), BOX_BOT].join('\n');
}

// main -- entry point when executed directly
//
// TRD 24-02 wiring:
//   1. Parse input (prompt from UserPromptSubmit payload)
//   2. Find planningDir; none → return
//   3. If override phrase detected → writeEditOverrideMarker BEFORE matchIntent early-return
//      (override prompts produce no directive but MUST arm gate bypass — decisions 1+4)
//   4. Read skillActive from .planning/.skill-active presence (fs I/O here, not in matchIntent)
//   5. Match intent with { skillActive }; empty → return
//   6. Emit directive

function main() {
  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  const prompt = (input.prompt || '').trim();
  if (!prompt) return;

  const planningDir = findPlanningDir(process.cwd());
  if (!planningDir) return;

  // CRITICAL: write marker BEFORE matchIntent check — override prompts return [] by design
  // yet MUST still arm the gate bypass (locked decisions 1+4 from 24-CONTEXT.md)
  if (hasOverridePhrase(prompt)) {
    writeEditOverrideMarker(planningDir);
    return;
  }

  const skillActive = fs.existsSync(path.join(planningDir, '.skill-active'));
  const skills = matchIntent(prompt, { skillActive });
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
