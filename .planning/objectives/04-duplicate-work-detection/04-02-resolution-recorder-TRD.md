---
objective: 04-duplicate-work-detection
trd: 04-02
title: recordResolution (jsonl append) + applyResolution dispatcher (Defer/Coordinate/Proceed-anyway file writes) + .gitignore for log
type: tdd
confidence: high
wave: 2
depends_on: [04-01]
files_modified:
  - plugins/devflow/devflow/bin/lib/dup-detect.cjs
  - plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
  - plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs
  - plugins/devflow/devflow/bin/lib/dup-detect-cli.test.cjs
  - .gitignore
autonomous: true
requirements: [SC-6, SC-8, SC-9]
verification_commands:
  - "npm test -- --grep 'recordResolution|applyResolution|coordination|deferred|jsonl'"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/dup-detect.cjs\"); for (const s of [\"recordResolution\",\"applyResolution\",\"_writeCoordinationNote\",\"_writeDeferredState\"]) if(typeof a[s]!==\"function\") throw new Error(s+\" not exported\"); console.log(\"OK\");'"
  - "grep -E '\\.dup-detect-log\\.jsonl|\\.deferred' .gitignore | head -3"
  - "node ./plugins/devflow/devflow/bin/df-tools.cjs dup-detect resolve --help 2>&1 | grep -E 'merge|defer|coordinate|proceed-anyway'"

must_haves:
  truths:
    - "recordResolution({ objective_id, mode, blocking, top_match, resolution, cwd }) appends a single JSON line to .planning/.dup-detect-log.jsonl with locked schema (timestamp, objective_id, mode, blocking, top_match: {strength, peer, score} | null, resolution). Append-only; no rotation."
    - "applyResolution({ resolution, objective_id, peer_branch, peer_objective, cwd, detection }) dispatches based on resolution string: 'merge' prints abort message + git checkout suggestion + exits skill workflow; 'defer' calls _writeDeferredState; 'coordinate' calls _writeCoordinationNote with 'Coordinate' label; 'proceed-anyway' calls _writeCoordinationNote with 'Proceed-anyway' label PLUS warning line."
    - "_writeCoordinationNote(objective_dir, padded, note_data) appends a `## Coordination Note` section to <objective_dir>/<padded>-CONTEXT.md naming peer objective + branch + signal + suggested handoff. Multiple plan-time runs accumulate (append, never replace)."
    - "_writeDeferredState(objective_id, state, cwd) writes .planning/.deferred/<objective_id>.json with locked schema (objective_id, deferred_at, mode, objective_dir, trd_count_at_defer, last_commit_at_defer, blocking_match, resolution_timestamp). Creates .planning/.deferred/ directory lazily."
    - ".gitignore updated: adds `.planning/.dup-detect-log.jsonl` line. Does NOT add `.planning/.deferred/` (that's user planning state, may be committed for cross-machine resume in v1.2)."
    - "df-tools dup-detect resolve <objective_id> --resolution <type> --peer-branch <name> --peer-objective <id> CLI subcommand wires applyResolution + recordResolution; exits with structured success message"
    - "df-tools dup-detect log <objective_id> --mode <m> [--blocking ...] [--top-match-json ...] [--resolution ...] CLI subcommand wires recordResolution directly (used by execute-time no-match log entry)"
    - "Atomic append semantics: concurrent recordResolution calls append to JSONL via fs.appendFileSync (POSIX atomic per write); last-writer-wins acceptable for v1.1 — no rotation, no compaction"
    - "All new tests follow RED → GREEN: test commit precedes feat commit per TDD Playbook habit 3"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/dup-detect.cjs"
      provides: "Extended with recordResolution + applyResolution + _writeCoordinationNote + _writeDeferredState (TRD 04-02 region). Module.exports extended with these 4 entries (preserves all 04-01 entries)."
      exports: ["recordResolution", "applyResolution", "_writeCoordinationNote", "_writeDeferredState"]
    - path: "plugins/devflow/devflow/bin/lib/dup-detect.test.cjs"
      provides: "Test groups RR (recordResolution jsonl append), AR (applyResolution dispatcher), CN (coordination note writer), DS (deferred state writer), CLI8/9 (resolve + log subcommands)."
      contains: "recordResolution"
    - path: "plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs"
      provides: "cmdDupDetectResolve + cmdDupDetectLog implementations replace 04-01 stubs."
      contains: "applyResolution"
    - path: ".gitignore"
      provides: "Adds `.planning/.dup-detect-log.jsonl` line in same comment block as obj 2's awareness cache."
      contains: ".dup-detect-log.jsonl"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/dup-detect.cjs::applyResolution"
      to: "plugins/devflow/devflow/bin/lib/dup-detect.cjs::_writeCoordinationNote + _writeDeferredState"
      via: "switch on resolution string → dispatch to writer helper"
      pattern: "switch.*resolution|case 'coordinate'|case 'defer'"
    - from: "plugins/devflow/devflow/bin/lib/dup-detect.cjs::recordResolution"
      to: ".planning/.dup-detect-log.jsonl"
      via: "fs.appendFileSync + JSON.stringify"
      pattern: "appendFileSync.*dup-detect-log"
    - from: "plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs::cmdDupDetectResolve"
      to: "plugins/devflow/devflow/bin/lib/dup-detect.cjs::applyResolution + recordResolution"
      via: "compose dispatch + log"
      pattern: "applyResolution.*recordResolution"
---

<objective>
Add the **resolution recorder + applyResolution dispatcher** to `lib/dup-detect.cjs`. This TRD closes the loop on the 4-option resolution flow: when the user picks Merge / Defer / Coordinate / Proceed-anyway in the AskUserQuestion (wired in TRD 04-04 / 04-05), this code persists the choice (jsonl log + CONTEXT.md note + .deferred/ state file as appropriate) and dispatches the workflow consequence.

Pure logic + filesystem writes. No network. All filesystem operations route through `_runFs` for testability (already injected by 04-01).

Output:
1. `recordResolution(record)` — atomic JSONL append with locked schema
2. `applyResolution(opts)` — switch on resolution; dispatch to writer helpers
3. `_writeCoordinationNote(objective_dir, padded, note_data)` — append section to CONTEXT.md
4. `_writeDeferredState(objective_id, state, cwd)` — write .planning/.deferred/<id>.json
5. CLI subcommands `dup-detect resolve` and `dup-detect log` replacing 04-01 stubs
6. .gitignore updated for `.planning/.dup-detect-log.jsonl`
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── dup-detect.cjs                  ← MODIFY  (add recordResolution + applyResolution + writers region)
├── dup-detect.test.cjs             ← MODIFY  (add Groups RR, AR, CN, DS, CLI8, CLI9)
├── dup-detect-cli.cjs              ← MODIFY  (replace resolve + log stubs)
└── dup-detect-cli.test.cjs         ← MODIFY  (add resolve + log CLI tests)

.gitignore                          ← MODIFY  (add .dup-detect-log.jsonl)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing JSONL append pattern**: not present elsewhere in this codebase, but the standard Node pattern is `fs.appendFileSync` which is atomic for small writes on POSIX.

**Existing CONTEXT.md section append pattern** — `skills/research-objective/SKILL.md` step 2.5 (obj 3 ship):

```bash
if [[ ! -f "$CONTEXT_PATH" ]]; then
  cat > "$CONTEXT_PATH" <<EOF
---
objective: ...
---

# Objective ${objective_number} — Context

${SECTION_HEADER}
...
EOF
elif grep -q "^${SECTION_HEADER}" "$CONTEXT_PATH"; then
  # Replace existing section body in-place
  ...
else
  # Append section at end
  echo "" >> "$CONTEXT_PATH"
  echo "${SECTION_HEADER}" >> "$CONTEXT_PATH"
  ...
fi
```

**Adapt for `_writeCoordinationNote`**: ALWAYS append (never replace) — multiple plan-time runs accumulate. Use Node fs not bash. Three branches: file missing (create with scaffold), section header missing (append), section header present (still append a NEW occurrence — accumulating, NOT replacing). This is intentionally different from obj 3's behavior.

```js
function _writeCoordinationNote(objective_dir, padded, note_data) {
  const contextPath = path.join(objective_dir, `${padded}-CONTEXT.md`);
  const noteBody = [
    '## Coordination Note',
    '',
    `Detected duplicate-work signals at plan-time on \`${note_data.timestamp}\`:`,
    '',
    `- **Strength:** ${note_data.strength}`,
    `- **Source:** ${note_data.source}`,
    `- **Peer objective:** \`${note_data.peer_objective || '(unknown)'}\``,
    `- **Peer branch:** \`${note_data.peer_branch || '(n/a)'}\``,
    `- **Signal:** ${note_data.signal || '(none)'}`,
    `- **User resolution:** ${note_data.resolution_label}`,
    '',
  ];
  if (note_data.warning) {
    noteBody.push(`**WARNING:** ${note_data.warning}`, '');
  }
  noteBody.push('**Suggested handoff points:**');
  noteBody.push(`- ${note_data.suggested_handoff || '(see signal description)'}`);
  noteBody.push('');

  let prefix = '';
  if (!_runFs.existsSync(contextPath)) {
    // Create with frontmatter scaffold matching obj 3's pattern
    prefix = `---
objective: ${note_data.objective_id || ''}
created: ${note_data.timestamp}
---

# Objective ${note_data.objective_id || ''} — Context

`;
  } else {
    prefix = '\n';
  }
  _runFs.appendFileSync(contextPath, prefix + noteBody.join('\n') + '\n');
}
```

**Existing JSON write + mkdir pattern** — `lib/awareness.cjs::writeCache` (obj 2 ship, line 179-191):

```js
function writeCache(cwd, sections) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
  const existing = readCache(cwd) || {};
  const merged = Object.assign({}, existing, sections || {});
  fs.writeFileSync(path.join(cwd, AWARENESS_CACHE_REL), JSON.stringify(merged, null, 2) + '\n');
}
```

**Adapt for _writeDeferredState** — same mkdir pattern, but lazy-create `.planning/.deferred/` (not just `.planning/`):

```js
function _writeDeferredState(objective_id, state, cwd) {
  const deferDir = path.join(cwd, '.planning', '.deferred');
  if (!_runFs.existsSync(deferDir)) _runFs.mkdirSync(deferDir, { recursive: true });
  const filePath = path.join(deferDir, `${objective_id}.json`);
  const payload = Object.assign({
    objective_id,
    deferred_at: new Date().toISOString(),
    resolution_timestamp: new Date().toISOString(),
  }, state);
  _runFs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n');
}
```

**Existing CLI subcommand pattern with multiple flags** — `lib/awareness-cli.cjs::parseShowFlags` (obj 2):

```js
function parseShowFlags(args) {
  const out = { peer_only: false, ... };
  const a = args.slice();
  while (a.length > 0) {
    const t = a.shift();
    if (t === '--peer-only') out.peer_only = true;
    else if (t === '--quarter') out.quarter = a.shift() || null;
    // ...
  }
  return out;
}
```

Mirror for `cmdDupDetectResolve` flag parsing: `--resolution`, `--peer-branch`, `--peer-objective`, `--cwd`.

</codebase_examples>

<anti_patterns>

- **DO NOT rotate or compact `.planning/.dup-detect-log.jsonl`.** Append-only forever per CONTEXT.md locked decision #7. v1.1 doesn't rotate; v1.2+ may add a separate compaction tool.
- **DO NOT include developer / PII in JSONL records.** Schema is locked: `{ timestamp, objective_id, mode, blocking, top_match: {strength, peer, score} | null, resolution }`. NO `developer` field, NO peer email, NO machine ID.
- **DO NOT replace existing Coordination Notes.** Each plan-time detection appends a NEW occurrence so multiple runs accumulate. Mirror is intentional — different from obj 3's `## Cross-Repo Considerations` replace-in-place behavior.
- **DO NOT execute `git checkout` from `applyResolution` for Merge mode.** Just print the suggested command (CONTEXT.md discretion area: "PRINT only, do not execute"). User runs it manually.
- **DO NOT add `.planning/.deferred/` to .gitignore.** Per CONTEXT.md decision #4, .deferred/ is user planning state that may be committed for cross-machine resume in v1.2.
- **DO NOT require `objective_dir` parameter in recordResolution.** Pass only the bare schema (objective_id, mode, blocking, top_match, resolution). cwd is enough to resolve the log path.
- **DO NOT mock `appendFileSync` directly in tests.** Use a tmpdir + real fs writes; assert by reading the file back. Mirrors obj 2 cache test pattern.

</anti_patterns>

<error_recovery>

- **`.planning/` directory missing** → `_writeDeferredState` lazily creates `.planning/.deferred/` (`mkdirSync recursive: true`). `recordResolution` lazily creates `.planning/` if needed before append.
- **Existing CONTEXT.md is malformed** → `_writeCoordinationNote` appends to end regardless. No frontmatter parsing required for append.
- **JSONL file unreadable for some reason** (permissions / disk full) → `recordResolution` catches the error and writes a warning to stderr; does NOT throw (consumer must continue).
- **Concurrent recordResolution calls (rare)** → `fs.appendFileSync` is atomic per call on POSIX. Records are line-delimited; no record can be torn.
- **`applyResolution` for `merge` mode** → prints abort message + git checkout suggestion to stdout/stderr. Returns `{ aborted: true, suggestion: '...' }`. Caller (skill workflow) handles workflow exit.
- **`applyResolution` with unknown resolution string** → throws Error (intentional — caller passed bad input; should never happen if AskUserQuestion enforces options).
- **Running on a system without `.planning/` (no init)** → `_writeCoordinationNote` creates parent dirs as needed; `_writeDeferredState` creates `.planning/.deferred/`. No prereq beyond cwd existing.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/04-duplicate-work-detection/04-CONTEXT.md
@.planning/objectives/04-duplicate-work-detection/04-RESEARCH.md
@.planning/objectives/04-duplicate-work-detection/04-01-detection-engine-and-fixtures-TRD.md

# Files this TRD extends:
@plugins/devflow/devflow/bin/lib/dup-detect.cjs
@plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs

# Pattern reference:
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/awareness-cli.cjs
</context>

<gotchas>

- **`fs.appendFileSync` requires the parent directory to exist.** Wrap in: `if (!_runFs.existsSync(planningDir)) _runFs.mkdirSync(planningDir, { recursive: true });` before append.
- **JSONL records MUST end with `\n`.** Format: `JSON.stringify(record) + '\n'` — no trailing whitespace, no commas.
- **AskUserQuestion's resolution values are case-sensitive in the workflow.** Standardize to lowercase: `'merge' | 'defer' | 'coordinate' | 'proceed-anyway'`. The workflow MUST normalize before passing to applyResolution.
- **`_writeCoordinationNote` accepts `objective_dir` and `padded` separately** so it can construct the CONTEXT.md path. The skill workflow has both available from `init`.
- **`top_match` field in JSONL can be null** — when no match (mode=execute, no blocking). Accept `top_match: null` and serialize as JSON null.
- **Defer schema's `last_commit_at_defer` requires git** — but commit lookup may fail (e.g., empty repo). Catch the spawnSync error → set null. Don't propagate.
- **`process.exit(0)` in CLI commands ends the process** — for `cmdDupDetectResolve`, write a structured success message to stdout (or via `output()`) THEN exit. Helpers `output(payload, raw)` already exits 0 after writing.
- **Coordination Note Markdown formatting** — bullet items use `- **Field:** value` (two stars). The signal/peer values may contain backticks or newlines; sanitize by stripping newlines before insertion (`note_data.signal.replace(/\n/g, ' ')`).

</gotchas>

## Test list

Per CLAUDE.md TDD Playbook habit 2: enumerate behavior cases BEFORE writing test code.

### Group RR (recordResolution — JSONL append)
- RR1: first call creates .planning/.dup-detect-log.jsonl with single line of JSON
- RR2: second call appends second line (file now has 2 lines)
- RR3: schema correct — { timestamp, objective_id, mode, blocking, top_match, resolution } with no extra fields
- RR4: top_match: null when caller passes null
- RR5: top_match shape: { strength, peer, score } when caller passes a match
- RR6: timestamp is ISO 8601 UTC (regex /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
- RR7: lazy-creates .planning/ directory if missing
- RR8: file write permission error caught — warning to stderr, no throw
- RR9: NO `developer` or PII fields included
- RR10: each line is valid JSON parseable (\n-delimited)

### Group AR (applyResolution dispatcher)
- AR1: resolution='coordinate' calls _writeCoordinationNote with label='Coordinate'; returns { wrote_coordination_note: true }
- AR2: resolution='proceed-anyway' calls _writeCoordinationNote with label='Proceed-anyway' AND warning line; returns { wrote_coordination_note: true, warning_appended: true }
- AR3: resolution='defer' calls _writeDeferredState; returns { wrote_deferred: true, defer_path: '...' }
- AR4: resolution='merge' returns { aborted: true, suggestion: 'git checkout <peer_branch>' }; does NOT write any file
- AR5: unknown resolution → throws Error
- AR6: AR1 result + recordResolution call records 'coordinate' in JSONL (integration check)

### Group CN (_writeCoordinationNote)
- CN1: existing CONTEXT.md gets section appended; previous content preserved
- CN2: missing CONTEXT.md created with frontmatter scaffold + section
- CN3: SECOND call appends ANOTHER ## Coordination Note section (accumulates, not replaces)
- CN4: signal containing newlines is sanitized (no embedded newlines in markdown bullet)
- CN5: peer_objective containing backticks renders correctly (escaped or stripped)
- CN6: warning field present → renders **WARNING:** line in proceed-anyway path
- CN7: warning field absent → no **WARNING:** line in coordinate path

### Group DS (_writeDeferredState)
- DS1: file written to .planning/.deferred/<objective_id>.json
- DS2: schema correct — objective_id, deferred_at, mode, objective_dir, trd_count_at_defer, last_commit_at_defer, blocking_match, resolution_timestamp
- DS3: lazy-creates .planning/.deferred/ directory if missing
- DS4: existing file overwritten (not appended) on second defer of same objective
- DS5: deferred_at and resolution_timestamp are ISO 8601 UTC
- DS6: blocking_match is preserved verbatim from input

### Group CLI8 (resolve subcommand)
- CLI8a: `df-tools dup-detect resolve 04 --resolution coordinate --peer-branch feature/peer --peer-objective 04` writes coordination note + jsonl log; exits 0 with success JSON
- CLI8b: `--resolution defer` writes .planning/.deferred/04.json + jsonl log
- CLI8c: `--resolution merge` prints abort message; exits 0; jsonl log entry recorded
- CLI8d: `--resolution proceed-anyway` writes coordination note with warning + jsonl log
- CLI8e: missing --resolution flag → exits 1 with error
- CLI8f: invalid --resolution value (e.g., 'foo') → exits 1 with error

### Group CLI9 (log subcommand)
- CLI9a: `df-tools dup-detect log 04 --mode execute --blocking false --resolution none` appends JSONL line
- CLI9b: `--top-match-json '{...}'` parses JSON and includes in record
- CLI9c: malformed --top-match-json → exits 1 with parse error
- CLI9d: missing --mode → exits 1 with error
- CLI9e: invalid --resolution value → exits 1 with error

<tasks>

<task type="auto">
  <name>Task 1: RED — write failing tests for recordResolution + applyResolution + writers + CLI</name>
  <files>
    plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
    plugins/devflow/devflow/bin/lib/dup-detect-cli.test.cjs
  </files>
  <action>
**RED PHASE PER TDD PLAYBOOK HABIT 3 — one test at a time.**

Append tests to existing `dup-detect.test.cjs` and `dup-detect-cli.test.cjs` (do NOT replace 04-01 tests). Append at the bottom of each file.

`dup-detect.test.cjs` additions:

```js
// ─── TRD 04-02: recordResolution + applyResolution ────────────────────────────

const fs = require('fs');
const path = require('path');
const os = require('os');

function _mkTmpRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-test-'));
  fs.mkdirSync(path.join(tmp, '.planning'), { recursive: true });
  return tmp;
}

// Group RR
test('RR1 — first recordResolution creates JSONL with single line', () => {
  const tmp = _mkTmpRepo();
  try {
    dd.recordResolution({
      objective_id: '04', mode: 'plan', blocking: true,
      top_match: { strength: 'hard', peer: 'feature/peer', score: 100 },
      resolution: 'coordinate', cwd: tmp,
    });
    const content = fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    assert.strictEqual(lines.length, 1);
    const rec = JSON.parse(lines[0]);
    assert.strictEqual(rec.objective_id, '04');
    assert.strictEqual(rec.resolution, 'coordinate');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('RR2 — second recordResolution appends second line', () => {
  const tmp = _mkTmpRepo();
  try {
    dd.recordResolution({ objective_id: '04', mode: 'plan', blocking: true, top_match: null, resolution: 'merge', cwd: tmp });
    dd.recordResolution({ objective_id: '04', mode: 'execute', blocking: false, top_match: null, resolution: 'none', cwd: tmp });
    const lines = fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8').trim().split('\n');
    assert.strictEqual(lines.length, 2);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('RR3 — schema fields exact', () => {
  const tmp = _mkTmpRepo();
  try {
    dd.recordResolution({ objective_id: '04', mode: 'plan', blocking: false, top_match: null, resolution: 'none', cwd: tmp });
    const rec = JSON.parse(fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8').trim());
    const keys = Object.keys(rec).sort();
    assert.deepStrictEqual(keys, ['blocking', 'mode', 'objective_id', 'resolution', 'timestamp', 'top_match']);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ... RR4-RR10

// Group AR
test('AR1 — resolution=coordinate writes coordination note', () => {
  const tmp = _mkTmpRepo();
  const objDir = path.join(tmp, '.planning', 'objectives', '04-test');
  fs.mkdirSync(objDir, { recursive: true });
  try {
    const r = dd.applyResolution({
      resolution: 'coordinate', objective_id: '04',
      peer_branch: 'feature/peer', peer_objective: '04 — peer',
      cwd: tmp,
      detection: {
        timestamp: new Date().toISOString(),
        matches: [{ strength: 'strong', source: 'peer', signal: 'shared file', peer_branch: 'feature/peer', peer_objective: '04 — peer' }],
      },
      objective_dir: objDir, padded_objective: '04',
    });
    assert.strictEqual(r.wrote_coordination_note, true);
    const ctx = fs.readFileSync(path.join(objDir, '04-CONTEXT.md'), 'utf-8');
    assert.match(ctx, /## Coordination Note/);
    assert.match(ctx, /Coordinate/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ... AR2-AR6

// Group CN
test('CN3 — second _writeCoordinationNote call appends, does not replace', () => {
  const tmp = _mkTmpRepo();
  const objDir = path.join(tmp, '.planning', 'objectives', '04-test');
  fs.mkdirSync(objDir, { recursive: true });
  try {
    const note = {
      objective_id: '04', timestamp: new Date().toISOString(),
      strength: 'strong', source: 'peer', peer_objective: 'peer',
      peer_branch: 'feature/peer', signal: 'shared',
      resolution_label: 'Coordinate', suggested_handoff: 'split work',
    };
    dd._writeCoordinationNote(objDir, '04', note);
    dd._writeCoordinationNote(objDir, '04', note);
    const ctx = fs.readFileSync(path.join(objDir, '04-CONTEXT.md'), 'utf-8');
    const matches = ctx.match(/## Coordination Note/g) || [];
    assert.strictEqual(matches.length, 2);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ... CN1, CN2, CN4-CN7

// Group DS
test('DS1 — _writeDeferredState writes .planning/.deferred/<id>.json', () => {
  const tmp = _mkTmpRepo();
  try {
    dd._writeDeferredState('04', {
      mode: 'plan', objective_dir: '.planning/objectives/04-test',
      trd_count_at_defer: 0, last_commit_at_defer: null,
      blocking_match: { strength: 'hard', source: 'peer', peer_branch: 'feature/x', peer_objective: '04', signal: 'gh', score: 100 },
    }, tmp);
    const filePath = path.join(tmp, '.planning', '.deferred', '04.json');
    assert.ok(fs.existsSync(filePath));
    const state = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    assert.strictEqual(state.objective_id, '04');
    assert.strictEqual(state.mode, 'plan');
    assert.ok(state.deferred_at);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ... DS2-DS6
```

`dup-detect-cli.test.cjs` additions:

```js
// ─── TRD 04-02: resolve + log subcommands ─────────────────────────────────────

test('CLI8a — resolve --resolution coordinate writes note + jsonl', () => {
  const tmp = _mkTmpRepo();
  fs.mkdirSync(path.join(tmp, '.planning', 'objectives', '04-test'), { recursive: true });
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'resolve', '04',
      '--resolution', 'coordinate',
      '--peer-branch', 'feature/peer',
      '--peer-objective', '04 — peer',
      '--cwd', tmp,
    ], { encoding: 'utf-8' });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    // CONTEXT.md should exist with section
    const ctxPath = path.join(tmp, '.planning', 'objectives', '04-test', '04-CONTEXT.md');
    assert.ok(fs.existsSync(ctxPath));
    // jsonl log should exist with 1 line
    const log = fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8');
    assert.strictEqual(log.trim().split('\n').length, 1);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('CLI9a — log --mode execute --blocking false --resolution none appends', () => {
  const tmp = _mkTmpRepo();
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'log', '04',
      '--mode', 'execute',
      '--blocking', 'false',
      '--resolution', 'none',
      '--cwd', tmp,
    ], { encoding: 'utf-8' });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const log = fs.readFileSync(path.join(tmp, '.planning', '.dup-detect-log.jsonl'), 'utf-8');
    assert.strictEqual(log.trim().split('\n').length, 1);
    const rec = JSON.parse(log.trim());
    assert.strictEqual(rec.mode, 'execute');
    assert.strictEqual(rec.blocking, false);
    assert.strictEqual(rec.resolution, 'none');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ... CLI8b-f, CLI9b-e
```

# CRITICAL: Tests must FAIL with "recordResolution is not a function" or similar (function not yet exported by dup-detect.cjs).
# PATTERN: Mirror obj 2's tmpdir test pattern (e.g., readCache/writeCache tests in awareness.test.cjs).

Run `npm test 2>&1 | grep -E 'RR|AR|CN|DS|CLI8|CLI9' | head -30` — should show all groups failing.

**Commit RED phase:**
```bash
git add plugins/devflow/devflow/bin/lib/dup-detect.test.cjs plugins/devflow/devflow/bin/lib/dup-detect-cli.test.cjs
git commit -m "test(04-02): add failing tests for recordResolution + applyResolution + writers + CLI

RED phase: tests fail because recordResolution / applyResolution / _writeCoordinationNote /
_writeDeferredState don't yet exist; cmdDupDetectResolve and cmdDupDetectLog are still
04-01 stubs. Test groups: RR (jsonl append), AR (dispatcher), CN (coordination note),
DS (deferred state), CLI8 (resolve), CLI9 (log)."
```
  </action>
  <verify>
`npm test 2>&1 | grep -E 'RR|AR|CN|DS|CLI8|CLI9|fail|FAIL' | head -30` shows test failures pointing at missing exports / stub error messages. Test count for 04-02 groups >= 28 cases.
  </verify>
  <done>
test commit lands. All test cases per Test list groups RR, AR, CN, DS, CLI8, CLI9 are written. Tests fail on missing exports + stub-error responses. RED → GREEN ordering preserved.
  </done>
  <recovery>
If tmpdir cleanup fails on test failure (orphaned dirs in /tmp): they auto-prune on macOS reboot. For the test run, wrap each test in try/finally with `fs.rmSync(tmp, { recursive: true, force: true })` to minimize accumulation.
If `spawnSync` --cwd flag isn't supported by the CLI (it's not a Node spawn flag — it's a custom CLI flag), use the spawnSync's `cwd:` option to set process working dir, OR add explicit `--cwd <path>` flag handling in cmdDupDetectResolve / cmdDupDetectLog. The latter is more explicit and simpler for tests.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement recordResolution + applyResolution + writers + replace CLI stubs + .gitignore</name>
  <files>
    plugins/devflow/devflow/bin/lib/dup-detect.cjs
    plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs
    .gitignore
  </files>
  <action>
**GREEN PHASE PER TDD PLAYBOOK HABIT 3 — minimal code to pass the RED tests.**

**Part 1: Extend `lib/dup-detect.cjs` — TRD 04-02 region**

Add the new region BELOW the existing TRD 04-01 detection logic, ABOVE the `module.exports` block. The 04-01 module.exports MUST be REPLACED with the extended one listing all 04-01 + 04-02 entries.

```js
// ─── TRD 04-02: recordResolution + applyResolution + writers ─────────────────

/**
 * Append a single record to .planning/.dup-detect-log.jsonl.
 * Schema (locked):
 *   { timestamp, objective_id, mode, blocking, top_match: {strength, peer, score}|null, resolution }
 *
 * Lazy-creates .planning/ if missing. Atomic per-call (POSIX appendFileSync).
 * Never throws; on write error, warns to stderr.
 *
 * @param {object} opts
 * @param {string}      opts.objective_id
 * @param {'plan'|'execute'} opts.mode
 * @param {boolean}     opts.blocking
 * @param {{ strength: string, peer: string|null, score: number|null } | null} opts.top_match
 * @param {'merge'|'defer'|'coordinate'|'proceed-anyway'|'none'} opts.resolution
 * @param {string}      [opts.cwd]
 */
function recordResolution({ objective_id, mode, blocking, top_match, resolution, cwd = process.cwd() } = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    objective_id,
    mode,
    blocking: !!blocking,
    top_match: top_match || null,
    resolution: resolution || 'none',
  };
  const planningDir = path.join(cwd, '.planning');
  const logPath = path.join(cwd, DUP_DETECT_LOG_REL);
  try {
    if (!_runFs.existsSync(planningDir)) _runFs.mkdirSync(planningDir, { recursive: true });
    _runFs.appendFileSync(logPath, JSON.stringify(record) + '\n');
  } catch (e) {
    process.stderr.write(`Warning: recordResolution failed: ${e && e.message ? e.message : String(e)}\n`);
  }
}

/**
 * Append a `## Coordination Note` section to <objective_dir>/<padded>-CONTEXT.md.
 * Always appends; never replaces (multiple plan-time runs accumulate).
 * Lazy-creates CONTEXT.md with frontmatter scaffold if missing.
 *
 * @param {string} objective_dir
 * @param {string} padded
 * @param {object} note_data
 *   { objective_id, timestamp, strength, source, peer_objective, peer_branch,
 *     signal, resolution_label, suggested_handoff, warning? }
 */
function _writeCoordinationNote(objective_dir, padded, note_data) {
  const contextPath = path.join(objective_dir, `${padded}-CONTEXT.md`);
  const sanitize = (s) => (s == null ? '' : String(s).replace(/[\r\n]+/g, ' '));

  const noteBody = [
    '## Coordination Note',
    '',
    `Detected duplicate-work signals at plan-time on \`${note_data.timestamp}\`:`,
    '',
    `- **Strength:** ${sanitize(note_data.strength)}`,
    `- **Source:** ${sanitize(note_data.source)}`,
    `- **Peer objective:** \`${sanitize(note_data.peer_objective) || '(unknown)'}\``,
    `- **Peer branch:** \`${sanitize(note_data.peer_branch) || '(n/a)'}\``,
    `- **Signal:** ${sanitize(note_data.signal) || '(none)'}`,
    `- **User resolution:** ${sanitize(note_data.resolution_label)}`,
    '',
  ];
  if (note_data.warning) {
    noteBody.push(`**WARNING:** ${sanitize(note_data.warning)}`, '');
  }
  noteBody.push('**Suggested handoff points:**');
  noteBody.push(`- ${sanitize(note_data.suggested_handoff) || '(see signal description)'}`);
  noteBody.push('');

  let prefix = '';
  if (!_runFs.existsSync(contextPath)) {
    // Lazy-create with minimal frontmatter scaffold
    prefix = `---
objective: ${note_data.objective_id || ''}
created: ${note_data.timestamp}
---

# Objective ${note_data.objective_id || ''} — Context

`;
    // Ensure objective_dir exists
    try {
      if (!_runFs.existsSync(objective_dir)) _runFs.mkdirSync(objective_dir, { recursive: true });
    } catch { /* swallow */ }
  } else {
    prefix = '\n';
  }
  _runFs.appendFileSync(contextPath, prefix + noteBody.join('\n') + '\n');
}

/**
 * Write .planning/.deferred/<objective_id>.json with locked schema.
 * Lazy-creates .planning/.deferred/ if missing.
 *
 * @param {string} objective_id
 * @param {object} state - partial state object (objective_id + timestamps merged in)
 * @param {string} [cwd]
 * @returns {string} the absolute path written
 */
function _writeDeferredState(objective_id, state, cwd = process.cwd()) {
  const deferDir = path.join(cwd, '.planning', '.deferred');
  if (!_runFs.existsSync(deferDir)) _runFs.mkdirSync(deferDir, { recursive: true });
  const filePath = path.join(deferDir, `${objective_id}.json`);
  const now = new Date().toISOString();
  const payload = Object.assign({
    objective_id,
    deferred_at: now,
    resolution_timestamp: now,
  }, state);
  _runFs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n');
  return filePath;
}

/**
 * Dispatch a resolution choice to the appropriate writer.
 *
 * @param {object} opts
 * @param {'merge'|'defer'|'coordinate'|'proceed-anyway'} opts.resolution
 * @param {string} opts.objective_id
 * @param {string|null} opts.peer_branch
 * @param {string|null} opts.peer_objective
 * @param {string} [opts.cwd]
 * @param {object} opts.detection - the detectDuplicates result that triggered the resolution
 * @param {string} opts.objective_dir
 * @param {string} opts.padded_objective
 * @returns {object} dispatch result (varies by resolution)
 */
function applyResolution({
  resolution,
  objective_id,
  peer_branch = null,
  peer_objective = null,
  cwd = process.cwd(),
  detection = {},
  objective_dir,
  padded_objective,
} = {}) {
  // Top match for note construction
  const topMatch = (Array.isArray(detection.matches) && detection.matches.length > 0) ? detection.matches[0] : null;
  const note_data = {
    objective_id,
    timestamp: detection.timestamp || new Date().toISOString(),
    strength: topMatch ? topMatch.strength : 'unknown',
    source: topMatch ? topMatch.source : 'unknown',
    peer_objective: peer_objective || (topMatch ? topMatch.peer_objective : null),
    peer_branch: peer_branch || (topMatch ? topMatch.peer_branch : null),
    signal: topMatch ? topMatch.signal : '',
    suggested_handoff: topMatch && topMatch.signal && topMatch.signal.includes('file overlap')
      ? `shared files; consider splitting ${objective_dir} into a sub-task that depends on ${peer_objective || topMatch.peer_objective || '(peer)'}`
      : 'sync with peer before continuing',
  };

  switch (resolution) {
    case 'merge': {
      const cmd = peer_branch ? `git checkout ${peer_branch}` : 'git checkout <peer_branch>';
      const msg = `This objective overlaps with \`${peer_objective || '(peer)'}\` on \`${peer_branch || '(unknown)'}\`. Switch to that branch and continue there:\n  ${cmd}\nCurrent objective directory left intact for manual cleanup.`;
      process.stdout.write(msg + '\n');
      return { aborted: true, suggestion: cmd, message: msg };
    }
    case 'defer': {
      const filePath = _writeDeferredState(objective_id, {
        mode: detection.mode || 'plan',
        objective_dir,
        trd_count_at_defer: 0, // skill workflow may override; default 0
        last_commit_at_defer: null,
        blocking_match: topMatch ? {
          strength: topMatch.strength,
          source: topMatch.source,
          peer_objective: topMatch.peer_objective,
          peer_branch: topMatch.peer_branch,
          signal: topMatch.signal,
          score: topMatch.score,
        } : null,
      }, cwd);
      return { wrote_deferred: true, defer_path: filePath };
    }
    case 'coordinate': {
      _writeCoordinationNote(objective_dir, padded_objective, Object.assign({}, note_data, {
        resolution_label: 'Coordinate',
      }));
      return { wrote_coordination_note: true };
    }
    case 'proceed-anyway': {
      _writeCoordinationNote(objective_dir, padded_objective, Object.assign({}, note_data, {
        resolution_label: 'Proceed-anyway',
        warning: 'User chose "Proceed anyway" despite blocking match — likely merge conflicts at commit time.',
      }));
      return { wrote_coordination_note: true, warning_appended: true };
    }
    default:
      throw new Error(`applyResolution: unknown resolution '${resolution}' (expected: merge | defer | coordinate | proceed-anyway)`);
  }
}
```

**Replace the existing `module.exports` block** with:

```js
// ─── Partial exports (TRD 04-01 + 04-02) ──────────────────────────────────────

module.exports = {
  // TRD 04-01:
  detectDuplicates,
  _detectHardMatch,
  _detectStrongMatch,
  _detectWeakMatch,
  _readPeerFilesModified,
  _setRunPeer,
  _setRunOrgOverlap,
  _setRunFs,
  _resetMocks,
  HARD_MATCH_THRESHOLD,
  STRONG_FILE_OVERLAP_THRESHOLD,
  STRONG_KEYWORD_OVERLAP_THRESHOLD,
  DUP_DETECT_LOG_REL,
  DEFERRED_DIR_REL,
  // TRD 04-02:
  recordResolution,
  applyResolution,
  _writeCoordinationNote,
  _writeDeferredState,
};
```

**Part 2: Replace `cmdDupDetectResolve` and `cmdDupDetectLog` stubs in `lib/dup-detect-cli.cjs`**

```js
function _parseResolveArgs(args) {
  const out = { objective_id: null, resolution: null, peer_branch: null, peer_objective: null, cwd: null, errors: [] };
  const a = args.slice();
  while (a.length > 0) {
    const t = a.shift();
    if (t === '--resolution') out.resolution = a.shift() || null;
    else if (t === '--peer-branch') out.peer_branch = a.shift() || null;
    else if (t === '--peer-objective') out.peer_objective = a.shift() || null;
    else if (t === '--cwd') out.cwd = a.shift() || null;
    else if (t.startsWith('--')) out.errors.push(`Unknown flag: ${t}`);
    else if (out.objective_id === null) out.objective_id = t;
  }
  if (!out.objective_id) out.errors.push('objective_id is required');
  const valid = ['merge', 'defer', 'coordinate', 'proceed-anyway'];
  if (!out.resolution || !valid.includes(out.resolution)) {
    out.errors.push(`--resolution must be one of: ${valid.join(', ')} (got: ${out.resolution})`);
  }
  return out;
}

function cmdDupDetectResolve(cwd_outer, args, raw_outer) {
  const parsed = _parseResolveArgs(args);
  if (parsed.errors.length > 0) {
    process.stderr.write(parsed.errors.map(e => 'Error: ' + e).join('\n') + '\n');
    process.exit(1);
    return;
  }
  const cwd = parsed.cwd || cwd_outer;
  // Resolve objective_dir + padded_objective from objective_id
  const objsDir = path.join(cwd, '.planning', 'objectives');
  let objective_dir = path.join(objsDir, parsed.objective_id); // fallback
  let padded_objective = parsed.objective_id;
  if (fs.existsSync(objsDir)) {
    try {
      const objs = fs.readdirSync(objsDir);
      const matchingDir = objs.find(n => n.startsWith(`${parsed.objective_id}-`) || n === parsed.objective_id);
      if (matchingDir) {
        objective_dir = path.join(objsDir, matchingDir);
        // Padded = leading digits of dir name
        const m = matchingDir.match(/^(\d+)-/);
        if (m) padded_objective = m[1];
      }
    } catch { /* swallow */ }
  }

  // Build minimal detection object — caller (skill) typically passes via env or rerun
  const detection = {
    mode: 'plan',
    timestamp: new Date().toISOString(),
    matches: [{
      strength: 'unknown',
      source: 'peer',
      peer_branch: parsed.peer_branch,
      peer_objective: parsed.peer_objective,
      signal: '(provided via CLI; signal omitted)',
      score: null,
    }],
  };

  const result = dd.applyResolution({
    resolution: parsed.resolution,
    objective_id: parsed.objective_id,
    peer_branch: parsed.peer_branch,
    peer_objective: parsed.peer_objective,
    cwd,
    detection,
    objective_dir,
    padded_objective,
  });

  // Always log
  dd.recordResolution({
    objective_id: parsed.objective_id,
    mode: 'plan',
    blocking: true, // assume resolve called only when blocking match was detected
    top_match: { strength: 'unknown', peer: parsed.peer_branch, score: null },
    resolution: parsed.resolution,
    cwd,
  });

  output({ ok: true, resolution: parsed.resolution, ...result }, raw_outer);
}

function _parseLogArgs(args) {
  const out = { objective_id: null, mode: null, blocking: null, top_match: null, resolution: 'none', cwd: null, errors: [] };
  const a = args.slice();
  while (a.length > 0) {
    const t = a.shift();
    if (t === '--mode') out.mode = a.shift() || null;
    else if (t === '--blocking') {
      const v = a.shift();
      out.blocking = v === 'true' ? true : (v === 'false' ? false : null);
      if (out.blocking === null) out.errors.push(`--blocking must be 'true' or 'false' (got: ${v})`);
    } else if (t === '--top-match-json') {
      const v = a.shift();
      try { out.top_match = JSON.parse(v); } catch (e) { out.errors.push(`--top-match-json parse error: ${e.message}`); }
    } else if (t === '--resolution') out.resolution = a.shift() || 'none';
    else if (t === '--cwd') out.cwd = a.shift() || null;
    else if (t.startsWith('--')) out.errors.push(`Unknown flag: ${t}`);
    else if (out.objective_id === null) out.objective_id = t;
  }
  if (!out.objective_id) out.errors.push('objective_id is required');
  if (out.mode !== 'plan' && out.mode !== 'execute') out.errors.push(`--mode must be 'plan' or 'execute' (got: ${out.mode})`);
  const validRes = ['merge', 'defer', 'coordinate', 'proceed-anyway', 'none'];
  if (!validRes.includes(out.resolution)) out.errors.push(`--resolution must be one of: ${validRes.join(', ')} (got: ${out.resolution})`);
  return out;
}

function cmdDupDetectLog(cwd_outer, args, raw_outer) {
  const parsed = _parseLogArgs(args);
  if (parsed.errors.length > 0) {
    process.stderr.write(parsed.errors.map(e => 'Error: ' + e).join('\n') + '\n');
    process.exit(1);
    return;
  }
  const cwd = parsed.cwd || cwd_outer;
  dd.recordResolution({
    objective_id: parsed.objective_id,
    mode: parsed.mode,
    blocking: parsed.blocking !== null ? parsed.blocking : false,
    top_match: parsed.top_match,
    resolution: parsed.resolution,
    cwd,
  });
  output({ ok: true, logged: true }, raw_outer);
}
```

**Part 3: Update `.gitignore`**

Append (after the existing awareness cache line, around line 28):

```
# Dup-detect log (TRD 04-02 — generated by df-tools dup-detect resolve/log)
.planning/.dup-detect-log.jsonl
```

# CRITICAL: Do NOT add `.planning/.deferred/` to .gitignore. That's user state, may be committed for cross-machine resume.

**Run tests until green:**
```bash
npm test 2>&1 | grep -E 'RR|AR|CN|DS|CLI8|CLI9|fail|FAIL' | head -30
```

Expect all groups to pass.

**Commit GREEN phase:**
```bash
git add plugins/devflow/devflow/bin/lib/dup-detect.cjs plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs .gitignore
git commit -m "feat(04-02): implement recordResolution + applyResolution + writers + CLI wiring

GREEN phase: extends lib/dup-detect.cjs with TRD 04-02 region:
- recordResolution: atomic JSONL append to .planning/.dup-detect-log.jsonl
- applyResolution: dispatcher for merge/defer/coordinate/proceed-anyway
- _writeCoordinationNote: append-only ## Coordination Note section to CONTEXT.md
- _writeDeferredState: write .planning/.deferred/<id>.json

cmdDupDetectResolve and cmdDupDetectLog replace 04-01 stubs. .gitignore
updated for the JSONL log (.planning/.deferred/ NOT gitignored — may be
committed for cross-machine resume in v1.2).

Closes SC-6, SC-8, SC-9 (Coordination Note + Defer state + JSONL log)."
```
  </action>
  <verify>
- `npm test 2>&1 | grep -E 'RR|AR|CN|DS|CLI8|CLI9' | head -30` — all 04-02 groups pass.
- `node -e 'const a=require("./plugins/devflow/devflow/bin/lib/dup-detect.cjs"); for (const s of ["recordResolution","applyResolution","_writeCoordinationNote","_writeDeferredState"]) if (typeof a[s] !== "function") throw new Error(s); console.log("OK");'`
- `grep -c "\.dup-detect-log\.jsonl" .gitignore` returns ≥ 1
- `grep -c "\.deferred" .gitignore` returns 0 (NOT gitignored)
- `npm test` overall — no regressions.
  </verify>
  <done>
feat commit lands. RED tests are now GREEN. dup-detect.cjs module.exports lists 18 entries (14 from 04-01 + 4 from 04-02). CLI subcommands resolve and log work. .gitignore updated for log file. SC-6 + SC-8 + SC-9 closed.
  </done>
  <recovery>
If applyResolution test for 'merge' is failing because process.stdout.write doesn't appear in test output: check if test captures stdout via spawnSync (CLI tests) or via in-process redirect (lib tests). Lib tests should NOT redirect stdout — they should call applyResolution() directly and assert on the return value (`{ aborted: true, suggestion: ... }`).
If .gitignore additions break some other ignore behavior: examine the diff. The two new lines should be additive only, in their own commented block. Existing lines unchanged.
If `_writeCoordinationNote` accidentally creates an objective_dir that has the wrong shape (e.g., on a non-existent objective): tests use _mkTmpRepo + explicit mkdir. Production code (called only by skill workflow) always has objective_dir already existing. The lazy-create branch in `_writeCoordinationNote` is defensive.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none — repo has no lint command per CLAUDE.md)</lint>
<test>npm test</test>
<build>(none — no build step)</build>
</validation_gates>

<verification>
1. `npm test` passes (no regressions in 04-01 baseline).
2. `lib/dup-detect.cjs` exports 18 entries (14 from 04-01 + 4 from 04-02).
3. `df-tools dup-detect resolve 04 --resolution coordinate --peer-branch feature/peer --peer-objective '04 — peer' --cwd <tmp>` writes coordination note + JSONL log.
4. `df-tools dup-detect log 04 --mode execute --blocking false --resolution none --cwd <tmp>` appends JSONL line.
5. `.gitignore` contains `.planning/.dup-detect-log.jsonl` line; does NOT contain `.planning/.deferred/`.
6. `applyResolution` for 'merge' prints abort message + git checkout suggestion; does NOT write any file.
7. `_writeCoordinationNote` second call appends (does NOT replace) — multiple plan-time runs accumulate.
</verification>

<success_criteria>
- [ ] `lib/dup-detect.cjs` extended with TRD 04-02 region (4 new functions)
- [ ] `lib/dup-detect-cli.cjs` extended with cmdDupDetectResolve + cmdDupDetectLog (replaces 04-01 stubs)
- [ ] `.gitignore` adds `.planning/.dup-detect-log.jsonl` (and does NOT add .planning/.deferred/)
- [ ] Test groups RR (jsonl append), AR (dispatcher), CN (coordination note), DS (deferred state), CLI8 (resolve subcommand), CLI9 (log subcommand) all pass
- [ ] RED commit (test:) precedes GREEN commit (feat:) per TDD Playbook habit 3
- [ ] SC-6 (Coordination Note appended to CONTEXT.md when Coordinate or Proceed-anyway) verifiable via AR1+AR2+CN3 test cases
- [ ] SC-8 (Defer state .planning/.deferred/<id>.json with locked schema) verifiable via DS1+DS2 test cases
- [ ] SC-9 (JSONL log append-only with locked schema, gitignored) verifiable via RR1+RR2+RR3 test cases + .gitignore grep
</success_criteria>

<output>
After completion, create `.planning/objectives/04-duplicate-work-detection/04-02-resolution-recorder-SUMMARY.md`.
</output>
