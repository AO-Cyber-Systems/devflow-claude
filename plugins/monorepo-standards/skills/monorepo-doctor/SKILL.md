---
name: monorepo-doctor
description: |
  Validate that a monorepo follows the AO Cyber Systems layout convention — root CLAUDE.md declares every area, every area has its own CLAUDE.md, no compiled binaries are tracked in git.
  Reads the root `CLAUDE.md` Layout table, walks the working tree, and reports drift in a single Markdown summary. Standalone — works on any repo.
  Triggers on: "audit monorepo layout", "monorepo doctor", "is this monorepo healthy?", "check the layout", "find binaries in the repo".
argument-hint: "[--json] [--root <path>] [--no-binary-scan]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Validate a monorepo against the standard layout:

1. Root `CLAUDE.md` exists and declares its areas in a Layout table.
2. Every declared area exists on disk.
3. Every directory on disk that looks like a monorepo area is declared (no orphans).
4. Every declared area has its own `CLAUDE.md`.
5. No compiled executables or oversize files (> 5 MB) are tracked in non-asset paths.

This is a standalone command — no `.planning/` directory required.

Output: a Markdown report printed to the terminal, plus exit code 0 (clean) or 1 (issues found).
</objective>

<context>
Arguments: $ARGUMENTS (optional)

Supported flags (pass them through verbatim):
- `--root <path>` — audit a repo other than the cwd
- `--json` — machine-readable output instead of Markdown
- `--no-binary-scan` — skip the (slowest) binary walk

The standard AO Cyber Systems monorepo layout is:

| Path | Purpose |
|------|---------|
| `go/` | Go services + cmd entrypoints |
| `flutter/` | Flutter mobile/desktop app |
| `admin/` | Admin web UI (Next.js / Vite) |
| `mobile/` or `pos/` or `api-dart/` | product-specific extras |
| `proto/` | gRPC/protobuf schemas |

Every product monorepo (aodex, aosentry, eden-biz, politihub, aohealth) is being aligned to this layout. This skill is how you check whether a repo currently complies.
</context>

<process>

**1. Locate the CLI.**

The doctor logic lives at `${CLAUDE_PLUGIN_ROOT}/skills/monorepo-doctor/lib/cli.js`. Resolve the plugin root from the env or fall back to the well-known install path.

**2. Run the audit.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/monorepo-doctor/lib/cli.js" $ARGUMENTS
```

Capture stdout (the human-readable report) and the exit code. Exit code 0 means the monorepo is compliant; exit code 1 means at least one issue was found.

**3. Present the report.**

Show the full report to the user verbatim. Do not summarise unless they ask — the report is already terse.

**4. Suggest next steps.**

If the report shows issues, suggest the user invoke `/devflow:new-monorepo` (template scaffold) or `/devflow:quick` to fix each issue category. Do not auto-fix without confirmation.

</process>

<when_to_use>
**Use monorepo-doctor for:**
- New monorepo onboarding — confirm layout matches the standard
- Periodic drift checks — catch undeclared dirs or missing area docs
- Pre-PR validation — before merging a large refactor
- Pre-release — block ship if binaries snuck into the tree

**Do NOT use for:**
- Linting code style (use language-native linters)
- Validating CI workflows (separate skill)
- DevFlow `.planning/` state checks (use `/devflow:status check`)
</when_to_use>

<output_format>
Markdown report with sections:
- Declared areas summary
- Declared areas missing on disk
- Top-level dirs not declared in CLAUDE.md
- Areas without CLAUDE.md
- Tracked binaries
- Final PASS/FAIL marker

Exit non-zero on failure so the parent skill / shell can chain.
</output_format>
