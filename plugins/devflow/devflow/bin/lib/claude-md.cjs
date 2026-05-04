'use strict';

// CLAUDE.md absorption — extract TDD/test/scope directives from user playbooks.
//
// Conservative: only matches H2 headings whose text suggests TDD, test, quality,
// or scope policy. Returns extracted directives as structured data, not raw markdown.

const fs = require('fs');
const path = require('path');
const os = require('os');

const HEADING_PATTERNS = [
  /^##\s+.*\bTDD\b/i,
  /^##\s+.*\bTest(ing)?\b/i,
  /^##\s+.*\bQuality\b/i,
  /^##\s+.*\bScope\b/i,
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

    // tdd: strict — existing pattern + new
    if (/all\s+(business\s+logic|features?)\s+(must\s+be|default(s)?\s+to)\s+tdd/.test(body)
        || /force\s+tdd\s+trds?\s+at\s+planning/.test(body)
        || /every\s+(feature|trd)\s+(a\s+)?(`?)type\s*=\s*tdd/.test(body)) {
      overrides.tdd = 'strict';
    }

    // multitenancy guard — existing pattern
    if (/multi-?tenan(t|cy)\s+(guard|isolation|assertion).*every\s+test/.test(body)
        || /test\s+the\s+wrong-?tenant.*always/.test(body)) {
      overrides.multitenancy = 'required';
    }

    // propertyBased skip — existing pattern
    if (/skip\s+property-?based/.test(body) || /no\s+property-?based/.test(body)) {
      overrides.propertyBased = 'skip';
    }

    // test_list_first: required — new pattern (TDD Playbook habit 2)
    if (/test\s+list\s+(first|of\s+behaviors?)/.test(body)
        || /behavior[\s-]cases?\s+checklist/.test(body)) {
      overrides.test_list_first = 'required';
    }

    // fixture_strategy: generators — new pattern (TDD Playbook habit 4)
    if (/fixture\s+(builders?|generators?|factory|factories)/.test(body)
        || /factory\s+functions?/.test(body)
        || /no\s+llm[\s-]generated\s+test\s+data/.test(body)) {
      overrides.fixture_strategy = 'generators';
    }
  }

  return overrides;
}

module.exports = {
  absorb,
  deriveOverrides,
  extractSections,
  isRelevantHeading,
};
