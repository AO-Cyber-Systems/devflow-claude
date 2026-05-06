---
objective: 20-daemon-polish-bundle
trd: "05"
type: tdd
confidence: medium
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/wrappers/bash.cjs
  - plugins/devflow/devflow/bin/lib/wrappers/fish.cjs
  - plugins/devflow/devflow/bin/lib/wrappers/powershell.cjs
  - plugins/devflow/devflow/bin/lib/wrappers/index.cjs
  - plugins/devflow/devflow/bin/lib/wrappers/bash.test.cjs
  - plugins/devflow/devflow/bin/lib/wrappers/fish.test.cjs
  - plugins/devflow/devflow/bin/lib/wrappers/powershell.test.cjs
  - plugins/devflow/devflow/bin/lib/wrappers/index.test.cjs
  - plugins/devflow/devflow/bin/lib/watcher-shell.cjs
  - plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs
  - plugins/devflow/devflow/templates/config.json
  - docs/handoff-watcher-guide.md
autonomous: true
requirements:
  - DAEMON-CROSS-SHELL
must_haves:
  truths:
    - "lib/wrappers/index.cjs exports getWrapper(shellName) returning per-shell wrapper module"
    - "Each wrapper exports {shellName, shellArgs, wrapCommand, lineSep, initLines} interface"
    - "lib/wrappers/bash.cjs preserves existing bash/zsh wrapping byte-identical (existing 23 watcher-shell.test.cjs tests pass)"
    - "lib/wrappers/fish.cjs generates fish-syntax sentinel-fenced wrapper using `set` (not bash $VAR)"
    - "lib/wrappers/powershell.cjs generates pwsh-syntax wrapper using $LASTEXITCODE (not $?)"
    - "Sentinel pattern __DFW_BEGIN_<id>__/__DFW_DELIM_<id>__/__DFW_END_<id>__:$rc is byte-identical across all wrappers (parser is shell-agnostic)"
    - "ShellSession.spawn() uses getWrapper(shellName) to resolve wrapper; bash/zsh route to bash wrapper; fish routes to fish wrapper; pwsh routes to powershell wrapper"
    - "Tests for fish + powershell wrappers gated on binary availability via t.skip when shell not on PATH (mirrors obj 19 TRD 19-01 node-pty pattern)"
    - "When shell not in {bash, zsh, fish, pwsh, powershell}, ShellSession throws clear UnsupportedShell error"
    - "watcher-shell.cjs splitDispatchOutput remains transport-agnostic — works on bash, fish, pwsh output identically"
    - "All 1911 pre-existing tests pass (allow 2 known failures); existing 23 watcher-shell.test.cjs tests in particular pass byte-identical"
    - "templates/config.json has daemon.cross_shell field (informational/discovery; runtime detects shell automatically)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/wrappers/bash.cjs"
      provides: "Bash/zsh wrapper module — extracted from current watcher-shell.cjs, byte-identical"
      exports: ["shellName", "shellArgs", "wrapCommand", "lineSep", "initLines"]
      min_lines: 50
    - path: "plugins/devflow/devflow/bin/lib/wrappers/fish.cjs"
      provides: "Fish 3.0+ wrapper module"
      exports: ["shellName", "shellArgs", "wrapCommand", "lineSep", "initLines"]
      min_lines: 50
    - path: "plugins/devflow/devflow/bin/lib/wrappers/powershell.cjs"
      provides: "PowerShell 7+ wrapper module"
      exports: ["shellName", "shellArgs", "wrapCommand", "lineSep", "initLines"]
      min_lines: 50
    - path: "plugins/devflow/devflow/bin/lib/wrappers/index.cjs"
      provides: "getWrapper(shellName) factory + UnsupportedShell error class"
      exports: ["getWrapper", "UnsupportedShell", "SUPPORTED_SHELLS"]
      min_lines: 30
    - path: "plugins/devflow/devflow/bin/lib/watcher-shell.cjs"
      provides: "Refactored to use wrappers/index.cjs — bash/zsh path byte-identical; fish/pwsh enabled"
      contains: "wrappers"
    - path: "plugins/devflow/devflow/templates/config.json"
      provides: "daemon.cross_shell flag (informational)"
      contains: "\"cross_shell\""
    - path: "docs/handoff-watcher-guide.md"
      provides: "Cross-shell support subsection added under Configuration"
      contains: "Cross-shell"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/watcher-shell.cjs"
      to: "lib/wrappers/index.cjs"
      via: "ShellSession.spawn() calls getWrapper(this.shell) and uses wrapper.wrapCommand for dispatch"
      pattern: "getWrapper|wrappers"
    - from: "plugins/devflow/devflow/bin/lib/wrappers/index.cjs"
      to: "lib/wrappers/{bash,fish,powershell}.cjs"
      via: "shellName-keyed dispatch in factory"
      pattern: "bash|fish|powershell"
    - from: "plugins/devflow/devflow/bin/lib/wrappers/fish.test.cjs"
      to: "fish binary"
      via: "tests gated on `which fish` || t.skip(...)"
      pattern: "skip.*fish|which fish"
---

<objective>
Add cross-shell support: fish 3.0+ and PowerShell 7+ wrapper modules. Bash/zsh wrapping is extracted from `watcher-shell.cjs` into `lib/wrappers/bash.cjs` for symmetry, byte-identical so existing 23 tests pass unchanged. Factory `getWrapper(shellName)` routes to the per-shell module. Tests for fish + pwsh skip cleanly when the binary isn't on PATH (mirrors obj 19 TRD 19-01 node-pty availability gating).

Purpose: Today only bash/zsh users get the daemon's curated allowlist. Fish + pwsh users hit "shell-flow" failures even when the daemon is running because the sentinel-fenced wrapper is bash-syntax. This TRD makes the daemon shell-agnostic.

Output: 4 new files in `lib/wrappers/` (bash, fish, powershell, index) + refactored `watcher-shell.cjs` (uses wrapper factory) + 4 test files + doc subsection + config flag.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── watcher-shell.cjs                                         ← MODIFY (uses wrapper factory; existing tests pass byte-identical)
├── watcher-shell.test.cjs                                    ← MODIFY (verify bash path byte-identical; minor adjustments if any)
└── wrappers/                                                 ← CREATE (new directory)
    ├── index.cjs                                             ← CREATE (factory + UnsupportedShell error)
    ├── bash.cjs                                              ← CREATE (extracted from watcher-shell.cjs current logic)
    ├── fish.cjs                                              ← CREATE
    ├── powershell.cjs                                        ← CREATE
    ├── index.test.cjs                                        ← CREATE
    ├── bash.test.cjs                                         ← CREATE
    ├── fish.test.cjs                                         ← CREATE (skipped when fish not on PATH)
    └── powershell.test.cjs                                   ← CREATE (skipped when pwsh not on PATH)

plugins/devflow/devflow/templates/config.json                 ← MODIFY (additive — daemon.cross_shell)
docs/handoff-watcher-guide.md                                 ← MODIFY (additive — `### Cross-shell support` section)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: Existing bash wrapping (extract verbatim into wrappers/bash.cjs)

`plugins/devflow/devflow/bin/lib/watcher-shell.cjs:354-374` — current bash wrapping:

```js
const wrappedLines = [
  '__DFW_OUT=$(mktemp 2>/dev/null) __DFW_ERR=$(mktemp 2>/dev/null)',
  `{ ${cmd} ; } > $__DFW_OUT 2> $__DFW_ERR`,
  '__DFW_RC=$?',
  `echo ${begin}`,
  'cat $__DFW_OUT 2>/dev/null',
  `echo ${delim}`,
  'cat $__DFW_ERR 2>/dev/null',
  `echo ${end}:$__DFW_RC`,
  'rm -f $__DFW_OUT $__DFW_ERR',
  '',
];
```

Init lines (lines 187-195 PTY mode + 234-241 pipe mode — both shells):
```js
const initLines = [
  'stty -echo 2>/dev/null',  // PTY mode only
  'set +o monitor 2>/dev/null',
  "PS1=''",
  "PS2=''",
  "PROMPT_COMMAND=''",
  'unset PROMPT_DIRTRIM',
];
```

Extract into `wrappers/bash.cjs`:

```js
// wrappers/bash.cjs
'use strict';
module.exports = {
  shellName: 'bash',
  shellArgs: (interactive) => interactive ? ['-i'] : [],
  lineSep: '\n',  // PTY mode separately uses \r at the watcher-shell layer
  initLines: (mode) => {
    const base = [
      'set +o monitor 2>/dev/null',
      "PS1=''",
      "PS2=''",
      "PROMPT_COMMAND=''",
      'unset PROMPT_DIRTRIM',
    ];
    return mode === 'pty' ? ['stty -echo 2>/dev/null', ...base] : base;
  },
  wrapCommand: (cmd, id) => {
    const begin = `__DFW_BEGIN_${id}__`;
    const delim = `__DFW_DELIM_${id}__`;
    const end = `__DFW_END_${id}__`;
    return [
      '__DFW_OUT=$(mktemp 2>/dev/null) __DFW_ERR=$(mktemp 2>/dev/null)',
      `{ ${cmd} ; } > $__DFW_OUT 2> $__DFW_ERR`,
      '__DFW_RC=$?',
      `echo ${begin}`,
      'cat $__DFW_OUT 2>/dev/null',
      `echo ${delim}`,
      'cat $__DFW_ERR 2>/dev/null',
      `echo ${end}:$__DFW_RC`,
      'rm -f $__DFW_OUT $__DFW_ERR',
      '',
    ];
  },
};
```

### Pattern: fish wrapper

`wrappers/fish.cjs` — fish 3.0+ syntax:

```js
'use strict';
module.exports = {
  shellName: 'fish',
  shellArgs: (interactive) => interactive ? ['-i'] : [],
  lineSep: '\n',
  initLines: (mode) => {
    const base = [
      "function fish_prompt; end",
      "set fish_greeting ''",
    ];
    return mode === 'pty' ? ['stty -echo 2>/dev/null', ...base] : base;
  },
  wrapCommand: (cmd, id) => {
    const begin = `__DFW_BEGIN_${id}__`;
    const delim = `__DFW_DELIM_${id}__`;
    const end = `__DFW_END_${id}__`;
    return [
      'set __DFW_OUT (mktemp 2>/dev/null); set __DFW_ERR (mktemp 2>/dev/null)',
      // fish: `begin; <cmd>; end > $__DFW_OUT 2> $__DFW_ERR`
      `begin; ${cmd}; end > $__DFW_OUT 2> $__DFW_ERR`,
      'set __DFW_RC $status',
      `echo ${begin}`,
      'cat $__DFW_OUT 2>/dev/null',
      `echo ${delim}`,
      'cat $__DFW_ERR 2>/dev/null',
      `echo ${end}:$__DFW_RC`,
      'rm -f $__DFW_OUT $__DFW_ERR',
      '',
    ];
  },
};
```

Key differences from bash:
- `set VAR value` instead of `VAR=value`
- `(mktemp)` instead of `$(mktemp)` for command substitution
- `$status` instead of `$?` for last exit code
- `begin; cmd; end` block for I/O redirection
- `function fish_prompt; end` to silence prompt; `set fish_greeting ''` for greeting

### Pattern: PowerShell wrapper

`wrappers/powershell.cjs` — pwsh 7+ syntax:

```js
'use strict';
module.exports = {
  shellName: 'powershell',
  shellArgs: (interactive) => interactive ? ['-NoLogo', '-NoExit'] : ['-NoLogo'],
  lineSep: '\n',
  initLines: (mode) => {
    return [
      "$Function:prompt = { '' }",
      "$global:ProgressPreference = 'SilentlyContinue'",
      // pwsh on macOS/linux respects PSReadLine prompt; clear it
      "if (Get-Module PSReadLine) { Set-PSReadLineOption -PromptText '' -ContinuationPrompt '' }",
    ];
  },
  wrapCommand: (cmd, id) => {
    const begin = `__DFW_BEGIN_${id}__`;
    const delim = `__DFW_DELIM_${id}__`;
    const end = `__DFW_END_${id}__`;
    return [
      '$dfwOut = [System.IO.Path]::GetTempFileName()',
      '$dfwErr = [System.IO.Path]::GetTempFileName()',
      `& { ${cmd} } *> $dfwOut 2> $dfwErr`,
      '$dfwRc = $LASTEXITCODE; if ($null -eq $dfwRc) { $dfwRc = 0 }',
      `Write-Output "${begin}"`,
      'Get-Content $dfwOut -ErrorAction SilentlyContinue',
      `Write-Output "${delim}"`,
      'Get-Content $dfwErr -ErrorAction SilentlyContinue',
      `Write-Output ("${end}:" + $dfwRc)`,
      'Remove-Item $dfwOut, $dfwErr -Force -ErrorAction SilentlyContinue',
      '',
    ];
  },
};
```

Key differences:
- `$VAR` declared with `$` prefix on assignment AND read
- `[System.IO.Path]::GetTempFileName()` instead of `mktemp`
- `& { cmd } *> outfile` for redirect-everything-but-stderr; separate `2> errfile` for stderr (pwsh stream model is more complex than POSIX — `*>` = streams 1+3+4+5+6 → out; we want stdout to one file, stderr to another)
- `$LASTEXITCODE` instead of `$?` (which is boolean in pwsh)
- `Write-Output` is the canonical "echo" (echo is an alias)

### Pattern: getWrapper factory

`wrappers/index.cjs`:

```js
'use strict';
const path = require('path');

class UnsupportedShell extends Error {
  constructor(shellName) {
    super(`unsupported shell: ${shellName} (supported: bash, zsh, fish, pwsh/powershell)`);
    this.name = 'UnsupportedShell';
    this.code = 'EUNSUPPORTEDSHELL';
  }
}

const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish', 'pwsh', 'powershell'];

function getWrapper(shellPath) {
  // Accept full path OR basename
  const base = path.basename(String(shellPath || '').replace(/\.exe$/i, ''));
  if (base === 'bash' || base === 'zsh') return require('./bash.cjs');
  if (base === 'fish') return require('./fish.cjs');
  if (base === 'pwsh' || base === 'powershell') return require('./powershell.cjs');
  throw new UnsupportedShell(base);
}

module.exports = { getWrapper, UnsupportedShell, SUPPORTED_SHELLS };
```

zsh routes to bash wrapper because zsh is bash-compatible enough for our sentinel pattern (mktemp, $?, $VAR, set +o monitor, PS1) — no zsh-specific wrapper needed. Tests confirm.

### Pattern: ShellSession integration

`plugins/devflow/devflow/bin/lib/watcher-shell.cjs:79-243` — current spawn():

Replace direct bash logic with wrapper-mediated logic:

```js
const { getWrapper } = require('./wrappers/index.cjs');

class ShellSession extends EventEmitter {
  constructor({ shell, env, cwd, interactive } = {}) {
    super();
    this.shell = shell || process.env.SHELL || 'bash';
    this._wrapper = getWrapper(this.shell);  // throws UnsupportedShell early
    // ... rest unchanged
  }

  async spawn() {
    if (this.proc) throw new Error('already spawned');
    const args = this._wrapper.shellArgs(this.interactive);
    if (this.interactive) {
      const pty = _loadPTY();
      this.proc = pty.spawn(this.shell, args, { /* ... */ });
      // ...
      this._writeRaw(this._wrapper.initLines('pty').join('\r') + '\r');
      // ...
    } else {
      this.proc = spawn(this.shell, args, { /* ... */ });
      // ...
      this._writeRaw(this._wrapper.initLines('pipe').join('\n') + '\n');
    }
  }

  dispatch(id, cmd, opts = {}) {
    // ... same up to wrappedLines ...
    const wrappedLines = this._wrapper.wrapCommand(cmd, id);
    const sep = this._isPTY ? '\r' : this._wrapper.lineSep;  // PTY always uses \r per node-pty convention
    this._writeRaw(wrappedLines.join(sep));
    // ... same _tryComplete + return Promise as before
  }
}
```

CRITICAL: `splitDispatchOutput` is shell-agnostic (works on `__DFW_BEGIN_<id>__` line markers regardless of shell). NO changes needed there.

</codebase_examples>

<anti_patterns>

### Anti-pattern: zsh-specific wrapper module

DON'T create `wrappers/zsh.cjs`. zsh's PS1, monitor mode, `$?`, `$VAR`, mktemp, set are all bash-compatible. Route zsh to bash wrapper. Tests verify zsh works through bash wrapper byte-identical.

### Anti-pattern: Different sentinel pattern per shell

DON'T introduce shell-specific sentinel naming. Pattern `__DFW_BEGIN_<id>__` is plain ASCII; all 4 shells emit it via their respective `echo` / `Write-Output` builtins. The parser stays shell-agnostic.

### Anti-pattern: Hard-fail when fish/pwsh not on PATH (in tests)

DON'T:
```js
test('fish wrapper dispatches echo', () => {
  // fails on systems without fish
  const result = spawnSync('fish', [...]);
});
```

DO:
```js
test('fish wrapper dispatches echo', { skip: !fishAvailable() }, () => {
  // ...
});

function fishAvailable() {
  try {
    return spawnSync('fish', ['-c', 'echo ok'], { encoding: 'utf8' }).stdout.trim() === 'ok';
  } catch { return false; }
}
```

CI on macOS may have fish (via brew) but Linux CI may not. Pwsh is rarely pre-installed on either. Skip cleanly when missing — same as obj 19 TRD 19-01's node-pty availability gating.

### Anti-pattern: Falling back to bash wrapper for unknown shell

DON'T silently route nu/csh/tcsh/etc. to bash wrapper — they'd fail in confusing ways at dispatch time. Throw UnsupportedShell early in ShellSession constructor.

### Anti-pattern: Using PTY input separator on pipe mode for fish

`_writeRaw` selects `\r` (PTY) or wrapper.lineSep (`\n` for bash/fish, `\n` for pwsh). Fish doesn't care about CR/LF — both work — but the wrapper's `lineSep: '\n'` is the explicit pipe-mode default.

</anti_patterns>

<error_recovery>

### When fish/pwsh on PATH but unhealthy

`getWrapper('fish')` returns the wrapper module unconditionally — module load doesn't probe binary. Probe happens in `ShellSession.spawn()` when child_process.spawn fails. Existing error path: `_onExit` fires, `dispatch` returns `{status: 'shell_died'}`. Caller (daemon) logs and moves on.

### When user's $SHELL is /bin/csh or some other unsupported shell

Constructor throws `UnsupportedShell`. Daemon's `runForeground` catches the error and exits 3 with clear guidance ("set $SHELL to bash/zsh/fish/pwsh and re-run"). NO silent fallback.

### When PowerShell on macOS lacks PSReadLine module

`if (Get-Module PSReadLine) { ... }` guards. Init lines run safely. (PSReadLine is bundled with pwsh 7+, but defensive coding.)

### When fish init throws on `function fish_prompt; end`

Older fish (<3.0) lacks `function ... end` syntax. Document as "fish 3.0+ required"; module's first dispatch will fail with shell-side syntax error captured in stderr → daemon writes failed done record → user sees the error. Acceptable v1.2 behavior.

### When pwsh prints copyright banner before init lines run

`-NoLogo` flag suppresses. If banner still appears (very old pwsh), the init `_stdoutBuf = ''` reset (line 200 in current watcher-shell.cjs) drains it before first dispatch.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/20-daemon-polish-bundle/20-CONTEXT.md
@.planning/objectives/20-daemon-polish-bundle/20-RESEARCH.md

@plugins/devflow/devflow/bin/lib/watcher-shell.cjs
@plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs
@plugins/devflow/devflow/templates/config.json
@docs/handoff-watcher-guide.md
</context>

<research_context>

### From 20-RESEARCH.md §2 Pattern E — Cross-shell wrapper module shape

Per-shell wrapper exports `{shellName, shellArgs, wrapCommand, lineSep, initLines}`. Bash uses `$VAR`, `mktemp`, `$?`. Fish uses `set VAR`, `(mktemp)`, `$status`. PowerShell uses `$VAR=`, `[Path]::GetTempFileName()`, `$LASTEXITCODE`.

### From 20-RESEARCH.md §4 Common Pitfalls — Cross-shell

- `cd` is a function in fish (not builtin); rc files may be slow
- pwsh exit code via `$LASTEXITCODE`, NOT `$?` (boolean in pwsh)
- fish: `set -l` (local), `-g` (global), `-x` (export); use plain `set` for our temp vars
- Sentinel pattern shell-agnostic — all 4 shells emit `__DFW_BEGIN_<id>__` via echo/Write-Output
- Shell binary detection: `which fish` ≠ fish works; probe via `fish -c "echo test"` exit-0

### From 20-CONTEXT.md §2 Locked Decision 4

Cross-shell scope: fish + PowerShell. Nushell deferred. Bash/zsh path preserved verbatim.

</research_context>

<gotchas>

- **zsh routes to bash wrapper** — zsh is bash-compatible for our sentinel pattern. No zsh wrapper module. Tests confirm `getWrapper('/bin/zsh')` returns bash wrapper.

- **Shell binary basename** — `getWrapper('/usr/local/bin/fish')` and `getWrapper('fish.exe')` both resolve to fish wrapper. `path.basename(...).replace(/\.exe$/i, '')` handles both.

- **`pwsh` and `powershell`** — both Windows PowerShell 5.x (`powershell.exe`) and PowerShell Core 7+ (`pwsh`) accepted. v1.2 targets pwsh 7+; powershell.exe may work but documented as best-effort.

- **PTY line separator override** — wrapper's `lineSep` is the PIPE-mode default. PTY mode in `watcher-shell.cjs` always uses `\r` (PTY input convention). The wrapper interface allows for future per-shell PTY-mode overrides if needed.

- **fish `function ... end` syntax** — fish 3.0+ required. Older fish gets a shell-side syntax error captured via sentinel stderr; daemon writes failed done record.

- **PowerShell `*>` operator** — redirects ALL streams (1=stdout, 2=stderr, 3=warning, 4=verbose, 5=debug, 6=information) to a single file. We use `*> $dfwOut 2> $dfwErr` — `*>` matches all to $dfwOut FIRST, then `2>` overrides stream 2 to $dfwErr. Stream-precedence-respecting.

- **CI test gating** — `fishAvailable()` and `pwshAvailable()` probes at top of test file; tests passed `{ skip: !fishAvailable() }` option per node:test. Mirrors obj 19 node-pty pattern.

- **Wrapper interface stability** — `{shellName, shellArgs, wrapCommand, lineSep, initLines}` is the locked surface. Future polish (e.g. adding `cleanupLines`) MUST extend additively without breaking existing modules.

- **Existing 23 watcher-shell.test.cjs tests** — MUST pass byte-identical after refactor. The bash wrapper's `wrapCommand` output for `cmd='echo hello'` must produce the EXACT same shell input as today's hardcoded code path. Spot-check via deepStrictEqual on a representative case.

</gotchas>

<test_list_first>

Per CLAUDE.md TDD playbook habit 2: explicit checklist BEFORE any test code.

### Group BW — Bash wrapper (extracted byte-identical)

- [ ] **BW-1** wrapCommand('echo hello', 'h-1') returns array starting with `__DFW_OUT=$(mktemp 2>/dev/null)` line
- [ ] **BW-2** wrapCommand contains `{ echo hello ; } > $__DFW_OUT 2> $__DFW_ERR`
- [ ] **BW-3** wrapCommand contains `__DFW_RC=$?`
- [ ] **BW-4** wrapCommand contains `echo __DFW_BEGIN_h-1__`, `echo __DFW_DELIM_h-1__`, `echo __DFW_END_h-1__:$__DFW_RC`
- [ ] **BW-5** initLines('pty') starts with `stty -echo 2>/dev/null`
- [ ] **BW-6** initLines('pipe') does NOT include stty -echo (pipe mode doesn't echo)
- [ ] **BW-7** shellArgs(true) returns ['-i']; shellArgs(false) returns []
- [ ] **BW-8** lineSep is '\n'
- [ ] **BW-9** Output of wrapCommand byte-identical to current watcher-shell.cjs:354-374 logic for the same input

### Group FW — Fish wrapper

- [ ] **FW-1** wrapCommand('echo hello', 'h-1') uses `set __DFW_OUT (mktemp ...)` (fish `set VAR (cmd)` syntax, NOT bash `VAR=$(cmd)`)
- [ ] **FW-2** wrapCommand contains `begin; echo hello; end > $__DFW_OUT 2> $__DFW_ERR`
- [ ] **FW-3** wrapCommand uses `set __DFW_RC $status` (NOT `$?`)
- [ ] **FW-4** wrapCommand sentinel echo lines match `__DFW_BEGIN_h-1__` / `__DFW_DELIM_h-1__` / `__DFW_END_h-1__:$__DFW_RC` (variable interpolation works in fish double-quotes too — bare `$__DFW_RC` is fine outside quotes)
- [ ] **FW-5** initLines includes `function fish_prompt; end` and `set fish_greeting ''`
- [ ] **FW-6** shellArgs(true) returns ['-i']; (false) returns []
- [ ] **FW-7** END-TO-END (gated on `fish` on PATH): spawn fish, dispatch `echo hello`, parse output via splitDispatchOutput, get `stdout='hello\n', exit_code=0, status='done'`
- [ ] **FW-8** END-TO-END (gated): dispatch failed cmd `false`, get exit_code=1, status='failed'
- [ ] **FW-9** END-TO-END (gated): dispatch with stderr (`>&2 echo err`), get stderr captured

### Group PW — PowerShell wrapper

- [ ] **PW-1** wrapCommand uses `$dfwOut = [System.IO.Path]::GetTempFileName()` (NOT mktemp)
- [ ] **PW-2** wrapCommand uses `& { cmd } *> $dfwOut 2> $dfwErr` (pwsh stream redirect)
- [ ] **PW-3** wrapCommand uses `$LASTEXITCODE` (NOT `$?`)
- [ ] **PW-4** wrapCommand uses `Write-Output` for sentinel emission
- [ ] **PW-5** wrapCommand handles `$LASTEXITCODE` being null (set to 0 default)
- [ ] **PW-6** initLines includes `$Function:prompt = { '' }` and `$global:ProgressPreference = 'SilentlyContinue'`
- [ ] **PW-7** shellArgs(true) returns ['-NoLogo', '-NoExit']; (false) returns ['-NoLogo']
- [ ] **PW-8** END-TO-END (gated on `pwsh` on PATH): dispatch `Write-Output hello`, parse, get stdout='hello\n', exit_code=0
- [ ] **PW-9** END-TO-END (gated): dispatch `exit 7`, get exit_code=7, status='failed'

### Group GF — getWrapper factory

- [ ] **GF-1** getWrapper('/bin/bash') returns module with shellName='bash'
- [ ] **GF-2** getWrapper('/bin/zsh') returns SAME module as bash (shellName='bash') — zsh routes through bash
- [ ] **GF-3** getWrapper('/usr/local/bin/fish') returns module with shellName='fish'
- [ ] **GF-4** getWrapper('pwsh') returns module with shellName='powershell'
- [ ] **GF-5** getWrapper('powershell') returns same as pwsh
- [ ] **GF-6** getWrapper('powershell.exe') returns powershell wrapper (basename + .exe stripped)
- [ ] **GF-7** getWrapper('csh') throws UnsupportedShell with code='EUNSUPPORTEDSHELL'
- [ ] **GF-8** getWrapper('') throws UnsupportedShell
- [ ] **GF-9** SUPPORTED_SHELLS export includes ['bash', 'zsh', 'fish', 'pwsh', 'powershell']

### Group W — watcher-shell.cjs integration

- [ ] **W-1** ShellSession({shell: '/bin/bash'}).spawn() works byte-identical to current behavior (existing 23 tests pass)
- [ ] **W-2** ShellSession({shell: '/bin/csh'}) constructor throws UnsupportedShell
- [ ] **W-3** ShellSession({shell: 'fish'}).dispatch() (gated on fish PATH) returns correct stdout/stderr/exit
- [ ] **W-4** ShellSession({shell: 'pwsh'}).dispatch() (gated on pwsh PATH) returns correct stdout/stderr/exit
- [ ] **W-5** splitDispatchOutput parses bash, fish, pwsh output IDENTICALLY (sentinel-based parser is shell-agnostic)

### Group EX — Export surface

- [ ] **EX-1** lib/wrappers/index.cjs module.exports is exactly `{ getWrapper, UnsupportedShell, SUPPORTED_SHELLS }` (deepStrictEqual)
- [ ] **EX-2** lib/wrappers/bash.cjs module.exports keys are exactly `['shellName', 'shellArgs', 'wrapCommand', 'lineSep', 'initLines']` (deepStrictEqual on Object.keys.sort())
- [ ] **EX-3** Same for fish.cjs
- [ ] **EX-4** Same for powershell.cjs

### Group D — Documentation

- [ ] **D-1** docs/handoff-watcher-guide.md contains `### Cross-shell support` heading
- [ ] **D-2** Section lists supported shells (bash, zsh, fish 3.0+, pwsh 7+) + nushell as deferred
- [ ] **D-3** Section documents auto-detection from `$SHELL` + override via `--shell` flag

</test_list_first>

<feature>
  <name>Per-shell wrapper modules + factory</name>
  <files>plugins/devflow/devflow/bin/lib/wrappers/*.cjs, plugins/devflow/devflow/bin/lib/wrappers/*.test.cjs</files>
  <behavior>
    Four wrapper modules (bash, fish, powershell, index). Each shell-specific module emits sentinel-fenced wrapper lines using its native syntax. Factory routes shell basename to the right module. UnsupportedShell error for unknown shells. End-to-end tests dispatch a command via the wrapper + verify sentinel parsing works byte-identical across shells.

    Cases:
    - bash wrapper: `cmd > $tmp` style; matches current code byte-identical
    - fish wrapper: `set VAR (cmd)` style; `begin; cmd; end > out`; `$status`
    - pwsh wrapper: `$VAR = [System.IO.Path]::GetTempFileName()`; `& { cmd } *> out`; `$LASTEXITCODE`
    - factory: zsh→bash module, pwsh+powershell→same module, csh/nu/etc→UnsupportedShell
  </behavior>
  <implementation>
    4 .cjs files in lib/wrappers/. ~50 LOC each. Each test file has unit tests (Group BW/FW/PW) for syntax patterns + end-to-end tests gated on binary availability. Factory in index.cjs ~30 LOC. Tests use fishAvailable() / pwshAvailable() probes at file top.
  </implementation>
</feature>

<feature>
  <name>watcher-shell.cjs refactor — wrapper-mediated</name>
  <files>plugins/devflow/devflow/bin/lib/watcher-shell.cjs, plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs</files>
  <behavior>
    ShellSession constructor calls getWrapper(this.shell) — throws early on unsupported. spawn() uses wrapper.shellArgs + wrapper.initLines. dispatch() uses wrapper.wrapCommand + wrapper.lineSep. splitDispatchOutput unchanged (shell-agnostic).

    Cases:
    - Existing 23 watcher-shell.test.cjs tests pass byte-identical (bash wrapper produces same output as old hardcoded code)
    - Adding shell: 'csh' → constructor throws UnsupportedShell
    - Adding shell: 'fish' (gated) → dispatch works
    - Adding shell: 'pwsh' (gated) → dispatch works
  </behavior>
  <implementation>
    Replace lines 79-243 (constructor + spawn) and 354-374 (dispatch wrappedLines). Constructor calls getWrapper. spawn uses wrapper.shellArgs(this.interactive) and wrapper.initLines('pty'|'pipe'). dispatch uses wrapper.wrapCommand(cmd, id). PTY mode separator is `\r`; pipe mode uses wrapper.lineSep.

    Existing tests should pass byte-identical. Verify with deepStrictEqual on a representative wrappedLines case (BW-9 test).
  </implementation>
</feature>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Write failing tests for all 4 wrapper modules + factory + watcher-shell integration</name>
  <files>plugins/devflow/devflow/bin/lib/wrappers/bash.test.cjs, plugins/devflow/devflow/bin/lib/wrappers/fish.test.cjs, plugins/devflow/devflow/bin/lib/wrappers/powershell.test.cjs, plugins/devflow/devflow/bin/lib/wrappers/index.test.cjs, plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs</files>
  <action>
Per CLAUDE.md TDD playbook (habits 1-4): tests first, fixtures first.

Write ALL test cases listed in `<test_list_first>` (Groups BW=9, FW=9, PW=9, GF=9, W=5, EX=4, D=3 grep-verified) = 45 tests across 5 test files.

Test file distribution:
- `wrappers/bash.test.cjs` — Group BW (9) + EX-2 (1) = 10 tests
- `wrappers/fish.test.cjs` — Group FW (9; FW-7..9 gated on fish PATH) + EX-3 (1) = 10 tests
- `wrappers/powershell.test.cjs` — Group PW (9; PW-8..9 gated on pwsh PATH) + EX-4 (1) = 10 tests
- `wrappers/index.test.cjs` — Group GF (9) + EX-1 (1) = 10 tests
- `watcher-shell.test.cjs` ADDITIVE — Group W (5 tests; W-3, W-4 gated). Existing 23 tests untouched.

Add helper at top of fish/pwsh test files:

```js
const { spawnSync } = require('child_process');
function shellAvailable(name, probeArgs = ['-c', 'echo __DFW_PROBE__']) {
  try {
    const r = spawnSync(name, probeArgs, { encoding: 'utf8', timeout: 3000 });
    return r.status === 0 && r.stdout.includes('__DFW_PROBE__');
  } catch { return false; }
}
const fishAvailable = shellAvailable('fish');
const pwshAvailable = shellAvailable('pwsh') || shellAvailable('powershell');
```

Tests gated as: `test('FW-7 fish dispatches echo end-to-end', { skip: !fishAvailable }, () => { ... })`.

For BW-9 (byte-identical extraction guard): verify the new bash wrapper's wrapCommand produces the EXACT same array as the current hardcoded code path. Use deepStrictEqual on the array against a hardcoded expected array derived from the current watcher-shell.cjs:354-374 logic. This test FAILS at RED because wrappers/bash.cjs doesn't exist; passes at GREEN because the extracted code is byte-identical.

# CRITICAL: tests for wrappers must NOT spawn subprocesses for the unit-level cases (BW-1..6, FW-1..6, PW-1..7, GF-1..9). Only the end-to-end cases (FW-7..9, PW-8..9, W-3..4) spawn shells. Fast unit tests + slow gated e2e tests.
# GOTCHA: deepStrictEqual on Object.keys(module.exports).sort() for EX tests — wrappers export 5 keys; index exports 3.
# PATTERN: mirror obj 19 TRD 19-01 binary-availability gating via { skip: !available } option.

Run tests; verify ~45 new failures + pre-existing 1911 still pass. Failures coherent: "Cannot find module './wrappers/bash.cjs'" for ~40 unit tests; ShellSession constructor failures for W-2/W-3/W-4.

Commit:
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "test(20-05): add failing tests for cross-shell wrappers (bash, fish, pwsh) + factory + watcher-shell integration" \
  --files plugins/devflow/devflow/bin/lib/wrappers/bash.test.cjs \
  plugins/devflow/devflow/bin/lib/wrappers/fish.test.cjs \
  plugins/devflow/devflow/bin/lib/wrappers/powershell.test.cjs \
  plugins/devflow/devflow/bin/lib/wrappers/index.test.cjs \
  plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs
```
  </action>
  <verify>
`npm test` shows ~45 new failures (some skipped if fish/pwsh not available) + 1911 pre-existing pass. Failure messages: "Cannot find module" for missing wrapper files; "UnsupportedShell" missing for factory tests.
  </verify>
  <done>
~45 failing tests across 5 files. Pre-existing 1911 unchanged. Single RED commit. Skip count higher when fish/pwsh missing — note in commit message.
  </done>
  <recovery>
If unit tests fail for wrong reason → fix test, NOT impl (no impl yet). If shell-availability probe is flaky → bump probe timeout (3s→5s). If existing watcher-shell.test.cjs tests fail → revert any change to that file beyond the 5 ADDITIVE tests.
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Implement 4 wrapper modules + refactor watcher-shell.cjs + config + doc</name>
  <files>plugins/devflow/devflow/bin/lib/wrappers/bash.cjs, plugins/devflow/devflow/bin/lib/wrappers/fish.cjs, plugins/devflow/devflow/bin/lib/wrappers/powershell.cjs, plugins/devflow/devflow/bin/lib/wrappers/index.cjs, plugins/devflow/devflow/bin/lib/watcher-shell.cjs, plugins/devflow/devflow/templates/config.json, docs/handoff-watcher-guide.md</files>
  <action>
Per CLAUDE.md TDD playbook habit 3: minimal code to make all RED tests pass.

Implementation order (outside-in per playbook habit 5):

1. **wrappers/bash.cjs (~50 LOC):** see embedded_context Pattern A. Byte-identical to current watcher-shell.cjs:354-374 logic.

2. **wrappers/fish.cjs (~50 LOC):** see embedded_context Pattern B. Fish 3.0+ syntax.

3. **wrappers/powershell.cjs (~60 LOC):** see embedded_context Pattern C. PowerShell 7+ syntax.

4. **wrappers/index.cjs (~30 LOC):** see embedded_context Pattern D. getWrapper + UnsupportedShell + SUPPORTED_SHELLS.

5. **watcher-shell.cjs refactor (additive at top of file; replace lines 79-243 spawn() and 354-374 dispatch's wrappedLines):**

```js
const { getWrapper, UnsupportedShell } = require('./wrappers/index.cjs');

class ShellSession extends EventEmitter {
  constructor({ shell, env, cwd, interactive } = {}) {
    super();
    this.shell = shell || process.env.SHELL || 'bash';
    this.env = env || process.env;
    this.cwd = cwd || process.cwd();
    this.interactive = interactive !== false;
    this._wrapper = getWrapper(this.shell);  // throws UnsupportedShell early
    this.proc = null;
    this._isPTY = false;
    // ... rest of constructor unchanged
  }

  async spawn() {
    if (this.proc) throw new Error('already spawned');
    const shellArgs = this._wrapper.shellArgs(this.interactive);

    if (this.interactive) {
      const pty = _loadPTY();
      this.proc = pty.spawn(this.shell, shellArgs, {
        name: 'xterm-color', cols: 80, rows: 24, cwd: this.cwd, env: this.env,
      });
      this._isPTY = true;
      this.proc.onData((chunk) => {
        this._stdoutBuf += chunk;
        this._emitExtData(chunk);
        this._tryComplete();
      });
      this.proc.onExit(() => this._onExit());
      // initLines for PTY mode (includes stty -echo for bash; powershell doesn't need it)
      this._writeRaw(this._wrapper.initLines('pty').join('\r') + '\r');
      await new Promise((r) => setTimeout(r, 100));
      this._stdoutBuf = '';
      this._stderrBuf = '';
    } else {
      this.proc = spawn(this.shell, shellArgs, {
        env: this.env, cwd: this.cwd, stdio: ['pipe', 'pipe', 'pipe'],
      });
      this._isPTY = false;
      this.proc.stdout.setEncoding('utf8');
      this.proc.stderr.setEncoding('utf8');
      this.proc.stdout.on('data', (chunk) => {
        this._stdoutBuf += chunk;
        this._emitExtData(chunk);
        this._tryComplete();
      });
      this.proc.stderr.on('data', (chunk) => {
        this._stderrBuf += chunk;
        this._emitExtData(chunk);
        this._tryComplete();
      });
      this.proc.on('exit', () => this._onExit());
      this.proc.on('error', () => this._onExit());
      this._writeRaw(this._wrapper.initLines('pipe').join(this._wrapper.lineSep) + this._wrapper.lineSep);
    }
  }

  dispatch(id, cmd, opts = {}) {
    if (!this.isAlive()) return Promise.reject(new ShellSessionClosed());
    if (this._activeDispatch) return Promise.reject(new Error('dispatch in progress'));
    const timeoutMs = typeof opts.timeout_ms === 'number' ? opts.timeout_ms : 600000;
    const begin = `__DFW_BEGIN_${id}__`;
    const delim = `__DFW_DELIM_${id}__`;
    const end = `__DFW_END_${id}__`;
    const endRx = new RegExp(`${escapeRegex(end)}:(-?\\d+)`);

    return new Promise((resolve) => {
      const d = { id, begin, delim, end, endRx, resolve, settled: false, timer: null };
      d.timer = setTimeout(() => { /* unchanged timeout handler */ }, timeoutMs);
      this._activeDispatch = d;

      // 20-05: per-shell wrapper generates wrappedLines
      const wrappedLines = this._wrapper.wrapCommand(cmd, id);
      const sep = this._isPTY ? '\r' : this._wrapper.lineSep;
      this._writeRaw(wrappedLines.join(sep));
      this._tryComplete();
    });
  }
}

// ... rest unchanged (kill, _onExit, _tryComplete, splitDispatchOutput, escapeRegex, trimAfter)
module.exports = { ShellSession, ShellSessionClosed, splitDispatchOutput, UnsupportedShell };
```

Add UnsupportedShell to module.exports for caller convenience (callers can `instanceof` check).

6. **templates/config.json (additive):**

Add to daemon block:
```json
"cross_shell": []
```

Empty array = auto-detect from $SHELL. Future use: explicit override list `["fish", "pwsh"]` could enable per-project shell preference. v1.2 always auto-detects; flag is informational placeholder.

7. **docs/handoff-watcher-guide.md (additive):**

Add `### Cross-shell support` subsection under `## Configuration`:

```markdown
### Cross-shell support

The daemon dispatches commands through the user's interactive shell. v1.2
supports four shells:

| Shell | Status | Notes |
|---|---|---|
| bash | First-class | Default; tested; preserved byte-identical from v1.1 |
| zsh | First-class | Routes through bash wrapper (zsh is bash-compatible for our sentinel pattern) |
| fish 3.0+ | Supported | Native fish syntax wrapper (`set VAR (cmd)`, `$status`) |
| pwsh 7+ | Supported | PowerShell Core; native pwsh syntax (`$LASTEXITCODE`, `*>`) |
| nushell | Deferred | Not in v1.2 (low usage; revisit in v1.3+) |
| Windows powershell.exe (5.x) | Best-effort | Routes through pwsh wrapper; not in CI matrix |

Auto-detection: the daemon reads `$SHELL` at startup; basename determines the
wrapper. Override with `devflow-watch start --shell fish` (or `pwsh` etc.).

Unsupported shells throw `UnsupportedShell` at session construction time.
The CLI prints the error and exits with guidance to set `$SHELL` to a
supported value.

The sentinel-fenced output protocol is identical across all shells:

```
__DFW_BEGIN_<id>__
<stdout content>
__DFW_DELIM_<id>__
<stderr content>
__DFW_END_<id>__:<exit_code>
```

The parser in `lib/watcher-shell.cjs` is shell-agnostic — only the wrapper's
`wrapCommand` differs per shell.

**Fish 3.0+ requirement:** The wrapper uses `function fish_prompt; end` syntax;
fish < 3.0 will fail with shell-side syntax errors captured in the done
record's stderr.

**pwsh availability:** Not pre-installed on macOS or Linux. Install via `brew
install --cask powershell` (macOS) or distro package manager (Linux).
```

Run `npm test` — all ~45 new tests should pass (some skipped if fish/pwsh not on test machine), pre-existing 1911 still pass.

Commit:
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "feat(20-05): add cross-shell support (fish + pwsh wrappers, factory, watcher-shell refactor)" \
  --files plugins/devflow/devflow/bin/lib/wrappers/bash.cjs \
  plugins/devflow/devflow/bin/lib/wrappers/fish.cjs \
  plugins/devflow/devflow/bin/lib/wrappers/powershell.cjs \
  plugins/devflow/devflow/bin/lib/wrappers/index.cjs \
  plugins/devflow/devflow/bin/lib/watcher-shell.cjs \
  plugins/devflow/devflow/templates/config.json \
  docs/handoff-watcher-guide.md
```

# CRITICAL: existing 23 watcher-shell.test.cjs tests MUST pass byte-identical. The bash wrapper extraction is the riskiest part — verify with BW-9 (deepStrictEqual on representative wrappedLines case).
# GOTCHA: PTY mode line separator is always `\r` regardless of wrapper.lineSep (which is the pipe-mode default). watcher-shell.cjs must select `\r` for PTY, wrapper.lineSep for pipe.
# PATTERN: shell-agnostic sentinel parser in splitDispatchOutput unchanged — only wrapper's wrapCommand and initLines differ per shell.
  </action>
  <verify>
`npm test` shows pre-existing 1911 + ~45 new tests pass (with some FW/PW skips if fish/pwsh not on PATH). Existing 23 watcher-shell.test.cjs tests pass byte-identical. `node -e "const w = require('./plugins/devflow/devflow/bin/lib/wrappers/index.cjs'); console.log(JSON.stringify(Object.keys(w).sort()))"` returns `["SUPPORTED_SHELLS","UnsupportedShell","getWrapper"]`. `grep -c "Cross-shell support" docs/handoff-watcher-guide.md` returns 1+.
  </verify>
  <done>
4 wrapper modules in lib/wrappers/. watcher-shell.cjs refactored to use factory. Existing 23 tests pass byte-identical. ~45 new tests pass (with fish/pwsh skips when binaries missing). Config + doc updated. Single GREEN commit.
  </done>
  <recovery>
If existing watcher-shell.test.cjs tests fail → bash wrapper extraction not byte-identical; diff carefully. If fish/pwsh tests pass when they should skip → probe function broken; check spawnSync return shape. If splitDispatchOutput fails on fish/pwsh output → that's a real bug; sentinel pattern should be transport-agnostic, but maybe a stray ANSI escape from pwsh init lines is interfering. Add `_stdoutBuf = ''` reset after init lines drain (mirror obj 19 TRD 19-01's stty -echo + drain pattern).
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>

- [ ] All ~45 new tests pass (BW=9, FW=9, PW=9, GF=9, W=5, EX=4 — D verified via grep)
- [ ] Pre-existing 1911 tests pass UNCHANGED — including 23 watcher-shell.test.cjs tests byte-identical after bash extraction
- [ ] BW-9 deepStrictEqual confirms bash wrapper extraction is byte-identical
- [ ] Fish/pwsh tests skip cleanly when binaries not on PATH (no false failures)
- [ ] Factory routes basenames correctly: bash/zsh→bash; pwsh/powershell→powershell; fish→fish; csh/etc.→throws
- [ ] watcher-shell.cjs uses wrappers/index.cjs; no per-shell logic in watcher-shell.cjs body
- [ ] templates/config.json has daemon.cross_shell field
- [ ] handoff-watcher-guide.md has `### Cross-shell support` subsection

</verification>

<success_criteria>

- [ ] **SC-1** Bash/zsh path byte-identical (existing 23 tests pass byte-identical)
- [ ] **SC-2** Fish wrapper dispatches commands correctly (gated tests pass when fish present)
- [ ] **SC-3** PowerShell wrapper dispatches commands correctly (gated tests pass when pwsh present)
- [ ] **SC-4** Factory routes shell basenames correctly + throws on unsupported
- [ ] **SC-5** Sentinel-fenced parser remains shell-agnostic (splitDispatchOutput unchanged)
- [ ] **SC-6** All 1911 pre-existing tests pass byte-identical
- [ ] **SC-7** Documentation covers all 4 supported shells + nushell deferred + auto-detect

</success_criteria>

<output>
After completion, create `.planning/objectives/20-daemon-polish-bundle/20-05-cross-shell-SUMMARY.md` per the standard SUMMARY template.
</output>
