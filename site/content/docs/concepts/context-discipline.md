---
title: "Context discipline"
weight: 70
lede: "Measured guidance on keeping an agent's window small. The lever is behaviour, not configuration."
---

DevFlow's context guidance comes from an audit of roughly 93 million tokens of
real message blocks. The figures below are measured, not estimated.

## Where the window actually goes

| Component | Share | Who produces it |
|---|---|---|
| Tool results (text) | 59.3% | the environment, read back in |
| **Tool-call inputs** | **33.8%** | **the agent** — file bodies, heredocs, patches |
| Assistant text | 5.5% | prose to the user |
| Images | 1.5% | screenshots |

Two tools account for 94% of tool-result tokens:

| Tool | Calls | Share | Avg per call |
|---|---|---|---|
| `Read` | 12,150 | 49.9% | 2,311 tokens |
| `Bash` | 84,505 | 43.9% | 292 tokens |

`Bash` served **seven times more calls for less total context** — roughly eight
times leaner per call. And there is no long tail to chase: p50 is 100 tokens, p90
1,110, p99 5,987, and the largest single result observed was 26K.

The pressure is not outliers. It is the steady drip of whole-file reads, and of
whole files written back into tool arguments.

## Rule 1 — locate first, then read narrowly

`Read` pulls an entire file. Most reads are reconnaissance a search would have
answered for a tenth of the cost.

```text
# instead of
Read(file_path="/repo/internal/handler/user.go")            # 3,400 tokens

# do
Bash("rg -n 'func HandleLogin' internal/handler/user.go")   # ~40 tokens
Read(file_path="/repo/internal/handler/user.go", offset=210, limit=60)
```

- Locate with `rg -n` or `Grep`. Get the line number.
- Read with `offset`/`limit` — a window, not the file.
- Read whole files only when about to rewrite them, or when they are genuinely
  small (under ~100 lines).
- Never re-read a file already in context and unchanged.

## Rule 2 — do not write whole files into tool arguments

A third of the window is text the agent writes *into* tool calls. A full-file
`Write`, or a `cat > file <<'EOF'` heredoc, puts the entire body in context
permanently — for the rest of the session.

- Prefer a targeted `Edit`. A three-line change should cost three lines.
- `Write` is for new files, not for editing existing ones.
- When a whole file genuinely must be generated, write it to the scratchpad and
  move it rather than passing the body through a tool argument twice.

{{< callout title="A gate caused this once" type="warn" >}}
This regressed historically. When the edit gate denied `Edit`, agents fell back to
`cat > file <<'EOF'` with the full body inline — 331 confirmed instances. A
three-line change became a full-file rewrite in context. The gate was fixed so
`Edit` is available inside an active skill; use it.
{{< /callout >}}

## Rule 3 — let the automatic mechanisms work

Microcompaction and deferred tool loading are the built-in answer to context
pressure, and they run on their own.

`/clear` and `/compact` are manual, lossy, and land at the worst moment — you
reach for them when you are already deep in a task. Read narrowly from the start
instead.

The exception is DevFlow's own rhythm: `/clear` **between** major commands is
safe and encouraged, because [state lives on disk](/docs/concepts/state/).

## Policy: leave the caps alone

Stated deliberately rather than inherited as defaults:

- **Do not tighten output caps.** `MAX_MCP_OUTPUT_TOKENS` (25K, warns at 10K) and
  `BASH_MAX_OUTPUT_LENGTH` (50K) are not binding — the largest observed single
  result is 26K and p99 is ~6K. Tightening buys nothing and breaks legitimate
  large results.
- **Leave `ENABLE_TOOL_SEARCH` on its default** so MCP tool schemas stay deferred
  and out of the window.

## Measuring it yourself

```bash
df-tools context --limit 150
```

Recomputes the whole composition from your own session transcripts.

{{< callout title="How images are priced" >}}
`df-tools context` prices images per block at roughly 1,500 tokens, **not** by
base64 length. Counting base64 characters overstates image cost by about 25× — it
was the one real error in the original audit.
{{< /callout >}}

## Related telemetry

```bash
df-tools session-audit --limit 150   # blocking-event classification
df-tools telemetry                   # status-facing view with advisories
df-tools transcript-export           # compact per-session index before retention deletes transcripts
```

See [telemetry and auditing](/docs/guides/telemetry/).
