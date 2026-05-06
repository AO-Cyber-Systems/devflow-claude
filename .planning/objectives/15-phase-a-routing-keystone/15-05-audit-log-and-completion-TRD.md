---
objective: 15-phase-a-routing-keystone
trd: "05"
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/verify-completion.js
  - plugins/devflow/hooks/verify-completion.test.js
autonomous: true
requirements:
  - A4
must_haves:
  truths:
    - "verify-completion.js Stop hook appends a JSONL entry to ~/.claude/devflow/audit.log per turn in ambient mode"
    - "Audit log entry shape: {ts, session_id, route_recommended, skill_invoked, prompt_summary}"
    - "Missing fields from hook payload are written as the literal string 'unknown' (never crash)"
    - "Audit logging is observability-only — never blocks Stop event, never writes to stdout"
    - "Audit log path is overridable via DEVFLOW_AUDIT_LOG_PATH env var (for tests)"
    - "Audit log is JSONL (one JSON object per line, newline-terminated)"
    - "Filesystem errors (EACCES, ENOSPC, etc.) silently no-op — hook never crashes Stop event"
    - "Existing verify-completion.js behavior preserved (SUMMARY.md scan + warnings)"
    - "Audit logging only fires in ambient mode (DevFlow project detected)"
  artifacts:
    - path: "plugins/devflow/hooks/verify-completion.js"
      provides: "Existing SUMMARY scan + new audit log emission"
      min_lines: 130
      exports: ["renderAuditEntry", "appendAuditLog", "auditLogPath"]
    - path: "plugins/devflow/hooks/verify-completion.test.js"
      provides: "Unit tests for renderAuditEntry shape + appendAuditLog filesystem behavior + integration with existing SUMMARY scan"
      min_lines: 140
  key_links:
    - from: "plugins/devflow/hooks/verify-completion.js"
      to: "~/.claude/devflow/audit.log"
      via: "fs.appendFileSync (or override path from DEVFLOW_AUDIT_LOG_PATH)"
      pattern: "audit\\.log"
---

<objective>
Add audit log emission to `verify-completion.js` (Stop hook). After each Stop event in ambient mode, append a JSONL line to `~/.claude/devflow/audit.log` capturing: timestamp, session_id, route_recommended (what route-intent.js suggested), skill_invoked (whether the skill was actually called), prompt_summary (first 80 chars).

Pure observability — no blocking, no behavior change. The audit log feeds the v1.2 retro: if obedience is ≥30% over the 7-day pilot, the routing-injection layer (15-01 + 15-02) is sufficient; if <30%, the hard gate (15-03) is the primary lever.

Existing `verify-completion.js` behavior (scan recent SUMMARY.md files, warn on Self-Check FAILED / missing Task Evidence) is preserved.

Purpose: A4 from issue #26. Quantitative measurement of Plan B success.

Output: Modified `verify-completion.js` with audit log emission + new `verify-completion.test.js` covering the audit shape + fs behavior + DEVFLOW_AUDIT_LOG_PATH override.
</objective>

<file_tree>
plugins/devflow/hooks/
├── verify-completion.js         ← MODIFY (add audit log emission alongside existing SUMMARY scan)
└── verify-completion.test.js    ← CREATE
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: existing verify-completion.js structure (preserve + extend)

```js
// Current shape (preserved):
//   1. findPlanningDir(cwd) — null if not DevFlow
//   2. Scan recent SUMMARY.md files in objectives/
//   3. Warn on Self-Check FAILED / missing Task Evidence / empty evidence
//   4. process.exit(0) implicitly
//
// New shape adds:
//   5. After existing logic, emit audit log entry (best-effort, never crash)

const fs = require('fs');
const path = require('path');
const os = require('os');

function findPlanningDir() { /* unchanged */ }

// ─── New audit log helpers (testable) ────────────────────────────────────────

function auditLogPath() {
  if (process.env.DEVFLOW_AUDIT_LOG_PATH) return process.env.DEVFLOW_AUDIT_LOG_PATH;
  return path.join(os.homedir(), '.claude', 'devflow', 'audit.log');
}

function renderAuditEntry({ session_id, route_recommended, skill_invoked, prompt_summary, ts }) {
  return JSON.stringify({
    ts: ts || new Date().toISOString(),
    session_id: session_id || 'unknown',
    route_recommended: route_recommended || 'none',
    skill_invoked: typeof skill_invoked === 'boolean' ? skill_invoked : false,
    prompt_summary: typeof prompt_summary === 'string' ? prompt_summary.slice(0, 80) : 'unknown',
  });
}

function appendAuditLog(entry, logPath) {
  try {
    const dir = path.dirname(logPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logPath, entry + '\n', 'utf8');
    return { ok: true };
  } catch (e) {
    // Best-effort logging — never crash the Stop event
    return { ok: false, reason: e.message };
  }
}

// ─── Read input from stdin (Stop hook payload) ────────────────────────────────

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function parsePayload() {
  try { return JSON.parse(readStdin() || '{}'); } catch { return {}; }
}

// ─── route-recommendation marker (written by route-intent.js — read here) ────
// Phase A architecture: route-intent.js writes the recommended skill to
// .planning/.route-recommendation during a UserPromptSubmit turn. Stop hook
// reads it for the audit log, then clears it.
//
// If the marker doesn't exist, route_recommended = 'none' (the turn was Q&A
// or the regex didn't fire — both interesting signals for the audit).

function readAndClearRouteMarker(planningDir) {
  if (!planningDir) return null;
  const p = path.join(planningDir, '.route-recommendation');
  if (!fs.existsSync(p)) return null;
  let content = null;
  try {
    content = fs.readFileSync(p, 'utf8').trim();
    fs.unlinkSync(p);
  } catch {}
  return content;
}

// ─── main: existing SUMMARY scan + new audit emit ────────────────────────────

function main() {
  const planningDir = findPlanningDir();
  if (!planningDir) return; // Not a DevFlow project

  // Existing SUMMARY scan logic — preserved verbatim
  // (lines 33-93 of current verify-completion.js)
  scanRecentSummaries(planningDir);

  // New: emit audit log entry (best-effort)
  emitAuditEntry(planningDir);
}

function emitAuditEntry(planningDir) {
  try {
    const payload = parsePayload();
    const route = readAndClearRouteMarker(planningDir);
    const entry = renderAuditEntry({
      session_id: payload.session_id,
      route_recommended: route,
      skill_invoked: detectSkillInvoked(payload),
      prompt_summary: payload.prompt || payload.user_message,
    });
    appendAuditLog(entry, auditLogPath());
  } catch {
    // Silently no-op
  }
}

function detectSkillInvoked(payload) {
  // Heuristic: check for any tool-call to Skill in the turn's tool history.
  // The Stop payload may include `tools_used` or similar; verify against
  // actual schema. Fallback: false (no false-positive).
  if (!payload || !payload.tools_used) return false;
  if (Array.isArray(payload.tools_used)) {
    return payload.tools_used.some(t => t === 'Skill' || (t && t.name === 'Skill'));
  }
  return false;
}

if (require.main === module) main();

module.exports = {
  renderAuditEntry,
  appendAuditLog,
  auditLogPath,
  findPlanningDir,
};
```

### Pattern: test with DEVFLOW_AUDIT_LOG_PATH isolation (mirror inject-handoff-results.test.js style)

```js
// plugins/devflow/hooks/verify-completion.test.js
const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'verify-completion.js');
const { renderAuditEntry, appendAuditLog, auditLogPath } = require('./verify-completion.js');

describe('renderAuditEntry shape', () => {
  test('full payload renders all 5 fields', () => {
    const entry = renderAuditEntry({
      ts: '2026-05-04T00:00:00Z',
      session_id: 'abc-123',
      route_recommended: '/devflow:build',
      skill_invoked: true,
      prompt_summary: 'Build the dashboard',
    });
    const parsed = JSON.parse(entry);
    assert.equal(parsed.ts, '2026-05-04T00:00:00Z');
    assert.equal(parsed.session_id, 'abc-123');
    assert.equal(parsed.route_recommended, '/devflow:build');
    assert.equal(parsed.skill_invoked, true);
    assert.equal(parsed.prompt_summary, 'Build the dashboard');
  });

  test('missing session_id → "unknown"', () => {
    const entry = renderAuditEntry({ ts: 'x', route_recommended: 'r', skill_invoked: false });
    assert.equal(JSON.parse(entry).session_id, 'unknown');
  });

  test('missing route_recommended → "none"', () => {
    const entry = renderAuditEntry({ ts: 'x', session_id: 's' });
    assert.equal(JSON.parse(entry).route_recommended, 'none');
  });

  test('missing prompt_summary → "unknown"', () => {
    const entry = renderAuditEntry({ ts: 'x', session_id: 's' });
    assert.equal(JSON.parse(entry).prompt_summary, 'unknown');
  });

  test('skill_invoked non-boolean → false', () => {
    const entry = renderAuditEntry({ ts: 'x', session_id: 's', skill_invoked: 'yes' });
    assert.equal(JSON.parse(entry).skill_invoked, false);
  });

  test('prompt_summary truncated to 80 chars', () => {
    const long = 'x'.repeat(200);
    const entry = renderAuditEntry({ ts: 'x', session_id: 's', prompt_summary: long });
    assert.equal(JSON.parse(entry).prompt_summary.length, 80);
  });

  test('omitted ts → ISO 8601 timestamp generated', () => {
    const entry = renderAuditEntry({ session_id: 's' });
    const parsed = JSON.parse(entry);
    assert.match(parsed.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('appendAuditLog filesystem behavior', () => {
  let tmpLog;
  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-log-'));
    tmpLog = path.join(tmpDir, 'audit.log');
  });
  afterEach(() => {
    try { fs.rmSync(path.dirname(tmpLog), { recursive: true, force: true }); } catch {}
  });

  test('creates parent directory if missing', () => {
    const nested = path.join(path.dirname(tmpLog), 'a/b/c/audit.log');
    const result = appendAuditLog('{}', nested);
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(nested), true);
  });

  test('appends entry as new line', () => {
    appendAuditLog('{"first":1}', tmpLog);
    appendAuditLog('{"second":2}', tmpLog);
    const lines = fs.readFileSync(tmpLog, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).first, 1);
    assert.equal(JSON.parse(lines[1]).second, 2);
  });

  test('returns ok:false on filesystem error (e.g. unwritable path)', () => {
    // Pass a path under a read-only ancestor — can't create reliably across all
    // OSes; instead use an obviously invalid path
    const result = appendAuditLog('{}', '/nonexistent-root-dir/audit.log');
    assert.equal(result.ok, false);
  });
});

describe('auditLogPath', () => {
  test('returns DEVFLOW_AUDIT_LOG_PATH env when set', () => {
    const prev = process.env.DEVFLOW_AUDIT_LOG_PATH;
    process.env.DEVFLOW_AUDIT_LOG_PATH = '/tmp/custom-audit.log';
    try {
      assert.equal(auditLogPath(), '/tmp/custom-audit.log');
    } finally {
      if (prev === undefined) delete process.env.DEVFLOW_AUDIT_LOG_PATH;
      else process.env.DEVFLOW_AUDIT_LOG_PATH = prev;
    }
  });

  test('defaults to ~/.claude/devflow/audit.log when env unset', () => {
    const prev = process.env.DEVFLOW_AUDIT_LOG_PATH;
    delete process.env.DEVFLOW_AUDIT_LOG_PATH;
    try {
      assert.equal(auditLogPath(), path.join(os.homedir(), '.claude', 'devflow', 'audit.log'));
    } finally {
      if (prev !== undefined) process.env.DEVFLOW_AUDIT_LOG_PATH = prev;
    }
  });
});

describe('subprocess integration — Stop hook in ambient mode', () => {
  test('writes audit log entry with redirected DEVFLOW_AUDIT_LOG_PATH', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-e2e-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      fs.mkdirSync(path.join(tmp, '.planning', 'objectives'), { recursive: true });
      const payload = JSON.stringify({
        session_id: 'test-session-1',
        prompt: 'Build the dashboard feature',
      });
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: payload,
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0);
      assert.equal(fs.existsSync(logPath), true);
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.session_id, 'test-session-1');
      assert.equal(parsed.prompt_summary, 'Build the dashboard feature');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('no-op when not a DevFlow project (no .planning)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-non-df-'));
    const logPath = path.join(tmp, 'audit.log');
    try {
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: logPath },
      });
      assert.equal(result.status, 0);
      assert.equal(fs.existsSync(logPath), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('preserves existing SUMMARY scan warnings', () => {
    // Create a recent SUMMARY.md with FAILED marker; assert stderr contains warning
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-comp-summary-'));
    const objDir = path.join(tmp, '.planning', 'objectives', '99-test');
    try {
      fs.mkdirSync(objDir, { recursive: true });
      const summaryPath = path.join(objDir, '99-01-SUMMARY.md');
      fs.writeFileSync(summaryPath, '# x\nSelf-Check: FAILED\n', 'utf8');
      // Touch to ensure mtime is recent
      fs.utimesSync(summaryPath, new Date(), new Date());
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_AUDIT_LOG_PATH: path.join(tmp, 'audit.log') },
      });
      // The existing scan emits warnings via console.error
      assert.match(result.stderr, /Self-Check FAILED/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
```

</codebase_examples>

<anti_patterns>

- **Do NOT make audit logging blocking.** Every fs operation in the audit path is wrapped in try/catch. Failures silently no-op. The Stop event MUST complete successfully even if the audit log is unwritable.
- **Do NOT remove the existing SUMMARY scan logic.** Preserve lines 33-93 of current `verify-completion.js` verbatim. The audit log is ADDITIVE, not a replacement.
- **Do NOT log to stdout.** Stop hooks shouldn't produce output (no `additionalContext` for Stop). All diagnostic goes to stderr (existing behavior).
- **Do NOT use synchronous fs.appendFile without try/catch.** ENOSPC, EACCES, EROFS all need silent recovery.
- **Do NOT log every Stop event regardless of mode.** Only ambient mode (`.planning/` exists) — same gate as the existing SUMMARY scan.
- **Do NOT write to the real `~/.claude/devflow/audit.log` from tests.** Always set `DEVFLOW_AUDIT_LOG_PATH` to a tmpdir-scoped path. Verify by checking that test file does NOT modify the user's home directory.
- **Do NOT pre-validate the JSONL format on read.** Audit log is write-only from this hook's perspective. Read-side tooling (analytics, retros) is out of scope.

</anti_patterns>

<error_recovery>

- **`fs.appendFileSync` throws ENOSPC / EACCES:** the wrapping `try/catch` swallows the error and returns `{ ok: false, reason: e.message }`. The `emitAuditEntry` caller doesn't check the return — it's best-effort. Stop event continues normally.
- **Hook payload schema doesn't include expected fields:** `renderAuditEntry` defaults to `'unknown'` / `'none'` / `false`. The audit log entry is still well-formed JSONL. The retro script can filter `session_id === 'unknown'` if needed.
- **`DEVFLOW_AUDIT_LOG_PATH` points to a directory (not a file):** `fs.appendFileSync` throws EISDIR. Caught by try/catch, silently no-op. User error; not the hook's job to validate.
- **Log file grows unbounded over the 7-day pilot:** acceptable. Ballpark estimate: 10-100 entries/day × 7 days × ~200 bytes/entry = 14-140KB. Manual rotation or deletion at end of pilot is fine. Future work can add a 1MB-size guard.
- **`route-recommendation` marker file race:** if route-intent.js writes the marker DURING the Stop phase (unlikely but possible if Stop fires while a turn is still in-flight), the read-and-clear race is benign — the next turn will overwrite it. Don't add locking.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/15-phase-a-routing-keystone/15-CONTEXT.md
@.planning/objectives/15-phase-a-routing-keystone/15-RESEARCH.md

@plugins/devflow/hooks/verify-completion.js
@plugins/devflow/hooks/route-results.js
@plugins/devflow/hooks/route-results.test.js
@plugins/devflow/hooks/inject-handoff-results.test.js
</context>

<research_context>

## Audit log format (locked from 15-RESEARCH.md)

JSONL — one JSON object per line. Per-Stop schema:

```json
{
  "ts": "2026-05-04T14:23:11.412Z",
  "session_id": "<from-hook-payload-or-unknown>",
  "route_recommended": "/devflow:build",
  "skill_invoked": false,
  "prompt_summary": "Build the dashboard feature"
}
```

Fields:
- `ts` — ISO 8601 (default: `new Date().toISOString()` at emission)
- `session_id` — from payload's `session_id` field; `"unknown"` if absent
- `route_recommended` — read from `.planning/.route-recommendation` (written by route-intent.js during the turn); `"none"` if marker absent
- `skill_invoked` — heuristic: payload's `tools_used` array contains `Skill` (or `{name:'Skill'}`); `false` if undetermined
- `prompt_summary` — first 80 chars of `payload.prompt` or `payload.user_message`; `"unknown"` if neither

## Path defaults

- Default: `~/.claude/devflow/audit.log` (resolved via `os.homedir() + '.claude/devflow/audit.log'`)
- Override: `DEVFLOW_AUDIT_LOG_PATH` env var (used by tests, debugging)

## Route-recommendation marker

`route-intent.js` (TRD 15-02) does NOT currently write a marker. This TRD adds the marker WRITE side as a small extension to 15-02's hook. Coordination: 15-02 ships the regex tightening + injection; 15-05 (this TRD) ships the audit log + relies on route-intent writing the marker.

**Decision:** to keep TRDs file-disjoint (parallel-safe), 15-05 reads the marker if present but does NOT depend on 15-02 writing it. If the marker is absent (e.g. 15-02 ships before 15-05's marker-write coordination), `route_recommended = "none"` is emitted. The audit log is still useful — it records prompts that did NOT match any rule (also a signal for the retro).

**Follow-up:** a tiny PR after both 15-02 and 15-05 land can add the `fs.writeFileSync(.route-recommendation, skill, 'utf8')` line to route-intent.js's `main()`. That's a 1-line addition; not blocking this TRD.

For this TRD: the audit log entry's `route_recommended` field is best-effort. If empty, the retro analyst sees `"none"` and infers either no-match or pre-coordination state.

## Existing verify-completion.js structure to preserve

- `findPlanningDir()` — unchanged
- Recent SUMMARY.md scan (last 10 minutes) — unchanged
- Warnings via `console.error` for FAILED / missing Task Evidence / empty evidence — unchanged
- Hook returns silently on non-DevFlow projects — unchanged

The audit emit logic is appended at the end of `main()`, AFTER the existing scan completes.

</research_context>

<gotchas>

- **The existing verify-completion.js does NOT read stdin.** It only reads from `findPlanningDir(process.cwd())` + filesystem. To get `session_id` / `prompt` for the audit, this TRD adds `parsePayload()` reading stdin — ensure this doesn't break the existing SUMMARY scan test (if any).
- **`process.exit` is forbidden in hooks.** Never call it. Stop hooks return naturally; the process exits on its own after `main()` completes.
- **`os.homedir()` may return `/root` in some CI environments.** This is fine — the tests override via `DEVFLOW_AUDIT_LOG_PATH` so the real home directory is never touched.
- **Cleanup paranoia in tests:** every test that creates a tmpdir MUST clean up via `try/finally + fs.rmSync(..., { recursive: true, force: true })`. Use `force: true` to handle Windows readonly bits if anyone ever runs tests on Windows.
- **The test `preserves existing SUMMARY scan warnings` requires utimesSync** to make the SUMMARY.md file appear "recent" (within 10 minutes). Without it, the scan filters by mtime and the file is ignored.
- **`payload.prompt` vs `payload.user_message` field name uncertainty.** Use both: `payload.prompt || payload.user_message || 'unknown'`. This is the same defensive pattern used in 15-03 for override-phrase detection.
- **Stop hooks may fire on subagent completion AND main agent.** Don't assume one Stop = one user turn. The audit log will record both — that's acceptable for the retro (filterable by session_id grouping).

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Add audit log emission to verify-completion.js + create tests</name>
  <files>
    plugins/devflow/hooks/verify-completion.js,
    plugins/devflow/hooks/verify-completion.test.js
  </files>
  <action>
This is a `type: standard` TRD (logging side effect, fixture pollution risk for tests — TDD ratio is too low to justify the extra ceremony). Standard task workflow:

1. Write tests FIRST that exercise the audit log shape + fs behavior (the "test list" is the same set as a TDD task; we just don't enforce strict RED-GREEN commits).
2. Implement the audit log emission alongside the existing SUMMARY scan.
3. Run tests; iterate until green.
4. Commit as a single `feat` commit (or split into RED/GREEN if you prefer — 2 commits is fine for standard tasks).

**Implementation steps:**

Step 1 — Read existing `verify-completion.js` carefully. Understand which lines are the SUMMARY scan (lines 33-93), which are scaffolding (1-32, 94-end). The audit log addition slots between line 93 (`if (warnings.length > 0)` block end) and the closing `main()` brace.

Step 2 — Refactor:
- Extract `scanRecentSummaries(planningDir)` function from the existing main() body — preserves behavior, makes main() readable
- Add `parsePayload()`, `auditLogPath()`, `renderAuditEntry()`, `appendAuditLog()`, `readAndClearRouteMarker()`, `emitAuditEntry()`, `detectSkillInvoked()` helpers per the codebase_examples block
- Update `main()` to call both `scanRecentSummaries(planningDir)` AND `emitAuditEntry(planningDir)` at the end
- Add `module.exports = { renderAuditEntry, appendAuditLog, auditLogPath, findPlanningDir };` at file end
- Wrap `main()` call in `if (require.main === module) main();` (was previously bare `main()` at file end)

Step 3 — Create `verify-completion.test.js` per the codebase_examples test file. ~15 tests across:
- `renderAuditEntry` shape (7 tests: full, missing session_id, missing route, missing prompt, non-bool skill_invoked, prompt truncation, default ts)
- `appendAuditLog` filesystem (3 tests: parent dir creation, append behavior, error handling)
- `auditLogPath` (2 tests: env override, default)
- Subprocess integration (3 tests: ambient mode write, non-DevFlow no-op, existing SUMMARY scan preserved)

Step 4 — Verify test isolation: NONE of the tests must touch the real `~/.claude/devflow/audit.log`. Audit by:
```bash
ls -la ~/.claude/devflow/audit.log 2>&1
node --test plugins/devflow/hooks/verify-completion.test.js
ls -la ~/.claude/devflow/audit.log 2>&1
# If the second listing differs from the first (mtime, size), tests are leaking. Fix the missing DEVFLOW_AUDIT_LOG_PATH.
```

Step 5 — Run full test suite to confirm no regressions:
```bash
npm test
```

Step 6 — Commit. Suggested split:
- `feat(15-05): add audit log emission to verify-completion.js`
- (optional follow-up) `test(15-05): add coverage for audit log shape + fs behavior`

OR a single combined commit:
- `feat(15-05): add audit log to verify-completion.js + tests`

# CRITICAL: Audit logging is best-effort. Every fs op wrapped in try/catch. Stop event NEVER blocks.
# GOTCHA: Existing SUMMARY scan warnings (Self-Check FAILED, etc.) MUST still emit to stderr. Test asserts.
# PATTERN: route-results.js for Stop-adjacent hook patterns; inject-handoff-results.test.js for subprocess test setup.
  </action>
  <verify>
node --test plugins/devflow/hooks/verify-completion.test.js
# Must pass all 15+ tests.

# Sanity-check: tests don't touch real audit log
test -f ~/.claude/devflow/audit.log && BEFORE=$(stat -f %m ~/.claude/devflow/audit.log 2>/dev/null || stat -c %Y ~/.claude/devflow/audit.log) || BEFORE="absent"
node --test plugins/devflow/hooks/verify-completion.test.js > /dev/null 2>&1
test -f ~/.claude/devflow/audit.log && AFTER=$(stat -f %m ~/.claude/devflow/audit.log 2>/dev/null || stat -c %Y ~/.claude/devflow/audit.log) || AFTER="absent"
[ "$BEFORE" = "$AFTER" ] && echo "OK: tests didn't touch real audit log" || echo "LEAK: tests modified real audit log"

# Smoke test: hook in ambient mode emits audit line
TMP=$(mktemp -d) && mkdir -p "$TMP/.planning/objectives" && \
  DEVFLOW_AUDIT_LOG_PATH="$TMP/audit.log" \
  echo '{"session_id":"smoke-test","prompt":"Build the dashboard"}' | \
  cd "$TMP" && \
  node /Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/hooks/verify-completion.js && \
  cat "$TMP/audit.log" && \
  rm -rf "$TMP"
# Expected: A JSON line containing "session_id":"smoke-test" and "prompt_summary":"Build the dashboard"

# Full test suite still passes
npm test 2>&1 | tail -20
# Expected: 1551 + ~15 new tests = ~1566 total, all pass except 1 pre-existing E2E1 unrelated failure
  </verify>
  <done>
- 2 files modified (verify-completion.js, verify-completion.test.js)
- 15+ tests pass
- verify-completion.js exports `renderAuditEntry`, `appendAuditLog`, `auditLogPath`, `findPlanningDir`
- Audit log shape: 5 fields, JSONL format
- Defaults: ts → ISO 8601, session_id/route/prompt → 'unknown'/'none'/'unknown'
- DEVFLOW_AUDIT_LOG_PATH env override works
- Tests do NOT touch real ~/.claude/devflow/audit.log
- Existing SUMMARY scan warnings preserved
- Stop event never blocks/crashes on filesystem errors
- 1-2 atomic commits
  </done>
  <recovery>
If existing SUMMARY scan tests (if any) regress: identify via `node --test plugins/devflow/hooks/verify-completion.test.js 2>&1 | grep FAIL`. Restore the exact SUMMARY scan logic by reverting via `git diff plugins/devflow/hooks/verify-completion.js` and re-extracting the scan function more carefully.

If `parsePayload()` blocks on stdin in tests (no `input` option to spawnSync): always pass `input: '{}'` even for "no-op" tests — empty object is valid JSON.

If audit log entries appear duplicated in tests: this can happen if tests share a tmpdir log path. Each test MUST have its own `mkdtempSync` to avoid cross-contamination.

If `node --test` reports "test passed" but the audit log assertion fails: the audit emission is wrapped in try/catch and may have silently swallowed an error. Add a `console.error('audit error:', e.message)` inside the catch temporarily to diagnose; remove before committing.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test>node --test plugins/devflow/hooks/verify-completion.test.js</test>
</validation_gates>

<verification>
Acceptance criterion from #26 (this TRD covers A4):
- [ ] `audit.log` records ≥10 turns of obedience data over 7-day pilot — this TRD ships the LOGGER; the ≥10-turn measurement happens post-merge
- [ ] Pre-existing 1551 tests still pass

Truth coverage:
- Truth #1 (audit log emission): tests via subprocess integration test
- Truth #2 (5-field shape): tests via renderAuditEntry shape suite
- Truth #3 (missing fields default to 'unknown'): tests via shape suite missing-field cases
- Truth #4 (observability-only): subprocess test asserts stdout is empty
- Truth #5 (DEVFLOW_AUDIT_LOG_PATH env): tests via auditLogPath suite
- Truth #6 (JSONL format): tests via append-multiple-lines case
- Truth #7 (silent on fs error): tests via 'returns ok:false' case
- Truth #8 (existing SUMMARY scan preserved): subprocess test asserts stderr contains warning
- Truth #9 (only ambient mode): subprocess test 'no-op when no .planning'
</verification>

<success_criteria>
- 2 files modified, all in `files_modified` frontmatter list
- 15+ new tests pass
- `npm test` full suite: 1551 + ~15 = ~1566 total
- 1-2 atomic commits
- Audit log isolation verified (no leaks to real ~/.claude/devflow/audit.log)
- Smoke test produces a well-formed JSONL entry
- SUMMARY.md captures: test counts, commit hashes, sample audit log entries, schema field meanings
</success_criteria>

<output>
After completion, create `.planning/objectives/15-phase-a-routing-keystone/15-05-SUMMARY.md`
</output>
