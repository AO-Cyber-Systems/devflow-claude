# TRD 22-01 SUMMARY — init --branch flag

**Status:** DONE 2026-05-06
**Commits:** ad1caf2 (RED) + f013fb6 (GREEN)

## What shipped

- `lib/init.cjs`: `_resolveBranch(args, cwd)` shared helper extracts `--branch=<name>` from args
- All `df-tools init *` commands accept `--branch=<name>` (default: working tree)
- `--branch=current` and `--branch=HEAD` are aliases for default behavior
- Explicit `--branch=<name>` reads `.planning/` state via `git show <name>:.planning/...`
- Removed implicit history walking — missing state on current branch errors with hint mentioning `--branch` flag
- `df-tools.cjs` plumbs `--branch` flag through init dispatch

## Tests: 32 init tests pass (no regressions)
