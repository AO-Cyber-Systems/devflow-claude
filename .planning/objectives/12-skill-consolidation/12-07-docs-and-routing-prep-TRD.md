---
objective: 12-skill-consolidation
trd: 07
type: standard
confidence: high
wave: 3
depends_on: ["12-01", "12-02", "12-03", "12-04"]
files_modified:
  - plugins/devflow/devflow/workflows/help.md
  - README.md
  - plugins/devflow/devflow/bin/lib/skill-route.cjs
  - plugins/devflow/devflow/bin/lib/skill-route.test.cjs
  - .planning/objectives/12-skill-consolidation/12-RESEARCH.md
autonomous: true
requirements:
  - PHASE-G4
  - PHASE-A-HANDOFF
must_haves:
  truths:
    - "help.md documents only 5 consolidated skills + deprecation note for old names"
    - "README skill table reflects consolidated names"
    - "df-tools skill-route --list output is verified end-to-end against final SKILL_ROUTES"
    - "12-RESEARCH.md § 'Phase A handoff' contains the live --list JSON snapshot for v1.2 obj 6 to consume"
    - "Token-savings measurement captured (system-prompt skill-list before/after)"
    - "All 13 deprecated old skill names mentioned ONCE in help.md (single deprecation appendix)"
  artifacts:
    - path: "plugins/devflow/devflow/workflows/help.md"
      provides: "Updated user-facing command reference with consolidated skills"
      contains: "/devflow:objective"
    - path: "README.md"
      provides: "Updated skill table with consolidated names"
      contains: "/devflow:objective"
    - path: ".planning/objectives/12-skill-consolidation/12-RESEARCH.md"
      provides: "Phase A handoff section with live JSON snapshot"
      contains: "Phase A handoff"
  key_links:
    - from: "plugins/devflow/devflow/workflows/help.md"
      to: "consolidated skill names"
      via: "Markdown reference doc"
      pattern: "/devflow:objective.*add"
    - from: "12-RESEARCH.md § Phase A handoff"
      to: "df-tools skill-route --list"
      via: "Live JSON snapshot embedded"
      pattern: "PVT_kwDO|skills.*subcommands"
---

<objective>
Final TRD — documentation sweep + Phase A handoff data capture. Consumes work from 12-01/02/03/04 (which lock SKILL_ROUTES) and from 12-05/06 (which trim irrelevant features) and produces the user-facing reference + machine-readable routing data.

Purpose: Two outputs:
1. **User-facing docs** — `help.md` workflow + `README.md` reflect ONLY the 5 consolidated skill names, with a single deprecation appendix listing all 13 old names. Users invoking `/devflow:help` see clean, current docs.
2. **Phase A handoff** — `12-RESEARCH.md § "Phase A handoff"` contains a live `df-tools skill-route --list` JSON snapshot. v1.2 obj 6's `classify-session.js` reads this snapshot to bootstrap its routing decision table.

Also captures the actual token-savings measurement (system-prompt skill-list size before/after) — proves #32's ≥1500 tokens success criterion empirically.

This TRD lands LAST in the objective because it depends on the final shape of SKILL_ROUTES, the deletion of redirect skill names from canonical docs (but inclusion in deprecation appendix), and the I3/I4 cleanups landing first.

Output: Updated help.md, README.md, RESEARCH.md handoff section, token measurement.
</objective>

<file_tree>
plugins/devflow/devflow/workflows/
└── help.md                                            ← MODIFY (rewrite skill catalog)

README.md                                              ← MODIFY (update skill table)

plugins/devflow/devflow/bin/lib/
├── skill-route.cjs                                    ← MODIFY (optional: add `--format=ambient` to --list for Phase A)
└── skill-route.test.cjs                               ← MODIFY (test new format flag if added)

.planning/objectives/12-skill-consolidation/
└── 12-RESEARCH.md                                     ← MODIFY (populate § "Phase A handoff" with live snapshot)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: help.md skill catalog block (existing — what we're rewriting):**

```markdown
### Project Initialization

**`/devflow:new-project`**
Initialize new project through unified flow.
...

**`/devflow:map-codebase`**
Map an existing codebase for brownfield projects.
...
```

The catalog has ~30 skill entries. Most stay (unchanged skills like `new-project`, `map-codebase`, `discuss-objective`, `plan-objective`, `execute-objective`, `verify-work`, `debug`, `awareness`, `initiatives`, `dup-detect`, `gh-sync`, `quick`, `cleanup`, `security-audit`, `tui`, `set-profile`, `settings`, `handoff`, `transition`, `help`). 13 OLD entries are removed (replaced by 5 consolidated entries with subcommand notation):

```markdown
### Roadmap & Milestone Management

**`/devflow:objective <add|insert|remove>`**
Manage objectives in the current milestone roadmap.
- `add <description>` — Append a new integer objective
- `insert <after> <description>` — Insert a decimal objective for urgent work [DEPRECATED if 12-06 dropped it]
- `remove <number>` — Remove an unstarted objective and renumber

**`/devflow:milestone <new|audit|complete|gaps>`**
Manage milestones from start to archive.
- `new [name]` — Start the next development cycle
- `audit [version]` — Verify a milestone achieved its DoD
- `complete <version>` — Archive milestone and tag git release
- `gaps` — Turn audit gaps into closure objectives

**`/devflow:todo <add|list>`**
Capture todos and view morning standup.
- `add [description]` — Save an idea/task
- `list [--all|--lane|--refresh|--raw]` — Cross-source standup view

**`/devflow:status [check|pause|resume]`**
Project status, health, save/resume work.
- (no arg) — Progress + route to next action
- `check` — Validate `.planning/` integrity (alias: `--check`)
- `pause` — Save context (alias: `--pause`)
- `resume` — Restore context (alias: `--resume`)

**`/devflow:workstreams <setup|status|merge|run>`**
Parallel feature development via git worktrees.
- `setup` — Create worktrees, provision .planning/
- `status` — Progress across active workstreams
- `merge` — Squash-merge completed workstreams
- `run` — (stub; v1.2 obj 6) Run a workstream end-to-end
```

**Pattern: README.md skill table (typically a Markdown table):**

```markdown
| Skill | Description |
|---|---|
| `/devflow:objective <add|insert|remove>` | Manage objectives in current milestone |
| `/devflow:milestone <new|audit|complete|gaps>` | Manage milestones from start to archive |
| ... |
```

**Pattern: Deprecation appendix in help.md:**

```markdown
## Deprecated Skill Names (will be removed in v3.0)

These old skill names still work but emit a deprecation warning and forward to the consolidated skill:

| Old name | New form |
|---|---|
| `/devflow:add-objective` | `/devflow:objective add` |
| `/devflow:insert-objective` | `/devflow:objective insert` |
| `/devflow:remove-objective` | `/devflow:objective remove` |
| `/devflow:new-milestone` | `/devflow:milestone new` |
| `/devflow:audit-milestone` | `/devflow:milestone audit` |
| `/devflow:complete-milestone` | `/devflow:milestone complete` |
| `/devflow:plan-milestone-gaps` | `/devflow:milestone gaps` |
| `/devflow:add-todo` | `/devflow:todo add` |
| `/devflow:check-todos` | `/devflow:todo list` |
| `/devflow:pause-work` | `/devflow:status pause` |
| `/devflow:resume-work` | `/devflow:status resume` |
| `/devflow:progress` | `/devflow:status` |
| `/devflow:health` | `/devflow:status check` |
```

**Pattern: Phase A handoff section in 12-RESEARCH.md (locked schema):**

```markdown
## Phase A handoff (live snapshot)

**Captured:** 2026-05-04
**Generated by:** `df-tools skill-route --list --raw`

```json
{
  "skills": [
    {"name": "objective", "subcommands": ["add", "insert", "remove"]},
    {"name": "milestone", "subcommands": ["new", "audit", "complete", "gaps"]},
    {"name": "todo", "subcommands": ["add", "list"]},
    {"name": "status", "subcommands": [null, "check", "pause", "resume"]},
    {"name": "workstreams", "subcommands": ["setup", "status", "merge", "run"]}
  ],
  "deprecated": {
    "add-objective": "objective add",
    ...
  }
}
```

**v1.2 obj 6 (Phase A) consumes this snapshot:** `classify-session.js` reads the JSON, builds an injection table mapping user intent → consolidated skill, and surfaces it to the model as system context.
```

</codebase_examples>

<anti_patterns>

- **Documenting old skill names alongside new ones in main catalog** — old names go ONLY in the deprecation appendix. Main catalog references consolidated form only. Users see clean docs.
- **Manually counting tokens** — use a real tokenizer or shell-based heuristic (e.g., `wc -w` ÷ 0.75). Document the method used.
- **Skipping the live `df-tools skill-route --list` capture** — Phase A handoff JSON must be the LIVE output, not a hand-written estimate. Re-run after all consolidation TRDs land.
- **Touching code in this TRD** — primarily docs work. Optional: add `--format=ambient` flag to `--list` if Phase A handoff format requires shape transformation. Otherwise leave skill-route.cjs untouched.

</anti_patterns>

<error_recovery>

- **`df-tools skill-route --list` returns incomplete output** — verify all 5 SKILL_ROUTES entries are populated by inspecting `lib/skill-route.cjs`. If milestone or status is missing, 12-02 or 12-03 didn't land cleanly; flag for orchestrator.
- **README.md doesn't have an existing skill table** — search for a `## Commands` or `## Skills` heading; insert the consolidated table there. If no obvious section exists, create `## DevFlow Skills` heading with the table.
- **Token-savings measurement is impossible without a tokenizer** — fall back to character-count delta on the help.md doc itself (proxy). Document the proxy method.
- **I2 task 3 changed SKILL_ROUTES.objective.subcommands** — re-run `df-tools skill-route --list` after 12-06 lands; reflect in Phase A handoff.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/12-skill-consolidation/12-CONTEXT.md
@.planning/objectives/12-skill-consolidation/12-RESEARCH.md
@.planning/objectives/12-skill-consolidation/12-01-SUMMARY.md
@.planning/objectives/12-skill-consolidation/12-02-SUMMARY.md
@.planning/objectives/12-skill-consolidation/12-03-SUMMARY.md
@.planning/objectives/12-skill-consolidation/12-04-SUMMARY.md
@.planning/objectives/12-skill-consolidation/12-05-SUMMARY.md
@.planning/objectives/12-skill-consolidation/12-06-SUMMARY.md

@plugins/devflow/devflow/workflows/help.md
@README.md
</context>

<research_context>

From `12-RESEARCH.md`:

**Phase A handoff format (locked):**

```json
{
  "skills": [...],
  "deprecated": {...}
}
```

**Token-savings target:** ≥1500 tokens reduction in system-prompt skill-list. Measure via:
- Pre-consolidation: enumerate all 28 skill SKILL.md `description` fields, sum word count, divide by 0.75 (token approximation)
- Post-consolidation: enumerate the 5 consolidated SKILL.md `description` fields + 13 deprecation redirects' (much shorter) descriptions, same calculation
- Delta = saved tokens

</research_context>

<gotchas>

- **`description` field in YAML frontmatter is what matters for token cost** — long multi-line descriptions are the bulk of system-prompt skill-list. Verify each consolidated skill's description is reasonably scoped (not a wall of text).
- **Deprecation redirect descriptions are SHORT** — `DEPRECATED — use /devflow:X instead` is ~10 words. Each saves vs the original ~40+ word description.
- **README.md may have a `<!-- skill-table-start -->` marker** — preserve any such markers used by automation. If absent, no harm.
- **The `disable-model-invocation: true` flag on deprecated skills** — they shouldn't be auto-invoked. Verify in 12-01/02/03 SUMMARYs that the redirects preserve this.

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite help.md with consolidated skills + deprecation appendix</name>
  <files>plugins/devflow/devflow/workflows/help.md</files>
  <action>
Standard task — markdown editing.

**Step 1: Read the current `help.md`** end-to-end to understand the structure.

**Step 2: Replace the skill-catalog sections** that contain the 13 old skill names. Keep all other sections unchanged. Insert the 5 consolidated entries (per `<codebase_examples>` block above) in the appropriate location (likely after `### Project Initialization` and before `### Verification`).

**Step 3: Add (or update existing) `## Deprecated Skill Names` section** at the END of the document with the 13-row deprecation table from `<codebase_examples>` above.

**Step 4: Verify no orphan references** to old skill names remain in the body of help.md — only the deprecation table should mention them.

```bash
# Sanity check:
grep -c '/devflow:add-objective\|/devflow:insert-objective\|/devflow:remove-objective\|/devflow:new-milestone\|/devflow:audit-milestone\|/devflow:complete-milestone\|/devflow:plan-milestone-gaps\|/devflow:add-todo\|/devflow:check-todos\|/devflow:pause-work\|/devflow:resume-work\|/devflow:progress\|/devflow:health' plugins/devflow/devflow/workflows/help.md
# Expected: exactly 13 (one per row in the deprecation table). NOT more (would indicate body references).
```

# CRITICAL: Preserve all UNCHANGED skills (new-project, map-codebase, plan-objective, execute-objective, etc.) in their original sections.
# CRITICAL: I2-conditional — if 12-06 dropped `insert` from objective skill, the help.md `objective` entry should reflect this:
#   "- `insert <after> <description>` — DEPRECATED in v1.2; use `add` instead"
#   Read 12-RESEARCH.md § "I2 disposition" recommendation before writing.
# GOTCHA: help.md is consumed by the `/devflow:help` skill — output is rendered as-is, no project-specific commentary.
# PATTERN: Mirror the existing tone (matter-of-fact reference, examples, usage strings).
  </action>
  <verify>
```bash
# Verify deprecated names ONLY appear in deprecation appendix:
grep -c '/devflow:add-objective\|/devflow:insert-objective\|/devflow:remove-objective\|/devflow:new-milestone\|/devflow:audit-milestone\|/devflow:complete-milestone\|/devflow:plan-milestone-gaps\|/devflow:add-todo\|/devflow:check-todos\|/devflow:pause-work\|/devflow:resume-work\|/devflow:progress\|/devflow:health' plugins/devflow/devflow/workflows/help.md
# Expected: 13

# Verify consolidated names appear:
for n in objective milestone todo status workstreams; do
  grep -c "/devflow:$n " plugins/devflow/devflow/workflows/help.md
done
# Expected: each ≥1

# Live skill help check:
# (Manual: invoke /devflow:help and see the rendered output)

npm test  # no test changes; should still pass
```
  </verify>
  <done>
- help.md skill catalog uses consolidated names
- 13 old names appear ONLY in the deprecation appendix
- All UNCHANGED skills (~15) preserved
- I2 disposition reflected in `objective` entry (if `insert` was dropped)
- `npm test` passes
  </done>
  <recovery>
- **Old name appears in body** — find via grep, replace with consolidated form, re-grep until count = 13.
- **Section ordering broken** — fall back to current help.md ordering; just SUBSTITUTE old skill blocks with consolidated blocks. No structural rewrite.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Update README.md skill table + capture Phase A handoff JSON</name>
  <files>README.md, .planning/objectives/12-skill-consolidation/12-RESEARCH.md</files>
  <action>
Standard task — markdown editing + live snapshot capture.

**Step 1: Update `README.md`** — find the existing skill table (or `## Commands`, `## Skills` section). Replace any old-skill-name rows with consolidated entries:

| Skill | Description |
|---|---|
| `/devflow:objective <add\|insert\|remove>` | Manage objectives in current milestone roadmap |
| `/devflow:milestone <new\|audit\|complete\|gaps>` | Manage milestones from start to archive |
| `/devflow:todo <add\|list>` | Capture todos / morning standup |
| `/devflow:status [check\|pause\|resume]` | Project status, health, save/resume work |
| `/devflow:workstreams <setup\|status\|merge\|run>` | Parallel features via git worktrees |

Add a one-line note: "13 legacy skill names still work as deprecation redirects; see `/devflow:help` for the full deprecation map."

**Step 2: Capture live `df-tools skill-route --list` snapshot:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs skill-route --list --raw > /tmp/skill-route-list.json
cat /tmp/skill-route-list.json | python3 -m json.tool > /tmp/skill-route-list-pretty.json
```

**Step 3: Append to `12-RESEARCH.md`** a new `## Phase A handoff (live snapshot)` section with:
- Capture timestamp (ISO)
- Generation command
- Pretty-printed JSON snapshot
- Brief consumer note ("v1.2 obj 6 reads this for routing-table bootstrap")

Replace any placeholder `*To be filled by executor...*` if present.

**Step 4: Compute token-savings measurement.**

Pre-consolidation count (estimated from old SKILL.md descriptions before this objective started):
```bash
# These files are now redirects; their pre-state is in git history
git log --all --pretty=format:'%H' -- plugins/devflow/skills/add-objective/SKILL.md | head -1
# Read the description fields from the pre-consolidation versions
# Sum word counts ÷ 0.75
```

OR fall back to a proxy: count words in deprecated redirects' (~10 words each × 13 = 130) vs new consolidated descriptions (~30-40 words × 5 = ~175). Original 13 skill descriptions averaged ~40 words = 520 words. Net delta: 520 - 175 - 130 = ~215 words = ~285 tokens (proxy).

# CRITICAL: This is a PROXY measurement — document the methodology used. The real ≥1500 token target depends on system-prompt construction (Claude Code may include MORE than just `description` fields). Note this caveat in the disposition.
# GOTCHA: README.md table column escaping — use `\|` inside `|` cells to prevent Markdown table-cell breakage.
# GOTCHA: 12-RESEARCH.md MAY already have a "Phase A handoff" section from 12-CONTEXT.md scaffolding. Replace, don't duplicate.
# PATTERN: Mirror obj 5 TRD 05-05 dogfood fixture pattern (live capture committed, structural assertions only).

**Commit message:** `docs(12-07): rewrite help.md + README + Phase A handoff snapshot`
  </action>
  <verify>
```bash
# README contains consolidated names:
for n in objective milestone todo status workstreams; do
  grep -q "/devflow:$n" README.md && echo "FOUND: $n" || echo "MISSING: $n"
done
# Expected: all 5 FOUND

# Phase A handoff snapshot is live:
grep -A 30 'Phase A handoff (live snapshot)' .planning/objectives/12-skill-consolidation/12-RESEARCH.md | grep -q '"skills"'
# Expected: JSON snapshot present

# JSON validates:
grep -A 30 'Phase A handoff' .planning/objectives/12-skill-consolidation/12-RESEARCH.md | sed -n '/```json/,/```/p' | grep -v '^```' | python3 -c 'import json, sys; json.load(sys.stdin)'
# Expected: no error (valid JSON)

# Token measurement documented:
grep -q 'Token savings' .planning/objectives/12-skill-consolidation/12-RESEARCH.md
# Expected: present

npm test
```
  </verify>
  <done>
- README.md skill table reflects 5 consolidated skills with deprecation note
- 12-RESEARCH.md § "Phase A handoff" populated with live JSON snapshot
- Token-savings measurement documented (with methodology caveat)
- All 1359+ tests pass
  </done>
  <recovery>
- **README.md doesn't have a skill table at all** — create new `## DevFlow Skills` section with the 5-row table. Place after the existing What/How sections.
- **Phase A handoff JSON has trailing newline issues** — strip with `sed -i '' -e '${/^$/d}'` (BSD sed on macOS) or pipe through `jq -c .`.
- **Token measurement uncomputable** — document explicit "≥1500 token target verified empirically post-rollout via session log analysis" deferral note. Don't fabricate numbers.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. help.md skill catalog uses ONLY consolidated names in body
2. help.md deprecation appendix lists all 13 old → new mappings
3. README.md skill table reflects consolidated names + deprecation note
4. 12-RESEARCH.md § "Phase A handoff (live snapshot)" contains live JSON from `df-tools skill-route --list --raw`
5. JSON is valid and contains all 5 skills + 13 deprecation entries
6. Token-savings measurement documented with methodology caveat
7. `/devflow:help` invocation displays the new help.md (manual sanity)
8. `npm test` passes
</verification>

<success_criteria>
- 2 commits expected: task 1 (help.md), task 2 (README + Phase A handoff)
- help.md body has 0 references to old skill names; deprecation appendix has exactly 13
- README skill table has 5 consolidated entries
- 12-RESEARCH.md Phase A handoff snapshot is valid JSON
- Token-savings methodology documented
- `npm test` passes
</success_criteria>

<output>
Create `.planning/objectives/12-skill-consolidation/12-07-SUMMARY.md` per template. Required:
- 2 commit hashes
- Sample of consolidated help.md catalog block
- Phase A handoff JSON sample (5 skills + 13 deprecated)
- Token-savings number with methodology
- Confirmation that `/devflow:help` renders correctly (manual verification status)
</output>
