---
objective: 10-flutter-ui-verification-process
trd: 10-09
title: One-command Flutter UI adoption (df-tools flutter-ui setup)
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs
  - plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
confidence: high
requirements: []
overrides:
  work: feature
  tdd: strict

# Goal-backward derived must-haves. These are observable truths, not artifact
# checks — the verifier should be able to assert each one against running code
# without inspecting test files.
must_haves:
  truths:
    - "`df-tools flutter-ui setup` subcommand exists and is reachable from `node bin/df-tools.cjs flutter-ui setup --help` (or with no args) without throwing on unknown command"
    - "Flutter-repo gate: when cwd is NOT a Flutter UI repo (no pubspec.yaml OR no `flutter: sdk: flutter` dep OR no `lib/` dir OR Flutter version constraint below 3.16.0), CLI emits `status:'not-a-flutter-project'` with `failures[]` array + exits 1 BEFORE detecting tools, dispatching installs, or scaffolding. DevFlow does NOT install Flutter tooling into unrelated directories — each consuming repo owns its own tooling install path."
    - "Running setup against a fresh project with NO tools installed (jq, maestro, chromedriver per detector) produces an ordered install plan that names each missing tool; running against a project where all 3 tools are present produces an empty install plan"
    - "Install plan is platform-aware (advisory): darwin returns `brew install …` shaped commands; linux returns `apt-get install …` shaped commands"
    - "When devflow-watch daemon IS running (PID file present + process live), `flutter-ui setup` dispatches each install via the existing handoff watcher by writing a pending record to `.devflow-handoff/pending/*.json` whose shape matches `validateInputsSchema` (record validates as `{ ok:true }` against the schema)"
    - "When devflow-watch daemon is NOT running, `flutter-ui setup` falls back to printing the install commands to stdout in copy-pasteable form AND exits with non-zero status (signals the caller that human action is required)"
    - "Whenever tools are present (regardless of daemon state), setup chains into the existing `flutter-ui-bootstrap.cjs` flow against the target project dir (the bootstrap detector + setup_task emission), then forwards the bootstrap result on the same JSON output. Daemon is NOT a prerequisite for bootstrap — only for handoff-dispatched installs."
    - "Marker idempotency: when `.planning/.flutter-ui-bootstrap-done` exists in the target project AND the detector reports all tools present, setup exits 0 with a `status: 'already-set-up'` shape and writes ZERO new handoff records"
    - "`--print-only` flag forces the print-and-exit branch regardless of daemon state — never dispatches handoffs, useful for previewing the plan"
    - "`--auto` flag suppresses any per-tool y/N prompting (current handoff dispatch is non-interactive by design — flag is here so that future interactive variants remain compatible with the existing setup contract; in this TRD it's effectively a no-op asserted by test)"
    - "Hand-built fixture builders drive every test — no LLM-generated test data, no property-based testing, no Gherkin"

  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs"
      provides: "The CLI module — detector, handoff dispatcher, bootstrap-chain glue. Exports `detectMissingTools`, `buildInstallPlan`, `dispatchInstalls`, `cmdFlutterUISetup`"
      contains: "detectMissingTools"
      contains_also: ["buildInstallPlan", "dispatchInstalls", "cmdFlutterUISetup"]
    - path: "plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs"
      provides: "Paired tests covering detector, install-plan shape, handoff schema, fallback path, bootstrap chain, idempotency, flags"
      contains: "detectMissingTools"
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "Modified — registers top-level `flutter-ui setup` subcommand routing"
      contains: "flutter-ui"

  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs"
      via: "require + invoke cmdFlutterUISetup on `flutter-ui setup`"
      pattern: "require.*flutter-ui-setup"
    - from: "plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs"
      to: "plugins/devflow/devflow/bin/lib/handoff.cjs"
      via: "validateInputsSchema check + writing pending record matching the schema"
      pattern: "validateInputsSchema|\\.devflow-handoff/pending"
    - from: "plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs"
      to: "plugins/devflow/devflow/bin/lib/watcher-state.cjs"
      via: "readPidFile + isWatcherLive to detect daemon state"
      pattern: "readPidFile|isWatcherLive"
    - from: "plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs"
      to: "plugins/devflow/devflow/bin/lib/flutter-ui-bootstrap.cjs"
      via: "require + invoke checkBootstrapState against the target project dir after install verify"
      pattern: "require.*flutter-ui-bootstrap"

verification_commands:
  - id: "subcommand_registered"
    description: "df-tools dispatches `flutter-ui setup` without 'Unknown command' error."
    command: "node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui setup --print-only --raw 2>&1 | head -1"
    expect_pattern: "^[^U].*"  # must NOT start with 'Unknown'
    enforcement: required
  - id: "print_only_emits_plan"
    description: "--print-only path emits a JSON object with a `plan` array regardless of daemon state."
    command: "node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui setup --print-only --raw"
    expect_pattern: '"plan"'
    enforcement: required
  - id: "tests_pass"
    description: "Paired test file passes 100% (Node native test runner)."
    command: "node --test plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs"
    expect_pattern: "pass [1-9]"
    enforcement: required
---

<objective>
Ship a single command — `df-tools flutter-ui setup` — that makes a downstream Flutter project DevFlow-Flutter-UI ready in one invocation. Today adoption requires 3 manual brew installs + emulator setup + chasing the pubspec/dirs scaffolding. This TRD wraps everything into one CLI that:

1. Detects which system tools are missing (jq, maestro, chromedriver — exact list nailed down in the test list).
2. Builds an ordered, platform-aware install plan.
3. Routes interactive installs through the existing devflow-watch handoff (when daemon is live) — falls back to printing copy-pasteable commands + non-zero exit when daemon is down.
4. Chains into the existing `flutter-ui-bootstrap.cjs` to scaffold pubspec/dirs/marker.
5. Is idempotent — re-runs on a set-up project return `status: 'already-set-up'` with no side effects.

Scope is locked: pure adoption ergonomics. No emulator boot, no chromedriver auto-launch, no Windows. Existing TRDs 10-01..10-08 are out of scope — this is purely additive.

Why TDD: pure-logic CLI wrapper with crisp inputs (filesystem + env + daemon state) and outputs (JSON shape + handoff records + exit code). Every behavior case is a hand-built fixture-driven RED-GREEN cycle.

Outside-in note (from CLAUDE.md TDD Playbook): CLI-only, no UI, so the outermost test layer is the full CLI invocation (integration: spawn the df-tools binary with a temp HOME + temp project + temp PATH and assert stdout + exit code + handoff records on disk). We start there per habit 5, then drill down to module unit tests for `detectMissingTools`, `buildInstallPlan`, `dispatchInstalls`.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── flutter-ui-setup.cjs         ← CREATE (~150 lines: detector + plan builder + dispatcher + cmd handler)
└── flutter-ui-setup.test.cjs    ← CREATE (~250 lines: 9-10 behavior cases, hand-built fixtures)

plugins/devflow/devflow/bin/
└── df-tools.cjs                 ← MODIFY (~10 lines: register `case 'flutter-ui'` subcommand routing)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
@~/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

<!-- Example 1: Existing flutter-ui-bootstrap.cjs structure — the module this CLI chains to.
     Pattern to mimic: pure function + cmd wrapper + module.exports of both. -->
```js
// plugins/devflow/devflow/bin/lib/flutter-ui-bootstrap.cjs
const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');

function checkBootstrapState({ projectDir }) { /* pure */ }

function cmdVerifyFlutterUIBootstrap(cwd, projectDir, raw) {
  const target = projectDir
    ? (path.isAbsolute(projectDir) ? projectDir : path.join(cwd, projectDir))
    : cwd;
  const result = checkBootstrapState({ projectDir: target });
  output(result, raw);
}

module.exports = { checkBootstrapState, cmdVerifyFlutterUIBootstrap };
```

<!-- Example 2: Handoff record shape (write a pending JSON matching validateInputsSchema).
     The minimum fields per cmdHandoffCreate are { id, cmd, cwd, status, created_at }.
     `inputs.secrets[]` is optional and SHOULD be empty for these installs (no secrets needed). -->
```js
// plugins/devflow/devflow/bin/lib/handoff.cjs (reference, do not modify)
const record = {
  id,                  // 'h-' + 4 random hex bytes
  cmd,                 // 'brew install jq'
  cwd,                 // target project dir
  status: 'pending',
  created_at: new Date().toISOString(),
  // inputs: { secrets: [...] } — only when secret prompts expected; not needed here
};
fs.writeFileSync(`.devflow-handoff/pending/${id}.json`, JSON.stringify(record, null, 2) + '\n');
```

<!-- Example 3: Detecting daemon liveness (read pid file + check process). -->
```js
// plugins/devflow/devflow/bin/lib/watcher-state.cjs (reference, do not modify)
const state = require('./watcher-state.cjs');
const info = state.readPidFile();      // returns null if no PID file
const live = state.isWatcherLive();    // true iff process is actually running
```

<!-- Example 4: df-tools subcommand dispatch shape — pattern to mimic for new case 'flutter-ui'.
     Note: a `case 'verify':` already routes `verify flutter-ui-bootstrap` (TRD 10-04a). We add
     a NEW top-level `case 'flutter-ui':` for setup; verify-shaped commands stay where they are. -->
```js
// In df-tools.cjs around line ~387-433
case 'verify': {
  const subcommand = args[1];
  if (subcommand === 'flutter-ui-bootstrap') {
    cmdVerifyFlutterUIBootstrap(cwd, args[2], raw);
  } /* …others… */
  break;
}

// NEW top-level subcommand we add in this TRD:
case 'flutter-ui': {
  const subcommand = args[1];
  if (subcommand === 'setup') {
    // pass: cwd, opts (--print-only, --auto), raw
    cmdFlutterUISetup(cwd, args.slice(2), raw);
  } else {
    error('Unknown flutter-ui subcommand. Available: setup');
  }
  break;
}
```
</codebase_examples>

<anti_patterns>
- DO NOT shell out to actually install anything from inside the CLI. Dispatching means *writing a handoff pending record* (let the daemon execute) or *printing the command* (let the human execute). Direct `child_process.spawn('brew install …')` is forbidden — breaks the daemon contract.
- DO NOT compose handoff records by hand without validating with `handoff.validateInputsSchema(record.inputs)` first. Empty `inputs` is fine — but if any inputs object is set, it MUST pass schema validation before write.
- DO NOT bundle node-pty install or daemon-start logic into setup. The user starts the daemon out-of-band (`/devflow:start-watcher` or similar). If the daemon is not running, we print and exit nonzero — we don't auto-start it.
- DO NOT write to `.planning/.flutter-ui-bootstrap-done` from this CLI. The marker is owned by the bootstrap setup_task (TRD 10-04a/10-04b). This TRD chains *to* the bootstrap, it does not duplicate the marker write.
- DO NOT use LLM-generated test data anywhere. Every fixture is a hand-built builder function (see `<test_list>` below). This is a hard project guardrail from `~/.claude/CLAUDE.md`.
- DO NOT add property-based testing (no `fast-check`, no `quickcheck`-style libraries) — playbook explicitly skips.
- DO NOT add Gherkin / `.feature` files / Cucumber scaffolds — playbook explicitly skips.
- DO NOT cross-contaminate with `flutter-ui-bootstrap.cjs` — the bootstrap module stays pure-logic. The setup CLI calls IT, not vice versa.
- DO NOT make `--auto` change install execution. It only suppresses prompts. Today's handoff dispatch is already non-interactive — the flag exists for forward-compat and to make explicit "don't try to be interactive" the documented default.
</anti_patterns>

<error_recovery>
- If `validateInputsSchema` rejects a constructed handoff record (defensive — shouldn't happen with the empty-secrets pattern we use), abort with exit 2 and stderr: `flutter-ui setup: internal error: built invalid handoff record (<reason>)`. Do NOT write the bad record.
- If the target project dir has no `.planning/` directory, create the parent dirs needed for `.devflow-handoff/pending/` but DO NOT touch `.planning/` — that's the bootstrap module's job. If `.planning/` is absent, log advisory ("no `.planning/` found — bootstrap chain will skip") and continue.
- If `state.readPidFile()` returns truthy but `state.isWatcherLive()` returns false (stale PID), treat as daemon-not-running and take the fallback (print + exit nonzero) path. Emit a one-line advisory: `[advisory] stale devflow-watch PID file at <path>; treating as not-running`.
- Platform detection: `process.platform === 'darwin'` → brew; `process.platform === 'linux'` → apt; anything else → fallback advisory ("unsupported platform, emitting tool-name-only plan; install manually"). No Windows path.
</error_recovery>

</embedded_context>

<test_list>

Per the user CLAUDE.md TDD Playbook habit 2: test list first, before any test code is written. Each item is tied to a BEHAVIOR, not to an implementation detail. Implementer must drive each item RED → GREEN → REFACTOR one at a time (habit 3).

**Fixture builders (hand-built per habit 4; named explicitly):**

- `buildHandoffPendingDir(tmpdir)` — creates `<tmpdir>/.devflow-handoff/{pending,done}/` empty subtrees. Returns `{root, pending, done}`.
- `buildFakePATH(tools)` — given an object like `{ jq: true, maestro: false, chromedriver: true }`, creates a temp PATH dir containing executable shims for each `true`-valued tool. Returns the PATH dir path. The setup CLI uses `command -v`-equivalent logic (we'll use `fs.existsSync` against each PATH entry + name to keep tests deterministic on macOS where `which` shells out).
- `buildBootstrapTarget(tmpdir, opts)` — creates a temp flutter project root with optional `pubspec.yaml`, optional `integration_test/` dir, optional `.maestro/` dir, optional `.planning/.flutter-ui-bootstrap-done` marker. Mirror of `makeProject` in `flutter-ui-bootstrap.test.cjs` — extend it, do not fork.
- `buildFakePidFile(tmpHome, { live })` — writes `~/.devflow/devflow-watch.pid` JSON in a temp HOME, optionally pointing at a process PID that IS running (`process.pid` — the test process) when `live:true` or at a dead PID (e.g. `999999`) when `live:false`. Note: `watcher-state.isWatcherLive()` uses `process.kill(pid, 0)`, so `process.pid` always passes liveness from the test runner.
- Cassettes: N/A — no HTTP in this TRD.

**Test cases (in RED-GREEN order — each is its own atomic commit pair):**

1. **detector-jq-missing** — `detectMissingTools({pathDir: buildFakePATH({jq:false, maestro:true, chromedriver:true})})` returns an array including `'jq'` and NOT including `'maestro'` or `'chromedriver'`.
2. **detector-all-present** — `detectMissingTools({pathDir: buildFakePATH({jq:true, maestro:true, chromedriver:true})})` returns `[]`.
3. **plan-darwin-brew** — `buildInstallPlan({missing: ['jq'], platform: 'darwin'})` returns an array of commands starting with `'brew install '` (advisory — does not actually run brew). The exact command for jq is `'brew install jq'`. maestro on either platform returns `'curl -fsSL "https://get.maestro.mobile.dev" | bash'` (no brew formula or apt package). Order matches input order.
4. **plan-linux-apt** — Same inputs but `platform: 'linux'` returns commands starting with `'sudo apt-get install -y '` (or equivalent — implementer chooses, then locks via test).
5. **dispatch-shape-valid** — Given `buildHandoffPendingDir(tmp)` + a plan of 2 commands + a `cwd`, `dispatchInstalls()` writes 2 pending JSON files matching the handoff schema. Each record loaded back and run through `handoff.validateInputsSchema(rec.inputs || {secrets:[]})` returns `{ok:true}`. Each record has `cmd`, `cwd`, `status:'pending'`, `created_at` (ISO timestamp), and a `'h-'`-prefixed `id`.
6. **fallback-no-daemon** — With NO pid file (`process.env.HOME = tmpEmptyHome`), `cmdFlutterUISetup` against a project missing all 3 tools prints copy-pasteable shell commands to stdout (one per line, no JSON noise mixed in unless `--raw` is passed) AND exits with code 1. Assert via spawning the CLI as a subprocess (outside-in integration test).
7. **bootstrap-chain** — When the detector reports all tools present + bootstrap is missing infra + no marker, setup runs and the final JSON output's `bootstrap` field deep-equals what `flutter-ui-bootstrap.checkBootstrapState({ projectDir: target })` returns (action:'warn' + setup_task content). i.e., setup is a transparent passthrough on the bootstrap step.
8. **idempotent-already-set-up** — When tools all present AND `.planning/.flutter-ui-bootstrap-done` marker present AND bootstrap detector reports `action:'skip'`, setup exits 0 with output containing `"status":"already-set-up"` (raw or pretty JSON) AND zero new files appear under `.devflow-handoff/pending/`.
9. **print-only-flag** — Even when the daemon IS running (build a live pid file via `buildFakePidFile(tmp, {live:true})`), `--print-only` prints the plan and exits without writing any handoff pending records.
10. **auto-flag-no-prompts** — Passing `--auto` does not introduce any interactive prompt (assert: the CLI completes without reading stdin; subprocess invocation with stdin closed completes normally). This is a regression-guard test more than a positive test.

Multitenancy guard (CLAUDE.md habit 6): N/A. devflow-claude is single-user; setup CLI has no tenant scope. Skipped per the project override note in OBJECTIVE.md.

</test_list>

<gotchas>
- `state.isWatcherLive()` calls `process.kill(pid, 0)` which throws on dead PIDs. The setup module must wrap it (the watcher-state module already does — but if you call `readPidFile()` directly, remember to also probe liveness).
- The handoff `id` field uses `'h-' + crypto.randomBytes(4).toString('hex')` — when writing tests that assert on the id, use a regex (`/^h-[0-9a-f]{8}$/`), not an exact string.
- `.devflow-handoff/pending/*.json` is filesystem-watched in real time by the daemon. Tests must use a temp dir that the daemon is NOT watching, or the daemon will race the test and consume the record.
- The fallback "print commands to stdout" path: when `--raw` is also passed, emit JSON (`{ status: 'no-daemon', plan: [...] }`) instead of bare lines. Default (non-raw) is human-friendly newline-separated commands.
- `process.env.HOME` redirection: tests must set HOME *before* requiring `watcher-state.cjs` if they want pid-file paths to resolve to the temp dir. `watcher-state.cjs` reads HOME on every `pidFilePath()` call (not cached at module load) — so HOME can be mutated per-test.
- `command -v` vs file-existence: use file-existence against PATH entries in tests to avoid shelling out (deterministic + fast). The production code can use `command -v` for parity, but tests control PATH.
- macOS `chromedriver` is installed via `brew install --cask chromedriver` — NOT `brew install chromedriver`. Implementer must encode this special case in `buildInstallPlan`.
</gotchas>

<validation_gates>
- `node --test plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs` — all cases pass
- `node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui setup --print-only --raw` — exits 1 with a JSON object containing a `plan` array (assuming a project missing tools) or exits 0 with `status:'already-set-up'` if devflow-claude itself happens to have everything (run from a temp dir to be safe)
- `npm test` — does not regress (pre-existing handoff-e2e flakes from VERIFICATION.md §Notable In-Flight Events #4 are NOT our regressions; spot-check that newly-failing tests are NOT in our touched files)
</validation_gates>

<tasks>

<!-- 3 tasks. Each ships one RED → GREEN cycle (or a paired test/feat commit pair).
     Atomic-commit cadence per CLAUDE.md habit + executor commit hygiene: ~2-3 commits per task. -->

<task type="auto" tdd="true">
  <name>Fixture builders + test scaffold (RED for cases 1-2)</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs</files>
  <action>
Create the paired test file with hand-built fixture builders (no LLM-generated test data per CLAUDE.md TDD Playbook habit 4).

Approach:
1. Create `plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs`.
2. Import the (not-yet-created) module: `const { detectMissingTools } = require('./flutter-ui-setup.cjs');` — this import will fail (RED).
3. Implement fixture builders ahead of any behavior tests, per habit 4:
   - `buildFakePATH(tools)` — temp dir with exec shims; returns dir path.
   - `buildHandoffPendingDir(tmpdir)` — creates `.devflow-handoff/{pending,done}/`.
   - `buildBootstrapTarget(tmpdir, opts)` — mirror `flutter-ui-bootstrap.test.cjs::makeProject`.
   - `buildFakePidFile(tmpHome, {live})` — writes `~/.devflow/devflow-watch.pid` in temp HOME pointing at `process.pid` (live) or `999999` (dead).
4. Write the first 2 test cases ONLY (detector-jq-missing, detector-all-present) per test list. Both should compile but fail because `flutter-ui-setup.cjs` does not yet exist.
5. Run `node --test plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs` and confirm RED (failing on missing module).
6. Commit: `test(10-09): add fixture builders and detector test scaffold (RED)`.

# CRITICAL: fixture builders only — NO production code yet
# PATTERN: Mirror flutter-ui-bootstrap.test.cjs structure (makeProject pattern)
# GOTCHA: HOME must be set BEFORE requires that read it; reset per-test in afterEach
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs 2>&1 | grep -E "fail [1-9]|Cannot find module"
  </verify>
  <done>Test file exists with 4 fixture builder functions + 2 failing test cases (detector-jq-missing, detector-all-present). Tests fail with module-not-found. Atomic commit landed.</done>
</task>

<task type="auto" tdd="true">
  <name>Detector + plan builder + df-tools wiring (GREEN for cases 1-4)</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Implement the minimum needed to GREEN cases 1-2, then add cases 3-4 (RED) and GREEN them. Per habit 3: ONE test at a time.

Approach:
1. Create `plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs` with stub exports: `{ detectMissingTools, buildInstallPlan, dispatchInstalls, cmdFlutterUISetup }`.
2. Implement `detectMissingTools({ pathDir, requiredTools = ['jq', 'maestro', 'chromedriver'] })`:
   - For each required tool, check if `pathDir + '/' + tool` exists (production: use PATH split + existsSync per entry; tests pass a single dir).
   - Return missing tools as an array, preserving order.
3. Run tests — cases 1-2 GREEN. Commit: `feat(10-09): add detectMissingTools (GREEN cases 1-2)`.
4. Add test cases 3-4 (plan-darwin-brew, plan-linux-apt) to test file. RED.
5. Implement `buildInstallPlan({ missing, platform })`:
   - On `'darwin'`: each tool → `'brew install <tool>'`. SPECIAL CASE: `'chromedriver'` → `'brew install --cask chromedriver'`.
   - On `'linux'`: each tool → `'sudo apt-get install -y <tool>'`.
   - On other platforms: return tool names only with an advisory comment prefix.
6. Run tests — cases 3-4 GREEN. Commit: `feat(10-09): add buildInstallPlan with platform routing (GREEN cases 3-4)`.
7. Wire `cmdFlutterUISetup` stub (returns `{ status: 'stub' }` for now — just enough to register).
8. Modify `plugins/devflow/devflow/bin/df-tools.cjs`:
   - Add `const { cmdFlutterUISetup } = require('./lib/flutter-ui-setup.cjs');` at the top alongside other lib requires (~line 185).
   - Add new top-level case (after `case 'verify'` or where alphabetically convenient):
     ```js
     case 'flutter-ui': {
       const subcommand = args[1];
       if (subcommand === 'setup') {
         cmdFlutterUISetup(cwd, args.slice(2), raw);
       } else {
         error('Unknown flutter-ui subcommand. Available: setup');
       }
       break;
     }
     ```
9. Smoke-test: `node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui setup --print-only --raw` should not print 'Unknown command'.
10. Commit: `feat(10-09): wire df-tools flutter-ui setup subcommand`.

# CRITICAL: chromedriver on darwin needs --cask flag (gotcha section)
# GOTCHA: keep `requiredTools` defaulted in the function signature so tests can override
# PATTERN: mirror cmdVerifyFlutterUIBootstrap signature for cmd handler
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs 2>&1 | grep -E "pass 4"
node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui setup --print-only --raw 2>&1 | head -1 | grep -vE "^Unknown"
  </verify>
  <done>4 test cases pass (cases 1-4). df-tools `flutter-ui setup` subcommand routes without 'Unknown command'. 3 atomic commits landed (one per RED→GREEN sub-cycle).</done>
</task>

<task type="auto" tdd="true">
  <name>Dispatch + fallback + bootstrap chain + idempotency + flags (GREEN for cases 5-10)</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs</files>
  <action>
Drive cases 5-10 RED → GREEN one at a time per habit 3. Each case is its own commit pair OR grouped into 2-3 atomic commits (test: + feat:) per the executor's commit hygiene preference.

Approach (per case):

**Case 5 (dispatch-shape-valid):**
1. RED: add test asserting that given `buildHandoffPendingDir(tmp)` + plan + cwd, `dispatchInstalls(plan, {pendingDir, cwd})` writes N pending JSON files each validating against `validateInputsSchema(rec.inputs || {secrets:[]})`.
2. GREEN: implement `dispatchInstalls(plan, {pendingDir, cwd})`:
   ```
   for each cmd in plan:
     id = 'h-' + crypto.randomBytes(4).toString('hex')
     record = { id, cmd, cwd, status: 'pending', created_at: new Date().toISOString() }
     # NO inputs.secrets — these installs don't need token-passing
     fs.writeFileSync(path.join(pendingDir, id + '.json'), JSON.stringify(record, null, 2) + '\n')
   return { dispatched: plan.length, ids: [...] }
   ```
3. Commit pair: `test(10-09): add handoff dispatch test (RED)` → `feat(10-09): add dispatchInstalls (GREEN case 5)`.

**Case 6 (fallback-no-daemon):**
1. RED: add test that spawns `node bin/df-tools.cjs flutter-ui setup` as a subprocess with HOME=tmpEmpty (no pid file) + cwd=fresh project. Assert exit code 1 AND stdout contains shell-runnable command lines.
2. GREEN: in `cmdFlutterUISetup`:
   - require `./watcher-state.cjs` and call `readPidFile()` + `isWatcherLive()`.
   - If daemon NOT live: print each plan command on its own stdout line (or JSON if --raw); exit 1.
3. Commit pair.

**Case 7 (bootstrap-chain):**
1. RED: assert that when all tools present + bootstrap target needs setup, the CLI's JSON output's `bootstrap` field deep-equals `checkBootstrapState({projectDir})` output for the same target.
2. GREEN: after detector → install-plan → dispatch (or skip if empty plan), call `require('./flutter-ui-bootstrap.cjs').checkBootstrapState({ projectDir: cwd })` and include the result in the final output under `bootstrap`.
3. Commit pair.

**Case 8 (idempotent-already-set-up):**
1. RED: assert with all tools present + marker present, output contains `"status":"already-set-up"` AND zero new files under `.devflow-handoff/pending/`.
2. GREEN: at the top of `cmdFlutterUISetup`, short-circuit: if detector returns `[]` AND `fs.existsSync(path.join(cwd, '.planning', '.flutter-ui-bootstrap-done'))` AND `checkBootstrapState({projectDir:cwd}).action === 'skip'`, output `{status:'already-set-up', ...}` and exit 0 BEFORE dispatching anything.
3. Commit pair.

**Case 9 (print-only-flag):**
1. RED: assert that even with a live pid file, `--print-only` writes no handoff records and prints the plan.
2. GREEN: parse `args.slice(2)` for `--print-only` (and `--auto`); if `--print-only` set, take the print path regardless of daemon liveness.
3. Commit pair.

**Case 10 (auto-flag-no-prompts):**
1. RED: spawn the CLI with stdin closed; assert it completes without blocking on stdin read.
2. GREEN: parse `--auto` flag (no behavior change in this TRD — the dispatch path is already non-interactive). Test should pass once flag parsing is added; if it already passes pre-flag-parsing, lock it in as a regression guard.
3. Commit pair (may be combined with case 9 into a single `feat(10-09): add --print-only and --auto flags` commit if both are small).

**Refactor pass (optional):**
- After all 10 cases GREEN, walk through `flutter-ui-setup.cjs` and extract small helpers if duplication appeared.
- Run full test suite once more.
- Optional commit: `refactor(10-09): extract platform routing helpers`.

# CRITICAL: dispatchInstalls writes pending records with NO `inputs` field (no secrets needed for installs)
# CRITICAL: idempotency short-circuit happens BEFORE dispatch — zero side effects on already-set-up projects
# GOTCHA: subprocess tests need to spawn `process.execPath bin/df-tools.cjs ...`, NOT `node` (path may differ)
# GOTCHA: when asserting on subprocess stdout/stderr, decode buffers to utf8 and strip trailing whitespace
# PATTERN: validate every constructed handoff record with handoff.validateInputsSchema before write (defensive)
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs 2>&1 | tail -5
# Expect: pass 10 (or higher if extra regression tests added), fail 0
  </verify>
  <done>All 10 test list cases pass. Module exports detectMissingTools, buildInstallPlan, dispatchInstalls, cmdFlutterUISetup. df-tools `flutter-ui setup` subcommand fully functional: detects, plans, dispatches (or prints), chains bootstrap, idempotent on re-run. 6-10 atomic commits landed across the task (per-case test:/feat: pairs).</done>
</task>

</tasks>

<verification>
After all 3 tasks complete, the verifier (`/devflow:verify-work`) will run goal-backward checks. The must_haves block above encodes the observable truths. Suggested cheap CLI verification commands (mirrored from `verification_commands` frontmatter):

1. **Subcommand registered:**
   ```
   node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui setup --print-only --raw 2>&1 | head -1
   ```
   Must NOT start with `Unknown`.

2. **Print-only emits plan:**
   ```
   node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui setup --print-only --raw
   ```
   Output JSON contains `"plan"` key.

3. **Tests pass:**
   ```
   node --test plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs
   ```
   `pass 10` (or more), `fail 0`.

4. **Module exports:**
   ```
   node -e "console.log(Object.keys(require('./plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs')))"
   ```
   Must include all four: `detectMissingTools`, `buildInstallPlan`, `dispatchInstalls`, `cmdFlutterUISetup`.

5. **Key-links wired:**
   ```
   grep -E "require.*flutter-ui-setup|require.*flutter-ui-bootstrap|require.*watcher-state|validateInputsSchema" plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs plugins/devflow/devflow/bin/df-tools.cjs
   ```
   Should show: df-tools requires flutter-ui-setup; flutter-ui-setup requires flutter-ui-bootstrap + watcher-state; references validateInputsSchema (or writes inputs-schema-compatible records).

6. **No regression on existing TRDs 10-01..10-08:**
   ```
   node --test plugins/devflow/devflow/bin/lib/flutter-ui-bootstrap.test.cjs
   node --test plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs
   node --test plugins/devflow/devflow/bin/lib/flutter-state-coverage.test.cjs
   node --test plugins/devflow/devflow/bin/lib/uat-generator.test.cjs
   node --test plugins/devflow/devflow/bin/lib/api-contract.test.cjs
   node --test plugins/devflow/devflow/bin/lib/flutter-ui-dogfood.test.cjs
   ```
   All pass.

</verification>

<success_criteria>
- `df-tools flutter-ui setup` is a single-command adoption path for downstream Flutter projects (eden-ui-flutter primarily).
- Detector identifies missing system tools (jq, maestro, chromedriver) on darwin + linux.
- Install plan is platform-aware and copy-pasteable.
- Daemon-live path dispatches via handoff (schema-validated pending records).
- Daemon-down path prints commands + exits nonzero (signals human action needed).
- Bootstrap chain integrates seamlessly with existing `flutter-ui-bootstrap.cjs` (TRD 10-04a).
- Idempotent: re-runs on a fully-set-up project return `status:'already-set-up'` with zero side effects.
- `--print-only` and `--auto` flags behave per spec.
- All 10 test list cases pass via hand-built fixtures (no LLM-generated test data).
- No regression on TRDs 10-01..10-08 test suites.
</success_criteria>

<output>
- `plugins/devflow/devflow/bin/lib/flutter-ui-setup.cjs` (~150 lines, new)
- `plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs` (~250 lines, new)
- `plugins/devflow/devflow/bin/df-tools.cjs` (~10 lines added, modified)
- 6-10 atomic commits across 3 tasks (test:/feat: pairs per RED-GREEN cycle, optional refactor: at the end)
</output>
