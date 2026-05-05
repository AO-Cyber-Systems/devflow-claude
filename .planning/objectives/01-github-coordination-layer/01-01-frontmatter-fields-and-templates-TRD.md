---
objective: 01-github-coordination-layer
trd: 01-01
title: Frontmatter fields & template documentation (back-compat verification)
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/templates/project.md
  - plugins/devflow/devflow/templates/objective.md
  - plugins/devflow/devflow/templates/job-prompt.md
  - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
autonomous: true
requirements: [SC-1, SC-7]
verification_commands:
  - "npm test"
  - "node -e 'const fm=require(\"./plugins/devflow/devflow/bin/lib/frontmatter.cjs\"); const c=`---\\nkind: api\\n---\\n# x`; const p=fm.extractFrontmatter(c); if(p.kind!==\"api\") throw new Error(\"baseline parse failed\"); console.log(\"OK\");'"
  - "node -e 'const fm=require(\"./plugins/devflow/devflow/bin/lib/frontmatter.cjs\"); const c=`---\\nwork: feature\\ngithub_issue: AO-Cyber-Systems/devflow-claude#20\\nparent_issue: \"#9\"\\norg_project: PVT_kwDODwqLrc4BRsOP\\n---\\n# x`; const p=fm.extractFrontmatter(c); if(p.github_issue!==\"AO-Cyber-Systems/devflow-claude#20\") throw new Error(\"github_issue parse failed: \"+p.github_issue); if(p.parent_issue!==\"#9\") throw new Error(\"parent_issue shorthand parse failed: \"+p.parent_issue); if(p.org_project!==\"PVT_kwDODwqLrc4BRsOP\") throw new Error(\"org_project parse failed\"); console.log(\"OK\");'"
  - "grep -q 'github_issue' plugins/devflow/devflow/templates/objective.md"
  - "grep -q 'github_repo' plugins/devflow/devflow/templates/project.md"
  - "grep -q 'parent_issue' plugins/devflow/devflow/templates/job-prompt.md"

must_haves:
  truths:
    - "OBJECTIVE.md template documents 4 new optional fields: github_issue, parent_issue, org_initiative, org_project, with shorthand and full-ref examples for each"
    - "PROJECT.md template documents 2 new optional fields: github_repo, org_project, used as defaults for objective inheritance"
    - "JOB.md (job-prompt.md) template documents github_issue as optional per-TRD override (rare-use)"
    - "Existing OBJECTIVE.md files (e.g., the matrix project from intent fixtures) without these fields parse cleanly with no warnings"
    - "Frontmatter parser preserves shorthand `#9` literally and full ref `AO-Cyber-Systems/devflow-claude#9` literally; no rewriting at parse time"
    - "frontmatter.test.cjs has new tests proving (a) baseline parse works for all 6 new fields, (b) shorthand and full ref both round-trip, (c) absence of fields produces no warnings"
  artifacts:
    - path: "plugins/devflow/devflow/templates/project.md"
      provides: "PROJECT.md template documenting github_repo + org_project optional fields"
      contains: "github_repo"
    - path: "plugins/devflow/devflow/templates/objective.md"
      provides: "OBJECTIVE.md template documenting 4 new GH-link optional fields"
      contains: "parent_issue"
    - path: "plugins/devflow/devflow/templates/job-prompt.md"
      provides: "JOB.md template documenting per-TRD github_issue optional field"
      contains: "github_issue"
    - path: "plugins/devflow/devflow/bin/lib/frontmatter.test.cjs"
      provides: "Test file verifying back-compat parse + new field round-trip"
      contains: "github_issue"
  key_links:
    - from: "plugins/devflow/devflow/templates/objective.md"
      to: "plugins/devflow/devflow/bin/lib/frontmatter.cjs::extractFrontmatter"
      via: "Existing parser (permissive — handles unknown fields)"
      pattern: "extractFrontmatter"
    - from: "plugins/devflow/devflow/bin/lib/frontmatter.test.cjs"
      to: "plugins/devflow/devflow/bin/lib/frontmatter.cjs"
      via: "require + test new fields"
      pattern: "require.*frontmatter"
---

<objective>
Document the new optional GitHub-link frontmatter fields in the three template files and prove (via tests) that the existing permissive `extractFrontmatter` parser handles them — including the shorthand `#NN` form — without breaking back-compat.

Purpose: Closes objective-1 success criteria 1 and 7. This is the foundation TRD: every downstream resolver/sync TRD assumes the frontmatter convention is documented and the parser handles it. Ships in Wave 1 (no `lib/gh.cjs` touch) so subsequent waves have a stable base.

Output: Updated template documentation (3 files) + new test file proving back-compat and new-field parse coverage. NO production code changes — `frontmatter.cjs` is already permissive enough; this TRD verifies that fact and documents the convention.

Why standard (not TDD): The work is documentation + verification. There is no new logic to test-drive; the existing parser is the implementation, and the new tests are regression coverage on observed behavior.
</objective>

<file_tree>
plugins/devflow/devflow/templates/
├── project.md          ← MODIFY (add `github_repo`, `org_project` to frontmatter doc + guidelines)
├── objective.md        ← MODIFY (add `github_issue`, `parent_issue`, `org_initiative`, `org_project`)
└── job-prompt.md       ← MODIFY (add per-TRD `github_issue` to fields table + example)

plugins/devflow/devflow/bin/lib/
└── frontmatter.test.cjs ← CREATE (back-compat + new-field parse coverage)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Existing parser permissiveness** (`plugins/devflow/devflow/bin/lib/frontmatter.cjs::extractFrontmatter`, lines 9-82):

The parser is dictionary-permissive — it walks the YAML lines and writes any `key: value` pair into the result, regardless of whether the key is in a known schema. The `FRONTMATTER_SCHEMAS` table at line 225 is only consulted by `cmdFrontmatterValidate`, which is opt-in via `df-tools frontmatter validate <path> --schema <name>`. Unvalidated reads (the default) accept any field.

This means: **adding new optional fields requires no parser change.** The new fields parse into the dict for free. This TRD's test file proves it.

**Existing template style** (`templates/objective.md`, lines 9-31):

```markdown
\`\`\`markdown
---
work: feature              # OPTIONAL — what this objective DOES. One of:
                           #   feature    — net-new behavior
                           #   port       — re-implement existing behavior...
                           ...

overrides:                 # OPTIONAL — explicit per-objective overrides for the
                           # (kind, work) defaults. Use when this objective genuinely
                           # differs from what its (kind, work) cell prescribes.
  tdd: strict
  ...
---
\`\`\`
```

Follow this exact style: inline-comment doc strings, OPTIONAL-tagged keys, examples in the YAML block. Don't restructure — extend.

**Test file shape** — match the project's existing pattern. There is no `frontmatter.test.cjs` today (test coverage for frontmatter is in `df-tools.test.cjs`). Create the new file using `node:test` + `node:assert` (CommonJS, sync, sibling-to-source layout per CLAUDE.md §Conventions). Look at `plugins/devflow/devflow/bin/lib/intent.test.cjs` for the project's test structure.
</codebase_examples>

<anti_patterns>
- **Do NOT add a YAML library dependency.** The existing `extractFrontmatter` parser is sufficient for all the new fields (they're plain string values).
- **Do NOT add validation for the new fields to `FRONTMATTER_SCHEMAS`.** They are OPTIONAL. Adding to required-fields would break back-compat (existing OBJECTIVE.md files don't have them). The schema table is only consulted by `--schema` opt-in validation.
- **Do NOT rewrite shorthand `#9` to full ref at parse time.** The parser is dumb-pass-through. The resolver (TRD 01-02) is responsible for shorthand resolution, NOT the parser.
- **Do NOT add a separate `parseFrontmatter` function for the new fields.** The existing `extractFrontmatter` handles them.
- **Do NOT modify `reconstructFrontmatter` or `spliceFrontmatter`.** They serialize whatever's in the dict; new keys go through unchanged.
</anti_patterns>

<error_recovery>
- If the template Markdown rendering looks broken after edit (broken YAML inside the inline `\`\`\`markdown` block): the templates wrap their YAML examples in code fences. Make sure the fences are closed before the `</template>` tag. Inspect the rendered output by `cat`-ing the file.
- If `frontmatter.test.cjs` fails on a baseline parse, the parser hasn't been touched (this TRD adds NO parser logic). Re-check that the test fixture YAML is valid. Use template literals (backticks) for multi-line YAML in tests; the `\\n` escape sequences in the verification_commands above are for shell-string compatibility only.
- If `npm test` reports a regression in the existing `df-tools.test.cjs::extractFrontmatter` tests (none should fail since no parser code changed), the test runner glob may have picked up a stray syntax error in `frontmatter.test.cjs`. Comment out the new file and re-run to isolate.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/01-github-coordination-layer/01-CONTEXT.md
@.planning/objectives/01-github-coordination-layer/01-RESEARCH.md
@plugins/devflow/devflow/bin/lib/frontmatter.cjs
@plugins/devflow/devflow/templates/project.md
@plugins/devflow/devflow/templates/objective.md
@plugins/devflow/devflow/templates/job-prompt.md
</context>

<gotchas>
- **Permissive parser:** `extractFrontmatter` accepts ANY key. Don't add validation that would reject existing files without the new fields. The schema in `FRONTMATTER_SCHEMAS` is required-fields only and is opt-in via `df-tools frontmatter validate <path> --schema <name>`. Leave it untouched.
- **Sync test layout:** Per CLAUDE.md §Conventions: tests are sync, CommonJS, sibling to source with `.test.cjs` suffix. Use `const test = require('node:test'); const assert = require('node:assert');` — not the `describe/it` style (the existing tests in this repo use the bare `test()` function form; check `intent.test.cjs` for the exact pattern).
- **Template `<template>` block fences:** The templates use a literal `<template>` ... `</template>` XML wrapper around a fenced ` ```markdown ` block. The fenced block is the part copied into user projects. New optional fields go INSIDE the fenced block; new guidelines go in `<guidelines>` AFTER the closing fence.
- **Quote handling for `#9`:** The shorthand value contains `#`, which the parser's reconstruction logic (line 138) treats as a hash-comment trigger and wraps in quotes. This is fine — both `parent_issue: "#9"` and `parent_issue: #9` parse identically. Document the unquoted form as the canonical example so users don't think the quotes are required (they're a serialization artifact).
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Update PROJECT.md, OBJECTIVE.md, and JOB.md templates with new optional fields</name>
  <files>plugins/devflow/devflow/templates/project.md, plugins/devflow/devflow/templates/objective.md, plugins/devflow/devflow/templates/job-prompt.md</files>
  <action>
Add new optional GH-link fields to all three templates. Match existing template style: inline-comment OPTIONAL-tagged docs in the YAML block, full-paragraph guidelines in `<guidelines>` after the fenced example.

**PROJECT.md template** (`plugins/devflow/devflow/templates/project.md`):

In the `<template>` YAML frontmatter block (currently lines 8-22), AFTER `default_work:`, add:

```yaml
github_repo: AO-Cyber-Systems/devflow-claude   # OPTIONAL — owner/name. Used as
                                                # default repo context when objectives
                                                # use shorthand refs like `parent_issue: #9`.
                                                # Falls back to `git config remote.origin.url`
                                                # if absent.
org_project: PVT_kwDODwqLrc4BRsOP               # OPTIONAL — GitHub Project v2 ID for the
                                                # org-level coordination project. Defaults to
                                                # AO-Cyber-Systems "Product Roadmap" project (#3).
                                                # Inherited by all objectives unless overridden.
```

In the `<guidelines>` section after `default_work` guideline, add a new guideline block for `github_repo` and `org_project` explaining they are read by `df-tools gh resolve` to walk the chain to org-level coordination state. Note that both are inherited by OBJECTIVE.md unless overridden.

**OBJECTIVE.md template** (`plugins/devflow/devflow/templates/objective.md`):

In the `<template>` YAML frontmatter block (currently lines 9-31), AFTER `overrides:` block, add:

```yaml
github_issue: AO-Cyber-Systems/devflow-claude#20    # OPTIONAL — full owner/repo#NN ref OR
                                                     #   shorthand #NN (resolved against
                                                     #   PROJECT.md github_repo).
                                                     # The GH issue tracking this objective.
parent_issue: "#9"                                   # OPTIONAL — same format as github_issue.
                                                     # The repo's [Roadmap] parent issue
                                                     # (or org-level epic for cross-repo work).
org_initiative: devflow-internal-alpha               # OPTIONAL — filename in
                                                     #   ~/.claude/devflow/initiatives/<name>.md
                                                     # Read by planner for strategic context;
                                                     # NOT synced to GitHub in v1.1.
org_project: PVT_kwDODwqLrc4BRsOP                    # OPTIONAL — overrides PROJECT.md default.
                                                     # Use when this objective belongs to a
                                                     # different org Project than the project's
                                                     # default.
```

In the `<guidelines>` section, add a new guideline block titled "GitHub coordination fields (optional)" after the `overrides` guideline, documenting:
- `github_issue`: links the objective to its GH issue. Set when manually planning; auto-populated by `df:gh-sync` when missing (v1.2 — for now, set manually).
- `parent_issue`: walked by `df-tools gh resolve` to find the repo's `[Roadmap]` issue. If absent, the resolver falls back to searching the repo for an issue titled `[Roadmap]`.
- `org_initiative`: filename (no extension, no path). Reserved field for v1.1 obj 5 (initiatives layer). Planner reads, does not sync.
- `org_project`: GitHub Project v2 ID (starts with `PVT_`). Inherited from PROJECT.md unless overridden here.

Add a sentence at the top of the new guideline block: "All four fields are optional and back-compat — existing OBJECTIVE.md files without them parse and resolve cleanly. The resolver populates `provenance: 'absent'` for missing fields."

In the `<resolution_chain>` section (currently lines 77-89), add a paragraph after the existing chain table noting that GH-link fields have their own resolution chain (separate from kind/work resolver):

> **Note:** The GitHub-link fields (`github_issue`, `parent_issue`, `org_initiative`, `org_project`) follow a separate resolution chain documented in `df-tools gh resolve` output's `provenance` map. Sources: `frontmatter` (this file) → `inherited_from_project` (PROJECT.md) → `walked_from_parent` (GraphQL walk to org Project). The kind/work resolver and the GH resolver run independently; the planner merges both outputs.

**JOB.md template** (`plugins/devflow/devflow/templates/job-prompt.md`):

In the file template's frontmatter section (currently lines 16-31), AFTER `user_setup: []`, add:

```yaml
github_issue: AO-Cyber-Systems/devflow-claude#52    # OPTIONAL (rare) — per-TRD override.
                                                     # Use ONLY when a single TRD warrants its
                                                     # own GH issue (e.g., a research spike
                                                     # tracked separately). Most TRDs inherit
                                                     # the objective's github_issue.
```

In the `## Frontmatter Fields` table (currently lines 161-175), add a row:

| `github_issue` | No | Per-TRD override (rare). Inherits from OBJECTIVE.md unless set. |

In the file's preamble paragraphs (after the table), add a one-paragraph note:

> **GitHub-link inheritance:** TRDs inherit `github_issue`, `parent_issue`, `org_initiative`, `org_project` from OBJECTIVE.md (which inherits from PROJECT.md). Per-TRD override is rare — set `github_issue` here only when this TRD has its own GH issue distinct from the parent objective.

# CRITICAL: Match the existing inline-comment style. Do NOT use full sentences inside the YAML block — use # OPTIONAL-tagged short phrases.
# CRITICAL: Preserve all existing fields and guidelines verbatim. ADD ONLY.
# PATTERN: Look at how `default_work` is documented in project.md (lines 16-22) — that's the model for inline-comment optional fields.
# PATTERN: Look at how `overrides` is documented in objective.md (lines 25-31) — that's the model for nested optional blocks.
  </action>
  <verify>
- `grep -q 'github_repo' plugins/devflow/devflow/templates/project.md` exits 0
- `grep -q 'github_issue' plugins/devflow/devflow/templates/objective.md` exits 0
- `grep -q 'parent_issue' plugins/devflow/devflow/templates/objective.md` exits 0
- `grep -q 'org_initiative' plugins/devflow/devflow/templates/objective.md` exits 0
- `grep -q 'github_issue' plugins/devflow/devflow/templates/job-prompt.md` exits 0
- `grep -q 'GitHub coordination fields' plugins/devflow/devflow/templates/objective.md` exits 0
- Visual inspection: each template still renders cleanly (open file, look at rendered Markdown structure — fenced blocks closed properly, `<template>`/`<guidelines>`/`<resolution_chain>` XML tags balanced).
  </verify>
  <done>All 3 template files document the new optional fields with inline-comment OPTIONAL tags + full guideline paragraphs. Existing fields are unchanged. Render check passes.</done>
  <recovery>
If the templates broke (XML tag imbalance or unclosed fence), revert via `git checkout plugins/devflow/devflow/templates/{project,objective,job-prompt}.md` and reapply additions one file at a time. The `<template>` ... `</template>` and ` ``` ... ``` ` boundaries are the most common break point.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Create frontmatter.test.cjs proving back-compat parse + new-field round-trip</name>
  <files>plugins/devflow/devflow/bin/lib/frontmatter.test.cjs</files>
  <action>
Create a new test file `plugins/devflow/devflow/bin/lib/frontmatter.test.cjs` using `node:test` + `node:assert` matching the existing test style in `intent.test.cjs`. The test file proves four behaviors:

1. **Baseline parse still works** — existing fields (kind, work, default_work, overrides) parse exactly as before. No regression.
2. **All 6 new optional fields parse correctly** when present:
   - PROJECT.md: `github_repo`, `org_project`
   - OBJECTIVE.md: `github_issue`, `parent_issue`, `org_initiative`, `org_project`
   - JOB.md: per-TRD `github_issue`
3. **Shorthand and full-ref forms both parse** — `parent_issue: "#9"` and `parent_issue: AO-Cyber-Systems/devflow-claude#9` both yield the literal string. The parser does NOT rewrite shorthand to full ref; that's the resolver's job.
4. **Absence is silent** — frontmatter with NO new fields parses into a dict that has `undefined` for each new field; no warnings logged, no errors thrown. Existing files (e.g., the CLAUDE.md absorption fixture's `realCLAUDEMd`) are not affected.

Use the test pattern from `intent.test.cjs`. CommonJS, sync, no async/await. Hand-built fixture strings (no LLM-generated test data per the TDD Playbook constraint — but this is a `standard` TRD, not `tdd`, so the constraint is advisory not mandatory; still, hand-build the fixtures because they're trivial).

Approach (test cases — write them all in this single test file):

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { extractFrontmatter, reconstructFrontmatter, spliceFrontmatter } = require('./frontmatter.cjs');

test('extractFrontmatter — baseline parse (existing fields unchanged)', () => {
  const c = `---\nkind: api\ndefault_work: feature\n---\n\n# Test`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.kind, 'api');
  assert.strictEqual(fm.default_work, 'feature');
});

test('extractFrontmatter — PROJECT.md new fields', () => {
  const c = `---\nkind: plugin\ngithub_repo: AO-Cyber-Systems/devflow-claude\norg_project: PVT_kwDODwqLrc4BRsOP\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.github_repo, 'AO-Cyber-Systems/devflow-claude');
  assert.strictEqual(fm.org_project, 'PVT_kwDODwqLrc4BRsOP');
});

test('extractFrontmatter — OBJECTIVE.md new fields with full ref', () => {
  const c = `---\nwork: feature\ngithub_issue: AO-Cyber-Systems/devflow-claude#20\nparent_issue: AO-Cyber-Systems/devflow-claude#9\norg_initiative: devflow-internal-alpha\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#20');
  assert.strictEqual(fm.parent_issue, 'AO-Cyber-Systems/devflow-claude#9');
  assert.strictEqual(fm.org_initiative, 'devflow-internal-alpha');
});

test('extractFrontmatter — OBJECTIVE.md shorthand parse', () => {
  // The # character makes the parser quote-handle it. Both quoted and unquoted should work.
  const cQuoted = `---\nwork: feature\nparent_issue: "#9"\n---\n\n# x`;
  const cUnquoted = `---\nwork: feature\nparent_issue: #9\n---\n\n# x`;
  const fmQ = extractFrontmatter(cQuoted);
  const fmU = extractFrontmatter(cUnquoted);
  assert.strictEqual(fmQ.parent_issue, '#9', 'quoted shorthand should yield #9 literal');
  assert.strictEqual(fmU.parent_issue, '#9', 'unquoted shorthand should yield #9 literal');
});

test('extractFrontmatter — absence of new fields is silent', () => {
  const c = `---\nwork: feature\n---\n\n# Existing file`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, undefined);
  assert.strictEqual(fm.parent_issue, undefined);
  assert.strictEqual(fm.org_initiative, undefined);
  assert.strictEqual(fm.org_project, undefined);
});

test('extractFrontmatter — TRD frontmatter per-TRD github_issue override', () => {
  const c = `---\nobjective: 01-test\ntrd: 01\ntype: tdd\ngithub_issue: AO-Cyber-Systems/devflow-claude#52\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#52');
});

test('reconstructFrontmatter — preserves new fields round-trip', () => {
  const orig = {
    work: 'feature',
    github_issue: 'AO-Cyber-Systems/devflow-claude#20',
    parent_issue: '#9',
  };
  const yaml = reconstructFrontmatter(orig);
  assert.match(yaml, /github_issue:.*devflow-claude#20/);
  assert.match(yaml, /parent_issue:.*"#9"/, 'shorthand should round-trip with quotes (parser quotes # values)');
});

test('extractFrontmatter — combined: all new + existing fields together', () => {
  const c = `---\nwork: feature\ngithub_issue: AO-Cyber-Systems/devflow-claude#20\nparent_issue: "#9"\norg_initiative: devflow-internal-alpha\norg_project: PVT_kwDODwqLrc4BRsOP\noverrides:\n  tdd: strict\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#20');
  assert.strictEqual(fm.parent_issue, '#9');
  assert.strictEqual(fm.org_initiative, 'devflow-internal-alpha');
  assert.strictEqual(fm.org_project, 'PVT_kwDODwqLrc4BRsOP');
  assert.deepStrictEqual(fm.overrides, { tdd: 'strict' });
});
```

# PATTERN: Match the bare `test('description', () => { ... })` form. Look at `intent.test.cjs` lines 1-30 for the exact pattern.
# CRITICAL: Use template literals (backticks) for the YAML test fixtures — they need real `\n` characters, not escaped `\\n`. The escapes in the verification_commands above are shell-string escapes; the test file uses real newlines.
# GOTCHA: The reconstructor (line 137-138 of frontmatter.cjs) wraps values containing `:` or `#` in quotes. The shorthand `#9` round-trips as `"#9"` — that's correct behavior, not a bug.
  </action>
  <verify>
- `npm test` runs the new test file and all 8 tests pass.
- `npm test 2>&1 | grep -c 'frontmatter.test.cjs'` shows the file was discovered by the test runner.
- The 3 inline `node -e` verification commands in this TRD's `verification_commands` frontmatter all exit 0.
  </verify>
  <done>frontmatter.test.cjs exists with 8 tests covering baseline + new fields + shorthand + absence + round-trip + combined cases. All tests pass under `npm test`.</done>
  <recovery>
If `npm test` reports the new file is not picked up: confirm the file is named exactly `frontmatter.test.cjs` (not `.test.js`) and lives in `plugins/devflow/devflow/bin/lib/`. The Node native test runner discovers `*.test.cjs` files in the project tree. If still not picked up, check `package.json` for any `test` script that filters globs.

If a test fails with "fm.parent_issue !== '#9'": The parser's quote-stripping logic (line 55) handles `"x"` and `'x'` but the parser's earlier code at line 51 may not have stripped the leading `"`. Check the actual returned value with `console.log(JSON.stringify(fm))` to see whether the quotes leaked through. If they did, use `assert.strictEqual(fm.parent_issue.replace(/^"|"$/g, ''), '#9')` as a workaround AND open a follow-up ticket — but most likely the existing parser handles this correctly, and the test will pass.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
Before declaring TRD complete:
- [ ] `npm test` passes (all existing tests + 8 new tests in frontmatter.test.cjs)
- [ ] Templates `project.md`, `objective.md`, `job-prompt.md` document the new fields with inline-comment OPTIONAL tags
- [ ] Manual diff inspection: `git diff plugins/devflow/devflow/templates/` shows ADDITIONS only, no deletions or modifications to existing fields
- [ ] All 5 verification_commands in this TRD's frontmatter exit 0
</verification>

<success_criteria>
- Templates document github_repo (PROJECT), {github_issue, parent_issue, org_initiative, org_project} (OBJECTIVE), per-TRD github_issue (JOB)
- Existing OBJECTIVE.md files without new fields parse cleanly (proven by `extractFrontmatter — absence of new fields is silent` test)
- Shorthand `#NN` parses literally (proven by `extractFrontmatter — OBJECTIVE.md shorthand parse` test)
- New tests live in `frontmatter.test.cjs`, integrated with `npm test`
- SC-1 (template documentation) and SC-7 (shorthand + full-ref parse) addressed
</success_criteria>

<output>
After completion, create `.planning/objectives/01-github-coordination-layer/01-01-frontmatter-fields-and-templates-SUMMARY.md`.
</output>
