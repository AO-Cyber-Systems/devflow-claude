# Objective 19 — PTY support for handoff watcher (CONTEXT)

**Milestone:** v1.2 (objective 10 within v1.2; numbered 19 globally)
**Branch:** `feature/v1.2-obj-10-pty-watcher`
**Tracks:** Original v1.2 headline objective per ROADMAP §"Milestone v1.2" item 10 + preserved-as-scope §"PTY support for the handoff watcher"

## 1. Why This Objective Exists

v1.1's `devflow-watch` daemon dispatches commands via `child_process.spawn` with stdio pipes. That works for shell-flow tools (`mise`, `nvm`, `conda`, `direnv`) which only need an interactive shell environment, but **fails for genuinely TTY-required commands**:

- `doctl auth init` — reports `Error: Unable to read DigitalOcean access token: unknown terminal`
- `gh auth login` — refuses to launch the device-code flow without a TTY
- `gcloud auth login` — same
- `gpg --decrypt` (passphrase) — silently hangs

The fix: swap `child_process.spawn` for `node-pty` in `plugins/devflow/devflow/bin/lib/watcher-shell.cjs` for the `interactive: true` path. With a real PTY, `isatty(stdin)` succeeds and the TTY-required tools proceed past their TTY check.

The sentinel-based output capture protocol stays unchanged — PTY only changes the dispatch backend, not the output-parsing protocol.

## 2. Locked Decisions (NON-NEGOTIABLE)

These come from the planning context. Do not revisit:

1. **node-pty is a native dependency — ship prebuilt binaries OR document build requirement.** node-pty publishes prebuilt binaries for major platforms (`prebuild-install` mechanism). v1.2 takes the prebuilt-first path: add `node-pty` as a dependency to `package.json`; document the macOS/Linux/Windows build requirement in `handoff-watcher-guide.md` for environments where prebuild-install fails. No custom binary shipping; no vendored fork.

2. **macOS-first; Linux out of box; Windows best-effort with `winpty-agent`.** Test/CI matrix is darwin + linux; Windows is documented-only. `winpty-agent` is bundled by node-pty automatically on Windows installs.

3. **Sentinel-based output capture stays — PTY just changes dispatch backend, not output protocol.** The `__DFW_BEGIN_<id>__` / `__DFW_DELIM_<id>__` / `__DFW_END_<id>__:$rc` fence pattern is preserved verbatim in the PTY path. PTY merges stdout+stderr by design (PTYs have a single output stream); the in-shell wrapping (`> $__DFW_OUT 2> $__DFW_ERR` then cat-back) still gives separate stdout/stderr capture.

4. **`interactive: false` non-PTY mode preserved for tests.** Existing `watcher-shell.test.cjs` runs with `interactive: false` (uses `child_process.spawn`, no node-pty). New PTY tests run alongside, gated by node-pty availability. CI never depends on a real PTY. Production daemon defaults to `interactive: true` (PTY path); test path stays on stdio pipes.

5. **Token-passing schema extension (NEW):** Pending record gains an optional `inputs: { secrets: [...] }` array. Each secret is `{ prompt_match: <regex string>, value_source: "stash" | "env" | "keyring", value_ref: <string> }`. Daemon answers prompts from the user's keyring or one-shot stash. v1.2 ships `stash` (in-memory, per-handoff) and `env` (read from named env var) backends; `keyring` is documented as future work and rejected at validation time with a clear error.

6. **Deny-list still blocks `sudo` / `su -` / `rm -rf /` / fork bombs / `curl|bash`.** PTY does NOT relax the deny-list. The whole point is closing the TTY gap for the *curated* allowlist; elevation/destructive paths remain rejected at the daemon allowlist layer.

7. **gate-interactive routes to daemon when watcher live; deny-list curated patterns unchanged.** The hook already routes to the daemon via the `watcherLive` branch. The change is the deny-message wording: it now reflects "PTY-backed daemon" so Claude understands TTY-required commands are no longer in the "Approach A paste" fallback when the watcher runs. The PATTERN list is unchanged.

8. **Mock auth servers for e2e (NEW):** End-to-end tests for the PTY path use **test-mode auth backends**:
   - `gh` test backend: `gh auth login --hostname <local-test-server>` against a local mock GitHub responding to OAuth device-code endpoints
   - `doctl --access-token <fake>` flag (already documented as `skipIf` form — use the negative form: PTY path with `doctl auth init` against a local mock DO endpoint via `DIGITALOCEAN_API_URL`)
   - cassette-style fixtures committed under `__fixtures__/handoff-cassettes/` capturing the exact byte stream a real auth server emits (recorded once, replayed in CI)

9. **Sub-task 1 (PTY backend swap) is the largest TRD by file change.** It owns `watcher-shell.cjs` exclusively. Other TRDs depend on it for runtime behaviour, but disjoint file ownership makes 19-02 / 19-03 / 19-05 parallel-safe.

## 3. Out of Scope

Strictly deferred. Per ROADMAP §"Out of scope for v1.2":

- **OS desktop notifications when a command starts/completes** — separate v1.2 objective ("Daemon polish bundle" / objective 11 within v1.2).
- **Auto-launch of watcher via launchd/systemd** — same bundle.
- **Multi-project watching from single daemon** — same bundle.
- **Status-line indicator for watcher pending count** — same bundle.
- **Cross-shell support (fish/nushell/PowerShell)** — same bundle.
- **System-wide service replacement of the daemon** — v1.3+.
- **Daemon Go rewrite** — v1.3+.
- **Web/UI dashboard** — Hub Flutter app territory.
- **Keyring secret backend** — schema slot reserved (rejected at runtime in v1.2); implementation deferred to v1.3.

## 4. Discretion Areas

The planner picks within these guard rails:

- **Exact node-pty version** — pick the latest stable from npm at planning time; pin in `package.json` (no caret). Document the version in 19-RESEARCH.md.
- **PTY dimensions** — default to 80×24 (POSIX standard); make them configurable via daemon-startup options (`--pty-cols`, `--pty-rows`) but ship sensible defaults. Tests assert default dims.
- **Output buffer accumulation in PTY** — the existing sentinel parser is line-oriented; PTY output may arrive in larger chunks (terminal escape sequences, ANSI codes). The PTY path may need to strip ANSI escapes before sentinel matching OR rely on the fact that bash-emitted sentinels are plain ASCII on dedicated lines. Planner picks: strip-ANSI is the safer bet (one-line dependency: `strip-ansi` is in node ecosystem; can also be done in ~10 LOC). Document the choice in TRD 19-01.
- **Where the schema validation lives for `inputs.secrets`** — `lib/handoff.cjs` (existing record-shape module) vs. `lib/watcher-state.cjs` (existing makeDoneRecord). Planner picks the one that reads cleanest. Both are acceptable.
- **Where the secret-stash storage lives** — in-memory only for v1.2 (per locked decision 5: stash is per-handoff). Storage struct lives in the daemon process; never persisted to disk. Planner picks the data structure (Map keyed by handoff id is the obvious answer).
- **Mock auth server implementation** — vanilla Node `http.createServer` is fine; no Express dependency. Cassettes recorded once via real auth flows the user runs locally. Planner picks the cassette format (JSON-Lines is conventional; flat JSON is also acceptable).

## 5. Test Posture

`kind: plugin, work: feature` per defaults table. **TDD strict.** Per CLAUDE.md TDD Playbook:

1. **TDD TRDs default.** Sub-tasks 1, 2, 3, 5 are `type: tdd`. Sub-task 4 (handoff-watcher-guide.md doc update) is `type: standard` (pure documentation; no logic to test).
2. **Test list first.** Each TDD TRD includes an explicit checklist of behavior cases — happy path, edge cases, failure modes — before any test code.
3. **One test at a time** through RED → GREEN → REFACTOR.
4. **Fixture generators, not LLM-generated test data.** Build factory functions or fixture builders. Mock auth servers use cassettes recorded once and committed.
5. **Outside-in for the PTY pipeline:** start at the highest user-observable layer (e2e against the real `devflow-watch.cjs` CLI binary spawning `gh auth login` against the mock server) and drill in (unit tests on `ShellSession.dispatchPTY` + `validateInputsSchema` + `gate-interactive` regex updates).
6. **No multitenancy assertion** — devflow-claude is single-tenant (no per-user data segregation in the plugin runtime). Per v1.1 obj 18 CONTEXT precedent.

## 6. Surfaces Touched

| File | Concern | TRD candidate |
|---|---|---|
| `package.json` | Add `node-pty` dependency (locked decision 1) | 19-01 |
| `plugins/devflow/devflow/bin/lib/watcher-shell.cjs` | Replace `child_process.spawn` with `node-pty` for `interactive: true`; preserve `interactive: false` path verbatim | 19-01 |
| `plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs` | Add PTY-mode unit tests gated on node-pty availability; preserve all 11 existing tests | 19-01 |
| `plugins/devflow/devflow/bin/lib/handoff.cjs` | Add `inputs.secrets` schema validation to `cmdHandoffCreate` + new `validateInputsSchema(inputs)` helper | 19-02 |
| `plugins/devflow/devflow/bin/lib/handoff.test.cjs` (new) OR existing test file | Tests for above | 19-02 |
| `plugins/devflow/devflow/bin/lib/watcher-daemon.cjs` | Wire `inputs.secrets` resolution into `processOnce` — answer prompts via PTY write when daemon detects regex match | 19-02 |
| `plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs` | Tests for above | 19-02 |
| `plugins/devflow/hooks/gate-interactive.js` | Update `buildDenyReason` watcher-live branch to mention PTY backing; deny-list patterns unchanged | 19-03 |
| `plugins/devflow/hooks/gate-interactive.test.js` | Tests for updated deny-message wording | 19-03 |
| `docs/handoff-watcher-guide.md` | Add PTY caveats section + platform notes (macOS/Linux/Windows) + node-pty install troubleshooting | 19-04 |
| `plugins/devflow/devflow/references/handoff-watcher-guide.md` | Mirror the docs/ file as a reference doc accessible to agents OR add an `@docs/handoff-watcher-guide.md` reference (planner picks) | 19-04 |
| `plugins/devflow/devflow/bin/handoff-e2e.test.cjs` | Add PTY-path e2e tests against mock gh + mock doctl servers | 19-05 |
| `plugins/devflow/devflow/bin/__fixtures__/mock-auth-servers.cjs` (new) | Mock `http.createServer` for gh + doctl | 19-05 |
| `plugins/devflow/devflow/bin/__fixtures__/handoff-cassettes/*.json` | Recorded auth-flow cassettes (committed) | 19-05 |

## 7. Quality Gate (verification target)

- node-pty integrated; `interactive: true` path uses PTY (stub: `require('node-pty').spawn(...)` reachable).
- Token-passing schema extended; `inputs.secrets[].value_source` of `stash` | `env` accepted; `keyring` rejected with "v1.3+" error.
- gate-interactive deny-message updates reflect "PTY-backed daemon" in watcher-live branch.
- Handoff guide updated with PTY caveats + platform notes (macOS/Linux/Windows).
- Mock auth e2e tests pass without real credentials (no live `gh auth login` against api.github.com; no live `doctl auth init` against api.digitalocean.com).
- All 1852 pre-existing tests still pass (CONTEXT-internal contract: zero regressions on the non-PTY path).
- New test count: ≥20 across 4 TDD TRDs.

## 8. Coordination

- Per memory `feedback_planner_proto_conflict`: orchestrator should resequence the wave on shared file co-modification regardless of `depends_on=[]`. Sub-task 1 (PTY backend) is the only TRD touching `watcher-shell.cjs`. Sub-task 2 (token-passing) touches `handoff.cjs` + `watcher-daemon.cjs` (daemon needs PTY path to be live for the prompt-answer wiring to be exercisable). Sub-task 3 (gate-interactive) touches `gate-interactive.js` only. Sub-task 4 (doc) is fully disjoint. Sub-task 5 (mock auth e2e) needs the PTY path live and the daemon prompt-answer logic live.

  **Wave structure:**
  - Wave 1: 19-01 (PTY backend), 19-04 (doc — doc-only, no runtime dep)
  - Wave 2: 19-02 (token-passing — needs PTY runtime live), 19-03 (gate-interactive update — text change but coheres with PTY-live wording)
  - Wave 3: 19-05 (mock auth e2e — depends on 19-01 + 19-02 runtime)

- Per memory `feedback_executor_smaller_commits`: each TRD's executor should commit at smaller natural-breakpoint increments (RED → GREEN → REFACTOR per feature; per-test addition for e2e cassettes). The executor for 19-05 in particular should commit each cassette + its replay test as a separate atomic commit.

- Per memory `feedback_005_preserve_all_functionality`: 19-01 must run all 11 existing `watcher-shell.test.cjs` tests with `interactive: false` and assert they still pass byte-identical to today. PTY-path tests are additive.

## 9. References

- `docs/PROPOSAL-handoff-watcher.md` — original v1.1 proposal noting node-pty trade-off (line 145, 153)
- `plugins/devflow/devflow/bin/lib/watcher-shell.cjs` — current `child_process.spawn` implementation with sentinel protocol (lines 70-101)
- `plugins/devflow/hooks/gate-interactive.js` — current TTY-interactive pattern list + deny-reason builder (`buildDenyReason`, lines 257-276)
- `docs/handoff-watcher-guide.md` — current user-facing docs (no PTY section yet)
- `plugins/devflow/devflow/bin/handoff-e2e.test.cjs` — current e2e suite (4 tests, all using benign builtins; no auth flows)
- ROADMAP §"Original v1.2 plan — preserved as scope reference" — lines 686-705

---
*Created: 2026-05-04 (planner via /df:plan-objective for v1.2 obj 10)*
