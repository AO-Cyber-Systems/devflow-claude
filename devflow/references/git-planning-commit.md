# Git Planning Commit

Commit planning artifacts using the df-tools CLI, which automatically checks `commit_docs` config and gitignore status.

## Commit via CLI

Always use `df-tools.cjs commit` for `.planning/` files — it handles `commit_docs` and gitignore checks automatically:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs({scope}): {description}" --files .planning/STATE.md .planning/ROADMAP.md
```

The CLI will return `skipped` (with reason) if `commit_docs` is `false` or `.planning/` is gitignored. No manual conditional checks needed.

## Amend previous commit

To fold `.planning/` file changes into the previous commit:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "" --files .planning/codebase/*.md --amend
```

## Commit Message Patterns

| Command | Scope | Example |
|---------|-------|---------|
| plan-objective | objective | `docs(phase-03): create authentication plans` |
| execute-objective | objective | `docs(phase-03): complete authentication objective` |
| new-milestone | milestone | `docs: start milestone v1.1` |
| remove-objective | chore | `chore: remove objective 17 (dashboard)` |
| insert-objective | objective | `docs: insert objective 16.1 (critical fix)` |
| add-objective | objective | `docs: add objective 07 (settings page)` |

## When to Skip

- `commit_docs: false` in config
- `.planning/` is gitignored
- No changes to commit (check with `git status --porcelain .planning/`)
