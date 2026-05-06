---
objective: 19-pty-handoff-watcher
trd: "03"
type: tdd
confidence: high
wave: 2
depends_on:
  - "19-01"
files_modified:
  - plugins/devflow/hooks/gate-interactive.js
  - plugins/devflow/hooks/gate-interactive.test.js
autonomous: true
requirements:
  - GATE-PTY-MESSAGE
must_haves:
  truths:
    - "buildDenyReason watcher-live branch contains the phrase 'PTY-backed daemon' when watcher is live"
    - "buildDenyReason watcher-absent branch (Approach A paste fallback) is unchanged"
    - "INTERACTIVE_PATTERNS list count remains 23 (10 TTY + 13 shell-flow); no patterns added or removed"
    - "Deny-list patterns (sudo, su -, rm -rf /, fork bomb, curl|bash, wget|sh) are unchanged in watcher-allowlist.cjs (this TRD does NOT modify deny-list)"
    - "All 24 existing gate-interactive.test.js tests pass unchanged"
    - "Subprocess JSON shape unchanged: { hookSpecificOutput: { hookEventName:'PreToolUse', permissionDecision:'deny', permissionDecisionReason:<string> } }"
    - "Test asserts verbatim 'PTY-backed daemon' substring in watcher-live deny reason"
    - "Test asserts watcher-absent deny reason still says 'paste this in the prompt' (Approach A wording preserved)"
  artifacts:
    - path: "plugins/devflow/hooks/gate-interactive.js"
      provides: "Updated buildDenyReason watcher-live branch with PTY mention"
      exports: ["detectInteractive", "INTERACTIVE_PATTERNS", "CMD_POS", "isWatcherLive", "readWatcherInfo", "pidFilePath", "buildDenyReason"]
      contains: "PTY-backed daemon"
    - path: "plugins/devflow/hooks/gate-interactive.test.js"
      provides: "New tests asserting PTY message in watcher-live branch + back-compat tests for watcher-absent branch"
      min_lines: 410
  key_links:
    - from: "plugins/devflow/hooks/gate-interactive.js"
      to: "buildDenyReason"
      via: "watcherLive branch text update"
      pattern: "PTY-backed daemon"
    - from: "plugins/devflow/hooks/gate-interactive.test.js"
      to: "buildDenyReason"
      via: "New describe('buildDenyReason — PTY messaging', ...) block"
      pattern: "PTY-backed daemon"
---

<objective>
Update `buildDenyReason` in `gate-interactive.js` so the watcher-live branch tells Claude that TTY-interactive commands are routed to a "PTY-backed daemon" (post-19-01). The watcher-absent branch (Approach A paste fallback) is preserved verbatim. The INTERACTIVE_PATTERNS list and deny-list are unchanged.

Purpose: With PTY in place (TRD 19-01), the daemon can run TTY-required commands like `gh auth login` and `doctl auth init`. Claude needs to know — in the deny message it sees on hook-deny — that these commands will succeed via the daemon, not just queue and stall. The wording change is small but load-bearing for Claude's downstream behavior (it should NOT instruct the user to paste, NOT retry, NOT report failure).

Output: `buildDenyReason` watcher-live branch text update + tests asserting the new wording.
</objective>

<file_tree>
plugins/devflow/hooks/
├── gate-interactive.js          ← MODIFY (buildDenyReason watcher-live branch text)
└── gate-interactive.test.js     ← MODIFY (add PTY-messaging assertions)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: Current buildDenyReason (gate-interactive.js lines 257-276)

```js
function buildDenyReason({ id, cmd, hit, watcherLive, watcherInfo }) {
  if (watcherLive) {
    return [
      `This command needs the user's shell (${hit.reason}; category: ${hit.category}).`,
      `It has been queued to the devflow-watch daemon (pid ${watcherInfo && watcherInfo.pid}). Continue with other work — the daemon will run it and inject the result into your next turn automatically. Do NOT instruct the user to paste anything; do NOT retry the Bash tool.`,
      `(handoff id: ${id} — record at .devflow-handoff/pending/${id}.json)`,
      'Escape hatch: set DEVFLOW_SKIP_INTERACTIVE_GATE=1 if this is a false positive.',
    ].join(' ');
  }
  return [
    `This command requires the user's shell (${hit.reason}; category: ${hit.category}).`,
    'The Claude Code harness cannot run it directly, and the devflow-watch daemon is not running.',
    `Tell the user verbatim to paste this in the prompt: \`! ${cmd}\``,
    'The `!` prefix runs the command in their shell so the output returns inline.',
    'Do NOT retry the Bash tool. Wait for the user\'s next message containing the output, then continue.',
    `(handoff id: ${id} — record at .devflow-handoff/pending/${id}.json. ` +
      'Tip: run `devflow-watch start` in another terminal to skip the paste step in future.)',
    'Escape hatch: set DEVFLOW_SKIP_INTERACTIVE_GATE=1 if this is a false positive.',
  ].join(' ');
}
```

### Pattern: Existing tests structure (gate-interactive.test.js)

The file uses `describe(...)` blocks per concern. New describe block goes at end:

```js
describe('buildDenyReason — PTY messaging (post-TRD-19-03)', () => {
  test('watcher-live branch mentions "PTY-backed daemon"', () => {
    const { buildDenyReason } = require('./gate-interactive.js');
    const reason = buildDenyReason({
      id: 'h-test',
      cmd: 'gh auth login',
      hit: { reason: 'gh auth login is interactive', category: 'tty' },
      watcherLive: true,
      watcherInfo: { pid: 12345 },
    });
    assert.match(reason, /PTY-backed daemon/);
  });

  test('watcher-absent branch preserves Approach A paste wording', () => {
    const { buildDenyReason } = require('./gate-interactive.js');
    const reason = buildDenyReason({
      id: 'h-test',
      cmd: 'gh auth login',
      hit: { reason: 'gh auth login is interactive', category: 'tty' },
      watcherLive: false,
      watcherInfo: null,
    });
    assert.match(reason, /paste this in the prompt/);
    assert.doesNotMatch(reason, /PTY-backed daemon/);
  });
});
```

</codebase_examples>

<anti_patterns>

- **DO NOT** add new patterns to `INTERACTIVE_PATTERNS`. The list is unchanged at 23 entries (10 tty + 13 shell-flow) per locked decision 7. The existing pattern-count regression test (`test('all 23 patterns present...', () => assert.equal(INTERACTIVE_PATTERNS.length, 23))`) is the canonical check — do not modify it.

- **DO NOT** modify `watcher-allowlist.cjs` deny-list (sudo, su -, rm -rf /, fork bomb, curl|bash, wget|sh). Locked decision 6 explicitly preserves the deny-list.

- **DO NOT** modify the hook's pre-detection logic (`detectInteractive`, `pidFilePath`, `isWatcherLive`, `writePendingRecord`). The change is text-only inside `buildDenyReason` watcher-live branch.

- **DO NOT** drop or restructure the existing watcher-live message — only swap the wording. The "Continue with other work — the daemon will run it" promise is unchanged. The "Do NOT instruct the user to paste anything; do NOT retry" instruction is unchanged. What's new: the explicit mention of PTY backing so Claude understands TTY-required tools (gh, doctl) will work.

- **DO NOT** restructure tests file — keep the existing 24 tests untouched. New tests go in a new describe block at the bottom.

</anti_patterns>

<error_recovery>

- **Test assertion fails on exact phrase** (e.g. "PTY-backed daemon" vs "PTY backed daemon"): fix the impl to match the test. The exact phrase is the contract.
- **Existing 24 tests regress**: most likely cause is accidentally modifying lines outside `buildDenyReason`. Diff carefully.
- **Subprocess test (B-block) fails**: the subprocess test invokes the hook as a child process; changing `buildDenyReason` should not affect the subprocess JSON shape. If it does, the JSON-output path in `main()` (line 252-255) was inadvertently changed.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/objectives/19-pty-handoff-watcher/19-CONTEXT.md
@plugins/devflow/hooks/gate-interactive.js
@plugins/devflow/hooks/gate-interactive.test.js
</context>

<gotchas>

- **Whitespace-sensitive substring match:** the test asserts `/PTY-backed daemon/` (regex with hyphen literal). Make sure the impl uses the exact phrase "PTY-backed daemon" (with hyphen, not space). The reverse — "PTY backed daemon" — is also acceptable English but the test pins the hyphenated form.

- **Approach A wording preservation:** the watcher-absent branch test (`assert.match(reason, /paste this in the prompt/)`) keys on the existing string. Do not paraphrase that branch.

- **Hook entry-point unchanged:** `main()` calls `deny(buildDenyReason(...))`; the structure of `permissionDecisionReason` JSON output should NOT change. Only the string content of the reason changes.

- **Test count regression check:** `gate-interactive.test.js` has a `test('all 23 patterns present', ...)` assertion that locks pattern count. This TRD doesn't add patterns, so that test must continue to pass. If you accidentally bump the count by adding a pattern, the test will fail — undo.

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Test list + RED for buildDenyReason PTY messaging</name>
  <files>plugins/devflow/hooks/gate-interactive.test.js</files>
  <action>
Per CLAUDE.md TDD Playbook habit 2 (test list first), document behavior cases as a checklist comment in a NEW describe block at the bottom of `gate-interactive.test.js`, then write the failing tests.

Behavior list for `buildDenyReason — PTY messaging (post-TRD-19-03)`:

- BD-1: watcher-live branch reason contains "PTY-backed daemon" (exact phrase, hyphenated)
- BD-2: watcher-live branch preserves "Continue with other work" promise
- BD-3: watcher-live branch preserves "Do NOT instruct the user to paste anything" instruction
- BD-4: watcher-live branch preserves "do NOT retry the Bash tool" instruction
- BD-5: watcher-absent branch preserves "paste this in the prompt" wording verbatim
- BD-6: watcher-absent branch does NOT contain "PTY-backed daemon" (mode-disambiguation)
- BD-7: watcher-live branch includes daemon pid number when watcherInfo provided
- BD-8: subprocess invocation with watcher-live env still emits well-formed PreToolUse deny JSON containing the new wording
- BD-9: pattern count regression check still passes (23 patterns) — no incremental scope creep

Steps:

1. Append a new `describe('buildDenyReason — PTY messaging (post-TRD-19-03)', () => { ... })` block to the END of `gate-interactive.test.js`. Do not modify anything above.
2. Add a behavior-list comment block at the top of that describe block.
3. Implement BD-1 first as a failing test (asserts `/PTY-backed daemon/` against current impl which doesn't contain that phrase). Run tests: BD-1 FAILS, all other 24 tests still PASS.
4. Implement BD-5 and BD-6 (these may already pass against current impl since they assert UNCHANGED wording for the watcher-absent branch and the absence of new wording in that branch). Note which ones genuinely RED vs which are GREEN-from-the-start.
5. Add the remaining tests (BD-2 through BD-9) — most will pass against current impl because they assert preserved behavior; BD-1, BD-7 (if pid mention is intentional), BD-8 will fail.
6. Commit RED: `test(19-03): add failing tests for PTY-backed daemon wording in buildDenyReason`.

# CRITICAL: Do not modify any existing test or describe block above. Append-only.
# CRITICAL: Run all tests after each addition; the 24 existing tests must continue to pass throughout.
# PATTERN: Mirror the existing test factory pattern — `const { buildDenyReason } = require('./gate-interactive.js');` per test or hoisted at top.
  </action>
  <verify>
1. `wc -l plugins/devflow/hooks/gate-interactive.test.js` shows growth (≥40 lines added).
2. `node --test plugins/devflow/hooks/gate-interactive.test.js 2>&1 | grep -E "(pass|fail)" | tail -10` shows 24 existing tests still passing + at least 1 new test failing (BD-1).
3. RED commit exists.
  </verify>
  <done>
- New describe block at bottom of test file with 9-item behavior list.
- At least BD-1 fails (RED).
- All 24 existing tests still pass.
- RED commit exists: `test(19-03): add failing tests for PTY-backed daemon wording in buildDenyReason`.
  </done>
  <recovery>
- If existing tests regress: revert the test file with `git checkout plugins/devflow/hooks/gate-interactive.test.js` and retry append-only edits.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Update buildDenyReason watcher-live branch wording (GREEN)</name>
  <files>plugins/devflow/hooks/gate-interactive.js</files>
  <action>
Make BD-1 pass by editing `buildDenyReason` watcher-live branch ONLY. Preserve the watcher-absent branch unchanged.

Edit (lines ~257-276):

```js
function buildDenyReason({ id, cmd, hit, watcherLive, watcherInfo }) {
  if (watcherLive) {
    return [
      `This command needs the user's shell (${hit.reason}; category: ${hit.category}).`,
      `It has been queued to the devflow-watch PTY-backed daemon (pid ${watcherInfo && watcherInfo.pid}). Continue with other work — the daemon will run it via a real PTY and inject the result into your next turn automatically. Do NOT instruct the user to paste anything; do NOT retry the Bash tool.`,
      `(handoff id: ${id} — record at .devflow-handoff/pending/${id}.json)`,
      'Escape hatch: set DEVFLOW_SKIP_INTERACTIVE_GATE=1 if this is a false positive.',
    ].join(' ');
  }
  // watcher-absent branch: UNCHANGED
  return [
    `This command requires the user's shell (${hit.reason}; category: ${hit.category}).`,
    'The Claude Code harness cannot run it directly, and the devflow-watch daemon is not running.',
    `Tell the user verbatim to paste this in the prompt: \`! ${cmd}\``,
    'The `!` prefix runs the command in their shell so the output returns inline.',
    'Do NOT retry the Bash tool. Wait for the user\'s next message containing the output, then continue.',
    `(handoff id: ${id} — record at .devflow-handoff/pending/${id}.json. ` +
      'Tip: run `devflow-watch start` in another terminal to skip the paste step in future.)',
    'Escape hatch: set DEVFLOW_SKIP_INTERACTIVE_GATE=1 if this is a false positive.',
  ].join(' ');
}
```

Changes:
1. `devflow-watch daemon` → `devflow-watch PTY-backed daemon` in line 2.
2. `the daemon will run it and inject` → `the daemon will run it via a real PTY and inject` in line 2.

That's it. No other lines change.

Steps:

1. Edit `plugins/devflow/hooks/gate-interactive.js` lines ~261-262 with the two phrase changes above.
2. Run `node --test plugins/devflow/hooks/gate-interactive.test.js`. ALL 24 existing + 9 new tests must pass. Total ≥33.
3. Run `npm test` from repo root. Total project test count unchanged from 19-02 baseline + 9, all passing.
4. Commit GREEN: `feat(19-03): update gate-interactive deny message to reflect PTY-backed daemon`.

# CRITICAL: Watcher-absent branch must be byte-identical to current impl. Diff carefully.
# CRITICAL: Test BD-9 (pattern count = 23) must still pass.
# PATTERN: Two phrase changes only. Resist the temptation to "improve" wording elsewhere.
  </action>
  <verify>
1. `git diff plugins/devflow/hooks/gate-interactive.js | grep -E "^[+-]"` shows ONLY 2 changed lines (the watcher-live branch line 2 modifications).
2. `node --test plugins/devflow/hooks/gate-interactive.test.js 2>&1 | tail -10` shows ALL tests passing (24 existing + 9 new = 33+).
3. `npm test 2>&1 | tail -5` shows 0 failures vs. baseline + 9.
4. `grep -n "PTY-backed daemon" plugins/devflow/hooks/gate-interactive.js` shows the new phrase appears exactly once (in the watcher-live branch).
5. `grep -n "paste this in the prompt" plugins/devflow/hooks/gate-interactive.js` shows the watcher-absent branch wording is preserved.
  </verify>
  <done>
- Two phrase changes applied to watcher-live branch of `buildDenyReason`.
- All 9 new tests pass.
- All 24 existing tests still pass.
- Total project test count: ≥1893 (1884 from 19-02 baseline + 9), 0 failures.
- GREEN commit exists.
  </done>
  <recovery>
- If watcher-absent test regresses: the watcher-absent branch was inadvertently modified. Revert the file and re-apply only the watcher-live changes.
- If pattern count test regresses: a new `INTERACTIVE_PATTERNS` entry was accidentally added. Diff the patterns array; remove any addition.
- If subprocess test (BD-8) fails on JSON shape: the deny() function or main() entry was inadvertently modified. Diff and revert any changes outside `buildDenyReason`.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none)</lint>
<test>npm test</test>
<build>(none)</build>
</validation_gates>

<verification>
- `gate-interactive.js` `buildDenyReason` watcher-live branch contains "PTY-backed daemon" exact phrase
- `gate-interactive.js` watcher-absent branch unchanged (verified by diff and by test BD-5)
- `INTERACTIVE_PATTERNS` count = 23 (verified by existing pattern-count regression test, unchanged)
- All 24 existing tests pass byte-identical
- 9 new BD-* tests pass
- Subprocess test confirms JSON output shape unchanged
</verification>

<success_criteria>
- [ ] `buildDenyReason` watcher-live branch mentions "PTY-backed daemon"
- [ ] `buildDenyReason` watcher-live branch mentions running "via a real PTY"
- [ ] `buildDenyReason` watcher-absent branch preserved verbatim
- [ ] All 24 existing gate-interactive tests pass
- [ ] 9 new tests pass: BD-1 through BD-9
- [ ] No changes to `INTERACTIVE_PATTERNS`, `CMD_POS`, `detectInteractive`, `isWatcherLive`, `pidFilePath`, `writePendingRecord`, `deny`, `main`
- [ ] No changes to `watcher-allowlist.cjs` deny-list
- [ ] At least 2 atomic commits (RED, GREEN)
</success_criteria>

<output>
After completion, create `.planning/objectives/19-pty-handoff-watcher/19-03-gate-interactive-update-SUMMARY.md` per @/Users/markemerson/.claude/devflow/templates/summary.md. Document:
- Exact text of the updated watcher-live branch
- Confirmation that watcher-absent branch was preserved
- Test count delta (+9)
- Commit hashes for RED, GREEN
</output>
