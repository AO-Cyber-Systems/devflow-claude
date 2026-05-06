---
objective: 13-phase-h-prompt-extraction
research_kind: extraction-table
---

# Phase H — Extraction Table

Pre-edit line counts (baseline). Used by TRD 04 to compute the line-count delta and approximate token savings (≈3 tokens/line for prose; reference files emit only on @-resolution per spawn).

## Baseline line counts (current files)

```
codebase-mapper.md:  812
debugger.md:        1198
executor.md:         654
integration-checker.md: 440
job-checker.md:      689
objective-researcher.md: 488
planner.md:         1420
project-researcher.md: 618
research-synthesizer.md: 236
roadmapper.md:       663
security-auditor.md: 317
verifier.md:         697
TOTAL:              8232
```

## Section ranges to extract (current line numbers verified 2026-05-04)

### planner.md
- `<plan_format>` lines 477-641 = **165 lines** → references/trd-spec.md
- `<goal_backward>` lines 643-743 = **101 lines** → references/goal-backward.md
- Cut total from planner.md: **266 lines**

### debugger.md
- `<hypothesis_testing>` lines 102-218 = **117 lines**
- `<investigation_techniques>` lines 220-426 = **207 lines**
- `<verification_patterns>` lines 428-603 = **176 lines**
- `<research_vs_reasoning>` lines 605-725 = **121 lines**
- Cut total from debugger.md: **621 lines** → references/debugging-methods.md

### project-researcher.md
- `<tool_strategy>` lines 63-134 = **72 lines**
- `<verification_protocol>` lines 136-166 = **31 lines**
- Preamble cut: **103 lines** → references/research-tooling.md
- `<output_formats>` lines 168-493 = **326 lines** (5 inline templates)
- Templates cut: **326 lines** → templates/research-project/* (already on disk)
- Cut total from project-researcher.md: **429 lines**

### objective-researcher.md
- `<tool_strategy>` lines 85-131 = **47 lines**
- `<source_hierarchy>` lines 133-143 = **11 lines** (small; merge into research-tooling.md)
- `<verification_protocol>` lines 145-175 = **31 lines**
- Cut total from objective-researcher.md: **89 lines** → references/research-tooling.md

### verifier.md
- `<stub_detection_patterns>` lines 629-678 = **50 lines** → references/stub-patterns.md
- `<verification>` template inline (issue cites lines 467-557) — verify exact range during execution = **~91 lines** → templates/verification-report.md (already exists on disk)
- Cut total from verifier.md: **~141 lines**

### job-checker.md
- `<core_principle>` lines 41-61 = **21 lines** → reference goal-backward.md (job-checker keeps a 5-line @-reference + the "verifier vs job-checker" distinction inline since that's job-checker-specific)
- Cut total from job-checker.md: **~16 lines**

### codebase-mapper.md
- `<templates>` lines 169-672 = **~504 lines** (8 inline templates)
- 7 already exist on disk at templates/codebase/*; need to create patterns.md (≈40 lines)
- Cut total from codebase-mapper.md: **~504 lines**

## Total expected line-count delta

```
planner.md:        -266 (+ ~5 line @-reference per cut = +10)
debugger.md:       -621 (+ ~5 line @-reference = +5)
project-researcher.md: -429 (+ ~10 line @-reference combined = +10)
objective-researcher.md: -89 (+ ~5 line @-reference = +5)
verifier.md:       -141 (+ ~10 line @-reference combined = +10)
job-checker.md:    -16  (+ ~5 line @-reference = +5)
codebase-mapper.md: -504 (+ ~10 line @-reference combined = +10)

Gross cuts:  -2066 lines
@-ref adds:  +55 lines
NET delta:   ~ -2011 lines across 7 agent files

Per-spawn savings (any single agent): varies 16-621 lines = ~50-1900 tokens per agent
Per-/devflow:build invocation: spawns ~5-10 agents typically. With references resolved
inline by Claude's `@`-syntax (one-time read per session), the savings are realized
across ALL spawns, not just one.

Target ≥25k tokens conservative; observed should land 30-60k.
```

## Existing template inventory (no recreation needed)

```
templates/codebase/      — 7 files (architecture, concerns, conventions, integrations, stack, structure, testing)
                          — MISSING: patterns.md (TRD 01 creates)
templates/research-project/ — 5 files (ARCHITECTURE, FEATURES, PITFALLS, STACK, SUMMARY)
                          — COMPLETE
templates/verification-report.md — exists (verifier.md inline can be deleted + ref'd)
```

## Reference file format precedent

Existing references (`anti-patterns.md`, `tdd.md`, `verification-patterns.md`, etc.) follow the convention:
1. H1 title with brief 1-paragraph "what this is"
2. XML-tagged sections (`<tdd_anti_patterns>`, `<iron_law>`, etc.) wrapping each thematic block
3. Tables / examples / code blocks preserved verbatim from source
4. Cross-references to other reference files via `@~/.claude/devflow/references/<name>.md`

TRD 01 follows this precedent.

## Validation regression (from issue #33 acceptance criteria)

- All extracted reference files parse correctly (markdown + XML tags valid)
- Agent preamble line counts reduced (target metrics in issue #33 H4 are NOT in scope here; only H1-H3)
- 5 fixed scenarios re-runnable with no quality regression — verified via npm test (1471 tests)
- Token measurement: agent spawn cost drops ≥25k tokens per `/devflow:build` (this objective's quality_gate; issue #33's stricter ≥40% per-spawn target deferred)

## Risks

1. **`@~`-resolution at agent-spawn time** — Claude's `@<path>` syntax is documented but each agent must use the syntax literally. Mitigation: TRD 02/03 must include exact `@~/.claude/devflow/references/<name>.md` strings (no quoting, no variable expansion); verify post-edit by `grep -F "@~/.claude/devflow/references" agents/<file>.md`.
2. **Sync-runtime hook timing** — references must be in `plugins/devflow/devflow/references/` (source of truth), and `sync-runtime.js` mirrors them on SessionStart. Existing `references/anti-patterns.md` already proves this works. No risk for new files following the same convention.
3. **Verifier's verification-report inline lines 467-557** — issue #33's line-range citation may be off-by-N; TRD 02's task action MUST grep for the exact `## VERIFICATION.md template` block and validate range before deletion. Recovery: if the inline differs from on-disk template, capture diff in TRD 02 SUMMARY and choose: (a) update on-disk template, or (b) keep inline + add comment ref. Default: prefer (b) and surface decision in SUMMARY.
4. **Codebase-mapper patterns.md content** — must be created in TRD 01 by copying from codebase-mapper.md lines ~634-668 verbatim (the inline PATTERNS.md block). Other 7 templates on disk: TRD 04 must verify content match before TRD 03 deletes inline.
