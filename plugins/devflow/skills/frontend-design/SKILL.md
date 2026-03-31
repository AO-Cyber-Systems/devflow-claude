---
name: df:frontend-design
description: |
  Build, review, or visually inspect UI using project components, partials, and design tokens.
  Use when the user wants to create new views, design components, audit existing UI, review frontend code, or visually test rendered pages.
  Triggers on: "build the UI", "design this page", "create a view", "review the frontend", "audit the UI", "check UI consistency", "make it look good", "frontend review", "visual review", "check how it looks", "inspect the page"
argument-hint: "<build|review|visual> [description, file paths, or URL]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
  - mcp__plugin_playwright_playwright__browser_navigate
  - mcp__plugin_playwright_playwright__browser_snapshot
  - mcp__plugin_playwright_playwright__browser_take_screenshot
  - mcp__plugin_playwright_playwright__browser_click
  - mcp__plugin_playwright_playwright__browser_evaluate
  - mcp__plugin_playwright_playwright__browser_console_messages
  - mcp__plugin_playwright_playwright__browser_resize
  - mcp__plugin_playwright_playwright__browser_tabs
  - mcp__plugin_playwright_playwright__browser_wait_for
---
<objective>
Build new UI, review existing code, or visually inspect rendered pages against the project's design system.

**Three modes:**

**Build mode** — Generate views/components using the project's existing UI patterns and design system. Discover and compose from existing component libraries rather than writing raw CSS. Produces production-grade views that match the project's established patterns.

**Review mode** — Audit existing views for design system compliance. Check for: raw HTML that should use existing components, missing dark mode support, hardcoded colors instead of design tokens, incorrect component composition, accessibility gaps.

**Visual mode** — Load pages in a browser via Playwright and inspect the rendered output. Check visual consistency, responsive behavior, dark mode rendering, interactive component functionality, and design token compliance in the actual DOM/CSS. Catches issues that static code review misses: layout breaks, z-index conflicts, animation glitches, computed style mismatches.

Output: Working view files (build), actionable code findings with fixes (review), or visual audit report with screenshots (visual).
</objective>

<context>
Mode + target: $ARGUMENTS
- `build <description>` — Generate new views (e.g., "build user settings page")
- `review [paths]` — Audit existing files (e.g., "review app/views/dashboard/")
- `visual [URL or path]` — Visual browser inspection (e.g., "visual http://localhost:3000/dashboard")
- If no mode specified, infer from context

@.planning/STATE.md
</context>

<process>

## Discovery (all modes)

0. **Discover the project's design system** — Before building or reviewing, understand what's available:
   - Search for component libraries, UI helpers, shared partials/components
   - Identify the CSS framework (Tailwind, Bootstrap, custom) and design tokens
   - Find the project's color palette, typography, and spacing conventions
   - Locate any existing UI documentation or style guides
   - Check for component frameworks (React components, Rails partials, Vue components, Flutter widgets, etc.)

## Build Mode

1. **Understand the request** — What page/view/component is needed? What data does it display? What actions does it support?

2. **Check for matching components** — Search the project's component library for existing components that match the needed patterns. Reuse before creating.

3. **Plan the composition** — List which existing components will compose the view. Identify layout patterns already used in the project. Map data flow.

4. **Generate code** — Write view files using the project's established component patterns:
   - Compose from existing components rather than writing raw markup
   - Follow the project's naming conventions and file organization
   - Use design tokens for colors, spacing, typography — never hardcode values
   - Support dark mode if the project uses it
   - Include accessibility attributes (ARIA labels, roles, focus management)

5. **Verify** — Confirm all component references are valid. Check that any interactive patterns use the project's established approach (Stimulus, Alpine, React state, etc.).

## Review Mode

1. **Discover target files** — Find view/component files in the specified paths. If no path given, scan the main views directory.

2. **Inventory available components** — Load the project's component library to know what's available.

3. **Audit each file** for these categories:

   **Component usage:**
   - Raw HTML that duplicates an existing component
   - Missing component usage (e.g., hand-rolled modal instead of project's modal component)
   - Incorrect parameter usage

   **Design token compliance:**
   - Hardcoded colors instead of design token colors
   - Non-token fonts, shadows, or spacing
   - Missing dark mode variants on custom elements

   **Accessibility:**
   - Missing ARIA labels on interactive elements
   - Missing focus states
   - Images without alt text
   - Forms without associated labels

   **Interactivity:**
   - Interactive patterns without the project's JS framework
   - Missing controller/handler attributes on components that need them

4. **Report findings** — Group by severity:
   - **Must fix** — Broken patterns, accessibility violations, missing dark mode
   - **Should fix** — Raw HTML replaceable by existing components, hardcoded colors
   - **Consider** — Style improvements, better component composition

5. **Generate fixes** — For each must-fix and should-fix finding, provide the corrected code. Apply fixes directly if the user approves.

## Visual Mode

Uses Playwright to load pages in a real browser and inspect the rendered output.

### Setup

1. **Confirm the app is running** — Ask the user for the base URL (default: `http://localhost:3000`). Verify the server responds before proceeding.

2. **Determine scope** — What pages/flows to inspect:
   - Single URL: inspect one page
   - Flow: a sequence of URLs or actions (e.g., "the settings flow")
   - Full audit: crawl all pages linked from a starting point

### Page Inspection Sequence

For each page, run this sequence:

3. **Navigate and snapshot** — Load the URL. Take an accessibility snapshot (`browser_snapshot`) to get the semantic structure. This is the primary inspection tool — it reveals the actual DOM tree, ARIA roles, element hierarchy.

4. **Screenshot for visual context** — Take a screenshot to see the rendered visual output. Use this to evaluate layout, spacing, color usage, and overall design quality.

5. **Design token audit** — Evaluate computed styles in the browser:
   ```js
   () => {
     const body = getComputedStyle(document.body);
     return {
       fontFamily: body.fontFamily,
       colorScheme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
     };
   }
   ```

6. **Component structure check** — Use the snapshot to verify:
   - Interactive controllers are connected (data attributes present)
   - ARIA roles and labels are correct
   - Interactive elements are keyboard-accessible
   - Form inputs have associated labels
   - Images have alt text
   - Heading hierarchy is logical (h1 → h2 → h3, no skips)

7. **Responsive check** — Resize the viewport and re-inspect:
   - **Desktop** (1280x800) — Full layout
   - **Tablet** (768x1024) — Responsive grid
   - **Mobile** (375x812) — Mobile layout

   At each breakpoint: take a screenshot, check the snapshot for layout shifts, verify navigation adapts correctly.

8. **Dark mode check** — Toggle dark mode and re-inspect:
   ```js
   () => { document.documentElement.classList.toggle('dark'); }
   ```
   Take a screenshot in dark mode. Verify:
   - No white/light backgrounds bleeding through
   - Text remains readable (sufficient contrast)
   - Brand colors render correctly on dark backgrounds
   - No missing dark mode overrides

9. **Interactive component testing** — For pages with interactive elements:
   - **Modals:** Click trigger → verify modal opens → check backdrop → close with Escape
   - **Dropdowns:** Click trigger → verify menu appears → check keyboard navigation
   - **Tabs:** Click each tab → verify content switches
   - **Forms:** Check validation states (submit empty → check error styling)

10. **Console check** — After interactions, check browser console for:
    - JavaScript errors (broken controllers, missing dependencies)
    - Missing asset warnings (fonts, icons, images)

### Reporting

11. **Compile visual audit report** — Organize findings:

    **Layout & Spacing:**
    - Alignment issues, inconsistent padding/margins, overflow problems

    **Color & Tokens:**
    - Computed colors that don't match design tokens
    - Contrast violations (especially in dark mode)

    **Responsive:**
    - Breakpoint-specific layout issues

    **Dark Mode:**
    - Elements that break in dark mode

    **Interactivity:**
    - Components that don't respond to interaction
    - Console errors
    - Focus trapping / keyboard navigation gaps

    **Accessibility:**
    - Missing ARIA attributes found in live DOM
    - Focus order issues
    - Screen reader concerns from the accessibility snapshot

12. **Cross-reference with code** — For each visual finding, trace back to the responsible source file. Provide the file path and specific code that needs to change. Offer to apply fixes.

</process>
