---
objective: 05-initiative-context-layer
trd: 05-04
type: standard
confidence: high
wave: 4
depends_on:
  - 05-03
files_modified:
  - plugins/devflow/skills/initiatives/SKILL.md
  - plugins/devflow/devflow/workflows/plan-objective.md
  - plugins/devflow/devflow/workflows/research-objective.md
  - plugins/devflow/agents/planner.md
autonomous: true
requirements:
  - SC-5
  - SC-6
must_haves:
  truths:
    - "/devflow:initiatives skill exists with frontmatter, objective, process, and CLI passthrough"
    - "Skill exposes sync, list, show subcommands via $ARGUMENTS passthrough"
    - "/df:plan-objective workflow loads matching initiatives at entry and injects formatted block into planner prompt"
    - "Planner agent's <additional_context> includes a {INITIATIVES} section alongside {CROSS_REPO}"
    - "Plan-time read NEVER calls gh — file-only per CONTEXT.md decision #3"
    - "When PROJECT.md::github_repo is unset, no initiatives are matched (graceful empty)"
  artifacts:
    - path: "plugins/devflow/skills/initiatives/SKILL.md"
      provides: "User-invocable /devflow:initiatives skill"
      contains: "argument-hint"
    - path: "plugins/devflow/devflow/workflows/plan-objective.md"
      provides: "Step 8 extension reading initiatives + computing INITIATIVES block"
      contains: "loadInitiatives"
    - path: "plugins/devflow/devflow/workflows/research-objective.md"
      provides: "Optional: surfaces initiative context to researcher (advisory)"
      contains: "initiatives"
    - path: "plugins/devflow/agents/planner.md"
      provides: "<additional_context> block extended with {INITIATIVES} alongside {CROSS_REPO}"
      contains: "INITIATIVES"
  key_links:
    - from: "plugins/devflow/skills/initiatives/SKILL.md"
      to: "df-tools initiatives <subcommand>"
      via: "Bash invocation"
      pattern: "df-tools initiatives"
    - from: "plugins/devflow/devflow/workflows/plan-objective.md"
      to: "df-tools initiatives list"
      via: "plan-time read"
      pattern: "initiatives list"
    - from: "plugins/devflow/agents/planner.md"
      to: "{INITIATIVES} placeholder"
      via: "<additional_context>"
      pattern: "INITIATIVES"
---

<objective>
Wire the initiative reader into the user-facing surface: create `/devflow:initiatives` skill (user-invocable slash command for sync/list/show), extend `/df:plan-objective` workflow to read matching initiatives at entry and inject formatted block into planner prompt's `<additional_context>`, and update `agents/planner.md` to consume the new `{INITIATIVES}` placeholder.

Plan-time read is FILE-ONLY (CONTEXT.md decision #3 + #6). The planner skill calls `df-tools initiatives list --raw`, filters by `PROJECT.md::github_repo`, formats matching initiatives via `formatInitiativeForPlanner`, and injects into the planner prompt.

Purpose: SC-5 (planner integration), SC-6 (skill + CLI sync side; list/show were wired in 05-01).
Output: New SKILL.md; extended plan-objective.md workflow; extended planner.md agent prompt; (optional) extended research-objective.md.
</objective>

<file_tree>
plugins/devflow/skills/
└── initiatives/
    └── SKILL.md                                      ← CREATE

plugins/devflow/devflow/workflows/
├── plan-objective.md                                 ← MODIFY (extend Step 8)
└── research-objective.md                             ← MODIFY (optional, advisory)

plugins/devflow/agents/
└── planner.md                                        ← MODIFY (add {INITIATIVES})
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**SKILL.md structure (from `/devflow:awareness` SKILL.md):**

```markdown
---
name: awareness
description: |
  Show cross-repo awareness: who else is working on what (peer view) and how the work fits into org-wide progress (Product Roadmap view). Renders both views by default.
  Use when the user wants to know if anyone else is working on related stuff...
  Triggers on: "who else is working on this", "what's in flight", ...
argument-hint: "[--peer-only|--org-only] [--quarter Q] [--product P] [--refresh [peer|org]] [--no-fetch] [--raw]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Render two awareness views side-by-side...
</objective>

<execution_context>
@.planning/STATE.md
@.planning/.awareness-cache.json
</execution_context>

<process>
**Run the awareness CLI with arg passthrough:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs awareness show $ARGUMENTS
```

The CLI:
1. ...
</process>

<context>
...
</context>
```

Mirror this exact structure for `/devflow:initiatives`. Skill is a thin pass-through to the CLI router.

**plan-objective Step 8 extension (from TRD 03-06 Cross-Repo extraction):**

```bash
# Extract Cross-Repo Considerations section from CONTEXT.md (TRD 03-06)
if [[ -n "$CONTEXT_CONTENT" ]]; then
  CROSS_REPO=$(printf '%s' "$CONTEXT_CONTENT" | awk '
    /^## Cross-Repo Considerations/ { in_section = 1; print; next }
    in_section && /^## / { in_section = 0 }
    in_section { print }
  ')
fi
if [[ -z "$CROSS_REPO" ]]; then
  CROSS_REPO="_(none — research-objective did not run, or scan returned empty)_"
fi
```

For TRD 05-04: same pattern, but new section reads initiatives via `df-tools` + filters by github_repo.

**Awk pattern caveat (from TRD 03-05):** macOS BSD awk does NOT support newlines in `-v` string args. For multiline content, write to a tmp bodyfile and use `awk -v bodyfile=$TMP` with `getline` in BEGIN block. Pattern is portable across BSD + GNU awk.

For TRD 05-04: the INITIATIVES content comes from `df-tools initiatives list --raw` JSON, parsed with jq. No newlines-in-awk-args concern. Use jq + bash directly.

**Planner agent additional_context block (from agents/planner.md per TRD 03-06):**

```markdown
<additional_context>
**Cross-Repo Considerations (from CONTEXT.md, advisory):**

{CROSS_REPO}
</additional_context>
```

Extend with INITIATIVES section:

```markdown
<additional_context>
**Cross-Repo Considerations (from CONTEXT.md, advisory):**

{CROSS_REPO}

**Active Initiatives (from ~/.claude/devflow/initiatives/, advisory):**

{INITIATIVES}
</additional_context>
```
</codebase_examples>

<anti_patterns>
- **DO NOT** call `df-tools initiatives sync` from the plan-objective workflow. Plan-time is FILE-ONLY (CONTEXT.md decision #3). Only `list` and `show` are read-only.
- **DO NOT** call `gh` from the plan-objective workflow. Initiative reader is offline. If `~/.claude/devflow/initiatives/` is missing or empty, just emit a placeholder.
- **DO NOT** lock the planner on initiatives. The block is ADVISORY (matches CROSS_REPO pattern). Planner reads + biases TRDs but is free to ignore.
- **DO NOT** prompt the user via the skill for confirmation prior to sync. The CLI handles `--force` and TTY readline; the skill is a transparent passthrough.
- **DO NOT** depend on initiative content for SUCCESS of the plan-objective workflow. If the initiatives list is empty, planning still proceeds.
- **DO NOT** modify `objective-researcher.md` agent prompt — it doesn't read initiatives directly. (Optional: extend `research-objective.md` workflow if executor judges value; otherwise SKIP.)
</anti_patterns>

<error_recovery>
- **`df-tools initiatives list --raw` fails:** treat as empty list; INITIATIVES = placeholder.
- **JQ filter syntax error:** falls back to placeholder.
- **`PROJECT.md::github_repo` is unset:** no filtering possible → no initiatives matched. Render placeholder `_(none — PROJECT.md missing github_repo field)_`.
- **`formatInitiativeForPlanner` not available:** the workflow does NOT directly call the format fn — it calls `df-tools initiatives list --raw` and renders inline via jq. (Alternative: a new subcommand `df-tools initiatives format-for-planner --repo <ref>` which calls the formatter and emits markdown. Recommended for TRD 05-04 because it keeps formatting in JS, not bash.)
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@.planning/objectives/05-initiative-context-layer/05-CONTEXT.md
@.planning/objectives/05-initiative-context-layer/05-01-SUMMARY.md
@.planning/objectives/05-initiative-context-layer/05-02-SUMMARY.md
@.planning/objectives/05-initiative-context-layer/05-03-SUMMARY.md

# Reference patterns
@plugins/devflow/skills/awareness/SKILL.md
@plugins/devflow/skills/gh-sync/SKILL.md
@plugins/devflow/devflow/workflows/plan-objective.md
@plugins/devflow/agents/planner.md
</context>

<gotchas>
- **`$ARGUMENTS` in skill markdown:** Bash variable expanded by Claude Code at skill-invocation time. Don't quote it (`"$ARGUMENTS"`) when intent is multi-arg passthrough.
- **`@path` in skill execution_context:** ONLY relative paths under `~/.claude/devflow/` or repo paths are valid. The home `~/.claude/devflow/initiatives/` works because `sync-runtime` hook mirrors plugin runtime.
- **plan-objective.md is shared with TRD 03-06:** the `CROSS_REPO` extraction is already there. Insert INITIATIVES extraction RIGHT AFTER the CROSS_REPO block. Do NOT replace; APPEND.
- **`research-objective.md` integration is OPTIONAL:** the researcher may benefit from initiative context, but the planner integration is what SC-5 requires. If executor judges value, add it; else skip and document in SUMMARY.
- **`df-tools initiatives format-for-planner --repo <ref>` is a NEW subcommand:** if executor adds it (recommended), it lives in initiatives-cli.cjs and reuses `loadInitiatives + matchByRepo + formatInitiativeForPlanner`. Subcommand routing already handled by 05-01's `cmdInitiativesRoute`. Add a `format-for-planner` case branch.
- **Planner placeholder semantics:** `{INITIATIVES}` is replaced verbatim by bash variable expansion in the workflow's heredoc. Keep the placeholder name simple; mirror `{CROSS_REPO}`.
</gotchas>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Create /devflow:initiatives skill + format-for-planner subcommand</name>
  <files>
plugins/devflow/skills/initiatives/SKILL.md
plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs
  </files>
  <action>
Step 1: Create `plugins/devflow/skills/initiatives/SKILL.md`:

```markdown
---
name: initiatives
description: |
  Manage strategic initiative context — sync GitHub Epics into a planner-readable disk projection at ~/.claude/devflow/initiatives/, list cached initiatives, or show a single initiative's body. Initiatives are read by /df:plan-objective at plan time so the planner sees Why + Open questions + Linked sub-issues.
  Use when the user wants to refresh initiative context from GitHub, audit what initiatives the planner can see, or inspect a specific initiative file.
  Triggers on: "sync initiatives", "refresh initiatives", "show initiative", "list initiatives", "what initiatives are loaded", "initiative context".
argument-hint: "[sync [--initiative <slug>] [--project-id <id>] [--force]] | [list [--home <path>]] | [show <slug>]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Three modes (parsed from $ARGUMENTS):

- `sync` — refresh `~/.claude/devflow/initiatives/<slug>.md` from the org Product Roadmap project. Walks GitHub via obj 1's resolveChain + obj 2's walkProject; hard-fails on missing gh auth. Optional `--initiative <slug>` syncs ONE; `--force` bypasses stale-file confirmation prompts.
- `list` — read-only enumeration of cached initiatives. Emits JSON array of {slug, github_issue, key_repos, updated_at}.
- `show <slug>` — read-only detail. Emits the rendered initiative body (Why, Open Questions, Linked Sub-issues).

Initiative files have a locked schema: YAML frontmatter (slug, github_issue, parent_project, key_repos[], updated_at) + body sections (## Why / ## Open Questions / ## Linked Sub-issues / ## Status). The planner reads matching initiatives at plan time and includes them in `<additional_context>` advisory.
</objective>

<execution_context>
@~/.claude/devflow/initiatives/
</execution_context>

<process>
**Run the initiatives CLI with arg passthrough:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs initiatives $ARGUMENTS
```

The CLI:

1. Parses subcommand + flags.
2. For `sync`: calls `requireGhAuth(['project', 'read:project', 'repo'])`. On failure, emits structured JSON to stderr + exit 1 with `gh auth refresh -h github.com -s ...` remediation.
3. Walks the org Product Roadmap project; qualifies items per CONTEXT.md decision #5 (sub_issues > 0 OR `[Epic]` title prefix OR draft+In Progress).
4. Writes one file per qualifying item to `~/.claude/devflow/initiatives/<slug>.md` (atomic tmp + rename).
5. Detects stale files (issue CLOSED + not in fresh items); without `--force`, prompts per stale file via TTY readline; with `--force`, deletes unconditionally. Non-TTY environments skip with warning.

For `list` / `show`: file-only, never calls gh, never blocks.

**After the command runs, present the output to the user.** For `sync`, summarize: N written, N deleted, N skipped, N warnings. For `list`, render slug + github_issue. For `show`, print the body verbatim.
</process>

<context>
The initiatives home is `~/.claude/devflow/initiatives/<slug>.md` — global, not per-repo. Single source of truth for every devflow session. Edit by hand if needed; the next `sync` will overwrite (one-way disk → GitHub deferred to v1.2).

Subcommand reference:

- `df-tools initiatives sync [--initiative <slug>] [--project-id <id>] [--force]` — Walk org Product Roadmap, write/refresh initiative files. Hard-fails on missing gh auth.
- `df-tools initiatives list [--home <path>]` — Enumerate cached initiatives. Emits JSON array.
- `df-tools initiatives show <slug> [--home <path>]` — Render single initiative body to stdout.

Flags:

- `--initiative <slug>` — sync mode only; restrict to one initiative; skips stale-deletion.
- `--project-id <id>` — override default org Product Roadmap project ID.
- `--force` — sync mode only; bypass confirmation for stale-file deletion.
- `--home <path>` — override default `~/.claude/devflow/initiatives/`. Useful for testing or alternate org configurations.
- `--raw` — sync/list/show: emit raw JSON to stdout instead of formatted output.

The planner (/df:plan-objective) consumes initiative context automatically at plan time. No user invocation needed for plan-time integration — but `sync` should be re-run periodically (weekly cadence recommended) to keep the projection fresh.
</context>
```

Step 2: Add `format-for-planner` subcommand to `initiatives-cli.cjs`:

```js
function cmdInitiativesFormatForPlanner(cwd, args) {
  const { flags } = _parseFlags(args);
  const repo = flags.repo;
  if (!repo) {
    process.stderr.write(JSON.stringify({ error: 'Usage: initiatives format-for-planner --repo <github_repo>' }) + '\n');
    process.exit(1);
    return;
  }
  const home = flags.home || init.defaultInitiativesHome();
  const initiatives = init.loadInitiatives({ home });
  const matching = init.matchByRepo(initiatives, repo);
  if (matching.length === 0) {
    process.stdout.write('_(no matching initiatives for this repo)_\n');
    process.exit(0);
    return;
  }
  const blocks = matching.map(i => init.formatInitiativeForPlanner(i));
  process.stdout.write(blocks.join('\n\n---\n\n') + '\n');
  process.exit(0);
}

// Add to cmdInitiativesRoute:
case 'format-for-planner': return cmdInitiativesFormatForPlanner(cwd, args.slice(1));
```

Step 3: Add tests to `initiatives-cli.test.cjs` covering format-for-planner:

```js
test('CLI4-1: format-for-planner emits matching initiatives joined by ---', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [
      { slug: 'devflow-coord', key_repos: ['AO-Cyber-Systems/devflow-claude'] },
      { slug: 'eden-launch', key_repos: ['AO-Cyber-Systems/eden-biz'] },
    ],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'format-for-planner', '--repo', 'AO-Cyber-Systems/devflow-claude', '--home', home], { encoding: 'utf-8' });
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.includes('devflow-coord'));
  assert.ok(!r.stdout.includes('eden-launch'));
  fs.rmSync(home, { recursive: true, force: true });
});

test('CLI4-2: format-for-planner emits placeholder when no matches', () => {
  const home = mkTmp();
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'format-for-planner', '--repo', 'AO-Cyber-Systems/devflow', '--home', home], { encoding: 'utf-8' });
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.includes('_(no matching initiatives'));
  fs.rmSync(home, { recursive: true, force: true });
});

test('CLI4-3: format-for-planner without --repo errors', () => {
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'format-for-planner'], { encoding: 'utf-8' });
  assert.strictEqual(r.status, 1);
  const errJson = JSON.parse(r.stderr);
  assert.ok(errJson.error.includes('--repo'));
});
```

Run tests; commit: `feat(05-04): add /devflow:initiatives skill + format-for-planner CLI`

# CRITICAL: SKILL.md frontmatter must include `name`, `description`, `argument-hint`, `allowed-tools`. The plugin loader rejects files missing these.
# GOTCHA: `@~/.claude/devflow/initiatives/` in execution_context is the live mirror; don't reference plugin source at `${CLAUDE_PLUGIN_ROOT}/...`.
# PATTERN: `format-for-planner` is the bridge between bash workflow and JS formatting logic. Keeps formatting deterministic and unit-testable.
  </action>
  <verify>
ls plugins/devflow/skills/initiatives/SKILL.md
node ~/.claude/devflow/bin/df-tools.cjs initiatives format-for-planner --repo AO-Cyber-Systems/devflow-claude --home /tmp/empty 2>&1
# Expected: "_(no matching initiatives for this repo)_"
cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test 2>&1 | tail -10
# Expected: 3 new CLI4 tests pass; no regressions.
  </verify>
  <done>
- `plugins/devflow/skills/initiatives/SKILL.md` exists with locked frontmatter + objective + process + context sections
- `format-for-planner` subcommand added to initiatives-cli.cjs + dispatched in router
- 3 CLI4 tests pass
- Single feat commit lands: `feat(05-04): add /devflow:initiatives skill + format-for-planner CLI`
- SC-6 sync side closed (skill exists; subcommands wired)
  </done>
  <recovery>
If skill loading fails (`/devflow:initiatives` not surfaced): inspect plugin manifest to ensure skills directory is read; SKILL.md frontmatter must parse cleanly. Check `node -e "require('./plugins/devflow/.claude-plugin/plugin.json')"` for syntax issues.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Extend plan-objective workflow + planner agent with INITIATIVES block</name>
  <files>
plugins/devflow/devflow/workflows/plan-objective.md
plugins/devflow/agents/planner.md
  </files>
  <action>
Step 1: Edit `plugins/devflow/devflow/workflows/plan-objective.md` Step 8 (the section that already extracts CROSS_REPO from CONTEXT.md). Insert a new block AFTER the CROSS_REPO extraction:

```bash
# Extract initiative context for current repo (TRD 05-04)
# Plan-time read is file-only — never calls gh. df-tools initiatives format-for-planner
# loads from ~/.claude/devflow/initiatives/, filters by PROJECT.md::github_repo,
# returns formatted markdown bounded by MAX_FORMATTED_PLANNER_CHARS per initiative.
PROJECT_GITHUB_REPO=""
if [[ -f .planning/PROJECT.md ]]; then
  PROJECT_GITHUB_REPO=$(awk '/^github_repo:/ { print $2; exit }' .planning/PROJECT.md | tr -d '"')
fi
INITIATIVES=""
if [[ -n "$PROJECT_GITHUB_REPO" ]]; then
  INITIATIVES=$(node ~/.claude/devflow/bin/df-tools.cjs initiatives format-for-planner --repo "$PROJECT_GITHUB_REPO" 2>/dev/null || echo "")
fi
if [[ -z "$INITIATIVES" ]]; then
  INITIATIVES="_(none — initiatives not synced or no matches for this repo. Run /devflow:initiatives sync to refresh.)_"
fi
```

Step 2: Update the planner prompt heredoc later in plan-objective.md to include INITIATIVES alongside CROSS_REPO:

```markdown
<additional_context>
**Cross-Repo Considerations (from CONTEXT.md, advisory):**

{CROSS_REPO}

**Active Initiatives (from ~/.claude/devflow/initiatives/, advisory):**

{INITIATIVES}
</additional_context>
```

Replace the `{INITIATIVES}` placeholder via bash heredoc variable expansion (mirror existing CROSS_REPO mechanism).

Step 3: Edit `plugins/devflow/agents/planner.md`. Find the `<user_preferences>` section that already documents three advisory biases (added by TRD 03-06). Add a 4th bias:

```markdown
4. **Active Initiatives**: when an initiative's Why or Open Questions overlap with the current objective, prefer alignment with the initiative's stated direction. Cross-reference initiative GitHub issue refs in TRD frontmatter where applicable. Treat as ADVISORY — locked decisions in CONTEXT.md override.
```

Step 4: (Optional, executor discretion) Edit `plugins/devflow/devflow/workflows/research-objective.md` to surface initiatives during research as well. If executor judges value: add the same INITIATIVES extraction block to research-objective and pass to objective-researcher prompt's `<additional_context>`. If executor judges low value (research is more about technical patterns than strategic context), SKIP and note in 05-04 SUMMARY.

# CRITICAL: PROJECT_GITHUB_REPO extraction must handle both quoted (`"AO-Cyber-Systems/devflow-claude"`) and unquoted forms. The `tr -d '"'` strips quotes.
# GOTCHA: 2>/dev/null on the df-tools call swallows errors. This is INTENTIONAL — initiative read MUST NOT block planning. Errors fall through to placeholder.
# PATTERN: Mirror the CROSS_REPO bash + heredoc pattern from TRD 03-06 exactly. Same placeholder substitution mechanism.
  </action>
  <verify>
# Smoke test — should not error even with empty initiatives home
cd /Users/markemerson/Source/devflow-claude-v1.1 && node ~/.claude/devflow/bin/df-tools.cjs initiatives format-for-planner --repo AO-Cyber-Systems/devflow-claude 2>&1 | head -5
# Expected: "_(no matching initiatives for this repo)_" (until 05-02 + sync runs against live data)
grep -A 5 "INITIATIVES" plugins/devflow/devflow/workflows/plan-objective.md | head -20
# Expected: shows the new bash block + heredoc placeholder
grep "Active Initiatives" plugins/devflow/agents/planner.md
# Expected: shows the new advisory bias entry
cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test 2>&1 | tail -5
# Expected: no test regressions (this TRD doesn't add tests; it edits markdown)
  </verify>
  <done>
- plan-objective.md Step 8 extracts INITIATIVES alongside CROSS_REPO
- planner prompt heredoc includes `{INITIATIVES}` placeholder
- planner.md `<user_preferences>` extended with Active Initiatives advisory bias (4th entry)
- (Optional) research-objective.md may also be extended; SUMMARY documents the decision
- Single feat commit lands: `feat(05-04): wire INITIATIVES into plan-objective workflow + planner agent`
- SC-5 closed (planner integration with file-only initiative read)
  </done>
  <recovery>
If awk extraction of github_repo doesn't work (e.g., comment after value): widen the regex. The locked frontmatter format keeps `github_repo: AO-Cyber-Systems/devflow-claude` on its own line; if PROJECT.md formats differ, surface in 05-04 SUMMARY for handling in 05-05 dogfood test.
If heredoc variable substitution fails (unescaped {INITIATIVES} renders literally): check the heredoc delimiter — `cat <<EOF` (not `cat <<'EOF'`) allows substitution. The existing CROSS_REPO substitution proves the pattern works.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test</test>
</validation_gates>

<verification>
1. **Skill file present:** `plugins/devflow/skills/initiatives/SKILL.md` exists with locked frontmatter (name, description, argument-hint, allowed-tools).
2. **CLI subcommands:** `df-tools initiatives sync|list|show|format-for-planner` all dispatched via `cmdInitiativesRoute`.
3. **Plan-objective integration:** Step 8 reads `PROJECT.md::github_repo`, calls `df-tools initiatives format-for-planner --repo <ref>`, populates `INITIATIVES` shell var; planner prompt heredoc references `{INITIATIVES}` alongside `{CROSS_REPO}`.
4. **Planner agent prompt:** `<user_preferences>` documents the Active Initiatives advisory bias.
5. **Graceful empty:** when initiatives home is missing OR no matches for this repo: placeholder rendered, planning continues.
6. **No gh calls in plan-time path:** `df-tools initiatives format-for-planner` reads only home dir; never invokes gh.
</verification>

<success_criteria>
- [ ] `/devflow:initiatives` SKILL.md exists with locked frontmatter
- [ ] `format-for-planner` CLI subcommand added (3 new tests pass)
- [ ] plan-objective.md Step 8 extracts INITIATIVES via bash + df-tools
- [ ] Planner prompt heredoc references `{INITIATIVES}` placeholder
- [ ] planner.md `<user_preferences>` lists Active Initiatives advisory bias
- [ ] (Optional) research-objective.md extended OR explicit skip documented
- [ ] No test regressions
- [ ] 2 commits land: `feat(05-04): add /devflow:initiatives skill + format-for-planner CLI` + `feat(05-04): wire INITIATIVES into plan-objective workflow + planner agent`
- [ ] SC-5 closed (planner integration); SC-6 closed (skill + sync side wiring)
</success_criteria>

<output>
After completion, create `.planning/objectives/05-initiative-context-layer/05-04-SUMMARY.md` documenting:
- SKILL.md created at correct path
- format-for-planner subcommand added
- plan-objective.md + planner.md edits (with anchor diff hashes for traceability)
- Decision on research-objective.md (extend vs skip + reason)
- Where 05-05 picks up (export lock + integration tests + token-budget assertion)
</output>
