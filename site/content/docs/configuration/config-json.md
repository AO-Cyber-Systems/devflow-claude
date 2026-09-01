---
title: "config.json"
weight: 10
lede: "The full workflow configuration schema, field by field, with the defaults DevFlow ships."
---

`.planning/config.json` is created by `/devflow:new-project` and edited by
`/devflow:settings`. You can also edit it directly.

## The shipped defaults

```json
{
  "mode": "yolo",
  "depth": "standard",
  "job_checker_enabled": true,
  "workflow": {
    "research": true,
    "job_check": true,
    "verifier": true,
    "auto_advance": true,
    "verifier_checkpoints": false,
    "decision_queue": false
  },
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "parallelization": {
    "enabled": true,
    "job_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_jobs_for_parallel": 2
  },
  "gates": {
    "confirm_project": true,
    "confirm_objectives": true,
    "confirm_roadmap": true,
    "confirm_breakdown": true,
    "confirm_job": true,
    "execute_next_job": true,
    "issues_review": true,
    "confirm_transition": true,
    "editGate": "strict"
  },
  "safety": {
    "always_confirm_destructive": true,
    "always_confirm_external_services": true
  },
  "workstreams": {
    "worktree_prefix": "../{project}-ws-",
    "branch_prefix": "df/ws-",
    "merge_strategy": "squash"
  },
  "github": {
    "enabled": false,
    "repo": "",
    "milestone_prefix": "v",
    "labels": {
      "objective": "devflow:objective",
      "in_progress": "devflow:in-progress",
      "gaps": "devflow:gaps"
    }
  },
  "awareness": {
    "cache_ttl_minutes": 10,
    "peer_stale_days": 30,
    "branch_patterns": ["feature/*", "df/*", "fix/*", "proposal/*"],
    "org_project_id": "",
    "sibling_repos": [],
    "eden_libs_path": null
  },
  "daemon": {
    "notifications": false,
    "notify_on_start": true,
    "notify_on_complete": true,
    "auto_launch": false,
    "multi_project": false,
    "cross_shell": [],
    "status_line": false
  }
}
```

## Top-level

| Field | Values | Default | Meaning |
|---|---|---|---|
| `mode` | `interactive` / `yolo` / `autonomous` | `yolo` | How checkpoints behave — see below |
| `depth` | `quick` / `standard` / `comprehensive` | `standard` | Default planning depth when the intent model does not override it |
| `job_checker_enabled` | boolean | `true` | Whether plans are reviewed before execution |

### mode

The single most consequential setting.

| Mode | `human-verify` checkpoints | `decision` checkpoints |
|---|---|---|
| `interactive` | present to you | present to you |
| `yolo` | auto-approve | auto-pick the first option |
| `autonomous` | delegated to the verifier, approved **only** on `status: passed` | parked in the decision queue |

`human-action` checkpoints stop in every mode — auth gates cannot be automated.

`autonomous` is stricter than `interactive` on verification: it demands green
machine evidence, where interactive accepts a human saying "looks fine". `yolo` is
legacy convenience and approves without evidence at all.

## workflow

| Field | Default | Effect |
|---|---|---|
| `research` | `true` | Run `objective-researcher` before planning. Turn off on familiar ground — a real saving. |
| `job_check` | `true` | Run `job-checker` on plans before execution. |
| `verifier` | `true` | Run `verifier` after execution. Keep this on. |
| `auto_advance` | `true` | Move to the next job without asking. |
| `verifier_checkpoints` | `false` | Insert checkpoints inside verification. |
| `decision_queue` | `false` | Park `decision` checkpoints instead of blocking. |

## planning

| Field | Default | Effect |
|---|---|---|
| `commit_docs` | `true` | Commit `.planning/` artifacts. Set `false` plus a `.gitignore` entry for sensitive work. |
| `search_gitignored` | `false` | Let agents search gitignored paths. |

## parallelization

| Field | Default | Effect |
|---|---|---|
| `enabled` | `true` | Master switch |
| `job_level` | `true` | Run independent jobs concurrently. The useful one. |
| `task_level` | `false` | Run tasks within a job concurrently. Off — tasks usually share files. |
| `skip_checkpoints` | `true` | Skip checkpoints during parallel waves |
| `max_concurrent_agents` | `3` | Concurrency ceiling. Past three, wall-clock gain flattens while cost climbs. |
| `min_jobs_for_parallel` | `2` | Below this, run serially |

## gates

The `confirm_*` fields all default to `true` and each stops for your approval at
one point in the loop. Turn them off once you trust the loop on a project.

`editGate` is different — it sets the severity of the `gate-edits` hook:

| Value | Behaviour |
|---|---|
| `strict` (default) | Deny ambient edits outside an active skill |
| `warn` | Warn but allow |
| `off` | Disable the gate for this project |

## safety

| Field | Default | Effect |
|---|---|---|
| `always_confirm_destructive` | `true` | Confirm before destructive operations |
| `always_confirm_external_services` | `true` | Confirm before calling external services |

Leave both on. They are the backstop when a plan turns out to be wrong in a way
nothing else caught.

## github

Opt-in, disabled by default. See the
[GitHub integration guide](/docs/guides/github/).

## awareness

| Field | Default | Effect |
|---|---|---|
| `cache_ttl_minutes` | `10` | Awareness cache freshness |
| `peer_stale_days` | `30` | How long a peer branch counts as active |
| `branch_patterns` | `["feature/*", "df/*", "fix/*", "proposal/*"]` | Which branches count as work in flight |
| `org_project_id` | `""` | GitHub Projects v2 node ID for org-wide progress |
| `sibling_repos` | `[]` | Repos to include in cross-repo awareness |

## daemon

Settings for the `devflow-watch` handoff daemon. See the
[handoff guide](/docs/guides/handoff/).

| Field | Default | Effect |
|---|---|---|
| `notifications` | `false` | OS notifications on handoff events |
| `auto_launch` | `false` | Install a launchd/systemd unit |
| `multi_project` | `false` | Watch more than one project |
| `cross_shell` | `[]` | Additional shells to support |
| `status_line` | `false` | Show a daemon indicator in the status line |

## Reading and writing config from the CLI

```bash
df-tools config-get <key>
df-tools config-set <key> <value>
df-tools config-ensure-section <section>

df-tools global-config get <key>     # machine-wide, ~/.claude/devflow/
df-tools global-config set <key> <value>
```
