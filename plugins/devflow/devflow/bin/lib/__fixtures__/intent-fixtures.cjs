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
  // ─── Obj 12: broader-lexicon fixtures (B item) ───
  {
    prompt: 'ship it for the auth flow',
    expected_skill: '/devflow:build',
    label: 'ship it + prep phrase',
    why_fires: 'matches new build rule: ship + it (verb particle)',
  },
  {
    prompt: "let's work on the new dashboard",
    expected_skill: '/devflow:build',
    label: "let's + work on + the + noun",
    why_fires: "matches new build rule: let's + work on + the + noun",
  },
  {
    prompt: "let's start the migration",
    expected_skill: '/devflow:build',
    label: "let's + start + the + noun",
    why_fires: "matches new build rule: let's + start + the + noun",
  },
  {
    prompt: 'I want to fix the broken login',
    expected_skill: '/devflow:debug',
    label: 'I want to + fix + the + bug-ish noun',
    why_fires: 'matches new debug rule with broader noun whitelist',
  },
  {
    prompt: 'take a quick pass on the auth module',
    expected_skill: '/devflow:quick',
    label: 'quick routing — take a quick pass',
    why_fires: 'matches new quick rule: take + a + quick + pass (avoids "do" Q&A skip)',
  },
  {
    prompt: 'make a quick fix to the README',
    expected_skill: '/devflow:quick',
    label: 'quick routing — make a quick fix',
    why_fires: 'matches new quick rule: make + a + quick + fix',
  },
  {
    prompt: 'what should I work on',
    expected_skill: '/devflow:status',
    label: 'what should I work on',
    why_fires: 'matches new status rule (what NOT in Q&A skip-list)',
  },
  {
    prompt: "what's next",
    expected_skill: '/devflow:status',
    label: "what's next",
    why_fires: "matches new status rule: what's + next",
  },
  {
    prompt: "what's on my plate",
    expected_skill: '/devflow:status',
    label: "what's on my plate",
    why_fires: "matches new status rule: what's + on + my + plate",
  },
  {
    prompt: 'save my progress',
    expected_skill: '/devflow:status pause',
    label: 'save my progress',
    why_fires: 'matches new pause rule: save + my + progress',
  },
  {
    prompt: "I'm stopping for the day",
    expected_skill: '/devflow:status pause',
    label: "I'm stopping",
    why_fires: "matches new pause rule: I'm + stopping",
  },
  {
    prompt: 'leaving for now',
    expected_skill: '/devflow:status pause',
    label: 'leaving for now',
    why_fires: 'matches new pause rule: leaving + for + now',
  },
  {
    prompt: "let's pick up where we stopped",
    expected_skill: '/devflow:status resume',
    label: "let's pick up where we stopped",
    why_fires: "matches new resume rule: let's + pick up + where + we + stopped",
  },
  {
    prompt: "what'd I miss",
    expected_skill: '/devflow:awareness',
    label: "what'd I miss",
    why_fires: "matches new awareness rule: what'd + I + miss",
  },
  {
    prompt: 'show me recent activity',
    expected_skill: '/devflow:awareness',
    label: 'show me recent activity',
    why_fires: 'matches new awareness rule: show + me + recent + activity',
  },
  {
    prompt: 'add a todo for the README cleanup',
    expected_skill: '/devflow:add-todo',
    label: 'add a todo',
    why_fires: 'matches new add-todo rule: add + a + todo + for',
  },
  {
    prompt: 'any todos',
    expected_skill: '/devflow:check-todos',
    label: 'any todos',
    why_fires: 'matches new check-todos rule: any + todos',
  },
  {
    prompt: 'verify this objective',
    expected_skill: '/devflow:verify-work',
    label: 'verify this objective',
    why_fires: 'matches new verify rule: verify + this + objective',
  },
  {
    prompt: 'check the work',
    expected_skill: '/devflow:verify-work',
    label: 'check the work (regression)',
    why_fires: 'matches existing verify rule (regression confirmation)',
  },
  {
    prompt: 'research how to use Vitest',
    expected_skill: '/devflow:research-objective',
    label: 'research how to + verb',
    why_fires: 'matches new research rule: research + how + to + verb',
  },
  {
    prompt: 'investigate the Vitest library',
    expected_skill: '/devflow:research-objective',
    label: 'investigate the Vitest library',
    why_fires: 'matches new research rule: investigate + the + X + library',
  },
  {
    prompt: 'audit the milestone',
    expected_skill: '/devflow:audit-milestone',
    label: 'audit the milestone',
    why_fires: 'matches new audit-milestone rule',
  },
  {
    prompt: 'sync to github',
    expected_skill: '/devflow:gh-sync',
    label: 'sync to github',
    why_fires: 'matches new gh-sync rule: sync + to + github',
  },
  {
    prompt: 'make a new milestone',
    expected_skill: '/devflow:new-milestone',
    label: 'make a new milestone',
    why_fires: 'matches new new-milestone rule: make + a + new + milestone',
  },
  {
    prompt: 'discuss the objective',
    expected_skill: '/devflow:discuss-objective',
    label: 'discuss the objective',
    why_fires: 'matches new discuss-objective rule: discuss + the + objective',
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
  // ─── B4: micro no-fire (1) — prevent micro from eating quick territory ───
  {
    prompt: 'Tackle this small change in the auth flow',
    label: 'small change (quick territory)',
    why_no_fire: 'no trivial-noun match (small change is not in micro whitelist)',
  },
  // ─── Obj 12: interrogative regression (broader lexicon must coexist with Q&A skip) ───
  {
    prompt: 'can you fix the failing test',
    label: 'can-prefixed fix request',
    why_no_fire: 'starts with "can" — Q&A interrogative skip',
  },
  {
    prompt: 'is anyone else on the auth refactor',
    label: 'is-prefixed coordination question',
    why_no_fire: 'starts with "is" — Q&A interrogative skip',
  },
  {
    prompt: 'can you ship it for the auth flow',
    label: 'can-prefixed ship-it',
    why_no_fire: 'starts with "can" — Q&A interrogative skip (regression vs new build rule)',
  },
  {
    prompt: 'why are we stopping',
    label: 'why-prefixed pause question',
    why_no_fire: 'starts with "why" — Q&A interrogative skip (regression vs new pause rule)',
  },
  {
    prompt: 'is anyone else working on this',
    label: 'is-prefixed coordination',
    why_no_fire: 'starts with "is" — Q&A interrogative skip',
  },
  {
    prompt: 'should I sync to github',
    label: 'should-prefixed gh-sync question',
    why_no_fire: 'starts with "should" — Q&A interrogative skip (regression vs new gh-sync rule)',
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
