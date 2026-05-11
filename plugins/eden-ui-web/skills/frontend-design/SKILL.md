---
name: eden-web:frontend-design
description: |
  Build, review, or visually inspect web pages using Hugo templates, Tailwind CSS, and the project's brand design system.
  Use when the user wants to create new pages, design components, audit existing UI, review frontend code, or visually test rendered pages.
  Triggers on: "build the UI", "design this page", "create a page", "review the frontend", "audit the UI", "check UI consistency", "make it look good", "frontend review", "visual review", "check how it looks", "inspect the page"
argument-hint: "<build|review|visual> [description, file paths, or URL]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Agent
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
Build new web pages, review existing templates, or visually inspect rendered pages against the project's brand design system.

**Three modes:**

**Build mode** — Generate Hugo templates and partials using Tailwind CSS with the project's brand tokens. Compose from reusable partials rather than writing one-off HTML. Produces production-grade pages that match the brand design system (dark mode, responsive, accessible, performant).

**Review mode** — Audit existing Hugo templates for brand compliance. Check for: hardcoded colors instead of brand tokens, missing dark mode support, inconsistent typography, accessibility gaps, unused or redundant CSS, non-semantic HTML structure.

**Visual mode** — Load pages in a browser via Playwright and inspect the rendered output. Check visual consistency, responsive behavior, dark mode rendering, interactive functionality, and design token compliance in the actual DOM/CSS.

Output: Working Hugo templates (build), actionable findings with fixes (review), or visual audit report with screenshots (visual).
</objective>

<execution_context>
@plugins/eden-ui-web/references/hugo-conventions.md
</execution_context>

<context>
Mode + target: $ARGUMENTS
- `build <description>` — Generate new pages/partials (e.g., "build the pricing page")
- `review [paths]` — Audit existing files (e.g., "review layouts/partials/")
- `visual [URL]` — Visual browser inspection (e.g., "visual http://localhost:1313/about")
- If no mode specified, infer from context

**Brand reference — read at the start of every mode:**
- Brand config: `data/brand/config.toml`
- Brand CSS tokens: `assets/css/brand.css`
- Brand reference: `data/brand/reference.md` (if exists)

If no brand is configured, suggest running the `brand-builder` skill first.

**Hugo project structure (standard):**
- `layouts/` — Templates (baseof, list, single, partials, shortcodes)
- `content/` — Markdown content pages
- `assets/css/` — Tailwind source files
- `static/` — Static assets (images, fonts, favicons)
- `data/` — Data files (brand config, component data)
- `config/` or `hugo.toml` — Site configuration
</context>

<process>

## Build Mode

0. **Read project brand** — Load `data/brand/config.toml` and `assets/css/brand.css` to understand the active design tokens. If no brand exists, ask the user to run `brand-builder` first or specify a preset to apply inline. The brand determines all color, typography, and styling decisions.

1. **Understand the request** — What page/section/partial is needed? What content does it display? What user interactions does it support? Where does it fit in the site navigation?

2. **Check existing partials** — Read `layouts/partials/` to find reusable components already built for this project. Don't rebuild what exists — compose from existing partials.

3. **Plan the composition** — List which sections and components the page needs:
   - Page type (landing, content, blog, product, documentation)
   - Sections (hero, features, pricing, testimonials, CTA, footer)
   - Interactive elements (dark mode toggle, mobile nav, accordions, tabs)
   - Data sources (Hugo front matter, data files, content collections)

4. **Generate Hugo templates** — Write the template files:

   **Structure:**
   - Use `{{ define "main" }}...{{ end }}` blocks extending `baseof.html`
   - Create reusable partials in `layouts/partials/components/` for repeated patterns
   - Use Hugo's `partial` function with context: `{{ partial "components/hero.html" . }}`
   - Pass data via front matter and `.Params`

   **Styling with brand tokens:**
   - Use CSS custom properties from brand.css: `var(--brand-primary-500)`
   - Apply via Tailwind arbitrary values: `bg-[var(--brand-primary-500)]` or extend Tailwind config
   - Use `dark:` variants for all color-dependent styles
   - Follow the brand's border-radius, shadow, and spacing conventions

   **Responsive design:**
   - Mobile-first approach: base styles for mobile, `md:` for tablet, `lg:` for desktop
   - Hamburger menu for mobile navigation
   - Stack sections vertically on mobile, multi-column on desktop
   - Test at 375px, 768px, 1280px breakpoints

   **Accessibility:**
   - Semantic HTML: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`
   - ARIA labels on interactive elements
   - Skip-to-content link
   - Proper heading hierarchy (h1 → h2 → h3, no skips)
   - Focus-visible styles on interactive elements
   - Alt text on all images

   **Performance:**
   - Use Hugo's image processing for responsive images: `{{ $img := resources.Get "..." }}`
   - Lazy-load below-fold images
   - Inline critical CSS if needed
   - Minimize JavaScript — use CSS for animations where possible

   **Interactivity (when needed):**
   - Dark mode toggle via JS (toggle `dark` class on `<html>`)
   - Mobile menu with Alpine.js or vanilla JS
   - Scroll-triggered animations via Intersection Observer
   - Canvas effects only if the brand calls for them (e.g., aocyber particle background)

5. **Verify** — Confirm all templates render without Hugo errors. Check that brand tokens are used consistently. Verify partials receive correct context.

## Review Mode

0. **Read project brand** — Load brand config to understand what tokens should be in use.

1. **Discover target files** — Glob for `*.html` in `layouts/`. If no path given, scan all of `layouts/` and `assets/css/`.

2. **Audit each file** for these categories:

   **Brand compliance:**
   - Hardcoded colors (`bg-blue-500`, `#667eea`) instead of brand tokens
   - Non-brand fonts (inline font-family instead of brand variables)
   - Inconsistent spacing not matching brand scale
   - Shadows or border-radius not matching brand conventions

   **Hugo best practices:**
   - Templates not using `{{ partial }}` for repeated patterns
   - Missing `{{ with }}` / `{{ if }}` guards around optional data
   - Raw HTML in content files that should be shortcodes
   - Not using Hugo's asset pipeline (resources, fingerprinting)

   **Dark mode:**
   - Missing `dark:` variants on colored elements
   - White/light backgrounds without dark alternatives
   - Insufficient contrast in dark mode
   - Images or SVGs that don't adapt to dark backgrounds

   **Accessibility:**
   - Missing ARIA labels on buttons, links, interactive elements
   - Missing alt text on images
   - Non-semantic HTML (`<div>` where `<nav>`, `<section>` would be appropriate)
   - Missing skip-to-content link
   - Heading hierarchy violations

   **Performance:**
   - Unoptimized images (not using Hugo image processing)
   - Render-blocking scripts
   - Unused CSS classes
   - Missing lazy-loading on below-fold content

3. **Report findings** — Group by severity:
   - **Must fix** — Accessibility violations, broken dark mode, hardcoded colors
   - **Should fix** — Non-brand tokens, missing partials, Hugo anti-patterns
   - **Consider** — Performance optimizations, additional semantic markup

4. **Generate fixes** — Provide corrected code for must-fix and should-fix items. Apply fixes directly if approved.

## Visual Mode

Uses Playwright to load pages in a real browser and inspect rendered output.

### Setup

0. **Read project brand** — Load brand config to know what design to expect.

1. **Confirm the site is running** — Ask for the base URL (default: `http://localhost:1313`). Verify the Hugo dev server responds.

2. **Determine scope** — What pages to inspect:
   - Single URL: inspect one page
   - Section: all pages in a content section
   - Full audit: crawl from the homepage

### Page Inspection Sequence

For each page:

3. **Navigate and snapshot** — Load the URL. Take an accessibility snapshot to get the semantic structure — DOM tree, ARIA roles, heading hierarchy.

4. **Screenshot** — Capture the visual output for design review.

5. **Brand token audit** — Evaluate computed styles:
   ```js
   () => {
     const root = getComputedStyle(document.documentElement);
     return {
       primaryColor: root.getPropertyValue('--brand-primary-500'),
       fontDisplay: root.getPropertyValue('--brand-font-display'),
       darkMode: document.documentElement.classList.contains('dark'),
     };
   }
   ```
   Verify brand CSS variables are defined and applied correctly.

6. **Structure check** — From the accessibility snapshot:
   - Semantic landmarks present (header, nav, main, footer)
   - Heading hierarchy is correct
   - Interactive elements have labels
   - Focus order is logical
   - Skip-to-content link exists

7. **Responsive check** — Resize and re-inspect:
   - **Desktop** (1280x800)
   - **Tablet** (768x1024)
   - **Mobile** (375x812)

   At each breakpoint: screenshot, check snapshot for layout changes, verify nav adapts.

8. **Dark mode check** — Toggle dark mode:
   ```js
   () => { document.documentElement.classList.toggle('dark'); }
   ```
   Screenshot in dark mode. Verify:
   - No white backgrounds bleeding through
   - Text contrast is sufficient
   - Brand colors render correctly on dark surfaces
   - Images/SVGs adapt to dark backgrounds

9. **Interactive testing** — Test dynamic elements:
   - **Mobile nav:** Click hamburger → verify menu opens → close
   - **Dark mode toggle:** Click → verify theme switches
   - **Accordions/tabs:** Click items → verify content switches
   - **Scroll animations:** Scroll down → verify elements animate in
   - **Links:** Verify navigation works, no 404s

10. **Console check** — After interactions, check for:
    - JavaScript errors
    - Missing asset warnings (fonts, images)
    - CORS issues with external resources

### Reporting

11. **Compile visual audit report:**

    **Layout & Spacing:** Alignment issues, overflow, inconsistent margins

    **Brand Compliance:** Colors, fonts, shadows not matching brand tokens

    **Responsive:** Breakpoint-specific layout problems

    **Dark Mode:** Elements that break in dark mode

    **Accessibility:** Issues found in live DOM that code review missed

    **Performance:** Visible loading delays, layout shift, unoptimized images

12. **Cross-reference with code** — Trace each finding back to the responsible template file. Provide file paths and specific code to change. Offer to apply fixes.

</process>
