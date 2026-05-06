---
objective: 15-phase-a-routing-keystone
created: 2026-05-04
sources:
  - GitHub issue #26 (Phase A spec — A1, A2, A3, A4 sub-tasks)
  - GitHub issue #25 (Plan B ambient-mode parent tracker)
  - plugins/devflow/hooks/route-intent.js (current advisory implementation, lines 33-49 INTENT_MAP)
  - plugins/devflow/hooks/gate-edits.js (current warn-only via permissionDecision: ask)
  - plugins/devflow/hooks/verify-completion.js (Stop hook scaffold to extend with audit log)
  - plugins/devflow/hooks/sync-runtime.js (SessionStart pattern to mirror in classify-session.js)
  - plugins/devflow/hooks/hooks.json (registration order — sync-runtime first, classify-session AFTER)
  - plugins/devflow/hooks/gate-interactive.js (CMD_POS regex + skipIf pattern — model for tightened intent regex)
  - plugins/devflow/hooks/gate-interactive.test.js (exemplar hook test pattern; 23 patterns enumerated)
  - plugins/devflow/hooks/inject-org-context.js (SessionStart hook with findPlanningDir + renderPreamble exports)
  - plugins/devflow/hooks/inject-org-context.test.js (SessionStart hook test exemplar)
  - plugins/devflow/devflow/bin/lib/brownfield-detector.cjs (pure-logic two-tier API exemplar — pure fn + I/O wrapper)
  - plugins/devflow/devflow/bin/lib/skill-route.cjs (CLI subcommand + _setRunFs DI exemplar)
  - plugins/devflow/devflow/bin/lib/__fixtures__/skill-route-fixtures.cjs (factory-builder fixture pattern)
  - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs (existing intent fixtures — extend, don't replace)
  - .planning/objectives/12-skill-consolidation/12-RESEARCH.md § "Phase A handoff (live snapshot)" (consolidated-skill JSON to inject)
  - plugins/devflow/devflow/references/auto-behaviors.md (per-task caution model from obj 14)
---

# Research — Phase A: Authoritative routing keystone

## Standard stack (no new dependencies)

- **Test runner:** Node native `node --test`. Hook tests live alongside hooks in `plugins/devflow/hooks/<name>.test.js` (note `.test.js`, not `.test.cjs` — hooks are `.js` modules per the existing convention; lib helpers are `.cjs`).
- **Module format:** `.js` for hooks (no `'use strict'` boilerplate; CommonJS implicit), `.cjs` for `lib/` helpers.
- **CLI surface:** `df-tools <command>` invokes `node ~/.claude/devflow/bin/df-tools.cjs`; output via `output()` / `error()` helpers from `lib/helpers.cjs`.
- **Hook contract:** Read JSON from stdin (the event payload from Claude Code); emit JSON to stdout with `hookSpecificOutput.hookEventName` and event-appropriate fields (`additionalContext` for UserPromptSubmit/SessionStart, `permissionDecision` for PreToolUse). Stderr writes are diagnostic-only; never block via stderr alone.
- **Process model:** Hooks run as short-lived subprocess per event. Expensive work (file walks, network) is forbidden in hot-path hooks. `route-intent.js` and `gate-edits.js` are hot-path (every prompt / every tool use); `classify-session.js` runs once per session start.

## Phase G consolidated-skill snapshot (locked input — from 12-RESEARCH.md)

`classify-session.js` injects a routing decision table that maps user intent to consolidated skills. The skill list comes from the live snapshot captured in 12-RESEARCH.md after Phase G shipped:

```json
{
  "skills": [
    { "name": "objective",   "subcommands": ["add", "remove"] },
    { "name": "milestone",   "subcommands": ["new", "audit", "complete", "gaps"] },
    { "name": "workstreams", "subcommands": ["setup", "status", "merge", "run"] },
    { "name": "todo",        "subcommands": ["add", "list"] },
    { "name": "status",      "subcommands": [null, "check", "pause", "resume"] }
  ],
  "deprecated": {
    "add-objective": "objective add",
    "insert-objective": "objective add",
    "remove-objective": "objective remove",
    "new-milestone": "milestone new",
    "audit-milestone": "milestone audit",
    "complete-milestone": "milestone complete",
    "plan-milestone-gaps": "milestone gaps",
    "add-todo": "todo add",
    "check-todos": "todo list",
    "pause-work": "status pause",
    "resume-work": "status resume",
    "progress": "status",
    "health": "status check"
  }
}
```

**Routing decision table (locked):**

| Intent | Recommended skill | Notes |
|---|---|---|
| Q&A / explanation / exploration | (no skill — respond directly) | Default for non-imperative prompts |
| 1-2 line change, single file | `/devflow:micro` | **Inert until Phase B (obj 7) ships** — note in injection |
| <5 files, <200 LOC | `/devflow:quick` | |
| Multi-file feature | `/devflow:build` | |
| Bug investigation | `/devflow:debug` | |
| Status check | `/devflow:status` | Default subcommand (no arg) |
| Resume | `/devflow:status resume` | Consolidated form (was `/devflow:resume-work`) |
| Plan an objective | `/devflow:plan-objective` | |
| Verify work | `/devflow:verify-work` | |
| New project | `/devflow:new-project` | |
| Pause | `/devflow:status pause` | |

**Important:** `/devflow:micro` is referenced but DOES NOT EXIST yet (Phase B / obj 7). The classify-session injection includes it with a parenthetical note: `(/devflow:micro is in development — for now, route 1-2 line changes to /devflow:quick)`. This avoids the model trying to invoke a missing skill while preserving the routing-table contract for when B lands.

## Architecture patterns to mimic

### Pattern: SessionStart hook with pure-logic helper (mirror `inject-org-context.js`)

```js
// plugins/devflow/hooks/classify-session.js
const fs = require('fs');
const path = require('path');
const { classifySession, renderRoutingPreamble } = require('../devflow/bin/lib/classifier.cjs');

function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) return path.join(dir, '.planning');
    dir = path.dirname(dir);
  }
  return null;
}

function main() {
  if (process.env.DEVFLOW_SKIP_CLASSIFY === '1') return;

  const cwd = process.cwd();
  const planningDir = findPlanningDir(cwd);
  const mode = classifySession({ cwd, planningDir });

  if (mode === 'skip') return;  // not a DevFlow project, no output

  const preamble = renderRoutingPreamble({ mode });
  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: preamble,
    },
  };
  process.stdout.write(JSON.stringify(output));
}

main();

module.exports = { findPlanningDir };  // exported for unit tests
```

The pure logic (`classifySession`, `renderRoutingPreamble`) lives in `lib/classifier.cjs` so unit tests don't need a tmpdir for every assertion.

### Pattern: pure-logic two-tier API (mirror `brownfield-detector.cjs`)

```js
// plugins/devflow/devflow/bin/lib/classifier.cjs
'use strict';

// Pure function — testable without filesystem
function classifySession({ planningDir, hasGitDir, hasDeclineMarker }) {
  if (hasDeclineMarker) return 'skip';
  if (planningDir) return 'ambient';
  if (hasGitDir) return 'init-offer';
  return 'skip';
}

// Pure function — renders the system-prompt block
function renderRoutingPreamble({ mode }) {
  if (mode === 'ambient') return AMBIENT_PREAMBLE;
  if (mode === 'init-offer') return INIT_OFFER_PREAMBLE;
  return '';
}

module.exports = { classifySession, renderRoutingPreamble };
```

### Pattern: factory-builder fixtures (mirror `skill-route-fixtures.cjs`)

```js
// plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs
'use strict';

function buildClassifyInput({ planningDir = null, hasGitDir = false, hasDeclineMarker = false } = {}) {
  return { planningDir, hasGitDir, hasDeclineMarker };
}

module.exports = { buildClassifyInput };
```

### Pattern: hook subprocess test (mirror `inject-org-context.test.js`)

Two test layers:
1. **Pure-function tests** — call `classifySession` / `renderRoutingPreamble` directly, no subprocess
2. **Subprocess integration** — `spawnSync(node, [HOOK_PATH])` with stdin payload + tmpdir cwd, assert stdout JSON shape

This split keeps the test file fast (most assertions are pure-function) while still exercising the JSON-stdin → JSON-stdout contract.

## Box-drawn directive format (A2)

The current `route-intent.js` injection is one paragraph of advisory text. Per #26 it should be a **box-drawn directive** (visually distinct, obligatory tone). Locked format:

```
╔══════════════════════════════════════════════════════════════════════╗
║                  DEVFLOW ROUTING DIRECTIVE — OBLIGATORY              ║
╠══════════════════════════════════════════════════════════════════════╣
║ This is a DevFlow project (.planning/ exists).                       ║
║ The user's request matches intent: <skill-list>                      ║
║                                                                      ║
║ You MUST invoke <skill> via the Skill tool BEFORE editing any code.  ║
║ Do NOT call Edit, Write, or MultiEdit first — gate-edits.js will     ║
║ DENY direct edits in ambient mode without an active skill marker.    ║
║                                                                      ║
║ If the request is genuinely out of scope for DevFlow (a question,    ║
║ a tiny ad-hoc fix), you may proceed — but prefer /devflow:quick      ║
║ for any code change touching <5 files.                               ║
╚══════════════════════════════════════════════════════════════════════╝
```

The `<skill-list>` and `<skill>` placeholders are filled per-prompt by the regex match. Newlines and box characters survive the `additionalContext` channel verbatim (the channel is plaintext, not Markdown).

## Tightened regex rules (A2)

The current `INTENT_MAP` (route-intent.js:34-49) over-fires on Q&A. Tighten to **imperative or possessive forms only**:

| Rule | OLD regex | NEW regex | Rationale |
|---|---|---|---|
| Build intent | `\b(build|implement|ship|make|create)\s+(the|a|this|that|feature|it)\b` | `\b(build|implement|ship|make|create|add)\s+(?:the|a|an|this|that|some)\s+\w+` | Require an article OR `some`, then a noun — drops bare `make sense`, `create why` |
| Bug intent | `\b(debug|not\s+working|broken|error|bug|crash|fail(ed|ing)?)\b` | `\b(?:fix|debug|investigate|diagnose)\s+(?:the|this|that|a)\s+(?:bug|error|crash|failure)\b` OR `\b(?:why|what)\s+(?:is\|s)\s+.+(?:broken|failing|crashing)\b` (FIRST RULE FIRES; SECOND IS Q&A — DO NOT MATCH) | Imperative `fix the bug` fires; Q&A `why is X broken` does NOT |
| Plan intent | `\b(plan|break\s*down|design)\s+(objective|the|this|it)\b` | `\b(plan|break\s+down|design)\s+(?:the|this|an|a)\s+(?:objective|feature|task)\b` | Tighter; drops `plan the wedding` (no DevFlow noun) |
| Status intent | `\b(progress|status|where\s+are\s+we|what'?s?\s+next)\b` | (unchanged — already specific to project-state vocabulary) | OK as-is |
| Resume intent | `\b(resume|continue|pick\s+up|where\s+(we|I)\s+left)\b` | `\b(?:resume|continue|pick\s+up)\s+(?:the\s+)?work\b` OR `\bwhere\s+(?:we|I)\s+left\s+off\b` | Drops `continue reading` |

**False positives to reject (the 5 no-fire fixtures):**
1. `"What's the bug in the login code?"` — Q&A, not imperative
2. `"Why is this failing?"` — Q&A
3. `"Can you explain how the auth flow works?"` — explanation request
4. `"Continue reading the spec"` — `continue` not followed by `the work`
5. `"What does fix mean here?"` — meta-question about a word, not a fix request

**True positives to fire (the 10 fire fixtures):**
1. `"Fix the login bug"` → `/devflow:debug` (imperative + bug noun)
2. `"Build the dashboard feature"` → `/devflow:build`
3. `"Plan the next objective"` → `/devflow:plan-objective`
4. `"Verify the work I just shipped"` → `/devflow:verify-work`
5. `"What's our progress?"` → `/devflow:status`
6. `"Resume the work"` → `/devflow:status resume`
7. `"Pause the work for tonight"` → `/devflow:status pause`
8. `"Debug the crash in the worker"` → `/devflow:debug`
9. `"Add an objective for the new auth flow"` → `/devflow:objective add`
10. `"Investigate the failure in CI"` → `/devflow:debug`

These 15 fixtures live in `lib/__fixtures__/intent-fixtures.cjs` (extending the existing factory module).

## Override-phrase parsing (A3)

`gate-edits.js` allows Edit/Write through if the user's most recent prompt contains an explicit override phrase. The override phrases (locked):

- `skip devflow`
- `just edit`
- `bypass devflow`
- `force edit`

These are case-insensitive whole-word matches against the message. The hook reads `input.user_message` (or whichever field carries the prompt — verify against Claude Code hook payload schema; fallback to no-override if missing).

**Important:** the override applies to the CURRENT TOOL CALL only. It does NOT persist across calls — each Edit/Write must be in a turn whose user prompt contains the override, OR happen during an active skill (marker present). This prevents "skip devflow" once unlocking the rest of a session.

**Implementation:** PreToolUse hooks receive the `tool_input` and (per Claude Code docs) the prompt that initiated the turn. If the schema only provides the tool fields (no user prompt), fall back to:
- Check for env var `DEVFLOW_OVERRIDE_EDITS=1` (set by an earlier prompt-side hook that detected the override phrase) — but this requires a UserPromptSubmit companion hook to set it. Cleanest: keep override-phrase detection in `route-intent.js` (UserPromptSubmit) and have it write a short-lived marker `.planning/.override-edits` (TTL 60s) that `gate-edits.js` reads and clears on first use.

For this objective: ship the cleanest implementation. If the hook payload exposes the user prompt directly, use it. Otherwise, the marker-file approach is the fallback. Implementation TRD (15-03) decides based on actual payload schema (verified during execution).

## Skill-active marker file format

`.planning/.skill-active` is a JSON file written by `df-tools skill-active --start <name>`:

```json
{
  "skill": "build",
  "started_at": "2026-05-04T14:23:11.412Z",
  "pid": 12345
}
```

`gate-edits.js` only checks **existence** — it does not parse the JSON. The fields are diagnostic for debugging.

`df-tools skill-active --end` removes the file. Stale markers (PID dead, started_at >24h ago) are not auto-cleaned in this objective; cleanup logic is a follow-up if it becomes a problem.

**Atomicity:** writes use `fs.writeFileSync` with the default flag (which truncates). No locking is needed — last-write-wins is acceptable. The skill enters `--start`, does its work, exits `--end`. Concurrent skills are not supported (and don't make sense in DevFlow's model).

## Audit log format (A4)

`~/.claude/devflow/audit.log` is JSONL (one JSON object per line). Per-Stop schema:

```json
{
  "ts": "2026-05-04T14:23:11.412Z",
  "session_id": "<from-hook-payload>",
  "route_recommended": "/devflow:build",
  "skill_invoked": false,
  "prompt_summary": "Build the dashboard feature"
}
```

Fields:
- `ts` — ISO 8601 timestamp at Stop event
- `session_id` — Claude Code session identifier (from hook payload, may be undefined → write `"unknown"`)
- `route_recommended` — what `route-intent.js` recommended this turn (read from session-scoped marker `.planning/.route-recommendation` written by route-intent during the turn, then cleared at Stop)
- `skill_invoked` — `true` if the skill was actually invoked (heuristic: check for any tool-call to `Skill` in the turn's tool history; payload TBD against actual hook schema)
- `prompt_summary` — first 80 chars of the prompt (for human review of the log)

If any field is unavailable from the hook payload, write the literal string `"unknown"`. The audit log is observability-only — failures to log silently no-op (never block, never crash the Stop event).

**Log rotation:** out of scope. The 7-day pilot generates ~10-100 lines; manual rotation is fine. Future work can add a 1MB-size guard.

## Common pitfalls

- **`hooks.json` registration order matters.** SessionStart hooks run in the order declared. `sync-runtime.js` MUST run first (mirrors the `lib/` runtime to `~/.claude/devflow/`). `classify-session.js` reads from `~/.claude/devflow/bin/lib/classifier.cjs` — if it runs before sync, the require fails on first install. **Mitigation:** `classify-session.js` requires from the BUNDLED path (`${CLAUDE_PLUGIN_ROOT}/devflow/bin/lib/classifier.cjs` resolved relative to the hook script), not the home-mirrored path. This sidesteps the ordering coupling.
- **Hook payload schema is undocumented in this repo.** Existing hooks (`route-intent.js`, `inject-org-context.js`) parse `input.prompt` / `input.tool_name` / `input.tool_input.file_path` empirically. For new fields (`input.user_message` for override-phrase, `input.session_id` for audit) — verify against actual payloads at execution time. Fallback: write `"unknown"` and log a warning.
- **`process.cwd()` in hooks is project-root, NOT hook-script-dir.** All `findPlanningDir(process.cwd())` walks find the user's project. Don't accidentally use `__dirname` (which points into the plugin tree).
- **Test isolation: `~/.claude/devflow/audit.log` is REAL.** Tests for verify-completion.js MUST redirect via env var (e.g. `DEVFLOW_AUDIT_LOG_PATH=<tmpfile>`) to avoid polluting the user's actual log.
- **The `route-intent.js` exports the regex map.** Tests should `require('./route-intent.js')` and assert `INTENT_MAP` shape directly, NOT spawn the hook 15 times. Subprocess tests reserved for end-to-end JSON-stdin/stdout contract verification (1-2 cases).
- **Override-phrase persistence.** `skip devflow` once should NOT unlock all future edits in the session — it scopes to the current turn. The marker-file fallback (if needed) MUST have a TTL or be consumed-and-cleared on first use.
- **`classify-session.js` runs every SessionStart, including subagent starts.** SessionStart fires on every new conversation. For subagents, the cwd is the parent's cwd (DevFlow project), so it WILL fire. This is intentional — subagent threads also benefit from the routing preamble.

## Anti-patterns (don't repeat)

- **Inline branching in hooks.** Each hook should delegate to a `lib/` helper for non-trivial logic. `gate-interactive.js` exemplifies — pattern table is exported, tested separately.
- **LLM-generated test data.** Per global TDD playbook habit 4: hand-build factories in `__fixtures__/`. The 10/5 fire/no-fire prompts are CURATED by-hand — they encode the regex contract.
- **Property-based testing.** Subcommand parsing + regex enumeration is finite. Enumerate the cases.
- **Gherkin / BDD.** Descriptive `test()` names suffice.
- **Mixing concerns across TRDs.** Keep classifier (15-01), regex tightening (15-02), gate (15-03), skill-active CLI (15-04), and audit log (15-05) in separate TRDs. Each is one concern, ~50% context budget, atomic commit.
- **Spawning subprocesses for unit tests.** Test pure functions directly via `require()`. Reserve `spawnSync` for the 1-2 end-to-end JSON-contract assertions per hook.
- **Hard-coding the consolidated-skill list in TWO places** (here AND in 12-RESEARCH.md). The 12 snapshot is the source. `classifier.cjs` should embed the list as a constant; do NOT shell out to `df-tools skill-route --list` in a hot-path SessionStart hook (adds latency). The constant is allowed to drift if the snapshot updates — Phase G's deprecation strategy ensures backward compat for ~2 versions.

## Validation gates

```bash
npm test
# Expected: 1551 pre-existing tests still pass (1 pre-existing E2E1 failure stays the same — unrelated)
# This objective adds ~50-80 new tests across 5 TRDs (pure-function + subprocess + fixture suite)
```

There is no separate lint or build command in this codebase — only `npm test`.

## Phase A handoff to Phase B / Phase C

This objective produces:

1. **`classify-session.js` SessionStart hook** — Phase B (`/devflow:micro`) gets recommended for 1-2 line changes once it ships; Phase C reuses the same hook to detect non-DevFlow projects (mode `init-offer`) and inject the init prompt.
2. **`gate-edits.js` strict mode** — Phase B's `/devflow:micro` skill must call `df-tools skill-active --start micro` at entry / `--end` at exit so it can edit. This becomes the canonical example for how new skills integrate with the gate.
3. **`audit.log`** — pilot data feeds the v1.2 retro. If <30% obedience after 7 days, Phase A's strict gate is the primary lever (already shipped); follow-ups would be stronger injection surfaces (a Claude Code hook feature request).

## Test count estimate

| TRD | New tests | Type |
|---|---|---|
| 15-01 | ~18-22 | pure-function (classifySession matrix) + subprocess (3-4 e2e) + renderRoutingPreamble snapshot |
| 15-02 | ~20 | 10 fire + 5 no-fire fixtures + INTENT_MAP shape + box-drawn render + 2 subprocess e2e |
| 15-03 | ~15-18 | DENY paths + ALLOW paths (skill-active marker, override phrase, .planning, .md) + subprocess e2e |
| 15-04 | ~10-12 | --start writes file + --end removes + idempotency + bad input handling + dispatcher integration |
| 15-05 | ~8-10 | log line shape + missing fields → "unknown" + tmpdir audit log isolation + no-crash on filesystem error |
| **Total** | **~71-82** | All atomic, all fixture-driven |

Plus 1551 → 1551 (no regression of pre-existing tests).
