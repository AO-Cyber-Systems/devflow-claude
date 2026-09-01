---
title: "Settings"
weight: 60
lede: "Changing which agents run, which models they use, and how much the workflow asks you."
---

{{< commands group="settings,set-profile" >}}

Both are user-typed only — Claude cannot fire them, because they rewrite
`config.json` and change cost characteristics for everything downstream.

## /devflow:set-profile

```text
/devflow:set-profile quality
/devflow:set-profile balanced
/devflow:set-profile budget
```

Switches the model tier for every agent at once. The mapping is not uniform — each
agent has its own per-profile assignment, so `budget` does not simply mean "Haiku
everywhere":

{{< agents >}}

See [model profiles](/docs/configuration/model-profiles/) for how resolution works
and why some agents stay on a larger model even in budget.

## /devflow:settings

```text
/devflow:settings
```

Interactive configuration of `.planning/config.json`: which workflow agents run,
which gates prompt, parallelism, and safety toggles.

The two settings that change cost most:

```json
{
  "workflow": {
    "research": true,      // objective-researcher — turn off on familiar ground
    "job_check": true,     // job-checker — turn off when plans are reliably good
    "verifier": true       // keep this on
  }
}
```

Turning off `research` and `job_check` on a domain you know well is a real saving.
Turning off `verifier` is usually a mistake — it is the only thing checking that
what got built achieves the goal rather than merely completing the tasks.

Full schema at [config.json reference](/docs/configuration/config-json/).
