---
title: "Telemetry and auditing"
weight: 50
lede: "Measuring where context goes, where agents get blocked, and whether gates are earning their friction."
---

Everything here is local. It reads your own session transcripts on your own machine
and writes to your own filesystem. Nothing is transmitted.

## Context composition

```bash
df-tools context --limit 150
df-tools context --root /path/to/projects --raw
```

Recomputes where the context window actually goes, from your own transcripts: tool
results versus tool-call inputs versus assistant text versus images, plus per-tool
call counts and averages.

{{< callout title="Images are priced per block" >}}
`df-tools context` prices images at roughly 1,500 tokens per block rather than by
base64 length. Counting base64 characters overstates image cost by about 25× —
that was the one real error in the original context audit.
{{< /callout >}}

See [context discipline](/docs/concepts/context-discipline/) for what to do with
the numbers.

## Session audit

```bash
df-tools session-audit --limit 150
df-tools session-audit --since 2026-08-01
```

Classifies blocking events across sessions: where agents got stuck, what stopped
them, and how often. This is the acceptance test for the gate-correctness and
model-tier work — "this gate false-positives" is either in this output or it is an
anecdote.

## Telemetry view

```bash
df-tools telemetry
df-tools telemetry --scan --limit 150
```

One status-facing view with advisories, combining planning state with session
analysis. `--scan` includes a fresh session audit rather than cached data.

## Transcript export

```bash
df-tools transcript-export
df-tools transcript-export --out ~/devflow-index.jsonl --full ~/transcript-archive --limit 500
```

Writes a compact per-session index before retention deletes the underlying
transcripts. Default output is `~/.claude/devflow/transcript-index.jsonl`.

Run it periodically if you care about longitudinal measurement — transcripts age
out, and the index is what survives.

## Override log

```bash
df-tools override --gate gate-edits --reason "hand-fixing a generated file"
df-tools override --list --limit 20
```

Structured, logged gate overrides. The point is not bureaucracy — a gate that is
overridden constantly is a gate that is wrong, and this log is the evidence that
makes the case instead of an argument about it.

## The audit log

The `verify-completion` Stop hook emits a JSONL entry per completion to
`~/.claude/devflow/audit.log`, or to `DEVFLOW_AUDIT_LOG_PATH` if set. It is
best-effort and never blocks the Stop event.

## Benchmarks and duplication

```bash
df-tools benchmark          # timing across recorded runs
df-tools dup-detect         # duplicated planning artifacts
df-tools survey decimal-objectives --root <path>
```
