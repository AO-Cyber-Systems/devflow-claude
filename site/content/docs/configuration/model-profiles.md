---
title: "Model profiles"
weight: 20
lede: "Three profiles map every agent onto a model tier. What each costs, and why budget isn't Haiku everywhere."
---

## Switching profile

```text
/devflow:set-profile quality
/devflow:set-profile balanced
/devflow:set-profile budget
```

Or for one run only, without changing any files:

```text
/devflow:build 4 --model budget
```

## The assignment table

Generated from `references/model-profiles.json`:

{{< agents >}}

The assignment is not uniform, and that is the point. Under `budget`, `planner`
still drops only to Sonnet while `codebase-mapper` drops to Haiku — a bad plan
costs a whole build, a slightly worse codebase map costs a re-read.

## Tier → model

| Tier | Model |
|---|---|
| `opus` | `claude-opus-5` |
| `sonnet` | `claude-sonnet-5` |
| `haiku` | `claude-haiku-4-5` |

## How resolution works

```bash
df-tools resolve-model planner
df-tools resolve-model df-planner    # the df- prefix is accepted too
```

`resolve-model` emits a `Task()` model **alias**, not a model id. The `opus` tier
resolves to `inherit`, which means the agent keeps whatever model the session is
running — it does not pin Opus. That is deliberate: if you are driving a session on
a particular model, agents at the top tier should follow you rather than override
you.

{{< callout title="Two maps, different consumers" >}}
`model-profiles.json` holds two maps and they are consumed by different code:

- **`models{}`** — tier to concrete API model id. This one is *live*:
  `flutter-ui-eval.cjs` sends it to the Messages API for the vision judge. A stale
  id here is a real runtime defect, not a documentation slip.
- **`agents{}`** — agent to tier per profile. Consumed by `resolve-model`.

Keep both current when models ship.
{{< /callout >}}

## Effort is not set here

`Task()` takes no effort argument, so reasoning effort lives in each agent's own
frontmatter rather than in the profile table.

```yaml
---
name: executor
effort: xhigh
---
```

{{< callout title="Haiku rejects effort" type="warn" >}}
Haiku 4.5 rejects the `effort` parameter entirely. An agent that can resolve to
Haiku under the budget profile must not declare `effort`.
{{< /callout >}}

## Choosing a profile

**`quality`** — `planner`, `executor`, both researchers, `debugger`,
`security-auditor` and `ui-evaluator` on Opus. Use it for work where being wrong is
expensive: architecture, security, anything touching money or auth.

**`balanced`** — the default. `planner` stays on Opus because plan quality
propagates into everything downstream; execution and verification drop to Sonnet.

**`budget`** — nothing on Opus. Research and mapping drop to Haiku. Appropriate for
prototypes, spikes and well-understood mechanical work.

## Per-objective override

The [intent model](/docs/concepts/intent-model/) sets `model_profile` per
`(kind, work)` cell, so a spike automatically runs on `budget` even when your
project default is `quality`. Override it explicitly on `OBJECTIVE.md`:

```yaml
---
work: prototype
overrides:
  model_profile: balanced
---
```

Or via the environment for a single invocation:

```bash
DEVFLOW_MODEL_PROFILE=budget claude
```
