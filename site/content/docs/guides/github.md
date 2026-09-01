---
title: "GitHub integration"
weight: 10
lede: "Mirror planning state to issues, milestones and releases. One-way — planning files stay the source of truth."
---

Opt-in. Disabled by default. Every operation is a no-op when the integration is
off, `gh` is missing, or auth has expired — GitHub failures never block your
workflow.

## Enable

```json
{
  "github": {
    "enabled": true,
    "repo": "owner/name",
    "milestone_prefix": "v",
    "labels": {
      "objective": "devflow:objective",
      "in_progress": "devflow:in-progress",
      "gaps": "devflow:gaps"
    }
  }
}
```

Prerequisites: the `gh` CLI installed and authenticated. If the auth flow needs a
TTY, hand it off with `/devflow:handoff`.

```bash
df-tools gh status     # is the integration reachable?
```

## What syncs, and when

| Trigger | Action | Manual equivalent |
|---|---|---|
| End of `/devflow:new-project` | One milestone per roadmap version, one issue per objective; numbers persisted to `.planning/.gh-mapping.json` | `df-tools gh sync-objectives` |
| Verifier finds gaps | Posts the `gaps:` block from `VERIFICATION.md` as an issue comment | `df-tools gh comment <obj> @file:path` |
| Verification passes | Closes the issue with a link to the verification report | `df-tools gh close-issue <obj>` |
| Tag push `vX.Y.Z` | Release notes generated from `SUMMARY.md` files since the previous tag | `df-tools gh sync-release vX.Y.Z` |
| Manual | Any of the above | `/devflow:gh-sync [objectives\|release <tag>\|status]` |

Additional CLI surface:

```bash
df-tools gh resolve <objectiveId>    # objective → issue number
df-tools gh sync <objectiveId>       # one objective: body + sticky comment + Project v2 fields
df-tools gh pull <objectiveId>       # detect drift from GitHub; --apply to reconcile
```

## The mapping file

`.planning/.gh-mapping.json` is the source of truth for objective-to-issue
correspondence:

```json
{
  "milestone_id": 12,
  "objectives": { "1": 42, "2": 43, "2.1": 44 }
}
```

**Commit it.** Re-running `sync-objectives` is idempotent — existing issues are
edited, not duplicated — but only because this file survives.

## What does not sync

- **Issues created on GitHub do not flow back into `.planning/`.** That would
  break "planning files are truth". File issues normally; they become input to
  `/devflow:plan-objective`.
- **Per-task commits are not posted to issues** — too noisy. Use
  `df-tools gh comment` manually for a mid-execution update.

`df-tools gh pull` is the one concession: it *detects* drift (an objective closed
or relabelled on GitHub) and can reconcile with `--apply`. It is opt-in and
explicit, not automatic.

## Troubleshooting

```bash
df-tools gh status
```

Common "skipped" reasons:

| Message | Fix |
|---|---|
| `github.enabled is false` | set `enabled: true` |
| `gh CLI not installed` | install from cli.github.com |
| `gh not authenticated` | authenticate the `gh` CLI |
| `github.repo must be set as "owner/name"` | fix the format — it is `owner/name`, not a URL |
