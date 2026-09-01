---
title: "Integrations and analysis"
weight: 50
lede: "GitHub sync, strategic initiatives, UI evaluation, security auditing and codebase mapping."
---

{{< commands group="gh-sync,initiatives,ui-eval,security-audit,map-codebase" >}}

## /devflow:gh-sync

Pushes planning state to GitHub. One-way: planning files stay authoritative,
GitHub is derivative.

```text
/devflow:gh-sync status              # is the integration reachable?
/devflow:gh-sync objectives          # create/update one issue per objective
/devflow:gh-sync release v2.5.0      # generate release notes from SUMMARY files
/devflow:gh-sync 4                   # push one objective's full state
```

Opt in via `.planning/config.json`:

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

Requires the `gh` CLI, authenticated. Every operation is a no-op when the
integration is disabled, `gh` is missing, or auth expired — failures never block
your workflow. Full detail in the [GitHub integration guide](/docs/guides/github/).

## /devflow:initiatives

Syncs GitHub Epics into local strategic context that the planner reads at plan
time.

```text
/devflow:initiatives sync
/devflow:initiatives sync --initiative payments-v2 --force
/devflow:initiatives list
/devflow:initiatives show payments-v2
```

The point is grounding: an objective planned with the parent initiative in context
makes different trade-offs than one planned in isolation.

## /devflow:ui-eval

Machine-judges the visual correctness of UI states.

```text
/devflow:ui-eval 6
/devflow:ui-eval path/to/manifest.json
```

The `ui-evaluator` agent captures every declared UI surface, scores each through
the offline visual-eval engine, and writes evidence the `verifier` consumes. It is
not "take a screenshot and hope" — the scores are machine-produced and the verifier
gates on them.

See the [UI evaluation guide](/docs/guides/ui-eval/).

## /devflow:security-audit

```text
/devflow:security-audit
/devflow:security-audit src/api
/devflow:security-audit secrets-only
/devflow:security-audit auth-only
/devflow:security-audit deps-only
```

Standalone — works without `.planning/`. Fans out `security-auditor` agents across
three domains (secrets, auth flows, dependency risk) plus code-level OWASP Top 10
checks.

Every finding carries `Confidence: VERIFIED | SUSPECTED`. Only `VERIFIED` findings
are acted on downstream, because an agent that speculates confidently produces
remediation work for imaginary problems.

## /devflow:map-codebase

```text
/devflow:map-codebase
/devflow:map-codebase api
```

Parallel `codebase-mapper` agents analyse stack, architecture, quality and
concerns, writing findings to `.planning/codebase/`. Run this before
`/devflow:new-project` on an existing codebase so the roadmap is grounded in what
exists. Same `VERIFIED` / `SUSPECTED` confidence tagging as the security audit.
