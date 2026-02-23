<purpose>
Orchestrate parallel security auditor agents to scan codebase for vulnerabilities and produce a SECURITY-AUDIT.md report.

Each agent has fresh context, scans for a specific category of vulnerabilities, and **writes findings directly** to `.security-audit-tmp/`. The orchestrator only receives confirmation + counts, then merges, deduplicates, ranks, and writes the final report.

Output: SECURITY-AUDIT.md (in `.planning/` if exists, otherwise project root).
</purpose>

<philosophy>
**Why parallel auditor agents:**
- Fresh context per security domain (no token contamination between categories)
- Agents write findings directly (no context transfer back to orchestrator)
- Orchestrator only merges and formats (minimal context usage)
- Faster execution (agents run simultaneously)

**Security findings must be actionable:**
Every finding in the report includes file path, line number, evidence, and concrete remediation. Vague warnings waste developer time.

**Never include secret values:**
Agents redact secrets with `[REDACTED]`. The orchestrator must also verify no secrets leak into the final report.
</philosophy>

<process>

<step name="init_context" priority="first">
Load security audit context:

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init security-audit)
```

Extract from init JSON: `auditor_model`, `parallelization`, `output_dir`, `report_path`, `existing_report`, `stale_tmp_exists`, `tmp_dir`, `stack`, `planning_exists`.
</step>

<step name="parse_arguments">
Parse $ARGUMENTS for optional scope and focus filter.

**Path scope detection:**
If argument looks like a path (contains `/` or matches a directory): set `scope` to that path.

**Focus filter detection:**
- `secrets-only` → only spawn `secrets-and-code` agent
- `auth-only` → only spawn `auth-and-access` agent
- `deps-only` → only spawn `config-and-deps` agent
- No filter → spawn all 3 agents

If both scope and filter provided, pass scope to the filtered agent(s).
</step>

<step name="check_existing">
If `existing_report` is true:

```
A previous SECURITY-AUDIT.md exists at {report_path}.

Options:
1. Re-scan — Run fresh audit (overwrites previous report)
2. Cancel — Keep existing report
```

Wait for user response.
If "Re-scan": Continue to cleanup_stale.
If "Cancel": Exit workflow.

If no existing report: Continue to cleanup_stale.
</step>

<step name="cleanup_stale">
If `stale_tmp_exists` is true, remove stale temp directory:

```bash
rm -rf .security-audit-tmp
```

Create fresh temp directory:

```bash
mkdir -p .security-audit-tmp
```

Continue to spawn_agents.
</step>

<step name="spawn_agents">
Spawn parallel df-security-auditor agents based on focus filter.

Use Task tool with `subagent_type="general-purpose"`, `model="{auditor_model}"`, and `run_in_background=true` for parallel execution.

**IMPORTANT:** Each agent prompt must include:
- The agent definition to follow (reference `@~/.claude/agents/df-security-auditor.md`)
- The focus mode
- The detected stack
- The scope (if any)

**Agent 1: Secrets & Code** (skip if focus filter excludes)

Task tool parameters:
```
subagent_type: "general-purpose"
model: "{auditor_model}"
run_in_background: true
description: "Audit secrets and code"
```

Prompt:
```
You are a security auditor. Follow the agent definition and process in ~/.claude/agents/df-security-auditor.md

Focus: secrets-and-code
Stack: {stack from init}
Scope: {scope or "entire codebase"}

Scan for: hardcoded secrets, injection vulnerabilities (SQL, XSS, command), sensitive data exposure, weak cryptography.

Write findings to `.security-audit-tmp/secrets-and-code.md` using the format specified in the agent definition. Return confirmation only.
```

**Agent 2: Auth & Access** (skip if focus filter excludes)

Task tool parameters:
```
subagent_type: "general-purpose"
model: "{auditor_model}"
run_in_background: true
description: "Audit auth and access"
```

Prompt:
```
You are a security auditor. Follow the agent definition and process in ~/.claude/agents/df-security-auditor.md

Focus: auth-and-access
Stack: {stack from init}
Scope: {scope or "entire codebase"}

Scan for: authentication flaws, authorization bypass, API security issues, missing rate limiting, CSRF gaps.

Write findings to `.security-audit-tmp/auth-and-access.md` using the format specified in the agent definition. Return confirmation only.
```

**Agent 3: Config & Deps** (skip if focus filter excludes)

Task tool parameters:
```
subagent_type: "general-purpose"
model: "{auditor_model}"
run_in_background: true
description: "Audit config and deps"
```

Prompt:
```
You are a security auditor. Follow the agent definition and process in ~/.claude/agents/df-security-auditor.md

Focus: config-and-deps
Stack: {stack from init}
Scope: {scope or "entire codebase"}

Scan for: dependency vulnerabilities, missing security headers, error handling that leaks info, insecure defaults and configurations.

Write findings to `.security-audit-tmp/config-and-deps.md` using the format specified in the agent definition. Return confirmation only.
```

Continue to collect_confirmations.
</step>

<step name="collect_confirmations">
Wait for all agents to complete.

Read each agent's output to collect confirmations.

**Expected confirmation format from each agent:**
```
## Audit Complete

**Focus:** {focus-mode}
**Findings:** {N} total ({C} critical, {H} high, {M} medium, {L} low, {I} info)
**Output:** `.security-audit-tmp/{focus-mode}.md`

Ready for orchestrator merge.
```

If any agent failed, note the failure and continue with successful findings.

Continue to verify_findings.
</step>

<step name="verify_findings">
Verify findings files exist:

```bash
ls -la .security-audit-tmp/
wc -l .security-audit-tmp/*.md 2>/dev/null
```

Read each findings file that exists. If a file is missing, note which agent failed.

Continue to merge_findings.
</step>

<step name="merge_findings">
Read all findings files from `.security-audit-tmp/`.

**Merge process:**
1. Parse all findings from all files
2. Deduplicate — same file + same line + same category = duplicate (keep the one with higher severity)
3. Renumber all findings sequentially: SA-001, SA-002, ...
4. Sort by severity: CRITICAL first, then HIGH, MEDIUM, LOW, INFO
5. Within same severity, sort by category, then by file path

**Count totals:**
- Total findings
- Per-severity counts
- Per-category counts

Continue to write_report.
</step>

<step name="write_report">
Write the final SECURITY-AUDIT.md to `{output_dir}`.

**Report format:**

```markdown
---
audit_date: {YYYY-MM-DD}
scope: {scope or "full codebase"}
stack: [{detected languages}]
total_findings: {N}
severity:
  critical: {N}
  high: {N}
  medium: {N}
  low: {N}
  info: {N}
categories: [{list of categories with findings}]
status: {critical_action_required | review_recommended | clean}
---

# Security Audit Report

**Date:** {YYYY-MM-DD}
**Scope:** {scope description}
**Stack:** {languages}
**Status:** {status badge}

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | {N} |
| HIGH | {N} |
| MEDIUM | {N} |
| LOW | {N} |
| INFO | {N} |
| **Total** | **{N}** |

## Critical & High Findings

{Only CRITICAL and HIGH findings listed here with full detail}

## Medium Findings

{MEDIUM findings}

## Low & Info Findings

{LOW and INFO findings — condensed format: one line per finding}

## Recommendations

{Top 3-5 prioritized action items based on findings}

---

*Generated by DevFlow Security Audit*
```

**Status logic:**
- `critical_action_required` — any CRITICAL findings
- `review_recommended` — any HIGH findings but no CRITICAL
- `clean` — no CRITICAL or HIGH findings

Write using the Write tool to `{report_path}`.

Continue to cleanup_tmp.
</step>

<step name="cleanup_tmp">
Remove temp directory:

```bash
rm -rf .security-audit-tmp
```

Continue to present_summary.
</step>

<step name="present_summary">
Present the results to the user.

**If CRITICAL or HIGH findings exist:**

```
Security audit complete — **action required**.

**{report_path}** ({N} lines)

| Severity | Count |
|----------|-------|
| CRITICAL | {N} |
| HIGH     | {N} |
| MEDIUM   | {N} |
| LOW      | {N} |
| INFO     | {N} |

**Top priority fixes:**
1. {Most critical finding — one-line summary}
2. {Second most critical — one-line summary}
3. {Third — one-line summary}

Review the full report: `cat {report_path}`

---

## Next Steps

- Fix CRITICAL findings immediately
- Review HIGH findings before next release
- Consider MEDIUM findings for technical debt backlog
```

**If only MEDIUM or lower:**

```
Security audit complete — **no critical issues found**.

**{report_path}** ({N} lines)

| Severity | Count |
|----------|-------|
| MEDIUM   | {N} |
| LOW      | {N} |
| INFO     | {N} |

Review the full report: `cat {report_path}`
```

**If zero findings:**

```
Security audit complete — **clean**.

No security findings detected. {report_path} written with scan metadata.
```

End workflow.
</step>

</process>

<success_criteria>
- Init context loaded with model, stack, output path
- Stale temp directory cleaned up
- 1-3 agents spawned based on focus filter
- Agents used run_in_background=true for parallel execution
- Agent output files read for confirmations
- All findings files verified to exist
- Findings merged, deduplicated, renumbered, sorted by severity
- SECURITY-AUDIT.md written with YAML frontmatter and structured sections
- Temp directory cleaned up
- No secret values anywhere in output or report
- User presented with severity-based summary and prioritized next steps
</success_criteria>
