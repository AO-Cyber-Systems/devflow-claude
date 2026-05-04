---
objective: 01-github-coordination-layer
trd: 01-05
title: PM-backend seam — scaffold abstraction for v1.2+ Linear/Jira backends
type: standard
confidence: medium
wave: 5
depends_on: [01-04]
files_modified:
  - plugins/devflow/devflow/bin/lib/pm-backend.cjs
  - plugins/devflow/devflow/bin/lib/pm-backend.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements: [SC-6]
verification_commands:
  - "npm test"
  - "node -e 'const pm=require(\"./plugins/devflow/devflow/bin/lib/pm-backend.cjs\"); if(typeof pm.getBackend!==\"function\") throw new Error(\"getBackend not exported\"); const b = pm.getBackend({}); if(typeof b.resolveChain!==\"function\") throw new Error(\"backend missing resolveChain\"); if(typeof b.syncObjective!==\"function\") throw new Error(\"backend missing syncObjective\"); console.log(\"OK\");'"
  - "node -e 'const pm=require(\"./plugins/devflow/devflow/bin/lib/pm-backend.cjs\"); try { pm.getBackend({ pm: { backend: \"linear\" } }); throw new Error(\"should have thrown\"); } catch(e) { if(!e.message.includes(\"linear\")) throw new Error(\"wrong error: \"+e.message); console.log(\"OK\"); }'"
  - "git log --oneline feature/v1.1 -- plugins/devflow/devflow/bin/lib/pm-backend.cjs | head -1"

must_haves:
  truths:
    - "pm-backend.cjs exports getBackend(projectConfig) returning a backend object with at least resolveChain + syncObjective + addToProject + linkSubIssue functions"
    - "When projectConfig.pm.backend is unset OR equals 'github', getBackend returns the lib/gh.cjs module exports (or a façade exposing the public surface)"
    - "When projectConfig.pm.backend is 'linear' or 'jira' or any non-github value, getBackend throws with a message naming the unknown backend AND noting it is v1.2+ work"
    - "df-tools.cjs's gh subcommand routing CONTINUES to call lib/gh.cjs functions directly (back-compat); it does NOT introduce a parallel pm-backend dispatch path in v1.1 — but the seam is available for v1.2 to wire in"
    - "All existing tests still pass — this TRD adds files but does NOT regress any behavior"
    - "pm-backend.test.cjs covers: github default, github explicit, unknown backend throws"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/pm-backend.cjs"
      provides: "Thin dispatch seam — getBackend(projectConfig) returns a PM backend module. Currently single-impl (github via lib/gh.cjs)."
      exports: ["getBackend", "VALID_BACKENDS"]
      min_lines: 30
    - path: "plugins/devflow/devflow/bin/lib/pm-backend.test.cjs"
      provides: "Unit tests for the dispatch seam"
      contains: "getBackend"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/pm-backend.cjs"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs"
      via: "require('./gh.cjs') when projectConfig.pm.backend === 'github' or unset"
      pattern: "require.*gh\\.cjs"
---

<objective>
Add `lib/pm-backend.cjs` as a thin dispatch seam for the (currently single-implementation) PM resolver. `getBackend(projectConfig)` returns the GitHub backend (`lib/gh.cjs` exports) when `projectConfig.pm.backend === 'github'` or unset, and throws for other values with a clear "v1.2+ work" message.

Purpose: Closes objective-1 success criterion 6 (module structure leaves room for sibling backends without rewriting call sites). This is a **scaffold-only** TRD — no Linear/Jira logic ships in v1.1. The seam exists so a future TRD can add `lib/linear.cjs` + a `case 'linear':` arm to `getBackend` without disturbing call sites.

Output: New `lib/pm-backend.cjs` (small — ~40 lines). New `lib/pm-backend.test.cjs` with 5-7 enumerated tests. NO call-site refactoring in v1.1 — the seam is created, but `df-tools.cjs` keeps calling `lib/gh.cjs` directly. (CONTEXT.md §6 explicitly limits scope to scaffold; v1.2+ wires call sites through.)

Why standard (not TDD): The work is a structural scaffold with three behaviors — (a) returns gh module on github/unset, (b) returns gh module on explicit github, (c) throws on unknown. All testable, but not test-list-first-design — the design IS the locked decision in CONTEXT.md §6, the tests are regression coverage on observed behavior of the dispatch.

Why confidence: medium. The seam shape is locked, but the choice between "return gh.cjs's module.exports directly" vs. "return a curated façade" has minor design tradeoffs. Recommend the former (return `require('./gh.cjs')`) for simplicity; v1.2 can refine if the façade pattern adds value.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── pm-backend.cjs          ← CREATE (thin dispatch — getBackend + VALID_BACKENDS)
└── pm-backend.test.cjs     ← CREATE (3-5 tests)

plugins/devflow/devflow/bin/
└── df-tools.cjs            ← (no changes — back-compat preserved per CONTEXT.md §6)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Locked seam shape from CONTEXT.md §6**:

```javascript
// lib/pm-backend.cjs
function getBackend(projectConfig) {
  const pm = projectConfig?.pm?.backend || 'github';
  switch (pm) {
    case 'github': return require('./gh.cjs');
    default: throw new Error(`Unknown pm.backend: ${pm}`);
  }
}
module.exports = { getBackend };
```

This is the entire v1.1 deliverable for SC-6's "module structure leaves room for sibling backends" clause. No further sophistication needed.

**Existing config-reading pattern** (`lib/gh.cjs` lines 22-30):

```javascript
function readConfig(cwd) {
  const cfgPath = path.join(cwd, '.planning', 'config.json');
  if (!fs.existsSync(cfgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  } catch {
    return null;
  }
}
```

`getBackend` accepts the parsed config object, NOT the path. The caller reads the config (using `readConfig` or otherwise) and passes the dict. This keeps `pm-backend.cjs` filesystem-free and unit-testable without fixtures.

**Convention pattern**: VALID_BACKENDS as a constant array — mirrors `intent.cjs::VALID_KINDS` style:

```javascript
const VALID_BACKENDS = ['github'];   // v1.1 single impl; v1.2+ adds 'linear', 'jira'
```

When v1.2 ships Linear support, the constant grows: `VALID_BACKENDS = ['github', 'linear']`.
</codebase_examples>

<anti_patterns>
- **Do NOT add Linear/Jira modules in v1.1.** Even stub `lib/linear.cjs` files would suggest the abstraction is real. CONTEXT.md §6 is explicit: scaffold-only, single impl. The `default:` arm of the switch throws — not falls through to a stub.
- **Do NOT refactor `df-tools.cjs` to dispatch through `pm-backend.cjs` in v1.1.** The seam exists; using it is v1.2+ work. Existing call sites continue to `require('./gh.cjs')` directly. Locked in CONTEXT.md §6.
- **Do NOT introduce a "façade" wrapper around `lib/gh.cjs`'s exports.** Just return the module exports directly. If v1.2 needs to narrow the surface (only export `resolveChain`, `syncObjective`, etc.), refactor THEN — premature abstraction.
- **Do NOT validate `projectConfig`'s shape.** `getBackend({})` should default to 'github'. `getBackend(null)` should default to 'github'. Use optional chaining (`projectConfig?.pm?.backend`).
- **Do NOT read `.planning/config.json` from inside `getBackend`.** It takes the parsed dict. Filesystem-free.
- **Do NOT add a `pm.backend` field to `.planning/config.json` template/schema in v1.1.** That's a v1.2 deliverable. The seam reads the field if present; absence falls through to default. Documenting the future field is fine (in pm-backend.cjs's JSDoc), but don't update template files.
</anti_patterns>

<error_recovery>
- If `require('./gh.cjs')` from `pm-backend.cjs` fails with circular dependency: it shouldn't (gh.cjs doesn't require pm-backend.cjs). If it does, restructure so gh.cjs is a leaf module. v1.1 keeps gh.cjs as leaf.
- If the unknown-backend error message lacks the "v1.2+" guidance: the test verifies the message includes the backend name; ALSO include "(v1.2+ work)" in the thrown message so users see the upgrade path.
- If `npm test` reports a regression in unrelated tests after creating pm-backend.cjs: the test runner picked up `pm-backend.test.cjs` and its tests pass independently. No regression should be possible. If one occurs, the most likely cause is a stray `require('./pm-backend.cjs')` left in another file from a previous experiment — `git diff` to find and remove.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/01-github-coordination-layer/01-CONTEXT.md
@.planning/objectives/01-github-coordination-layer/01-04-gh-sync-skill-and-cli-SUMMARY.md
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/intent.cjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create pm-backend.cjs dispatch seam + pm-backend.test.cjs</name>
  <files>plugins/devflow/devflow/bin/lib/pm-backend.cjs, plugins/devflow/devflow/bin/lib/pm-backend.test.cjs</files>
  <action>
**Step 1.1 — Create `plugins/devflow/devflow/bin/lib/pm-backend.cjs`**:

```javascript
'use strict';

// PM (Project Management) backend dispatcher.
//
// v1.1 ships GitHub as the single implementation. The seam exists so v1.2+
// can add Linear / Jira / etc. backends without rewriting call sites:
//
//   const pm = require('./pm-backend.cjs');
//   const backend = pm.getBackend(config);
//   const chain = backend.resolveChain(frontmatter, projectCtx);
//
// In v1.1, call sites continue to require('./gh.cjs') directly (back-compat).
// The seam is available for v1.2 to wire in.
//
// Future config field (v1.2+): .planning/config.json
//   { "pm": { "backend": "github" | "linear" | "jira" } }
//
// Unset → defaults to 'github'.

const VALID_BACKENDS = ['github'];   // v1.2+ extends: 'linear', 'jira'

function getBackend(projectConfig) {
  const pm = (projectConfig && projectConfig.pm && projectConfig.pm.backend) || 'github';
  switch (pm) {
    case 'github':
      return require('./gh.cjs');
    case 'linear':
    case 'jira':
      throw new Error(
        `PM backend '${pm}' is not implemented in v1.1 (devflow-claude). ` +
        `Linear/Jira support is v1.2+ work — see ROADMAP.md §"Milestone v1.2".`
      );
    default:
      throw new Error(
        `Unknown pm.backend: '${pm}'. Valid: ${VALID_BACKENDS.join(', ')} (more in v1.2+).`
      );
  }
}

module.exports = { getBackend, VALID_BACKENDS };
```

**Step 1.2 — Create `plugins/devflow/devflow/bin/lib/pm-backend.test.cjs`**:

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const pm = require('./pm-backend.cjs');

test('getBackend — defaults to github when projectConfig is null', () => {
  const b = pm.getBackend(null);
  assert.strictEqual(typeof b.resolveChain, 'function');
  assert.strictEqual(typeof b.syncObjective, 'function');
  assert.strictEqual(typeof b.addToProject, 'function');
  assert.strictEqual(typeof b.linkSubIssue, 'function');
});

test('getBackend — defaults to github when pm.backend is unset', () => {
  const b = pm.getBackend({});
  assert.strictEqual(typeof b.resolveChain, 'function');
});

test('getBackend — explicit github returns gh.cjs module', () => {
  const b = pm.getBackend({ pm: { backend: 'github' } });
  // Verify it's the same module — has the canonical exports
  assert.strictEqual(typeof b.resolveChain, 'function');
  assert.strictEqual(typeof b.requireGhAuth, 'function');
  assert.strictEqual(typeof b.cmdGhResolve, 'function');
});

test('getBackend — linear throws with v1.2+ message', () => {
  assert.throws(() => pm.getBackend({ pm: { backend: 'linear' } }), /v1\.2/);
});

test('getBackend — jira throws with v1.2+ message', () => {
  assert.throws(() => pm.getBackend({ pm: { backend: 'jira' } }), /v1\.2/);
});

test('getBackend — unknown backend throws with name in message', () => {
  assert.throws(() => pm.getBackend({ pm: { backend: 'gitlab' } }), /gitlab/);
});

test('VALID_BACKENDS — v1.1 has only github', () => {
  assert.deepStrictEqual(pm.VALID_BACKENDS, ['github']);
});
```

**Step 1.3 — Verify no df-tools.cjs changes needed.** Per CONTEXT.md §6: existing call sites in df-tools.cjs continue to call `cmdGhResolve`, `cmdGhSyncObjective`, etc. directly. The seam is created but not yet used. v1.2 will refactor call sites to dispatch through `pm.getBackend(config).<method>`.

Run `npm test`: 7 new tests pass. Existing tests still pass.

Commit: `git add plugins/devflow/devflow/bin/lib/pm-backend.cjs plugins/devflow/devflow/bin/lib/pm-backend.test.cjs && git commit -m 'feat(01-05): scaffold pm-backend dispatch seam (github single impl; v1.2+ extends to linear/jira)'`

# CRITICAL: Single commit (not test→feat split) because this is `type: standard` and the design IS the locked decision; the tests are regression coverage. The CLAUDE.md TDD Playbook habit 1 explicit-skip exception list includes "config-only" work — this scaffold is structural code, not behavioral logic.
# CRITICAL: No df-tools.cjs changes. Verify with `git diff plugins/devflow/devflow/bin/df-tools.cjs` showing nothing.
# CRITICAL: Do NOT create lib/linear.cjs or lib/jira.cjs stubs. The `default:` arm throws; that's the entire scope.
# PATTERN: Match the test style of pm-backend.test.cjs to other `*.test.cjs` files in lib/ (bare `test()` form, `node:test` + `node:assert`).
  </action>
  <verify>
- `npm test` passes — 7 new tests in pm-backend.test.cjs all GREEN. Existing tests untouched.
- `node -e 'const pm = require("./plugins/devflow/devflow/bin/lib/pm-backend.cjs"); const b = pm.getBackend({}); console.log(Object.keys(b).slice(0, 5))'` shows gh.cjs's exports (resolveChain, syncObjective, etc.).
- `node -e 'const pm = require("./plugins/devflow/devflow/bin/lib/pm-backend.cjs"); pm.getBackend({ pm: { backend: "linear" } })' 2>&1 | grep -q 'v1.2'` exits 0.
- `git diff plugins/devflow/devflow/bin/df-tools.cjs` shows no changes (back-compat preserved).
- `git log --oneline -1` shows `feat(01-05): scaffold pm-backend dispatch seam ...`
  </verify>
  <done>pm-backend.cjs (40 lines) + pm-backend.test.cjs (7 tests) created. df-tools.cjs unchanged. All tests pass. SC-6 (module structure for sibling backends) addressed.</done>
  <recovery>
If `require('./gh.cjs')` returns an empty object {}: that means gh.cjs's `module.exports` was overwritten somewhere (probably during a botched edit). Verify with `node -e 'console.log(Object.keys(require("./plugins/devflow/devflow/bin/lib/gh.cjs")))'` and re-run TRDs 01-02 / 01-03 / 01-04 if exports are missing.

If a test fails with "ENOENT" trying to load gh.cjs: relative path issue. The file is `./gh.cjs` from `pm-backend.cjs` (sibling). Same directory, same convention. If running tests from a different cwd, the relative path still resolves because Node uses the requiring file's location as base.

If `assert.throws(...)` doesn't match the regex: print the actual error message via `try { pm.getBackend(...); } catch(e) { console.error(e.message); }` to see what's thrown vs. what's expected.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
Before declaring TRD complete:
- [ ] `npm test` passes — 7 new tests; existing tests unaffected
- [ ] One atomic commit: `feat(01-05): scaffold pm-backend dispatch seam (github single impl; v1.2+ extends to linear/jira)`
- [ ] `lib/pm-backend.cjs` exports `getBackend` and `VALID_BACKENDS`
- [ ] `getBackend(null)` and `getBackend({})` both return the gh.cjs module
- [ ] `getBackend({ pm: { backend: 'linear' } })` throws with v1.2+ guidance
- [ ] `df-tools.cjs` UNCHANGED (back-compat preserved per CONTEXT.md §6)
- [ ] All 4 verification_commands in this TRD's frontmatter exit 0
</verification>

<success_criteria>
- pm-backend.cjs scaffolds the dispatch seam with three behaviors (github default, github explicit, unknown throws)
- v1.2+ Linear/Jira backends can be added without rewriting call sites — the seam is the abstraction boundary
- v1.1 ships scaffold ONLY; no Linear/Jira code, no call-site refactoring
- SC-6 (module structure leaves room for sibling backends) addressed
</success_criteria>

<output>
After completion, create `.planning/objectives/01-github-coordination-layer/01-05-pm-backend-seam-SUMMARY.md`.
</output>
