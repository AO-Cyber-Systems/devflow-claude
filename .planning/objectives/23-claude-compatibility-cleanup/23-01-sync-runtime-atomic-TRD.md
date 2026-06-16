---
objective: 23-claude-compatibility-cleanup
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/sync-runtime.js
  - plugins/devflow/hooks/sync-runtime.test.js
autonomous: true
requirements: [SCOPE-1]
must_haves:
  truths:
    - "A fresh session start mirrors devflow/ to ~/.claude/devflow without any *.test.cjs, *.test.js, or __fixtures__/ content (~2.4MB excluded)"
    - "A mirror whose .plugin-version matches the bundled version but whose bin/df-tools.cjs is missing self-heals (re-syncs) on next session start"
    - ".plugin-version is written only AFTER all subdirectory swaps succeed — a failed sync never leaves a current-looking version marker"
    - "Each subdirectory swap is atomic (fs.renameSync), never destroy-then-copy"
  artifacts:
    - "plugins/devflow/hooks/sync-runtime.js — rewritten sync logic"
    - "plugins/devflow/hooks/sync-runtime.test.js — new test file (none exists today)"
  key_links:
    - "sync-runtime.js registered in plugins/devflow/hooks/hooks.json as SessionStart (already wired — do not change hooks.json)"
    - "Exclusion patterns MUST NOT match references/*.md — TRD 23-05 ships references/deviation-rules.md through this same mirror"
---

<objective>
Rewrite the sync-runtime SessionStart hook to use atomic per-subdirectory swaps, exclude test code from the mirror, and self-heal the observed corruption mode (version marker current, tree incomplete).

Purpose: The destroy-then-copy loop confirmed corrupted a live machine on 2026-06-12 (28 of 39 workflows missing while `.plugin-version` claimed current), and 2.4MB of test code ships to every user's home dir.
Output: Atomic, exclusion-filtered, self-healing sync-runtime.js + a from-scratch test suite.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Current sync-runtime.js core (the code being replaced):

```js
// lines 33-35 — the corruption mode: only proves the PARENT dir exists
if (installedVersion === pluginVersion && fs.existsSync(targetDir)) {
  process.exit(0);
}

// lines 59-69 — destroy-then-copy, version marker after loop
for (const sub of ['workflows', 'references', 'templates', 'bin']) {
  const target = path.join(targetDir, sub);
  const source = path.join(sourceDir, sub);
  removeDir(target);
  if (fs.existsSync(source)) {
    copyDir(source, target);
  }
}
fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(versionFile, pluginVersion);
```

Repo conventions: CommonJS, sync fs throughout, hooks exit 0 on every failure path (hooks must never block session start). Test convention: node native test runner, test file adjacent (`sync-runtime.test.js`), subprocess-spawn pattern as in `gate-edits.test.js` / `statusline.test.js` (spawn the hook with controlled env, assert on filesystem results).
</codebase_examples>

<anti_patterns>
- Do NOT keep destroy-then-copy anywhere: `removeDir(target); copyDir(...)` leaves a window where the tree is gone.
- Do NOT write `.plugin-version` before all swaps complete.
- Do NOT hand-roll mkdtemp-based locking — `fs.renameSync` is POSIX-atomic and sufficient (per RESEARCH "Don't Hand-Roll").
- Do NOT exclude anything beyond `*.test.cjs`, `*.test.js`, `__fixtures__/`. Over-broad patterns would drop `references/deviation-rules.md` (shipped by TRD 23-05) or `bin/lib/*.cjs` runtime files.
</anti_patterns>

<error_recovery>
- If a renameSync swap fails mid-loop: catch, write stderr warning, clean up any `devflow-tmp-*` dirs, exit 0 WITHOUT writing the version marker — next session retries.
- Stale temp dirs from a crashed prior run: sweep `devflow-tmp-*` siblings before starting.
- On Windows renameSync over an existing dir fails — remove the old subdir immediately before rename (the non-atomic window is then a single rename, best-effort on Windows, atomic on POSIX).
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/23-claude-compatibility-cleanup/OBJECTIVE.md
@plugins/devflow/hooks/sync-runtime.js
</context>

<research_context>
From 23-RESEARCH.md (HIGH confidence):
- Per-subdir temp+rename is lower-risk than whole-tree swap: each subdir swap independently atomic.
- Temp dir naming: `devflow-tmp-<sub>-<pid>` inside targetDir's parent (same filesystem — rename must not cross devices).
- Exclusion filter as a parameter to copyDir: `const MIRROR_EXCLUDE = [/\.test\.cjs$/, /\.test\.js$/, /(^|\/)__fixtures__(\/|$)/];` matched against entry name AND relative path.
- Content sentinel: before the early-exit at line 33, also require `fs.existsSync(path.join(targetDir, 'bin', 'df-tools.cjs'))` — version-match alone is not proof of an intact mirror.
- Test files in bin/lib total ~1.5MB; __fixtures__/ is 360KB; combined ~2.4MB per user install.
- No existing tests for this hook (awareness-cache-populate.test.js:214 and classify-session.test.js:293 only check hooks.json registration/ordering by name — they do not exercise sync logic).
</research_context>

<gotchas>
- **LIVE-MIRROR SELF-UPDATE HAZARD (critical):** This very session runs from `~/.claude/devflow/`. Tests MUST use a tmpdir for BOTH source and target: spawn the hook subprocess with `CLAUDE_PLUGIN_ROOT=<tmp-plugin-root>` AND `HOME=<tmp-home>` (Node's `os.homedir()` honors `$HOME` on POSIX). NEVER run the hook in tests with the real `HOME` or with `CLAUDE_PLUGIN_ROOT` pointing at the repo root — that overwrites the live mirror mid-session.
- Hand-build fixture trees in test code (mkdirSync + writeFileSync of small marker files like `bin/df-tools.cjs` containing `// stub`). No LLM-generated sample data; no fixtures copied from the real repo tree.
- 12 pre-existing test failures exist in daemon/watcher/peer-scan/novel-domain suites — do not fix, do not worsen. Judge success by zero NEW failures plus the new suite passing.
- HARD CONSTRAINT: never use port 8080 anywhere (tests, examples, docs). If a port is ever needed, use 8091. (This TRD should need no ports at all.)
</gotchas>

## Test list

Outside-in, behavior cases for sync-runtime.test.js (happy, edge, failure):

1. Fresh install (no target dir): all four subdirs (`workflows`, `references`, `templates`, `bin`) mirrored; `.plugin-version` contains the manifest version.
2. Version match + intact mirror (sentinel file present): hook exits without modifying target (compare mtimes or a canary file content before/after).
3. Version mismatch: target re-synced; old stray file in target subdir is gone after swap (rename replaced the whole subdir).
4. Exclusion — `bin/lib/foo.test.cjs` in source is NOT mirrored; sibling `bin/lib/foo.cjs` IS mirrored.
5. Exclusion — `hooks`-style `*.test.js` name in any synced subdir is NOT mirrored.
6. Exclusion — `bin/lib/__fixtures__/cassette.json` is NOT mirrored; the `__fixtures__` dir itself absent from target.
7. Self-heal — `.plugin-version` matches manifest but `target/bin/df-tools.cjs` missing: hook re-syncs (sentinel forces past early-exit).
8. Atomicity hygiene — after a successful sync, no `devflow-tmp-*` entries remain in the target's parent dir.
9. Failure path — missing `CLAUDE_PLUGIN_ROOT` env: hook exits 0, writes nothing to target.
10. Failure path — unreadable/missing plugin.json manifest: hook exits 0, target untouched, `.plugin-version` not written.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write sync-runtime.test.js (RED — new behaviors fail against current hook)</name>
  <files>plugins/devflow/hooks/sync-runtime.test.js</files>
  <action>
Create the test file implementing the ## Test list above using node native test runner (`describe`/`test` from `node:test`, `assert` from `node:assert`).

Harness pattern:
- `makeTmpRoot()` helper: `fs.mkdtempSync(path.join(os.tmpdir(), 'sync-rt-'))` containing `plugin-root/` (with `.claude-plugin/plugin.json` declaring `{"version":"9.9.9-test"}` and a `devflow/` tree built by hand: `bin/df-tools.cjs` stub, `bin/lib/helper.cjs`, `bin/lib/helper.test.cjs`, `bin/lib/__fixtures__/sample.json`, `workflows/wf.md`, `references/ref.md`, `templates/tpl.md`) and `home/` (the fake HOME).
- `runHook(env)` helper: `spawnSync(process.execPath, [path.join(__dirname, 'sync-runtime.js')], { env: { ...process.env, CLAUDE_PLUGIN_ROOT: tmpPluginRoot, HOME: tmpHome } })`.
- NEVER pass the real HOME or the repo root as CLAUDE_PLUGIN_ROOT (live-mirror hazard — see gotchas).
- Hand-built fixtures only (no_llm_test_data constraint); descriptive test names, no property-based libs, no .feature files.

Run `node --test plugins/devflow/hooks/sync-runtime.test.js` — exclusion tests (4-6), self-heal test (7), and tmp-hygiene test (8) MUST fail against the current implementation; fresh-install and early-exit tests (1-2, 9-10) may already pass (characterization).

Commit: `test(23-01): add failing tests for atomic sync, exclusions, self-heal`
  </action>
  <verify>node --test plugins/devflow/hooks/sync-runtime.test.js 2>&1 | tail -5 — shows failures ONLY for new behaviors (exclusion/self-heal/atomicity); characterization tests pass</verify>
  <done>Test file exists, runs, and fails for exactly the not-yet-implemented behaviors; no test touches real HOME or repo plugin root</done>
  <recovery>If os.homedir() does not honor $HOME in the spawn (unexpected on darwin/linux), fall back to asserting the hook supports a DEVFLOW_SYNC_TARGET test-only env override added in Task 2 — but try HOME first; it is the established Node POSIX behavior.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement atomic swap + exclusions + content sentinel (GREEN)</name>
  <files>plugins/devflow/hooks/sync-runtime.js</files>
  <action>
Rewrite the sync core of plugins/devflow/hooks/sync-runtime.js:

Approach:
1. Add `MIRROR_EXCLUDE = [/\.test\.cjs$/, /\.test\.js$/, /(^|\/)__fixtures__(\/|$)/]` and `shouldExclude(entryName, relPath)` (research Code Examples section).
2. Extend `copyDir(src, dest, relBase)` to skip excluded entries (test name and accumulated relative path against MIRROR_EXCLUDE).
3. Content sentinel: change the early-exit to `if (installedVersion === pluginVersion && fs.existsSync(path.join(targetDir, 'bin', 'df-tools.cjs'))) process.exit(0);` — an incomplete mirror with a matching marker now re-syncs.
4. Atomic per-subdir swap: for each of ['workflows','references','templates','bin'] — copy source/sub into `path.join(targetDir, 'devflow-tmp-' + sub + '-' + process.pid)` with exclusions, then `removeDir(target/sub)` immediately followed by `fs.renameSync(tmpPath, target/sub)`. Sweep any stale `devflow-tmp-*` entries in targetDir before starting.
5. Write `.plugin-version` ONLY after all four swaps succeed.
6. On any error: stderr warning, best-effort cleanup of tmp dirs, exit 0 WITHOUT writing the version marker (preserves retry-next-session semantics).

# CRITICAL: temp dirs must live inside targetDir (same filesystem) — renameSync cannot cross devices.
# GOTCHA: keep the existing exit-0-on-all-failures hook contract; never throw out of main flow.
# PATTERN: keep file header comment style and sync-fs conventions of the current hook.

Run the full Task 1 suite — all green. Then run `npm test` to confirm zero new failures elsewhere (awareness-cache-populate.test.js:214 and classify-session.test.js:293 reference the hook by name only and stay green).

Commit: `feat(23-01): atomic mirror swap, test-code exclusions, content sentinel`
  </action>
  <verify>node --test plugins/devflow/hooks/sync-runtime.test.js passes 10/10; npm test shows no new failures beyond the 12 known pre-existing</verify>
  <done>All Test-list cases pass; sync excludes ~2.4MB of test code; sentinel self-heal works; version marker write ordered after swaps</done>
  <recovery>If renameSync onto an existing dir errors on this platform, do removeDir(target/sub) then renameSync (already the specified order); if a swap still fails, abort remaining swaps, clean tmp dirs, do not write the marker — tests 9/10 prove the failure contract.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/hooks/sync-runtime.test.js` — 10/10 pass
- `grep -n "renameSync" plugins/devflow/hooks/sync-runtime.js` — atomic swap present
- `grep -n "df-tools.cjs" plugins/devflow/hooks/sync-runtime.js` — sentinel present
- Exclusion regexes do NOT match `references/deviation-rules.md`: `node -e "const p=[/\.test\.cjs$/,/\.test\.js$/,/(^|\/)__fixtures__(\/|$)/]; console.log(p.some(r=>r.test('references/deviation-rules.md')))"` prints `false`
- `npm test` — zero new failures (12 known pre-existing in daemon/watcher/peer-scan/novel-domain allowed)
</verification>

<success_criteria>
- Mirror sync is atomic per subdirectory; `.plugin-version` written only on full success
- `*.test.cjs`, `*.test.js`, `__fixtures__/` excluded from the mirror
- Corruption mode (marker current, bin/df-tools.cjs missing) self-heals
- New sync-runtime.test.js suite passes using tmpdir source AND target exclusively
</success_criteria>

<output>
After completion, create `.planning/objectives/23-claude-compatibility-cleanup/23-01-SUMMARY.md`
</output>
