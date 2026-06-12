# Unattended Operation Runbook

Operator card for running DevFlow overnight, in CI, or headless. Covers enablement,
launch, what stops for humans, where parked work surfaces, and the safety bounds that
prevent runaway execution.

---

## What autonomous mode is (vs yolo)

| Mode | Checkpoint:human-verify | Checkpoint:decision | Human stops |
|------|------------------------|---------------------|-------------|
| `yolo` | Blind auto-approve (legacy) | Auto-selects first option | Never — all gates skipped |
| `interactive` (default) | Presented to user | Presented to user | Every gate |
| `autonomous` | Delegated to verifier agent | Parked in decision queue | Design decisions, auth, destructive actions |

**Autonomous mode** machine-verifies `human-verify` checkpoints by spawning the verifier
agent and accepting the checkpoint only on explicit `status: passed`. Design/architecture
decisions (`checkpoint:decision` and Rule 4 deviations) are parked as `DECISION-NNN.md`
files so independent TRDs continue without interruption. Auth gates
(`checkpoint:human-action`) always stop for the operator — credential acquisition cannot
be automated.

Humans stop **only for**:
- Design or architecture decisions (parked, not blocking independent TRDs)
- Auth/credential steps (unavoidable)
- Destructive actions flagged `caution="pause-before-destructive"` in the TRD

Everything else — compilation, tests, file writes, git commits, verification — runs
machine-driven.

---

## Enabling autonomous mode

```bash
node ~/.claude/devflow/bin/df-tools.cjs config-set mode autonomous
```

Or interactively via `/devflow:settings` — select the **Autonomous** mode option.

To confirm:

```bash
node ~/.claude/devflow/bin/df-tools.cjs config-get mode
# → "autonomous"
```

---

## Headless launch

Start a session without a terminal with the `claude -p` flag:

```bash
claude -p "Execute objective 12 via /devflow:execute-objective 12" \
  --permission-mode acceptEdits
```

**Permission mode notes:**
- `acceptEdits` — Claude may read, write, and edit files without prompting; all other
  tool calls (Bash, network) still present. Suitable for most overnight runs.
- `bypassPermissions` — all permission checks bypassed. Use only with an explicit
  operator decision; never default to it.
- **`permissionMode` in plugin agent frontmatter is silently ignored.** Setting
  `permissionMode: acceptEdits` inside a skill or agent `.md` file has no effect.
  The session-level `--permission-mode` flag on the `claude -p` invocation above is
  the working mechanism.

---

## Recommended settings.json permissions allowlist

Scoping `allow` entries limits blast radius if something unexpected is run. Tailor per
project; the principle is: allow the mechanical, prompt for the destructive.

```json
{
  "permissions": {
    "allow": [
      "Bash(node ~/.claude/devflow/bin/df-tools.cjs *)",
      "Bash(npm test*)",
      "Bash(npm run build*)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git status*)",
      "Bash(git log*)",
      "Bash(git diff*)"
    ],
    "deny": []
  }
}
```

Place in `.claude/settings.json` (project-local) or `~/.claude/settings.json` (global).

---

## Decision queue monitoring

When a `checkpoint:decision` or a Rule 4 architectural deviation fires in autonomous
mode, DevFlow parks the decision and continues independent TRDs.

**Where decisions surface:**

```
.planning/decisions/pending/DECISION-NNN.md
```

Each file carries full context, named options with pros/cons, a recommendation, and
the list of TRDs blocked on this decision. An OS notification fires at park time
(macOS: `osascript` out of the box; Linux: `notify-send` / libnotify required).

**List pending decisions:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs decision-queue list
```

**Resolve a decision and resume:**

```bash
# Resolve to a specific option
node ~/.claude/devflow/bin/df-tools.cjs decision-queue resolve DECISION-001 option-a

# Then resume the gated TRDs
/devflow:decide DECISION-001 option-a
# → reports which TRDs are now unblocked
# → suggest: /devflow:execute-objective N
```

Resolved decisions move to `.planning/decisions/resolved/DECISION-NNN.md`.

For full checkpoint semantics in autonomous mode see
`@~/.claude/devflow/references/checkpoints.md` — the `autonomous` section documents
the exact verifier delegation protocol.

---

## Safety bounds

The following limits prevent a runaway session from consuming unbounded resources:

| Bound | Value | Mechanism |
|-------|-------|-----------|
| Stop-hook resume cap | 3 attempts per objective | Counter file `.planning/.autonomous-resume-{objectiveKey}`; cleared on completion or cap |
| Executor retry (subagent) | 1 retry per agent | Marker file `.planning/.autonomous-retry-{sanitized-agent-id}`; stale markers swept after 1 hour |
| Wave failure | Retry once, then skip dependents | Fresh executor spawn with `<failure_feedback>` block; only transitive dependents skipped |
| maxTurns — executor | 50 | Set in agent frontmatter |
| maxTurns — verifier | 30 | Set in agent frontmatter |

After the 3-attempt cap the session exits normally; remaining work is documented in the
end-of-run report in STATE.md. After a wave failure + retry the orchestrator skips only
TRDs that `depends_on` the failed TRD, then continues all independent ones.

---

## Scheduled overnight runs (Routines)

DevFlow cannot create Routines programmatically — the Claude Code Routines API is not
available to plugin agents.

To schedule an overnight run, set one up manually:

```
/schedule
```

Point the routine at:

```
/devflow:execute-objective <N>
```

Present the `/schedule` command to Claude Code when prompted; it will walk you through
the schedule configuration. Routines syntax may differ by Claude Code version — treat
this as a pointer to the scheduling UI rather than a guaranteed-stable command
signature.

---

## Port rule

Verification and dev servers in this environment **must use port 8091**. Port 8080 is
permanently forbidden — it is occupied on the operator's machine. This constraint is
passed through to every spawned subagent and must appear in any TRD that starts a local
HTTP server for verification purposes.

```bash
# Correct — use 8091
npm run dev -- --port 8091
curl http://localhost:8091/healthz

# Wrong — never use 8080
# npm run dev -- --port 8080   ← forbidden
```

---

## Quick troubleshooting

| Symptom | Check |
|---------|-------|
| Session exits immediately on stop | `cat .planning/.autonomous-resume-*` — if ≥ 3, cap reached; re-enable manually after confirming STATE.md |
| Verifier never returns `status: passed` | Start server on port 8091 before the checkpoint task; confirm `curl http://localhost:8091` responds |
| Decision queue empty but TRDs are stalled | Run `decision-queue list` — may have `status: resolved` already; run `/devflow:decide` to unblock |
| OS notification not firing | macOS: `osascript` available by default. Linux: install `libnotify` (`sudo apt install libnotify-bin`) |
| permissionMode in SKILL.md seems ignored | Correct — session-level `--permission-mode` flag on `claude -p` is the working mechanism; frontmatter value is ignored |
