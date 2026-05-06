'use strict';

/**
 * trd-pre-check.cjs — Cheap TRD pre-flight checker
 *
 * Implements `df-tools verify trd-pre <objective>`:
 * - Pure logic, no agent spawn, no network
 * - Checks: requirement_coverage, task_completeness, dependency_correctness, scope_sanity
 * - Performance budget: <2s wall clock
 *
 * Output shape (from 14-RESEARCH.md):
 * {
 *   objective, passed, needs_agent, checks: {
 *     requirement_coverage, task_completeness, dependency_correctness, scope_sanity
 *   },
 *   summary, elapsed_ms
 * }
 */

const fs = require('fs');
const path = require('path');
const { output, error, safeReadFile } = require('./helpers.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { findObjectiveInternal } = require('./objective.cjs');

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Load all TRD files in an objective directory.
 * Returns array of { filename, trdId, frontmatter, content, parseError }
 */
function loadTrds(objectiveDir) {
  let files;
  try {
    files = fs.readdirSync(objectiveDir);
  } catch {
    return [];
  }

  const trdFiles = files.filter(f => f.endsWith('-TRD.md') || f === 'TRD.md').sort();

  return trdFiles.map(filename => {
    const fullPath = path.join(objectiveDir, filename);
    const content = safeReadFile(fullPath);
    if (!content) {
      return { filename, trdId: deriveTrdId(filename), frontmatter: {}, content: '', parseError: 'read_failed' };
    }

    // Check for valid frontmatter markers before extracting
    const hasFrontmatter = /^---\n[\s\S]+?\n---/.test(content);
    if (!hasFrontmatter) {
      return { filename, trdId: deriveTrdId(filename), frontmatter: {}, content, parseError: 'parse_failed' };
    }

    let frontmatter;
    try {
      frontmatter = extractFrontmatter(content);
    } catch {
      return { filename, trdId: deriveTrdId(filename), frontmatter: {}, content, parseError: 'parse_failed' };
    }

    return { filename, trdId: deriveTrdId(filename), frontmatter, content, parseError: null };
  });
}

/**
 * Derive a normalized TRD ID from filename.
 * "14-01-something-TRD.md" → "14-01"
 * "01-foo-TRD.md" → "01"
 */
function deriveTrdId(filename) {
  const base = filename.replace(/-TRD\.md$/, '').replace(/^TRD$/, 'trd');
  // Match NN-NN prefix (e.g. "14-01") or just NN prefix
  const match = base.match(/^(\d+-\d+)/);
  if (match) return match[1];
  const singleMatch = base.match(/^(\d+)/);
  return singleMatch ? singleMatch[1] : base;
}

/**
 * Normalize a depends_on entry: strip objective prefix if present.
 * "14-01" → "14-01" (kept as-is — normalization ensures consistent format)
 * Handles both "01" short form and "14-01" full form.
 * We normalize to the full form using the objective number prefix.
 */
function normalizeDep(dep, objectivePrefix) {
  if (!dep) return null;
  const s = String(dep).trim();
  if (!s) return null;
  // If it's already in NN-NN form, keep it
  if (/^\d+-\d+$/.test(s)) return s;
  // If it's just NN (short form), prepend objective prefix
  if (/^\d+$/.test(s) && objectivePrefix) {
    return `${objectivePrefix}-${s}`;
  }
  return s;
}

/**
 * Extract requirement IDs from a TRD frontmatter `requirements` field.
 * Handles both array (["F1","F2"]) and string ("F1, F2") forms.
 * Strips brackets from string form.
 */
function parseTrdRequirements(reqField) {
  if (!reqField) return [];
  if (Array.isArray(reqField)) return reqField.map(s => String(s).trim()).filter(Boolean);
  // String form: may have brackets "[F1, F2]" or plain "F1, F2"
  const stripped = String(reqField).replace(/^\[|\]$/g, '').trim();
  if (!stripped) return [];
  return stripped.split(/,\s*/).map(s => s.trim()).filter(Boolean);
}

/**
 * Extract requirement IDs declared in ROADMAP.md for the given objective number.
 * Returns { ids: string[], found: boolean }
 */
function extractRoadmapRequirements(cwd, objectiveNum) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return { ids: [], found: false };

  const content = safeReadFile(roadmapPath);
  if (!content) return { ids: [], found: false };

  // Find the objective section header
  const numStr = objectiveNum.toString();
  const escapedNum = numStr.replace(/\./g, '\\.');
  const headerRe = new RegExp(`^#{2,4}\\s+Objective\\s+${escapedNum}[:\\s]`, 'm');
  const headerMatch = content.match(headerRe);
  if (!headerMatch) return { ids: [], found: false };

  // Grab the section up to the next same-or-higher header
  // Skip past the current header line before searching for next header
  const start = headerMatch.index;
  const rest = content.slice(start);
  const firstNewline = rest.indexOf('\n');
  const afterHeader = firstNewline >= 0 ? rest.slice(firstNewline + 1) : '';
  const nextHeaderMatch = afterHeader.match(/^#{2,4}\s+/m);
  const section = nextHeaderMatch
    ? rest.slice(0, firstNewline + 1 + nextHeaderMatch.index)
    : rest;

  // Find **Requirements:** line (with or without brackets)
  const reqLineMatch = section.match(/\*\*Requirements:\*\*\s*(\[?[^\]\n]+\]?)/i);
  if (!reqLineMatch) return { ids: [], found: false };

  const rawReqs = reqLineMatch[1].replace(/^\[|\]$/g, '').trim();
  if (!rawReqs) return { ids: [], found: true };

  const ids = rawReqs.split(/,\s*/).map(s => s.trim()).filter(Boolean);
  return { ids, found: true };
}

/**
 * Count non-checkpoint <task ...> blocks in TRD content.
 * Returns { total, nonCheckpoint }
 */
function countTasks(content) {
  // Find all <task ...> opening tags
  const allMatches = [...content.matchAll(/<task\b([^>]*?)>/gi)];
  let nonCheckpoint = 0;
  for (const m of allMatches) {
    const attrs = m[1];
    const typeMatch = attrs.match(/type\s*=\s*["']?([^"'\s>]+)["']?/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'auto';
    if (!type.startsWith('checkpoint')) {
      nonCheckpoint++;
    }
  }
  return { total: allMatches.length, nonCheckpoint };
}

// ─── Dimension: requirement_coverage ─────────────────────────────────────────

function checkRequirementCoverage(cwd, objectiveNum, trds) {
  const { ids: roadmapReqs, found } = extractRoadmapRequirements(cwd, objectiveNum);

  if (!found) {
    return {
      passed: true,
      missing: [],
      note: 'no requirements declared',
    };
  }

  if (roadmapReqs.length === 0) {
    return {
      passed: true,
      missing: [],
      note: 'no requirements declared',
    };
  }

  // Collect all requirement IDs across TRDs
  const coveredReqs = new Set();
  for (const trd of trds) {
    if (trd.parseError) continue;
    const ids = parseTrdRequirements(trd.frontmatter.requirements);
    for (const id of ids) coveredReqs.add(id);
  }

  const missing = roadmapReqs.filter(id => !coveredReqs.has(id));
  return {
    passed: missing.length === 0,
    missing,
  };
}

// ─── Dimension: task_completeness ────────────────────────────────────────────

/**
 * For each non-checkpoint task, check presence of <name>, <action>, <verify>, <done>.
 * Checkpoint tasks (type="checkpoint:*") are exempt from <verify>/<done> requirements.
 */
function checkTaskCompleteness(trds) {
  const incomplete = [];

  for (const trd of trds) {
    if (trd.parseError) continue;
    const content = trd.content;

    // Find all task blocks: <task ...> ... </task>
    // Use a regex to find task opening tags with their attributes
    const taskBlockRe = /<task\b([^>]*?)>([\s\S]*?)<\/task>/gi;
    let taskMatch;
    let taskNum = 0;

    while ((taskMatch = taskBlockRe.exec(content)) !== null) {
      taskNum++;
      const attrs = taskMatch[1];
      const body = taskMatch[2];

      const typeMatch = attrs.match(/type\s*=\s*["']?([^"'\s>]+)["']?/i);
      const type = typeMatch ? typeMatch[1].toLowerCase() : 'auto';
      const isCheckpoint = type.startsWith('checkpoint');

      // Required elements for non-checkpoint tasks
      const required = ['name', 'action', 'verify', 'done'];
      // Checkpoints only need name
      const requiredForThis = isCheckpoint ? ['name'] : required;

      const missing = [];
      for (const elem of requiredForThis) {
        // Check for <elem> or <elem ...> presence in task body
        const elemRe = new RegExp(`<${elem}\\b`, 'i');
        if (!elemRe.test(body)) {
          missing.push(elem);
        }
      }

      if (missing.length > 0) {
        // Extract task name if possible for context
        const nameMatch = body.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
        const taskName = nameMatch ? nameMatch[1].trim() : `Task ${taskNum}`;
        incomplete.push({ trd: trd.trdId, task: taskName, missing });
      }
    }
  }

  return {
    passed: incomplete.length === 0,
    incomplete,
  };
}

// ─── Dimension: dependency_correctness ───────────────────────────────────────

/**
 * Build adjacency list from TRD depends_on values.
 * Detect cycles via DFS white/gray/black coloring (avoids false positives on diamonds).
 * Detect orphan refs (depends_on entries that don't match any known TRD).
 */
function checkDependencyCorrectness(trds) {
  const trdIds = new Set(trds.map(t => t.trdId));
  const objectivePrefix = (() => {
    // Extract objective number from first TRD ID (e.g. "14-01" → "14")
    for (const t of trds) {
      const m = t.trdId.match(/^(\d+)-/);
      if (m) return m[1];
    }
    return null;
  })();

  // Build adjacency list: trdId → [depTrdId, ...]
  const adj = {};
  for (const t of trds) {
    adj[t.trdId] = [];
  }

  const orphan_refs = [];

  for (const trd of trds) {
    if (trd.parseError) continue;
    const raw = trd.frontmatter.depends_on;
    let deps = [];
    if (Array.isArray(raw)) {
      deps = raw;
    } else if (raw && String(raw).trim() && String(raw).trim() !== '[]') {
      deps = String(raw).split(/,\s*/);
    }

    for (const dep of deps) {
      const normalized = normalizeDep(dep, objectivePrefix);
      if (!normalized) continue;
      if (!trdIds.has(normalized)) {
        orphan_refs.push({ trd: trd.trdId, missing: normalized });
      } else {
        adj[trd.trdId].push(normalized);
      }
    }
  }

  // DFS cycle detection: white=0, gray=1, black=2
  const color = {};
  for (const id of trdIds) color[id] = 0;

  const cycles = [];

  function dfs(node, ancestors) {
    color[node] = 1; // gray
    for (const neighbor of (adj[node] || [])) {
      if (color[neighbor] === 1) {
        // Back edge to gray node = cycle
        cycles.push([...ancestors, node, neighbor]);
      } else if (color[neighbor] === 0) {
        dfs(neighbor, [...ancestors, node]);
      }
      // black node: already fully explored, skip
    }
    color[node] = 2; // black
  }

  for (const id of trdIds) {
    if (color[id] === 0) {
      dfs(id, []);
    }
  }

  return {
    passed: cycles.length === 0 && orphan_refs.length === 0,
    cycles,
    orphan_refs,
  };
}

// ─── Dimension: scope_sanity ──────────────────────────────────────────────────

const TASK_WARN_THRESHOLD = 3;
const TASK_FAIL_THRESHOLD = 6;
const TRD_COUNT_LIMIT = 10;

function checkScopeSanity(trds) {
  const oversized_trds = [];
  const warning_trds = [];

  for (const trd of trds) {
    if (trd.parseError) continue;
    const { nonCheckpoint } = countTasks(trd.content);

    if (nonCheckpoint >= TASK_FAIL_THRESHOLD) {
      oversized_trds.push({ trd: trd.trdId, task_count: nonCheckpoint });
    } else if (nonCheckpoint > TASK_WARN_THRESHOLD) {
      warning_trds.push({ trd: trd.trdId, task_count: nonCheckpoint });
    }
  }

  const totalTrds = trds.length;
  const trdCountFailed = totalTrds > TRD_COUNT_LIMIT;

  return {
    passed: oversized_trds.length === 0 && !trdCountFailed,
    oversized_trds,
    warning_trds,
    total_trds: totalTrds,
  };
}

// ─── cmdVerifyTrdPre ──────────────────────────────────────────────────────────

function cmdVerifyTrdPre(cwd, objective, raw) {
  const startNs = process.hrtime.bigint();

  if (!objective) {
    error('objective identifier required');
    return;
  }

  // Resolve objective directory
  const objectiveInfo = findObjectiveInternal(cwd, objective);
  if (!objectiveInfo || !objectiveInfo.found) {
    const elapsed_ms = Number(process.hrtime.bigint() - startNs) / 1e6;
    const result = { error: 'Objective not found', objective, elapsed_ms };
    output(result, raw, 'Objective not found');
    return;
  }

  const objectiveDir = path.isAbsolute(objectiveInfo.directory)
    ? objectiveInfo.directory
    : path.join(cwd, objectiveInfo.directory);

  const objectiveNum = objectiveInfo.objective_number;

  // Load TRDs
  const trds = loadTrds(objectiveDir);

  if (trds.length === 0) {
    const elapsed_ms = Number(process.hrtime.bigint() - startNs) / 1e6;
    const result = {
      objective,
      passed: false,
      needs_agent: false,
      checks: {
        requirement_coverage: { passed: false, missing: [], note: 'no TRD files found' },
        task_completeness: { passed: false, incomplete: [] },
        dependency_correctness: { passed: false, cycles: [], orphan_refs: [] },
        scope_sanity: { passed: false, oversized_trds: [], total_trds: 0 },
      },
      summary: '0/4 dimensions passed',
      elapsed_ms: Math.round(elapsed_ms),
    };
    output(result, raw, result.summary);
    return;
  }

  // Run all four dimensions
  const requirement_coverage = checkRequirementCoverage(cwd, objectiveNum, trds);
  const task_completeness = checkTaskCompleteness(trds);
  const dependency_correctness = checkDependencyCorrectness(trds);
  const scope_sanity = checkScopeSanity(trds);

  const checks = { requirement_coverage, task_completeness, dependency_correctness, scope_sanity };

  const passedCount = Object.values(checks).filter(c => c.passed).length;
  const totalDimensions = Object.keys(checks).length;
  const passed = passedCount === totalDimensions;

  // needs_agent: false because cheap-checker failures are mechanical (not LLM-grade).
  // The caller decides whether to additionally spawn df-job-checker for LLM dimensions.
  const needs_agent = false;

  const elapsed_ms = Number(process.hrtime.bigint() - startNs) / 1e6;

  const result = {
    objective,
    passed,
    needs_agent,
    checks,
    summary: `${passedCount}/${totalDimensions} dimensions passed`,
    elapsed_ms: Math.round(elapsed_ms),
  };

  const summaryLine = passed ? `valid — ${result.summary}` : `invalid — ${result.summary}`;
  output(result, raw, summaryLine);
}

module.exports = { cmdVerifyTrdPre };
