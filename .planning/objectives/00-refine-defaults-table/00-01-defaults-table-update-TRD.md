---
objective: 00-refine-defaults-table
trd: 0.1
title: Update defaults-table.md — 27 changed cells + 5 new column headers
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/references/defaults-table.md
autonomous: true
requirements: [SC-1]
must_haves:
  truths:
    - "All 27 cells flagged in tdd-scope-refined-defaults.md reflect new text + structured field values"
    - "Five new column headers (security_isolation, back_compat, tdd_default, test_list_first, fixture_strategy) appear in the YAML schema and in the doc preamble"
    - "All 6 port cells drop the literal phrase 'spec-match (source's tests as fixtures)' and 'spec-match'"
    - "All 4 non-skip ui-lib cells drop literal 'visual regression' / 'visual + a11y' recommendations from the tdd field"
    - "All 3 (api, *) non-prototype/non-spike cells carry security_isolation: multi_tenant_required"
    - "(api, feature) and (app, feature) carry outside_in: true"
    - "(plugin, feature) carries fixture_strategy: generators"
    - "loadDefaultsTable() in intent.cjs parses the new YAML without throwing"
    - "Existing intent-cli.test.cjs '42 cells present' completeness test still passes (or its assertion-set is updated in TRD 02 to cover the new fields)"
  artifacts:
    - path: "plugins/devflow/devflow/references/defaults-table.md"
      provides: "YAML lookup table with 5 new column headers + 27 changed cells + 3 anti-pattern resolver constraints block"
      contains: "constraints:"
      contains_also: "security_isolation"
  key_links:
    - from: "plugins/devflow/devflow/references/defaults-table.md"
      to: "plugins/devflow/devflow/bin/lib/intent.cjs::loadDefaultsTable()"
      via: "fenced ```yaml block parsed by parseDefaultsYaml"
      pattern: "```yaml\\ndefaults:"
verification_commands:
  - "node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --kind plugin --work feature 2>&1 | grep -E '(fixture_strategy|generators)' || (echo 'NOTE: TRD 02 not yet shipped — fixture_strategy will not surface until then. Expected on Wave 1.' && true)"
  - "node -e \"const i=require('./plugins/devflow/devflow/bin/lib/intent.cjs'); const t=i.loadDefaultsTable(); for (const k of i.VALID_KINDS) for (const w of i.VALID_WORKS) { if (!t[k][w].tdd) throw new Error('missing tdd at '+k+','+w); } console.log('42-cell parse OK');\""
  - "grep -c 'spec-match' plugins/devflow/devflow/references/defaults-table.md && exit 1 || true"
  - "grep -E '(security_isolation|back_compat|tdd_default|test_list_first|fixture_strategy)' plugins/devflow/devflow/references/defaults-table.md | wc -l | awk '$1 < 5 { exit 1 }'"
---

<objective>
Update `plugins/devflow/devflow/references/defaults-table.md` to match observed AOCyber codebase reality. The shipped 42-cell table is more aspirational than descriptive. Replace the 27 cells flagged in `.planning/research/tdd-scope-refined-defaults.md` with their codebase-evidenced replacements and introduce 5 new column headers (`security_isolation`, `back_compat`, `tdd_default`, `test_list_first`, `fixture_strategy`) plus a `constraints:` block at the bottom of the YAML for the 3 resolver-level anti-patterns.

Purpose: Closes objective-0 success criterion 1. The table is level 4 in the resolution chain — every other piece of the (kind, work) intent system reads from it. Until this lands, the resolver schema work (TRD 02) cannot soak against accurate cell content.

Output: Single modified reference file. No code changes. The minimal-YAML parser in `intent.cjs::parseDefaultsYaml` accepts the new headers without modification *as long as* every new field follows the existing 6-space-indent + `key: value` convention used by the four current fields.
</objective>

<file_tree>
plugins/devflow/devflow/references/
└── defaults-table.md          ← MODIFY (sole file)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
The existing YAML cell shape (must be preserved for parser compatibility):

```yaml
  api:
    feature:
      tdd: "strict + multi-tenancy assertion"
      depth: comprehensive
      model_profile: quality
      verification: "full integration + API contract"
```

The minimal parser in `intent.cjs` (lines 41-86) is **indent-strict**:
- 2 spaces = kind
- 4 spaces = work
- 6 spaces = field
- Field values matching `^([a-z_]+):\s*(.+)$` are accepted, with optional double or single quotes stripped from values.

This means new fields like `security_isolation: multi_tenant_required` and `outside_in: true` parse fine. Quoted strings with colons (`tdd: "build first; verify ..."`) parse fine. Unquoted values without spaces parse fine.

Anti-pattern constraints already proposed in `tdd-scope-refined-defaults.md` (lines 478-490) live at the bottom of the YAML block as a **second top-level key** (`constraints:`). The current parser ignores anything that isn't `defaults:`-rooted, so adding `constraints:` is non-breaking — but TRD 02 will extend the parser to read it.

Until TRD 02 ships, the constraints block is documentation-only (the resolver doesn't act on it). That's intentional and matches the locked sequencing constraint in CONTEXT.md §7.
</codebase_examples>

<anti_patterns>
1. Do not change the indentation convention. The minimal parser is brittle by design (this avoids a YAML-library dependency for a 16-line file format). 2/4/6-space indents only.
2. Do not introduce list values (`- item`) inside cells. The existing parser does not handle them. If a field needs multiple values, encode as a comma-separated string or pick the resolver-side representation in TRD 02.
3. Do not move the `constraints:` block above `defaults:`. Order matters for human-readability and for TRD 02's parser extension which will look for the block AFTER the defaults tree.
4. Do not delete the human-readable preamble (lines 1-17) or the "Recurring Postures (Glossary)" section (lines 262-276). The glossary needs additions for the new vocabulary (`outside-in`, `contract-list-first`, `behavioral parity`); add them, do not remove what's there.
5. Do not edit `docs/PROPOSAL-kind-and-work.md` — it carries the historical rationale; out of scope for this TRD.
</anti_patterns>

<error_recovery>
- If the parser test (`node -e "..."` in verification_commands) fails after edits: most likely a 4-space indent crept into a field row, or a list `- item` was introduced. Run `grep -nE '^\s{8}-' plugins/devflow/devflow/references/defaults-table.md` to spot any list markers; should return zero hits.
- If `intent-cli.test.cjs::"every cell resolves cleanly"` starts failing in npm test: the assertion checks `result.config.tdd|depth|model_profile|verification`. Those four fields must remain on every cell. New fields are additive, not replacements.
- If a new field value contains characters the parser rejects: wrap the value in double quotes (`field: "value: with colon"`).
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/00-refine-defaults-table/00-CONTEXT.md
@.planning/objectives/00-refine-defaults-table/00-RESEARCH.md
@.planning/research/tdd-scope-refined-defaults.md
@.planning/research/tdd-scope-summary.md
@plugins/devflow/devflow/references/defaults-table.md
@plugins/devflow/devflow/bin/lib/intent.cjs
</context>

<research_context>
**Per-cell delta source of truth:** `.planning/research/tdd-scope-refined-defaults.md` lines 116-176 (sections "api row", "app row", "library row", "ui-lib row", "cli row", "plugin row"). The "Proposed refined defaults table" block at lines 178-490 is the literal target YAML — copy from there and reconcile against the existing file's preamble + glossary, do not retype from scratch.

**The 27 cells:**
- All 6 (api, *) cells: `(api, feature)` text + tags, `(api, port)` text + tags, `(api, refactor)` softer text, `(api, foundation)` perf-baseline append, `(api, bugfix)` no text change but security_isolation added, `(api, prototype)` and `(api, spike)` only the new tags. → 7 cells but 5 with body text changes.
- All 7 (app, *) cells: `(app, feature)` text + outside_in, `(app, port)` text + back_compat, `(app, refactor)` text, `(app, foundation)` no body change + tags, `(app, bugfix)` text append, `(app, prototype)` + `(app, spike)` tags only. → 7 cells.
- All 7 (library, *) cells: `(library, feature)` softened, `(library, port)` text + back_compat, others tags-only. → 7 cells.
- All 7 (ui-lib, *) cells: 4 non-skip cells have body text changes; prototype + spike get tags-only. → 7 cells.
- All 7 (cli, *) cells: `(cli, feature)` text on daemon-vs-command branch, `(cli, port)` text + back_compat, others tags-only. → 7 cells.
- All 7 (plugin, *) cells: `(plugin, feature)` text + fixture_strategy, others tags-only. → 7 cells.

Of those 42 cells, the research labels 27 as "behavior-text changes" and the remaining 15 as "tags-only additions". Both groups are in scope here — the doc must be regenerated such that *every* cell has the 5 new fields populated (even if the value is `none`/`n/a`/`false`).

**Anti-pattern constraints (3) added as a top-level `constraints:` block:**

```yaml
constraints:
  - id: no_llm_test_data
    description: "Test fixtures must be hand-built or use recorded cassettes for external APIs. Never accept generated test data as canonical."
    opt_out_field: "frontmatter.allow_generated_test_data"
  - id: no_property_based_default
    description: "Property-based testing is not suggested by default. Opt in only for genuinely high-cardinality math (refunds, proration, tax)."
    opt_out_field: "frontmatter.use_property_based"
  - id: no_gherkin_layer
    description: "Do not emit .feature files or Cucumber-shaped scaffolds. Descriptive test names carry the meaning."
    opt_out_field: "frontmatter.use_gherkin"
```

Note: these are read by TRD 02's parser extension. For Wave 1 they are documentation-only; the existing parser ignores anything outside `defaults:`.
</research_context>

<gotchas>
- **Validity of `n/a` as a string value:** The minimal parser will accept `security_isolation: n/a` because `n/a` matches the value regex. No quotes needed. But for stylistic consistency with the rest of the table, prefer `n/a` unquoted (mirrors the existing `tdd: skip`, `tdd: none` style).
- **`outside_in: true` vs `outside_in: "true"`:** Both parse identically in the minimal parser. Pick unquoted `true`/`false` for stylistic consistency with future bool-shaped fields. TRD 02 will normalize.
- **`(ui-lib, port)` `back_compat: visual_parity`:** This is *aspirational* per the research. The cell text says "build first; verify behavioral parity via widget tests" but the back_compat tag stays as `visual_parity` to surface the *target* the user might opt into when tooling lands. Do not change either.
- **`(plugin, feature)` `fixture_strategy: generators`:** Other cells in the table do NOT need to populate `fixture_strategy` (default to `n/a` or omit per TRD 02's choice). For Wave 1, populate it on every cell with `fixture_strategy: n/a` for the cells that don't need a generator/cassette pattern, to keep the schema uniform across all 42 cells. This matches the locked decision in CONTEXT.md §3 that the field is required on every cell.
- **`tdd_default` interpretation:** Per CONTEXT.md §3 the field's values are `strict | auto | skip` and represent the *resolver bias* applied when a CLAUDE.md TDD Playbook is detected. The cell value is the **default for that cell when no playbook is present**. Translation rule from existing `tdd:` text:
  - `tdd: "skip"` → `tdd_default: skip`
  - `tdd: "none"` → `tdd_default: skip` (treat both as "no automated tests required")
  - any other text → `tdd_default: strict` (the cell prescribes some testing posture)
  - The user playbook's effect is handled by the resolver in TRD 02; the cell-level field is just the table's opinion absent any playbook.
- **`test_list_first`:** Per CONTEXT.md §3 it is `required | optional`. Cell rule: every cell where `tdd_default == strict` gets `test_list_first: required`; cells with `tdd_default == skip` get `test_list_first: optional`. No exceptions for Wave 1.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite the YAML block — populate every cell with all 5 new fields plus updated body text</name>
  <files>plugins/devflow/devflow/references/defaults-table.md</files>
  <action>
Replace the entire fenced ```yaml block (currently lines 18-260) with the proposed table from `tdd-scope-refined-defaults.md` (lines 180-490 of that file), reconciled against the rules below. Preserve:
- Lines 1-17 (preamble — but update the schema bullet list to mention the 5 new fields)
- Lines 261-285 (glossary + versioning section — but add 3 new glossary entries: "outside-in", "contract-list-first parity", "behavioral parity")

Approach:
1. Open `tdd-scope-refined-defaults.md`. Copy the YAML between ```yaml and ``` (lines 180-490 of that doc).
2. For every one of the 42 cells, ensure these 9 fields are populated (4 existing + 5 new):
   - `tdd` (string — body text)
   - `depth` (`quick|standard|comprehensive`)
   - `model_profile` (`quality|balanced|budget`)
   - `verification` (string)
   - `security_isolation` (`multi_tenant_required|single_tenant|n/a`)
   - `back_compat` (`api_parity|ui_parity|library_parity|visual_parity|io_parity|contract_parity|behavioral|none`)
   - `tdd_default` (`strict|auto|skip`)
   - `test_list_first` (`required|optional`)
   - `fixture_strategy` (`generators|cassettes|inline|n/a`)
3. The research file is missing some `tdd_default`, `test_list_first`, `fixture_strategy`, and `outside_in` fields on cells where the research considered them implicit. Apply the gotchas-section rules to fill them in. Specifically:
   - Default every `(*, prototype)` cell to: `tdd_default: skip`, `test_list_first: optional`, `fixture_strategy: n/a` (except `(plugin, prototype)` which keeps `tdd: "minimal contract test"` and so gets `tdd_default: strict`, `test_list_first: required`, `fixture_strategy: n/a`).
   - Default every `(*, spike)` cell to: `tdd_default: skip`, `test_list_first: optional`, `fixture_strategy: n/a`.
   - Default every `(*, refactor)` cell to: `tdd_default: strict`, `test_list_first: required`, `fixture_strategy: inline` (characterization tests are typically inline; the user can override).
   - Default every `(*, bugfix)` cell to: `tdd_default: strict`, `test_list_first: required`, `fixture_strategy: inline`.
   - Default every `(*, foundation)` cell to: `tdd_default: strict`, `test_list_first: required`, `fixture_strategy: inline`.
   - `(api, *)` non-prototype/non-spike cells (feature, port, refactor, foundation, bugfix) get `security_isolation: multi_tenant_required`. The (api, prototype) and (api, spike) cells get `security_isolation: n/a`. Foundation gets `single_tenant` per the research.
   - `(app, *)`, `(library, *)`, `(ui-lib, *)`, `(cli, *)`, `(plugin, *)` cells all get `security_isolation: n/a`.
   - `outside_in: true` only for `(api, feature)`, `(app, feature)`, `(app, port)` (per research line 256). All others get `outside_in: false`.
   - `(plugin, feature)` is the only cell with `fixture_strategy: generators`. Other cells where the research didn't specify default to `inline`. Cells where TDD is skipped default to `n/a`.

4. After the `defaults:` tree, append (still inside the same ```yaml fence) the `constraints:` block from `tdd-scope-refined-defaults.md` lines 478-490. Reproduce verbatim.

5. Update the preamble (lines 1-17) "Schema:" bullet list to add the 5 new fields:
   ```
   - `security_isolation` — Multitenancy posture: `multi_tenant_required | single_tenant | n/a`
   - `back_compat` — Parity target for ports/refactors: `api_parity | ui_parity | library_parity | visual_parity | io_parity | contract_parity | behavioral | none`
   - `tdd_default` — Default TDD posture absent CLAUDE.md playbook: `strict | auto | skip`
   - `test_list_first` — Whether the planner emits a behavior-cases checklist: `required | optional`
   - `fixture_strategy` — Test data approach: `generators | cassettes | inline | n/a`
   ```

6. Update the glossary (lines 262-276) by appending three new entries after "contract test":
   ```
   - **"outside-in"** — Plan outside-the-system layer first (E2E / system tests), then drill in (integration → unit). User's CLAUDE.md TDD Playbook habit 5; defaults on for `(app, feature)` and `(api, feature)`.
   - **"contract-list-first parity"** — Replaces the older "spec-match" recommendation for ports. Derive a behavioral parity checklist from the source's *behavior* (read source code + tests as documentation, not transplantable fixtures). Write failing parity tests against the new stack, port, pass.
   - **"behavioral parity"** — Verify functional equivalence at the public observable surface (HTTP contract, library API, CLI I/O, plugin contract). Distinct from "visual parity" which compares rendered output pixel-by-pixel.
   ```

7. Update line 16 ("Open structural notes:") to remove the "deferred until usage data justifies it" line — the research has supplied that data; replace with one line: "Cells now carry 9 fields each (4 original + 5 new from the 2026-04-29 codebase-survey research)."

# CRITICAL: All 42 cells must populate all 9 fields. The TRD 02 resolver extension will fail-loud if a cell is missing a new field.
# CRITICAL: Do not introduce list-shaped values inside cells. The minimal parser does not support them.
# CRITICAL: The `constraints:` block at the bottom MUST be a second top-level YAML key (no indent). Otherwise the parser tree-walks into it as a kind.
# GOTCHA: `tdd_default: skip` does not mean "skip writing tests forever". It means "absent any CLAUDE.md TDD Playbook, this cell defaults to skip; the user's playbook can promote skip → auto → strict".
# PATTERN: Follow the cell shape from existing `(api, feature)` (lines 25-29 of the current file) — single-line key:value entries, six-space indent, double quotes for strings with spaces.
  </action>
  <verify>
1. `node -e "const i=require('./plugins/devflow/devflow/bin/lib/intent.cjs'); const t=i.loadDefaultsTable(); for (const k of i.VALID_KINDS) for (const w of i.VALID_WORKS) { const c = t[k][w]; for (const f of ['tdd','depth','model_profile','verification','security_isolation','back_compat','tdd_default','test_list_first','fixture_strategy']) if (!c[f]) throw new Error('missing '+f+' at '+k+','+w); } console.log('all 42 cells × 9 fields parse OK');"` returns the success message.
2. `grep -c "spec-match" plugins/devflow/devflow/references/defaults-table.md` returns 0 (excluding the glossary entry which mentions the old term in the "contract-list-first" definition; if that produces a hit, scope the grep to cells only: `awk '/^```yaml/,/^```/' plugins/devflow/devflow/references/defaults-table.md | grep -c spec-match` returns 0).
3. `grep -c "fixture_strategy" plugins/devflow/devflow/references/defaults-table.md` returns ≥ 42 (one per cell, possibly plus the schema bullet).
4. `grep -E "^constraints:" plugins/devflow/devflow/references/defaults-table.md` returns exactly one match.
5. `npm test 2>&1 | grep -E "intent-cli\.test|intent\.test"` shows no new failures versus baseline (baseline tests assert the 4 original fields exist; they continue to pass because new fields are additive).
  </verify>
  <done>
- File parses cleanly via `loadDefaultsTable()` with all 9 fields on every cell.
- The literal phrase "spec-match" no longer appears in any cell body.
- The literal phrase "visual regression" no longer appears in the body of any non-skip ui-lib cell (it survives in the glossary as the named industry pattern).
- All 6 `(api, feature/port/refactor/foundation/bugfix)` cells carry `security_isolation: multi_tenant_required` (foundation: `single_tenant`).
- `(api, feature)` and `(app, feature)` carry `outside_in: true`.
- `(plugin, feature)` carries `fixture_strategy: generators`.
- The 3-element `constraints:` block exists as a second top-level YAML key.
- The preamble's Schema bullet list lists all 9 fields.
- The glossary has 3 new entries (outside-in, contract-list-first, behavioral parity).
  </done>
  <recovery>
If the parser test fails after edits:
1. Run `awk '/^```yaml/,/^```/' plugins/devflow/devflow/references/defaults-table.md > /tmp/extracted.yaml` and inspect the extracted block manually.
2. Most common breakage: a multi-line string value or a tab character. Replace tabs with spaces and ensure every value sits on one line.
3. If indentation is off, re-derive from the `(api, feature)` cell's exact shape and copy the indent pattern.

If the existing test `every cell resolves cleanly via intent.resolve` fails:
1. The test only checks the 4 original fields exist. New fields can be missing for that test — but they must be present for THIS TRD's done criteria. Verify the failure isn't on the 4 original fields (which would mean the rewrite dropped a cell or a required field).
2. If a cell is genuinely missing, locate the gap from the assertion's `(${kind}, ${work}) missing field` message and fix.

If revert is needed: `git checkout plugins/devflow/devflow/references/defaults-table.md` restores the prior content (this branch is local-only on `feature/v1.1`; safe).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Smoke-test the modified table against the resolver — without TRD 02's schema extension yet</name>
  <files>plugins/devflow/devflow/references/defaults-table.md</files>
  <action>
This task confirms that the rewritten table parses and resolves cleanly *with the current resolver* (which only knows about the 4 original fields). The new fields are additive — they parse and become available in `result.config` via the spread on line 174 of `intent.cjs`, but the resolver doesn't act on them yet. That's correct and intentional for Wave 1.

Build a one-shot smoke script:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Build a minimal fixture project in a tmp dir
TMP=$(mktemp -d)
mkdir -p "$TMP/.planning/objectives/01-feat" "$TMP/.planning/objectives/02-port" "$TMP/.planning/objectives/03-bugfix"
cat > "$TMP/.planning/PROJECT.md" <<'EOF'
---
kind: api
default_work: feature
---
# fixture
EOF
cat > "$TMP/.planning/objectives/01-feat/OBJECTIVE.md" <<'EOF'
---
work: feature
---
# fixture
EOF
cat > "$TMP/.planning/objectives/02-port/OBJECTIVE.md" <<'EOF'
---
work: port
---
# fixture
EOF
cat > "$TMP/.planning/objectives/03-bugfix/OBJECTIVE.md" <<'EOF'
---
work: bugfix
---
# fixture
EOF

# Resolve all three and assert security_isolation surfaces in config
for OBJ in 01-feat 02-port 03-bugfix; do
  RESULT=$(cd "$TMP" && node "$OLDPWD/plugins/devflow/devflow/bin/df-tools.cjs" intent resolve --objective "$OBJ")
  echo "$RESULT" | grep -q '"security_isolation"' || { echo "FAIL: $OBJ missing security_isolation in resolved config" >&2; exit 1; }
  echo "$RESULT" | grep -q 'multi_tenant_required' || { echo "FAIL: $OBJ resolved without multi_tenant_required (api kind expects this)" >&2; exit 1; }
done

rm -rf "$TMP"
echo "smoke OK — table parses and 5 new fields surface in resolver output"
```

Run this script. Do not commit it (no need — it's a smoke check, not a permanent test).

# CRITICAL: This works because `intent.cjs::resolve` (line 174) does `tableDefaults = { ...table[kind][work] }` — every field on the cell is copied. Then line 179-181 loop only assigns provenance for the 4 known fields, but the others sit on `config` already. TRD 02 will add proper provenance per field.
# GOTCHA: If the script reports "missing security_isolation in resolved config" — the cell rewrite missed a field. Fix the table.
# GOTCHA: If `node ... intent resolve` errors with "missing yaml block" — the fenced ```yaml block was inadvertently broken (extra fence, missing opening, etc.). Restore.
  </action>
  <verify>
The smoke script above prints `smoke OK — table parses and 5 new fields surface in resolver output` and exits 0.
  </verify>
  <done>
- Smoke script passes.
- `result.config` from `df-tools intent resolve` contains the 5 new fields populated for an api fixture.
- `security_isolation: multi_tenant_required` appears on the (api, feature), (api, port), (api, bugfix) resolutions.
  </done>
  <recovery>
If the script fails on `multi_tenant_required` for (api, port) or (api, bugfix): the cell rewrite tagged those cells incorrectly. Re-check the `(api, port)` and `(api, bugfix)` cells — they should both carry `security_isolation: multi_tenant_required` per the locked decisions in CONTEXT.md §3.

If the script reports JSON parse errors: `node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --objective 01-feat` (raw, no jq) directly inside the tmp dir to see the unparsed output. The most common cause is the resolver crashing because `loadDefaultsTable()` failed; that surfaces as a thrown error before JSON output.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. The 9 required fields are present on every one of the 42 cells (verified by the parser smoke script in Task 1's verify block).
2. The 5 cell-text deltas from `tdd-scope-refined-defaults.md` are reflected:
   - All 6 port cells dropped "spec-match"
   - All 4 non-skip ui-lib cells dropped "visual regression" / "visual + a11y" from `tdd` field bodies
   - 5 (api, *) cells carry `security_isolation: multi_tenant_required` (foundation: single_tenant)
   - (api, feature) + (app, feature) + (app, port) carry `outside_in: true`
   - (plugin, feature) carries `fixture_strategy: generators`
3. The `constraints:` block at the bottom contains all 3 entries (`no_llm_test_data`, `no_property_based_default`, `no_gherkin_layer`).
4. The preamble's Schema list documents all 9 fields.
5. The glossary has 3 new entries.
6. `npm test` does not regress (the 42-cell completeness test continues to pass on the 4 original fields).
7. Smoke script in Task 2 prints "smoke OK".
</verification>

<success_criteria>
Maps to ROADMAP.md objective 0 success criterion 1: "defaults-table.md reflects 27 changed cells + 5 new column headers; format remains valid parseable YAML reference doc."

Indirectly enables criteria 2 (resolver schema work in TRD 02), 3 (planner reads new fields in TRD 03), 9 (round-trip on a fixture project — once TRD 02 + TRD 03 land), and 10 (npm test passes — verified here for Wave 1).

Does NOT enable criterion 7 (migration validated against 01-handoff-watcher) — that is TRD 05's concern.
</success_criteria>

<output>
After completion, create `.planning/objectives/00-refine-defaults-table/00-01-defaults-table-update-SUMMARY.md` documenting:
- The 42-cell × 9-field final shape
- Which cells got body-text changes vs tags-only additions (counts)
- Confirmation that the smoke script passed
- Any cells where the rewriter had to make a judgment call beyond what the research file specified (note them so TRD 02 can pick them up)
</output>
