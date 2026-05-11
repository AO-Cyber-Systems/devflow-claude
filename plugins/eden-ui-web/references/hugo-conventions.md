<hugo_conventions>

Reference for building and reviewing web UI with Hugo, Tailwind CSS, and eden-ui-web brand design systems.

## Project Structure

```
├── config/                    # Hugo configuration
│   └── _default/
│       ├── hugo.toml          # Site config
│       ├── menus.toml         # Navigation menus
│       └── params.toml        # Site parameters
├── content/                   # Markdown content pages
│   ├── _index.md              # Homepage
│   ├── about/
│   ├── blog/
│   └── products/
├── layouts/                   # Hugo templates
│   ├── _default/
│   │   ├── baseof.html        # Base template (head, body wrapper)
│   │   ├── list.html          # List page template
│   │   └── single.html        # Single page template
│   ├── partials/
│   │   ├── head.html          # <head> contents
│   │   ├── header.html        # Site header/nav
│   │   ├── footer.html        # Site footer
│   │   └── components/        # Reusable UI components
│   │       ├── hero.html
│   │       ├── card.html
│   │       ├── cta.html
│   │       └── ...
│   ├── shortcodes/            # Content-embeddable components
│   └── page/                  # Custom page type templates
├── assets/
│   └── css/
│       ├── main.css           # Tailwind entry point
│       └── brand.css          # Brand design tokens
├── static/                    # Static files (images, favicons)
├── data/
│   └── brand/
│       ├── config.toml        # Brand configuration
│       └── reference.md       # Brand design reference
└── hugo.toml                  # Root config (or config/ directory)
```

## Template Patterns

### Base Template (`baseof.html`)

```html
<!DOCTYPE html>
<html lang="{{ .Site.Language }}" class="dark">
<head>
  {{ partial "head.html" . }}
</head>
<body class="bg-[var(--brand-surface)] text-[var(--brand-on-surface)] font-[var(--brand-font-body)]">
  <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-[var(--brand-primary-500)] focus:text-white">
    Skip to main content
  </a>
  {{ partial "header.html" . }}
  <main id="main-content">
    {{ block "main" . }}{{ end }}
  </main>
  {{ partial "footer.html" . }}
  {{ partial "scripts.html" . }}
</body>
</html>
```

### Page Template

```html
{{ define "main" }}
  {{ partial "components/hero.html" (dict
    "title" .Params.hero_title
    "subtitle" .Params.hero_subtitle
    "cta_text" .Params.cta_text
    "cta_url" .Params.cta_url
  ) }}

  <section class="py-16 lg:py-24">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {{ .Content }}
    </div>
  </section>

  {{ partial "components/cta.html" . }}
{{ end }}
```

### Partial with Parameters

```html
{{/* layouts/partials/components/card.html */}}
{{ $title := .title }}
{{ $description := .description }}
{{ $icon := .icon | default "" }}
{{ $href := .href | default "" }}
{{ $variant := .variant | default "default" }}

<div class="rounded-[var(--brand-radius)] bg-[var(--brand-surface-alt)] border border-[var(--brand-border)] p-6 transition-all duration-200
  {{ if $href }}hover:border-[var(--brand-primary-500)] hover:shadow-lg cursor-pointer{{ end }}">
  {{ with $icon }}
    <div class="w-10 h-10 mb-4 text-[var(--brand-primary-500)]">
      {{ partial "icons" (dict "name" . "class" "w-10 h-10") }}
    </div>
  {{ end }}
  <h3 class="text-lg font-semibold mb-2">{{ $title }}</h3>
  {{ with $description }}
    <p class="text-[var(--brand-on-surface-muted)] text-sm leading-relaxed">{{ . }}</p>
  {{ end }}
</div>
```

## Tailwind + Brand Tokens

### Main CSS Entry Point (`assets/css/main.css`)

```css
@import 'brand.css';
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    scroll-behavior: smooth;
  }
  ::selection {
    background-color: var(--brand-primary-500);
    color: white;
  }
}
```

### Using Brand Tokens in Templates

Always use CSS custom properties from `brand.css` via Tailwind arbitrary values:

```html
<!-- Colors -->
<div class="bg-[var(--brand-surface)]">
<div class="text-[var(--brand-primary-500)]">
<div class="border-[var(--brand-border)]">

<!-- With dark mode (if brand has separate light/dark) -->
<div class="bg-white dark:bg-[var(--brand-surface)]">

<!-- Typography -->
<h1 class="font-[var(--brand-font-display)] text-4xl font-extrabold">
<p class="font-[var(--brand-font-body)] text-base">
```

**Anti-pattern:** Never hardcode colors directly:
```html
<!-- BAD -->
<div class="bg-purple-600 text-yellow-500">

<!-- GOOD -->
<div class="bg-[var(--brand-primary-500)] text-[var(--brand-accent)]">
```

## Hugo Functions & Pipes

### Image Processing

```html
{{ $img := resources.Get "images/hero.jpg" }}
{{ $webp := $img.Resize "1200x webp" }}
{{ $thumb := $img.Resize "400x webp" }}

<picture>
  <source srcset="{{ $webp.RelPermalink }}" type="image/webp">
  <img src="{{ $img.RelPermalink }}" alt="..." loading="lazy" class="...">
</picture>
```

### Asset Fingerprinting

```html
{{ $css := resources.Get "css/main.css" | resources.PostCSS | minify | fingerprint }}
<link rel="stylesheet" href="{{ $css.RelPermalink }}" integrity="{{ $css.Data.Integrity }}">
```

### Menu Navigation

```html
{{ range .Site.Menus.main }}
  <a href="{{ .URL }}" class="text-[var(--brand-on-surface-muted)] hover:text-[var(--brand-on-surface)] transition-colors"
     {{ if $.IsMenuCurrent "main" . }}aria-current="page" class="text-[var(--brand-primary-500)]"{{ end }}>
    {{ .Name }}
  </a>
{{ end }}
```

## Common Partials Reference

### Header/Navigation

- Dark background with brand surface color
- Logo left, navigation center or right, CTA button far right
- Mobile: hamburger menu with slide-out or overlay nav
- Sticky on scroll (optional, brand-dependent)

### Hero Section

- Full-width, generous vertical padding (py-20 lg:py-32)
- Large display text, subtitle, one or two CTA buttons
- Optional background: gradient, image, or canvas animation
- Must work at all breakpoints

### Feature/Product Grid

- 2-column on mobile, 3-column on desktop
- Card-based with icon, title, description
- Consistent spacing via gap utilities
- Hover state transitions

### Footer

- Multi-column layout with link groups
- Company info, social links
- Legal links (privacy, terms) at bottom
- Dark background matching header

## Dark Mode Implementation

```html
<!-- In head.html — prevent flash of wrong theme -->
<script>
  if (localStorage.theme === 'dark' || (!localStorage.theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
</script>
```

```html
<!-- Toggle button -->
<button onclick="document.documentElement.classList.toggle('dark'); localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';"
  aria-label="Toggle dark mode"
  class="p-2 rounded-lg hover:bg-[var(--brand-surface-alt)] transition-colors">
  <!-- Sun/Moon icon swap -->
</button>
```

## Accessibility Checklist

- [ ] Skip-to-content link as first focusable element
- [ ] Semantic HTML landmarks (header, nav, main, footer)
- [ ] Heading hierarchy: single h1, logical h2→h3 nesting
- [ ] All images have descriptive alt text
- [ ] All interactive elements have visible focus styles
- [ ] ARIA labels on icon-only buttons and links
- [ ] Color contrast ratio meets WCAG AA (4.5:1 for text)
- [ ] Mobile nav is keyboard-accessible
- [ ] Form inputs have associated labels
- [ ] `aria-current="page"` on active nav items

## Performance Checklist

- [ ] Images processed through Hugo pipeline (WebP, responsive sizes)
- [ ] CSS minified and fingerprinted
- [ ] JS minimal — no heavy frameworks for static content
- [ ] Fonts loaded with `display=swap`
- [ ] Below-fold content lazy-loaded
- [ ] Critical CSS inlined or preloaded
- [ ] Lighthouse score > 90 on all categories

</hugo_conventions>
