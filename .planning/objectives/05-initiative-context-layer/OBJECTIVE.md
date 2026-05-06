---
work: feature
---

# Initiative context layer

## Goal

Project GitHub Epics (parent issues + linked org Project items) onto disk at `~/.claude/devflow/initiatives/<slug>.md` so the planner can read **strategic context** at plan time without live gh queries. Each initiative file carries Why / Open questions / Key repos / Linked sub-issues. The planner consults matching initiatives by `key_repos` membership when generating TRDs. `df:initiatives sync` command refreshes the on-disk projection from live GitHub state.

---
*Created: 2026-05-06 (auto-scaffold via bootstrapObjectiveMd)*
