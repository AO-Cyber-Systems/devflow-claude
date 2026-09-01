# Design tells

The catalogue of patterns that mark an interface as generated. Loaded by the
design skills in review mode and by `design-preflight.md` before shipping.

> **Derived from [taste-skill](https://github.com/Leonxlnx/taste-skill) by
> Leonxlnx (MIT).** The catalogue below is adapted from that project's
> production-test findings. Full attribution and licence: `NOTICE.md`.

**How to use this.** These are not crimes. Most were good ideas before they
became defaults. They are *evidence*: a model reaches for them when it has not
made a decision, so their presence suggests no decision was made.

**A tell is a finding only when nothing in the brief calls for it.** A brutalist
brief genuinely wants raw hairline grids. A trading dashboard genuinely wants
status dots. When reporting one, name the justification you looked for and did
not find. Listing a pattern name alone is noise.

---

## 1. Structure

- **Three equal cards in a row.** The single most recognisable generated layout.
  Use a two-column alternating layout, an asymmetric grid, a stepped list, or a
  horizontal scroll.
- **Every section the same shape** — centred heading, centred subheading, content,
  repeat.
- **Centred everything.** Centre only when there is a real symmetric axis.
- **Three or more consecutive image/text splits.**
- **A layout family used twice** on the same surface.
- **Split headers** — big left headline, small explainer floating right.
- **Grids with empty cells**, or multi-cell grids that are all text on one flat
  background.
- **Hairlines under every row** of a long list or spec table.
- **A centred headline over a dark gradient mesh** as the hero.
- **Progress or scoring bars with filled background tracks** used as comparison
  visuals on a marketing surface.

## 2. Typography

- **Enormous headings** substituting for real hierarchy.
- **Gradient-filled display text.**
- **A serif because the surface should feel premium.** See `design-craft.md` §5.
- **Mixed-family emphasis** — a serif word dropped into a sans headline.
- **The default UI sans** on a project whose brand specifies a face.
- **Italic display words clipped at the descender.**
- **Headlines broken with a manual line break and italicised** as a default move.
- **Rotated vertical text**, unless the composition genuinely needs the vertical
  axis.

## 3. Colour

- **Pure `#000000` / `#ffffff`.**
- **Full-saturation accents**; more than one accent; the accent changing between
  sections.
- **Neon and outer glows** as a default treatment.
- **Purple-to-blue gradients and purple button glows** — the most recognisable
  generated palette.
- **Cream/bone plus brass/clay/ochre plus espresso text** on any premium-consumer
  brief. Plausible every time, which is why the brand disappears.
- **Pure-black shadows** on light surfaces.
- **A theme that flips mid-surface.**

## 4. Motion

- **Animation on everything, permanently looping.**
- **Scroll-jacking**, and taking over scroll without a reason.
- **Staggered entrance on every item** in a list.
- **Two or more marquees** on one surface.
- **Linear easing** where a spring or eased curve belongs.
- **Motion claimed but not shipped** — a high motion dial on a static page.
- **No reduced-motion path.**
- **Animating layout properties** rather than transform and opacity.

## 5. Decoration

- **Section-number eyebrows** — `001 · Features`, `02 / Capabilities`. If the
  reader can count, the number is clutter.
- **An eyebrow above every section.** Ration to one per three sections.
- **Decorative status dots** before nav items, list rows or badges. A dot should
  mean live, available or failing.
- **Grid lines, crosshairs and hairlines** added to make a surface feel designed.
- **Scroll cues.** A reader who has not scrolled is looking at the top.
- **Small-caps strips across the bottom of a hero** — `DESIGN · BUILD · SHIP`.
  Fine when the strip holds real links or real status.
- **Middle dots as the default separator.** Ration to one per metadata line;
  past that they stop separating and become texture.
- **Overlay pills and captions on images.**
- **Photo-credit captions as decoration** — real credit for a real photographer
  is fine; invented ones are affectation.
- **Version labels and build strings** in a hero or on a marketing surface —
  `v0.6`, `BETA`, `Build 0048`, `last sync 4s ago`. Devtool furniture.
- **Locale, time and weather strips**, unless place or time zone is the point.
- **Micro-meta sentences** under an eyebrow explaining what the section is about.

## 6. Placeholder content

- **Names** — not "John Doe", "Jane Smith".
- **Companies** — not "Acme", "Nexus", "Cloudly", "SmartFlow".
- **Numbers** — not `99.99%`, `10,000+`, `50%`. Real metrics are untidy.
- **Avatars** — not one generic glyph repeated.
- **Fake product screenshots built from styled containers.** The strongest single
  tell.
- **Text wordmarks standing in for a logo wall**, and category labels printed
  under each logo.
- **Dead image links.**
- **Hand-rolled decorative SVG** used to fill space.
- **A text-only page** presented as minimalism.

## 7. Interface copy

- **Filler verbs** — "elevate", "unleash", "seamless", "revolutionize",
  "next-generation", "supercharge", "delve".
- **Poetic section labels** — "From the field", "On our desks", "Field notes".
- **Generic step names** — "Step 1 / Step 2", "Phase 01". The step's verb is the
  label.
- **Mock-humble industry asides** and performative-craftsman voice.
- **Social-proof headers that hedge** — "Quietly trusted by". Say "Trusted by",
  or let the logos speak.
- **Duplicate CTA intent** — "Get in touch" and "Let's talk" on one surface.
- **CTA labels that wrap** to two lines at desktop.
- **Quotes longer than three lines**; attribution with a bare name.
- **Em-dashes in interface copy.** Models produce them at a rate that reads as
  machine-written, which makes them a frequency tell rather than a style
  question. Restructure: a period, a comma, a colon, parentheses, two sentences.
  Ranges take a hyphen.

  **Scope — chrome versus body.** The line is not marketing versus documentation:

  - **Chrome, rule applies:** nav labels, buttons, eyebrows, pills, chips, hero
    and section headings, hero standfirsts, card titles, captions, footers, empty
    states, toasts. Short strings the design places.
  - **Long-form body content, rule does not apply:** prose the reader came to
    read — documentation pages, articles, changelogs. Normal punctuation is
    correct there.

  A documentation site is both at once, which is why the split is drawn here.
  Its article text is body; its header, sidebar, hero and footer are chrome.

  This is not a rule about DevFlow's own source files or your messages to the
  user.
