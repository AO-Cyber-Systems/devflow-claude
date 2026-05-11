<brand_presets>

Built-in brand presets for eden-ui-web projects. Each preset defines a complete design system derived from a live production website. Use these as-is or as starting points for custom brands.

## Preset: dpcco

**Source:** [dpcco.me](https://dpcco.me) — Don't Panic Consulting
**Mood:** Bold, professional, tech-forward, confident
**Mode:** Dark-first

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--brand-primary-500` | `#667eea` | Purple — primary actions, hero backgrounds |
| `--brand-primary-600` | `#5b21b6` | Purple dark — hover states |
| `--brand-primary-50` | `#ede9fe` | Purple light — subtle backgrounds |
| `--brand-secondary-500` | `#38bdf8` | Cyan — secondary actions, links |
| `--brand-secondary-600` | `#0ea5e9` | Cyan dark — hover |
| `--brand-secondary-50` | `#e0f2fe` | Cyan light — subtle backgrounds |
| `--brand-accent` | `#3b82f6` | Blue — progress indicators, highlights |
| `--brand-surface` | `rgb(31, 41, 55)` | Dark charcoal — page background |
| `--brand-surface-alt` | `rgb(17, 24, 39)` | Darker — card/section backgrounds |
| `--brand-on-surface` | `#ffffff` | White — primary text on dark |
| `--brand-on-surface-muted` | `#9ca3af` | Gray-400 — secondary text |
| `--brand-border` | `#4b5563` | Gray-600 — dividers |

**Light mode overrides:**
| Token | Value |
|-------|-------|
| `--brand-surface` | `#ffffff` |
| `--brand-surface-alt` | `#f9fafb` |
| `--brand-on-surface` | `#111827` |
| `--brand-on-surface-muted` | `#6b7280` |
| `--brand-border` | `#e5e7eb` |

### Typography

| Token | Value | Weight |
|-------|-------|--------|
| `--brand-font-display` | `Inter` | 800 (extrabold) |
| `--brand-font-body` | `Inter` | 300-400 (light-regular) |
| `--brand-font-mono` | `ui-monospace, SFMono-Regular, Menlo` | 400 |
| **Google Fonts URL** | `https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap` | |

**Scale:**
- Display: 48px / extrabold (hero headings like "C.O.G.S.")
- Heading: 24px / semibold (section titles)
- Subheading: 18px / semibold (card titles, service names)
- Body: 16px / regular
- Small: 14px / regular (nav items, captions)

### Layout

- **Split-screen hero** — Two-column 50/50 with color-blocked backgrounds (purple left, cyan right)
- **Cards** — Semi-transparent on colored backgrounds, 2x2 grid for service offerings
- **Container** — Max-width responsive (sm through 7xl breakpoints)
- **Border radius** — 8px (rounded-lg) on buttons and cards
- **Shadows** — Minimal, relies on color contrast for elevation

### Motion

- **Page transitions** — 200ms fade-in/out (Hotwire Turbo style)
- **Hover states** — Color shift on buttons and links
- **No canvas animations** — Clean, fast-loading approach

### Component Patterns

**Navigation:** Dark background, text-based links, dropdown menus, logo left-aligned
**Buttons:** Solid fill with white text, rounded corners, compact padding (px-4 py-2.5)
**Hero:** Full-width split backgrounds with bold typography, CTA buttons centered
**Cards:** Heading + body text + optional arrow icon, grouped in grids
**Footer:** Dark background, horizontal link list, social media icons

---

## Preset: aocyber

**Source:** [aocyber.ai](https://aocyber.ai) — AO Cyber Systems
**Mood:** Enterprise, trustworthy, privacy-focused, sophisticated minimalism
**Mode:** Dark-first

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--brand-primary-500` | `#d4a853` | Gold — primary actions, accents, trust signal |
| `--brand-primary-600` | `#b8922f` | Gold dark — hover states |
| `--brand-primary-700` | `#9a7a24` | Gold darker — active states |
| `--brand-primary-50` | `#fdf8e8` | Gold light — subtle warm backgrounds |
| `--brand-secondary-500` | `#94a3b8` | Slate — secondary elements, borders |
| `--brand-accent` | `#d4a853` | Gold — same as primary (single-accent brand) |
| `--brand-surface` | `#0f172a` | Dark navy — page background |
| `--brand-surface-alt` | `#1e293b` | Slightly lighter — card backgrounds |
| `--brand-on-surface` | `#f8fafc` | Near-white — primary text |
| `--brand-on-surface-muted` | `#94a3b8` | Slate-400 — secondary text |
| `--brand-border` | `#334155` | Slate-700 — dividers |

**Light mode overrides:**
| Token | Value |
|-------|-------|
| `--brand-surface` | `#ffffff` |
| `--brand-surface-alt` | `#f8fafc` |
| `--brand-on-surface` | `#0f172a` |
| `--brand-on-surface-muted` | `#64748b` |
| `--brand-border` | `#e2e8f0` |

### Typography

| Token | Value | Weight |
|-------|-------|--------|
| `--brand-font-display` | `Inter` | 700 (bold) |
| `--brand-font-body` | `Inter` | 400 (regular) |
| `--brand-font-mono` | `JetBrains Mono` | 400 |
| **Google Fonts URL** | `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap` | |

**Scale:**
- Display: 42px / bold (hero statement: "You don't have to be the product anymore")
- Heading: 28px / semibold (section titles)
- Subheading: 18px / medium (product names)
- Body: 16px / regular
- Small: 14px / regular

### Layout

- **Single-column hero** — Full-width with canvas particle animation background
- **Product grid** — 3x2 card grid for service/product offerings
- **Three-pillar sections** — Value proposition in three equal columns
- **Container** — Centered with generous horizontal padding
- **Border radius** — 12px (rounded-xl) on cards, 8px on buttons
- **Shadows** — Subtle with gold tint on hover (`0 0 20px rgba(212, 168, 83, 0.1)`)

### Motion

- **Canvas particle animation** — Subtle particle network effect on hero section background
  - Connected dots floating slowly
  - Low opacity, non-distracting
  - Responds to viewport resize
- **Scroll-triggered reveals** — Elements animate in on scroll via Intersection Observer
  - `data-animate` attribute triggers animation
  - Fade-up with subtle translate
  - Staggered timing for grid items
- **Hover effects** — Gold glow on interactive elements

### Component Patterns

**Navigation:** Dark background, dropdown menus with aria-expanded, logo left, CTA button right
**Buttons:** Gold primary with dark text, outlined secondary with gold border
**Hero:** Full-width dark background, large statement text, particle canvas behind
**Product cards:** Dark surface with gold accent border on hover, icon + title + description
**Value pillars:** Three columns with icon, heading, description — equal height
**Footer:** Multi-column with grouped links, company info, legal links at bottom

### Canvas Animation Reference

```javascript
// Particle network effect for hero section
class ParticleNetwork {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.particleCount = 50;
    this.maxDistance = 150;
    this.color = '#d4a853'; // brand gold
    this.opacity = 0.3;
  }
  // Particles: small circles, random position, slow drift
  // Connections: lines between particles within maxDistance
  // Resize: recalculate on viewport change
  // Performance: requestAnimationFrame, skip if tab not visible
}
```

### Scroll Animation Reference

```javascript
// Intersection Observer for scroll-triggered reveals
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-in');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
```

---

## Creating Custom Brands

When the user provides a custom brand name and description (or reference URL), build the token set by:

1. **Deriving the mood** — Map the description to: bold/subtle, warm/cool, playful/serious, minimal/rich
2. **Selecting a primary color** — Based on industry, mood, and any explicit preferences
3. **Generating the full palette** — Use the primary as seed, derive shades, choose complementary secondary
4. **Matching typography** — Select Google Fonts that match the mood
5. **Defining component patterns** — Navigation, hero, cards, footer styles that express the brand
6. **Specifying motion** — Animation level appropriate to the brand (none, subtle, expressive)

Use the two presets above as structural templates — every custom brand should produce the same token categories.

</brand_presets>
