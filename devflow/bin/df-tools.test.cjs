/**
 * DevFlow Tools Tests
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOOLS_PATH = path.join(__dirname, 'df-tools.cjs');

// Helper to run df-tools command
function runGsdTools(args, cwd = process.cwd()) {
  try {
    const result = execSync(`node "${TOOLS_PATH}" ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: result.trim() };
  } catch (err) {
    return {
      success: false,
      output: err.stdout?.toString().trim() || '',
      error: err.stderr?.toString().trim() || err.message,
    };
  }
}

// Create temp directory structure
function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'df-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives'), { recursive: true });
  return tmpDir;
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('history-digest command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('empty objectives directory returns valid schema', () => {
    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);

    assert.deepStrictEqual(digest.objectives, {}, 'objectives should be empty object');
    assert.deepStrictEqual(digest.decisions, [], 'decisions should be empty array');
    assert.deepStrictEqual(digest.tech_stack, [], 'tech_stack should be empty array');
  });

  test('nested frontmatter fields extracted correctly', () => {
    // Create objective directory with SUMMARY containing nested frontmatter
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(objectiveDir, { recursive: true });

    const summaryContent = `---
objective: "01"
name: "Foundation Setup"
dependency-graph:
  provides:
    - "Database schema"
    - "Auth system"
  affects:
    - "API layer"
tech-stack:
  added:
    - "prisma"
    - "jose"
patterns-established:
  - "Repository pattern"
  - "JWT auth flow"
key-decisions:
  - "Use Prisma over Drizzle"
  - "JWT in httpOnly cookies"
---

# Summary content here
`;

    fs.writeFileSync(path.join(objectiveDir, '01-01-SUMMARY.md'), summaryContent);

    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);

    // Check nested dependency-graph.provides
    assert.ok(digest.objectives['01'], 'Objective 01 should exist');
    assert.deepStrictEqual(
      digest.objectives['01'].provides.sort(),
      ['Auth system', 'Database schema'],
      'provides should contain nested values'
    );

    // Check nested dependency-graph.affects
    assert.deepStrictEqual(
      digest.objectives['01'].affects,
      ['API layer'],
      'affects should contain nested values'
    );

    // Check nested tech-stack.added
    assert.deepStrictEqual(
      digest.tech_stack.sort(),
      ['jose', 'prisma'],
      'tech_stack should contain nested values'
    );

    // Check patterns-established (flat array)
    assert.deepStrictEqual(
      digest.objectives['01'].patterns.sort(),
      ['JWT auth flow', 'Repository pattern'],
      'patterns should be extracted'
    );

    // Check key-decisions
    assert.strictEqual(digest.decisions.length, 2, 'Should have 2 decisions');
    assert.ok(
      digest.decisions.some(d => d.decision === 'Use Prisma over Drizzle'),
      'Should contain first decision'
    );
  });

  test('multiple objectives merged into single digest', () => {
    // Create objective 01
    const phase01Dir = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(phase01Dir, { recursive: true });
    fs.writeFileSync(
      path.join(phase01Dir, '01-01-SUMMARY.md'),
      `---
objective: "01"
name: "Foundation"
provides:
  - "Database"
patterns-established:
  - "Pattern A"
key-decisions:
  - "Decision 1"
---
`
    );

    // Create objective 02
    const phase02Dir = path.join(tmpDir, '.planning', 'objectives', '02-api');
    fs.mkdirSync(phase02Dir, { recursive: true });
    fs.writeFileSync(
      path.join(phase02Dir, '02-01-SUMMARY.md'),
      `---
objective: "02"
name: "API"
provides:
  - "REST endpoints"
patterns-established:
  - "Pattern B"
key-decisions:
  - "Decision 2"
tech-stack:
  added:
    - "zod"
---
`
    );

    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);

    // Both objectives present
    assert.ok(digest.objectives['01'], 'Objective 01 should exist');
    assert.ok(digest.objectives['02'], 'Objective 02 should exist');

    // Decisions merged
    assert.strictEqual(digest.decisions.length, 2, 'Should have 2 decisions total');

    // Tech stack merged
    assert.deepStrictEqual(digest.tech_stack, ['zod'], 'tech_stack should have zod');
  });

  test('malformed SUMMARY.md skipped gracefully', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '01-test');
    fs.mkdirSync(objectiveDir, { recursive: true });

    // Valid summary
    fs.writeFileSync(
      path.join(objectiveDir, '01-01-SUMMARY.md'),
      `---
objective: "01"
provides:
  - "Valid feature"
---
`
    );

    // Malformed summary (no frontmatter)
    fs.writeFileSync(
      path.join(objectiveDir, '01-02-SUMMARY.md'),
      `# Just a heading
No frontmatter here
`
    );

    // Another malformed summary (broken YAML)
    fs.writeFileSync(
      path.join(objectiveDir, '01-03-SUMMARY.md'),
      `---
broken: [unclosed
---
`
    );

    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command should succeed despite malformed files: ${result.error}`);

    const digest = JSON.parse(result.output);
    assert.ok(digest.objectives['01'], 'Objective 01 should exist');
    assert.ok(
      digest.objectives['01'].provides.includes('Valid feature'),
      'Valid feature should be extracted'
    );
  });

  test('flat provides field still works (backward compatibility)', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '01-test');
    fs.mkdirSync(objectiveDir, { recursive: true });

    fs.writeFileSync(
      path.join(objectiveDir, '01-01-SUMMARY.md'),
      `---
objective: "01"
provides:
  - "Direct provides"
---
`
    );

    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);
    assert.deepStrictEqual(
      digest.objectives['01'].provides,
      ['Direct provides'],
      'Direct provides should work'
    );
  });

  test('inline array syntax supported', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '01-test');
    fs.mkdirSync(objectiveDir, { recursive: true });

    fs.writeFileSync(
      path.join(objectiveDir, '01-01-SUMMARY.md'),
      `---
objective: "01"
provides: [Feature A, Feature B]
patterns-established: ["Pattern X", "Pattern Y"]
---
`
    );

    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);
    assert.deepStrictEqual(
      digest.objectives['01'].provides.sort(),
      ['Feature A', 'Feature B'],
      'Inline array should work'
    );
    assert.deepStrictEqual(
      digest.objectives['01'].patterns.sort(),
      ['Pattern X', 'Pattern Y'],
      'Inline quoted array should work'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// objectives list command
// ─────────────────────────────────────────────────────────────────────────────

describe('objectives list command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('empty objectives directory returns empty array', () => {
    const result = runGsdTools('objectives list', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(output.directories, [], 'directories should be empty');
    assert.strictEqual(output.count, 0, 'count should be 0');
  });

  test('lists objective directories sorted numerically', () => {
    // Create out-of-order directories
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '10-final'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '02-api'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '01-foundation'), { recursive: true });

    const result = runGsdTools('objectives list', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 3, 'should have 3 directories');
    assert.deepStrictEqual(
      output.directories,
      ['01-foundation', '02-api', '10-final'],
      'should be sorted numerically'
    );
  });

  test('handles decimal objectives in sort order', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '02-api'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '02.1-hotfix'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '02.2-patch'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '03-ui'), { recursive: true });

    const result = runGsdTools('objectives list', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(
      output.directories,
      ['02-api', '02.1-hotfix', '02.2-patch', '03-ui'],
      'decimal objectives should sort correctly between whole numbers'
    );
  });

  test('--type jobs lists only JOB.md files', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '01-test');
    fs.mkdirSync(objectiveDir, { recursive: true });
    fs.writeFileSync(path.join(objectiveDir, '01-01-JOB.md'), '# Job 1');
    fs.writeFileSync(path.join(objectiveDir, '01-02-JOB.md'), '# Job 2');
    fs.writeFileSync(path.join(objectiveDir, '01-01-SUMMARY.md'), '# Summary');
    fs.writeFileSync(path.join(objectiveDir, 'RESEARCH.md'), '# Research');

    const result = runGsdTools('objectives list --type jobs', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(
      output.files.sort(),
      ['01-01-JOB.md', '01-02-JOB.md'],
      'should list only PLAN files'
    );
  });

  test('--type summaries lists only SUMMARY.md files', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '01-test');
    fs.mkdirSync(objectiveDir, { recursive: true });
    fs.writeFileSync(path.join(objectiveDir, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(objectiveDir, '01-01-SUMMARY.md'), '# Summary 1');
    fs.writeFileSync(path.join(objectiveDir, '01-02-SUMMARY.md'), '# Summary 2');

    const result = runGsdTools('objectives list --type summaries', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(
      output.files.sort(),
      ['01-01-SUMMARY.md', '01-02-SUMMARY.md'],
      'should list only SUMMARY files'
    );
  });

  test('--objective filters to specific objective directory', () => {
    const phase01 = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    const phase02 = path.join(tmpDir, '.planning', 'objectives', '02-api');
    fs.mkdirSync(phase01, { recursive: true });
    fs.mkdirSync(phase02, { recursive: true });
    fs.writeFileSync(path.join(phase01, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(phase02, '02-01-JOB.md'), '# Plan');

    const result = runGsdTools('objectives list --type jobs --objective 01', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(output.files, ['01-01-JOB.md'], 'should only list objective 01 jobs');
    assert.strictEqual(output.objective_dir, 'foundation', 'should report objective name without number prefix');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// roadmap get-objective command
// ─────────────────────────────────────────────────────────────────────────────

describe('roadmap get-objective command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('extracts objective section from ROADMAP.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

## Objectives

### Objective 1: Foundation
**Goal:** Set up project infrastructure
**Jobs:** 2 jobs

Some description here.

### Objective 2: API
**Goal:** Build REST API
**Jobs:** 3 jobs
`
    );

    const result = runGsdTools('roadmap get-objective 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'objective should be found');
    assert.strictEqual(output.objective_number, '1', 'objective number correct');
    assert.strictEqual(output.objective_name, 'Foundation', 'objective name extracted');
    assert.strictEqual(output.goal, 'Set up project infrastructure', 'goal extracted');
  });

  test('returns not found for missing objective', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

### Objective 1: Foundation
**Goal:** Set up project
`
    );

    const result = runGsdTools('roadmap get-objective 5', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'objective should not be found');
  });

  test('handles decimal objective numbers', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Objective 2: Main
**Goal:** Main work

### Objective 2.1: Hotfix
**Goal:** Emergency fix
`
    );

    const result = runGsdTools('roadmap get-objective 2.1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'decimal objective should be found');
    assert.strictEqual(output.objective_name, 'Hotfix', 'objective name correct');
    assert.strictEqual(output.goal, 'Emergency fix', 'goal extracted');
  });

  test('extracts full section content', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Objective 1: Setup
**Goal:** Initialize everything

This objective covers:
- Database setup
- Auth configuration
- CI/CD pipeline

### Objective 2: Build
**Goal:** Build features
`
    );

    const result = runGsdTools('roadmap get-objective 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.section.includes('Database setup'), 'section includes description');
    assert.ok(output.section.includes('CI/CD pipeline'), 'section includes all bullets');
    assert.ok(!output.section.includes('Objective 2'), 'section does not include next objective');
  });

  test('handles missing ROADMAP.md gracefully', () => {
    const result = runGsdTools('roadmap get-objective 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'should return not found');
    assert.strictEqual(output.error, 'ROADMAP.md not found', 'should explain why');
  });

  test('accepts ## objective headers (two hashes)', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

## Objective 1: Foundation
**Goal:** Set up project infrastructure
**Jobs:** 2 jobs

## Objective 2: API
**Goal:** Build REST API
`
    );

    const result = runGsdTools('roadmap get-objective 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'objective with ## header should be found');
    assert.strictEqual(output.objective_name, 'Foundation', 'objective name extracted');
    assert.strictEqual(output.goal, 'Set up project infrastructure', 'goal extracted');
  });

  test('detects malformed ROADMAP with summary list but no detail sections', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

## Objectives

- [ ] **Objective 1: Foundation** - Set up project
- [ ] **Objective 2: API** - Build REST API
`
    );

    const result = runGsdTools('roadmap get-objective 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'objective should not be found');
    assert.strictEqual(output.error, 'malformed_roadmap', 'should identify malformed roadmap');
    assert.ok(output.message.includes('missing'), 'should explain the issue');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// objective next-decimal command
// ─────────────────────────────────────────────────────────────────────────────

describe('objective next-decimal command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns X.1 when no decimal objectives exist', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06-feature'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '07-next'), { recursive: true });

    const result = runGsdTools('objective next-decimal 06', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '06.1', 'should return 06.1');
    assert.deepStrictEqual(output.existing, [], 'no existing decimals');
  });

  test('increments from existing decimal objectives', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06-feature'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06.1-hotfix'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06.2-patch'), { recursive: true });

    const result = runGsdTools('objective next-decimal 06', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '06.3', 'should return 06.3');
    assert.deepStrictEqual(output.existing, ['06.1', '06.2'], 'lists existing decimals');
  });

  test('handles gaps in decimal sequence', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06-feature'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06.1-first'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06.3-third'), { recursive: true });

    const result = runGsdTools('objective next-decimal 06', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    // Should take next after highest, not fill gap
    assert.strictEqual(output.next, '06.4', 'should return 06.4, not fill gap at 06.2');
  });

  test('handles single-digit objective input', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06-feature'), { recursive: true });

    const result = runGsdTools('objective next-decimal 6', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '06.1', 'should normalize to 06.1');
    assert.strictEqual(output.base_objective, '06', 'base objective should be padded');
  });

  test('returns error if base objective does not exist', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '01-start'), { recursive: true });

    const result = runGsdTools('objective next-decimal 06', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'base objective not found');
    assert.strictEqual(output.next, '06.1', 'should still suggest 06.1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// objective-job-index command
// ─────────────────────────────────────────────────────────────────────────────

describe('objective-job-index command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('empty objective directory returns empty jobs array', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '03-api'), { recursive: true });

    const result = runGsdTools('objective-job-index 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.objective, '03', 'objective number correct');
    assert.deepStrictEqual(output.plans, [], 'plans should be empty');
    assert.deepStrictEqual(output.waves, {}, 'waves should be empty');
    assert.deepStrictEqual(output.incomplete, [], 'incomplete should be empty');
    assert.strictEqual(output.has_checkpoints, false, 'no checkpoints');
  });

  test('extracts single job with frontmatter', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '03-api');
    fs.mkdirSync(objectiveDir, { recursive: true });

    fs.writeFileSync(
      path.join(objectiveDir, '03-01-JOB.md'),
      `---
wave: 1
autonomous: true
objective: Set up database schema
files-modified: [prisma/schema.prisma, src/lib/db.ts]
---

## Task 1: Create schema
## Task 2: Generate client
`
    );

    const result = runGsdTools('objective-job-index 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.plans.length, 1, 'should have 1 job');
    assert.strictEqual(output.plans[0].id, '03-01', 'job id correct');
    assert.strictEqual(output.plans[0].wave, 1, 'wave extracted');
    assert.strictEqual(output.plans[0].autonomous, true, 'autonomous extracted');
    assert.strictEqual(output.plans[0].objective, 'Set up database schema', 'objective extracted');
    assert.deepStrictEqual(output.plans[0].files_modified, ['prisma/schema.prisma', 'src/lib/db.ts'], 'files extracted');
    assert.strictEqual(output.plans[0].task_count, 2, 'task count correct');
    assert.strictEqual(output.plans[0].has_summary, false, 'no summary yet');
  });

  test('groups multiple jobs by wave', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '03-api');
    fs.mkdirSync(objectiveDir, { recursive: true });

    fs.writeFileSync(
      path.join(objectiveDir, '03-01-JOB.md'),
      `---
wave: 1
autonomous: true
objective: Database setup
---

## Task 1: Schema
`
    );

    fs.writeFileSync(
      path.join(objectiveDir, '03-02-JOB.md'),
      `---
wave: 1
autonomous: true
objective: Auth setup
---

## Task 1: JWT
`
    );

    fs.writeFileSync(
      path.join(objectiveDir, '03-03-JOB.md'),
      `---
wave: 2
autonomous: false
objective: API routes
---

## Task 1: Routes
`
    );

    const result = runGsdTools('objective-job-index 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.plans.length, 3, 'should have 3 jobs');
    assert.deepStrictEqual(output.waves['1'], ['03-01', '03-02'], 'wave 1 has 2 jobs');
    assert.deepStrictEqual(output.waves['2'], ['03-03'], 'wave 2 has 1 job');
  });

  test('detects incomplete jobs (no matching summary)', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '03-api');
    fs.mkdirSync(objectiveDir, { recursive: true });

    // Job with summary
    fs.writeFileSync(path.join(objectiveDir, '03-01-JOB.md'), `---\nwave: 1\n---\n## Task 1`);
    fs.writeFileSync(path.join(objectiveDir, '03-01-SUMMARY.md'), `# Summary`);

    // Job without summary
    fs.writeFileSync(path.join(objectiveDir, '03-02-JOB.md'), `---\nwave: 2\n---\n## Task 1`);

    const result = runGsdTools('objective-job-index 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.plans[0].has_summary, true, 'first job has summary');
    assert.strictEqual(output.plans[1].has_summary, false, 'second job has no summary');
    assert.deepStrictEqual(output.incomplete, ['03-02'], 'incomplete list correct');
  });

  test('detects checkpoints (autonomous: false)', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '03-api');
    fs.mkdirSync(objectiveDir, { recursive: true });

    fs.writeFileSync(
      path.join(objectiveDir, '03-01-JOB.md'),
      `---
wave: 1
autonomous: false
objective: Manual review needed
---

## Task 1: Review
`
    );

    const result = runGsdTools('objective-job-index 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_checkpoints, true, 'should detect checkpoint');
    assert.strictEqual(output.plans[0].autonomous, false, 'job marked non-autonomous');
  });

  test('objective not found returns error', () => {
    const result = runGsdTools('objective-job-index 99', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'Objective not found', 'should report objective not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state-snapshot command
// ─────────────────────────────────────────────────────────────────────────────

describe('state-snapshot command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing STATE.md returns error', () => {
    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'STATE.md not found', 'should report missing file');
  });

  test('extracts basic fields from STATE.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Objective:** 03
**Current Objective Name:** API Layer
**Total Objectives:** 6
**Current Job:** 03-02
**Total Jobs in Objective:** 3
**Status:** In progress
**Progress:** 45%
**Last Activity:** 2024-01-15
**Last Activity Description:** Completed 03-01-JOB.md
`
    );

    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.current_objective, '03', 'current objective extracted');
    assert.strictEqual(output.current_objective_name, 'API Layer', 'objective name extracted');
    assert.strictEqual(output.total_objectives, 6, 'total objectives extracted');
    assert.strictEqual(output.current_job, '03-02', 'current job extracted');
    assert.strictEqual(output.total_jobs_in_objective, 3, 'total jobs extracted');
    assert.strictEqual(output.status, 'In progress', 'status extracted');
    assert.strictEqual(output.progress_percent, 45, 'progress extracted');
    assert.strictEqual(output.last_activity, '2024-01-15', 'last activity date extracted');
  });

  test('extracts decisions table', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Objective:** 01

## Decisions Made

| Objective | Decision | Rationale |
|-------|----------|-----------|
| 01 | Use Prisma | Better DX than raw SQL |
| 02 | JWT auth | Stateless authentication |
`
    );

    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.decisions.length, 2, 'should have 2 decisions');
    assert.strictEqual(output.decisions[0].objective, '01', 'first decision objective');
    assert.strictEqual(output.decisions[0].summary, 'Use Prisma', 'first decision summary');
    assert.strictEqual(output.decisions[0].rationale, 'Better DX than raw SQL', 'first decision rationale');
  });

  test('extracts blockers list', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Objective:** 03

## Blockers

- Waiting for API credentials
- Need design review for dashboard
`
    );

    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(output.blockers, [
      'Waiting for API credentials',
      'Need design review for dashboard',
    ], 'blockers extracted');
  });

  test('extracts session continuity info', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Objective:** 03

## Session

**Last Date:** 2024-01-15
**Stopped At:** Objective 3, Job 2, Task 1
**Resume File:** .planning/objectives/03-api/03-02-JOB.md
`
    );

    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.session.last_date, '2024-01-15', 'session date extracted');
    assert.strictEqual(output.session.stopped_at, 'Objective 3, Job 2, Task 1', 'stopped at extracted');
    assert.strictEqual(output.session.resume_file, '.planning/objectives/03-api/03-02-JOB.md', 'resume file extracted');
  });

  test('handles paused_at field', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Objective:** 03
**Paused At:** Objective 3, Job 1, Task 2 - mid-implementation
`
    );

    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.paused_at, 'Objective 3, Job 1, Task 2 - mid-implementation', 'paused_at extracted');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summary-extract command
// ─────────────────────────────────────────────────────────────────────────────

describe('summary-extract command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing file returns error', () => {
    const result = runGsdTools('summary-extract .planning/objectives/01-test/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'File not found', 'should report missing file');
  });

  test('extracts all fields from SUMMARY.md', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(objectiveDir, { recursive: true });

    fs.writeFileSync(
      path.join(objectiveDir, '01-01-SUMMARY.md'),
      `---
one-liner: Set up Prisma with User and Project models
key-files:
  - prisma/schema.prisma
  - src/lib/db.ts
tech-stack:
  added:
    - prisma
    - zod
patterns-established:
  - Repository pattern
  - Dependency injection
key-decisions:
  - Use Prisma over Drizzle: Better DX and ecosystem
  - Single database: Start simple, shard later
---

# Summary

Full summary content here.
`
    );

    const result = runGsdTools('summary-extract .planning/objectives/01-foundation/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.path, '.planning/objectives/01-foundation/01-01-SUMMARY.md', 'path correct');
    assert.strictEqual(output.one_liner, 'Set up Prisma with User and Project models', 'one-liner extracted');
    assert.deepStrictEqual(output.key_files, ['prisma/schema.prisma', 'src/lib/db.ts'], 'key files extracted');
    assert.deepStrictEqual(output.tech_added, ['prisma', 'zod'], 'tech added extracted');
    assert.deepStrictEqual(output.patterns, ['Repository pattern', 'Dependency injection'], 'patterns extracted');
    assert.strictEqual(output.decisions.length, 2, 'decisions extracted');
  });

  test('selective extraction with --fields', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(objectiveDir, { recursive: true });

    fs.writeFileSync(
      path.join(objectiveDir, '01-01-SUMMARY.md'),
      `---
one-liner: Set up database
key-files:
  - prisma/schema.prisma
tech-stack:
  added:
    - prisma
patterns-established:
  - Repository pattern
key-decisions:
  - Use Prisma: Better DX
---
`
    );

    const result = runGsdTools('summary-extract .planning/objectives/01-foundation/01-01-SUMMARY.md --fields one_liner,key_files', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.one_liner, 'Set up database', 'one_liner included');
    assert.deepStrictEqual(output.key_files, ['prisma/schema.prisma'], 'key_files included');
    assert.strictEqual(output.tech_added, undefined, 'tech_added excluded');
    assert.strictEqual(output.patterns, undefined, 'patterns excluded');
    assert.strictEqual(output.decisions, undefined, 'decisions excluded');
  });

  test('handles missing frontmatter fields gracefully', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(objectiveDir, { recursive: true });

    fs.writeFileSync(
      path.join(objectiveDir, '01-01-SUMMARY.md'),
      `---
one-liner: Minimal summary
---

# Summary
`
    );

    const result = runGsdTools('summary-extract .planning/objectives/01-foundation/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.one_liner, 'Minimal summary', 'one-liner extracted');
    assert.deepStrictEqual(output.key_files, [], 'key_files defaults to empty');
    assert.deepStrictEqual(output.tech_added, [], 'tech_added defaults to empty');
    assert.deepStrictEqual(output.patterns, [], 'patterns defaults to empty');
    assert.deepStrictEqual(output.decisions, [], 'decisions defaults to empty');
  });

  test('parses key-decisions with rationale', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(objectiveDir, { recursive: true });

    fs.writeFileSync(
      path.join(objectiveDir, '01-01-SUMMARY.md'),
      `---
key-decisions:
  - Use Prisma: Better DX than alternatives
  - JWT tokens: Stateless auth for scalability
---
`
    );

    const result = runGsdTools('summary-extract .planning/objectives/01-foundation/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.decisions[0].summary, 'Use Prisma', 'decision summary parsed');
    assert.strictEqual(output.decisions[0].rationale, 'Better DX than alternatives', 'decision rationale parsed');
    assert.strictEqual(output.decisions[1].summary, 'JWT tokens', 'second decision summary');
    assert.strictEqual(output.decisions[1].rationale, 'Stateless auth for scalability', 'second decision rationale');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init --include flag tests
// ─────────────────────────────────────────────────────────────────────────────

describe('init commands with --include flag', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('init execute-objective includes state and config content', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '03-api');
    fs.mkdirSync(objectiveDir, { recursive: true });
    fs.writeFileSync(path.join(objectiveDir, '03-01-JOB.md'), '# Plan');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Current Objective:** 03\n**Status:** In progress'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'balanced' })
    );

    const result = runGsdTools('init execute-objective 03 --include state,config', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.state_content, 'state_content should be included');
    assert.ok(output.state_content.includes('Current Objective'), 'state content correct');
    assert.ok(output.config_content, 'config_content should be included');
    assert.ok(output.config_content.includes('model_profile'), 'config content correct');
  });

  test('init execute-objective without --include omits content', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '03-api');
    fs.mkdirSync(objectiveDir, { recursive: true });
    fs.writeFileSync(path.join(objectiveDir, '03-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State');

    const result = runGsdTools('init execute-objective 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_content, undefined, 'state_content should be omitted');
    assert.strictEqual(output.config_content, undefined, 'config_content should be omitted');
  });

  test('init plan-objective includes multiple file contents', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '03-api');
    fs.mkdirSync(objectiveDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# Project State');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap v1.0');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'REQUIREMENTS.md'), '# Requirements');
    fs.writeFileSync(path.join(objectiveDir, '03-CONTEXT.md'), '# Phase Context');
    fs.writeFileSync(path.join(objectiveDir, '03-RESEARCH.md'), '# Research Findings');

    const result = runGsdTools('init plan-objective 03 --include state,roadmap,requirements,context,research', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.state_content, 'state_content included');
    assert.ok(output.state_content.includes('Project State'), 'state content correct');
    assert.ok(output.roadmap_content, 'roadmap_content included');
    assert.ok(output.roadmap_content.includes('Roadmap v1.0'), 'roadmap content correct');
    assert.ok(output.requirements_content, 'requirements_content included');
    assert.ok(output.context_content, 'context_content included');
    assert.ok(output.research_content, 'research_content included');
  });

  test('init plan-objective includes verification and uat content', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '03-api');
    fs.mkdirSync(objectiveDir, { recursive: true });
    fs.writeFileSync(path.join(objectiveDir, '03-VERIFICATION.md'), '# Verification Results');
    fs.writeFileSync(path.join(objectiveDir, '03-UAT.md'), '# UAT Findings');

    const result = runGsdTools('init plan-objective 03 --include verification,uat', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.verification_content, 'verification_content included');
    assert.ok(output.verification_content.includes('Verification Results'), 'verification content correct');
    assert.ok(output.uat_content, 'uat_content included');
    assert.ok(output.uat_content.includes('UAT Findings'), 'uat content correct');
  });

  test('init progress includes state, roadmap, project, config', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'quality' })
    );

    const result = runGsdTools('init progress --include state,roadmap,project,config', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.state_content, 'state_content included');
    assert.ok(output.roadmap_content, 'roadmap_content included');
    assert.ok(output.project_content, 'project_content included');
    assert.ok(output.config_content, 'config_content included');
  });

  test('missing files return null in content fields', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '03-api');
    fs.mkdirSync(objectiveDir, { recursive: true });
    fs.writeFileSync(path.join(objectiveDir, '03-01-JOB.md'), '# Plan');

    const result = runGsdTools('init execute-objective 03 --include state,config', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_content, null, 'missing state returns null');
    assert.strictEqual(output.config_content, null, 'missing config returns null');
  });

  test('partial includes work correctly', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '03-api');
    fs.mkdirSync(objectiveDir, { recursive: true });
    fs.writeFileSync(path.join(objectiveDir, '03-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap');

    // Only request state, not roadmap
    const result = runGsdTools('init execute-objective 03 --include state', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.state_content, 'state_content included');
    assert.strictEqual(output.roadmap_content, undefined, 'roadmap_content not requested, should be undefined');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// roadmap analyze command
// ─────────────────────────────────────────────────────────────────────────────

describe('roadmap analyze command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing ROADMAP.md returns error', () => {
    const result = runGsdTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'ROADMAP.md not found');
  });

  test('parses objectives with goals and disk status', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

### Objective 1: Foundation
**Goal:** Set up infrastructure

### Objective 2: Authentication
**Goal:** Add user auth

### Objective 3: Features
**Goal:** Build core features
`
    );

    // Create objective dirs with varying completion
    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');

    const p2 = path.join(tmpDir, '.planning', 'objectives', '02-authentication');
    fs.mkdirSync(p2, { recursive: true });
    fs.writeFileSync(path.join(p2, '02-01-JOB.md'), '# Plan');

    const result = runGsdTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.objective_count, 3, 'should find 3 objectives');
    assert.strictEqual(output.objectives[0].disk_status, 'complete', 'objective 1 complete');
    assert.strictEqual(output.objectives[1].disk_status, 'planned', 'objective 2 planned');
    assert.strictEqual(output.objectives[2].disk_status, 'no_directory', 'objective 3 no directory');
    assert.strictEqual(output.completed_objectives, 1, '1 objective complete');
    assert.strictEqual(output.total_jobs, 2, '2 total jobs');
    assert.strictEqual(output.total_summaries, 1, '1 total summary');
    assert.strictEqual(output.progress_percent, 50, '50% complete');
    assert.strictEqual(output.current_objective, '2', 'current objective is 2');
  });

  test('extracts goals and dependencies', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Objective 1: Setup
**Goal:** Initialize project
**Depends on:** Nothing

### Objective 2: Build
**Goal:** Build features
**Depends on:** Objective 1
`
    );

    const result = runGsdTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.objectives[0].goal, 'Initialize project');
    assert.strictEqual(output.objectives[0].depends_on, 'Nothing');
    assert.strictEqual(output.objectives[1].goal, 'Build features');
    assert.strictEqual(output.objectives[1].depends_on, 'Objective 1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// objective add command
// ─────────────────────────────────────────────────────────────────────────────

describe('objective add command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('adds objective after highest existing', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

### Objective 1: Foundation
**Goal:** Setup

### Objective 2: API
**Goal:** Build API

---
`
    );

    const result = runGsdTools('objective add User Dashboard', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.objective_number, 3, 'should be objective 3');
    assert.strictEqual(output.slug, 'user-dashboard');

    // Verify directory created
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'objectives', '03-user-dashboard')),
      'directory should be created'
    );

    // Verify ROADMAP updated
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmap.includes('### Objective 3: User Dashboard'), 'roadmap should include new phase');
    assert.ok(roadmap.includes('**Depends on:** Objective 2'), 'should depend on previous');
  });

  test('handles empty roadmap', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0\n`
    );

    const result = runGsdTools('objective add Initial Setup', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.objective_number, 1, 'should be objective 1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// objective insert command
// ─────────────────────────────────────────────────────────────────────────────

describe('objective insert command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('inserts decimal objective after target', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Objective 1: Foundation
**Goal:** Setup

### Objective 2: API
**Goal:** Build API
`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '01-foundation'), { recursive: true });

    const result = runGsdTools('objective insert 1 Fix Critical Bug', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.objective_number, '01.1', 'should be 01.1');
    assert.strictEqual(output.after_objective, '1');

    // Verify directory
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'objectives', '01.1-fix-critical-bug')),
      'decimal objective directory should be created'
    );

    // Verify ROADMAP
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmap.includes('Objective 01.1: Fix Critical Bug (INSERTED)'), 'roadmap should include inserted objective');
  });

  test('increments decimal when siblings exist', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Objective 1: Foundation
**Goal:** Setup

### Objective 2: API
**Goal:** Build API
`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '01-foundation'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '01.1-hotfix'), { recursive: true });

    const result = runGsdTools('objective insert 1 Another Fix', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.objective_number, '01.2', 'should be 01.2');
  });

  test('rejects missing objective', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Objective 1: Test\n**Goal:** Test\n`
    );

    const result = runGsdTools('objective insert 99 Fix Something', tmpDir);
    assert.ok(!result.success, 'should fail for missing objective');
    assert.ok(result.error.includes('not found'), 'error mentions not found');
  });

  test('handles padding mismatch between input and roadmap', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

## Objective 09.05: Existing Decimal Phase
**Goal:** Test padding

## Objective 09.1: Next Phase
**Goal:** Test
`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '09.05-existing'), { recursive: true });

    // Pass unpadded "9.05" but roadmap has "09.05"
    const result = runGsdTools('objective insert 9.05 Padding Test', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.after_objective, '9.05');

    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmap.includes('(INSERTED)'), 'roadmap should include inserted objective');
  });

  test('handles #### heading depth from multi-milestone roadmaps', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### v1.1 Milestone

#### Objective 5: Feature Work
**Goal:** Build features

#### Objective 6: Polish
**Goal:** Polish
`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '05-feature-work'), { recursive: true });

    const result = runGsdTools('objective insert 5 Hotfix', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.objective_number, '05.1');

    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmap.includes('Objective 05.1: Hotfix (INSERTED)'), 'roadmap should include inserted objective');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// objective remove command
// ─────────────────────────────────────────────────────────────────────────────

describe('objective remove command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('removes objective directory and renumbers subsequent', () => {
    // Setup 3 objectives
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Objective 1: Foundation
**Goal:** Setup
**Depends on:** Nothing

### Objective 2: Auth
**Goal:** Authentication
**Depends on:** Objective 1

### Objective 3: Features
**Goal:** Core features
**Depends on:** Objective 2
`
    );

    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '01-foundation'), { recursive: true });
    const p2 = path.join(tmpDir, '.planning', 'objectives', '02-auth');
    fs.mkdirSync(p2, { recursive: true });
    fs.writeFileSync(path.join(p2, '02-01-JOB.md'), '# Plan');
    const p3 = path.join(tmpDir, '.planning', 'objectives', '03-features');
    fs.mkdirSync(p3, { recursive: true });
    fs.writeFileSync(path.join(p3, '03-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(p3, '03-02-JOB.md'), '# Job 2');

    // Remove objective 2
    const result = runGsdTools('objective remove 2', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.removed, '2');
    assert.strictEqual(output.directory_deleted, '02-auth');

    // Objective 3 should be renumbered to 02
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'objectives', '02-features')),
      'objective 3 should be renumbered to 02-features'
    );
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.planning', 'objectives', '03-features')),
      'old 03-features should not exist'
    );

    // Files inside should be renamed
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'objectives', '02-features', '02-01-JOB.md')),
      'job file should be renumbered to 02-01'
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'objectives', '02-features', '02-02-JOB.md')),
      'job 2 should be renumbered to 02-02'
    );

    // ROADMAP should be updated
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(!roadmap.includes('Objective 2: Auth'), 'removed objective should not be in roadmap');
    assert.ok(roadmap.includes('Objective 2: Features'), 'objective 3 should be renumbered to 2');
  });

  test('rejects removal of objective with summaries unless --force', () => {
    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-test');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Objective 1: Test\n**Goal:** Test\n`
    );

    // Should fail without --force
    const result = runGsdTools('objective remove 1', tmpDir);
    assert.ok(!result.success, 'should fail without --force');
    assert.ok(result.error.includes('executed job'), 'error mentions executed jobs');

    // Should succeed with --force
    const forceResult = runGsdTools('objective remove 1 --force', tmpDir);
    assert.ok(forceResult.success, `Force remove failed: ${forceResult.error}`);
  });

  test('removes decimal objective and renumbers siblings', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Objective 6: Main\n**Goal:** Main\n### Objective 6.1: Fix A\n**Goal:** Fix A\n### Objective 6.2: Fix B\n**Goal:** Fix B\n### Objective 6.3: Fix C\n**Goal:** Fix C\n`
    );

    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06-main'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06.1-fix-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06.2-fix-b'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '06.3-fix-c'), { recursive: true });

    const result = runGsdTools('objective remove 6.2', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // 06.3 should become 06.2
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'objectives', '06.2-fix-c')),
      '06.3 should be renumbered to 06.2'
    );
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.planning', 'objectives', '06.3-fix-c')),
      'old 06.3 should not exist'
    );
  });

  test('updates STATE.md objective count', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Objective 1: A\n**Goal:** A\n### Objective 2: B\n**Goal:** B\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Objective:** 1\n**Total Objectives:** 2\n`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '01-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '02-b'), { recursive: true });

    runGsdTools('objective remove 2', tmpDir);

    const state = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(state.includes('**Total Objectives:** 1'), 'total objectives should be decremented');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// objective complete command
// ─────────────────────────────────────────────────────────────────────────────

describe('objective complete command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('marks objective complete and transitions to next', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

- [ ] Objective 1: Foundation
- [ ] Objective 2: API

### Objective 1: Foundation
**Goal:** Setup
**Jobs:** 1 jobs

### Objective 2: API
**Goal:** Build API
`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Objective:** 01\n**Current Objective Name:** Foundation\n**Status:** In progress\n**Current Job:** 01-01\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working on objective 1\n`
    );

    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '02-api'), { recursive: true });

    const result = runGsdTools('objective complete 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.completed_objective, '1');
    assert.strictEqual(output.plans_executed, '1/1');
    assert.strictEqual(output.next_phase, '02');
    assert.strictEqual(output.is_last_objective, false);

    // Verify STATE.md updated
    const state = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(state.includes('**Current Objective:** 02'), 'should advance to objective 02');
    assert.ok(state.includes('**Status:** Ready to plan'), 'status should be ready to plan');
    assert.ok(state.includes('**Current Job:** Not started'), 'plan should be reset');

    // Verify ROADMAP checkbox
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmap.includes('[x]'), 'objective should be checked off');
    assert.ok(roadmap.includes('completed'), 'completion date should be added');
  });

  test('detects last objective in milestone', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Objective 1: Only Phase\n**Goal:** Everything\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Objective:** 01\n**Status:** In progress\n**Current Job:** 01-01\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working\n`
    );

    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-only-phase');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');

    const result = runGsdTools('objective complete 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.is_last_objective, true, 'should detect last phase');
    assert.strictEqual(output.next_phase, null, 'no next objective');

    const state = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(state.includes('Milestone complete'), 'status should be milestone complete');
  });

  test('updates REQUIREMENTS.md traceability when objective completes', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

- [ ] Objective 1: Auth

### Objective 1: Auth
**Goal:** User authentication
**Requirements:** AUTH-01, AUTH-02
**Jobs:** 1 jobs

### Objective 2: API
**Goal:** Build API
**Requirements:** API-01
`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      `# Requirements

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can sign up with email
- [ ] **AUTH-02**: User can log in
- [ ] **AUTH-03**: User can reset password

### API

- [ ] **API-01**: REST endpoints

## Traceability

| Requirement | Objective | Status |
|-------------|-------|--------|
| AUTH-01 | Objective 1 | Pending |
| AUTH-02 | Objective 1 | Pending |
| AUTH-03 | Objective 2 | Pending |
| API-01 | Objective 2 | Pending |
`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Objective:** 01\n**Current Objective Name:** Auth\n**Status:** In progress\n**Current Job:** 01-01\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working\n`
    );

    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-auth');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '02-api'), { recursive: true });

    const result = runGsdTools('objective complete 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const req = fs.readFileSync(path.join(tmpDir, '.planning', 'REQUIREMENTS.md'), 'utf-8');

    // Checkboxes updated for objective 1 requirements
    assert.ok(req.includes('- [x] **AUTH-01**'), 'AUTH-01 checkbox should be checked');
    assert.ok(req.includes('- [x] **AUTH-02**'), 'AUTH-02 checkbox should be checked');
    // Other requirements unchanged
    assert.ok(req.includes('- [ ] **AUTH-03**'), 'AUTH-03 should remain unchecked');
    assert.ok(req.includes('- [ ] **API-01**'), 'API-01 should remain unchecked');

    // Traceability table updated
    assert.ok(req.includes('| AUTH-01 | Objective 1 | Complete |'), 'AUTH-01 status should be Complete');
    assert.ok(req.includes('| AUTH-02 | Objective 1 | Complete |'), 'AUTH-02 status should be Complete');
    assert.ok(req.includes('| AUTH-03 | Objective 2 | Pending |'), 'AUTH-03 should remain Pending');
    assert.ok(req.includes('| API-01 | Objective 2 | Pending |'), 'API-01 should remain Pending');
  });

  test('handles requirements with bracket format [REQ-01, REQ-02]', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

- [ ] Objective 1: Auth

### Objective 1: Auth
**Goal:** User authentication
**Requirements:** [AUTH-01, AUTH-02]
**Jobs:** 1 jobs

### Objective 2: API
**Goal:** Build API
**Requirements:** [API-01]
`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      `# Requirements

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can sign up with email
- [ ] **AUTH-02**: User can log in
- [ ] **AUTH-03**: User can reset password

### API

- [ ] **API-01**: REST endpoints

## Traceability

| Requirement | Objective | Status |
|-------------|-------|--------|
| AUTH-01 | Objective 1 | Pending |
| AUTH-02 | Objective 1 | Pending |
| AUTH-03 | Objective 2 | Pending |
| API-01 | Objective 2 | Pending |
`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Objective:** 01\n**Current Objective Name:** Auth\n**Status:** In progress\n**Current Job:** 01-01\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working\n`
    );

    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-auth');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '02-api'), { recursive: true });

    const result = runGsdTools('objective complete 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const req = fs.readFileSync(path.join(tmpDir, '.planning', 'REQUIREMENTS.md'), 'utf-8');

    // Checkboxes updated for objective 1 requirements (brackets stripped)
    assert.ok(req.includes('- [x] **AUTH-01**'), 'AUTH-01 checkbox should be checked');
    assert.ok(req.includes('- [x] **AUTH-02**'), 'AUTH-02 checkbox should be checked');
    // Other requirements unchanged
    assert.ok(req.includes('- [ ] **AUTH-03**'), 'AUTH-03 should remain unchecked');
    assert.ok(req.includes('- [ ] **API-01**'), 'API-01 should remain unchecked');

    // Traceability table updated
    assert.ok(req.includes('| AUTH-01 | Objective 1 | Complete |'), 'AUTH-01 status should be Complete');
    assert.ok(req.includes('| AUTH-02 | Objective 1 | Complete |'), 'AUTH-02 status should be Complete');
    assert.ok(req.includes('| AUTH-03 | Objective 2 | Pending |'), 'AUTH-03 should remain Pending');
    assert.ok(req.includes('| API-01 | Objective 2 | Pending |'), 'API-01 should remain Pending');
  });

  test('handles objective with no requirements mapping', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

- [ ] Objective 1: Setup

### Objective 1: Setup
**Goal:** Project setup (no requirements)
**Jobs:** 1 jobs
`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      `# Requirements

## v1 Requirements

- [ ] **REQ-01**: Some requirement

## Traceability

| Requirement | Objective | Status |
|-------------|-------|--------|
| REQ-01 | Objective 2 | Pending |
`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Objective:** 01\n**Status:** In progress\n**Current Job:** 01-01\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working\n`
    );

    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-setup');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');

    const result = runGsdTools('objective complete 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // REQUIREMENTS.md should be unchanged
    const req = fs.readFileSync(path.join(tmpDir, '.planning', 'REQUIREMENTS.md'), 'utf-8');
    assert.ok(req.includes('- [ ] **REQ-01**'), 'REQ-01 should remain unchecked');
    assert.ok(req.includes('| REQ-01 | Objective 2 | Pending |'), 'REQ-01 should remain Pending');
  });

  test('handles missing REQUIREMENTS.md gracefully', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

- [ ] Objective 1: Foundation
**Requirements:** REQ-01

### Objective 1: Foundation
**Goal:** Setup
`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Objective:** 01\n**Status:** In progress\n**Current Job:** 01-01\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working\n`
    );

    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');

    const result = runGsdTools('objective complete 1', tmpDir);
    assert.ok(result.success, `Command should succeed even without REQUIREMENTS.md: ${result.error}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// milestone complete command
// ─────────────────────────────────────────────────────────────────────────────

describe('milestone complete command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('archives roadmap, requirements, creates MILESTONES.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0 MVP\n\n### Objective 1: Foundation\n**Goal:** Setup\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      `# Requirements\n\n- [ ] User auth\n- [ ] Dashboard\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Status:** In progress\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working\n`
    );

    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(
      path.join(p1, '01-01-SUMMARY.md'),
      `---\none-liner: Set up project infrastructure\n---\n# Summary\n`
    );

    const result = runGsdTools('milestone complete v1.0 --name MVP Foundation', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.version, 'v1.0');
    assert.strictEqual(output.objectives, 1);
    assert.ok(output.archived.roadmap, 'roadmap should be archived');
    assert.ok(output.archived.requirements, 'requirements should be archived');

    // Verify archive files exist
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'v1.0-ROADMAP.md')),
      'archived roadmap should exist'
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'v1.0-REQUIREMENTS.md')),
      'archived requirements should exist'
    );

    // Verify MILESTONES.md created
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'MILESTONES.md')),
      'MILESTONES.md should be created'
    );
    const milestones = fs.readFileSync(path.join(tmpDir, '.planning', 'MILESTONES.md'), 'utf-8');
    assert.ok(milestones.includes('v1.0 MVP Foundation'), 'milestone entry should contain name');
    assert.ok(milestones.includes('Set up project infrastructure'), 'accomplishments should be listed');
  });

  test('appends to existing MILESTONES.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'MILESTONES.md'),
      `# Milestones\n\n## v0.9 Alpha (Shipped: 2025-01-01)\n\n---\n\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Status:** In progress\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working\n`
    );

    const result = runGsdTools('milestone complete v1.0 --name Beta', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const milestones = fs.readFileSync(path.join(tmpDir, '.planning', 'MILESTONES.md'), 'utf-8');
    assert.ok(milestones.includes('v0.9 Alpha'), 'existing entry should be preserved');
    assert.ok(milestones.includes('v1.0 Beta'), 'new entry should be appended');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate consistency command
// ─────────────────────────────────────────────────────────────────────────────

describe('validate consistency command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('passes for consistent project', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Objective 1: A\n### Objective 2: B\n### Objective 3: C\n`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '01-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '02-b'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '03-c'), { recursive: true });

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.passed, true, 'should pass');
    assert.strictEqual(output.warning_count, 0, 'no warnings');
  });

  test('warns about objective on disk but not in roadmap', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Objective 1: A\n`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '01-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '02-orphan'), { recursive: true });

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.warning_count > 0, 'should have warnings');
    assert.ok(
      output.warnings.some(w => w.includes('disk but not in ROADMAP')),
      'should warn about orphan directory'
    );
  });

  test('warns about gaps in objective numbering', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Objective 1: A\n### Objective 3: C\n`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '01-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '03-c'), { recursive: true });

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(
      output.warnings.some(w => w.includes('Gap in objective numbering')),
      'should warn about gap'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// progress command
// ─────────────────────────────────────────────────────────────────────────────

describe('progress command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('renders JSON progress', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0 MVP\n`
    );
    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Done');
    fs.writeFileSync(path.join(p1, '01-02-JOB.md'), '# Job 2');

    const result = runGsdTools('progress json', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.total_jobs, 2, '2 total jobs');
    assert.strictEqual(output.total_summaries, 1, '1 summary');
    assert.strictEqual(output.percent, 50, '50%');
    assert.strictEqual(output.objectives.length, 1, '1 phase');
    assert.strictEqual(output.objectives[0].status, 'In Progress', 'phase in progress');
  });

  test('renders bar format', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0\n`
    );
    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-test');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Done');

    const result = runGsdTools('progress bar --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.ok(result.output.includes('1/1'), 'should include count');
    assert.ok(result.output.includes('100%'), 'should include 100%');
  });

  test('renders table format', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0 MVP\n`
    );
    const p1 = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-JOB.md'), '# Plan');

    const result = runGsdTools('progress table --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.ok(result.output.includes('Objective'), 'should have table header');
    assert.ok(result.output.includes('foundation'), 'should include objective name');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// todo complete command
// ─────────────────────────────────────────────────────────────────────────────

describe('todo complete command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('moves todo from pending to completed', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(
      path.join(pendingDir, 'add-dark-mode.md'),
      `title: Add dark mode\narea: ui\ncreated: 2025-01-01\n`
    );

    const result = runGsdTools('todo complete add-dark-mode.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.completed, true);

    // Verify moved
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'pending', 'add-dark-mode.md')),
      'should be removed from pending'
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'completed', 'add-dark-mode.md')),
      'should be in completed'
    );

    // Verify completion timestamp added
    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'todos', 'completed', 'add-dark-mode.md'),
      'utf-8'
    );
    assert.ok(content.startsWith('completed:'), 'should have completed timestamp');
  });

  test('fails for nonexistent todo', () => {
    const result = runGsdTools('todo complete nonexistent.md', tmpDir);
    assert.ok(!result.success, 'should fail');
    assert.ok(result.error.includes('not found'), 'error mentions not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scaffold command
// ─────────────────────────────────────────────────────────────────────────────

describe('scaffold command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('scaffolds context file', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '03-api'), { recursive: true });

    const result = runGsdTools('scaffold context --objective 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    // Verify file content
    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'objectives', '03-api', '03-CONTEXT.md'),
      'utf-8'
    );
    assert.ok(content.includes('Objective 3'), 'should reference objective number');
    assert.ok(content.includes('Decisions'), 'should have decisions section');
    assert.ok(content.includes('Discretion Areas'), 'should have discretion section');
  });

  test('scaffolds UAT file', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '03-api'), { recursive: true });

    const result = runGsdTools('scaffold uat --objective 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'objectives', '03-api', '03-UAT.md'),
      'utf-8'
    );
    assert.ok(content.includes('User Acceptance Testing'), 'should have UAT heading');
    assert.ok(content.includes('Test Results'), 'should have test results section');
  });

  test('scaffolds verification file', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives', '03-api'), { recursive: true });

    const result = runGsdTools('scaffold verification --objective 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'objectives', '03-api', '03-VERIFICATION.md'),
      'utf-8'
    );
    assert.ok(content.includes('Goal-Backward Verification'), 'should have verification heading');
  });

  test('scaffolds objective directory', () => {
    const result = runGsdTools('scaffold objective-dir --objective 5 --name User Dashboard', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'objectives', '05-user-dashboard')),
      'directory should be created'
    );
  });

  test('does not overwrite existing files', () => {
    const objectiveDir = path.join(tmpDir, '.planning', 'objectives', '03-api');
    fs.mkdirSync(objectiveDir, { recursive: true });
    fs.writeFileSync(path.join(objectiveDir, '03-CONTEXT.md'), '# Existing content');

    const result = runGsdTools('scaffold context --objective 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, false, 'should not overwrite');
    assert.strictEqual(output.reason, 'already_exists');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// workstreams analyze command
// ─────────────────────────────────────────────────────────────────────────────

describe('workstreams analyze command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('detects parallel workstream candidates from non-linear deps', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

## Objectives

- [x] **Objective 1: Foundation** - Setup
- [ ] **Objective 2: Auth** - Authentication
- [ ] **Objective 3: Content** - Content system
- [ ] **Objective 4: Social** - Social features

## Objective Details

### Objective 1: Foundation
**Goal**: Set up project infrastructure
**Depends on**: Nothing

### Objective 2: Auth
**Goal**: User authentication
**Depends on**: Objective 1

### Objective 3: Content
**Goal**: Content management
**Depends on**: Objective 1

### Objective 4: Social
**Goal**: Social features
**Depends on**: Objective 2, Objective 3
`
    );

    // Mark objective 1 as complete on disk
    const phase1Dir = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(phase1Dir, { recursive: true });
    fs.writeFileSync(path.join(phase1Dir, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(phase1Dir, '01-01-SUMMARY.md'), '# Summary');

    const result = runGsdTools('workstreams analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.parallelism_possible, true, 'should detect parallelism');
    assert.strictEqual(output.max_concurrent, 2, 'should find 2 concurrent workstreams');
    assert.strictEqual(output.workstream_groups.length, 2, 'should have 2 workstream groups');

    // Verify workstream names
    const names = output.workstream_groups.map(g => g.name).sort();
    assert.deepStrictEqual(names, ['Auth', 'Content'], 'should identify Auth and Content');

    // Verify join objectives
    assert.strictEqual(output.join_phases.length, 1, 'should have 1 join objective');
    assert.strictEqual(output.join_phases[0].objective, '4', 'join objective should be 4');
    assert.deepStrictEqual(
      output.join_phases[0].waits_for.sort(),
      ['2', '3'],
      'join objective waits for objectives 2 and 3'
    );
  });

  test('returns no parallelism for linear dependencies', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

## Objective Details

### Objective 1: Foundation
**Goal**: Setup
**Depends on**: Nothing

### Objective 2: Auth
**Goal**: Auth
**Depends on**: Objective 1

### Objective 3: Content
**Goal**: Content
**Depends on**: Objective 2
`
    );

    const phase1Dir = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    fs.mkdirSync(phase1Dir, { recursive: true });
    fs.writeFileSync(path.join(phase1Dir, '01-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(phase1Dir, '01-01-SUMMARY.md'), '# Summary');

    const result = runGsdTools('workstreams analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.parallelism_possible, false, 'should not detect parallelism');
    assert.strictEqual(output.max_concurrent, 1, 'only 1 objective eligible');
  });

  test('handles no completed objectives', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

## Objective Details

### Objective 1: Foundation
**Goal**: Setup
**Depends on**: Nothing
`
    );

    const result = runGsdTools('workstreams analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.workstream_groups.length, 1, 'objective 1 has no deps so is eligible');
    assert.strictEqual(output.parallelism_possible, false, 'only 1 group = no parallelism');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// workstreams provision command
// ─────────────────────────────────────────────────────────────────────────────

describe('workstreams provision command', () => {
  let tmpDir;
  let worktreeDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    worktreeDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'df-ws-'));
  });

  afterEach(() => {
    cleanup(tmpDir);
    cleanup(worktreeDir);
  });

  test('provisions .planning/ with filtered state', () => {
    // Setup source .planning/
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\nTest project');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'REQUIREMENTS.md'), '# Requirements');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), '{"mode":"interactive"}');

    // Create objective directories
    const phase1Dir = path.join(tmpDir, '.planning', 'objectives', '01-foundation');
    const phase2Dir = path.join(tmpDir, '.planning', 'objectives', '02-auth');
    const phase3Dir = path.join(tmpDir, '.planning', 'objectives', '03-content');
    fs.mkdirSync(phase1Dir, { recursive: true });
    fs.mkdirSync(phase2Dir, { recursive: true });
    fs.mkdirSync(phase3Dir, { recursive: true });
    fs.writeFileSync(path.join(phase1Dir, '01-01-JOB.md'), '# Job 1');
    fs.writeFileSync(path.join(phase2Dir, '02-01-JOB.md'), '# Job 2');
    fs.writeFileSync(path.join(phase3Dir, '03-01-JOB.md'), '# Job 3');

    // Create research dir
    fs.mkdirSync(path.join(tmpDir, '.planning', 'research'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'research', 'SUMMARY.md'), '# Research');

    // Create workstreams.json
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'workstreams.json'),
      JSON.stringify({
        version: '1.0',
        base_branch: 'main',
        status: 'active',
        workstreams: [
          {
            id: 'ws-auth',
            name: 'Auth',
            objectives: [2],
            branch: 'df/ws-auth',
            worktree_path: worktreeDir,
            status: 'pending',
            depends_on_completed: [1],
          },
        ],
        join_phases: [4],
      })
    );

    const result = runGsdTools(`workstreams provision ws-auth "${worktreeDir}"`, tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.strictEqual(output.workstream, 'ws-auth');

    // Verify shared files copied
    assert.ok(fs.existsSync(path.join(worktreeDir, '.planning', 'PROJECT.md')), 'PROJECT.md copied');
    assert.ok(fs.existsSync(path.join(worktreeDir, '.planning', 'ROADMAP.md')), 'ROADMAP.md copied');
    assert.ok(fs.existsSync(path.join(worktreeDir, '.planning', 'config.json')), 'config.json copied');
    assert.ok(fs.existsSync(path.join(worktreeDir, '.planning', 'research', 'SUMMARY.md')), 'research copied');

    // Verify workstream objective directory copied
    assert.ok(
      fs.existsSync(path.join(worktreeDir, '.planning', 'objectives', '02-auth', '02-01-JOB.md')),
      'objective 2 copied'
    );

    // Verify completed dependency objective also copied (for context)
    assert.ok(
      fs.existsSync(path.join(worktreeDir, '.planning', 'objectives', '01-foundation', '01-01-JOB.md')),
      'objective 1 (dependency) copied for context'
    );

    // Verify objective 3 NOT copied (not in this workstream)
    assert.ok(
      !fs.existsSync(path.join(worktreeDir, '.planning', 'objectives', '03-content')),
      'objective 3 should not be copied'
    );

    // Verify filtered STATE.md
    const state = fs.readFileSync(path.join(worktreeDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(state.includes('Workstream Context'), 'STATE.md has workstream context');
    assert.ok(state.includes('ws-auth'), 'STATE.md references workstream id');

    // Verify marker
    const marker = JSON.parse(
      fs.readFileSync(path.join(worktreeDir, '.planning', 'workstream-marker.json'), 'utf-8')
    );
    assert.strictEqual(marker.id, 'ws-auth');
    assert.deepStrictEqual(marker.objectives, [2]);
  });

  test('fails without workstreams.json', () => {
    const result = runGsdTools(`workstreams provision ws-auth "${worktreeDir}"`, tmpDir);
    assert.strictEqual(result.success, false, 'should fail');
    assert.ok(result.error.includes('workstreams.json'), 'should mention workstreams.json');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// workstreams reconcile command
// ─────────────────────────────────────────────────────────────────────────────

describe('workstreams reconcile command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('reconciles merged workstreams and regenerates state', () => {
    // Setup ROADMAP with objectives
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

## Objectives

- [x] **Objective 1: Foundation** - Setup
- [ ] **Objective 2: Auth** - Authentication
- [ ] **Objective 3: Content** - Content system

## Objective Details

### Objective 1: Foundation
**Goal**: Setup
**Depends on**: Nothing

### Objective 2: Auth
**Goal**: Authentication
**Depends on**: Objective 1

### Objective 3: Content
**Goal**: Content management
**Depends on**: Objective 1

## Progress

| Objective | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 1/1 | Complete | 2026-01-01 |
| 2. Auth | 0/1 | Not started | - |
| 3. Content | 0/1 | Not started | - |
`
    );

    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\n**Core value:** Test app');

    // Create completed objective directories
    const phase2Dir = path.join(tmpDir, '.planning', 'objectives', '02-auth');
    const phase3Dir = path.join(tmpDir, '.planning', 'objectives', '03-content');
    fs.mkdirSync(phase2Dir, { recursive: true });
    fs.mkdirSync(phase3Dir, { recursive: true });
    fs.writeFileSync(path.join(phase2Dir, '02-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(phase2Dir, '02-01-SUMMARY.md'), '# Summary');
    fs.writeFileSync(path.join(phase3Dir, '03-01-JOB.md'), '# Plan');
    fs.writeFileSync(path.join(phase3Dir, '03-01-SUMMARY.md'), '# Summary');

    // Create workstreams.json with merged workstreams
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'workstreams.json'),
      JSON.stringify({
        version: '1.0',
        base_branch: 'main',
        status: 'active',
        workstreams: [
          { id: 'ws-auth', name: 'Auth', objectives: [2], status: 'merged' },
          { id: 'ws-content', name: 'Content', objectives: [3], status: 'merged' },
        ],
        join_phases: [4],
        completed_workstreams: [],
      })
    );

    const result = runGsdTools('workstreams reconcile', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.strictEqual(output.reconciled_phases.length, 2, 'should reconcile 2 objectives');
    assert.strictEqual(output.next_phase, 4, 'next objective should be join objective 4');
    assert.strictEqual(output.state_regenerated, true);

    // Verify STATE.md regenerated
    const state = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(state.includes('Ready to plan'), 'STATE.md ready for next objective');

    // Verify workstreams.json updated
    const wsData = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.planning', 'workstreams.json'), 'utf-8')
    );
    assert.strictEqual(wsData.status, 'merged');
    assert.strictEqual(wsData.workstreams.length, 0, 'active workstreams should be empty');
    assert.strictEqual(wsData.completed_workstreams.length, 2, 'completed should have 2');
  });

  test('fails without workstreams.json', () => {
    const result = runGsdTools('workstreams reconcile', tmpDir);
    assert.strictEqual(result.success, false, 'should fail');
  });
});
