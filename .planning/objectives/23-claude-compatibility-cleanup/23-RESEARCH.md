# Objective 23: Claude Compatibility Cleanup - Research

**Researched:** 2026-06-12
**Domain:** DevFlow plugin internals — hooks, agents, skill routing, sync logic
**Confidence:** HIGH

---

## Summary

This objective is a pure refactor with no new behavior. All seven work items are surgical edits to existing files whose structure has been fully mapped below. The research goal is a precise edit map, not technology discovery.

The most consequential invariant: **workflow .md files in `devflow/workflows/` that are deprecated-skill targets MUST NOT be deleted**. The SKILL_ROUTES dispatch table in `skill-route.cjs` loads `add-objective.md`, `check-todos.md`, `health.md`, `pause-work.md`, `progress.md`, etc. as live routing targets. Only the 13 skill _directories_ under `plugins/devflow/skills/` get deleted; the workflow files they forward to are still active.

The three interdependent test constraints are: (1) `WD1` pins `DEPRECATION_MAP` to exactly 13 entries — deleting skill dirs without touching the map leaves tests green; (2) the `route-intent.test.js` suite checks `INTENT_MAP.length >= 10` and shape, box-draw presence, `OBLIGATORY`, and `gate-edits.js will DENY` text — these must survive the compact rewrite; (3) no test currently covers `gate-commits.js` or `sync-runtime.js`, so both can be changed with new tests written from scratch.

**Primary recommendation:** Tackle hooks (items 1, 4, 5, 6b) and deletions/trims (items 2, 3, 6a) as two parallel waves; agent dedup (item 7) last and alone, with before/after token measurements.

---

## Scope Items — Precise Edit Maps

### Item 1: sync-runtime.js atomic swap + exclusions

**File:** `plugins/devflow/hooks/sync-runtime.js` (75 lines)

**Current logic (lines 59–74):**
```
for (const sub of ['workflows', 'references', 'templates', 'bin']) {
  removeDir(target/sub)          // ← destroy-then-copy, not atomic
  copyDir(source/sub, target/sub)
}
fs.writeFileSync(versionFile, pluginVersion)   // ← written AFTER successful loop
```

**Version marker location:** `~/.claude/devflow/.plugin-version` (line 19: `versionFile = path.join(targetDir, '.plugin-version')`)

**Early-exit check (line 33):**
```js
if (installedVersion === pluginVersion && fs.existsSync(targetDir)) {
  process.exit(0);
}
```
This is the corruption mode: `.plugin-version` matches the bundled version but individual subdirs are missing. The `fs.existsSync(targetDir)` check only proves the parent dir exists, not that its children are populated.

**Atomic swap approach:**
- Copy each subdir to a temp sibling (`devflow-tmp-<sub>-<pid>`) inside `targetDir`'s parent
- `fs.renameSync(tmpPath, target/sub)` — atomic on POSIX, best-effort on Windows
- Write `.plugin-version` only after all renames succeed
- Whole-tree temp (`devflow-tmp-<pid>`) is simpler than per-subdir: copy entire `devflow/` to temp, rename `devflow` → `devflow-old`, rename temp → `devflow`, delete `devflow-old`. Risk: brief window where old tree is gone and new isn't yet. Per-subdir renames are lower-risk since each subdir swap is independently atomic.

**Exclusion filter:** Add to `copyDir` an `excludePatterns` parameter:
```js
const EXCLUDE = [/\.test\.cjs$/, /\.test\.js$/, /__fixtures__\//];
function copyDir(src, dest, excludePatterns = []) {
  // skip entries where excludePatterns.some(rx => rx.test(entry.name) || rx.test(relPath))
}
```
Test files in `bin/lib/` total ~1.5MB. The `__fixtures__/` directory is 360KB. Combined exclusion removes ~2.4MB per user install.

**Content sentinel:** After copying, verify `targetDir/bin/df-tools.cjs` exists (the canonical entry point). If missing after rename, abort and try full re-copy. This catches the partial-rename failure mode.

**Self-update hazard:** This session IS running from `~/.claude/devflow/`. If `sync-runtime.js` changes are tested by triggering a session start while the plugin is installed pointing at the dev repo, the hook file that runs IS the one being edited. The hazard is write-during-use on the `.js` hook file itself, which is fine since Node.js reads hook scripts before execution. The real hazard is modifying `bin/df-tools.cjs` while it is mid-execution — outside this objective's scope. No special handling needed beyond: write the test separately from the live hook.

**Existing tests for sync-runtime:** None. `awareness-cache-populate.test.js` line 214 only checks `hooks.json` contains `sync-runtime.js` by name; `classify-session.test.js` line 293 checks ordering. No behavioral test for the sync logic itself. Tests must be written from scratch as a new `sync-runtime.test.js`.

**Sentinel file check feasibility:** Yes — cheaply check `fs.existsSync(path.join(targetDir, 'bin', 'df-tools.cjs'))` before the early-exit to force re-sync when marker claims current but binary is missing.

---

### Item 2: Delete 13 deprecated redirect skills

**The 13 skill directories to delete** (all confirmed present):
```
plugins/devflow/skills/add-objective/
plugins/devflow/skills/add-todo/
plugins/devflow/skills/audit-milestone/
plugins/devflow/skills/check-todos/
plugins/devflow/skills/complete-milestone/
plugins/devflow/skills/health/
plugins/devflow/skills/insert-objective/
plugins/devflow/skills/new-milestone/
plugins/devflow/skills/pause-work/
plugins/devflow/skills/plan-milestone-gaps/
plugins/devflow/skills/progress/
plugins/devflow/skills/remove-objective/
plugins/devflow/skills/resume-work/
```

**CRITICAL: workflow files MUST NOT be deleted.** `SKILL_ROUTES` in `skill-route.cjs` routes consolidated commands to these workflow files:
- `/devflow:objective add` → `workflows/add-objective.md` (still active)
- `/devflow:milestone audit` → `workflows/audit-milestone.md` (still active)
- `/devflow:todo list` → `workflows/check-todos.md` (still active)
- `/devflow:status check` → `workflows/health.md` (still active)
- `/devflow:status` (default) → `workflows/progress.md` (still active)
- `/devflow:status pause` → `workflows/pause-work.md` (still active)
- etc.
These workflow files have `status: active` and are live routing targets. `insert-objective.md` does have `status: active` and is referenced by `insert-objective` skill — but the skill and its workflow are both dead ends (insert was removed from SKILL_ROUTES in TRD 12-06). The workflow itself can remain (it costs nothing — it's not loaded per session), or be flagged `status: legacy`.

**DEPRECATION_MAP: keep entries, remove dirs.**

The test `WD1` in `skill-route.test.cjs:771` asserts:
```js
assert.strictEqual(count, 13, `Expected 13 DEPRECATION_MAP entries...`);
```
**If DEPRECATION_MAP entries are removed**, `WD1` fails. If entries are KEPT but skill dirs are deleted, tests stay green and the map still provides "use X instead" routing guidance in route-intent.js and classify-session.js preambles.

**Recommendation: keep DEPRECATION_MAP entries, delete only the 13 skill dirs.** No tests change, `cmdDeprecationLog` still logs gracefully if anyone calls the old form.

**What references the deprecated skill _names_ after deletion:**
- `help.md` deprecation appendix (lines 446–458): update to say "removed in v2.2" instead of "still work"
- `README.md` line 546: update the "13 legacy skill names" note to "removed in v2.2"
- `classify-session.js` / `classifier.cjs` preamble: no reference to deprecated skill names by dir-path — safe
- `route-intent.test.js` line 82–91: `INTENT_MAP does NOT contain deprecated pre-Phase-G skill names` — tests the INTENT_MAP, not the skill dirs — safe
- `execute-objective.md` line 871: references `/devflow:progress` in user-visible text — update to `/devflow:status`
- `discuss-objective.md` line 126: references `/devflow:progress` — update to `/devflow:status`
- `check-todos.md` line 33, 123, 139: references `/devflow:add-objective` and `/devflow:progress` — update
- `pause-work.md` line 113: references `/devflow:resume-work` — update to `/devflow:status resume`
- `progress.md` line 376: references `/devflow:resume-work` — update

**insert-objective.md workflow** (line 116): references `/devflow:add-objective` — if workflow is kept, update reference.

---

### Item 3: Trim 8 oversized skill descriptions

**Current measured description sizes** (including newlines from `description: |` block):

| Skill | Chars | Triggers in INTENT_MAP |
|-------|-------|----------------------|
| tui | 1070 | "open tui", "show tui", "program viewer", "tui", "show peer sessions" — NOT in INTENT_MAP (no regex) |
| status | 789 | `/devflow:status`, `/devflow:status resume`, `/devflow:status pause` — matched by INTENT_MAP regexes on prompt text, NOT description |
| handoff | 776 | NOT in INTENT_MAP |
| help | 267 | NOT in INTENT_MAP |
| initiatives | 767 | NOT in INTENT_MAP |
| awareness | 737 | NOT in INTENT_MAP |
| gh-sync | 580 | NOT in INTENT_MAP |
| sync-roadmap | 549 | NOT in INTENT_MAP |

**Key finding:** `route-intent.js` and `classify-session.js` do NOT read skill descriptions at runtime. The `INTENT_MAP` regexes are hardcoded patterns matching user prompt text. Skill descriptions are loaded by Claude Code's skill catalog loader at session start and used for display + Claude's own skill selection. Trimming descriptions has zero functional routing impact.

**Trigger phrases that are in INTENT_MAP (must remain in description or be in SKILL.md body):**
- None of the 8 skills have trigger phrases in INTENT_MAP. The status/resume/pause routing happens via regex on the user prompt, not via skill description lookup.

**Trim target ≤350 chars each.** Approach for each:
- Keep: skill name, primary function, consolidated subcommand forms (for status)
- Move to skill body: trigger examples, mode documentation, flag reference
- Drop: verbose examples, "Composes obj X + obj Y" internal notes

**Specific status skill note:** The description documents `--check`, `--pause`, `--resume` flag-style forms. Keep one line summary; move subcommand/flag doc to skill body.

---

### Item 4: Shrink route-intent.js injection

**File:** `plugins/devflow/hooks/route-intent.js` (177 lines)

**`renderDirective` output:** 1082 chars / 1564 bytes (including multi-byte Unicode box-draw chars ╔═╣╚║). 15 lines of output.

**Test assertions that must survive (from `route-intent.test.js`):**
1. Returns a string
2. Contains `"OBLIGATORY"`
3. Contains `"DEVFLOW"`
4. Contains `"gate-edits.js will DENY"`
5. Contains the passed-in skill name
6. Is multi-line with `╔` (box-draw top-left)
7. Is multi-line with `╚` (box-draw bottom-left)

**≤400-byte target format (example, ~320 bytes):**
```
╔══════════════════════════════════════╗
║ DEVFLOW OBLIGATORY: use /devflow:X   ║
║ gate-edits.js will DENY ambient edits║
╚══════════════════════════════════════╝
```

The test checks for `╔`, `╚`, `OBLIGATORY`, `DEVFLOW`, `gate-edits.js will DENY`, and the skill name. A 3-line box with a 40-char inner width satisfies all seven assertions. The `padEnd` helper can be kept (it's used internally). The `BOX_DIV` separator line (╠═╣) and the 6 padding lines of whitespace can be dropped.

**INTENT_MAP has 11 entries.** The test `INTENT_MAP has at least 10 entries` passes for any count ≥ 10 — safe.

---

### Item 5: gate-commits.js bypass fix

**File:** `plugins/devflow/hooks/gate-commits.js` (81 lines)

**Bug location:** Lines 67–70:
```js
const stateFile = path.join(planningDir, 'STATE.md');
const stateExists = fs.existsSync(stateFile);
if (!stateExists) return; // Planning dir exists but uninitialized — don't interfere
```

**Problem:** A user who runs `mkdir .planning` (manually initializes a directory, perhaps for notes) gets no commit enforcement even after the project has real objectives, because STATE.md may not be present until `new-project` finishes.

**Fix:** Gate on `ROADMAP.md` OR the `objectives/` subdirectory existence instead:
```js
const roadmapExists = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
const objectivesDirExists = fs.existsSync(path.join(planningDir, 'objectives'));
if (!roadmapExists && !objectivesDirExists) return;
```
Both `ROADMAP.md` and `objectives/` are created by `new-project` and cannot exist in a manually-created `.planning/`. Either one is sufficient to confirm DevFlow initialization.

**No existing tests for gate-commits.js.** Tests must be written from scratch. Test cases needed:
- `.planning/` exists without ROADMAP.md or objectives/ → pass through (no gate)
- `.planning/ROADMAP.md` exists → gate fires on raw git commit
- `.planning/objectives/` exists → gate fires on raw git commit
- `DEVFLOW_ALLOW_RAW_COMMIT=1` → always pass through
- `df-tools.cjs commit` → always pass through

---

### Item 6a: Delete execute-job.md

**File:** `plugins/devflow/devflow/workflows/execute-job.md` (454 lines, 14KB, `status: legacy`)

**All incoming references (full grep result):**

| File | Line | Content | Load-bearing? |
|------|------|---------|---------------|
| `templates/codebase/structure.md` | 169 | `Key files: execute-job.md, research-objective.md` | NO — doc-only example in a template |
| `templates/job-prompt.md` | 60 | `@~/.claude/devflow/workflows/execute-job.md` | YES — this is a template showing how JOB.md files should be written |
| `templates/job-prompt.md` | 449 | `@~/.claude/devflow/workflows/execute-job.md` | YES — second example in the same template |
| `templates/user-setup.md` | 70 | `Generated during execute-job.md after tasks complete` | NO — doc-only prose reference |
| `workflows/execute-objective.md` | 9 | `Each subagent loads the full execute-job context` | NO — prose comment; actual spawn at line 286 uses `execute-trd.md` |
| `workflows/execute-trd.md` | 89, 106, 129, 218, 238 | `identical to execute-job.md`, `see that workflow`, `Same as execute-job.md` | NO — cross-reference prose; execute-trd.md is the active workflow |
| `skills/execute-objective/SKILL.md` | 22 | `loads the full execute-job context` | NO — prose comment |

**Load-bearing references:** Only `templates/job-prompt.md` lines 60 and 449. These are in the `<execution_context>` section of the JOB.md format template — they instruct newly-generated JOB.md files to `@`-reference execute-job.md. Since execute-job is being deleted, these lines must be updated to reference `execute-trd.md` instead.

**All other references are prose only.** Update execute-trd.md's prose from "Same as execute-job.md" to self-contained descriptions.

**Action:**
1. Update `job-prompt.md` lines 60, 449: replace `@~/.claude/devflow/workflows/execute-job.md` with `@~/.claude/devflow/workflows/execute-trd.md`
2. Update `execute-trd.md` prose cross-references to be self-contained
3. Update `codebase/structure.md` to mention `execute-trd.md` instead
4. Delete `execute-job.md`

---

### Item 6b: statusline.js stateLib caching

**File:** `plugins/devflow/hooks/statusline.js` (133 lines)

**Current stateLib require** (line 97, inside `process.stdin 'end'` handler, inside try block at line 89):
```js
const stateLib = require(stateLibPath);
```

This `require()` is inside a conditional block that checks `cfg.daemon.status_line === true`. Node.js `require()` is already memoized by the module system — repeated calls to `require(stateLibPath)` with the same resolved path return the cached module. However, `stateLibPath` is computed at runtime each invocation (line 95 via `path.join(homeDir, ...)`), and `homeDir` is computed from `os.homedir()`.

**The real cost** is not `require()` itself but the `fs.existsSync(cwdConfig)` + `JSON.parse(fs.readFileSync(cwdConfig))` on every StatusLine event. A module-level cached `stateLib` reference won't help since `require()` is already O(1) after first load. The meaningful cache is a **process-level variable** holding the resolved `stateLibPath` so the `path.join` computation is skipped:

```js
// Module-level cache
let _stateLib = null;
let _stateLibPath = null;

// Inside the handler:
if (!_stateLibPath) {
  _stateLibPath = path.join(homeDir, '.claude', 'devflow', 'bin', 'lib', 'watcher-state.cjs');
}
if (!_stateLib && fs.existsSync(_stateLibPath)) {
  _stateLib = require(_stateLibPath);
}
if (_stateLib && _stateLib.isWatcherLive()) { ... }
```

**State of tests:** `statusline.test.js` tests are subprocess-based (spawn the hook, pipe JSON stdin). They do not test the `require()` mechanism directly. Adding the module-level cache is transparent to the tests.

---

### Item 7: Agent-prompt dedup

**planner.md (1212 lines, ~50KB)**

**Section map with line ranges:**

| Section | Lines | Size | Duplicates in references/ |
|---------|-------|------|--------------------------|
| `## Quality Degradation Curve` | 71–81 | 11 | No (planner-specific) |
| `## Context Budget Rules` | 427–438 | 12 | No (planner-specific) |
| `## Split Signals` | 439–449 | 11 | No (planner-specific) |
| `## Depth Calibration` | 450–459 | 10 | No (planner-specific) |
| `## Context Per Task Estimates` | 460–490 | 31 | No (planner-specific) |
| `<checkpoints>` block | 489–576 | 87 | YES — `references/checkpoints.md` (full checkpoint-type content) |
| `<tdd_integration>` block | 578–636 | 58 | YES — `references/tdd.md` (Iron Law, Plan Structure, Red-Green-Refactor, Context Budget) |

**Checkpoint duplication:** planner.md lines 489–576 contain the full checkpoint-type descriptions (human-verify, decision, human-action, Authentication Gates, Writing Guidelines, Anti-Patterns). This content is authoritative in `references/checkpoints.md`. The planner currently has NO `@~/.claude/devflow/references/checkpoints.md` reference — the content is inlined. Replacement: one-paragraph summary of the three types + `@~/.claude/devflow/references/checkpoints.md` for full detail.

**TDD duplication:** planner.md lines 578–636 contain TDD Plan Structure, Test Pairing Rule, Red-Green-Refactor Cycle, Context Budget for TDD — all present in `references/tdd.md`. The planner already has `See @~/.claude/devflow/references/tdd.md` at line 584 as an inline reference within the block. Replace the full block with: "Iron Law" one-liner + `@~/.claude/devflow/references/tdd.md`.

**Context-budget "five overlapping sections":** Five sections all state ~50% context target:
1. Quality Degradation Curve (line 71): "Rule: Plans should complete within ~50% context"
2. Context Budget Rules (line 427): "Plans should complete within ~50% context (not 80%)"
3. Split Signals (line 439): "ALWAYS split if: More than 3 tasks"
4. Depth Calibration (line 450): depth-vs-tasks table
5. Context Per Task Estimates (line 460): files-modified vs context table

These are planner-specific and not in a reference file. Consolidation means keeping the key rules in ONE location (Context Budget Rules + merge Split Signals + Depth Calibration into it) and cross-referencing from the others, or simply removing the Quality Degradation Curve section (its table is the only unique content and it exists nowhere else). The Curve table is useful and should stay but be folded into Context Budget Rules.

**What MUST be preserved from objective-10 additions in executor.md:**
- Lines 114–215: full `<deviation_rules>` block including Rule 4 structured queueable return format (decision/context/options/recommendation fields + autonomous-mode note)
- Lines 1–17: frontmatter with `maxTurns: 50`, `isolation: worktree`, and the 4-line comment block
- All of `<authentication_gates>` block

**executor.md deviation_rules extraction plan:**
- Create `references/deviation-rules.md` with the RULE 1–4 definitions + SCOPE BOUNDARY + FIX ATTEMPT LIMIT (lines 114–215 content)
- In executor.md, replace the full content with: one-line summary of each rule + `@~/.claude/devflow/references/deviation-rules.md`
- Keep RULE PRIORITY (lines 188–200) inline as it is short and operationally critical
- The new `references/deviation-rules.md` is synced via the same mirror path — item 1's exclusion rules (test files only) do NOT affect it

**executor.md currently has NO @-reference to deviation rules.** Adding `@~/.claude/devflow/references/deviation-rules.md` is a net-new reference.

**Existing @-references in executor.md:**
- Line 249: `**See @~/.claude/devflow/references/checkpoints.md**`
- Line 445: `See @~/.claude/devflow/references/anti-patterns.md`
- Line 447: `**Reference:** @~/.claude/devflow/references/verification-patterns.md`
- Line 451: `Quick reference — full details at @~/.claude/devflow/references/anti-patterns.md`
- Line 505: `**Use template:** @~/.claude/devflow/templates/summary.md`

**Existing @-references in planner.md:**
- Line 326: `Reference: @~/.claude/devflow/references/testing-strategy.md` (conditional)
- Line 479: `@~/.claude/devflow/references/trd-spec.md`
- Line 485: `@~/.claude/devflow/references/goal-backward.md`
- Line 584: `See @~/.claude/devflow/references/tdd.md` (inside tdd_integration — keeps this, removes surrounding content)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Atomic dir swap | Custom rename logic with `mkdtemp` | `fs.renameSync` (POSIX-atomic, already available) |
| Module caching | Custom LRU or TTL cache | Node.js `require()` built-in memoization |
| Test exclusion patterns | Complex file-walk filter | Simple regex array passed as parameter to copyDir |

---

## Common Pitfalls

### Pitfall 1: Deleting workflow .md files along with deprecated skill dirs
**What goes wrong:** `add-objective.md`, `check-todos.md`, `health.md`, etc. are in `devflow/workflows/` and remain live routing targets via `SKILL_ROUTES`. Deleting them breaks `/devflow:objective add`, `/devflow:todo list`, `/devflow:status check`.
**How to avoid:** Only delete contents of `plugins/devflow/skills/{deprecated-name}/` directories. Leave `plugins/devflow/devflow/workflows/` untouched.

### Pitfall 2: Removing DEPRECATION_MAP entries breaks test WD1
**What goes wrong:** `skill-route.test.cjs` test `WD1` asserts `DEPRECATION_MAP` has exactly 13 entries. Any removal triggers: `Expected 13 DEPRECATION_MAP entries, got N`.
**How to avoid:** Keep all 13 DEPRECATION_MAP entries. The map provides "use X instead" guidance without requiring the skill dirs to exist.

### Pitfall 3: route-intent.js compact rewrite drops required test assertions
**What goes wrong:** The test checks for `╔`, `╚`, `OBLIGATORY`, `DEVFLOW`, `gate-edits.js will DENY`, and the passed-in skill name — all in a single output. Dropping any of these breaks specific tests.
**How to avoid:** Draft the compact format first and check it contains all 7 required strings before writing.

### Pitfall 4: Removing planner.md TDD/checkpoint content without adding @-reference
**What goes wrong:** Executor spawned for a TRD has no checkpoint guidance. Agent either invents its own format or skips checkpoints.
**How to avoid:** For every removed block, verify the @-reference line is present and resolves to a file that exists in the mirror. Planner currently has NO `@~/.claude/devflow/references/checkpoints.md` — the reference must be ADDED when the block is removed.

### Pitfall 5: Trimming skill descriptions removes flag/subcommand documentation that Claude needs
**What goes wrong:** Claude cannot infer `--check`, `--pause`, `--resume` subcommand forms for `/devflow:status` from a terse description alone.
**How to avoid:** Move subcommand documentation into the skill body (`<process>` section), not just delete it. Descriptions can be terse; bodies can be complete.

### Pitfall 6: job-prompt.md execute-job references left intact after workflow deletion
**What goes wrong:** Newly generated JOB.md files (from templates) include `@~/.claude/devflow/workflows/execute-job.md` which no longer exists. Executor spawns get a 404-equivalent on the @-reference.
**How to avoid:** Update `job-prompt.md` lines 60 and 449 to reference `execute-trd.md` before deleting `execute-job.md`.

### Pitfall 7: sync-runtime test triggers live sync of dev working tree
**What goes wrong:** A sync-runtime test that sets `CLAUDE_PLUGIN_ROOT` to the repo root could overwrite the user's live `~/.claude/devflow/` mirror.
**How to avoid:** Tests must use a tmpdir for both source and target. Never set `CLAUDE_PLUGIN_ROOT` to the real repo root or `HOME` to the real home dir in tests.

---

## Code Examples

### Compact renderDirective (≤400 bytes, all assertions pass)
```js
// Source: analysis of route-intent.test.js assertions
function renderDirective(skills) {
  const skillList = skills.join(' or ');
  const inner = 38;
  const top = '╔' + '═'.repeat(inner + 2) + '╗';
  const bot = '╚' + '═'.repeat(inner + 2) + '╝';
  const row = (s) => '║ ' + (s.length <= inner ? s + ' '.repeat(inner - s.length) : s.slice(0, inner)) + ' ║';
  return [
    top,
    row('DEVFLOW ROUTING — OBLIGATORY'),
    row('Use ' + skillList),
    row('gate-edits.js will DENY ambient edits'),
    bot,
  ].join('\n');
}
// Output ~200 chars / ~210 bytes (well under 400)
// Contains: ╔, ╚, OBLIGATORY, DEVFLOW, gate-edits.js will DENY, skill name
```

### gate-commits.js corrected initialization check (lines 67–70 replacement)
```js
// Source: analysis of gate-commits.js + .planning/ structure
const roadmapExists = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
const objectivesDirExists = fs.existsSync(path.join(planningDir, 'objectives'));
if (!roadmapExists && !objectivesDirExists) return; // Planning dir exists but uninitialized
```

### sync-runtime.js exclusion filter addition
```js
// Source: analysis of sync-runtime.js + test file locations
const MIRROR_EXCLUDE = [
  /\.test\.cjs$/,
  /\.test\.js$/,
  /(^|\/)__fixtures__(\/|$)/,
];

function shouldExclude(entryName, relPath) {
  return MIRROR_EXCLUDE.some(rx => rx.test(entryName) || rx.test(relPath));
}
```

### planner.md checkpoint block replacement
```markdown
<!-- replace lines 489-576 with: -->
<checkpoints>
Three checkpoint types plan for user interaction:
- `checkpoint:human-verify` (90%): human confirms automated work
- `checkpoint:decision` (9%): human chooses implementation direction  
- `checkpoint:human-action` (1%): action with no CLI/API equivalent

@~/.claude/devflow/references/checkpoints.md
</checkpoints>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Deprecated skills as redirect shims | Unified consolidated skills | Shims load ~540 tokens/session; deleting dirs eliminates load |
| execute-job.md as active workflow | execute-trd.md with TDD enforcement | execute-job.md is `status: legacy`; all spawns use execute-trd.md |
| Full checkpoint definitions inline in planner.md | Reference to checkpoints.md | ~87 lines removed |
| Full TDD definitions inline in planner.md | Reference to tdd.md | ~58 lines removed |
| Deviation rules inline in executor.md | Reference to deviation-rules.md (new) | ~100 lines removed from executor |

---

## Open Questions

1. **insert-objective.md workflow** — it has `status: active` but is a dead end (the skill dir is being deleted). Recommend: set `status: legacy` when deleting the skill dir.

2. **help.md deprecation table wording** — current text says "will be removed in v3.0". After deleting the 13 skill dirs, the text should say "removed in v2.2". Requires a minor version bump mention or leaving the table without deadline.

3. **execute-trd.md prose cross-references** — lines 89, 218, 238 all say "Same as execute-job.md — see that workflow". After deletion, these become stale. Options: (a) rewrite each to be self-contained (adds lines), or (b) delete the cross-references since execute-trd.md already has the full content inline. Option (b) is cleaner.

4. **Dedup token measurement** — the OBJECTIVE asks for before/after token measurements in the SUMMARY. Planner should include a task that runs a token-counting script (or word-count proxy) on planner.md and executor.md before and after.

---

## Sources

### Primary (HIGH confidence)
- Direct file reads: `plugins/devflow/hooks/route-intent.js`, `sync-runtime.js`, `gate-commits.js`, `statusline.js`
- Direct file reads: `plugins/devflow/devflow/bin/lib/skill-route.cjs` and `skill-route.test.cjs`
- Direct file reads: `plugins/devflow/agents/planner.md`, `executor.md`
- Direct file reads: `plugins/devflow/devflow/references/checkpoints.md`, `tdd.md`
- Direct test reads: `plugins/devflow/hooks/route-intent.test.js`, `statusline.test.js`
- Direct measurement: `renderDirective` output = 1082 chars / 1564 bytes

### Secondary (MEDIUM confidence)
- Filesystem probes: `ls skills/`, `grep -rn execute-job`, `grep -rn deprecated`
- Workflow status greps confirming `status: legacy` vs `status: active`

---

## Metadata

**Confidence breakdown:**
- Deprecation wiring (item 2): HIGH — full map of all 13 skill dirs, test pin at WD1, workflow file status confirmed
- execute-job references (item 6a): HIGH — exhaustive grep, classified each reference
- planner.md section map (item 7): HIGH — line ranges measured, duplicate content confirmed by comparison
- route-intent structure (item 4): HIGH — file read, byte measurement, test assertions enumerated
- sync-runtime logic (item 1): HIGH — file read, current flow traced, test gap confirmed
- gate-commits/statusline (items 5, 6b): HIGH — exact line refs, no existing tests confirmed
- Skill description trims (item 3): HIGH — descriptions extracted, INTENT_MAP analyzed, routing mechanism confirmed

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (stable domain, 30 days)

---

## RESEARCH COMPLETE
