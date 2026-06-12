'use strict';

// Hand-built fixture generators for intent resolution tests.
// Per TDD playbook: factory functions, not LLM-generated test data.

const fs = require('fs');
const path = require('path');
const os = require('os');

function projectMd({ kind, default_work, body = 'Test project.' } = {}) {
  const lines = ['---'];
  if (kind !== undefined) lines.push(`kind: ${kind}`);
  if (default_work !== undefined) lines.push(`default_work: ${default_work}`);
  lines.push('---', '', '# Test Project', '', body, '');
  return lines.join('\n');
}

function objectiveMd({ work, overrides, body = 'Test objective.' } = {}) {
  const lines = ['---'];
  if (work !== undefined) lines.push(`work: ${work}`);
  if (overrides) {
    lines.push('overrides:');
    for (const [k, v] of Object.entries(overrides)) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  lines.push('---', '', '# Test Objective', '', body, '');
  return lines.join('\n');
}

function trdMd({
  type,
  confidence,
  work,
  allow_generated_test_data,
  use_property_based,
  use_gherkin,
  skip_multi_tenant_check,
  body = 'Test TRD.',
} = {}) {
  const lines = ['---', 'objective: 01-test', 'trd: 01'];
  if (type !== undefined) lines.push(`type: ${type}`);
  if (confidence !== undefined) lines.push(`confidence: ${confidence}`);
  if (work !== undefined) lines.push(`work: ${work}`);
  if (allow_generated_test_data !== undefined) lines.push(`allow_generated_test_data: ${allow_generated_test_data}`);
  if (use_property_based !== undefined) lines.push(`use_property_based: ${use_property_based}`);
  if (use_gherkin !== undefined) lines.push(`use_gherkin: ${use_gherkin}`);
  if (skip_multi_tenant_check !== undefined) lines.push(`skip_multi_tenant_check: ${skip_multi_tenant_check}`);
  lines.push('---', '', body, '');
  return lines.join('\n');
}

function claudeMd({ tddSection, otherSections = [] } = {}) {
  const lines = ['# CLAUDE.md', ''];
  for (const section of otherSections) {
    lines.push(`## ${section.heading}`, '', section.body, '');
  }
  if (tddSection) {
    lines.push(`## ${tddSection.heading || 'TDD Playbook'}`, '', tddSection.body, '');
  }
  return lines.join('\n');
}

// Build a temporary project tree on disk. Returns the project root path
// plus a `cleanup()` function. Tests call cleanup() in afterEach.
function buildProject({
  projectFrontmatter,
  objectives = [],     // [{ id, work, overrides, body }]
  claudeMdProject,     // string content for ./CLAUDE.md (project-level)
  claudeMdUser,        // string content for ~/.claude/CLAUDE.md replacement (we redirect via env)
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-intent-'));
  fs.mkdirSync(path.join(root, '.planning', 'objectives'), { recursive: true });

  if (projectFrontmatter !== false) {
    fs.writeFileSync(
      path.join(root, '.planning', 'PROJECT.md'),
      projectMd(projectFrontmatter || {}),
      'utf-8'
    );
  }

  for (const obj of objectives) {
    const dir = path.join(root, '.planning', 'objectives', obj.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'OBJECTIVE.md'),
      objectiveMd(obj),
      'utf-8'
    );
  }

  if (claudeMdProject !== undefined) {
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), claudeMdProject, 'utf-8');
  }

  // For user-CLAUDE.md absorption tests, write to a sandboxed home dir
  let userHome;
  if (claudeMdUser !== undefined) {
    userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-home-'));
    fs.mkdirSync(path.join(userHome, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(userHome, '.claude', 'CLAUDE.md'), claudeMdUser, 'utf-8');
  }

  return {
    root,
    userHome,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
      if (userHome) fs.rmSync(userHome, { recursive: true, force: true });
    },
  };
}

// Build a matrix project with 7 objectives covering every work type for a given kind.
// Returns { root, userHome, cleanup, objectiveIds }.
//
// Hand-built factory — no LLM-generated data, no faker. Per TDD Playbook habit 4.
//
// Options:
//   kind — which kind to set on PROJECT.md (default: 'api')
//   claudeMdUser — optional CLAUDE.md content for user home dir
function buildMatrixProject({ kind = 'api', claudeMdUser } = {}) {
  const WORKS = ['feature', 'port', 'refactor', 'foundation', 'bugfix', 'prototype', 'spike'];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-matrix-'));
  fs.mkdirSync(path.join(root, '.planning', 'objectives'), { recursive: true });

  fs.writeFileSync(
    path.join(root, '.planning', 'PROJECT.md'),
    projectMd({ kind }),
    'utf-8'
  );

  const objectiveIds = [];
  WORKS.forEach((work, i) => {
    const id = `0${i + 1}-${kind}-${work}`;
    objectiveIds.push(id);
    const dir = path.join(root, '.planning', 'objectives', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'OBJECTIVE.md'),
      objectiveMd({ work }),
      'utf-8'
    );
    // Add a stub TRD in each objective dir
    fs.writeFileSync(
      path.join(dir, '01-01-TRD.md'),
      trdMd({ work }),
      'utf-8'
    );
  });

  let userHome;
  if (claudeMdUser !== undefined) {
    userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-home-'));
    fs.mkdirSync(path.join(userHome, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(userHome, '.claude', 'CLAUDE.md'), claudeMdUser, 'utf-8');
  }

  return {
    root,
    userHome,
    objectiveIds,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
      if (userHome) fs.rmSync(userHome, { recursive: true, force: true });
    },
  };
}

// The user's actual ~/.claude/CLAUDE.md content — hand-edited from the visible system context.
// Per TDD Playbook habit 4: no LLM-generated test data. This is a faithful copy of the
// real file, used as a fixture for the B1 round-trip test in TRD 0.4.
// Patterns in claude-md.cjs are designed to match this exact text.
function realCLAUDEMd() {
  return `# Global Working Preferences

## TDD Playbook

When planning or executing any non-trivial implementation work, follow this playbook on top of DevFlow's TDD enforcement (Iron Law, RED-GREEN-REFACTOR with exit-code evidence). Applies across all projects and stacks.

### Habits to apply

1. **Force TDD TRDs at planning time.** When invoking \`/df:plan-objective\` or \`/df:build\`, explicitly instruct the planner to make every feature a \`type=tdd\` TRD unless it falls under DevFlow's valid exception list (config-only, pure styling, generated code, dependency bumps). Do not let features default to \`type=auto\`.
2. **Test list first.** Each TDD TRD must include a checklist of behavior cases — happy path, edge cases, failure modes — before any test code is written. Reviewable artifact, prevents drift into implementation-shaped tests.
3. **One test at a time** through RED → GREEN → REFACTOR. No batching tests "while we're here."
4. **Fixture generators, not LLM-generated test data.** Hand-built factory functions or fixture builders. For external APIs, use recorded cassettes (VCR / Go httpmock / equivalents) against test-mode services, captured once and committed. Treat fixture/factory work as its own task ahead of the first behavior test. *Rationale: LLMs produce shallow, repetitive test data; generate the scripts, not the data.*
5. **Outside-in for UI / portal flows.** Start at the highest user-observable layer and drill in:
   - Rails: Capybara system test → controller test → model test
   - Go (ConnectRPC + templ): HTTP integration test → handler test → service test
   - Flutter: integration_test → widget test → unit test
   Pure-logic features (refund math, proration, dunning state machines, parsers) start at unit level.
6. **Multitenancy guard in every test (when applicable).** For any multi-tenant codebase: include a "wrong-tenant isolation" assertion alongside the happy path. Default-scope foot-guns are the most common bug class in multi-tenant apps; testing them is cheap and catches them before production.

### What to skip

- Property-based testing (Hypothesis / quickcheck-style) unless the feature is genuinely high-cardinality math: refund splits, proration, tax calculations.
- Gherkin / BDD syntax layer — descriptive test names get the value without the layer.

### Why

LLM-coded TDD without these guards drifts into:
- Implementation-shaped tests that don't survive refactors.
- Shallow, repetitive fixtures that miss real-world variety.
- Missed tenant-scoping bugs in multi-tenant codebases.

These six habits target each failure mode. They cost ~15-20% more planning time and pay back in fewer regressions and more reviewable PRs.

### How to apply

- Triggered when I say "plan an objective", "build feature X", or invoke \`/df:plan-objective\` / \`/df:build\`.
- Pass the playbook into the planner's prompt: TDD TRDs default, test-list checklist required, fixture task explicit, multitenancy assertions in verification commands when the codebase is multi-tenant.
- On execution: produce 2-3 atomic commits per TDD TRD (\`test:\` → \`feat:\` → optional \`refactor:\`) per DevFlow's existing pattern.
`;
}

// ─── A2: route-intent.js fire fixtures (10) ──────────────────────────────────
// Hand-built fixture list — per TDD Playbook habit 4. No LLM-generated data.
// Each entry: { prompt, expected_skill, label, why_fires }
// Prompts are LOCKED per 15-RESEARCH.md / 15-02-TRD.md codebase_examples.

const FIRE_FIXTURES = [
  {
    prompt: 'Fix the login bug',
    expected_skill: '/devflow:debug',
    label: 'imperative + bug noun',
    why_fires: 'matches debug rule: fix + the + bug',
  },
  {
    prompt: 'Build the dashboard feature',
    expected_skill: '/devflow:build',
    label: 'imperative + article + noun',
    why_fires: 'matches build rule: build + the + dashboard',
  },
  {
    prompt: 'Plan the next objective',
    expected_skill: '/devflow:plan-objective',
    label: 'plan + the + objective',
    why_fires: 'matches plan rule',
  },
  {
    prompt: 'Verify the work I just shipped',
    expected_skill: '/devflow:verify-work',
    label: 'verify + work',
    why_fires: 'matches verify rule',
  },
  {
    prompt: "What's our progress?",
    expected_skill: '/devflow:status',
    label: 'what is our progress',
    why_fires: 'matches status rule (specific possessive phrase)',
  },
  {
    prompt: 'Resume the work',
    expected_skill: '/devflow:status resume',
    label: 'resume + work',
    why_fires: 'matches resume rule (consolidated /devflow:status resume)',
  },
  {
    prompt: 'Pause the work for tonight',
    expected_skill: '/devflow:status pause',
    label: 'pause + work',
    why_fires: 'matches pause rule (consolidated /devflow:status pause)',
  },
  {
    prompt: 'Debug the crash in the worker',
    expected_skill: '/devflow:debug',
    label: 'debug + the + crash',
    why_fires: 'matches debug rule with crash noun',
  },
  {
    prompt: 'Add an objective for the new auth flow',
    expected_skill: '/devflow:objective add',
    label: 'add + an + objective',
    why_fires: 'matches objective-add rule (consolidated)',
  },
  {
    prompt: 'Investigate the failure in CI',
    expected_skill: '/devflow:debug',
    label: 'investigate + the + failure',
    why_fires: 'matches debug rule with failure noun',
  },
  // ─── B4: micro fixtures (3) ───
  {
    prompt: 'Fix the typo in the README',
    expected_skill: '/devflow:micro',
    label: 'fix + the + typo',
    why_fires: 'matches micro rule: fix + the + typo (trivial-noun whitelist)',
  },
  {
    prompt: 'Rename the prop name from foo to bar',
    expected_skill: '/devflow:micro',
    label: 'rename + the + prop name',
    why_fires: 'matches micro rule: rename + the + prop name',
  },
  {
    prompt: 'Update the import in the worker module',
    expected_skill: '/devflow:micro',
    label: 'update + the + import',
    why_fires: 'matches micro rule: update + the + import (trivial-noun whitelist)',
  },
  // ─── 24-02: BUILD extension fixtures (5) ─────────────────────────────────
  {
    prompt: 'build objective 3',
    expected_skill: '/devflow:build',
    label: 'build + objective (no article)',
    why_fires: 'matches extended BUILD rule: build + objective (bare noun variant)',
  },
  {
    prompt: 'build this',
    expected_skill: '/devflow:build',
    label: 'build + this (no trailing noun)',
    why_fires: 'matches extended BUILD rule: build/implement + this/that at word boundary',
  },
  {
    prompt: 'implement this',
    expected_skill: '/devflow:build',
    label: 'implement + this',
    why_fires: 'matches extended BUILD rule: implement + this',
  },
  {
    prompt: "let's build",
    expected_skill: '/devflow:build',
    label: "let's build",
    why_fires: "matches extended BUILD rule: let's/lets + build",
  },
  {
    prompt: 'start building',
    expected_skill: '/devflow:build',
    label: 'start building',
    why_fires: 'matches extended BUILD rule: start building',
  },
  // ─── 24-02: EXECUTE rule fixtures (2) ────────────────────────────────────
  {
    prompt: 'execute objective 3',
    expected_skill: '/devflow:execute-objective',
    label: 'execute + objective',
    why_fires: 'matches EXECUTE rule: execute/run + objective',
  },
  {
    prompt: 'run objective 3',
    expected_skill: '/devflow:execute-objective',
    label: 'run + objective',
    why_fires: 'matches EXECUTE rule: run + objective',
  },
  // ─── 24-02: TODO rule fixtures (2) ───────────────────────────────────────
  {
    prompt: 'add a todo to refactor the parser',
    expected_skill: '/devflow:todo add',
    label: 'add a todo',
    why_fires: 'matches TODO rule: add/create + (a)? + todo; suppression removes build match',
  },
  {
    prompt: 'make a quick pass over the error handling',
    expected_skill: '/devflow:quick',
    label: 'make a quick pass',
    why_fires: 'matches QUICK rule: make/take/do + a + quick pass; suppression removes build match',
  },
  // ─── 24-02: QUICK rule fixture (1) ───────────────────────────────────────
  {
    prompt: 'small change: bump the timeout',
    expected_skill: '/devflow:quick',
    label: 'small change',
    why_fires: 'matches QUICK rule: small change',
  },
  // ─── 24-02: MOVED from NO_FIRE to FIRE — quick now has a rule ────────────
  {
    prompt: 'Tackle this small change in the auth flow',
    expected_skill: '/devflow:quick',
    label: 'small change (quick territory — now fires)',
    why_fires: 'QUICK rule matches "small change"; TRD 24-02 moved this from NO_FIRE (micro had no rule for it; quick now does)',
  },
];

// ─── A2: route-intent.js no-fire fixtures (5) ────────────────────────────────
// These prompts must NOT trigger any intent match.
// Each entry: { prompt, label, why_no_fire }

const NO_FIRE_FIXTURES = [
  {
    prompt: "What's the bug in the login code?",
    label: 'Q&A about a bug',
    why_no_fire: "starts with What's — interrogative, not imperative",
  },
  {
    prompt: 'Why is this failing?',
    label: 'Q&A about failure',
    why_no_fire: 'starts with Why — interrogative',
  },
  {
    prompt: 'Can you explain how the auth flow works?',
    label: 'explanation request',
    why_no_fire: 'no imperative verb against a project noun',
  },
  {
    prompt: 'Continue reading the spec',
    label: 'continue + reading (not work)',
    why_no_fire: 'continue is not followed by "the work"',
  },
  {
    prompt: 'What does fix mean here?',
    label: 'meta-question about a verb',
    why_no_fire: 'fix appears but inside a meta-question, no object',
  },
  // ─── 24-02: override suppression no-fire fixtures ────────────────────────
  {
    prompt: 'just edit the config loader to add a retry',
    label: 'override phrase (just edit)',
    why_no_fire: 'contains override phrase "just edit" — override suppression returns []',
  },
  {
    prompt: 'skip devflow and fix the bug in the auth flow',
    label: 'override phrase (skip devflow)',
    why_no_fire: 'contains override phrase "skip devflow" — override suppression returns []',
  },
];

module.exports = {
  projectMd,
  objectiveMd,
  trdMd,
  claudeMd,
  buildProject,
  buildMatrixProject,
  realCLAUDEMd,
  FIRE_FIXTURES,
  NO_FIRE_FIXTURES,
};
