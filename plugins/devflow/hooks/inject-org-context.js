#!/usr/bin/env node

/**
 * DevFlow Org-Context Preamble (SessionStart)
 *
 * **DRAFT — landing as part of v1.1 "DevFlow Coordination Layer" milestone.**
 * Not registered in hooks.json yet; activated when the org-context resolver
 * service ships (see .planning/research/org-context-resolver.md).
 *
 * When a Claude Code session starts in a DevFlow project worktree with an
 * active objective, inject a short preamble describing the objective's full
 * org context: parent issue → repo [Roadmap] → org Product milestone +
 * sibling repo activity. Gives Claude program-aware framing from turn 1.
 *
 * Mechanism: spawn `df-tools resolver context --include parent_issue,milestone,siblings`,
 * parse JSON, render as markdown additionalContext.
 *
 * Skipped when:
 *   - No .planning/ directory (not a DevFlow project)
 *   - No STATE.md or no current objective in STATE.md
 *   - Resolver fails or times out (>2s) — fail-open, no preamble
 *   - DEVFLOW_SKIP_ORG_CONTEXT=1 (escape hatch)
 *
 * Performance: hard 2s timeout on resolver. If it doesn't return in time,
 * we skip rather than block session start. Resolver is expected to use
 * cached data when GH is slow, so 2s is generous.
 *
 * Output shape (when context is available):
 *   {
 *     "hookSpecificOutput": {
 *       "hookEventName": "SessionStart",
 *       "additionalContext": "## DevFlow org context\n\n... markdown ..."
 *     }
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const RESOLVER_TIMEOUT_MS = 2000;

function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) return path.join(dir, '.planning');
    dir = path.dirname(dir);
  }
  return null;
}

function readCurrentObjective(planningDir) {
  const stateFile = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(stateFile)) return null;
  const content = fs.readFileSync(stateFile, 'utf8');
  // Match: **Objective:** N — Name (free-form; resolver does the precise lookup)
  const m = content.match(/\*\*Objective:\*\*\s*([0-9]+(?:-[a-z0-9-]+)?)/i);
  return m ? m[1] : null;
}

function callResolver(cwd, objectiveId) {
  const toolsPath = path.join(os.homedir(), '.claude', 'devflow', 'bin', 'df-tools.cjs');
  if (!fs.existsSync(toolsPath)) return null;

  const args = [
    toolsPath,
    'resolver', 'context',
    '--include', 'parent_issue,milestone,siblings',
    '--objective', objectiveId,
  ];

  const result = spawnSync('node', args, {
    cwd,
    encoding: 'utf-8',
    timeout: RESOLVER_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0 || !result.stdout) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function renderPreamble(ctx) {
  const lines = ['## DevFlow org context', ''];

  // Objective + parent
  if (ctx.objective) {
    lines.push(`**Objective:** ${ctx.objective.id} — ${ctx.objective.title || '(untitled)'}`);
    if (ctx.objective.kind && ctx.objective.work) {
      lines.push(`**Intent:** kind=${ctx.objective.kind}, work=${ctx.objective.work}`);
    }
  }

  if (ctx.parent_issue) {
    const p = ctx.parent_issue;
    const progress = p.progress
      ? ` (${p.progress.done}/${p.progress.total} sub-issues done)`
      : '';
    lines.push(`**Parent epic:** ${p.ref} — ${p.title}${progress}`);
  }

  if (ctx.milestone) {
    const m = ctx.milestone;
    lines.push(`**Milestone:** ${m.title} (${m.product}, ${m.quarter}, ${m.status})`);
  }

  if (ctx.siblings && ctx.siblings.length > 0) {
    lines.push('');
    lines.push('**Sibling activity (other sessions on related work):**');
    for (const s of ctx.siblings) {
      const score = (s.match_score != null) ? ` — score ${s.match_score.toFixed(2)}` : '';
      const reason = (s.match_reasons && s.match_reasons.length)
        ? ` (${s.match_reasons.join('; ')})`
        : '';
      lines.push(`- ${s.repo}/${s.objective || 'session'} by ${s.session?.developer || '?'}${score}${reason}`);
    }
    lines.push('');
    lines.push('Consider whether your work overlaps. If so, surface it before duplicating effort.');
  }

  if (ctx.warnings && ctx.warnings.length > 0) {
    lines.push('');
    lines.push('**Resolver warnings:**');
    for (const w of ctx.warnings) lines.push(`- ${w}`);
  }

  return lines.join('\n');
}

function emit(additionalContext) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(output));
}

function main() {
  if (process.env.DEVFLOW_SKIP_ORG_CONTEXT === '1') return;

  const planningDir = findPlanningDir(process.cwd());
  if (!planningDir) return;

  const objectiveId = readCurrentObjective(planningDir);
  if (!objectiveId) return;

  const ctx = callResolver(process.cwd(), objectiveId);
  if (!ctx) return; // Resolver unavailable, timed out, or returned malformed JSON — fail open

  // Skip preamble if context is too thin to be useful
  if (!ctx.parent_issue && !ctx.milestone && (!ctx.siblings || ctx.siblings.length === 0)) {
    return;
  }

  emit(renderPreamble(ctx));
}

if (require.main === module) {
  main();
}

module.exports = {
  findPlanningDir,
  readCurrentObjective,
  renderPreamble,
};
