---
objective: 19-pty-handoff-watcher
trd: "02"
type: tdd
confidence: high
wave: 2
depends_on:
  - "19-01"
files_modified:
  - plugins/devflow/devflow/bin/lib/handoff.cjs
  - plugins/devflow/devflow/bin/lib/handoff.test.cjs
  - plugins/devflow/devflow/bin/lib/watcher-daemon.cjs
  - plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs
autonomous: true
requirements:
  - TOKEN-PASSING
must_haves:
  truths:
    - "Pending record schema accepts optional inputs.secrets[] array with {prompt_match, value_source, value_ref}"
    - "validateInputsSchema accepts {value_source: 'stash'} and {value_source: 'env'}; rejects 'keyring' with v1.3+ message"
    - "validateInputsSchema rejects entries missing prompt_match or value_ref with clear error"
    - "validateInputsSchema rejects prompt_match strings that fail to compile as RegExp"
    - "Daemon processOnce() with inputs.secrets[].value_source='env' resolves value from process.env at dispatch time"
    - "Daemon processOnce() with value_source='env' and missing/empty env var fails the dispatch with status:'failed' and clear stderr"
    - "Daemon processOnce() with value_source='stash' reads from in-memory per-handoff stash; missing entry → status:'failed'"
    - "Daemon writes resolved secret value + carriage-return to PTY when accumulated output buffer matches prompt_match regex"
    - "Each prompt_match consumes exactly once; second match → status:'failed' with stderr 'duplicate prompt match for <ref>'"
    - "Done record stdout/stderr have resolved secret values redacted to ***REDACTED*** before persistence"
    - "Records without inputs.secrets field continue to dispatch byte-identical to v1.1 (zero regression on plain dispatch path)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/handoff.cjs"
      provides: "validateInputsSchema(inputs) helper + extended cmdHandoffCreate accepting --inputs-json flag"
      exports: ["cmdHandoffCreate", "cmdHandoffComplete", "cmdHandoffList", "cmdHandoffGet", "validateInputsSchema"]
      min_lines: 200
    - path: "plugins/devflow/devflow/bin/lib/handoff.test.cjs"
      provides: "Unit tests for validateInputsSchema (12+ cases) + extended cmdHandoffCreate tests"
      min_lines: 200
    - path: "plugins/devflow/devflow/bin/lib/watcher-daemon.cjs"
      provides: "processOnce wired with prompt-detection + secret-resolution + redaction"
      min_lines: 280
    - path: "plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs"
      provides: "New describe block: 'processOnce — token passing' with mock ShellSession exposing prompt simulation"
      min_lines: 300
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/watcher-daemon.cjs"
      to: "plugins/devflow/devflow/bin/lib/handoff.cjs"
      via: "validateInputsSchema called during processOnce before dispatch"
      pattern: "validateInputsSchema"
    - from: "plugins/devflow/devflow/bin/lib/watcher-daemon.cjs"
      to: "ShellSession (PTY-aware after 19-01)"
      via: "session.write(value + '\\r') invoked when prompt regex matches accumulated buffer"
      pattern: "session\\.(write|writeRaw|injectInput)"
    - from: "Done record path"
      to: "Redacted stdout/stderr"
      via: "_redactSecrets(text, resolvedValues) called before makeDoneRecord"
      pattern: "REDACTED"
---

<objective>
Extend the pending-record schema with `inputs.secrets[]` so the daemon can answer prompts from the user's keyring or one-shot stash. Wire the daemon's `processOnce` to detect prompts via regex match against the accumulated PTY buffer, write the resolved secret + CR to the PTY, and redact the secret from the done record before persistence.

Purpose: Locked decision 5. PTY transport (TRD 19-01) makes TTY-required tools runnable; without token passing, those tools still hang on prompts the daemon can't see. This TRD closes the prompt-answer loop.

Output: `validateInputsSchema` helper in `lib/handoff.cjs`. Extended `processOnce` in `lib/watcher-daemon.cjs` with prompt-detection, secret-resolution, and stdout/stderr redaction. Test coverage for happy path + 11 failure modes.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── handoff.cjs                      ← MODIFY (add validateInputsSchema + extend cmdHandoffCreate)
├── handoff.test.cjs                 ← CREATE if not present, otherwise MODIFY
├── watcher-daemon.cjs               ← MODIFY (extend processOnce with prompt-answer wiring)
└── watcher-daemon.test.cjs          ← MODIFY (add token-passing describe block)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: Existing handoff record shape (lib/handoff.cjs)

```js
function cmdHandoffCreate(cwd, cmd, raw) {
  if (!cmd) {
    process.stderr.write('handoff create requires a command\n');
    process.exit(2);
  }
  const d = ensureDirs(cwd);
  const id = newId();
  const record = {
    id,
    cmd,
    cwd,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  const filePath = path.join(d.pending, `${id}.json`);
  writeJson(filePath, record);
  output({ id, path: path.relative(cwd, filePath), record }, raw);
}
```

**Extension pattern:** add an `inputs` field to the record when `--inputs-json <json>` flag is provided. Validate via `validateInputsSchema(inputs)` before writing the file. Reject with exit code 2 + clear stderr on validation failure.

### Pattern: Existing daemon processOnce (lib/watcher-daemon.cjs lines 84-125)

```js
async function processOnce(pending, deps) {
  const { session, allowlist: allow, projectRoot, log, timeoutMs } = deps;
  const startedAt = new Date().toISOString();
  const logFn = log || (() => {});

  const validation = allowlist.validateCommand(pending.cmd, allow);
  if (!validation.ok) {
    // ... rejected path ...
    return done;
  }

  logFn('info', `dispatching ${pending.id}: ${pending.cmd}`);
  let result;
  try {
    result = await session.dispatch(pending.id, pending.cmd, {
      timeout_ms: timeoutMs || DEFAULT_DISPATCH_TIMEOUT_MS,
    });
  } catch (e) {
    result = { stdout: '', stderr: `[devflow-watch] dispatch error: ${e.message}`, exit_code: -3, status: 'error' };
  }

  const done = state.makeDoneRecord(pending, { ...result, started_at: startedAt });
  writeDoneRecord(projectRoot, done);
  removePendingRecord(pending);
  return done;
}
```

**Extension pattern (this TRD):**

```js
async function processOnce(pending, deps) {
  // ... existing allowlist gate ...

  // NEW: validate inputs.secrets if present
  if (pending.inputs && pending.inputs.secrets) {
    const inputsCheck = handoff.validateInputsSchema(pending.inputs);
    if (!inputsCheck.ok) {
      // emit done with status:'failed' + stderr inputsCheck.reason
      return ...;
    }
  }

  // NEW: resolve secrets at dispatch time
  const resolvedSecrets = pending.inputs && pending.inputs.secrets
    ? resolveSecrets(pending.inputs.secrets, deps.stashGetter)
    : [];
  // resolvedSecrets shape: [{ regex: RegExp, value: string, consumed: false, ref: string }]
  // If any resolution failed → emit done failed with stderr stating which ref+source

  // Wire the session's onData stream to a prompt detector
  // (requires ShellSession to expose either an event emitter OR an injectable onData hook)
  const detector = makePromptDetector(resolvedSecrets, (value) => session.injectInput(value + '\r'));
  session.attachDataListener(detector);  // or equivalent

  // Existing dispatch + timeout logic
  let result;
  try {
    result = await session.dispatch(...);
  } finally {
    session.detachDataListener(detector);
  }

  // Redact secrets from result before writing done record
  result.stdout = _redactSecrets(result.stdout, resolvedSecrets);
  result.stderr = _redactSecrets(result.stderr, resolvedSecrets);
  // ... write done record ...
}
```

### Pattern: Existing test mock structure (lib/watcher-daemon.test.cjs)

The current daemon test file uses a `mockSession` factory pattern. Extend it:

```js
function makeMockSession(opts = {}) {
  return {
    dispatch: opts.dispatch || (async () => ({ stdout:'', stderr:'', exit_code:0, status:'done' })),
    isAlive: () => true,
    // NEW for token passing:
    _dataListeners: [],
    attachDataListener(fn) { this._dataListeners.push(fn); },
    detachDataListener(fn) { this._dataListeners = this._dataListeners.filter(x => x !== fn); },
    injectInput: opts.injectInput || (() => {}),
    // Test harness: simulate PTY output stream during dispatch
    _emitData(chunk) { for (const fn of this._dataListeners) fn(chunk); },
  };
}
```

</codebase_examples>

<anti_patterns>

- **DO NOT** persist secret values to disk anywhere — not in pending records, not in done records, not in logs. The pending record stores only the `value_ref` (env var name or stash key); resolution happens at dispatch time in memory.
- **DO NOT** log secret values via `logFn`. Even at log level info/debug, secrets must never appear in `~/.devflow/devflow-watch.log`. The `dispatching ${pending.id}: ${pending.cmd}` log line is fine because it logs the COMMAND, not the secret.
- **DO NOT** support `value_source: 'keyring'` runtime path — reject at validation time per locked decision 5. Future v1.3 work.
- **DO NOT** redact strings shorter than 8 characters or empty — redaction needs to be obvious AND not collapse legitimate output that happens to share a substring with a short token. Choose a sane minimum length threshold; document in the code comment.
- **DO NOT** alter ShellSession's public API surface from TRD 19-01 — if 19-01 doesn't expose `attachDataListener` / `injectInput`, this TRD MUST add them as part of GREEN (and update the 19-01 test file is OK only if it's additive — never remove existing behavior).

</anti_patterns>

<error_recovery>

- **`validateInputsSchema` invoked with non-object inputs (number, null, array)** → return `{ok: false, reason: 'inputs must be an object'}`. Tests cover.
- **`prompt_match` is invalid regex** → `validateInputsSchema` catches the `new RegExp()` throw and returns `{ok: false, reason: 'invalid regex in prompt_match: <message>'}`. Tests cover with malformed pattern like `'[invalid'`.
- **Secret regex matches twice** (e.g. tool re-prompts after wrong answer) → daemon writes the secret once, marks consumed, on second match emits `status:'failed'` with stderr `'duplicate prompt match for <ref> (likely incorrect value)'`. Daemon then writes Ctrl+C (`\x03`) to PTY to abort, then completes the dispatch.
- **Stash key absent** (value_source='stash' but stash empty for this handoff) → daemon writes Ctrl+C to PTY, emits done `status:'failed'` with stderr `'secret resolution failed for <ref> (stash empty for handoff <id>)'`.
- **Env var absent or empty** → same pattern: Ctrl+C to PTY, done `status:'failed'` with stderr `'secret resolution failed for <ref> (env var unset or empty)'`.
- **Pending record has `inputs` field but `inputs.secrets` is missing/empty** → treat as no secrets (continue normal dispatch). `inputs: {}` is valid. Tests cover.
- **Resolved secret value contains the prompt_match string** (pathological case) → after writing the secret, the next chunk arriving back from PTY may "match" again because of echo. Mitigation: only count matches that arrive AFTER the most recent injection. Tests cover.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/objectives/19-pty-handoff-watcher/19-CONTEXT.md
@.planning/objectives/19-pty-handoff-watcher/19-RESEARCH.md
@plugins/devflow/devflow/bin/lib/handoff.cjs
@plugins/devflow/devflow/bin/lib/watcher-daemon.cjs
</context>

<research_context>

From 19-RESEARCH.md §2 "Token-passing wire format":

```jsonc
{
  "id": "h-abc123",
  "cmd": "doctl auth init",
  "inputs": {                              // NEW (optional)
    "secrets": [
      {
        "prompt_match": "Enter your access token:",
        "value_source": "stash",           // "stash" | "env" | "keyring"
        "value_ref": "do-token"
      }
    ]
  }
}
```

Daemon behavior:
1. Build sentinel-wrapped command as today.
2. Maintain a per-handoff "secrets pending" map.
3. As PTY data arrives, scan accumulated buffer for any `prompt_match` regex.
4. On match: write resolved value + `\r` to PTY.
5. Resolution: stash (in-memory Map keyed by handoff id), env (process.env), keyring (rejected v1.2).

From 19-RESEARCH.md §4 "Token-passing pitfalls":
- Regex over-match: tests must include adversarial cases.
- Echoed secrets in done record: scan for resolved secrets and redact before writing.
- Race: prompt detected, value written, prompt detected again — mark consumed; repeated = error.

</research_context>

<gotchas>

- **ShellSession surface from 19-01:** if 19-01 didn't add `attachDataListener` / `injectInput`, add them in this TRD as part of GREEN. They are forward-compatible API additions; both pipe-mode and PTY-mode get the same surface. Be careful to update both branches in `watcher-shell.cjs`.

- **Redaction edge cases:** when a tool prints `Token saved as 'abc...xyz'`, naive `replaceAll(value, '***REDACTED***')` won't catch the truncated form. v1.2 scope: redact only EXACT value matches; document the partial-leak risk in 19-04 doc.

- **Stash backend (locked decision 5):** v1.2 schema accepts `value_source: 'stash'` but the stash CLI (`devflow-watch stash add <handoff-id> <key> <value>`) is NOT shipped in this TRD per CONTEXT.md §4 discretion. The runtime behavior when value_source='stash' but stash is empty: emit done `status:'failed'` with the clear stderr from error_recovery. Tests cover this. The `env` backend is the v1.2 working path.

- **PTY echo amplification:** when the daemon writes a secret to the PTY, the PTY echoes it back in the data stream. The redaction step handles this — but ensure redaction runs against the FULL stdout/stderr buffers AFTER dispatch resolution, not against intermediate chunks. Don't redact-as-you-go; redact-at-end.

- **Bash heredoc / pipe-context detection:** if a tool prompts via stderr instead of stdout, the sentinel wrapper still routes both to temp files. The PTY data stream contains BOTH (since PTY merges them). The prompt_match regex therefore sees the prompt regardless of which fd the tool wrote to. Tests must cover stderr-prompts (mock with `read -p prompt: var 1>&2` style).

- **Backward-compat:** every test that exists today (records without `inputs.secrets`) MUST continue to pass byte-identical. The new field is purely additive.

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Test list + RED for validateInputsSchema (handoff.cjs)</name>
  <files>plugins/devflow/devflow/bin/lib/handoff.test.cjs, plugins/devflow/devflow/bin/lib/handoff.cjs</files>
  <action>
Per CLAUDE.md TDD Playbook habit 2 (test list first), document behavior cases as a checklist comment in `handoff.test.cjs` before writing test bodies. Create the file if missing (no test file exists for handoff.cjs today).

Behavior list for `validateInputsSchema(inputs)`:

- VS-1: returns {ok:true} for empty/missing secrets array (`{}`, `{secrets:[]}`)
- VS-2: returns {ok:false, reason:/...stash...env.../} for value_source='keyring'
- VS-3: returns {ok:false, reason:/...inputs must be object.../} for non-object inputs (null, number, string, array)
- VS-4: returns {ok:false, reason:/...invalid regex.../} for malformed prompt_match like `'[invalid'`
- VS-5: returns {ok:false, reason:/...prompt_match required.../} when prompt_match missing
- VS-6: returns {ok:false, reason:/...value_ref required.../} when value_ref missing
- VS-7: returns {ok:false, reason:/...value_source.../} when value_source is unknown ('vault', 'op', etc.)
- VS-8: returns {ok:true} for valid stash entry
- VS-9: returns {ok:true} for valid env entry
- VS-10: returns {ok:true} for multiple valid entries (mix of stash + env)
- VS-11: returns {ok:false} when ANY entry in array is invalid (fail-on-first)
- VS-12: returns {ok:false, reason:/...empty value_ref.../} when value_ref is empty string

Behavior list for `cmdHandoffCreate` extension:

- HC-1: cmdHandoffCreate(cwd, cmd, raw) without inputs writes record without `inputs` key (back-compat)
- HC-2: cmdHandoffCreate(cwd, cmd, raw, {inputsJson: '<valid-json>'}) writes record WITH `inputs` field
- HC-3: cmdHandoffCreate with malformed inputs JSON exits with code 2 + stderr message
- HC-4: cmdHandoffCreate with inputs failing validateInputsSchema exits with code 2 + reason from validation

Steps:

1. Create `plugins/devflow/devflow/bin/lib/handoff.test.cjs` with a header behavior-list comment + the test factory + 12 RED tests for `validateInputsSchema`.
2. Add at least HC-1 and HC-2 cmdHandoffCreate tests (HC-3/HC-4 can be added in next test cycle).
3. Run `node --test plugins/devflow/devflow/bin/lib/handoff.test.cjs`. ALL 14+ tests MUST FAIL (no impl yet).
4. Commit RED: `test(19-02): add failing tests for validateInputsSchema and cmdHandoffCreate inputs extension`.

# CRITICAL: Behavior list MUST be in a comment block at the top of the test file BEFORE any test body.
# CRITICAL: Tests must currently fail. Run them and confirm RED state.
# PATTERN: Mirror watcher-allowlist.test.cjs structure — describe blocks per concern, t.test() per case, assert.equal/assert.match for assertions.
  </action>
  <verify>
1. `cat plugins/devflow/devflow/bin/lib/handoff.test.cjs | head -40` shows the behavior-list comment block (16+ items).
2. `node --test plugins/devflow/devflow/bin/lib/handoff.test.cjs 2>&1 | tail -10` reports 14+ failing tests.
3. `git log --oneline | head -1` shows the RED commit.
  </verify>
  <done>
- `handoff.test.cjs` exists with full behavior list comment + 14+ failing tests.
- Existing 11 watcher-shell tests + everything else still passes (zero regression on rest of suite).
- RED commit exists.
  </done>
  <recovery>
- If handoff.test.cjs already exists from a partial earlier run: read it, validate the behavior-list, append missing cases. Don't rewrite from scratch — preserve any existing valid coverage.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Implement validateInputsSchema + extend cmdHandoffCreate (GREEN); wire processOnce with prompt-answer + redaction</name>
  <files>plugins/devflow/devflow/bin/lib/handoff.cjs, plugins/devflow/devflow/bin/lib/watcher-daemon.cjs, plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs, plugins/devflow/devflow/bin/lib/watcher-shell.cjs</files>
  <action>
Make the failing tests pass. This task spans handoff.cjs (validation + create extension) AND watcher-daemon.cjs (runtime wiring) AND watcher-shell.cjs (data-listener API addition needed by daemon). Treat as one logical GREEN — split into multiple commits per natural breakpoint per memory `feedback_executor_smaller_commits`.

Approach:

**Step A: handoff.cjs — validateInputsSchema + cmdHandoffCreate extension**

```js
const VALID_SOURCES = ['stash', 'env'];  // keyring rejected for v1.2
const KEYRING_REJECT_MSG = 'value_source "keyring" deferred to v1.3+ — use stash or env in v1.2';

function validateInputsSchema(inputs) {
  if (inputs == null || typeof inputs !== 'object' || Array.isArray(inputs)) {
    return { ok: false, reason: 'inputs must be an object' };
  }
  const secrets = inputs.secrets;
  if (secrets == null) return { ok: true };       // empty/missing → valid no-op
  if (!Array.isArray(secrets)) return { ok: false, reason: 'inputs.secrets must be an array' };

  for (let i = 0; i < secrets.length; i += 1) {
    const s = secrets[i];
    if (s == null || typeof s !== 'object') {
      return { ok: false, reason: `inputs.secrets[${i}] must be an object` };
    }
    if (typeof s.prompt_match !== 'string' || !s.prompt_match) {
      return { ok: false, reason: `inputs.secrets[${i}].prompt_match required` };
    }
    try { new RegExp(s.prompt_match); } catch (e) {
      return { ok: false, reason: `inputs.secrets[${i}] invalid regex in prompt_match: ${e.message}` };
    }
    if (s.value_source === 'keyring') {
      return { ok: false, reason: `inputs.secrets[${i}]: ${KEYRING_REJECT_MSG}` };
    }
    if (!VALID_SOURCES.includes(s.value_source)) {
      return { ok: false, reason: `inputs.secrets[${i}].value_source must be one of: ${VALID_SOURCES.join(', ')}` };
    }
    if (typeof s.value_ref !== 'string' || !s.value_ref) {
      return { ok: false, reason: `inputs.secrets[${i}].value_ref required (non-empty string)` };
    }
  }
  return { ok: true };
}

function cmdHandoffCreate(cwd, cmd, raw, opts = {}) {
  // ... existing guards ...
  let inputs = null;
  if (opts.inputsJson != null) {
    try { inputs = JSON.parse(opts.inputsJson); }
    catch (e) {
      process.stderr.write(`handoff create: invalid --inputs-json: ${e.message}\n`);
      process.exit(2);
    }
    const v = validateInputsSchema(inputs);
    if (!v.ok) {
      process.stderr.write(`handoff create: inputs schema invalid: ${v.reason}\n`);
      process.exit(2);
    }
  }
  const record = {
    id, cmd, cwd,
    status: 'pending',
    created_at: new Date().toISOString(),
    ...(inputs ? { inputs } : {}),
  };
  // ... existing write + output ...
}

module.exports = {
  cmdHandoffCreate, cmdHandoffComplete, cmdHandoffList, cmdHandoffGet,
  validateInputsSchema,
};
```

Run handoff tests. They should pass. Commit GREEN-A: `feat(19-02): add validateInputsSchema and inputs field to cmdHandoffCreate`.

**Step B: watcher-shell.cjs — expose data-listener API**

Add `attachDataListener(fn)`, `detachDataListener(fn)`, and `injectInput(s)` to `ShellSession`. Both PTY and pipe modes route through the same surface:

```js
class ShellSession extends EventEmitter {
  // ... existing fields, plus:
  this._extDataListeners = [];

  attachDataListener(fn) { this._extDataListeners.push(fn); }
  detachDataListener(fn) {
    this._extDataListeners = this._extDataListeners.filter(x => x !== fn);
  }
  injectInput(s) {
    if (this._closed || !this.proc) return;
    if (this._isPTY) this.proc.write(s);
    else this.proc.stdin.write(s);
  }

  // Modify the existing onData/'data' handlers in spawn() to ALSO call extDataListeners:
  // PTY:    this.proc.onData(chunk => { this._stdoutBuf += chunk; this._extDataListeners.forEach(fn => fn(chunk)); this._tryComplete(); });
  // Pipe stdout: same shape.
  // Pipe stderr: same shape (ext listeners get stderr too — secret prompts CAN come on stderr).
}
```

Add tests for these in `watcher-shell.test.cjs` if not already covered (one happy-path test per mode). Run all watcher-shell tests; pipe + PTY both still pass.

Commit GREEN-B: `feat(19-02): expose data-listener API on ShellSession for prompt detection`.

**Step C: watcher-daemon.cjs — wire prompt-answer + redaction into processOnce**

```js
const handoff = require('./handoff.cjs');

const REDACT = '***REDACTED***';
const MIN_REDACT_LEN = 8;

function _resolveSecrets(secrets, stashGetter) {
  // stashGetter: (handoff_id, value_ref) => string | null
  const out = [];
  for (const s of secrets) {
    let value = null;
    let err = null;
    if (s.value_source === 'env') {
      const v = process.env[s.value_ref];
      if (!v) err = `env var "${s.value_ref}" unset or empty`;
      else value = v;
    } else if (s.value_source === 'stash') {
      const v = stashGetter ? stashGetter(s._handoff_id, s.value_ref) : null;
      if (v == null) err = `stash empty for ref "${s.value_ref}" (handoff ${s._handoff_id})`;
      else value = v;
    }
    out.push({
      regex: new RegExp(s.prompt_match),
      ref: s.value_ref,
      source: s.value_source,
      value,
      err,
      consumed: false,
    });
  }
  return out;
}

function _makePromptDetector(resolvedSecrets, sessionInjector, onError) {
  let lastInjectionIdx = 0;
  let buf = '';
  return function onChunk(chunk) {
    buf += chunk;
    for (const sec of resolvedSecrets) {
      if (sec.consumed) {
        // Check for re-match AFTER lastInjectionIdx
        const tail = buf.slice(lastInjectionIdx);
        if (sec.regex.test(tail)) {
          // duplicate match — abort
          sessionInjector('\x03');  // Ctrl+C
          onError(`duplicate prompt match for "${sec.ref}" (likely incorrect value)`);
          sec.consumed = 'error';
          return;
        }
        continue;
      }
      if (sec.err) {
        // failed resolution — abort on first match
        sessionInjector('\x03');
        onError(`secret resolution failed for "${sec.ref}" (${sec.err})`);
        sec.consumed = 'error';
        return;
      }
      if (sec.regex.test(buf)) {
        sessionInjector(sec.value + '\r');
        sec.consumed = true;
        lastInjectionIdx = buf.length;
      }
    }
  };
}

function _redactSecrets(text, resolvedSecrets) {
  if (!text) return text;
  let out = text;
  for (const sec of resolvedSecrets) {
    if (!sec.value || sec.value.length < MIN_REDACT_LEN) continue;
    // Escape regex special chars in value
    const esc = sec.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(esc, 'g'), REDACT);
  }
  return out;
}

async function processOnce(pending, deps) {
  // ... existing allowlist gate, unchanged ...

  // NEW: validate inputs schema
  if (pending.inputs) {
    const v = handoff.validateInputsSchema(pending.inputs);
    if (!v.ok) {
      // emit done with status:'failed' + stderr v.reason
      const done = state.makeDoneRecord(pending, {
        stdout:'', stderr:`[devflow-watch] inputs invalid: ${v.reason}`,
        exit_code:-4, status:'failed', started_at: startedAt,
      });
      writeDoneRecord(projectRoot, done);
      removePendingRecord(pending);
      return done;
    }
  }

  // NEW: resolve secrets at dispatch time
  const secrets = (pending.inputs && pending.inputs.secrets) || [];
  for (const s of secrets) s._handoff_id = pending.id;
  const resolved = _resolveSecrets(secrets, deps.stashGetter);

  // Wire detector if any secrets
  let detectorErr = null;
  let detector = null;
  if (resolved.length > 0 && session.attachDataListener) {
    detector = _makePromptDetector(
      resolved,
      (s) => session.injectInput(s),
      (msg) => { detectorErr = msg; },
    );
    session.attachDataListener(detector);
  }

  let result;
  try {
    result = await session.dispatch(pending.id, pending.cmd, { timeout_ms: timeoutMs || DEFAULT_DISPATCH_TIMEOUT_MS });
  } catch (e) {
    result = { stdout:'', stderr:`[devflow-watch] dispatch error: ${e.message}`, exit_code:-3, status:'error' };
  } finally {
    if (detector && session.detachDataListener) session.detachDataListener(detector);
  }

  // Apply detector errors (override exit_code if detector failed)
  if (detectorErr && result.status === 'done') {
    result.stderr = `${result.stderr || ''}\n[devflow-watch] ${detectorErr}`;
    result.status = 'failed';
    if (result.exit_code === 0) result.exit_code = -5;
  }

  // Redact secrets from output
  result.stdout = _redactSecrets(result.stdout, resolved);
  result.stderr = _redactSecrets(result.stderr, resolved);

  const done = state.makeDoneRecord(pending, { ...result, started_at: startedAt });
  writeDoneRecord(projectRoot, done);
  removePendingRecord(pending);
  return done;
}
```

Add tests for processOnce token-passing in `watcher-daemon.test.cjs`:

- TP-1: pending with valid inputs.secrets[env] resolves and writes value to session
- TP-2: pending with inputs.secrets[stash] but no stashGetter → status:'failed' with reason
- TP-3: pending with inputs.secrets[env] but env var unset → status:'failed' with reason
- TP-4: prompt re-match → Ctrl+C injection + status:'failed' with 'duplicate prompt match'
- TP-5: stdout containing the resolved secret value gets redacted to ***REDACTED*** in done record
- TP-6: pending without inputs field dispatches byte-identical to v1.1 (back-compat)
- TP-7: pending with inputs.secrets:[] dispatches like TP-6 (empty array OK)
- TP-8: pending with inputs.secrets[keyring] → status:'failed' before dispatch (validateInputsSchema rejects)
- TP-9: redaction skips values shorter than MIN_REDACT_LEN
- TP-10: stderr containing resolved secret also gets redacted

Run all tests; commit GREEN-C: `feat(19-02): wire processOnce with prompt-answer + redaction for token passing`.

# CRITICAL: Three commits, not one — per memory feedback_executor_smaller_commits.
# CRITICAL: Back-compat is a hard contract. Tests TP-6, TP-7 are blocking.
# CRITICAL: Logging must NEVER include resolved secret values. Audit logFn calls before commit.
# GOTCHA: data listener gets stderr chunks too in pipe mode — both stdout and stderr 'data' handlers must call extDataListeners.
# GOTCHA: stashGetter is injected from deps so tests can stub it. Production daemon's stashGetter is null in v1.2 (no stash CLI yet) — that's why stash-source tests assert "stash empty" failure mode.
# PATTERN: Match the existing makeDoneRecord/writeDoneRecord/removePendingRecord chain in processOnce — don't restructure.
  </action>
  <verify>
1. `node --test plugins/devflow/devflow/bin/lib/handoff.test.cjs` → all VS-* and HC-* tests pass.
2. `node --test plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs` → all 23 tests still pass (existing 11 pipe + 12 PTY from 19-01).
3. `node --test plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs` → existing tests pass + 10 new TP-* tests pass.
4. `npm test 2>&1 | tail -5` → total ≥1864 + new tests, 0 failures.
5. `grep -n "REDACTED" plugins/devflow/devflow/bin/lib/watcher-daemon.cjs` shows redaction is wired.
6. Three commits in git log: `feat(19-02): add validateInputsSchema...`, `feat(19-02): expose data-listener...`, `feat(19-02): wire processOnce with prompt-answer...`.
  </verify>
  <done>
- `validateInputsSchema` exported from handoff.cjs and unit-tested.
- `cmdHandoffCreate` accepts `--inputs-json` flag with validation.
- `ShellSession.attachDataListener/detachDataListener/injectInput` exposed on both PTY and pipe modes.
- `processOnce` wires prompt-detection, secret-resolution, redaction; back-compat preserved for records without inputs.
- 14+ handoff tests + 10 daemon token-passing tests pass.
- Three GREEN commits exist.
- All pre-existing tests still pass.
  </done>
  <recovery>
- If a test fails on a regex compile error: tests likely passed an unescaped string with regex special chars as `prompt_match`. Verify the test inputs.
- If TP-5 (redaction) fails because the value contains regex special chars: confirm the regex escape `[.*+?^${}()|[\]\\]` is applied. Fix the escape and re-run.
- If watcher-shell tests regress: review the data-listener wiring carefully. The new code path (`extDataListeners.forEach(fn => fn(chunk))`) MUST run AFTER the existing `_stdoutBuf += chunk` AND BEFORE `_tryComplete()`. Order matters because tryComplete may resolve the dispatch before the detector sees the chunk.
- If pipe-mode stderr tests regress: confirm the new ext-listener call is added to BOTH stdout and stderr 'data' handlers. PTY mode has only `onData` (single stream), pipe mode has two.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none)</lint>
<test>npm test</test>
<build>(none)</build>
</validation_gates>

<verification>
- `validateInputsSchema` exported, accepts stash/env, rejects keyring with v1.3+ message
- `cmdHandoffCreate` accepts optional `--inputs-json` flag and writes `inputs` field to pending record on validation pass
- `ShellSession.attachDataListener/detachDataListener/injectInput` work for both PTY and pipe modes
- `processOnce`:
  - rejects records with invalid `inputs` schema (status:'failed' before dispatch)
  - resolves secrets at dispatch time (env from process.env, stash via injected getter)
  - emits Ctrl+C + status:'failed' on resolution failure or duplicate match
  - redacts resolved secret values (>= MIN_REDACT_LEN chars) from done.stdout and done.stderr
  - dispatches byte-identical to v1.1 for records without `inputs` field
- All TP-* tests pass; back-compat tests TP-6/TP-7 pass
- Total project test count: ≥1884 (1864 + 14 handoff + ≥10 daemon = ≥1888)
</verification>

<success_criteria>
- [ ] `validateInputsSchema` in lib/handoff.cjs accepts stash + env, rejects keyring with v1.3+ message, returns clear errors for malformed input
- [ ] `cmdHandoffCreate` accepts `--inputs-json` and validates before writing record
- [ ] `ShellSession` has `attachDataListener`, `detachDataListener`, `injectInput` working in both modes
- [ ] `processOnce` answers prompts via PTY write when buffer matches `prompt_match` regex
- [ ] `processOnce` redacts resolved secret values from done record stdout/stderr
- [ ] Back-compat: records without `inputs` field dispatch byte-identical to v1.1
- [ ] At least 24 new tests (14 handoff + 10 daemon) pass; zero regressions
- [ ] At least 3 atomic commits (RED, GREEN-A, GREEN-B, GREEN-C; REFACTOR optional)
</success_criteria>

<output>
After completion, create `.planning/objectives/19-pty-handoff-watcher/19-02-token-passing-SUMMARY.md` per @/Users/markemerson/.claude/devflow/templates/summary.md. Document:
- Final wire format for `inputs.secrets[]`
- MIN_REDACT_LEN choice + rationale
- Whether stash CLI was deferred (yes per CONTEXT.md §4) or shipped; if shipped, document the surface
- Commit hashes for RED, GREEN-A, GREEN-B, GREEN-C
- Test count delta (handoff: +14, daemon: +10)
</output>
