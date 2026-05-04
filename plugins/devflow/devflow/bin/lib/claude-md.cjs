'use strict';

// CLAUDE.md absorption — extract TDD/test/scope directives from user playbooks.
//
// Conservative: only matches H2 headings whose text suggests TDD, test, quality,
// or scope policy. Returns extracted directives as structured data, not raw markdown.
//
// Pattern resilience note: PLAYBOOK_HABITS patterns are derived from the literal text
// in the user's ~/.claude/CLAUDE.md. They use 2-3 alternative phrasings per habit
// to tolerate natural evolution of the playbook wording. If the user rewrites their
// playbook significantly, patterns may need updating.

const fs = require('fs');
const path = require('path');
const os = require('os');

const HEADING_PATTERNS = [
  /^##\s+.*\bTDD\b/i,
  /^##\s+.*\bTest(ing)?\b/i,
  /^##\s+.*\bQuality\b/i,
  /^##\s+.*\bScope\b/i,
];

// Six TDD Playbook habits from the user's ~/.claude/CLAUDE.md.
// Patterns are case-insensitive (/i flag) and single-line (no 's' flag — prevents cross-line
// false positives in multi-line bullet bodies).
//
// field: null → freeform directive only (habit 3); no structured override emitted.
// field: string → structured override: overrides[field] = value
const PLAYBOOK_HABITS = [
  {
    id: 1,
    name: 'force_tdd_at_planning',
    patterns: [
      /force\s+tdd\s+trds?\s+at\s+planning/i,
      /all\s+features?\s+default\s+to\s+tdd\s+strict/i,
      /make\s+every\s+feature\s+a\s+`?type\s*=\s*tdd/i,
    ],
    field: 'tdd_default',
    value: 'auto', // Promotion (auto→strict) is the resolver's job per CONTEXT.md §3
  },
  {
    id: 2,
    name: 'test_list_first',
    patterns: [
      /test\s+list\s+first/i,
      /checklist\s+of\s+behavior\s+cases?/i,
      /before\s+any\s+test\s+code/i,
    ],
    field: 'test_list_first',
    value: 'required',
  },
  {
    id: 3,
    name: 'one_test_at_a_time',
    patterns: [
      /one\s+test\s+at\s+a\s+time/i,
      /red\s*[→\->]+\s*green\s*[→\->]+\s*refactor/i,
    ],
    field: null, // Freeform-only: directive preserved in absorb()'s directives.tdd[].body
    value: null,
  },
  {
    id: 4,
    name: 'fixture_generators',
    patterns: [
      /fixture\s+(generators?|builders?|factory\s+functions?)/i,
      /no\s+llm[\- ]+generated\s+test\s+data/i,
      /recorded\s+cassettes?/i,
    ],
    field: 'fixture_strategy',
    value: 'generators',
  },
  {
    id: 5,
    name: 'outside_in',
    patterns: [
      /outside-?in\s+for\s+(ui|portal\s+flows?)/i,
      /start\s+at\s+the\s+highest\s+user-?observable\s+layer/i,
    ],
    field: 'outside_in',
    value: true,
  },
  {
    id: 6,
    name: 'multitenancy_guard',
    patterns: [
      /multitenancy\s+guard/i,
      /wrong-?tenant\s+isolation/i,
      /tenant\s+isolation.*every\s+test/i,
    ],
    field: 'security_isolation',
    value: 'multi_tenant_required',
  },
];

function isRelevantHeading(line) {
  return HEADING_PATTERNS.some((re) => re.test(line));
}

function extractSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const isH2 = /^##\s+/.test(line);
    if (isH2) {
      if (current) sections.push(current);
      if (isRelevantHeading(line)) {
        current = { heading: line.replace(/^##\s+/, '').trim(), body: [] };
      } else {
        current = null;
      }
    } else if (current) {
      // Stop at any H1 (rare in CLAUDE.md but defensive)
      if (/^#\s+/.test(line)) {
        sections.push(current);
        current = null;
      } else {
        current.body.push(line);
      }
    }
  }
  if (current) sections.push(current);

  return sections.map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() }));
}

function readClaudeMd(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// Returns absorbed directives from both user-global and project-level CLAUDE.md.
// Project-level wins on conflict (added last so it overwrites in dedup).
//
// Options:
//   userHome — override the user home dir (for tests). Defaults to os.homedir().
//   projectRoot — directory to look for ./CLAUDE.md. If unset, only user-level read.
function absorb({ userHome, projectRoot } = {}) {
  const home = userHome || os.homedir();
  const userPath = path.join(home, '.claude', 'CLAUDE.md');
  const projectPath = projectRoot ? path.join(projectRoot, 'CLAUDE.md') : null;

  const directives = { tdd: [], test: [], quality: [], scope: [], _sources: [] };

  function ingest(filePath, sourceLabel) {
    const content = readClaudeMd(filePath);
    if (!content) return;
    const sections = extractSections(content);
    if (sections.length === 0) return;
    directives._sources.push({ source: sourceLabel, path: filePath, sections: sections.length });
    for (const s of sections) {
      const heading = s.heading.toLowerCase();
      let bucket = null;
      if (heading.includes('tdd')) bucket = 'tdd';
      else if (heading.includes('test')) bucket = 'test';
      else if (heading.includes('quality')) bucket = 'quality';
      else if (heading.includes('scope')) bucket = 'scope';
      if (bucket) {
        directives[bucket].push({ source: sourceLabel, heading: s.heading, body: s.body });
      }
    }
  }

  ingest(userPath, 'user');
  if (projectPath) ingest(projectPath, 'project');

  return directives;
}

// Convert absorbed directives into override hints for the resolver.
// Heuristic: if a TDD section's body contains certain phrases, emit an override.
//
// Conservative phrase list — only triggers on clear policy statements.
// Project-level sections win over user-level (sorted order: user first, project last,
// so project overwrites on conflict).
function deriveOverrides(directives) {
  const overrides = {};
  const tddSections = (directives.tdd || []).concat(directives.test || []);

  // _playbookDetected: true when any TDD/test sections are found at all.
  // The resolver uses this to decide whether to apply promotion rules.
  overrides._playbookDetected = (tddSections.length > 0);

  if (tddSections.length === 0) return overrides;

  // Project-level wins over user-level — sort so project comes last
  const sorted = [...tddSections].sort((a, b) => {
    if (a.source === b.source) return 0;
    return a.source === 'user' ? -1 : 1;
  });

  for (const section of sorted) {
    const body = section.body.toLowerCase();

    // ── Legacy structured overrides (preserved for back-compat) ──────────────

    // tdd: strict (legacy field — TRD 0.2 resolver reads this for legacy fallback)
    if (/all\s+(business\s+logic|features?)\s+(must\s+be|default(s)?\s+to)\s+tdd/.test(body)
        || /force\s+tdd\s+trds?\s+at\s+planning/.test(body)
        || /every\s+(feature|trd)\s+(a\s+)?(`?)type\s*=\s*tdd/.test(body)) {
      overrides.tdd = 'strict';
    }

    // multitenancy: required (legacy field — back-compat with pre-0.4 callers)
    if (/multi-?tenan(t|cy)\s+(guard|isolation|assertion).*every\s+test/.test(body)
        || /test\s+the\s+wrong-?tenant.*always/.test(body)) {
      overrides.multitenancy = 'required';
    }

    // propertyBased: skip (legacy field)
    if (/skip\s+property-?based/.test(body) || /no\s+property-?based/.test(body)) {
      overrides.propertyBased = 'skip';
    }

    // ── New structured overrides (PLAYBOOK_HABITS loop) ──────────────────────

    for (const habit of PLAYBOOK_HABITS) {
      if (habit.field === null) continue; // Habit 3 is freeform-only; body preserved in directives.tdd[].body

      // Use the original (non-lowercased) body for patterns that have /i flag;
      // this keeps the /i patterns accurate and doesn't interfere with legacy
      // patterns that use the lowercased `body` variable above.
      const matched = habit.patterns.some((re) => re.test(section.body));
      if (matched) {
        overrides[habit.field] = habit.value;
      }
    }
  }

  return overrides;
}

module.exports = {
  absorb,
  deriveOverrides,
  extractSections,
  isRelevantHeading,
  PLAYBOOK_HABITS,
};
