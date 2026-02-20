<planning_config>

Configuration options for `.planning/` directory behavior.

<config_schema>
```json
"planning": {
  "commit_docs": true,
  "search_gitignored": false
},
"git": {
  "branching_strategy": "none",
  "objective_branch_template": "df/objective-{objective}-{slug}",
  "milestone_branch_template": "gsd/{milestone}-{slug}"
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `commit_docs` | `true` | Whether to commit planning artifacts to git |
| `search_gitignored` | `false` | Add `--no-ignore` to broad rg searches |
| `git.branching_strategy` | `"none"` | Git branching approach: `"none"`, `"objective"`, or `"milestone"` |
| `git.objective_branch_template` | `"df/objective-{objective}-{slug}"` | Branch template for objective strategy |
| `git.milestone_branch_template` | `"gsd/{milestone}-{slug}"` | Branch template for milestone strategy |
</config_schema>

<commit_docs_behavior>

**When `commit_docs: true` (default):**
- Planning files committed normally
- SUMMARY.md, STATE.md, ROADMAP.md tracked in git
- Full history of planning decisions preserved

**When `commit_docs: false`:**
- Skip all `git add`/`git commit` for `.planning/` files
- User must add `.planning/` to `.gitignore`
- Useful for: OSS contributions, client projects, keeping planning private

**Using df-tools.cjs (preferred):**

```bash
# Commit with automatic commit_docs + gitignore checks:
node ~/.claude/devflow/bin/df-tools.cjs commit "docs: update state" --files .planning/STATE.md

# Load config via state load (returns JSON):
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs state load)
# commit_docs is available in the JSON output

# Or use init commands which include commit_docs:
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init execute-objective "1")
# commit_docs is included in all init command outputs
```

**Auto-detection:** If `.planning/` is gitignored, `commit_docs` is automatically `false` regardless of config.json. This prevents git errors when users have `.planning/` in `.gitignore`.

**Commit via CLI (handles checks automatically):**

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs: update state" --files .planning/STATE.md
```

The CLI checks `commit_docs` config and gitignore status internally — no manual conditionals needed.

</commit_docs_behavior>

<search_behavior>

**When `search_gitignored: false` (default):**
- Standard rg behavior (respects .gitignore)
- Direct path searches work: `rg "pattern" .planning/` finds files
- Broad searches skip gitignored: `rg "pattern"` skips `.planning/`

**When `search_gitignored: true`:**
- Add `--no-ignore` to broad rg searches that should include `.planning/`
- Only needed when searching entire repo and expecting `.planning/` matches

**Note:** Most DevFlow operations use direct file reads or explicit paths, which work regardless of gitignore status.

</search_behavior>

<setup_uncommitted_mode>

To use uncommitted mode:

1. **Set config:**
   ```json
   "planning": {
     "commit_docs": false,
     "search_gitignored": true
   }
   ```

2. **Add to .gitignore:**
   ```
   .planning/
   ```

3. **Existing tracked files:** If `.planning/` was previously tracked:
   ```bash
   git rm -r --cached .planning/
   git commit -m "chore: stop tracking planning docs"
   ```

4. **Branch merges:** When using `branching_strategy: objective` or `milestone`, the `complete-milestone` workflow automatically strips `.planning/` files from staging before merge commits when `commit_docs: false`.

</setup_uncommitted_mode>

<branching_strategy_behavior>

**Branching Strategies:**

| Strategy | When branch created | Branch scope | Merge point |
|----------|---------------------|--------------|-------------|
| `none` | Never | N/A | N/A |
| `objective` | At `execute-objective` start | Single objective | User merges after objective |
| `milestone` | At first `execute-objective` of milestone | Entire milestone | At `complete-milestone` |

**When `git.branching_strategy: "none"` (default):**
- All work commits to current branch
- Standard DevFlow behavior

**When `git.branching_strategy: "objective"`:**
- `execute-objective` creates/switches to a branch before execution
- Branch name from `objective_branch_template` (e.g., `df/phase-03-authentication`)
- All plan commits go to that branch
- User merges branches manually after objective completion
- `complete-milestone` offers to merge all objective branches

**When `git.branching_strategy: "milestone"`:**
- First `execute-objective` of milestone creates the milestone branch
- Branch name from `milestone_branch_template` (e.g., `gsd/v1.0-mvp`)
- All objectives in milestone commit to same branch
- `complete-milestone` offers to merge milestone branch to main

**Template variables:**

| Variable | Available in | Description |
|----------|--------------|-------------|
| `{objective}` | objective_branch_template | Zero-padded objective number (e.g., "03") |
| `{slug}` | Both | Lowercase, hyphenated name |
| `{milestone}` | milestone_branch_template | Milestone version (e.g., "v1.0") |

**Checking the config:**

Use `init execute-objective` which returns all config as JSON:
```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init execute-objective "1")
# JSON output includes: branching_strategy, objective_branch_template, milestone_branch_template
```

Or use `state load` for the config values:
```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs state load)
# Parse branching_strategy, objective_branch_template, milestone_branch_template from JSON
```

**Branch creation:**

```bash
# For objective strategy
if [ "$BRANCHING_STRATEGY" = "objective" ]; then
  OBJECTIVE_SLUG=$(echo "$OBJECTIVE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  BRANCH_NAME=$(echo "$OBJECTIVE_BRANCH_TEMPLATE" | sed "s/{objective}/$PADDED_OBJECTIVE/g" | sed "s/{slug}/$OBJECTIVE_SLUG/g")
  git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
fi

# For milestone strategy
if [ "$BRANCHING_STRATEGY" = "milestone" ]; then
  MILESTONE_SLUG=$(echo "$MILESTONE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  BRANCH_NAME=$(echo "$MILESTONE_BRANCH_TEMPLATE" | sed "s/{milestone}/$MILESTONE_VERSION/g" | sed "s/{slug}/$MILESTONE_SLUG/g")
  git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
fi
```

**Merge options at complete-milestone:**

| Option | Git command | Result |
|--------|-------------|--------|
| Squash merge (recommended) | `git merge --squash` | Single clean commit per branch |
| Merge with history | `git merge --no-ff` | Preserves all individual commits |
| Delete without merging | `git branch -D` | Discard branch work |
| Keep branches | (none) | Manual handling later |

Squash merge is recommended — keeps main branch history clean while preserving the full development history in the branch (until deleted).

**Use cases:**

| Strategy | Best for |
|----------|----------|
| `none` | Solo development, simple projects |
| `objective` | Code review per objective, granular rollback, team collaboration |
| `milestone` | Release branches, staging environments, PR per version |

</branching_strategy_behavior>

<workstreams_config>

## Workstreams Configuration

Parallel feature development using git worktrees. Independent objectives execute simultaneously in separate worktrees, each with their own Claude session.

<config_schema_workstreams>
```json
"workstreams": {
  "worktree_prefix": "../{project}-ws-",
  "branch_prefix": "df/ws-",
  "merge_strategy": "squash"
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `worktree_prefix` | `"../{project}-ws-"` | Path prefix for worktree directories. `{project}` replaced with current dir name |
| `branch_prefix` | `"df/ws-"` | Git branch prefix for workstream branches |
| `merge_strategy` | `"squash"` | How to merge branches: `"squash"` (single commit) or `"merge"` (preserve history) |
</config_schema_workstreams>

**When to use workstreams:**
- ROADMAP.md has non-linear dependencies (e.g., Objective 2 and 3 both depend on Objective 1)
- Independent features don't share files or APIs
- You want to develop features in parallel sessions

**Workflow:**
1. `/df:workstreams setup` — Analyze deps, create git worktrees
2. Open terminals in each worktree, run normal DevFlow commands
3. `/df:workstreams status` — Check progress across workstreams
4. `/df:workstreams merge` — Squash-merge branches, reconcile state

**Key files:**
- `.planning/workstreams.json` — Active workstream tracking (main worktree)
- `.planning/workstream-marker.json` — Worktree identity marker (per worktree)

**Merge strategies:**

| Strategy | Git command | Result |
|----------|-------------|--------|
| `squash` (default) | `git merge --squash` | Single clean commit per workstream |
| `merge` | `git merge --no-ff` | Preserves full commit history |

</workstreams_config>

</planning_config>
