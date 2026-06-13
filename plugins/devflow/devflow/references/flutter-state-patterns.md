# Flutter State-Pattern Catalog

Regex catalog mapping abstract state names (`loading`, `data`, `error`, `empty`, `initial`) to JavaScript-compatible regex patterns per state-management library. **Consumed by the verifier (TRD 10-05)** to grep Flutter widget test files for state coverage. Also referenced by the planner (TRD 10-03) when detecting `state_management:` from project imports.

## How it's used

When a TRD has `type: ui` + `stack: flutter`, each entry under `must_haves.artifacts[*]` declares:

- `state_management: riverpod | bloc | setState | other`
- `states: [loading, data, error, ...]`
- `tests.widget: <path>`

The verifier:

1. Loads the regex set matching the TRD's `state_management:` value.
2. For each state name in `states[]`, finds the corresponding regex entries (`covers: [<state>]`) in the catalog.
3. Runs the regex(es) against the contents of the `tests.widget` file.
4. Emits coverage result per state:
   - **HIGH confidence + regex match** — state coverage VERIFIED (blocker if missing).
   - **MEDIUM confidence + regex match** — state coverage PROBABLE (advisory — manual review recommended).
   - **LOW confidence + regex match** — state coverage POSSIBLE (advisory; high false-positive risk).
   - **No regex match** — state coverage MISSING (blocker for HIGH-confidence patterns; advisory for MEDIUM/LOW-only states).

Empty-state coverage is always advisory (empty is a UX concept, not a library primitive).

## Confidence model

| Tag | Verifier behavior |
|-----|-------------------|
| HIGH | Blocker on miss (state was declared but no matching pattern in widget test → verification FAIL) |
| MEDIUM | Advisory on miss; PASS with note "manual review recommended" |
| LOW | Advisory always; surface in VERIFICATION.md `notes:` not `gaps:` |

## Riverpod (`state_management: riverpod`)

Library: `flutter_riverpod`. Primary primitives: `AsyncValue`, `.when()`, `.maybeWhen()`, `.whenData()`, sealed-class pattern matching (Dart 3+).

```yaml
riverpod:
  - name: when_all_three
    pattern: '\.when\s*\(\s*loading\s*:\s*[^,]+,\s*data\s*:\s*[^,]+,\s*error\s*:'
    covers: [loading, data, error]
    confidence: HIGH
    note: "Canonical AsyncValue.when usage. Distinctive enough that false positives are rare."

  - name: when_skipped_loading
    pattern: '\.when\s*\(\s*data\s*:\s*[^,]+,\s*error\s*:\s*[^,]+,\s*skipLoadingOnReload\s*:\s*true'
    covers: [data, error]
    confidence: HIGH
    note: "AsyncValue.when variant that omits loading branch via skipLoadingOnReload flag."

  - name: maybe_when
    pattern: '\.maybeWhen\s*\('
    covers: []
    confidence: LOW
    note: "Ambiguous — does not declare which branches are present. Verifier should mark artifact PARTIAL and require manual review of branches when this is the only match."

  - name: pattern_match_switch_error
    pattern: 'switch\s*\([^)]+\)\s*\{[^}]*AsyncValue\s*\([^)]*hasError\s*:\s*true'
    covers: [error]
    confidence: MEDIUM
    note: "Dart 3 sealed-class pattern matching. Growing idiom 2026; less prevalent than .when()."

  - name: pattern_match_switch_loading
    pattern: 'switch\s*\([^)]+\)\s*\{[^}]*AsyncValue\s*\([^)]*isLoading\s*:\s*true'
    covers: [loading]
    confidence: MEDIUM
    note: "Pattern-match variant for loading state via isLoading boolean."

  - name: when_data_only
    pattern: '\.whenData\s*\('
    covers: [data]
    confidence: HIGH
    note: "AsyncValue.whenData — short-circuit for data-only handling. Distinctive."

  - name: empty_state_pattern
    pattern: '(isEmpty|\.isEmpty\b|length\s*==\s*0)'
    covers: [empty]
    confidence: MEDIUM
    note: "Empty is a UX concept, not a Riverpod primitive. Pattern catches the common Dart idiom but appears in non-state contexts too."
```

**Riverpod notes:**

- `when_all_three` is the canonical high-signal pattern. If this matches, loading + data + error are all covered in one call.
- `pattern_match_switch_error` and `pattern_match_switch_loading` cover the Dart 3+ sealed-class idiom — prevalence increasing 2025-2026 as projects upgrade to Dart 3.
- `.maybeWhen` (`maybe_when`) is inherently ambiguous: the caller decides which branches to supply. Always treat as PARTIAL coverage requiring manual inspection of branches.
- `empty_state_pattern` is advisory only — `isEmpty` appears in collection checks, validation code, and non-state widget builds. Do not block on a miss.

## flutter_bloc (`state_management: bloc`)

Library: `flutter_bloc`. Primary primitives: `BlocBuilder`, sealed-class State subclasses (`Loading`, `Loaded`, `Error`, `Initial`), `bloc_test` library.

```yaml
bloc:
  - name: bloc_builder_with_switch
    pattern: 'BlocBuilder<[^>]+>\s*\(\s*builder\s*:[^}]*switch\s*\([^)]+\)'
    covers: []
    confidence: MEDIUM
    note: "Signals that BlocBuilder uses switch-based state branching. Verifier should additionally grep for specific State subclass names within the switch (see Loading/Loaded/Error/Initial below)."

  - name: bloc_loading_state
    pattern: '(case\s+\w+Loading|is\s+\w+Loading\b|\bLoadingState\b)'
    covers: [loading]
    confidence: HIGH
    note: "Matches sealed-class Loading state references in switch branches or `is` checks."

  - name: bloc_loaded_data_state
    pattern: '(case\s+\w+(Loaded|Success|Data)|is\s+\w+(Loaded|Success|Data)\b)'
    covers: [data]
    confidence: HIGH
    note: "Matches Loaded/Success/Data state names. Custom domain names (e.g., LoggedIn) require per-TRD aliases (Phase 2)."

  - name: bloc_error_state
    pattern: '(case\s+\w+(Error|Failure)|is\s+\w+(Error|Failure)\b)'
    covers: [error]
    confidence: HIGH
    note: "Matches Error/Failure sealed-class state names."

  - name: bloc_initial_state
    pattern: '(case\s+\w+Initial|is\s+\w+Initial\b)'
    covers: [initial]
    confidence: HIGH
    note: "Matches Initial sealed-class state — required for full state-graph coverage in bloc."

  - name: bloc_test_used
    pattern: 'blocTest\s*\(|emitsInOrder\s*\(\['
    covers: []
    confidence: HIGH
    note: "Not a state pattern — signals that bloc_test library is in use, which implies the file follows bloc-testing conventions. Verifier emits as info, not as state coverage."
```

**flutter_bloc notes:**

- The HIGH-confidence bloc state patterns rely on conventional naming (`XxxLoading`, `XxxLoaded`, `XxxError`, `XxxInitial`). Projects with domain-specific names (`LoggedIn`, `CartEmpty`, `OrderProcessing`) will not match — this is the primary source of false negatives.
- `bloc_builder_with_switch` alone is not sufficient for coverage claims — it confirms the BlocBuilder uses switch-based branching but does not confirm which state arms are present.
- `bloc_test_used` is an info signal, not a coverage signal. Its presence implies `bloc_test` conventions are used but does not substitute for state-specific pattern matching.
- Custom state names require Phase-2 per-TRD aliases (see "Per-TRD state aliases" section below).

## setState (`state_management: setState`)

No library — vanilla Flutter mutable widget state. Patterns rely on naming conventions (variables like `_isLoading`, `_error`), so confidence is lower. **Never block on setState state coverage — treat all patterns as advisory.**

```yaml
setState:
  - name: is_loading_boolean
    pattern: '(bool\s+_?isLoading|_?isLoading\s*=\s*(true|false)|setState\s*\(\s*\(\s*\)\s*=>\s*_?isLoading)'
    covers: [loading]
    confidence: MEDIUM
    note: "Depends on naming convention. Teams use `_isLoading`, `_loading`, `_busy` — verifier should warn if no match found AND state was declared, but not block."

  - name: ternary_on_loading
    pattern: '_?isLoading\s*\?\s*'
    covers: [loading]
    confidence: MEDIUM
    note: "Common Dart UI idiom: `isLoading ? Spinner() : Content()`. Same naming-convention caveat."

  - name: error_field
    pattern: '(String\?\s+_?error|Object\?\s+_?error|_?error\s*=\s*null|_?error\s*!=\s*null)'
    covers: [error]
    confidence: MEDIUM
    note: "Nullable error field is the common setState pattern. False-negatives possible if team uses different names (`failure`, `errorMessage`)."

  - name: ternary_on_error
    pattern: '_?error\s*!=\s*null\s*\?'
    covers: [error]
    confidence: MEDIUM
    note: "Common idiom: `error != null ? ErrorView() : Content()`."

  - name: empty_check
    pattern: '(\.isEmpty\s*\?|isEmpty\s*\?|length\s*==\s*0)'
    covers: [empty]
    confidence: LOW
    note: "Extremely high false-positive rate — `isEmpty` appears in non-state contexts (collection checks, validation). Surface as advisory only."
```

**setState notes:**

- All setState patterns are MEDIUM or LOW. The verifier must NOT block verification on setState state-coverage misses — only emit advisories.
- `isLoading`/`isEmpty` are generic Dart identifiers used throughout app code; their presence does not guarantee they are part of the widget's state-coverage logic.
- Teams that use `_loading`, `_isBusy`, `_fetching`, `_errorMessage`, `_hasError`, etc. will not match these patterns. Treat absence as "manual review recommended," not as a coverage gap.

## Other (`state_management: other`)

When the planner cannot detect a known state-management library, the artifact's `state_management:` is set to `other`. The verifier:

- Skips regex-based state coverage entirely.
- Falls back to the `must_haves.truths` block for verification.
- Emits an advisory note in VERIFICATION.md: "state coverage by regex skipped — state_management: other. Manual review recommended."

This is the graceful-degradation path. It is NOT an error condition — some projects use Provider (basic), get_it, MobX, or custom state containers. Regex-based coverage is only wired for Riverpod, flutter_bloc, and setState.

## False-positive / false-negative profile

| Library | False Positives | False Negatives | Recommended verifier action |
|---------|-----------------|-----------------|------------------------------|
| Riverpod | LOW (`.when()` is distinctive) | MEDIUM (`.maybeWhen()` ambiguous; manual review needed) | HIGH patterns block; MEDIUM/LOW advise |
| flutter_bloc | LOW (sealed-class names are distinctive) | LOW-MEDIUM (custom names like `LoggedIn`/`CartEmpty` won't match — catalog needs Phase-2 aliases) | HIGH patterns block; document custom-name escape hatch |
| setState | HIGH (`isLoading`/`isEmpty` are generic Dart-isms; appear in non-state code) | LOW (the patterns hit commonly) | All MEDIUM/LOW — advise only; NEVER block setState state coverage |

**Key rule:** Only HIGH-confidence patterns are blockers. MEDIUM and LOW patterns surface as advisories in VERIFICATION.md `notes:`, not `gaps:`.

## Web verification mechanism

Flutter UI TRDs default `platform: [mobile, web]` — both platforms are required coverage. The black-box verifier is different per platform:

| Platform | `tests.integration` invocation | `tests.maestro` invocation |
|----------|--------------------------------|----------------------------|
| mobile | `flutter test integration_test/` (or `flutter test <path>` for a single file) | `maestro test .maestro/` against a booted emulator |
| web | `flutter drive --driver=test_driver/integration_test.dart --target=<tests.integration> -d chrome` (chromedriver must be running on port 4444) | **N/A — Maestro is mobile-only by design.** |

**Why is `tests.maestro` mobile-only?** Maestro on Flutter web has a known open upstream issue: **[mobile-dev-inc/maestro#2591](https://github.com/mobile-dev-inc/maestro/issues/2591)** (open since July 2025, unresolved mid-2026). `tapOn` cannot find widgets wrapped in `Semantics(label: ...)` on Flutter web even with `SemanticsBinding.instance.ensureSemantics()` enabled. The web semantics overlay is broken upstream — Maestro's selectability layer fails against Flutter's `<canvas>` rendering.

**The substitution model:** Web verification flows through `flutter drive` invoking the SAME `tests.integration` path that mobile uses. `flutter drive` IS the web-tier black-box verifier. The `test_driver/integration_test.dart` driver scaffold is auto-bootstrapped by TRD 10-04a's bootstrap setup task (a one-liner: `Future<void> main() => integrationDriver();`).

**Exact web invocation:**

```bash
# Requires chromedriver running on port 4444 in another terminal:
chromedriver --port=4444

# Run integration tests against Flutter web (Chrome):
flutter drive \
  --driver=test_driver/integration_test.dart \
  --target=<tests.integration path from TRD artifact> \
  -d chrome

# Headless variant (for CI):
flutter drive \
  --driver=test_driver/integration_test.dart \
  --target=<tests.integration path from TRD artifact> \
  -d web-server
```

**IMPORTANT — do NOT use `flutter test integration_test/ -d chrome`:** This path is deprecated for web and returns no-op or partial output. Only `flutter drive` produces reliable results against Flutter web targets. This is canonical 2026 Flutter docs guidance.

**Schema implications:**

- TRDs do NOT carry a Maestro-web opt-in flag — Maestro is mobile-only BY DESIGN.
- `tests.integration` is a single path; the executor (TRD 10-04b) invokes it via the appropriate driver per platform.
- The verifier (TRD 10-05) state-coverage grep runs against `tests.widget` (platform-agnostic; widget tests work fine on both Flutter mobile and web targets).
- Platform is detected from TRD frontmatter `platform:` field: `[mobile]`, `[web]`, or `[mobile, web]`.

**Related upstream issues** (referenced by the verifier for context; no action required from Phase 1 of this objective):

- [flutter/flutter#155323](https://github.com/flutter/flutter/issues/155323) — `Semantics.identifier` on TextField doesn't work on web.
- [flutter/flutter#143848](https://github.com/flutter/flutter/issues/143848) — `ensureSemantics()` breaks DropdownMenu on web 3.19+.
- [flutter/flutter#163576](https://github.com/flutter/flutter/issues/163576) — `ensureSemantics()` click propagation through overlapping widgets.

**If Maestro upstream resolves #2591:** Add a `web_maestro_supported: true` flag here and revisit. Until then: `flutter drive` is the web verifier.

## Per-TRD state aliases (deferred — Phase 2)

When a project uses domain-specific State subclass names (e.g., `LoggedIn`, `Cart_Empty`, `OrderProcessing`), the default catalog's regex patterns will not match. The Phase-2 escape hatch (NOT in scope for objective 10) will allow per-TRD aliases:

```yaml
# Future shape (NOT implemented in objective 10):
must_haves:
  artifacts:
    - path: lib/screens/cart_screen.dart
      states: [empty, loading, populated, checkout]
      state_aliases:
        empty: 'Cart_Empty'                       # custom regex override per state
        populated: '(Cart_Populated|HasItems)'
        checkout: 'CheckoutInProgress'
      tests:
        widget: test/screens/cart_screen_test.dart
        integration: integration_test/cart_flow_test.dart
        maestro: .maestro/cart.yaml
```

**Phase 1 (this objective):** Fixed catalog only. The planner emits `PLANNING INCONCLUSIVE` if a TRD's `state_management:` resolves to `other` and the user has not declared either standard library names or supplied custom aliases. For now, `other` falls back to truths-only verification.

**Phase 2 trigger:** If real-world adoption of the verifier shows the standard catalog misses > 20% of declared states on common Bloc projects (due to domain-specific naming), introduce `state_aliases:` per-artifact in TRD frontmatter. Track via verifier-emitted advisory count over the first 5–10 Flutter UI TRDs.

## Source

Patterns synthesized from official documentation:

- [pub.dev/documentation/riverpod/latest/riverpod/AsyncValue-class.html](https://pub.dev/documentation/riverpod/latest/riverpod/AsyncValue-class.html) — `AsyncValue.when`, `maybeWhen`, `whenData`, sealed pattern matching
- [bloclibrary.dev](https://bloclibrary.dev/) + [pub.dev/packages/bloc_test](https://pub.dev/packages/bloc_test) — `flutter_bloc` + `bloc_test` patterns; sealed-class state coverage
- [docs.flutter.dev/cookbook/testing](https://docs.flutter.dev/cookbook/testing) — setState idioms; widget test conventions
- [docs.flutter.dev/testing/integration-tests](https://docs.flutter.dev/testing/integration-tests) — canonical integration_test invocation (mobile vs web); `flutter drive` guidance

Confidence labels reflect cross-referencing against `10-RESEARCH.md`'s false-positive / false-negative analysis (synthesized May 2026).

## Consumers

- **`agents/planner.md` (TRD 10-03)** — Detects `state_management:` from project imports; emits `PLANNING INCONCLUSIVE` if `other` and no truths fallback declared. Reads this doc to present state-management guidance during TRD construction.
- **`agents/verifier.md` (TRD 10-05)** — Loads this catalog at verify time, runs regex per declared state per artifact, marks coverage status per the confidence model above. HIGH-confidence misses → blocker. MEDIUM/LOW misses → advisory.
- **`agents/executor.md` (TRD 10-04b)** — Does NOT consume this catalog directly (coverage verification happens at verify-work, not execute). BUT the executor uses the "Web verification mechanism" section above to choose the right integration_test invocation per platform.

## Error recovery

If a regex pattern produces false positives or negatives during later TRD execution (10-05 verifier wires it up against real test files), update this doc with a corrective entry — do NOT silently fix in code. This doc IS the spec; the verifier in TRD 10-05 references patterns by `name:` field. To add a corrected variant, append a new entry under the appropriate library section with a distinct name (e.g., `when_all_three_v2`) and a note explaining what the original pattern missed.
