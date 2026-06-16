#!/usr/bin/env node

/**
 * DevFlow Completion Verification Hook (Stop hook)
 *
 * Triggers when a DevFlow execution completes.
 * Validates that SUMMARY.md exists and has proper evidence sections.
 * Warns if FAILED markers are found.
 *
 * Also emits a JSONL audit log entry to ~/.claude/devflow/audit.log
 * (or DEVFLOW_AUDIT_LOG_PATH) for post-pilot obedience measurement.
 * Audit logging is best-effort — never blocks the Stop event.
 *
 * Hook type: Stop (fires when conversation ends or context resets)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── DevFlow project detection ────────────────────────────────────────────────

function findPlanningDir() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) {
      return path.join(dir, '.planning');
    }
    dir = path.dirname(dir);
  }
  return null;
}

// ─── Existing SUMMARY scan logic (preserved verbatim) ────────────────────────

function scanRecentSummaries(planningDir) {
  const objectivesDir = path.join(planningDir, 'objectives');
  if (!fs.existsSync(objectivesDir)) return;

  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const recentSummaries = [];

  try {
    const objectives = fs.readdirSync(objectivesDir, { withFileTypes: true });
    for (const obj of objectives) {
      if (!obj.isDirectory()) continue;
      const objDir = path.join(objectivesDir, obj.name);
      const files = fs.readdirSync(objDir);
      for (const file of files) {
        if (!file.endsWith('-SUMMARY.md')) continue;
        const filePath = path.join(objDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs > tenMinutesAgo) {
          recentSummaries.push(filePath);
        }
      }
    }
  } catch (e) {
    return; // Silently fail — hook should never block
  }

  if (recentSummaries.length === 0) return;

  // Check each recent SUMMARY for issues
  const warnings = [];
  for (const summaryPath of recentSummaries) {
    try {
      const content = fs.readFileSync(summaryPath, 'utf8');
      const fileName = path.basename(summaryPath);

      // Check for Self-Check: FAILED
      if (content.includes('Self-Check: FAILED')) {
        warnings.push(`${fileName}: Self-Check FAILED — review missing items`);
      }

      // Check for Task Evidence table
      if (!content.includes('## Task Evidence')) {
        warnings.push(`${fileName}: Missing Task Evidence table`);
      }

      // Check for empty evidence
      if (content.includes('| - | - | - | - |')) {
        warnings.push(`${fileName}: Task Evidence table appears empty`);
      }
    } catch (e) {
      // Skip unreadable files
    }
  }

  if (warnings.length > 0) {
    console.error('\n⚠ DevFlow Completion Check:');
    for (const w of warnings) {
      console.error(`  - ${w}`);
    }
    console.error('');
  }
}

// ─── Audit log helpers ────────────────────────────────────────────────────────

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

// ─── Autonomous resume (Stop-hook decision:block, TRD 10-05) ─────────────────

const MAX_RESUME_ATTEMPTS = 3;

/**
 * Return true only when .planning/config.json has mode === "autonomous".
 * Hooks cannot require df-tools, so we read config.json directly.
 * Any error (missing, malformed, non-object) → false (safe default).
 */
function isAutonomousMode(planningDir) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    return config.mode === 'autonomous';
  } catch {
    return false;
  }
}

/**
 * Return true when STATE.md contains an execution-in-progress keyword.
 * Uses the same heuristic as verify-commits.js so both hooks agree.
 */
function isMidExecution(planningDir) {
  try {
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    return stateContent.includes('Executing') || stateContent.includes('In progress');
  } catch {
    return false;
  }
}

/**
 * Parse the current objective number from STATE.md's Current Position section.
 * Returns the number as a string (e.g. "10") or "current" as fallback.
 */
function parseObjectiveKey(planningDir) {
  try {
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    const m = stateContent.match(/Objective[:\s]+(\w+)/);
    return m ? m[1] : 'current';
  } catch {
    return 'current';
  }
}

function resumeCounterPath(planningDir, objectiveKey) {
  return path.join(planningDir, `.autonomous-resume-${objectiveKey}`);
}

function readResumeCount(planningDir, key) {
  try {
    return parseInt(fs.readFileSync(resumeCounterPath(planningDir, key), 'utf8').trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function writeResumeCount(planningDir, key, count) {
  try {
    fs.writeFileSync(resumeCounterPath(planningDir, key), String(count));
  } catch {}
}

function clearResumeCount(planningDir, key) {
  try {
    fs.unlinkSync(resumeCounterPath(planningDir, key));
  } catch {}
}

/**
 * List basenames of files in .planning/decisions/pending/.
 * Returns [] when the directory is absent or unreadable.
 */
function listPendingDecisions(planningDir) {
  try {
    const pendingDir = path.join(planningDir, 'decisions', 'pending');
    return fs.readdirSync(pendingDir).map(f => path.basename(f, '.md'));
  } catch {
    return [];
  }
}

// ─── Read input from stdin (Stop hook payload) ────────────────────────────────

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function parsePayload() {
  try { return JSON.parse(readStdin() || '{}'); } catch { return {}; }
}

// ─── Route-recommendation marker (written by route-intent.js) ────────────────
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

// ─── Skill-invoked heuristic ──────────────────────────────────────────────────

function detectSkillInvoked(payload) {
  // Heuristic: check for any tool-call to Skill in the turn's tool history.
  // Fallback: false (no false-positive).
  if (!payload || !payload.tools_used) return false;
  if (Array.isArray(payload.tools_used)) {
    return payload.tools_used.some(t => t === 'Skill' || (t && t.name === 'Skill'));
  }
  return false;
}

// ─── Audit entry emission ─────────────────────────────────────────────────────

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
    // Silently no-op — audit logging never blocks Stop event
  }
}

// ─── Main: existing SUMMARY scan + new audit emit + autonomous resume ────────

function main() {
  const planningDir = findPlanningDir();
  if (!planningDir) return; // Not a DevFlow project

  // Existing SUMMARY scan logic — preserved
  scanRecentSummaries(planningDir);

  // New: emit audit log entry (best-effort)
  emitAuditEntry(planningDir);

  // ── Autonomous resume gate (TRD 10-05) ──────────────────────────────────
  // Wrap entirely so any unexpected error never crashes the Stop event.
  try {
    if (!isAutonomousMode(planningDir)) return;

    if (!isMidExecution(planningDir)) {
      // Execution completed cleanly — clear any stale counter and allow stop.
      const objKey = parseObjectiveKey(planningDir);
      clearResumeCount(planningDir, objKey);
      return;
    }

    const objKey = parseObjectiveKey(planningDir);
    const count = readResumeCount(planningDir, objKey);

    if (count >= MAX_RESUME_ATTEMPTS) {
      // Cap reached — allow stop and reset so the next run starts fresh.
      clearResumeCount(planningDir, objKey);
      return;
    }

    // Gate passed: block the Stop event and direct Claude to resume.
    writeResumeCount(planningDir, objKey, count + 1);

    const pendingIds = listPendingDecisions(planningDir);
    const pendingNote = pendingIds.length > 0
      ? ` Pending decisions awaiting human input: ${pendingIds.join(', ')}.`
      : '';

    const reason =
      `DevFlow autonomous mode: mid-execution state detected — resuming (attempt ${count + 1}/${MAX_RESUME_ATTEMPTS}).` +
      ` Read .planning/STATE.md for current position, then continue executing the in-flight objective via /devflow:execute-objective.` +
      `${pendingNote}` +
      ` Never use port 8080 for any verification server — use 8091.`;

    process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  } catch {
    // Silent failure — hook must never crash the Stop event.
  }
}

if (require.main === module) main();

module.exports = {
  renderAuditEntry,
  appendAuditLog,
  auditLogPath,
  findPlanningDir,
  isAutonomousMode,
  isMidExecution,
  readResumeCount,
  writeResumeCount,
  clearResumeCount,
};
