# TRD 01-02: Allowlist Validation

type: tdd
status: pending

## Behaviour list

1. `defaultAllowlist()` returns the curated interactive + shell-flow patterns.
2. `validateCommand(cmd, allowlist)` returns `{ ok: true, matched: '<pattern label>' }` for each curated pattern.
3. `validateCommand(cmd, allowlist)` returns `{ ok: false, reason: '...' }` for an arbitrary command.
4. Rejects empty / whitespace-only command.
5. Rejects commands > 4096 chars (DoS guard).
6. Rejects commands matching the deny list (sudo, su -, rm -rf /, :(){:|:&};:, curl|bash patterns).
7. Loads user allowlist from `$DEVFLOW_WATCH_ALLOW_FILE` (override), falls back to `~/.devflow/devflow-watch-allow.json`.
8. Merges user allowlist with default; user patterns take effect for `validateCommand`.
9. Malformed user allowlist file → fall back to default with logged warning (return value indicates degraded mode).
10. Shell-flow patterns: `nvm use 18`, `mise use node@20`, `direnv allow`, `conda activate envname`, `pyenv shell 3.11`, `aws sso login` all pass.
11. Interactive patterns from existing list (gh auth login, doctl auth init, etc.) all pass.
12. `gh auth login --with-token < f` is allowed (skipIf takes precedence — same semantics as `gate-interactive.js`).

## Fixtures

- `makeAllowlist({ extraPatterns })` builds an allowlist for tests
- `fixtureCommands()` returns `{ allowed: [...], rejected: [...] }` table

## Files

- src: `plugins/devflow/devflow/bin/lib/watcher-allowlist.cjs`
- test: `plugins/devflow/devflow/bin/lib/watcher-allowlist.test.cjs`
