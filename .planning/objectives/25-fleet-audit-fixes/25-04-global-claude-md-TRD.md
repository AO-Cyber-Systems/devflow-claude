---
objective: 25-fleet-audit-fixes
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - /Users/justin/.claude/CLAUDE.md
autonomous: true
requirements: []   # ad-hoc audit objective — roadmap Objective 25 SC-5 is the contract

must_haves:
  truths:
    - "Routing table routes resume/status/progress to /devflow:status (with status resume / status pause) — retired /devflow:resume-work and /devflow:progress appear nowhere in the file"
    - "Routing table has a /devflow:micro tier (trivial single-token changes) below /devflow:quick"
    - "Routing table mentions all four adoption-target skills: milestone, todo, gh-sync, discuss-objective (LOCKED decision 2b)"
    - "A '## TDD & Quality' H2 section exists whose heading matches claude-md.cjs HEADING_PATTERNS (^##.*TDD and ^##.*Quality)"
    - "deriveOverrides() over the file yields ONLY { _playbookDetected: true } — zero structured field overrides (no accidental PLAYBOOK_HABITS phrase matches)"
    - "df-tools intent resolve --objective 25 in devflow-claude produces config values identical to the pre-edit baseline (plugin-kind strict→strict promotion is a no-op)"
  artifacts:
    - "/Users/justin/.claude/CLAUDE.md — updated routing table + new ## TDD & Quality section (NOT a git repo: edit in place, verify by re-reading, NO commit)"
  key_links:
    - "Heading '## TDD & Quality' ↔ claude-md.cjs HEADING_PATTERNS (matches both /^##\\s+.*\\bTDD\\b/i and /^##\\s+.*\\bQuality\\b/i — belt-and-suspenders)"
    - "Section wording ↔ PLAYBOOK_HABITS phrase detectors: must avoid all six patterns so per-kind policy stays documentation-only (uniform overrides would defeat the by-kind split)"
---

<objective>
Align the global `~/.claude/CLAUDE.md` with the current DevFlow surface: fix the retired resume-work/progress routing row, add the missing micro tier, add routing mentions for the four adoption-target skills, and add the by-kind `## TDD & Quality` playbook section. Audit items 2, 3a, and 6b (global half).

Purpose: roadmap SC-5 — "~/.claude/CLAUDE.md routing table matches current skill surface (status, micro) and declares TDD-by-kind playbook".
Output: edited global CLAUDE.md (no commit — not a git repo), verified by re-read + resolver no-regression check.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Current routing table (verbatim, /Users/justin/.claude/CLAUDE.md `# DevFlow Routing` section):

```markdown
- Building a feature end-to-end → `/devflow:build`
- Planning before building → `/devflow:plan-objective`
- Executing a planned objective → `/devflow:execute-objective`
- Verifying / UAT → `/devflow:verify-work`
- Debugging a bug → `/devflow:debug`
- Quick ad-hoc task with atomic commits → `/devflow:quick`
- New project setup → `/devflow:new-project`
- Resume / status / progress → `/devflow:resume-work`, `/devflow:progress`
```

Target routing table (replace the last row; add micro + four adoption rows; keep existing rows verbatim):

```markdown
- Building a feature end-to-end → `/devflow:build`
- Planning before building → `/devflow:plan-objective`
- Executing a planned objective → `/devflow:execute-objective`
- Verifying / UAT → `/devflow:verify-work`
- Debugging a bug → `/devflow:debug`
- Quick ad-hoc task with atomic commits → `/devflow:quick`
- Trivial single-token change (typo, import, rename) → `/devflow:micro`
- New project setup → `/devflow:new-project`
- Resume / status / progress → `/devflow:status` (also `status resume`, `status pause`)
- Milestones (new / audit / complete / gaps) → `/devflow:milestone <sub>`
- Todos (capture / review) → `/devflow:todo add`, `/devflow:todo list`
- Push planning state to GitHub issues → `/devflow:gh-sync`
- Talk through an objective before planning → `/devflow:discuss-objective`
```

claude-md.cjs mechanism the new section must satisfy (HEADING_PATTERNS):
```js
/^##\s+.*\bTDD\b/i, /^##\s+.*\bTest(ing)?\b/i, /^##\s+.*\bQuality\b/i, /^##\s+.*\bScope\b/i
```
</codebase_examples>

<anti_patterns>
FORBIDDEN PHRASES in the new section — each would trip a PLAYBOOK_HABITS or legacy phrase detector and apply a UNIFORM global override to every kind (defeating the by-kind policy). Do not write anything matching:

- `force tdd trds at planning` / `all features default to tdd strict` / `make every feature a type=tdd` / `all business logic must be tdd` (→ tdd_default/tdd override)
- `test list first` / `checklist of behavior cases` / `before any test code` (→ test_list_first: required)
- `one test at a time` / `red → green → refactor` (freeform habit 3; harmless but avoid anyway)
- `fixture generators|builders|factory functions` / `no llm-generated test data` / `recorded cassettes` (→ fixture_strategy: generators)
- `outside-in for ui` / `start at the highest user-observable layer` (→ outside_in: true)
- `multitenancy guard` / `wrong-tenant isolation` / `tenant isolation ... every test` / `test the wrong-tenant ... always` (→ security_isolation: multi_tenant_required)
- `skip property-based` / `no property-based` (→ propertyBased: skip)

Also: do NOT claim the section "enforces" per-kind behavior — claude-md.cjs's absorber is not kind-conditional (research Pitfall 4). The section is descriptive policy; the machine-enforced split lives in defaults-table.md.
</anti_patterns>

<error_recovery>
- If the post-edit deriveOverrides check shows an unexpected override key, reword the offending sentence (consult the forbidden list) and re-check — do NOT modify claude-md.cjs (out of scope: no intent-model code changes).
- The file is not under version control: before editing, copy the original to the session scratchpad directory as a backup so any bad edit can be restored byte-identically.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/25-fleet-audit-fixes/25-CONTEXT.md
@.planning/objectives/25-fleet-audit-fixes/25-RESEARCH.md
@plugins/devflow/devflow/bin/lib/claude-md.cjs
</context>

<research_context>
- LOCKED decision 3: TDD strict for `library | api | cli` kinds; pragmatic tests-with-code for `app | ui-lib`; heading must match the level-3 scan patterns.
- Orchestrator disposition 3: documentation-only — the section's own text should point to defaults-table.md as the machine-enforced version so it is not misleading.
- EXPECTED side effects of the section MERELY EXISTING (existence-gated, not phrase-gated — `_playbookDetected` flips true whenever any section lands in the tdd/test bucket):
  1. `tdd_default` one-step promotion fleet-wide at resolve time: skip→auto (prototype/spike work), auto→strict. strict→strict is a no-op — so devflow-claude (plugin/feature) sees NO change.
  2. For `kind: api` projects, `security_isolation: n/a → multi_tenant_required` at resolve time.
  These are the intent-model's designed "playbook present" promotions and are the POINT of the audit fix ("so intent-model resolution engages fleet-wide" — roadmap goal). Record both effects in the SUMMARY so the user sees exactly what engaging the playbook changes.
</research_context>

<gotchas>
- HARD CONSTRAINT: port 8080 forbidden; no version bump/tag/release/deploy. `~/.claude/CLAUDE.md` is NOT a git repo — no commit step for this TRD; verification is re-read + resolver checks.
- Capture the resolver BASELINE BEFORE editing (Task 1 step 1) — you cannot diff against a baseline you didn't save.
- The existing `# DevFlow Routing` section is an H1 (`#`), not H2 — it does not hit HEADING_PATTERNS and is safe to edit freely. The new TDD section MUST be H2 (`##`).
- Keep the rest of the file (HARD RULES, Deliverables, AO Cyber brand guide) byte-identical.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Update the DevFlow Routing table (status, micro, four adoption skills)</name>
  <files>/Users/justin/.claude/CLAUDE.md</files>
  <action>
Step 1 — capture baselines: `cp ~/.claude/CLAUDE.md <scratchpad>/CLAUDE.md.bak` and `node ~/.claude/devflow/bin/df-tools.cjs intent resolve --objective 25 > <scratchpad>/resolve-before.json` (run from /Users/justin/dev/devflow-claude).

Step 2 — with the Edit tool, replace the routing bullet list with the target table from codebase_examples: swap the retired `- Resume / status / progress → /devflow:resume-work, /devflow:progress` row for the `/devflow:status` row; insert the `/devflow:micro` tier after the quick row; append the four adoption rows (milestone / todo / gh-sync / discuss-objective — LOCKED decision 2b). Keep the section's surrounding prose ("Skills enforce atomic commits..." etc.) unchanged.
  </action>
  <verify>grep -c "resume-work\|/devflow:progress" ~/.claude/CLAUDE.md returns 0; grep -c "devflow:micro" ~/.claude/CLAUDE.md returns 1; grep -E "milestone|todo|gh-sync|discuss-objective" ~/.claude/CLAUDE.md shows all four adoption rows</verify>
  <done>Routing table matches the current skill surface; retired names gone; micro + four adoption skills present</done>
  <recovery>Restore from the scratchpad backup and retry with a narrower Edit</recovery>
</task>

<task type="auto">
  <name>Task 2: Add the by-kind ## TDD & Quality section (phrase-safe wording)</name>
  <files>/Users/justin/.claude/CLAUDE.md</files>
  <action>
Append a new H2 section after the DevFlow Routing section (before the AO Cyber brand guide). Required properties: heading exactly `## TDD & Quality`; states the by-kind policy — strict test-first development for `library`, `api`, and `cli` kind projects; pragmatic tests-written-alongside-code for `app` and `ui-lib` kinds; prototypes/spikes exempt. MUST include a pointer sentence such as: "The machine-enforced version of this split lives in DevFlow's (kind, work) defaults table (`~/.claude/devflow/references/defaults-table.md`); this section is human-readable policy, not a resolver override." MUST avoid every forbidden phrase in anti_patterns (paraphrase freely — e.g. say "write the failing test before the implementation for these kinds" rather than any banned wording).

Then verify no accidental overrides:
`node -e "const cm=require(process.env.HOME+'/.claude/devflow/bin/lib/claude-md.cjs'); const d=cm.absorb(); const o=cm.deriveOverrides(d); console.log(JSON.stringify(o));"`
Expected output: `{"_playbookDetected":true}` and nothing else. (If absorb() requires args, call per its signature in claude-md.cjs — it reads the user path by default.)

Finally: `node ~/.claude/devflow/bin/df-tools.cjs intent resolve --objective 25 > <scratchpad>/resolve-after.json` (from devflow-claude) and diff the `config` values against resolve-before.json — must be identical (strict→strict promotion no-op for plugin kind).
  </action>
  <verify>grep -n "^## TDD & Quality" ~/.claude/CLAUDE.md returns exactly one match; deriveOverrides output is exactly {"_playbookDetected":true}; resolve-before/after config values identical</verify>
  <done>Section exists with scan-matching heading, by-kind policy, defaults-table pointer, and zero structured overrides; devflow-claude resolver output unchanged</done>
  <recovery>If deriveOverrides emits extra keys, identify which pattern matched (test each sentence against the anti_patterns list with node -e regex checks), reword, re-verify; restore from backup if the file gets mangled</recovery>
</task>

</tasks>

<verification>
1. Re-read /Users/justin/.claude/CLAUDE.md end-to-end: routing table correct, TDD section present, all other sections byte-identical to the backup except the two edited regions.
2. deriveOverrides = `{"_playbookDetected":true}` only.
3. resolve-before.json vs resolve-after.json: identical config values for devflow-claude.
4. No commit attempted (not a git repo). No port 8080 anywhere.
</verification>

<success_criteria>
- Roadmap SC-5: routing table matches current skill surface (status, micro) and declares the TDD-by-kind playbook; four adoption skills mentioned (LOCKED decision 2b); playbook engages the level-3 scan without accidental uniform overrides.
</success_criteria>

<output>
After completion, create `.planning/objectives/25-fleet-audit-fixes/25-04-SUMMARY.md` — include the "expected promotion side effects" note (tdd_default skip→auto for prototype/spike; api security_isolation n/a→multi_tenant_required at resolve time in api-kind repos).
</output>
