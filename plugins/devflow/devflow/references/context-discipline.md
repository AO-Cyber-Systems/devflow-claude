# Context discipline

How to keep an agent's context window small enough to stay sharp.

> Evidence: Autonomy Blocker Audit, 2026-08-18 — ~93M tokens of message blocks
> across the local corpus. Figures below are measured, not estimated.

## Where the window actually goes

| Component | Share | Who produces it |
|---|---|---|
| Tool results (text) | 59.3% | the environment, read back in |
| **Tool-call inputs** | **33.8%** | **you** — file bodies, heredocs, patches |
| Assistant text | 5.5% | prose to the user |
| Images | 1.5% | screenshots |

Two tools are 94% of tool-result tokens:

| Tool | Calls | Share | Avg per call |
|---|---|---|---|
| `Read` | 12,150 | 49.9% | 2,311 tokens |
| `Bash` | 84,505 | 43.9% | 292 tokens |

`Bash` ran **7× more calls for less total context** — about **8× leaner per
call**. There is no long tail to chase: p50 100, p90 1,110, p99 5,987, largest
single result 26K. Output caps are already holding. The pressure is the steady
drip of whole-file reads, and of whole files written back into tool arguments.

## Rule 1 — locate first, then read narrowly

`Read` pulls an entire file. Most reads are reconnaissance that a search would
have answered in a tenth of the tokens.

- **Locate with `grep`/`rg`** (via Bash) or `Grep`. Get the line number.
- **Read with `offset`/`limit`** around the hit — a window, not the file.
- **Read whole files only when you are about to rewrite them**, or when the file
  is genuinely small (< ~100 lines).
- **Never re-read a file already in context.** If you have read it this session
  and have not changed it, you already have it.

```
# instead of
Read(file_path="/repo/internal/handler/user.go")          # 3,400 tokens

# do
Bash("rg -n 'func HandleLogin' internal/handler/user.go")  # ~40 tokens
Read(file_path="/repo/internal/handler/user.go", offset=210, limit=60)
```

Note the Bash call also carries a cost you control: keep the command short.

## Rule 2 — do not write whole files into tool arguments

A third of the window is text *you* write into tool calls. A full-file `Write`
or a `cat > file <<'EOF'` heredoc puts the entire file body in context —
permanently, for the rest of the session.

- **Prefer a targeted `Edit`.** It carries only the changed hunk. A three-line
  change should cost three lines, not the whole file.
- **`Write` is for new files**, not for editing existing ones.
- When a whole file genuinely must be generated, write it to the session
  scratchpad and move it, rather than passing the body through a tool argument
  a second time.

This regressed historically: when the edit gate denied `Edit`, agents fell back
to `cat > file <<'EOF'` with the full body inline — 331 confirmed instances. A
three-line change became a full-file rewrite in context. TRD 27-01 fixed the
gate, so `Edit` is available again; use it.

## Rule 3 — let the automatic mechanisms work

These already run and are doing their job. Do not fight them, and do not reach
for `/clear` or `/compact` as a first response:

- **Microcompaction** drops old tool results automatically while keeping a hot
  tail of recent ones, offloading large outputs to disk as path references.
- **Deferred MCP tool loading** keeps tool schemas out of the window until
  needed.
- **Output caps** bound any single result.

The failure mode is waiting until the window is full — at which point a manual
compact may not run at all. Read narrowly from the start instead.

## Rule 4 — prefer a subagent for read-heavy work

A subagent gets its own window; everything it reads stays there. Measured:
subagent turns run p50 135K against the main thread's p50 382K — **2.8× leaner**.
Delegating a survey ("find every call site of X") keeps the parent clean.

## Checking

`node ~/.claude/devflow/bin/df-tools.cjs context --raw` recomputes composition
from session transcripts. Targets: `Read` below 40% of tool-result tokens, and
median subagent context per turn trending down.

**Measurement trap:** `chars/4` over-counts base64 image blocks by ~25×. Images
are priced by dimension (~1.5K tokens each), not by base64 length. A first pass
using character count reported screenshots as 19% of context; the true figure is
1.5%. `df-tools context` encodes the correct accounting.
