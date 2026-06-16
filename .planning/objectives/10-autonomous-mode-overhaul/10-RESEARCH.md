# Objective 10: Autonomous Mode Overhaul - Research

**Researched:** 2026-06-12
**Domain:** Claude Code hooks, agent frontmatter, config schema, execution orchestration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md / OBJECTIVE.md)

### Locked Decisions

1. **Verifier delegation for checkpoints.** Replace blind `checkpoint:human-verify` auto-approval (plugins/devflow/devflow/references/checkpoints.md:11, plugins/devflow/devflow/workflows/execute-objective.md:388-390) with delegation to the verifier agent: spin up the app, run the Playwright/Maestro functional pass (verifier.md Step 8 already defines it), approve only on green evidence, escalate to user only on failure.
2. **Decision queue.** For `checkpoint:decision` and executor deviation Rule 4: stop auto-selecting first option in auto mode. Park decisions (context, options, recommendation) in `.planning/decisions/`, notify the user, continue TRDs/waves that don't depend on the answer.
3. **Auto-resume + retry hooks.** (a) Upgrade plugins/devflow/hooks/verify-completion.js (Stop hook, currently warn-only) to return decision:"block" with a resume directive when STATE.md shows mid-execution work and autonomous mode is on. (b) SubagentStop hook: retry a failed executor once with failure feedback. (c) Wave failure: replace "Continue?/Stop?" prompt (execute-objective.md:336-375) with retry-once then dependency-aware skip.
4. **Agent hardening.** `isolation: worktree` on wave-parallel executors, `maxTurns` on executor/verifier, `memory: true` where useful.
5. **Config integrity.** `require_verification`/`require_tests` written by new-project but never read — wire in or remove. Batch new-project's sequential AskUserQuestion calls (4 questions/call max). Drop pure-stamp confirmations from transition/complete-milestone in autonomous mode.
6. **Autonomous preset + runbook.** New `mode: "autonomous"` config preset distinct from yolo (machine-verify everything, queue design decisions, never wait on mechanics); references/unattended-operation.md runbook (headless claude -p, auto permission mode, settings allowlist, Routines pointer).

### Claude's Discretion

- Decision-queue file format and notification mechanism (PushNotification vs gh issue vs osascript — note the daemon notification helper from v1.2 plans)
- How dependency-aware wave skip should compute the dependent set (TRD frontmatter depends_on? wave ordering?)
- Where the autonomous-mode branch points live (df-tools config resolution vs hook env vs STATE.md flag)
- Stop-hook loop-prevention strategy (must not infinitely block; bounded resume attempts)

### Deferred Ideas (OUT OF SCOPE)

- PTY watcher work
- GitHub bidirectional sync
- TUI changes

### Cross-Repo Considerations

None documented. This is the devflow-claude repo — the plugin is its own product.
</user_constraints>

---

## Summary

This objective wires DevFlow into a genuinely unattended execution mode. The system already has the "yolo" skeleton (auto-approve everything, skip human-verify checkpoints), but the bones are shallow: human-verify checkpoints are blindly approved without machine evidence, decision checkpoints block on the first option without parking for async resolution, the Stop hook is warn-only and cannot resume, SubagentStop is entirely passive, and the `mode: "autonomous"` preset does not exist. Config fields `require_verification` and `require_tests` are written by `new-project` but never read by any executor or hook.

The overhaul has a clear sequencing constraint: the `mode: "autonomous"` config key must land first, because all six items branch on it. Items 1-3 (verifier delegation, decision queue, auto-resume/retry) are the highest-value changes; items 4-6 (agent hardening, config wiring, new-project batching) are smaller but required for correctness.

The Claude Code platform fully supports what is needed: Stop and SubagentStop hooks support `decision: "block"` with `additionalContext`; agent frontmatter supports `isolation: worktree`, `maxTurns`, and `memory`; `permissionMode: acceptEdits` or `auto` can be set per-subagent. Loop prevention must be implemented in hook logic — the platform provides no built-in counter, so the hook must write a per-session attempt counter to disk.

**Primary recommendation:** Sequence the six locked items as: (1) config schema + autonomous preset → (2) verifier-delegated checkpoints → (3) decision queue → (4) auto-resume/retry hooks → (5) agent hardening → (6) config integrity + new-project batching. Items 1-3 are a natural first wave; 4-6 form a second wave.

---

## Standard Stack

### Core (existing — no new deps needed)

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| `df-tools.cjs` | `plugins/devflow/devflow/bin/df-tools.cjs` | Config read/write, state management, init | In use |
| `config.cjs` | `bin/lib/config.cjs` | `loadConfig()`, `cmdConfigGet`, `cmdConfigSet` | In use; needs autonomous mode additions |
| `notifier.cjs` | `bin/lib/notifier.cjs` | `notify({title, body})` via osascript/notify-send | Exists, not yet wired to decision queue |
| `verify-completion.js` | `plugins/devflow/hooks/verify-completion.js` | Stop hook — currently warn-only | Must be upgraded |
| `verify-commits.js` | `plugins/devflow/hooks/verify-commits.js` | SubagentStop hook — currently warn-only | Must be upgraded |
| `verifier.md` | `plugins/devflow/agents/verifier.md` | Step 8 already defines Playwright/Maestro functional pass | Delegate to from checkpoint handler |
| `execute-objective.md` | `plugins/devflow/devflow/workflows/execute-objective.md` | Wave orchestrator, checkpoint handler | Lines 388-390 and 336-375 are the primary edit targets |

### Notification Infrastructure (discretion area)

The `notifier.cjs` module already exists with `notify({title, body, urgency?, log?})` routing to:
- **macOS:** `osascript -e 'display notification ... with title ...'`
- **Linux:** `notify-send [-u urgency] title body`
- **Other:** silent no-op

This is the correct mechanism for decision-queue notifications (no external service, no PTY, works headlessly). Use it in a new `df-tools decision-queue notify` subcommand. No new library needed.

**Installation:** No new packages. All work is in existing `.js`/`.cjs` files and `.md` workflow files.

---

## Architecture Patterns

### Recommended `.planning/` Structure Additions

```
.planning/
├── config.json                    # Add mode: "autonomous"
├── decisions/                     # NEW: decision queue directory
│   ├── pending/
│   │   └── DECISION-001.md        # Parked decisions awaiting user input
│   └── resolved/
│       └── DECISION-001.md        # Archived resolved decisions
└── .autonomous-resume-count       # NEW: per-session Stop hook attempt counter
```

### Pattern 1: Autonomous Mode Config Key

**What:** Add `mode: "autonomous"` as a distinct preset from `"yolo"`. Autonomous = machine-verify human-verify checkpoints, queue decision checkpoints, never wait on mechanics. Yolo = auto-approve everything including decisions (first-option auto-select preserved for backward compat).

**Config diff:**
```json
{
  "mode": "autonomous",
  "workflow": {
    "auto_advance": true,
    "verifier_checkpoints": true,
    "decision_queue": true
  }
}
```

**Where to branch:** The existing pattern in `execute-objective.md` reads `AUTO_CFG` via `df-tools config-get workflow.auto_advance`. Autonomous mode detection follows the same pattern:

```bash
MODE=$(node ~/.claude/devflow/bin/df-tools.cjs config-get mode 2>/dev/null || echo "yolo")
AUTONOMOUS=$( [ "$MODE" = "autonomous" ] && echo "true" || echo "false" )
```

Hook files read the same way. All six items gate on `AUTONOMOUS == "true"`.

**config.cjs change:** Add `mode` to `loadConfig()` return (it is already read but only for the `mode` key itself — confirm `loadConfig` returns it; investigation shows it does at line 47 of config.cjs). Add `autonomous` convenience boolean:

```javascript
// In loadConfig() return
mode: get('mode', { section: 'workflow', field: 'mode' }) ?? defaults.mode,
// Add helper
autonomous: (get('mode') ?? defaults.mode) === 'autonomous',
```

### Pattern 2: Verifier-Delegated Checkpoint (Item 1)

**What:** In `execute-objective.md` checkpoint handler (around line 388), replace blind auto-approve for `human-verify` with verifier agent spawn.

**Current code:**
```
- **human-verify** → Auto-spawn continuation agent with {user_response} = "approved". Log ⚡ Auto-approved checkpoint.
```

**New code (autonomous mode only):**
```
- **human-verify** → Spawn verifier agent with checkpoint context.
  - If verifier returns status: passed → auto-approve. Log ⚡ Verifier-approved: [checkpoint].
  - If verifier returns status: gaps_found or human_needed → escalate to user with verifier report attached.
  - Port 8091 if a dev server is needed during verification (never 8080).
```

**Verifier agent already supports this:** `verifier.md` Step 8 defines Playwright functional pass. The orchestrator just needs to spawn it with the checkpoint's `what-built` and `how-to-verify` as context.

### Pattern 3: Decision Queue File Format (Item 2, discretion area)

**Recommendation:** Use structured markdown files in `.planning/decisions/pending/`. Simple, readable, no new deps.

**File format:**
```markdown
---
id: DECISION-001
objective: 10
wave: 2
trd: 10-03
type: checkpoint:decision
created: 2026-06-12T14:30:00Z
status: pending
blocks: []        # TRD IDs that cannot proceed without this answer
independent: [10-04, 10-05]   # TRDs that can proceed regardless
recommendation: option-a     # planner's pre-selected best option
---

## Decision: [What's being decided]

**Context:** [Why this matters]

**Options:**

1. **option-a** — [Name]
   - Pros: [benefits]
   - Cons: [tradeoffs]

2. **option-b** — [Name]
   - Pros: [benefits]
   - Cons: [tradeoffs]

## To Resolve

Reply: `/devflow:decide DECISION-001 option-a`
```

**Dependency computation (discretion area):** Use TRD frontmatter `depends_on` field to compute which TRDs block on a given decision. TRDs that list a `decision_id:` in their frontmatter are blocked; all others in the same objective are independent. The wave grouping in `execute-objective.md` already reads `depends_on` via `objective-job-index`. The decision queue computation is the inverse: for a decision parked at wave N, skip waves that contain blocked TRDs; continue waves that are fully independent.

**Notification:** After writing the decision file, call `notifier.cjs`:
```javascript
await notify({
  title: 'DevFlow: Decision Required',
  body: `DECISION-${id}: ${decisionTitle} — run /devflow:decide to unblock`
});
```

Add `df-tools decision-queue [add|list|resolve|notify]` subcommand to expose this to skills.

### Pattern 4: Stop Hook Loop Prevention (Item 3a, discretion area)

**Problem:** The Claude Code platform provides no built-in loop counter for Stop hooks. If the hook always returns `decision: "block"`, the session loops forever.

**Recommended approach:** Per-session attempt counter written to `.planning/.autonomous-resume-count`. The hook increments on each block, exits 0 (allow stop) after N attempts.

```javascript
// In verify-completion.js (Stop hook)

const MAX_RESUME_ATTEMPTS = 3;

function readResumeCount(planningDir) {
  const p = path.join(planningDir, '.autonomous-resume-count');
  try { return parseInt(fs.readFileSync(p, 'utf8').trim(), 10) || 0; } catch { return 0; }
}

function writeResumeCount(planningDir, count) {
  try { fs.writeFileSync(path.join(planningDir, '.autonomous-resume-count'), String(count)); } catch {}
}

function clearResumeCount(planningDir) {
  try { fs.unlinkSync(path.join(planningDir, '.autonomous-resume-count')); } catch {}
}

// In main():
// Only block if: autonomous mode on, STATE.md shows mid-execution, attempts < MAX
const count = readResumeCount(planningDir);
if (count >= MAX_RESUME_ATTEMPTS) {
  clearResumeCount(planningDir); // reset for next run
  return; // allow stop
}
writeResumeCount(planningDir, count + 1);
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: 'DevFlow: mid-execution state detected in autonomous mode — resuming (attempt ' + (count+1) + '/' + MAX_RESUME_ATTEMPTS + ')'
}));
```

**When to clear:** Clear the counter when execution completes cleanly (SUMMARY.md written, state advances). The executor already writes SUMMARY.md; the Stop hook can detect this and clear.

### Pattern 5: SubagentStop Retry Hook (Item 3b)

**What:** The SubagentStop hook (`verify-commits.js`) is currently warn-only. Upgrade it to: if executor subagent failed (no commits in 10min, STATE.md still mid-execution), block once with failure feedback to re-prompt it.

**Platform behavior (confirmed):** SubagentStop with `decision: "block"` prevents the subagent from stopping and causes it to continue. `additionalContext` inside `hookSpecificOutput` surfaces feedback. This effectively re-prompts the subagent once.

```javascript
// In verify-commits.js (SubagentStop hook)
// Only retry ONCE — use a per-agent-id marker file
const agentId = payload.agent_id || 'unknown';
const retryMarker = path.join(planningDir, `.autonomous-retry-${agentId}`);
if (fs.existsSync(retryMarker)) return; // already retried once, allow stop
if (!recentCommits && midExecution && autonomousMode) {
  fs.writeFileSync(retryMarker, '1');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStop',
      decision: 'block',
      reason: 'DevFlow: executor produced no commits — retry once with failure context'
    }
  }));
}
```

**Cleanup:** Delete `.autonomous-retry-{agentId}` marker after successful SUMMARY.md detection. Age-based cleanup (>1 hour old) as safety net.

### Pattern 6: Agent Frontmatter Hardening (Item 4)

**Confirmed supported fields (from official docs):**

| Field | What it does | Recommendation |
|-------|-------------|----------------|
| `isolation: worktree` | Gives subagent isolated git worktree branched from default branch | Add to executor.md for wave-parallel runs |
| `maxTurns: N` | Hard stop after N agentic turns | executor: 50, verifier: 30 |
| `memory: project` | Persistent memory at `.claude/agent-memory/<name>/` | verifier only (accumulates codebase patterns) |
| `permissionMode: acceptEdits` | Auto-accept file edits in working dir | executor only, safer than `bypassPermissions` |

**Critical constraint:** Plugin subagents **do NOT support** `hooks`, `mcpServers`, or `permissionMode` in frontmatter — these fields are silently ignored. The DevFlow agents live in `plugins/devflow/agents/`, which is a plugin scope. Therefore `permissionMode` in agent frontmatter WILL NOT WORK for DevFlow agents.

**Workaround for permissionMode:** Set it at the session level via `--permission-mode acceptEdits` in the headless launch command documented in the runbook. Or use `permissions.allow` in `settings.json`. The runbook (Item 6) must cover this.

**Workaround for hooks in agents:** Agent-level hooks defined in frontmatter are also ignored for plugin agents. The global `hooks.json` hooks (SubagentStop, Stop) fire for all agents regardless — this is the correct path.

**isolation: worktree** — The docs say this gives the subagent "an isolated copy of the repository branched by default from your default branch rather than the parent session's HEAD." This is correct for wave-parallel executors. The worktree is auto-cleaned if no changes are made. Note: worktree agents still share the same `.planning/` if they clone from the same base — the planner should ensure each wave-parallel executor has its own job file rather than shared mutable state.

### Pattern 7: Config Integrity (Item 5)

**Investigation findings:**

- `require_verification` and `require_tests` are loaded by `loadConfig()` and included in the return object (lines 51-52 of config.cjs).
- They are **never read from the `config` object in `init.cjs`** — the init functions return `commit_docs`, `parallelization`, `verifier`, `branching_strategy`, etc., but not `require_verification` or `require_tests`.
- They are referenced in `references/auto-behaviors.md` as documentation, and written in `new-project.md` template (line 454), but zero executor code branches on them.
- **Recommendation:** Remove `require_verification` and `require_tests` from `config.json` template and from `loadConfig()`. They are superseded by `autonomous` mode's verifier delegation and the TDD enforcement built into executor. This avoids confusion. If a user has existing config.json with these fields, `loadConfig()` should ignore unknown keys (it already does via the `get()` helper pattern).

**new-project AskUserQuestion batching:**

Current flow (non-auto mode) runs multiple sequential AskUserQuestion calls — Step 5 asks 4 questions across 2 rounds. In autonomous mode, these should be batched into a single call with all config questions at once (AskUserQuestion supports array of questions per call, as seen in Step 2a which batches 3 questions in one call). The 4-questions-per-call max is a locked constraint.

The existing auto-mode path (Step 2a) already batches correctly. The interactive path (Step 5) still sequences them separately. Batching is a cosmetic improvement for UX but does not block autonomous mode.

**Transition/complete-milestone pure-stamp confirmations:**

In `mode: "yolo"` today, `transition.md` already auto-continues without confirmation (lines 411-421 use `<if mode="yolo">` → auto-continue). `complete-milestone.md` lines 99-108 also auto-proceed in yolo mode. These same branches work for `autonomous` mode if we add `OR mode="autonomous"` to those conditions — or better, define autonomous as a superset of yolo's mechanical automation.

### Pattern 8: Runbook (Item 6)

**File:** `plugins/devflow/devflow/references/unattended-operation.md` (new file)

**Must cover:**
- Headless launch: `claude -p "..." --permission-mode acceptEdits` (never `bypassPermissions` without explicit user opt-in)
- Setting `mode: "autonomous"` in config.json
- Decision queue monitoring: location (`.planning/decisions/pending/`), how to resolve (`/devflow:decide ID option-x`)
- OS notification setup: macOS `osascript` works out of box; Linux requires `notify-send` (libnotify)
- Routines: DevFlow cannot create Routines programmatically — provide the exact `claude routine` command for users to set up scheduled autonomous runs
- Port constraint for verification: always use port 8091, never 8080

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Loop prevention for Stop hooks | Custom "sentinel" protocol using transcript scanning | Per-session counter file at `.planning/.autonomous-resume-count` | Simple, reliable, already within the `.planning/` write path hooks use |
| Notification system | Custom daemon socket or HTTP server | Existing `notifier.cjs` (osascript/notify-send) | Already implemented and tested |
| Decision queue dependency graph | Full graph traversal engine | TRD frontmatter `depends_on` + wave ordering already computed by `objective-job-index` | The wave grouping is the dependency graph |
| Agent isolation | Custom worktree management code | `isolation: worktree` in agent frontmatter | Platform handles creation and cleanup |
| SubagentStop retry coordination | Orchestrator-side retry loop | SubagentStop hook `decision: block` with per-agent-id marker file | Platform re-prompts subagent directly |

---

## Common Pitfalls

### Pitfall 1: Plugin Agents Cannot Use permissionMode/hooks in Frontmatter

**What goes wrong:** Add `permissionMode: acceptEdits` to `executor.md` and expect it to auto-accept edits. It silently does nothing.

**Why it happens:** The official docs state: "For security reasons, plugin subagents do not support the `hooks`, `mcpServers`, or `permissionMode` frontmatter fields. These fields are ignored when loading agents from a plugin."

**How to avoid:** Set permission mode at the session/launch level. In the runbook, document `claude -p "..." --permission-mode acceptEdits`. For users running interactively, document that they can set `settings.json` `permissions.allow`.

**Warning signs:** Executor prompts for file edit permissions despite `permissionMode: acceptEdits` in frontmatter.

### Pitfall 2: Stop Hook Infinite Loop Without Counter

**What goes wrong:** Stop hook always returns `decision: "block"` when STATE.md shows mid-execution work. Since execution never completes (session keeps resuming to a fresh start, not the executor), the hook blocks forever.

**Why it happens:** The platform provides no built-in `stop_hook_active` or attempt counter. The Stop hook fires fresh each time with no memory of previous blocks.

**How to avoid:** Write `.planning/.autonomous-resume-count` incrementally. Cap at 3 attempts. Clear when execution completes cleanly.

**Warning signs:** Session appears to loop without making progress. Log messages show repeated "resume attempt N/3".

### Pitfall 3: Decision Queue Blocks All Waves Instead of Only Dependent Ones

**What goes wrong:** A decision is parked, and the entire objective execution halts waiting for resolution.

**Why it happens:** The checkpoint handler returns early from all waves when any decision is queued.

**How to avoid:** Use TRD frontmatter `depends_on` to compute the independent set. Continue waves whose TRDs do not depend on the parked decision. Only skip waves explicitly blocked.

**Warning signs:** User sees "waiting for DECISION-001" even though the next wave's TRDs have no dependency on it.

### Pitfall 4: Verifier Agent Port 8080

**What goes wrong:** Verifier spawns dev server on 8080 during autonomous checkpoint verification; fails because that port is occupied.

**How to avoid:** All verification flows must use port 8091. This must be explicit in the verifier delegation instructions passed when spawning the verifier from the checkpoint handler. The existing verifier Step 8 examples use `localhost:3000` — those must be updated to 8091 in the context of DevFlow self-verification.

**Warning signs:** `curl http://localhost:8080` hangs or returns unexpected content from another process.

### Pitfall 5: isolation:worktree Branching from Default Not HEAD

**What goes wrong:** Parallel executor in worktree does not see uncommitted changes from previous wave.

**Why it happens:** The docs say worktree is "branched by default from your default branch rather than the parent session's HEAD." If previous wave committed to `main`, the next wave's worktree will include those commits. But if previous wave's commits are on a feature branch and the executor's worktree bases from `main`, it will miss them.

**How to avoid:** With `branching_strategy: "none"` (the default), all commits go to the current branch. Worktree isolation then branches from that branch's HEAD. Ensure the DevFlow project doesn't use object branching when enabling worktree isolation on executors.

### Pitfall 6: require_verification/require_tests Confusion

**What goes wrong:** User sets `require_tests: false` in config.json expecting TDD to be disabled. It has no effect.

**Why it happens:** These fields are written but never read by any executor code path.

**How to avoid:** Remove them from config template and loadConfig. The TDD posture is controlled by the TRD `type: tdd` field and the `(kind, work)` defaults table, not by config gates.

---

## Code Examples

### Reading autonomous mode in a hook

```javascript
// Source: bin/lib/config.cjs pattern (existing loadConfig)
// In any hook file:
function isAutonomousMode(planningDir) {
  try {
    const config = JSON.parse(
      require('fs').readFileSync(require('path').join(planningDir, '..', '.planning', 'config.json'), 'utf8')
    );
    return config.mode === 'autonomous';
  } catch { return false; }
}
```

### Stop hook decision block with resume directive

```javascript
// Source: official Claude Code hooks docs (verified June 2026)
// JSON output to stdout:
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: 'DevFlow autonomous mode: mid-execution state detected — resuming (attempt ' + count + '/' + MAX + '). Check .planning/STATE.md for position.'
}));
```

### SubagentStop retry block

```javascript
// Source: official Claude Code hooks docs (verified June 2026)
// hookSpecificOutput format for SubagentStop:
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SubagentStop',
    decision: 'block',
    reason: 'DevFlow: executor subagent produced no commits in last 10min — retrying once with failure context'
  }
}));
```

### Decision queue entry creation (df-tools command)

```bash
# Source: existing df-tools pattern (config-set, state add-decision)
node ~/.claude/devflow/bin/df-tools.cjs decision-queue add \
  --objective 10 \
  --trd 10-03 \
  --title "Select authentication provider" \
  --context "Need user auth, three options with different tradeoffs" \
  --options "supabase,clerk,nextauth" \
  --recommendation "supabase" \
  --blocks "10-04" \
  --independent "10-05,10-06"
```

### Autonomous mode checkpoint branch in execute-objective.md

```bash
# Source: execute-objective.md existing AUTO_CFG pattern
MODE=$(node ~/.claude/devflow/bin/df-tools.cjs config-get mode 2>/dev/null || echo "yolo")
AUTO_CFG=$(node ~/.claude/devflow/bin/df-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")

# Human-verify checkpoint:
if [ "$MODE" = "autonomous" ]; then
  # Spawn verifier agent — approve only on green evidence
  # Port 8091 for any dev server verification
elif [ "$AUTO_CFG" = "true" ]; then
  # Legacy yolo: blind auto-approve
else
  # Interactive: present to user
fi
```

### Agent frontmatter hardening (what works for plugin agents)

```markdown
---
name: executor
description: Executes planned tasks with atomic git commits...
tools: Read, Write, Edit, Bash, Grep, Glob, ...
color: yellow
maxTurns: 50
isolation: worktree
# NOTE: permissionMode is intentionally omitted — ignored for plugin agents
# Set at session level via: claude -p "..." --permission-mode acceptEdits
---
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `isolation: "worktree"` did not exist | Supported in agent frontmatter | 2025-2026 | Enables truly isolated parallel executors |
| SubagentStop was observation-only | SubagentStop supports `decision: block` | Verified June 2026 | Enables retry-once pattern |
| Stop hook warn-only by convention | Stop hook can return `decision: block` | Verified June 2026 | Enables auto-resume |
| `memory: true` (boolean) | `memory: "user"\|"project"\|"local"` | Verified June 2026 | Explicit scope for memory storage |
| Task tool | Renamed to Agent tool in v2.1.63 | 2025 | `Task(...)` still works as alias |

**Deprecated/outdated:**
- `permissionMode` in plugin agent frontmatter: silently ignored — use session-level flags instead
- `hooks` in plugin agent frontmatter: silently ignored — use global `hooks.json` instead
- `require_verification`/`require_tests` config fields: written but never read — remove in this objective

---

## Open Questions

1. **Where does the autonomous-mode Stop hook detect "mid-execution"?**
   - What we know: `verify-completion.js` already reads STATE.md and checks for `"Executing"` or `"In progress"` strings
   - What's unclear: Is this string match reliable enough, or should it check for incomplete SUMMARY.md count?
   - Recommendation: Use both signals: string match in STATE.md AND check that `incomplete_jobs > 0` via `df-tools objective-job-index` for the current objective

2. **Decision queue: how does the orchestrator know which TRDs are blocked on a pending decision?**
   - What we know: TRD frontmatter already has `depends_on`, and `objective-job-index` groups by wave
   - What's unclear: There is no `decision_id` field in current TRD frontmatter — would need to add it, or infer from wave position
   - Recommendation: Add optional `decision_gate: DECISION-001` frontmatter field to TRDs that the planner creates when it generates a checkpoint:decision task. The decision queue can then use this to compute the blocked set.

3. **Does `isolation: worktree` work correctly when the plugin's agents/ dir is the source of the executor?**
   - What we know: Plugin agents are loaded from `plugins/devflow/agents/`. Worktree isolation clones the repo, so the worktree will have its own copy of the repo including `plugins/devflow/agents/executor.md`.
   - What's unclear: Whether the worktree executor can still read `.planning/` files in the main tree (it can't — it has its own `.planning/` unless the planner provisions shared state).
   - Recommendation: Worktree executors should receive their JOB/TRD file via the spawn prompt (the orchestrator passes the full TRD content), not by file path. The `.planning/` dir in the worktree is populated by the provisioning step (similar to existing `workstreams.cjs` pattern).

4. **Loop prevention counter file: should it be per-session or per-execution?**
   - What we know: Claude sessions can span multiple executions. A session that runs two back-to-back objectives would have a stale counter from the first.
   - Recommendation: Key the counter on the objective+wave being executed, not on session. Use `.planning/.autonomous-resume-{objective_number}` and clear when that objective's execution completes.

---

## Sources

### Primary (HIGH confidence)

- Claude Code official docs (hooks) — fetched June 2026 from code.claude.com/docs/en/hooks: Stop hook `decision: block`, SubagentStop `decision: block` + `additionalContext`, common input fields, loop prevention patterns
- Claude Code official docs (sub-agents) — fetched June 2026: `isolation: worktree`, `maxTurns`, `memory: user|project|local`, `permissionMode` values, plugin agent restrictions on `permissionMode`/`hooks`/`mcpServers`
- Direct codebase reads (devflow-claude repo): `verify-completion.js`, `verify-commits.js`, `config.cjs`, `init.cjs`, `notifier.cjs`, `execute-objective.md` (lines 382-390, 336-375), `executor.md`, `verifier.md` Step 8, `checkpoints.md`, `auto-behaviors.md`, `transition.md`, `complete-milestone.md`, `new-project.md`, `hooks.json`

### Secondary (MEDIUM confidence)

- Claude Code docs (hooks) on SubagentStop `additionalContext` re-prompt behavior: documented as "adds context for Claude to act on before the subagent finishes" — the exact re-prompt mechanism is not specified in detail

### Tertiary (LOW confidence)

- `injection: worktree` + shared `.planning/` interaction: inferred from worktrees.cjs provisioning pattern; not explicitly tested
- Decision queue `decision_gate` frontmatter field: design recommendation only, no prior art in codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing code read directly; no new deps needed
- Architecture patterns 1-2 (config + verifier delegation): HIGH — clear edit points identified in existing files
- Architecture pattern 3 (decision queue): MEDIUM — file format designed from scratch; dependency computation requires new `decision_gate` TRD frontmatter field
- Architecture patterns 4-5 (Stop/SubagentStop hooks): HIGH — platform behavior confirmed from official docs
- Pattern 6 (agent hardening): HIGH for `maxTurns`/`isolation`; LOW for `permissionMode` (silently ignored for plugin agents — documented limitation)
- Pitfalls: HIGH — most discovered from direct code reading or official docs

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (stable platform; hook schema unlikely to change)
