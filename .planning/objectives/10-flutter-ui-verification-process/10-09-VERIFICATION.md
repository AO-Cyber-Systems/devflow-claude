---
objective: 10-flutter-ui-verification-process
trd: 10-09
verified: 2026-05-25T00:00:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# TRD 10-09 Verification Report — `df-tools flutter-ui setup`

**Verified:** 2026-05-25
**Scope:** TRD 10-09 only (parent objective 10 verified 2026-05-25 at 8/8 — see `10-VERIFICATION.md`)
**Status:** passed

## Goal Achievement

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `flutter-ui setup` subcommand reachable without "Unknown command" | ✓ VERIFIED | `df-tools.cjs:419-430` routes `case 'flutter-ui'`; smoke run starts with `{` not `Unknown` (`head -c 1` → `{`) |
| 2  | Missing-tool detection + empty plan when all present | ✓ VERIFIED | `flutter-ui-setup.cjs:40-51` preserves input order; tests Case 1 (`test.cjs:123-130`) + Case 2 (`test.cjs:132-136`) pass; smoke run reported `missing:["chromedriver"]` correctly |
| 3  | Platform-aware plan: darwin `brew install`, linux `apt-get install` | ✓ VERIFIED | `flutter-ui-setup.cjs:77-88` branches on `process.platform`; Cases 3/3b/4 (`test.cjs:142-161`) pass; chromedriver special-cased with `--cask` per gotcha |
| 4  | Daemon live → handoff records valid against `validateInputsSchema` | ✓ VERIFIED | `flutter-ui-setup.cjs:107-132` writes `{id, cmd, cwd, status, created_at}` records; Case 5 (`test.cjs:211-243`) confirms `validateInputsSchema({secrets:[]}).ok === true` for each emitted record |
| 5  | Daemon down → prints commands to stdout + exits non-zero | ✓ VERIFIED | `flutter-ui-setup.cjs:204-216` emits per-line commands then `process.exit(plan.length ? 1 : 0)`; Case 6 (`test.cjs:373-388`) asserts exit=1 + install-line regex; smoke run also exited 1 |
| 6  | Chains into `flutter-ui-bootstrap.checkBootstrapState` + forwards result | ✓ VERIFIED | `flutter-ui-setup.cjs:229-233` calls `checkBootstrapState({projectDir: cwd})` and merges into `bootstrap` field; Case 7 (`test.cjs:285-313`) does `deepStrictEqual(payload.bootstrap, expectedBootstrap)` |
| 7  | Idempotency: marker + tools present → `status:'already-set-up'` + zero handoff records | ✓ VERIFIED | `flutter-ui-setup.cjs:173-190` short-circuits before any dispatch; Case 8 (`test.cjs:249-283`) asserts `"status":"already-set-up"` in stdout AND `records.length === 0` |
| 8  | `--print-only` forces print path regardless of daemon state | ✓ VERIFIED | `flutter-ui-setup.cjs:204` `if (flags.print_only || !daemonLive)`; Case 9 (`test.cjs:315-347`) confirms live pid file + `--print-only` writes zero handoff records |
| 9  | `--auto` flag suppresses prompts (forward-compat no-op) | ✓ VERIFIED | `flutter-ui-setup.cjs:256-262` parses flag, echo'd in output; Case 10 (`test.cjs:349-371`) closes stdin, asserts no timeout + `payload.flags.auto === true` |
| 10 | Hand-built fixtures only — no LLM-generated test data, no property-based, no Gherkin | ✓ VERIFIED | `test.cjs:40-117` fixtures take explicit object/boolean specs; grep for `fast-check\|jsverify\|cucumber\|.feature\|Math.random` returns zero hits; IDs asserted via regex not literal |

**Score:** 10/10 truths verified

### Test execution

```
node --test plugins/devflow/devflow/bin/lib/flutter-ui-setup.test.cjs
ℹ tests 12  ℹ pass 12  ℹ fail 0  ℹ duration_ms 3121
```

### Module exports check

```
> Object.keys(require('./flutter-ui-setup.cjs'))
[ 'detectMissingTools', 'buildInstallPlan', 'dispatchInstalls', 'cmdFlutterUISetup' ]
```

All four exports per artifact spec present.

### Key links

| From | To | Via | Status |
|------|----|----|--------|
| `df-tools.cjs:186` | `flutter-ui-setup.cjs` | `require('./lib/flutter-ui-setup.cjs')` + `cmdFlutterUISetup(...)` at `:425` | WIRED |
| `flutter-ui-setup.cjs:176,229` | `flutter-ui-bootstrap.cjs` | lazy `require('./flutter-ui-bootstrap.cjs')` + `checkBootstrapState(...)` | WIRED |
| `flutter-ui-setup.cjs:194-196` | `watcher-state.cjs` | `readPidFile()` + `isWatcherLive()` | WIRED |
| `flutter-ui-setup.cjs` → handoff schema | `handoff.cjs` | records shaped to pass `validateInputsSchema({secrets:[]})`; runtime validation lives in tests (Case 5) | WIRED (schema-shape contract) |

## Requirements Coverage

TRD 10-09 declares `requirements: []` — purely additive adoption ergonomics with no formal requirement IDs from `REQUIREMENTS.md`. No coverage gaps to track.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Notes |
|------|------|---------|----------|-------|
| `flutter-ui-setup.cjs` | 33 | `TODO note below if/when we extend` (in JSDoc) | ℹ Info | Doc-comment forward-looking note about extending `detectMissingTools` to multi-dir PATH; not a stub — `detectMissingAcrossPath` at `:241-254` already implements the multi-PATH probe used by `cmdFlutterUISetup`. |
| `flutter-ui-setup.cjs` | 73 | `return []` | ℹ Info (not a stub) | Canonical empty-input early-return inside `buildInstallPlan`; correct branch, not a placeholder. |

No `FIXME`, no `placeholder`, no LLM-generated test data, no property-based libraries (`fast-check`/`jsverify`), no Gherkin/`.feature` files. Zero blockers, zero warnings.

## Summary

TRD 10-09 delivers the one-command adoption promise. `df-tools flutter-ui setup` detects missing tools across the live `$PATH`, emits a platform-aware install plan, dispatches via handoff when the daemon is live (with `validateInputsSchema`-compatible record shape) or prints copy-pasteable commands with a non-zero exit when it isn't, chains transparently into the existing bootstrap detector, and short-circuits idempotently on already-set-up projects. Test suite (12/12 passing, hand-built fixtures throughout) covers every must_have plus the chromedriver `--cask` gotcha. Implementation is tight (~280 LOC), correctly scoped (no auto-install side effects, no Windows path, no marker writes), and the `--print-only`/`--auto` flags behave per spec. Ready to ship.

---

## Post-Verification Correction (2026-05-25 dogfood)

A live dogfood run against `eden-libs/eden-ui-flutter/` revealed that the TRD originally listed `gh` (GitHub CLI) instead of `maestro` in `DEFAULT_REQUIRED_TOOLS`. The planner pattern-matched on devflow's existing handoff-watcher docs (where `gh auth login` is the canonical interactive-auth example) and substituted `gh` where `maestro` belonged for Flutter UI verification adoption.

**Root cause:** Original planner prompt named `jq` as the example tool but did not enumerate the canonical 3-tool list (jq + chromedriver + maestro). All 12 original tests passed against the wrong list because hand-built fixtures use whatever tool names the test says, masking the substantive error.

**Fix (3 commits on this branch after initial verification):**
- `45262be` `test(10-09): swap gh→maestro, expect curl installer (RED)` — added Cases 1c, 3c, 4c; rewrote Cases 1/2/3/4 to use maestro; 4 failing tests at RED
- `15b229c` `feat(10-09): swap gh→maestro, add curl installer for maestro (GREEN)` — `DEFAULT_REQUIRED_TOOLS = ['jq', 'maestro', 'chromedriver']`; `formatInstallCommand` special-cases maestro to `curl -fsSL "https://get.maestro.dev" | bash` on both darwin + linux (maestro has no brew formula or apt package); `cmdFlutterUISetup` now sources from `DEFAULT_REQUIRED_TOOLS` instead of a duplicated literal
- (this docs commit follows) — TRD truths/test_list + this correction note

**Re-verification:** 15/15 tests pass after fix. Live dogfood from `eden-libs/eden-ui-flutter/` now correctly emits:
```
$ node ~/.../df-tools.cjs flutter-ui setup --print-only
curl -fsSL "https://get.maestro.dev" | bash
brew install --cask chromedriver
EXIT=1
```

**Workflow impediment flagged:** The planner-prompt-to-TRD path should enumerate the canonical tool list explicitly when scope mentions specific tools; relying on the planner to infer from one example is a foot-gun. Hand-built test fixtures do NOT catch this class of error because the fixture parameter IS the source of truth being tested.

`status:` remains `passed` (10/10 must-haves verified against the CORRECTED implementation). The original 10/10 verification was structurally correct against the TRD-as-written but the TRD itself encoded the wrong tool list.

---

_Verified: 2026-05-25_
_Corrected: 2026-05-25 (dogfood)_
_Verifier: Claude (verifier)_
