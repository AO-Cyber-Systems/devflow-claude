---
name: eden-flutter:frontend-design
description: |
  Build, review, or visually inspect Flutter UI using eden-ui-flutter widgets and design tokens.
  Use when the user wants to create new screens, design widgets, audit existing UI, review Flutter code, or test rendered app output via flutter-skill.
  Triggers on: "build the UI", "design this screen", "create a view", "review the frontend", "audit the UI", "check UI consistency", "make it look good", "frontend review", "visual review", "check how it looks", "inspect the app"
argument-hint: "<build|review|visual> [description, file paths, or connection target]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Agent
  - AskUserQuestion
---
<objective>
Build new Flutter UI, review existing widget code, or visually inspect a running app against eden-ui-flutter conventions.

**Three modes:**

**Build mode** — Generate Flutter screens and widgets using eden-ui-flutter components. Compose from the eden-ui-flutter widget catalog rather than writing raw Material/Cupertino widgets. Produces production-grade Dart files that match the eden-ui-flutter design system (configured brand theme, dark mode, responsive layout).

**Review mode** — Audit existing Dart widget files for eden-ui-flutter compliance. Check for: raw Material widgets that should use eden-ui-flutter equivalents, missing dark mode support, hardcoded colors instead of design tokens, incorrect widget composition, accessibility gaps (missing Semantics), missing state management patterns.

**Visual mode** — Connect to a running Flutter app via flutter-skill MCP server and inspect the rendered output. Analyze the accessibility tree, take screenshots, test interactive flows, and verify design token compliance in the live widget tree. Catches issues that static code review misses: layout overflow, theme inconsistencies, gesture conflicts, animation jank.

Output: Working Dart files (build), actionable code findings with fixes (review), or visual audit report with screenshots (visual).
</objective>

<execution_context>
@plugins/eden-ui-flutter/references/eden-ui-flutter-conventions.md
@~/.claude/devflow/references/design-craft.md
@~/.claude/devflow/references/design-tells.md
@~/.claude/devflow/references/design-preflight.md
@~/.claude/devflow/references/design-stack-flutter.md
</execution_context>

<context>
Mode + target: $ARGUMENTS
- `build <description>` — Generate new screens/widgets (e.g., "build user settings screen")
- `review [paths]` — Audit existing files (e.g., "review lib/features/dashboard/")
- `visual [connection]` — Live app inspection (e.g., "visual ws://127.0.0.1:50000/xxx/ws")
- If no mode specified, infer from context

**Live reference — read from eden-ui-flutter source when needed:**
- Widget catalog: `../eden-ui-flutter/lib/src/components/`
- Theme data: `../eden-ui-flutter/lib/src/theme/`
- Design tokens: `../eden-ui-flutter/lib/src/tokens/`
- Brand presets: `../eden-ui-flutter/lib/src/brand/`
- Example app: `../eden-ui-flutter/example/`

**Flutter-skill MCP integration (Visual mode):**
When flutter-skill MCP is available, use its tools for live inspection:
- `connect_app` / `scan_and_connect` — Connect to a running Flutter app
- `inspect` / `snapshot` — Get the accessibility tree (87-99% more token-efficient than screenshots)
- `screenshot` — Capture visual output for design review
- `tap` / `enter_text` / `swipe` — Test interactive flows
- `assert_visible` / `assert_text` — Verify UI state
- `get_logs` — Check for rendering errors, overflow warnings
</context>

<process>

## Build Mode

0. **Read project theme** — Check the app's `lib/config/theme.dart` or equivalent for `EdenTheme` configuration: brand preset, color overrides, font preset, dark mode settings. This determines how `EdenColors.primary` resolves. Use semantic color tokens — never hardcode hex values.

1. **State the design read** — Before planning composition, write one line naming
   the surface kind, the audience, the visual language, and the foundation:
   *"Reading this as: a settings screen for existing power users, dense and utterly
   conventional, on EdenTheme tokens with minimal motion."*

   Then set the three dials (EXPRESSION / MOTION / DENSITY) from the derivation
   table in `design-craft.md`. The active `EdenTheme` brand preset is the outer
   boundary; the dials move inside it. Product screens sit low on EXPRESSION and
   MOTION and high on DENSITY — a settings screen is not a landing page, and
   treating it like one is the most common failure here.

   Ask at most **one** clarifying question, and only if the read genuinely
   diverges.

2. **Detect greenfield vs redesign** — If this screen already exists in any
   form, stop and load `~/.claude/devflow/references/design-redesign.md`. Misclassifying a
   redesign as a greenfield build is the largest single source of bad redesign
   work: it silently changes IA, slugs, nav labels and analytics identifiers.

   Audit before touching anything, read the *existing* surface's dials as your
   starting point rather than the table baseline, and treat the never-change list
   (URLs, nav labels, form field names, logo, legal copy) as
   `checkpoint:decision` material rather than something to guess.

3. **Understand the request** — What screen/widget is needed? What data does it display? What user interactions does it support? What navigation pattern does it use?

4. **Check eden-ui-flutter for matching widgets** — Read `../eden-ui-flutter/lib/src/components/` to find matching widget APIs. Check constructor parameters, required vs optional fields, available variants.

5. **Plan the composition** — List which eden-ui-flutter widgets will compose the screen. Identify:
   - Layout type (scaffold with sidebar, tab-based, single-scroll, modal flow)
   - State management approach (Provider, Riverpod, BLoC — match the project's existing pattern)
   - Navigation integration (GoRouter, Navigator 2.0 — match existing)
   - Data flow from state to widgets

6. **Generate Dart files** — Write the screen/widget files using eden-ui-flutter widgets:
   - Use `EdenScaffold` for screen structure with app bar, sidebar, FAB
   - Use `EdenCard` for content containers with proper elevation and padding
   - Use `EdenDataTable` for tabular data with sorting, pagination, selection
   - Use `EdenForm` + `EdenTextField` / `EdenDropdown` / etc. for forms
   - Use `EdenDialog` / `EdenBottomSheet` for overlay interactions
   - Use `EdenEmptyState` for zero-data scenarios
   - Use `EdenSnackBar` / `EdenToast` for notifications
   - Use `EdenButton` with correct variant (primary, secondary, outline, ghost, danger)
   - All widgets must render correctly in both light and dark themes
   - Include `Semantics` widgets for accessibility where eden-ui-flutter doesn't handle it internally
   - Use `EdenResponsive` / `LayoutBuilder` for adaptive layouts

7. **Verify** — Confirm all widget constructors use valid parameters by cross-referencing eden-ui-flutter source. Check that state management follows project conventions. Verify imports are correct.

8. **Run the pre-flight check** — Work every box in `design-preflight.md` before
   reporting the surface complete. It is a gate, not a checklist to note.

   Flutter has a stronger option than a screenshot: run `/devflow:ui-eval` to
   capture every declared state (loading, empty, error, populated), score it
   through the offline visual-eval engine, and write evidence the verifier
   consumes. Declared states that are never rendered are the usual gap — a widget
   test that exercises the happy path and silently ignores the other three.

   Record the design read and the three dial values in the job's `SUMMARY.md`.

## Review Mode

0. **Read project theme** — Check theme configuration to understand which brand preset is active. When reviewing color usage, ensure widgets use `EdenColors.primary` and semantic tokens, not raw `Colors.blue` or hardcoded values.

1. **Discover target files** — Glob for `*.dart` in the specified paths. If no path given, scan `lib/` excluding generated files (`*.g.dart`, `*.freezed.dart`).

2. **Read eden-ui-flutter widget inventory** — Load the component catalog to know what's available.

3. **Audit each file** for these categories:

   **Widget usage:**
   - Raw Material/Cupertino widgets that duplicate an eden-ui-flutter widget (e.g., `ElevatedButton` instead of `EdenButton`)
   - Missing eden-ui-flutter usage (e.g., raw `Card` instead of `EdenCard`)
   - Incorrect parameter usage (wrong variant names, missing required params)
   - Widgets that should compose from eden-ui-flutter but build from scratch

   **Design token compliance:**
   - Hardcoded colors (`Colors.blue`, `Color(0xFF...)`) instead of `EdenColors.primary`
   - Non-token text styles (raw `TextStyle` instead of `EdenTypography.bodyMd`)
   - Hardcoded spacing instead of `EdenSpacing.md`
   - Missing theme-aware colors (won't adapt to dark mode)

   **Accessibility:**
   - Missing `Semantics` on interactive custom widgets
   - Missing `excludeSemantics` on decorative elements
   - Tap targets smaller than 48x48dp
   - Missing semantic labels on icon buttons
   - Images without semantic descriptions

   **Generated-look tells** — work the full catalogue in `design-tells.md`, all seven categories. Highlights:
   - Every screen the same centred column; a product screen art-directed like a
     landing page (the most common failure on Flutter surfaces)
   - Decorative status dots, section-number labels, divider lines on every row
   - Full-saturation accents, glows, pure black surfaces instead of the theme's
     off-black
   - Oversized headings standing in for real hierarchy
   - Placeholder tells: "John Doe", "Acme", round numbers, repeated generic
     avatars, fake data that is suspiciously tidy
   - Copy tells: filler verbs, "Step 1 / Step 2", em-dashes in labels and buttons
   - Motion tells: implicit animation on everything, staggered list entrances, no
     reduced-motion path (check `MediaQuery.disableAnimations`)

   **State management:**
   - StatefulWidget where a stateless + provider pattern would suffice
   - Missing `const` constructors where possible
   - Rebuild scope too wide (entire screen rebuilds for minor state changes)

   **Composition:**
   - Forms not using `EdenForm` wrapper with validation
   - Lists not using `EdenListTile` or `EdenDataTable`
   - Empty states not using `EdenEmptyState`
   - Alerts/snackbars not using eden-ui-flutter notification widgets

4. **Report findings** — Group by severity:
   - **Must fix** — Anything failing a floor in `design-craft.md` section 5:
     contrast, focus visibility, 48x48dp targets, reduced-motion path, semantic
     labels. Plus hardcoded colors (break in dark mode) and broken widget APIs.
   - **Should fix** — Raw Material widgets replaceable by eden-ui-flutter,
     non-token spacing/typography, and generated-look tells with no justification
     in the brief
   - **Consider** — Better composition, const constructor opportunities, rebuild scope optimization

   A tell is a finding only when nothing in the brief calls for it. Name the
   justification you looked for rather than listing the pattern on its own.

5. **Generate fixes** — For each must-fix and should-fix finding, provide the corrected Dart code. Apply fixes directly if the user approves.

## Visual Mode

Uses flutter-skill MCP server to connect to a running Flutter app and inspect the live widget tree.

### Setup

0. **Read project theme** — Check theme configuration to know what colors and typography to expect in the live app.

1. **Connect to the app** — Use `scan_and_connect` to discover running Flutter apps, or `connect_app` with a specific VM service URL. Verify the connection succeeds before proceeding.

2. **Determine scope** — What screens/flows to inspect:
   - Single screen: inspect the current view
   - Flow: a sequence of screens (e.g., "the onboarding flow")
   - Full audit: navigate through all main routes

### Screen Inspection Sequence

For each screen, run this sequence:

3. **Snapshot the accessibility tree** — Use `snapshot` to get the semantic structure. This is the primary inspection tool — it reveals the widget hierarchy, semantics labels, roles, and states. Far more useful than screenshots for design system compliance checking.

4. **Screenshot for visual context** — Use `screenshot` to see the rendered visual output. Evaluate layout, spacing, color usage, and overall design quality.

5. **Design token audit** — Analyze the accessibility tree for:
   - Widgets using correct eden-ui-flutter components (check class names in tree)
   - Text styles matching `EdenTypography` tokens
   - Colors consistent with the configured brand preset
   - Spacing and padding consistent with `EdenSpacing` scale

6. **Widget structure check** — Use the snapshot to verify:
   - Semantics labels are present on interactive elements
   - Tap targets are adequately sized (48x48dp minimum)
   - Heading hierarchy is logical
   - Focus traversal order makes sense
   - Images have semantic descriptions

7. **Responsive check** — If testing on different form factors:
   - **Phone** (375x812) — Single column, bottom nav
   - **Tablet** (768x1024) — Adaptive layout, possibly split view
   - **Desktop** (1280x800) — Full sidebar, multi-panel layout

   At each size: take a screenshot, snapshot the tree, check for overflow warnings in logs.

8. **Dark mode check** — If the app supports theme switching:
   - Toggle to dark mode (tap the theme switcher or use the app's mechanism)
   - Screenshot in dark mode
   - Verify no white/light backgrounds bleeding through
   - Check text contrast remains readable
   - Verify brand colors render correctly on dark surfaces

9. **Interactive testing** — For screens with interactive elements:
   - **Dialogs:** Tap trigger → verify dialog opens → check content → dismiss
   - **Bottom sheets:** Swipe or tap trigger → verify sheet appears → test drag-to-dismiss
   - **Tabs:** Tap each tab → verify content switches
   - **Forms:** Enter text → check validation → submit
   - **Pull-to-refresh:** Swipe down → verify refresh indicator
   - **Navigation:** Tap nav items → verify correct screen loads

10. **Check logs** — After interactions, use `get_logs` to check for:
    - RenderFlex overflow errors
    - Missing asset warnings (fonts, images)
    - State management errors
    - Network/API errors affecting UI state

### Reporting

11. **Compile visual audit report** — Organize findings:

    **Layout & Spacing:**
    - Overflow issues, inconsistent padding, alignment problems
    - Screenshots with observations

    **Theme & Tokens:**
    - Widgets not using eden-ui-flutter theme tokens
    - Colors that don't match the configured brand
    - Dark mode rendering issues

    **Responsive:**
    - Breakpoint-specific layout issues
    - Screenshots at different form factors

    **Accessibility:**
    - Missing semantics labels found in live tree
    - Focus traversal issues
    - Tap target size violations

    **Interactivity:**
    - Widgets that don't respond to interaction
    - Animation or gesture issues
    - State management errors from logs

12. **Cross-reference with code** — For each visual finding, trace back to the responsible Dart file using the widget tree structure. Provide the file path and specific widget that needs to change. Offer to apply fixes.

</process>
