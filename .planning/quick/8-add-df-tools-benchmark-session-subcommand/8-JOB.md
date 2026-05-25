---
mode: quick
id: 8-add-df-tools-benchmark-session-subcommand
title: Add `df-tools benchmark session --id <sessionId>` subcommand
type: tdd
tasks: 2
context_target: ~30%
---

<objective>
Add a `df-tools benchmark session --id <sessionId> [--model opus|sonnet] [--raw]`
subcommand that reports per-session orchestrator cost. Reuses the existing
`parseSubagentJsonl` parser and `dollars()`/`PRICING` constants from
`benchmark.cjs` — no parser duplication, no pricing duplication.

**Why:** ccusage groups by project dir, `benchmark per-objective` rolls up
subagent (`subagents/*.jsonl`) cost only. Neither answers "what did session X
cost?" The orchestrator transcript lives at `~/.claude/projects/<dirHash>/<sessionId>.jsonl`
(top-level, alongside the `<sessionId>/subagents/` subdirectory), so we just
need to walk `~/.claude/projects/` to find which `<dirHash>/` contains
`<sessionId>.jsonl`, parse it with the existing parser, and price it.

**Output:** total token breakdown (uncached input, cache create, cache read,
output) + dollar cost + apiCalls count + sessionId + transcript path. JSON
under `--raw`, human-readable lines otherwise.
</objective>

<embedded_context>

<codebase_examples>
Pattern to follow — `cmdBenchmarkPerObjective` in `plugins/devflow/devflow/bin/lib/benchmark.cjs`
(lines 439–476):

```js
async function cmdBenchmarkPerObjective(cwd, args, raw) {
  const sinceArg = (args.find(a => a.startsWith('--since=')) || '--since=7d').split('=')[1];
  const modelArg = ((args.find(a => a.startsWith('--model=')) || '--model=opus').split('=')[1] || 'opus').toLowerCase();
  if (!PRICING[modelArg]) {
    process.stderr.write(`Unknown model: ${modelArg}. Available: ${Object.keys(PRICING).join(', ')}\n`);
    process.exit(1);
    return;
  }
  // ...
  if (raw) {
    process.stdout.write(JSON.stringify({ ok: true, ... }, null, 2) + '\n');
  } else {
    process.stdout.write(renderPerObjectiveTable(byObj, modelArg, sinceArg) + '\n');
  }
  process.exit(0);
}
```

Pattern to follow — `cmdBenchmarkRoute` (lines 531–546). Add a new `if (sub === 'session')`
branch before the usage fallback. Keep the rest of the dispatch shape identical and
extend the usage block to mention `session   Per-session orchestrator transcript cost`.

Args parsing — both existing subcommands use `--key=value` form
(`--since=7d`, `--model=opus`). `--id` SHOULD accept BOTH `--id=<sessionId>` and
`--id <sessionId>` forms because session UUIDs frequently get pasted with a space
when copied from `claude-code` UIs. Implement both:

```js
function getArg(args, name) {
  const eq = args.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return null;
}
```

Parser reuse — `parseSubagentJsonl(filepath)` (lines 108–151) returns
`{ firstPrompt, apiCalls, inputUncached, inputCacheCreate, inputCacheRead, outputTokens }`.
It is session-agnostic; pass any JSONL transcript path and it works.
</codebase_examples>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                    ← MODIFY (usage string only — line 229)
└── lib/
    ├── benchmark.cjs               ← MODIFY (add cmdBenchmarkSession + router branch)
    └── benchmark.test.cjs          ← MODIFY (add tests for new function)
</file_tree>

<gotchas>
- **Two filesystem layouts coexist under `~/.claude/projects/<dirHash>/`:**
  the per-session top-level `<sessionId>.jsonl` (THIS subcommand's input) and the
  per-session `<sessionId>/subagents/*.jsonl` directory (existing per-objective
  walker's input). Do not confuse them. The session transcript IS the top-level file.
- **Multiple matches:** the same sessionId UUID is technically unique, but if
  the user passes a short prefix or a hash collides across projects, error
  with the list of matching dirHashes — do not silently pick the first.
- **`process.exit` in tests:** the existing CLI entries call `process.exit(0/1)`.
  The new `cmdBenchmarkSession` MUST factor its core logic into a pure
  `runBenchmarkSession({ projectsRoot, sessionId, model })` function that
  returns `{ ok, ... }` instead of writing/exiting. The CLI wrapper does the
  printing + exiting. This is what makes test 3 + 4 viable without `child_process`
  spawning. Export `runBenchmarkSession` for tests.
- **`projectsRoot` injection:** `runBenchmarkSession` MUST accept `projectsRoot`
  as a parameter (default `path.join(os.homedir(), '.claude', 'projects')`).
  Tests will pass a `os.tmpdir()` fixture path. Do not hard-code the home dir
  inside the pure function.
- **Reuse `dollars()` and `PRICING`** — both already exported. Do not
  redefine the pricing table.
- **JSONL line shape for fixtures:** the parser only inspects
  `entry.type === 'assistant' && entry.message.usage` and
  `entry.type === 'user'` (for `firstPrompt`). Fixtures need at minimum:
  ```jsonl
  {"type":"user","message":{"content":"test prompt"}}
  {"type":"assistant","message":{"id":"req_1","usage":{"input_tokens":100,"cache_creation_input_tokens":200,"cache_read_input_tokens":50,"output_tokens":75}}}
  ```
- **Dedup by requestId:** the parser dedups input-token rows by `requestId || message.id || `__N``.
  If your fixture reuses the same `id`, only one row's input counts but output
  takes the max. Two distinct `id`s give two `apiCalls`.
- **Anti-pattern guard (per Mark's CLAUDE.md):** No LLM-generated test fixtures.
  Hand-write the JSONL lines in tests using string templates / object literals.
  No property-based tests, no Gherkin.
</gotchas>

<anti_patterns>
- **Do NOT** modify `parseSubagentJsonl`. It is correct and reused.
- **Do NOT** redefine `PRICING` or `dollars()`. Import / reuse.
- **Do NOT** walk `<dirHash>/<sessionId>/subagents/` for this subcommand —
  that's the per-objective walker's job. Walk top-level `<dirHash>/<sessionId>.jsonl`.
- **Do NOT** silently pick the first match if multiple `<dirHash>/` directories
  contain the same sessionId. Error with the full list.
- **Do NOT** touch `.skill-active` or `04-CONTEXT.md` (pre-existing dirty state).
</anti_patterns>

<error_recovery>
- If the resolved transcript exists but `parseSubagentJsonl` returns
  `apiCalls: 0`, the file is malformed or empty — return
  `{ ok: false, error: "transcript at <path> has no assistant turns", path }`.
- If `--id` is missing, return
  `{ ok: false, error: "--id <sessionId> required" }` (CLI prints + exits 1).
- If sessionId not found anywhere under `projectsRoot`, return
  `{ ok: false, error: "session <id> not found in <projectsRoot>", searched: [<dirHashes>] }`.
- If multiple `<dirHash>/` match, return
  `{ ok: false, error: "session <id> matched multiple project dirs", matches: [<dirHashes>] }`.
</error_recovery>

<validation_gates>
```bash
# Run from repo root
npm test                                                  # native node --test, must stay green
node plugins/devflow/devflow/bin/df-tools.cjs benchmark session --id <real-uuid>  # smoke
node plugins/devflow/devflow/bin/df-tools.cjs benchmark session --id <real-uuid> --raw | python3 -m json.tool  # JSON valid
node plugins/devflow/devflow/bin/df-tools.cjs benchmark session                   # error + exit 1 (no --id)
node plugins/devflow/devflow/bin/df-tools.cjs benchmark session --id deadbeef-no-such-session # error + exit 1
```
</validation_gates>

</embedded_context>

## Test list (RED-first, write before implementation)

Per Mark's TDD playbook habit 2 — every behavior case enumerated BEFORE writing test code:

**`runBenchmarkSession` (pure, testable, exported)**
1. Returns `{ ok: false, error: "--id ..." }` when `sessionId` arg is missing/empty.
2. Returns `{ ok: false, error: "...not found...", searched: [...] }` when sessionId not present under `projectsRoot`.
3. Returns `{ ok: false, error: "...matched multiple...", matches: [...] }` when two dirHashes contain `<sessionId>.jsonl`.
4. Returns `{ ok: true, sessionId, path, model, tokens: {uncached, cache_create, cache_read, output}, apiCalls, cost }` when one match found, given a valid fixture JSONL with one assistant turn.
5. Token aggregation: two distinct assistant turns (different `message.id`) sum input/output correctly via `parseSubagentJsonl`.
6. Cost computation: passes the four token totals through `dollars()` with the supplied `model`. Asserts numeric equality against a hand-computed expected (e.g., 100 uncached + 200 cache_create + 50 cache_read + 75 output @ opus = closed-form $).
7. Default model: `model` defaults to `'opus'` when omitted.

**`cmdBenchmarkRoute` dispatch**
8. `cmdBenchmarkRoute(cwd, ['session', '--id=<id>', '--raw'], true)` reaches the new branch (test by stubbing — or trust by inspection; integration smoke covered by validation_gates).

**Fixture-builder strategy:**
- Hand-build a `mkSessionFixture({ root, dirHash, sessionId, lines })` helper inside the test file. It writes `<root>/<dirHash>/<sessionId>.jsonl` with the supplied JSONL lines. No LLM-generated data; the helper is mechanical.
- Each test creates a unique `os.tmpdir()/df-bench-session-<random>/` root so tests don't collide.
- Cleanup via `t.after(() => fs.rmSync(root, { recursive: true, force: true }))`.

## Tasks

<task type="auto" tdd="true">
  <name>RED — add failing tests for runBenchmarkSession</name>
  <files>plugins/devflow/devflow/bin/lib/benchmark.test.cjs</files>
  <action>
Append a new `describe('runBenchmarkSession', ...)` block AFTER the existing
`describe('parseSince', ...)` block at the end of `benchmark.test.cjs`.

Approach:
1. At top of file (with existing requires): add `const fs = require('node:fs');`, `const os = require('node:os');`, `const path = require('node:path');`.
2. Add a small fixture-builder helper at module scope (above the new describe):
   ```js
   function mkSessionFixture({ root, dirHash, sessionId, lines }) {
     const dir = path.join(root, dirHash);
     fs.mkdirSync(dir, { recursive: true });
     fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`),
       lines.map(o => JSON.stringify(o)).join('\n') + '\n');
     return path.join(dir, `${sessionId}.jsonl`);
   }
   function tmpRoot() {
     return fs.mkdtempSync(path.join(os.tmpdir(), 'df-bench-session-'));
   }
   ```
3. Write 7 tests (cases 1–7 from the test list above). Each test:
   - Creates a `tmpRoot()`.
   - Registers cleanup: `t.after(() => fs.rmSync(root, { recursive: true, force: true }))`.
   - Builds whatever fixture(s) the case needs via `mkSessionFixture`.
   - Calls `await bm.runBenchmarkSession({ projectsRoot: root, sessionId, model })`.
   - Asserts on the returned object's shape + values.

Sample assertion for case 4 (one match, one assistant turn @ opus):
```js
const root = tmpRoot();
mkSessionFixture({
  root, dirHash: '-Users-x', sessionId: 'sess-1',
  lines: [
    { type: 'user', message: { content: 'hi' } },
    { type: 'assistant', message: { id: 'r1', usage: { input_tokens: 100, cache_creation_input_tokens: 200, cache_read_input_tokens: 50, output_tokens: 75 } } },
  ],
});
const r = await bm.runBenchmarkSession({ projectsRoot: root, sessionId: 'sess-1', model: 'opus' });
assert.strictEqual(r.ok, true);
assert.strictEqual(r.sessionId, 'sess-1');
assert.strictEqual(r.apiCalls, 1);
assert.strictEqual(r.tokens.uncached, 100);
assert.strictEqual(r.tokens.cache_create, 200);
assert.strictEqual(r.tokens.cache_read, 50);
assert.strictEqual(r.tokens.output, 75);
const expected = (100 * 15 + 200 * 18.75 + 50 * 1.5 + 75 * 75) / 1e6;
assert.ok(Math.abs(r.cost - expected) < 0.0001);
```

Run `npm test` and confirm all 7 new tests FAIL with `TypeError: bm.runBenchmarkSession is not a function` (or similar). This is the RED state.

Commit: `test(8): add failing tests for runBenchmarkSession`

# CRITICAL: Tests MUST be in failing state before implementation. Do not stub
#   runBenchmarkSession in this task.
# GOTCHA: parseSubagentJsonl dedups by requestId/message.id — case 5 must use
#   two distinct ids ('r1' and 'r2') for two apiCalls.
# PATTERN: Existing tests in this file use the `test` import from node:test +
#   describe blocks. Match that style.
  </action>
  <verify>
`npm test` runs cleanly (no syntax errors). The new 7 tests under
`runBenchmarkSession` fail. All pre-existing tests in `benchmark.test.cjs`
still pass.
  </verify>
  <done>
benchmark.test.cjs has a new `describe('runBenchmarkSession', ...)` block
containing 7 tests (cases 1–7). Tests fail because runBenchmarkSession does
not yet exist. Test file imports include fs/os/path. mkSessionFixture and
tmpRoot helpers are defined. Commit landed.
  </done>
</task>

<task type="auto" tdd="true">
  <name>GREEN — implement runBenchmarkSession + cmdBenchmarkSession + router branch</name>
  <files>plugins/devflow/devflow/bin/lib/benchmark.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Implement the new function in `benchmark.cjs` and wire the router. Update
`df-tools.cjs` usage string.

Approach:

1. **`benchmark.cjs` — add `runBenchmarkSession` (pure, testable):**
   Place after `cmdBenchmarkSummary` and before `cmdBenchmarkRoute`. Signature:
   ```js
   async function runBenchmarkSession({ projectsRoot, sessionId, model = 'opus' }) {
     if (!sessionId) return { ok: false, error: '--id <sessionId> required' };
     const root = projectsRoot || path.join(os.homedir(), '.claude', 'projects');
     if (!fs.existsSync(root)) {
       return { ok: false, error: `projects root not found: ${root}`, searched: [] };
     }
     const dirHashes = fs.readdirSync(root, { withFileTypes: true })
       .filter(d => d.isDirectory()).map(d => d.name);
     const matches = [];
     for (const dh of dirHashes) {
       const candidate = path.join(root, dh, `${sessionId}.jsonl`);
       if (fs.existsSync(candidate)) matches.push({ dirHash: dh, path: candidate });
     }
     if (matches.length === 0) {
       return { ok: false, error: `session ${sessionId} not found in ${root}`, searched: dirHashes };
     }
     if (matches.length > 1) {
       return { ok: false, error: `session ${sessionId} matched multiple project dirs`, matches: matches.map(m => m.dirHash) };
     }
     const m = matches[0];
     const rec = await parseSubagentJsonl(m.path);
     if (rec.apiCalls === 0) {
       return { ok: false, error: `transcript at ${m.path} has no assistant turns`, path: m.path };
     }
     const tokens = {
       uncached: rec.inputUncached,
       cache_create: rec.inputCacheCreate,
       cache_read: rec.inputCacheRead,
       output: rec.outputTokens,
     };
     const cost = dollars(tokens, model);
     return {
       ok: true,
       sessionId,
       path: m.path,
       dirHash: m.dirHash,
       model,
       apiCalls: rec.apiCalls,
       tokens,
       cost,
     };
   }
   ```

2. **`benchmark.cjs` — add CLI wrapper `cmdBenchmarkSession`:**
   ```js
   async function cmdBenchmarkSession(cwd, args, raw) {
     // Accept both --id=<v> and --id <v>
     function getArg(name) {
       const eq = args.find(a => a.startsWith(`--${name}=`));
       if (eq) return eq.split('=').slice(1).join('=');
       const idx = args.indexOf(`--${name}`);
       if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
       return null;
     }
     const sessionId = getArg('id');
     const modelArg = (getArg('model') || 'opus').toLowerCase();
     if (!PRICING[modelArg]) {
       process.stderr.write(`Unknown model: ${modelArg}. Available: ${Object.keys(PRICING).join(', ')}\n`);
       process.exit(1);
       return;
     }
     const result = await runBenchmarkSession({ sessionId, model: modelArg });
     if (raw) {
       process.stdout.write(JSON.stringify(result, null, 2) + '\n');
       process.exit(result.ok ? 0 : 1);
       return;
     }
     if (!result.ok) {
       process.stderr.write(`Error: ${result.error}\n`);
       if (result.matches) process.stderr.write(`Matches: ${result.matches.join(', ')}\n`);
       process.exit(1);
       return;
     }
     const lines = [
       `# Session benchmark — ${result.model} pricing`,
       ``,
       `**Session:** ${result.sessionId}`,
       `**Transcript:** ${result.path}`,
       `**API calls:** ${result.apiCalls}`,
       `**Cost:** $${result.cost.toFixed(4)}`,
       ``,
       `## Token breakdown`,
       `- Uncached input:  ${fmt(result.tokens.uncached)}`,
       `- Cache create:    ${fmt(result.tokens.cache_create)}`,
       `- Cache read:      ${fmt(result.tokens.cache_read)}`,
       `- Output:          ${fmt(result.tokens.output)}`,
     ];
     process.stdout.write(lines.join('\n') + '\n');
     process.exit(0);
   }
   ```

3. **`benchmark.cjs` — extend router and usage:**
   In `cmdBenchmarkRoute`, add before the usage fallback:
   ```js
   if (sub === 'session') return cmdBenchmarkSession(cwd, args.slice(1), raw);
   ```
   Update the usage block string to include:
   ```
     session         Per-session orchestrator transcript cost (--id <sessionId>)
   ```
   And note `--id <sessionId>  Session UUID (required for `session`)` in options.

4. **`benchmark.cjs` — exports:**
   Add `runBenchmarkSession` and `cmdBenchmarkSession` to the
   `module.exports` block at the bottom. Tests import via `bm.runBenchmarkSession`.

5. **`df-tools.cjs` line 229 usage string:**
   No structural change needed — `benchmark` is already listed in the top-level
   commands. Optionally adjust the comment near top-of-file to mention the
   `session` subcommand, but minimal touch (skip if the file already has no
   such comment block — it doesn't, per the read above). **No edit required
   if no comment block to update.**

Run `npm test`. All 7 new tests + all pre-existing tests pass.

Commit: `feat(8): add df-tools benchmark session subcommand for per-session cost`

# CRITICAL: runBenchmarkSession MUST be pure (no process.exit, no
#   process.stdout.write). Only cmdBenchmarkSession exits/prints. This is what
#   makes the 7 unit tests work without spawning subprocesses.
# CRITICAL: Reuse dollars() and PRICING — do NOT redefine.
# GOTCHA: cmdBenchmarkSession passes `model` to runBenchmarkSession by name;
#   runBenchmarkSession defaults to 'opus' when omitted (test case 7).
# GOTCHA: --raw mode exits 1 on error so shell scripts can detect failure even
#   when JSON output succeeds.
# PATTERN: Match cmdBenchmarkPerObjective's exit-code discipline: exit 1 on
#   bad input, exit 0 on success.
  </action>
  <verify>
```bash
npm test
# All tests pass, including the 7 new runBenchmarkSession tests + all
# pre-existing benchmark.test.cjs and df-tools.test.cjs tests.

node plugins/devflow/devflow/bin/df-tools.cjs benchmark session
# stderr: "Error: --id <sessionId> required" (or similar), exit 1

node plugins/devflow/devflow/bin/df-tools.cjs benchmark session --id deadbeef-not-a-real-session
# stderr error about not found, exit 1

# Smoke test against a real session (ask user for a sessionId, or grab one):
SID=$(ls ~/.claude/projects/$(ls ~/.claude/projects/ | head -1) | grep '\.jsonl$' | head -1 | sed 's/\.jsonl$//')
node plugins/devflow/devflow/bin/df-tools.cjs benchmark session --id "$SID"
# Outputs human-readable session cost block

node plugins/devflow/devflow/bin/df-tools.cjs benchmark session --id "$SID" --raw | python3 -m json.tool
# Valid JSON with ok:true, tokens, cost, apiCalls, sessionId, path
```
  </verify>
  <done>
- `benchmark.cjs` exports `runBenchmarkSession` (pure) and
  `cmdBenchmarkSession` (CLI wrapper).
- `cmdBenchmarkRoute` dispatches `session` subcommand and shows it in usage.
- All 7 RED tests now pass (GREEN). All pre-existing tests still pass.
- Smoke commands above behave as documented (no --id → error+exit 1, fake id
  → error+exit 1, real id → cost output, --raw → valid JSON).
- Pricing reused via `dollars()` + `PRICING` constants — no duplication.
- `parseSubagentJsonl` not modified.
- Commit landed.
  </done>
  <recovery>
If a test fails because `parseSubagentJsonl` returns 0 apiCalls on a fixture,
inspect the JSONL — most likely missing `message.usage` or `type` field.
Re-check the fixture lines match the shape documented in the gotchas block.

If smoke against a real session errors with "not found" but you can see the
file under `~/.claude/projects/`, verify the sessionId you passed does NOT
include the `.jsonl` extension — the function appends it.

If `cmdBenchmarkRoute` doesn't dispatch (usage string prints instead),
confirm the new `if (sub === 'session')` line is BEFORE the
`process.stderr.write('Usage: ...')` block, not after.
  </recovery>
</task>

## Verification

- [ ] `npm test` green (all pre-existing + 7 new tests).
- [ ] `df-tools benchmark session` (no args) → stderr error + exit 1.
- [ ] `df-tools benchmark session --id <fake>` → stderr error + exit 1.
- [ ] `df-tools benchmark session --id <real>` → human-readable cost block + exit 0.
- [ ] `df-tools benchmark session --id <real> --raw` → JSON `{ok:true, tokens, cost, apiCalls, sessionId, path}` + exit 0.
- [ ] `parseSubagentJsonl` unchanged (`git diff plugins/devflow/devflow/bin/lib/benchmark.cjs` shows no edits to lines 108–151).
- [ ] `PRICING` and `dollars()` not duplicated (`grep -c "PRICING\s*=" plugins/devflow/devflow/bin/lib/benchmark.cjs` returns 1).
- [ ] No edits to `.skill-active`, `04-CONTEXT.md`, or any unrelated file.
- [ ] Two atomic commits land: `test(8): ...` then `feat(8): ...`.

## Success criteria

1. A user can run `df-tools benchmark session --id <sessionId>` and see
   per-session orchestrator cost broken down by token category.
2. The same command with `--raw` produces machine-readable JSON for shell
   pipelines.
3. Error paths (missing --id, unknown session, multiple matches) exit 1 with
   informative messages.
4. The pure `runBenchmarkSession` function is unit-tested with hand-built
   fixtures (no LLM-generated data) covering: missing-id, not-found,
   ambiguous-match, single-match-success, multi-turn aggregation,
   cost arithmetic, default-model behavior.
5. No regression in existing benchmark or df-tools tests.

## Output

- `plugins/devflow/devflow/bin/lib/benchmark.cjs` — adds
  `runBenchmarkSession` (~50 LOC pure) + `cmdBenchmarkSession` (~50 LOC CLI
  wrapper) + 1-line dispatch in `cmdBenchmarkRoute` + usage-string update +
  2 entries in `module.exports`.
- `plugins/devflow/devflow/bin/lib/benchmark.test.cjs` — adds
  `describe('runBenchmarkSession', ...)` with 7 tests + 2 helper functions
  (`mkSessionFixture`, `tmpRoot`) + fs/os/path requires.
- 2 commits: `test(8): ...` then `feat(8): ...`.
