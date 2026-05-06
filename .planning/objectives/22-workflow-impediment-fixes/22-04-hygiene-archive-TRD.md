---
objective: 22-workflow-impediment-fixes
trd: 04
type: tdd
confidence: high
wave: 2
depends_on: [22-02]
files_modified:
  - plugins/devflow/devflow/bin/lib/project-hygiene.cjs
  - plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - HYGIENE-ARCHIVE-DETECT
  - HYGIENE-ARCHIVE-APPLY
  - HYGIENE-ARCHIVE-EMIT-GH-CMD
user_setup: []

must_haves:
  truths:
    - "df-tools project-hygiene archive scans configured workspace for retired-repo candidates and returns JSON"
    - "Retired heuristic: last commit > 6 months OR PROJECT.md frontmatter has archived: true"
    - "Detection is read-only by default (no --apply flag)"
    - "df-tools project-hygiene archive --apply <name> moves repo's .planning/ to <workspace>/archived-projects/<name>-planning/"
    - "Apply emits 'gh repo archive <owner>/<name>' to stdout for user to run; does NOT execute the gh command"
    - "Without --apply, returns candidate list with reasons; user reviews before applying"
    - "JSON contract: { ok, workspace, candidates: [{name, path, reason, last_commit_date, archived_flag}], applied: null|object, warnings: [] }"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/project-hygiene.cjs"
      provides: "scanRetiredRepos() + applyArchive() + cmdProjectHygieneArchive()"
      contains: "function scanRetiredRepos"
    - path: "plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs"
      provides: "Group 22D tests covering detection heuristics + apply move + emit-not-execute behavior"
      contains: "scanRetiredRepos"
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "case 'project-hygiene' / subcommand 'archive' arm"
      contains: "subcommand === 'archive'"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/project-hygiene.cjs (scanRetiredRepos)"
      to: "git log -1 --format=%ct <path>"
      via: "_runGit subprocess for last-commit timestamp"
      pattern: "_runGit.*log.*--format"
    - from: "plugins/devflow/devflow/bin/lib/project-hygiene.cjs (applyArchive)"
      to: "fs.cpSync + fs.rmSync (move .planning to archived-projects/)"
      via: "_runFs operations from 22-03"
      pattern: "cpSync|rmSync.*archived-projects"
    - from: "plugins/devflow/devflow/bin/lib/project-hygiene.cjs (applyArchive output)"
      to: "stdout (gh repo archive command emission)"
      via: "result.gh_archive_command field"
      pattern: "gh repo archive"
---

<objective>
Add `df-tools project-hygiene archive [--apply <name>]` CLI to detect retired-repo candidates and (with `--apply`) archive their `.planning/` dir to a workspace-level `archived-projects/` directory. Emits `gh repo archive` command to stdout for user to run; never executes gh-side state changes.

Purpose: Detect repos that haven't been touched in 6+ months and have no in-flight objectives — candidates for archival. Reduces clutter in cross-repo awareness scans. Preserves user authority over GitHub-side state changes (locked CONTEXT.md decision #5).

Output: `lib/project-hygiene.cjs` extended with `scanRetiredRepos` + `applyArchive`. CLI surface `df-tools project-hygiene archive`. Archive-apply moves `.planning/` only — repo dir itself stays for the user to delete or archive on GH.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── lib/
│   ├── project-hygiene.cjs        ← MODIFY (add scanRetiredRepos + applyArchive + cmdProjectHygieneArchive)
│   └── project-hygiene.test.cjs   ← MODIFY (add Group 22D tests)
└── df-tools.cjs                   ← MODIFY (extend case 'project-hygiene': with subcommand === 'archive')
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
## Existing _runGit pattern (already added in 22-01 to init.cjs; ALSO in awareness.cjs)

This TRD uses _runGit for `git log -1 --format=%ct <path>` to get last-commit unix timestamp. If 22-01 already added `_runGit`/`_setRunGit` to project-hygiene.cjs (via 22-02 or 22-03 changes), reuse. If not, add the pattern (mirrors awareness.cjs lines 220-251).

## fs.cpSync recursive (from 22-03)

```js
_runFs.cpSync(srcPlanning, archivedPlanning, { recursive: true });
```

## Workspace path detection

Project's "workspace" = parent of cwd (e.g., `/Users/markemerson/Source/`). Detect via `path.dirname(path.resolve(cwd))`. If user passes `--workspace=<path>`, override.

## Last-commit timestamp pattern

```js
const r = _runGit(['log', '-1', '--format=%ct', '--', '.'], { cwd: repoPath });
if (r.ok) {
  const unixSeconds = parseInt(r.stdout.trim(), 10);
  const lastCommitDate = new Date(unixSeconds * 1000);
  const ageMs = Date.now() - lastCommitDate.getTime();
  const ageDays = ageMs / 86400000;
}
```

## archived-projects/ directory layout (locked per CONTEXT.md)

```
<workspace>/
├── repo-a/             ← active devflow project
├── repo-b/             ← active devflow project
└── archived-projects/  ← created by archive --apply
    ├── retired-c-planning/  ← from <workspace>/retired-c/.planning/
    └── ...
```

archived-projects/ lives at WORKSPACE level (sibling of source repos), NOT inside any repo. This avoids gitignore conflicts.
</codebase_examples>

<anti_patterns>
- DO NOT execute `gh repo archive` directly — emit to stdout for user to run. Locked decision #5.
- DO NOT move the entire repo dir — only move `.planning/`. The repo itself may have code, history, etc. that user manages separately.
- DO NOT auto-detect "this repo has open PRs" — out of scope (deferred per CONTEXT.md). Heuristic = last commit + frontmatter flag only.
- DO NOT scan inside `archived-projects/` itself (recursion guard).
- DO NOT apply archive to current cwd's repo without explicit `--apply <name>` matching the repo (safety: prevents accidental self-archive).
- DO NOT delete the source repo dir — only move `.planning/`. User decides when to delete the repo dir itself.
</anti_patterns>

<error_recovery>
### Recovery: workspace not detectable

If `path.dirname(cwd)` returns `/`, error: "could not detect workspace; pass --workspace=<path>".

### Recovery: target repo not present in workspace

```js
if (!_runFs.existsSync(targetRepoDir)) {
  return { ok: false, error: `repo '${name}' not found in workspace ${workspace}` };
}
```

### Recovery: target has no .planning/

```js
const planningDir = path.join(targetRepoDir, '.planning');
if (!_runFs.existsSync(planningDir)) {
  return { ok: false, error: `repo '${name}' has no .planning/ — nothing to archive` };
}
```

### Recovery: archived-projects/<name>-planning already exists

```js
if (_runFs.existsSync(archivedPlanning)) {
  return {
    ok: false,
    error: `archive destination already exists: ${archivedPlanning}. Rename or delete first.`,
  };
}
```

### Recovery: git log fails on directory

If `git log -1 --format=%ct .` returns non-zero (e.g., not a git repo), set `last_commit_date: null`. The repo can still be flagged via `archived: true` frontmatter, OR skipped if no signal at all.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/objectives/22-workflow-impediment-fixes/22-CONTEXT.md
@.planning/objectives/22-workflow-impediment-fixes/22-RESEARCH.md
@.planning/objectives/22-workflow-impediment-fixes/22-02-hygiene-check-TRD.md
</context>

<research_context>
- Reuses `_runFs` injection hook from 22-03 (extends if 22-03 already wired it; adds if not). Same pattern as `dup-detect.cjs`.
- Reuses `_runGit` injection hook (mirror awareness.cjs).
- New helpers in `lib/project-hygiene.cjs`:
  - `scanRetiredRepos({ workspace, staleMonths = 6 })` — read-only detection
  - `applyArchive({ workspace, name })` — mutation: move `.planning/` to `archived-projects/<name>-planning/`
  - `cmdProjectHygieneArchive(cwd, applyName, workspaceArg, raw)` — CLI dispatcher
- JSON contract for detection (no --apply):
  ```json
  {
    "ok": true,
    "workspace": "/Users/markemerson/Source",
    "stale_months": 6,
    "candidates": [
      { "name": "retired-c", "path": ".../retired-c", "reason": "last_commit > 6mo", "last_commit_date": "2025-09-15T...", "archived_flag": false, "age_days": 234 },
      { "name": "old-d", "path": ".../old-d", "reason": "archived: true in PROJECT.md", "last_commit_date": "...", "archived_flag": true, "age_days": 50 }
    ],
    "scanned": 8,
    "applied": null,
    "warnings": []
  }
  ```
- JSON contract for apply (with --apply <name>):
  ```json
  {
    "ok": true,
    "workspace": "/Users/markemerson/Source",
    "candidates": [...],
    "applied": {
      "name": "retired-c",
      "from": "/Users/markemerson/Source/retired-c/.planning",
      "to": "/Users/markemerson/Source/archived-projects/retired-c-planning",
      "files_moved": 42,
      "bytes_moved": 123456
    },
    "gh_archive_command": "gh repo archive AO-Cyber-Systems/retired-c --confirm",
    "next_steps": [
      "Run the gh command above to archive on GitHub",
      "Optionally delete <workspace>/retired-c if no longer needed"
    ],
    "warnings": []
  }
  ```
- Workspace detection: `path.dirname(path.resolve(cwd))` (parent of cwd). Override via `--workspace=<path>`.
- Repo iteration: `fs.readdirSync(workspace, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== 'archived-projects' && !e.name.startsWith('.'))`.
- Per-repo PROJECT.md read: `<workspace>/<name>/.planning/PROJECT.md`. Skip if no `.planning/` (not a devflow project).
</research_context>

<gotchas>
- **Recursion guard:** `archived-projects/` MUST be filtered from the scan (don't recurse into it).
- **Hidden dirs:** Skip `.git`, `.cache`, `.tmp`, etc. — anything starting with `.`. Also skip `node_modules`, `target`, common build dirs (don't add to a denylist; the `e.isDirectory()` check + `.startsWith('.')` is enough — non-devflow repos won't have `.planning/` anyway and will be skipped).
- **Workspace = cwd's parent:** if user runs from `/Users/x/Source/repo-foo/`, workspace = `/Users/x/Source/`. If user runs from `/Users/x/Source/`, workspace = `/Users/x/`. Detect: if cwd has `.planning/`, workspace = parent; else workspace = cwd. Use this heuristic.
- **gh_archive_command construction:** Use PROJECT.md frontmatter `github_repo` field. If absent, emit warning and use placeholder `gh repo archive <owner>/<name> --confirm` with `<owner>` literal (user replaces).
- **`--confirm` flag in gh command:** `gh repo archive` requires `--confirm` for non-interactive use. Always include in emitted command.
- **stale_months override:** allow `--stale-months=N` for testability (use 0 in tests to flag everything).
- **Self-archive safety:** if `--apply <name>` matches the cwd's basename, refuse with explicit message. User must run from a different cwd or pass `--workspace=<elsewhere>`.
- **`age_days` precision:** integer days (`Math.floor(ageMs / 86400000)`); avoid floats in JSON output.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Write failing test list for project-hygiene archive</name>
  <files>plugins/devflow/devflow/bin/lib/project-hygiene.test.cjs</files>
  <action>
Add new test group `Group 22D` to `project-hygiene.test.cjs`. Test list (write BEFORE implementation per TDD playbook habit 2):

22D1 — `scanRetiredRepos({ workspace: <empty-dir> })` returns `{ ok: true, candidates: [], scanned: 0, ...empty }`
22D2 — `scanRetiredRepos({ workspace })` with one repo whose PROJECT.md has `archived: true` returns `candidates: [{ name, path, reason: 'archived: true in PROJECT.md', archived_flag: true }]`
22D3 — `scanRetiredRepos({ workspace, staleMonths: 0 })` (zero threshold = all are stale) with one repo + mocked `_runGit` git-log returning recent timestamp returns that repo as candidate with reason `last_commit > 0mo`
22D4 — `scanRetiredRepos({ workspace, staleMonths: 6 })` with one repo + mocked git-log returning 7-month-old timestamp returns that repo as candidate with reason mentioning `last_commit > 6mo` and `age_days >= 210`
22D5 — `scanRetiredRepos({ workspace, staleMonths: 6 })` with one repo + mocked git-log returning 30-day-old timestamp returns NO candidates (recent enough)
22D6 — `scanRetiredRepos({ workspace })` skips dirs starting with `.` (e.g., `.cache`, `.tmp`)
22D7 — `scanRetiredRepos({ workspace })` skips `archived-projects/` (recursion guard)
22D8 — `scanRetiredRepos({ workspace })` skips dirs without `.planning/` (non-devflow projects)
22D9 — `scanRetiredRepos({ workspace })` with mocked git-log failing (non-git repo) and PROJECT.md not having `archived: true` SKIPS that repo (no signal at all)
22D10 — `scanRetiredRepos({ workspace })` with multiple repos: 2 stale, 1 fresh, 1 archived: true, 1 non-devflow → candidates length === 3 (2 stale + 1 archived flag), scanned === 4 (excludes non-devflow)
22D11 — `applyArchive({ workspace, name: 'retired-c' })` with valid setup creates `<workspace>/archived-projects/retired-c-planning/` containing all files from `<workspace>/retired-c/.planning/`, removes source `.planning/`, returns `{ ok: true, applied: {...}, gh_archive_command: 'gh repo archive ...', next_steps: [...] }`
22D12 — `applyArchive` with non-existent repo returns `{ ok: false, error: <containing 'not found in workspace'> }`
22D13 — `applyArchive` with repo lacking `.planning/` returns `{ ok: false, error: <containing 'has no .planning'> }`
22D14 — `applyArchive` with `archived-projects/<name>-planning/` already existing returns `{ ok: false, error: <containing 'archive destination already exists'> }`
22D15 — `applyArchive` with target repo's PROJECT.md missing `github_repo` field returns ok:true but `gh_archive_command` includes literal `<owner>` placeholder AND `warnings` includes hint to fill in owner
22D16 — `applyArchive` with `name === path.basename(cwd)` returns `{ ok: false, error: <containing 'self-archive'> }` (safety)
22D17 — `applyArchive` does NOT execute the gh command (verify by capturing process spawns — no `gh` invocation in test)
22D18 — End-to-end subprocess: `df-tools project-hygiene archive` (no --apply) returns ok:true JSON with scanned + candidates fields
22D19 — End-to-end subprocess: `df-tools project-hygiene archive --apply non-existent-repo` returns ok:false JSON with error field
22D20 — End-to-end subprocess: `df-tools project-hygiene archive --workspace=<custom>` overrides default workspace detection

Implementation tips:
- Build workspace fixture: a temp dir with N subdirs each having `.planning/PROJECT.md`. Vary frontmatter and last-commit dates per case.

```js
function buildWorkspaceFixture(repos) {
  // repos: { name: { archived?, github_repo?, lastCommitDaysAgo? } }
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'df-hygiene-archive-test-'));
  for (const [name, opts] of Object.entries(repos)) {
    const repoDir = path.join(ws, name);
    fs.mkdirSync(path.join(repoDir, '.planning'), { recursive: true });
    const fm = {};
    if (opts.archived) fm.archived = 'true';
    if (opts.github_repo) fm.github_repo = opts.github_repo;
    const fmYaml = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n');
    fs.writeFileSync(path.join(repoDir, '.planning', 'PROJECT.md'), `---\n${fmYaml}\n---\n# ${name}\n`);
  }
  return { ws, cleanup: () => fs.rmSync(ws, { recursive: true, force: true }) };
}
```

- For commit-date heuristic tests (22D3-22D5, 22D9): mock `_runGit` to return canned `git log -1 --format=%ct` output. Compute timestamp as `Math.floor((Date.now() - daysAgo * 86400000) / 1000)`.
- For 22D17 (no gh execution): verify by NOT mocking `gh` — if production code accidentally tried to spawn it, the subprocess would either succeed (real gh) or fail (no gh) — neither is desired. Test asserts that the result.gh_archive_command field is a string AND no actual gh subprocess fired (track via _runGit mock — gh shouldn't appear in args at all).
- Subprocess tests (22D18-22D20) require fixture workspace exposed via `--workspace=` flag.

# CRITICAL: Test list documented BEFORE writing test code (TDD playbook habit 2). Single commit: `test(22-04): add failing tests for project-hygiene archive (Group 22D)`.
# GOTCHA: 22D17 verifies absence-of-behavior (no gh execution) — write test that would FAIL if archive accidentally spawned gh. Easiest: use a `_setRunGit` mock that throws if args[0] === 'log' returns canned data, and TRACKS all calls — assert no call's args[0] !== 'log' across the test (i.e., only git-log allowed, no other commands).
# PATTERN: Mirror existing fixture-builder structure from 22-02/22-03.
  </action>
  <verify>
`npm test -- --test-name-pattern='22D'` shows 20 tests; ALL fail with expected RED-state errors. No syntax errors.
  </verify>
  <done>
20 Group 22D tests added to `project-hygiene.test.cjs`. All 20 fail with expected RED-state errors. Single atomic commit: `test(22-04): add failing tests for project-hygiene archive (Group 22D)`.
  </done>
  <recovery>
If test fails with syntax error, fix before proceeding. If unexpected pass, audit test for missing assertion.
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Implement scanRetiredRepos + applyArchive + cmdProjectHygieneArchive + df-tools router extension</name>
  <files>plugins/devflow/devflow/bin/lib/project-hygiene.cjs,plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Implement minimum production code to turn Group 22D tests GREEN.

**Stage 2a: Extend `lib/project-hygiene.cjs` with _runGit (if not added by 22-03), scanRetiredRepos, applyArchive**

If `_runGit` not present in project-hygiene.cjs (add if 22-03 didn't):

```js
const { spawnSync } = require('child_process');
function runGitInternal(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, ...opts,
  });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: (r.stderr || '').trim() };
}
let _runGit = runGitInternal;
function _setRunGit(fn) { _runGit = (fn != null) ? fn : runGitInternal; }
function _resetGitMock() { _runGit = runGitInternal; }
```

Implement `scanRetiredRepos`:

```js
const SIX_MONTHS_DAYS = 30 * 6; // approximation; tests use staleMonths param

/**
 * Scan workspace for retired-repo candidates.
 *
 * Heuristic:
 *   - PROJECT.md frontmatter has archived: true → flag
 *   - Last commit > staleMonths * ~30 days ago → flag
 *
 * Skips: dirs starting with '.', archived-projects/, dirs without .planning/.
 *
 * @param {{ workspace?: string, staleMonths?: number }} opts
 * @returns {object} JSON contract
 */
function scanRetiredRepos({ workspace, staleMonths = 6 } = {}) {
  if (!workspace) {
    return { ok: false, error: 'workspace required (pass --workspace=<path>)' };
  }
  const result = {
    ok: true,
    workspace,
    stale_months: staleMonths,
    candidates: [],
    scanned: 0,
    applied: null,
    warnings: [],
  };

  let entries;
  try {
    entries = _runFs.readdirSync(workspace, { withFileTypes: true });
  } catch (e) {
    return { ...result, ok: false, error: `cannot read workspace: ${e.message}` };
  }

  const staleDaysThreshold = staleMonths * 30; // approximate

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'archived-projects') continue;

    const repoPath = path.join(workspace, entry.name);
    const planningPath = path.join(repoPath, '.planning');
    if (!_runFs.existsSync(planningPath)) continue;

    result.scanned++;

    // Read PROJECT.md frontmatter
    const projectMdPath = path.join(planningPath, 'PROJECT.md');
    let frontmatter = {};
    if (_runFs.existsSync(projectMdPath)) {
      try {
        frontmatter = extractFrontmatter(_runFs.readFileSync(projectMdPath, 'utf-8')) || {};
      } catch {
        // continue with empty frontmatter
      }
    }
    const archivedFlag = frontmatter.archived === true || frontmatter.archived === 'true';

    // Last-commit age
    let lastCommitDate = null;
    let ageDays = null;
    const logR = _runGit(['log', '-1', '--format=%ct', '--', '.'], { cwd: repoPath });
    if (logR.ok) {
      const unixSeconds = parseInt(logR.stdout.trim(), 10);
      if (!isNaN(unixSeconds)) {
        lastCommitDate = new Date(unixSeconds * 1000).toISOString();
        ageDays = Math.floor((Date.now() - unixSeconds * 1000) / 86400000);
      }
    }

    // Decide: candidate or not
    let reason = null;
    if (archivedFlag) {
      reason = 'archived: true in PROJECT.md';
    } else if (ageDays !== null && ageDays >= staleDaysThreshold) {
      reason = `last_commit > ${staleMonths}mo`;
    } else if (ageDays === null && !archivedFlag) {
      // No signal — skip
      continue;
    } else {
      // Recent commit AND not archived — skip
      continue;
    }

    result.candidates.push({
      name: entry.name,
      path: repoPath,
      reason,
      last_commit_date: lastCommitDate,
      archived_flag: archivedFlag,
      age_days: ageDays,
    });
  }

  return result;
}
```

Implement `applyArchive`:

```js
function applyArchive({ workspace, name, cwd = process.cwd() }) {
  if (!workspace || !name) {
    return { ok: false, error: 'workspace and name required' };
  }

  // Self-archive safety
  if (name === path.basename(path.resolve(cwd))) {
    return { ok: false, error: `cannot self-archive: name '${name}' matches current cwd basename. Run from a different directory or pass --workspace.` };
  }

  const repoDir = path.join(workspace, name);
  if (!_runFs.existsSync(repoDir)) {
    return { ok: false, error: `repo '${name}' not found in workspace ${workspace}` };
  }

  const planningDir = path.join(repoDir, '.planning');
  if (!_runFs.existsSync(planningDir)) {
    return { ok: false, error: `repo '${name}' has no .planning/ — nothing to archive` };
  }

  const archiveDir = path.join(workspace, 'archived-projects');
  const archivedPlanning = path.join(archiveDir, `${name}-planning`);
  if (_runFs.existsSync(archivedPlanning)) {
    return { ok: false, error: `archive destination already exists: ${archivedPlanning}. Rename or delete first.` };
  }

  // Ensure archived-projects/ exists
  if (!_runFs.existsSync(archiveDir)) {
    try { _runFs.mkdirSync(archiveDir, { recursive: true }); } catch (e) {
      return { ok: false, error: `failed to create ${archiveDir}: ${e.message}` };
    }
  }

  // Copy
  try {
    _runFs.cpSync(planningDir, archivedPlanning, { recursive: true });
  } catch (e) {
    try { _runFs.rmSync(archivedPlanning, { recursive: true, force: true }); } catch {}
    return { ok: false, error: `copy failed: ${e.message}` };
  }

  // Verify (reuse _walkStats from 22-03)
  const srcStats = _walkStats(planningDir);
  const dstStats = _walkStats(archivedPlanning);
  if (srcStats.files !== dstStats.files || srcStats.bytes !== dstStats.bytes) {
    try { _runFs.rmSync(archivedPlanning, { recursive: true, force: true }); } catch {}
    return { ok: false, error: `verify failed: src ${srcStats.files}f/${srcStats.bytes}b vs dst ${dstStats.files}f/${dstStats.bytes}b. Source preserved.` };
  }

  // Remove source .planning/
  try {
    _runFs.rmSync(planningDir, { recursive: true, force: true });
  } catch (e) {
    return { ok: false, error: `archive copy succeeded but source removal failed: ${e.message}. Manual cleanup needed: ${planningDir}` };
  }

  // Build gh archive command
  const projectMdPath = path.join(archivedPlanning, 'PROJECT.md');
  let frontmatter = {};
  if (_runFs.existsSync(projectMdPath)) {
    try { frontmatter = extractFrontmatter(_runFs.readFileSync(projectMdPath, 'utf-8')) || {}; } catch {}
  }
  const ghRepo = frontmatter.github_repo;
  const warnings = [];
  let ghCommand;
  if (ghRepo && /^[\w-]+\/[\w.-]+$/.test(ghRepo)) {
    ghCommand = `gh repo archive ${ghRepo} --confirm`;
  } else {
    ghCommand = `gh repo archive <owner>/${name} --confirm`;
    warnings.push(`PROJECT.md missing or malformed github_repo — replace <owner> in the gh command with the actual GitHub owner`);
  }

  return {
    ok: true,
    workspace,
    candidates: [],
    applied: {
      name,
      from: planningDir,
      to: archivedPlanning,
      files_moved: dstStats.files,
      bytes_moved: dstStats.bytes,
    },
    gh_archive_command: ghCommand,
    next_steps: [
      `Run: ${ghCommand}`,
      `Optionally delete ${repoDir} if no longer needed (planning data is preserved at ${archivedPlanning})`,
    ],
    warnings,
  };
}
```

Implement `cmdProjectHygieneArchive`:

```js
function cmdProjectHygieneArchive(cwd, applyName, workspaceArg, staleMonthsArg, raw) {
  // Detect workspace: explicit arg > parent of cwd if cwd has .planning > cwd itself
  let workspace = workspaceArg;
  if (!workspace) {
    if (_runFs.existsSync(path.join(cwd, '.planning'))) {
      workspace = path.dirname(path.resolve(cwd));
    } else {
      workspace = cwd;
    }
  }
  workspace = path.resolve(workspace);

  const staleMonths = staleMonthsArg !== null && staleMonthsArg !== undefined
    ? parseInt(staleMonthsArg, 10)
    : 6;

  if (applyName) {
    // Apply path
    const result = applyArchive({ workspace, name: applyName, cwd });
    output(result, raw);
  } else {
    // Detection path
    const result = scanRetiredRepos({ workspace, staleMonths });
    output(result, raw);
  }
}
```

Update module.exports:
```js
module.exports = {
  // ... existing from 22-02 and 22-03
  scanRetiredRepos,
  applyArchive,
  cmdProjectHygieneArchive,
  _setRunGit,    // if added in this TRD
  _resetGitMock, // if added in this TRD
};
```

**Stage 2b: Extend df-tools.cjs router**

Update existing `case 'project-hygiene':` arm:

```js
case 'project-hygiene': {
  const subcommand = args[1];
  const ph = require('./lib/project-hygiene.cjs');

  if (subcommand === 'check') {
    ph.cmdProjectHygieneCheck(cwd, raw);
  } else if (subcommand === 'move') {
    const objectiveId = args[2];
    let targetRepoPath = null;
    for (const a of args.slice(2)) {
      if (typeof a === 'string' && a.startsWith('--to=')) {
        targetRepoPath = a.slice('--to='.length);
        break;
      }
    }
    if (!targetRepoPath) {
      const toIdx = args.indexOf('--to');
      if (toIdx !== -1) targetRepoPath = args[toIdx + 1];
    }
    ph.cmdProjectHygieneMove(cwd, objectiveId, targetRepoPath, raw);
  } else if (subcommand === 'archive') {
    // Parse --apply <name>, --workspace=<path>, --stale-months=<n>
    let applyName = null;
    let workspaceArg = null;
    let staleMonthsArg = null;
    for (let i = 2; i < args.length; i++) {
      const a = args[i];
      if (a === '--apply') {
        applyName = args[i + 1] || null;
      } else if (typeof a === 'string' && a.startsWith('--apply=')) {
        applyName = a.slice('--apply='.length);
      } else if (typeof a === 'string' && a.startsWith('--workspace=')) {
        workspaceArg = a.slice('--workspace='.length);
      } else if (a === '--workspace') {
        workspaceArg = args[i + 1] || null;
      } else if (typeof a === 'string' && a.startsWith('--stale-months=')) {
        staleMonthsArg = a.slice('--stale-months='.length);
      }
    }
    ph.cmdProjectHygieneArchive(cwd, applyName, workspaceArg, staleMonthsArg, raw);
  } else if (!subcommand) {
    error('Unknown project-hygiene subcommand. Available: check, move, archive');
  } else {
    error(`Unknown project-hygiene subcommand: ${subcommand}. Available: check, move, archive`);
  }
  break;
}
```

# CRITICAL: Run RED tests FIRST, confirm 20 fail. Then implement until all 20 PASS.
# GOTCHA: 22D17 absence-of-gh-execution is verified by the _runGit mock NOT recording any non-'log' calls.
# GOTCHA: 22D9 (no signal) — repo with neither archived flag nor reachable git history must be SKIPPED, not flagged.
# GOTCHA: Approximation `staleMonths * 30` is intentional (locked: not calendar-month accurate). Test 22D4 uses `>= 210` for 7-month-old.
# PATTERN: Module exports grow incrementally across 22-02/22-03/22-04; ensure final export list is complete.
  </action>
  <verify>
`npm test -- --test-name-pattern='22D'` shows 20 tests; ALL pass. Full suite: `npm test 2>&1 | tail -5` shows previous baseline + 20 = (Wave 2 22-03 baseline 2203 + 20 new 22D) 2223 pass, no regressions. Manual smoke: `node plugins/devflow/devflow/bin/df-tools.cjs project-hygiene archive --workspace=/tmp/empty-workspace` returns ok:true with empty candidates.
  </verify>
  <done>
All 20 Group 22D tests pass. Full suite: 2223 pass; 0 new regressions vs Wave 2 22-03 finish state. Single atomic commit: `feat(22-04): add project-hygiene archive CLI with detect + apply (gh command emit-only)`.
  </done>
  <recovery>
If test fails: (a) check workspace detection — `path.dirname(path.resolve(cwd))` semantics. (b) check `_runGit` mock returns canned data with valid trailing newline. (c) for 22D17, instrument the mock to log all calls and assert empty across non-'log' args. (d) if 22-03 already added `_runGit` to project-hygiene.cjs, reuse it; if not, add per snippet above.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs project-hygiene archive --workspace=/tmp/test-ws` returns valid JSON with scanned + candidates
- `node plugins/devflow/devflow/bin/df-tools.cjs project-hygiene archive --apply foo --workspace=/tmp/empty` returns `ok: false` with stderr/stdout error message
- `node plugins/devflow/devflow/bin/df-tools.cjs project-hygiene archive --apply $(basename $(pwd))` returns `ok: false` with self-archive safety message
- Manual end-to-end: build temp workspace fixture with one repo (last commit 7 months ago), run `archive`, observe candidate output. Then `archive --apply <name>`, observe move + emitted gh command.
- `npm test` shows 2223 tests passing (Wave 2 22-03 baseline 2203 + 20 Group 22D)
- VERIFY: no `gh` subprocess fired during apply (instrument with `which gh` removed from PATH OR audit `_runGit` mock call list — args[0] must always equal 'log')
</verification>

<success_criteria>
- `df-tools project-hygiene archive` (detection) returns JSON listing candidates with reason + age_days + archived_flag
- `df-tools project-hygiene archive --apply <name>` moves `.planning/` to `<workspace>/archived-projects/<name>-planning/`
- `--apply` emits `gh repo archive` command to stdout — does NOT execute it
- Archive heuristic: last commit > 6 months OR `archived: true` frontmatter
- Read-only by default; `--apply` required for mutation
- Self-archive safety: refuses `--apply <name>` matching cwd basename
- Recursion guard: skips `archived-projects/` itself
- Workspace detection: parent of cwd if cwd has `.planning/`, else cwd; `--workspace=` overrides
- `--stale-months=N` override for testability
- 2 atomic commits per TDD cycle (test + feat)
- 2203 baseline tests preserved + 20 new Group 22D tests pass
</success_criteria>

<output>
After completion, create `.planning/objectives/22-workflow-impediment-fixes/22-04-hygiene-archive-SUMMARY.md` documenting: tests added (20), production helpers added (`scanRetiredRepos`, `applyArchive`, `cmdProjectHygieneArchive`), CLI surface extended (`df-tools project-hygiene archive` and `--apply <name>`), commits made (2), test count delta (+20), regressions (0). Also: confirm zero gh subprocess executions during test runs.
</output>
