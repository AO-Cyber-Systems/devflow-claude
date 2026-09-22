# SDD ledger — plan: /Users/markemerson/Source/devflow-claude-ui-spec/docs/IMPLEMENTATION-PLAN-ui-oracle-loop.md
Spec: /Users/markemerson/Source/devflow-claude-ui-spec/docs/PROPOSAL-ui-oracle-loop.md
Scope this run: Wave 0 tasks W0-1..W0-8 (W0-9 user action; W0-10 after).
Code worktree: /Users/markemerson/Source/devflow-claude-w0 branch df/w0-honest-gate from origin/main 48fa894.
Baseline `npm test` on 48fa894: 2958 tests, 10 FAIL pre-existing (handoff-e2e.test.cjs timeouts ×~8, awareness.test.cjs scanPeer ×2) — not in wave-0 files. Implementers run targeted files; the pre-existing 10 are not theirs.

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding | Ruling |
|---|---|---|---|
| W0-1 ↔ W0-2 | helpers.pluginVersion(): string ← validate health | consistent | — |
| W0-1 ↔ W0-6 | pluginVersion ← ui-metrics engine_version | consistent | — |
| W0-1 self | plan test calls scoreRun(results, {gate:'advisory'}); real signature scoreRun(results, opts={flakeBudget,unjudgedPolicy}) | opts key mismatch is harmless (unknown key ignored) | Ruling: implementer uses real opts; test asserts only engine_version/schema_version — cost if wrong: none |
| W0-2 self | test stubs pluginVersion + temp home | cmdValidateHealth(cwd, options, raw) has no injection seam | Ruling: add optional options.pluginVersionFn and options.homeDir for tests; CLI passes none — cost if wrong: a slightly wider options object |
| W0-3 self | "keep Tier 1/2 tests green" but existing Tier-3 tests assert `resolved`/`repo-manifests` | conflicts with new contract | Ruling: rewrite Tier-3 tests to expect `absent` + `reason:'unscoped-candidates'` + candidates[] (spec §12.2: objective-scoped only) — cost if wrong: a consumer relying on repo-manifests resolution must pass a path |
| W0-4 self | packageDir threaded through the writer | writer path already exists (scaffold) | — |
| W0-6 self | "reuse changelog test helper" — mkRepo lives inside hooks/changelog-on-tag.test.js, not exported | Ruling: implementer writes a 15-line local mkTmpRepo in ui-metrics.test.cjs (pattern exists in dup-detect.test.cjs) — cost: small duplication |
| W0-7 | eden-biz repo, Dart generator; `yaml` dev dep | separate repo, separate worktree | dispatch after W0-6; not blocked |
| W0-8 | tag push + pin PRs = side effects outside worktree | STOP-class (push/publish) | Ruling: implementer prepares everything locally and reports; controller asks the user before any tag push / PR push |

## Execution
Ruling: W0-7 (eden-biz) dispatched in parallel with W0-1 (devflow) — different repos/worktrees, no shared files; the "no parallel implementers" rule guards file conflicts — cost if wrong: coordination load only.
Ruling (W0-7): YAML is the sole source; manifests gain `evidence_dir` in YAML to reproduce `screenshot_path`; generator emits both `state_id` and `id` — cost if wrong: one extra key per state.
W0-1: dispatched (BASE 48fa894, devflow-claude-w0)
W0-7: dispatched (BASE 456387d4e, eden-biz-w0 branch fix/705-ui-eval-one-source)
W0-1: implemented 8b5bd88; review Approved, ⚠️ skip-branch unstamped. Ruling: the resolution-skip output IS evidence (verifier routes on it) → stamp it; --help usage is not — cost if wrong: two extra keys on a usage object.
W0-1: fix round 1/5 dispatched (skip-branch stamp + version-less plugin.json guard)
W0-1: fix round 1/5 (2 addressed, 0 open; commits 8b5bd88..5a80ef7)
W0-1: minor (deferred): pluginVersion() fallback branches (.plugin-version marker, '0.0.0', version-less json) have no automated test
W0-1: complete (commits 48fa894..5a80ef7, review clean)
W0-2: dispatched (BASE 5a80ef7)
W0-2: implemented b83809b; DONE_WITH_CONCERNS (stdout line before JSON). Ruling: non-raw output is JSON that skills parse → no extra stdout line; the `engine` JSON row is the report (my brief's "human-readable line" was wrong) — cost if wrong: none, the JSON row carries the same data.
W0-2: fix round 0 (pre-review correction) dispatched
W0-2: review Needs fixes — Critical: E020/W021 dead from the mirror path (pluginVersion() collapses to the mirror marker; __dirname walk lands in /Users). Verified live: mirror 2.5.0 / installed 2.6.0 / main 2.7.1.
Ruling: installed version from ~/.claude/plugins/installed_plugins.json (+ its installPath plugin.json); main from the marketplace clone ~/.claude/plugins/marketplaces/aocyber (git, best-effort fetch, 5s); engine row = {running, mirror, installed, main}; pluginVersion() unchanged = "running engine" for evidence stamps — cost if wrong: health reads two more JSON files; W021 depends on the marketplace clone existing.
NOTE for W0-9/plan: the brief's "plugin-vs-main" model was wrong about what the mirror can see; spec §12.2 wording still holds.
W0-2: fix round 1/5 dispatched (mirror-aware sources + e2e mirror-path test)
W0-2: fix round 1 landed 03fa7d5; scoped re-review dispatched
W0-7: implemented de87eb7c8, 22d46a914 (DONE_WITH_CONCERNS: 9 invalid YAML files fixed, .planning copies synced, billing_activity deleted); review dispatched
MAP: docs/ui-oracle-loop.progress.json + docs/progress-map/build.py in devflow-claude-ui-spec (commit c3662f3); artifact https://claude.ai/code/artifact/bbbdf002-7cbd-4771-bfbf-20228e00bb4a — update JSON + rebuild + republish on every ledger change
W0-2: fix round 1/5 (2 critical addressed, 0 open; commits edfd931..03fa7d5)
W0-2: minor (deferred): defaultMainVersionFn calls marketplaceCheckout() without threading options.homeDir (asymmetry with installedPluginFn)
W0-2: complete (commits 5a80ef7..03fa7d5, review clean)
W0-3: dispatched (BASE 03fa7d5)
W0-7: review Approved; Important: portal-support-error lost a judge bullet (yaml never had it). Ruling: restore the bullet in the YAML (source of truth) and regenerate — cost if wrong: none.
W0-7: minor (deferred): per-state `route` copied verbatim can hold non-path prose (portal_cms_honesty) — captureWeb.js validator would reject if ever pointed at it
W0-7: fix round 1/5 dispatched (restore bullet + malformed-yaml message)
W0-7: fix round 1/5 (2 addressed, 0 open; commits 22d46a914..c28f9bda6)
W0-7: minor (deferred): generator returns on first malformed yaml (fail-fast) and catches all exceptions, not only YamlException
W0-7: complete (commits 456387d4e..c28f9bda6, review clean) — eden-biz branch fix/705-ui-eval-one-source, NOT pushed (user gate at W0-8)
SCOPE (Mark, 2026-09-18): Trades React is NOT kept long term — donor only; retires at 100% port coverage. Ruling applied: W0-5 drops the React column; W4 drops the Playwright-React adapter (spec/plan/map/explainer updated, commit 11c035b in devflow-claude-ui-spec; W0-5 brief regenerated).
W0-3: implemented 06ee9cc; review dispatched
W0-3: review Needs fixes — Important ×2: no test for tier-3 YAML→absent; no test for the non-raw unscoped-candidates text. Minor (deferred): classifyUIEvalOutcome todo string ignores `reason`/`candidates` (function has no production caller).
W0-3: fix round 1/5 dispatched (two tests)
W0-3: fix round 1/5 (2 addressed, 0 open; commits 06ee9cc..782eadf)
W0-3: complete (commits 03fa7d5..782eadf, review clean)
W0-4: dispatched (BASE 782eadf)
Ruling (W0-4): fix BOTH bootstrap modules (flutter-ui-eval-bootstrap.cjs AND flutter-ui-bootstrap.cjs, the executor's REQ-10-07 gate) via one shared resolveFlutterPackageDir helper; marker stays at repo-root .planning/ — cost if wrong: one extra small module.
W0-4: implemented 1cea48a; review Needs fixes — two consumers still root-only (flutter-ui-setup detectFlutterRepo; executor.md flutter commands run from cwd). Ruling: close both in this task — cost if wrong: executor prose change touches three sections.
W0-4: fix round 1/5 dispatched
W0-4: fix round 1/5 (2 addressed, 1 open — executor $OLDPWD evidence paths unsound under persistent cwd; commits 1cea48a..01d1f70)
Ruling (W0-4 r2): REPO_ROOT captured once, absolute evidence paths, absolute mv sources; TRD test paths are package-relative (sentence in executor.md + planner.md) — cost if wrong: none, strictly more explicit.
W0-4: fix round 2/5 dispatched
W0-4: fix round 2/5 (1 addressed, 0 open; commits 01d1f70..19b7f48)
W0-4: minor (deferred): executor.md relies on the agent carrying $REPO_ROOT/$PACKAGE_DIR values across Bash calls (shell vars don't persist) — pre-existing pattern for $BOOTSTRAP etc.
W0-4: complete (commits 782eadf..19b7f48, review clean)
W0-5: dispatched (BASE 19b7f48)
W0-5: implemented db9c2a2; concerns: PROPOSAL link resolves only once docs/ui-oracle-loop-design merges (Ruling: merge that branch alongside; note in PR body); design-review.md:55 same stale line → fix round 0 dispatched
W0-5: review Approved with 1 Important (changelog bullet omitted design-review.md); fix round 1/5 → 9f8d7e5. Ruling: the fix is one changelog line whose diff the controller read in full and matches the finding verbatim; scoped re-review skipped — cost if wrong: a changelog wording nit.
W0-5: minor (deferred): verifier.md Step 8a generic "npm run dev" readiness probe sits under the new Flutter never-flutter-run caveat — clarity pass later
W0-5: complete (commits 19b7f48..9f8d7e5, review clean)
W0-6: dispatched (BASE 9f8d7e5)
W0-6: implemented 2b16873; review dispatched
W0-8 prep: tag v2.1.0 created LOCALLY on eden-ui-flutter at e719691 (origin/main, 59 commits / 153 files since v2.0.0; EdenButton fix merged) — NOT pushed; flutter test on the tagged commit running in worktree eden-ui-flutter-v210 (bg bttbo8ny5)
W0-6: complete (commits 9f8d7e5..2b16873, review clean); minors (deferred): unknown `ui metrics` subcommand exits 0 via output(); `--paths` with no value throws
W0-1..W0-6 all complete on df/w0-honest-gate (48fa894..2b16873). Final whole-branch review next.
FINAL REVIEW (opus): Ready after fixes — Critical: executor bare `cd` leaks cwd (subshell); Important ×5: setup_task template root-relative; ui-evaluator.md tier-3 prose; health.md engine row; networked unit test; CHANGELOG shape + missing Added. Fix wave dispatched (final-fix-brief.md), one dispatch.
W0-8 prep: flutter test on v2.1.0 (e719691) → see below
[exited with code 0]
W0-8 prep: flutter test on v2.1.0 (e719691) locally: 4601 pass, 1 FAIL — test/dev_app/chat_screen_test.dart "renders at iPhone-narrow (390pt) without overflow" (RenderFlex +8.5px, eden_chat_bubble.dart:78). CI on e719691 is GREEN → environment-dependent (font metrics). Ruling: tag stands on the CI-validated commit; propose an eden-ui-flutter issue for the machine-dependent overflow test — cost if wrong: a real 8.5px overflow ships (already on main either way).
FINAL FIX WAVE: 5 commits 2b16873..4abe179; scoped re-review: all addressed, no new breakage; 316/316 focused tests. Branch df/w0-honest-gate READY (48fa894..4abe179).
Follow-ups filed by the fix wave (report): verifier.md Step 8 / design-review.md root-cwd + tier-3 glob; non-raw text for other skip resolutions; $OBJECTIVE_DIR not named in the persistence rule; analyze-baseline.txt not namespaced per task.
STOP-CLASS ACTIONS awaiting Mark: push tag v2.1.0; push 3 branches + open PRs; then pin bumps; plugin upgrade (W0-9); eden-ui-flutter issue for the machine-dependent chat_screen overflow test.
W0-8 (approved by Mark): tag v2.1.0 PUSHED (e719691); PRs opened: devflow-claude #80 (docs) + #81 (wave-0 code), eden-biz #776 (#705). Issues #705/#753/#585 commented. NOT approved yet: pin-bump PRs, chat_screen overflow issue.
POST-REVIEW (/code-review, Mark asked): #81 → 1 MEDIUM (tier-2 yaml vs tier-3 ordering → absent instead of invalid) + 2 LOW; fixed 976f8aa/f0436aa/03ef227 + changelog 3ebdf28, re-review clean, PUSHED. #776 → 5 findings (billing_activity wrongly deleted — 182-06 gate target; tenant:null; lost loading bullet; em-dash drift into anchors; mirrors not written by main()); fixed 9007600fd..130f055bd, PUSHED; differential re-review running.
Spec §21 retrospective added (f6b3e21, PR #80): prose→executable checks; runtime-model briefs; /code-review mandatory pre-merge. W1★ dogfood is the wave-2 go/no-go.
Ruling: controller committed the one-line changelog amendment (3ebdf28) directly — cost if wrong: none.
#776: differential re-review clean (regen → empty status; anchors vs 456387d4e: only the 9 pre-existing paraphrase/case drifts remain). Ruling: keep YAML wording (one-source), DISCLOSE the 9 states on the PR for review — cost if wrong: a judge anchor reads slightly differently. Both PRs merge-ready pending Mark.
2026-09-21 "address our findings": #81 follow-ups F1-F4 landed (ce89af6..258c83e) + controller fix acc0e5f (maestro paths absolute — F3 had introduced a relative-path-in-subshell regression); issues #82 (analyze-baseline per task) #83 (non-raw text for other skips) filed. #80: CodeQL xss-through-dom on the map page fixed by DOM-node rewrite (e082e8e); plan gains 1b-07 executor shell harness + binding runtime-model/code-review conventions (ccfcbc5). #776: merged origin/main (6b98959b9), gates green on the merged tree, pushed, CLEAN. Memory: code-review-before-merge reinforced; new agent-prose-needs-executable-check.
Ruling: controller committed acc0e5f directly (2-line path fix in prose the follow-ups agent had just touched) — cost if wrong: none.
2026-09-21 "go for it" (Mark approved merges, anchors ruling, pin bumps, issue, 2.8.0):
- #80 MERGED 53d2863; #81 re-merged main (a30b197), gates 355/355, CI green → MERGED 8af51d5.
- Release PR #84 (chore/release-2.8.0: version bumps + changelog section) open, CI pending; tag v2.8.0 goes on its merge commit.
- #776: re-merged main twice (6b98959b9, 6bc5e5631), gates green each time, CI pending (bg bgxgg0j2w).
- CORRECTION: eden-ui-flutter nav-disclosure branch MERGED upstream 2026-09-11 as PR #26 (d3b94ad); aodex has pinned main merge commit 8480eb91 since 2026-09-10. My "unmerged tip" claim was stale. W1★ dogfood: no rebase step; conform the merged nav.
- Pin bumps in flight: eden-biz chore/pin-eden-ui-flutter-v2.1.0 (#753, incl. 696-10 capture regen); aodex chore/pin-eden-ui-flutter-v2.1.0 (8480eb91→v2.1.0, 66 commits, Flutter floor 3.27.0).
- eden-ui-flutter issue #32 filed (machine-dependent chat_screen overflow test).
- Anchors on #776: keep YAML wording (Mark's "go for it" = accept my ruling).
- Release: PR #84 MERGED ea3aebd; tag v2.8.0 pushed. W0-9 (plugin update) = Mark's action.
- W0-10: baselines committed via worktrees → aodex PR #610 (fix/feat 0.86, quick 15, 13 human-verify rows/last 3, 74 keyword-proxy UI issues), eden-biz PR #786 (0.46, 7, 15, 62).
- NOTE: I briefly detached the MAIN aodex/eden-biz checkouts to origin/main for a read-only metric, then restored their branches; eden-biz's checkout silently stayed on its branch (dirty tree) → the 0.35 figure was wrong. Worktrees only, always.
- aodex pin PR #611 open (8480eb91→v2.1.0, analyze clean, 206 targeted pass, no golden churn). CI watch bg brc25kmym (611/610/786).
- eden-biz pin PR #787 open: EdenButton labels legible in 696-10 captures (fix confirmed); TRUE delta 139 commits (#753 said 82 — old pin was an off-branch cherry-pick); 2 test breaks in custom_fields_editor_test (EdenSelect rewrite) → fix round dispatched (assert behaviour, not widget type). Ruling: a dependency bump does not land red.
- #776 MERGED 845e19501; #705 CLOSED (merged+verified). aodex #610 baseline MERGED. eden-biz #786 re-merged main (49ce430fd), CI pending. #787: EdenSelect test rewrite exposed a REAL bug (select case never setState'd — pick never re-rendered) — fixed 5897e1c0b, 441/441; CI pending. aodex #611 CI pending. Watcher bg bq2zfki67.
- Mark: "merge main into the branch and carefully address conflicts" — done for #786 (49ce430fd, 0 conflicts), #787 (4e6c2a92a, 0 conflicts; composed gates: pub get, regen, freshness+visual-gate+custom_fields+696-10 capture = 24/24, analyze 0 err/173 warn = main), #611 (300452a4, 0 conflicts; 206/206, analyze 97 infos = pre-existing). Final Stage-A check (base == main tip) happens right before each merge. Watcher bg btuwqikm6.
- #786 MERGED. CI on the merged pin heads: #787 test job FAIL (7: investorportal delete-affordance ×3, SAFE convert modal, kb_visibility_select, reporting edit-affordance ×2); #611 Test job FAIL (9: memory_form_sheet ×3, workbooks redirect ×2, conversation_context_route ×3, project_details_route; + a 6.2px RenderFlex overflow). Real bump regressions (library rewrites), not merge issues. Two opus investigators dispatched: classify (a) test-detail / (b) app relied on old internals / (c) library regression → fix a/b, BLOCK on c. Ruling: no red merges; a (c) finding goes to eden-ui-flutter, not an app workaround.
- #787: all 7 = class (a) (tests typed DropdownButtonFormField); rewritten to drive EdenSelect trigger+overlay (59302cc63..3757be4ee), 553/553, no app code change; CI pending (bg b3d2krx0i). Now checking eden-biz SelectionArea exposure.
- #611: memory_form ×3 = (a) fixed e9577075. Six routing tests = class (c) LIBRARY REGRESSION: v2.1.0 5e76279 wraps EdenDesktopLayout.body in SelectionArea by default; aodex body = StatefulShellRoute Navigator; flutter#151536 asserts on deep-link into nested route — would fire in PROD. Ruling: aodex opts out (`selectableBody: false`) at the call site; library issue eden-ui-flutter #33 filed; eden-biz exposure check dispatched — cost if wrong: desktop body text selection lost in aodex until the library default changes.
- #611 fixed: (a) e9577075 + (c) opt-out fe053fc6; 156/156; CI pending (bg bagg19fz4). eden-biz NOT exposed (flat shell route table; 296 pass; nested-route differential asserts) → no change; evidence posted on eden-ui-flutter #33. Follow-ups noted: eden-biz double SelectionArea (biz_shell.dart:470), stale KbVisibilitySelect._revertNonce comment.
- #787: CI green on 3757be4ee, but main moved 20 → re-merged (8060e7738, 0 conflicts), composed gates 567/567 + analyze 173 warn, pushed; CI pending (bg bv0hxhwf8). #611: remaining CI failure = SDK-03 no-drift guard (app_shell.dart digest) — re-justification dispatched (not a regression).
- #787 MERGED a2ab8c9ae (green, base==main); #753 CLOSED (merged+verified). #611: SDK-03 re-justified a42d5b7d; CI pending (bg b5rv3en3e).
