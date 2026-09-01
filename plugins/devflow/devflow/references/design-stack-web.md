# Design stack: Hugo + Tailwind

Concrete implementation for DevFlow web surfaces. `design-craft.md` says what to
decide; this file says how to build it in Hugo.

> **Adapted from [taste-skill](https://github.com/Leonxlnx/taste-skill) by
> Leonxlnx (MIT)**, whose stack section targets React, Next.js and Motion. Every
> framework-specific rule below has been rewritten for Hugo's asset pipeline and
> web-native APIs. Full attribution and licence: `NOTICE.md`.

**The brand wins.** If `data/brand/config.toml` or `assets/css/brand.css` names a
face, a colour or a radius, that is the answer. The pools below are for
`brand-builder` deriving a *new* brand, or for a surface with no brand at all.

---

## 1. Typefaces

### Loading

Hugo has no `next/font`. There are exactly two correct paths.

**Self-host through the asset pipeline (preferred).** Fastest, no third-party
connection, no consent surface:

```go-html-template
{{- $font := resources.Get "fonts/Subset-Variable.woff2" | fingerprint }}
<link rel="preload" as="font" type="font/woff2" href="{{ $font.RelPermalink }}" crossorigin>
```

```css
@font-face {
  font-family: "Brand Sans";
  src: url("/fonts/subset-variable.woff2") format("woff2-variations");
  font-weight: 300 800;          /* one variable file, not six static ones */
  font-display: swap;            /* never block first paint on a font */
  unicode-range: U+0000-00FF;    /* subset; drop ranges the site never renders */
}
```

**Hosted foundry (Adobe Fonts, and similar).** Acceptable when the brand's
licence requires it. Preconnect, and always give the family a real fallback stack
so the first paint is not invisible:

```go-html-template
<link rel="preconnect" href="https://use.typekit.net" crossorigin>
<link rel="stylesheet" href="https://use.typekit.net/{{ site.Params.typekit }}.css">
```

**Never a bare `<link>` to a font CDN in production without `preconnect`**, and
never without a fallback stack in the CSS. A render-blocking third-party
stylesheet in `<head>` is the most common avoidable LCP regression on a Hugo
site.

### Choosing a face

**Do not default to the ubiquitous UI sans.** It is the single most common
generated-site typeface, and reaching for it signals no decision was made.
Acceptable when the brief explicitly wants a neutral, system-standard feel, or on
an accessibility-first public-sector surface.

Rotate display sans from this pool rather than reusing one across projects:
Geist, Outfit, Satoshi, Cabinet Grotesk, General Sans, PP Neue Montreal,
GT Walsheim, Söhne, Switzer.

Pairings that work: Geist + Geist Mono; Satoshi + JetBrains Mono;
Cabinet Grotesk + IBM Plex Mono; General Sans + Geist Mono.

**Serif discipline.** A serif is not the reward for a "creative" brief — see
`design-craft.md` §5. When one is genuinely justified, rotate from: PP Editorial
New, GT Sectra, Reckless Neue, Tiempos Headline, Recoleta, EB Garamond, Canela,
Domaine Display, Playfair Display. **Avoid Fraunces and Instrument Serif** as
defaults specifically; they are the two most over-reached display serifs.

{{/* If the project brand names a face, ignore all of the above. */}}

### Mechanics

```css
/* Body measure. Anything past ~75ch is unreadable. */
.prose { max-width: 65ch; }

/* Italic display words containing y g j p q clip at line-height 1. */
.display em { line-height: 1.1; padding-bottom: 0.08em; }
```

---

## 2. Colour

Use CSS custom properties from `assets/css/brand.css`, referenced through
Tailwind arbitrary values (`bg-[var(--brand-primary-500)]`) or a Tailwind theme
extension. Never a raw hex in a template.

**Two palettes to avoid reaching for by default** (full reasoning in
`design-craft.md` §6):

| Default reach | Why it fails | Rotate to |
|---|---|---|
| Violet-to-blue gradients, purple button glows, neon accent | The most recognisable generated aesthetic | Neutral base plus one high-contrast accent |
| Cream/bone background + brass/clay/ochre accent + espresso text, on any premium-consumer brief | Plausible every time, so the brand disappears | Cold luxury (silver, chrome, smoke); forest (deep green, bone, amber); black-and-tan; cobalt and cream; terracotta and slate; monochrome plus one saturated accent |

Both are overridden by an explicit brand decision. A brand that *is* purple stays
purple.

### Dark mode

Follow the project's existing strategy — `hugo-conventions.md` uses a `dark`
class on `<html>` with the anti-flash inline script. Pick one strategy per
project and hold it:

- **Tailwind `dark:` variants** — every colour utility paired.
- **CSS variables swapped** under `.dark` or `prefers-color-scheme`.

Do not mix them in one project. Verify contrast against the **rendered**
background in both themes, compositing any semi-transparent layer first — a token
name tells you nothing about the composite.

---

## 3. Icons

There is no React icon package in Hugo, so the pattern is different from the
upstream advice but the rules are the same.

**Vendor one icon set into `assets/icons/` and render through a partial.**
Phosphor, Tabler, Radix and Heroicons all ship plain SVG files suitable for this.

```go-html-template
{{/* layouts/partials/icon.html — {{ partial "icon.html" (dict "name" "arrow-right" "size" 20) }} */}}
{{- $name := .name }}
{{- $size := .size | default 20 }}
{{- with resources.Get (printf "icons/%s.svg" $name) }}
  {{- $svg := .Content | replaceRE `<svg([^>]*)>` (printf `<svg$1 width="%d" height="%d" aria-hidden="true" focusable="false">` $size $size) }}
  {{- $svg | safeHTML }}
{{- else }}
  {{- errorf "icon %q not found in assets/icons/" $name }}
{{- end }}
```

- **One family per project.** Mixing sets gives you two stroke weights and two
  optical sizes.
- **One stroke width**, set globally.
- **Never hand-roll icon paths.** If a glyph is missing, add it from the same set
  or vendor a second set deliberately — do not draw it.
- The `errorf` branch matters: a missing icon should fail the build, not render
  an empty gap nobody notices.
- Icon-only controls need an accessible name on the control, not on the SVG.

**Emoji are discouraged** in markup, UI text and headings. Use a real glyph.
Acceptable only when the brief genuinely wants a playful or chat-native register.

---

## 4. Layout mechanics

```css
/* Full-height sections: dvh, never vh. Static vh jumps when mobile browser
   chrome hides, which reads as a layout bug. */
.hero { min-height: 100dvh; }
```

- **Grid, not flex percentage arithmetic.** `grid-cols-1 md:grid-cols-3 gap-6`
  beats `w-[calc(33%-1rem)]` every time, and it survives a changed gap.
- **Container** at a fixed max width with auto margins, one value per project.
- **Tailwind breakpoints** as shipped: `sm` 640, `md` 768, `lg` 1024, `xl` 1280,
  `2xl` 1536. Do not invent a parallel scale.
- **Asymmetric layouts collapse to a single column below `md`.** Asymmetry is a
  desktop affordance; see `design-craft.md` §2.
- **Wide content scrolls inside its own container**, never the page. Tables and
  wide code blocks get `overflow-x: auto` on a wrapper; in Hugo, add a
  `render-table.html` render hook so markdown tables are wrapped automatically.

---

## 5. Motion

Hugo ships no animation runtime, which is a feature: web-native APIs cover
everything DevFlow surfaces need and cost no bundle.

**Reveal on scroll — CSS scroll-driven animation.** No JavaScript at all where
supported:

```css
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .reveal {
      animation: reveal-in linear both;
      animation-timeline: view();
      animation-range: entry 10% cover 30%;
    }
    @keyframes reveal-in {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: none; }
    }
  }
}
```

**Reveal fallback — IntersectionObserver**, for browsers without view timelines:

```js
// One observer for the whole page. Unobserve after firing: these are one-shot.
if (!CSS.supports('animation-timeline: view()') &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-revealed');
      io.unobserve(e.target);
    }
  }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}
```

**Sticky stacking and pinned sections** are `position: sticky` plus a scroll
timeline. They do not need a scroll-hijack library:

```css
.stack-card { position: sticky; top: 0; min-height: 100dvh; }
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .stack-card { animation: recede linear both; animation-timeline: view(); animation-range: exit 0% exit 100%; }
    @keyframes recede { to { transform: scale(0.94); opacity: 0.55; } }
  }
}
```

### Hard rules

- **Never `window.addEventListener('scroll', ...)`** for animation. It runs every
  frame, unbatched. Use a view timeline, an IntersectionObserver, or
  `ScrollTimeline`.
- **Animate `transform` and `opacity` only.** Never `top`, `left`, `width`,
  `height` — they trigger layout on every frame.
- **`will-change` sparingly**, only on elements that genuinely animate, and
  removed afterwards.
- **Reduced motion is a gate, not a speed-up.** Wrap motion in
  `prefers-reduced-motion: no-preference` rather than shortening durations to
  `0.01ms` and calling it done — a 0.01ms transform still moves.
- **One marquee per surface**, and it pauses on hover and under reduced motion.

---

## 6. Glass and heavy effects

There is no official "liquid glass" package for the web. What is achievable is a
frosted-glass approximation. Label it as one in a comment, and always give it a
solid fallback:

```css
.glass {
  background: color-mix(in srgb, var(--brand-surface) 62%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand-on-surface) 12%, transparent);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  /* The inner highlight is what reads as a physical edge. Without it this is
     just a blurred box. */
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--brand-on-surface) 16%, transparent);
}

/* Support is uneven and the effect is expensive. Both fallbacks are required. */
@supports not (backdrop-filter: blur(1px)) {
  .glass { background: var(--brand-surface); }
}
@media (prefers-reduced-transparency: reduce) {
  .glass { background: var(--brand-surface); backdrop-filter: none; -webkit-backdrop-filter: none; }
}
```

**Grain and noise overlays** go on a single fixed, `pointer-events: none`
pseudo-element. Never on a scrolling container: continuous repaint of a noise
layer destroys scroll performance on mobile.

---

## 7. Performance

Hugo's asset pipeline does most of this; the failure mode is not using it.

```go-html-template
{{/* Responsive, modern-format images through the pipeline. */}}
{{- $img := resources.Get "images/hero.jpg" }}
{{- $w1200 := $img.Resize "1200x webp q82" }}
{{- $w600  := $img.Resize "600x webp q82" }}
<img src="{{ $w1200.RelPermalink }}"
     srcset="{{ $w600.RelPermalink }} 600w, {{ $w1200.RelPermalink }} 1200w"
     sizes="(max-width: 768px) 100vw, 1200px"
     width="{{ $w1200.Width }}" height="{{ $w1200.Height }}"
     alt="…"
     {{ if .above_fold }}fetchpriority="high"{{ else }}loading="lazy" decoding="async"{{ end }}>
```

- **Always emit `width` and `height`.** Missing intrinsic size is the largest
  single cause of layout shift.
- **The hero image is `fetchpriority="high"` and never lazy.** Lazy-loading the
  LCP element delays the metric it defines.
- **Fingerprint and minify CSS**, and ship `integrity`.
- **No heavy framework for static content.** If a page needs 40 lines of
  JavaScript, write 40 lines.
- **Targets:** LCP under 2.5s, INP under 200ms, CLS under 0.1. Run Lighthouse
  before calling a surface done — `hugo server` on the project's port, then audit.

---

## 8. Dependency verification

Before importing anything, check it exists. Do not assume.

```bash
# Node tooling (Tailwind, PostCSS)
test -f package.json && grep -q '"tailwindcss"' package.json

# Hugo modules
hugo mod graph 2>/dev/null | head

# Hugo itself: extended is required for Sass; check before writing .scss
hugo version | grep -q extended || echo "no extended build: plain CSS only"
```

If a package is missing, output the install command before writing code against
it.
