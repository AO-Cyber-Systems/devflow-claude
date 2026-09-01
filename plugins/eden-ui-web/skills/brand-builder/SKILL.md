---
name: eden-web:brand-builder
description: |
  Define or customize a brand design system for a web project. Creates design tokens, color palettes, typography, and component styles.
  Use when starting a new web project, switching brands, or defining a custom look and feel.
  Triggers on: "set up the brand", "define the design", "create a brand", "customize the look", "design tokens", "brand preset", "new brand", "theme setup"
argument-hint: "<brand-name|preset> [description or reference URL]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
  - WebFetch
---
<objective>
Define a complete brand design system for a Hugo/Tailwind web project. Creates all design tokens, generates Tailwind config overrides, and produces a brand reference document that the frontend-design skill consumes.

**Built-in presets:** `dpcco` (Don't Panic Consulting — purple/cyan, bold split-screen), `aocyber` (AO Cyber Systems — gold/dark, enterprise minimalist). Use these as starting points or create a fully custom brand.

Output: Brand configuration files in the project's `assets/css/` and `data/brand/` directories, plus a brand reference markdown consumed by the frontend-design skill.
</objective>

<execution_context>
@plugins/eden-ui-web/references/brand-presets.md
@~/.claude/devflow/references/design-craft.md
@~/.claude/devflow/references/design-stack-web.md
</execution_context>

<context>
Brand target: $ARGUMENTS
- `dpcco` — Apply the Don't Panic Consulting preset
- `aocyber` — Apply the AO Cyber Systems preset
- `<name> <description>` — Create a custom brand (e.g., "acme Bold tech startup with neon green accents")
- `<name> <URL>` — Derive a brand from an existing website's design language
- If no argument, ask the user what brand to build
</context>

<process>

## 1. Gather Brand Intent

If using a preset, load the preset values from the brand-presets reference.

If creating a custom brand:
- **Ask the user** for brand personality (bold/subtle, playful/serious, warm/cool, minimal/rich)
- **Ask for reference points** — existing websites, color preferences, industry context
- If a URL is provided, fetch it and extract the design language (colors, fonts, layout patterns)

**When the brief does not name a typeface or palette, do not default — rotate.**
`design-stack-web.md` §1 carries the display-sans pool, the pairings, and the
serif pool for the rare case a serif is justified; §2 carries the two palette
families to avoid reaching for (violet-glow, and cream-plus-brass-plus-espresso
on premium-consumer briefs) with concrete alternatives.

Reusing the same face or palette family across consecutive brands is the failure
mode here: each brand is defensible on its own and they are collectively
indistinguishable. Check what the last brand used before picking.

## 2. Define Design Tokens

Generate the complete token set:

### Colors
- **Primary palette** — 50 through 950 shades (for actions, links, focus rings)
- **Secondary palette** — Complementary accent color
- **Neutral palette** — Gray scale for text, backgrounds, borders
- **Status colors** — Success, warning, error, info (can use defaults or customize)
- **Surface colors** — Background, card, overlay tints for light and dark modes
- **Special** — Gradient stops, glow colors, accent highlights

### Typography
- **Display font** — For headings, hero text (Google Fonts or system)
- **Body font** — For paragraphs, UI text
- **Mono font** — For code blocks, data
- **Scale** — Font sizes for display, heading, body, caption levels
- **Weights** — Which weights to load (optimize for performance)

### Spacing & Layout
- **Spacing scale** — Base unit and multipliers
- **Container widths** — Max-width for content sections
- **Border radius** — Component rounding (sharp, subtle, rounded, pill)
- **Shadows** — Elevation levels matching the brand mood

### Motion
- **Duration scale** — Fast, normal, slow transition speeds
- **Easing curves** — Brand-appropriate animation feel
- **Hero animations** — Canvas effects, particle systems, scroll reveals (if the brand calls for it)

## 3. Generate Configuration Files

### Tailwind Config Extension (`assets/css/brand.css`)
CSS custom properties that Tailwind `@theme` consumes:

```css
@layer base {
  :root {
    --brand-primary-50: #...;
    --brand-primary-500: #...;
    --brand-primary-900: #...;
    --brand-secondary-500: #...;
    --brand-font-display: 'Font Name', sans-serif;
    --brand-font-body: 'Font Name', sans-serif;
    --brand-radius: 0.5rem;
    /* ... full token set */
  }
  .dark {
    --brand-surface: #...;
    --brand-on-surface: #...;
    /* ... dark mode overrides */
  }
}
```

### Brand Data (`data/brand/config.toml`)
Hugo data file consumed by templates:

```toml
[meta]
name = "Brand Name"
preset = "custom"

[colors]
primary = "#..."
secondary = "#..."

[fonts]
display = "Font Name"
body = "Font Name"
google_fonts_url = "https://fonts.googleapis.com/css2?family=..."

[features]
dark_mode = true
canvas_animation = false
scroll_reveals = true
```

### Brand Reference (`data/brand/reference.md`)
Design system documentation consumed by the frontend-design skill:

- Complete color palette with usage guidelines
- Typography scale with examples
- Component styling rules (buttons, cards, nav, etc.)
- Dark mode behavior
- Animation and interaction patterns
- Anti-patterns specific to this brand

## 4. Verify Integration

- Check that `assets/css/brand.css` is imported in the main stylesheet
- Verify Hugo `data/brand/` is accessible in templates via `.Site.Data.brand`
- Test that Tailwind classes resolve correctly with the custom properties
- Preview the brand in the browser if the dev server is running

## 5. Record the design posture

Tokens say what the colors are. They do not say how expressive the brand is
willing to be, and that is the judgement `frontend-design` needs on every page.
Settle it once, here, and write it into `data/brand/reference.md`:

```markdown
## Design posture

- EXPRESSION: 6   <!-- 1 = symmetrical and conventional, 10 = asymmetric, art-directed -->
- MOTION: 4       <!-- 1 = static, 10 = choreographed -->
- DENSITY: 3      <!-- 1 = gallery-airy, 10 = instrument-panel -->

Register: restrained editorial. Left-aligned by default.
Deliberately not: neon, glassmorphism, centred hero over gradient mesh.
```

Derive the values from the brand's own character, not from the surface being
built — these are the **outer boundary** the per-page dials move inside (see
`design-craft.md` sections 2 and 3). A deliberately restrained brand caps
EXPRESSION even on a landing page.

The "deliberately not" line is the useful one. A brand defined only by what it
includes gets the generic defaults everywhere it is silent.

## 6. Update Frontend-Design Context

After generating the brand, remind the user that the `frontend-design` skill will automatically read the brand reference when building pages. The brand tokens become the design system that frontend-design enforces, and the design posture becomes the boundary its dials move inside.

</process>
