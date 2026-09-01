# Full output

Completeness enforcement for any agent producing code or documents. **A partial
output is a broken output.** This is not a design concern — it applies to the
executor, the debugger, and every skill that writes files.

> **Derived from [taste-skill](https://github.com/Leonxlnx/taste-skill) by
> Leonxlnx (MIT)**, specifically its `output-skill` and its research notes on
> model truncation behaviour. Full attribution and licence: `NOTICE.md`.

---

## Why this exists

Truncation is not a memory failure and not a context failure. Controlled testing
found that models retain instructions well across long conversations, and that a
truncated answer usually matches the model's own highest-confidence output. It is
a **behavioural artifact**: effort thresholds and stopping pressure, not
incapacity.

That matters because it tells you the fix. Reminding the model of context does
not help. Removing its discretion over completeness does.

---

## Banned output patterns

Hard failures. Never produce them.

**In code:** `// ...`, `// rest of code`, `// implement here`, a bare `...`
standing in for omitted lines, `// similar to above`, `// continue pattern`,
`// add more as needed`. A `TODO` is acceptable **only** when it marks genuinely
deferred work that is also recorded in the summary — never as a stand-in for code
you chose not to write now.

**In prose:** "let me know if you want me to continue", "for brevity", "the rest
follows the same pattern", "similarly for the remaining", "and so on" where
actual content belongs, "I'll leave that as an exercise".

**Structural:** shipping a skeleton when the request was an implementation.
Showing the first and last section and skipping the middle. Writing one example
of repeated logic and describing the rest. Describing what code should do instead
of writing it.

---

## Process

1. **Scope.** Read the whole request. Count the distinct deliverables — files,
   functions, sections, cases. **Lock that number.**
2. **Build.** Produce every deliverable completely.
3. **Cross-check.** Before responding, re-read the original request and compare
   your deliverable count against the locked scope. Anything missing gets added
   before you answer, not mentioned as a caveat.

## Running long

When output approaches a limit, do not compress what remains and do not skip to a
conclusion. Write at full quality to a clean breakpoint — the end of a function,
file or section — then stop explicitly:

```
[PAUSED - 3 of 7 complete. Resume from: <next unit>]
```

Resume exactly there, with no recap.

---

## In DevFlow

This is why several existing mechanisms exist, and it explains what they are
actually defending against:

- **Jobs hold 2-3 tasks.** A job larger than one context window produces
  scaffolding, because scaffolding is what fits. Truncation pressure is the
  mechanism.
- **`SUMMARY.md` requires task evidence.** The `verify-completion` hook checks
  it, which converts "I finished" into something falsifiable.
- **The verifier tests against the objective's goal,** not the task list.
  Stub-shaped work passes a task list and fails a goal.
- **Atomic commits per task** make an incomplete job visible in `git log` rather
  than hidden in a transcript.

If you genuinely cannot complete a job in the available scope, **say so and stop
at a clean boundary**. Record what remains in `SUMMARY.md`. A job that reports
success while shipping stubs is the specific failure this file exists to prevent,
and it is worse than a job that reports honestly that it ran out of room.
