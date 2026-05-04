# TRD 01-08: Skill Update + Docs

type: docs
status: pending

## Changes

1. `plugins/devflow/skills/handoff/SKILL.md`:
   - Document watcher-on flow vs watcher-off flow
   - Watcher-on: write pending record via df-tools handoff create, do NOT instruct user paste, continue with other work, expect result on next turn
   - Watcher-off: existing instruct-user-to-paste flow

2. `plugins/devflow/hooks/gate-interactive.js` JSDoc block: explain dual-mode behaviour

3. `docs/USER-GUIDE.md` (or new `docs/handoff-watcher-guide.md`): how to start/stop the daemon, what the allowlist does, how to add patterns

4. `hooks.json`: register `route-results.js` under UserPromptSubmit

5. `.gitignore`: covers `~/.devflow/` (user home) — actually that's outside the repo, no change. The project-local `.devflow-handoff/` is already ignored.
