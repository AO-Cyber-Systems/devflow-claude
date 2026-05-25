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

  // ─── Obj 12: broader-lexicon entries (B item) ────────────────────────────
  // New entries are additive. Existing 11 are intentionally strict and unchanged.
  // Each carries an optional `hint` (4-6 words) used in multi-match disambig UI.

  // NEW-MILESTONE: must come BEFORE build to win for "make a new milestone".
  // Otherwise the build rule (make + a + \w+) wins via filter-first-match order.
  {
    rx: /\b(?:make|create|start)\s+a\s+new\s+milestone\b/i,
    skill: '/devflow:new-milestone',
    label: 'new-milestone',
    hint: 'create a new milestone',
  },
  // BUILD (extension): ship-it, let's work-on, let's start, I want to build
  {
    rx: /\bship\s+it\b|\blet'?s\s+(?:work\s+on|start)\s+(?:the|a|an)\s+\w+|\bI\s+want\s+to\s+(?:build|implement|make|create)\s+(?:the|a|an)\s+\w+/i,
    skill: '/devflow:build',
    label: 'build',
    hint: 'plan + execute a multi-subsystem feature',
  },
  // DEBUG (extension): "I want to fix the broken/failing X" with broader noun list
  {
    rx: /\bI\s+want\s+to\s+fix\s+(?:the|this|that)\s+(?:\w+\s+){0,3}(?:bug|error|crash|failure|issue|problem|test|build|ci|broken\s+\w+|failing\s+\w+|login|module|component|hook|service)\b/i,
    skill: '/devflow:debug',
    label: 'debug',
    hint: 'fix a bug or failing test',
  },
  // QUICK: do/make/take a quick pass/fix/change/update
  {
    rx: /\b(?:do|make|take)\s+a\s+quick\s+(?:pass|fix|change|update)\b/i,
    skill: '/devflow:quick',
    label: 'quick',
    hint: 'small feature, <5 files',
  },
  // STATUS (extension): natural status queries (what NOT in Q&A skip-list)
  {
    rx: /\bwhat\s+should\s+I\s+work\s+on\b|\bwhat'?s\s+next\b|\bwhat'?s\s+on\s+my\s+plate\b/i,
    skill: '/devflow:status',
    label: 'status',
    hint: 'show current position + next action',
  },
  // STATUS PAUSE (extension): save my progress / I'm stopping / leaving for now
  {
    rx: /\bsave\s+my\s+progress\b|\bI'?m\s+stopping\b|\bleaving\s+for\s+now\b/i,
    skill: '/devflow:status pause',
    label: 'pause',
    hint: 'snapshot state + pause work',
  },
  // STATUS RESUME (extension): let's pick up where we/I stopped
  {
    rx: /\blet'?s\s+pick\s+up\s+where\s+(?:we|I)\s+stopped\b/i,
    skill: '/devflow:status resume',
    label: 'resume',
    hint: 'resume work from last snapshot',
  },
  // AWARENESS: what'd I miss / show me recent activity
  {
    rx: /\bwhat'?d\s+I\s+miss\b|\bshow\s+me\s+(?:the\s+)?recent\s+activity\b/i,
    skill: '/devflow:awareness',
    label: 'awareness',
    hint: 'cross-repo + peer activity check',
  },
  // ADD-TODO: add/create a todo for/item/about
  {
    rx: /\b(?:add|create)\s+a\s+todo\s+(?:for|item|about)\b/i,
    skill: '/devflow:add-todo',
    label: 'add-todo',
    hint: 'add a new todo item',
  },
  // CHECK-TODOS: any todos / check (this|the|my) todos
  {
    rx: /\b(?:any\s+todos|check\s+(?:this|the|my)\s+todos?)\b/i,
    skill: '/devflow:check-todos',
    label: 'check-todos',
    hint: 'list outstanding todos',
  },
  // VERIFY (extension): verify this/the-current objective
  {
    rx: /\bverify\s+(?:this|the\s+current)\s+objective\b/i,
    skill: '/devflow:verify-work',
    label: 'verify',
    hint: 'verify objective completion',
  },
  // RESEARCH (extension): research how to X / investigate the X library
  {
    rx: /\bresearch\s+how\s+to\s+\w+|\binvestigate\s+(?:the\s+)?\w+\s+library\b/i,
    skill: '/devflow:research-objective',
    label: 'research',
    hint: 'research approach + libraries',
  },
  // AUDIT-MILESTONE: audit the milestone
  {
    rx: /\baudit\s+(?:the\s+)?milestone\b/i,
    skill: '/devflow:audit-milestone',
    label: 'audit-milestone',
    hint: 'audit milestone state',
  },
  // GH-SYNC: sync/push to github
  {
    rx: /\b(?:sync|push)\s+to\s+github\b/i,
    skill: '/devflow:gh-sync',
    label: 'gh-sync',
    hint: 'sync planning state to GitHub',
  },
  // DISCUSS-OBJECTIVE: discuss the/this objective
  {
    rx: /\bdiscuss\s+(?:the|this)\s+objective\b/i,
    skill: '/devflow:discuss-objective',
    label: 'discuss-objective',
    hint: 'interactive objective discussion',
  },
];

// matchIntent -- Returns deduplicated array of enriched match objects.
// Shape: Array<{ skill, label, hint }>. `hint` defaults to '' for legacy entries.
// Q&A skip-rule: prompts starting with interrogative words (Why/How/Can/etc) return [].
// NOTE: "What" NOT in skip-list -- "What's our progress?" is a status fire prompt.

function matchIntent(prompt) {
  if (!prompt) return [];
  if (/^\s*\/(devflow:|df:)/i.test(prompt)) return [];
  if (/^\s*(?:why|how|can|could|would|should|is|are|does|did|do)\b/i.test(prompt)) return [];
  const matches = INTENT_MAP.filter(e => e.rx.test(prompt));
  // Dedup by skill (preserve first match metadata for that skill)
  const seen = new Set();
  const result = [];
  for (const m of matches) {
    if (seen.has(m.skill)) continue;
    seen.add(m.skill);
    result.push({ skill: m.skill, label: m.label, hint: m.hint || '' });
  }
  return result;
}

// renderDirective -- box-drawn obligatory directive for additionalContext injection.
// Accepts enriched match objects from matchIntent: Array<{ skill, label, hint }>.
// When 2+ matches, renders a disambiguation box and asks Claude to confirm with user.
// `prompt` (optional) is echoed back via a "Triggered by:" line for routing visibility.

function padEnd(s, width) {
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

function extractTriggerExcerpt(prompt) {
  const trimmed = (prompt || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 45) return trimmed;
  return trimmed.slice(0, 42) + '...';
}

function renderSingleMatch(match, prompt) {
  const skillList = match.skill;
  const excerpt = extractTriggerExcerpt(prompt);
  const BOX_TOP = '╔' + '═'.repeat(70) + '╗';
  const BOX_DIV = '╠' + '═'.repeat(70) + '╣';
  const BOX_BOT = '╚' + '═'.repeat(70) + '╝';
  const L = '║';
  const pad = (s, w) => L + ' ' + padEnd(s, w) + L;
  const lines = [
    BOX_TOP,
    pad('           DEVFLOW ROUTING DIRECTIVE — OBLIGATORY', 68),
    BOX_DIV,
  ];
  if (excerpt) {
    lines.push(pad('Triggered by: "' + excerpt + '"', 68));
    lines.push(pad('', 68));
  }
  lines.push(
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
  );
  return lines.join('\n');
}

function renderMultiMatch(matches, prompt) {
  const excerpt = extractTriggerExcerpt(prompt);
  const BOX_TOP = '╔' + '═'.repeat(70) + '╗';
  const BOX_DIV = '╠' + '═'.repeat(70) + '╣';
  const BOX_BOT = '╚' + '═'.repeat(70) + '╝';
  const L = '║';
  const pad = (s, w) => L + ' ' + padEnd(s, w) + L;
  const lines = [
    BOX_TOP,
    pad('       DEVFLOW ROUTING — MULTIPLE INTENTS MATCHED', 68),
    BOX_DIV,
  ];
  if (excerpt) {
    lines.push(pad('Triggered by: "' + excerpt + '"', 68));
    lines.push(pad('', 68));
  }
  lines.push(pad('Your prompt matched more than one routing intent:', 68));
  lines.push(pad('', 68));
  matches.forEach((m, i) => {
    const hint = m.hint ? ' — ' + m.hint : '';
    lines.push(pad('  ' + (i + 1) + '. ' + m.skill + hint, 68));
  });
  lines.push(pad('', 68));
  lines.push(pad('Confirm with the user which skill to invoke BEFORE', 68));
  lines.push(pad('editing code. Do NOT call Edit/Write/MultiEdit until', 68));
  lines.push(pad('the user picks one. gate-edits.js will DENY edits', 68));
  lines.push(pad('in ambient mode without a skill.', 68));
  lines.push(BOX_BOT);
  return lines.join('\n');
}

function renderDirective(matches, prompt = '') {
  if (!matches || matches.length === 0) return '';
  if (matches.length === 1) return renderSingleMatch(matches[0], prompt);
  return renderMultiMatch(matches, prompt);
}

// main -- entry point when executed directly

function main() {
  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  const prompt = (input.prompt || '').trim();
  if (!prompt) return;

  if (!findPlanningDir(process.cwd())) return;

  const matches = matchIntent(prompt);
  if (matches.length === 0) return;

  const out = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: renderDirective(matches, prompt),
    },
  };
  process.stdout.write(JSON.stringify(out));
}

if (require.main === module) main();

module.exports = { INTENT_MAP, matchIntent, renderDirective, findPlanningDir };
