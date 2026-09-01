# Design pre-flight

The gate a UI surface passes before it is reported complete. **A failure means
fix and re-check, not note and ship.**

> **Derived from [taste-skill](https://github.com/Leonxlnx/taste-skill) by
> Leonxlnx (MIT).** Adapted from that project's pre-flight matrix. Full
> attribution and licence: `NOTICE.md`.

Items marked **[R]** require the surface actually rendered. Reasoning about
markup is not checking. Items marked **[C]** are countable — count them, do not
estimate.

---

## Read and configuration

- [ ] Design read stated in one line, recorded in `SUMMARY.md`
- [ ] EXPRESSION / MOTION / DENSITY set, reasoned from the read, not silently
      left at defaults
- [ ] Foundation chosen: an official design system where the brief implies one,
      or an aesthetic labelled honestly as an approximation
- [ ] Redesign mode detected and audit performed, if this surface already existed
      (`design-redesign.md`)
- [ ] Dependencies verified against the project manifest before import

## The four locks

- [ ] **Colour lock** — one accent, identical across every section
- [ ] **Shape lock** — one corner-radius system, applied everywhere
- [ ] **Theme lock** — one theme for the whole surface, no section inverts
- [ ] **Icon lock** — one icon family, one stroke weight, no hand-rolled paths

## Hero and navigation **[C]**

- [ ] Hero fits the first viewport: headline ≤ 2 lines, subtext ≤ 20 words and
      ≤ 4 lines, CTA visible without scrolling
- [ ] Hero holds ≤ 4 text elements; no trust strip, pricing teaser, feature
      bullets or avatar row inside it
- [ ] Hero top padding does not float the content down the viewport
- [ ] Logo wall sits under the hero, not inside it, and uses real marks
- [ ] Navigation renders on one line at desktop, height ≤ 80px

## Section composition **[C]**

- [ ] Eyebrow count ≤ ceil(sections / 3), hero counted as one
- [ ] No layout family used twice; ≥ 4 families across 8 sections
- [ ] No 3+ consecutive image/text splits
- [ ] ≤ 1 marquee
- [ ] Grid cell count equals item count; no empty cells
- [ ] Multi-cell grids carry real visual variation in 2-3 cells
- [ ] No split headers
- [ ] Mobile collapse declared explicitly per multi-column section

## Copy **[C]**

- [ ] Every visible string re-read; nothing grammatically broken, referent-less,
      or cute-but-wrong
- [ ] No filler verbs, poetic section labels, or generic step names
- [ ] No two CTAs share an intent; no CTA label wraps at desktop
- [ ] Quotes ≤ 3 lines, attribution carries name and role
- [ ] Zero em-dashes in interface chrome (see `design-tells.md` §7 for the
      chrome-versus-body split)
- [ ] Numbers are real or explicitly labelled as sample
- [ ] One copy register

## Content and assets

- [ ] Per section: headline ≤ 8 words, paragraph ≤ 25 words, one asset or one CTA
- [ ] No data dumps; long lists use a real component, not more rows
- [ ] Real imagery present — generated, sourced, or explicitly listed as needed
- [ ] No fake product screenshot built from styled containers
- [ ] Placeholder content plausible: no stock names, round numbers, repeated
      generic avatars, or dead image links

## Interactive states

- [ ] Loading, empty and error states all implemented, not just the success state
- [ ] Every CTA passes contrast against its own background **[R]**
- [ ] Form inputs, placeholders, helper and error text all pass contrast **[R]**
- [ ] Active/press feedback present

## Motion

- [ ] Every animation justifiable in one sentence
- [ ] Motion claimed equals motion shipped
- [ ] Transform and opacity only; no layout-property animation
- [ ] No per-frame scroll listeners; no continuous pointer or scroll values in
      component state
- [ ] Animation lifecycles have cleanup
- [ ] Reduced-motion path removes movement above MOTION 3 **[R]**

## Floors — none of these are negotiable **[R]**

- [ ] Body text meets WCAG AA against its **rendered** background; semi-transparent
      layers composited before measuring
- [ ] Visible focus state on every interactive element, surviving the theme
- [ ] Standalone controls ≥ 24×24 (44×44 preferred); inline prose links exempt
- [ ] Real landmarks, correct heading order, no skipped levels
- [ ] Alt text deliberate: descriptive for content, empty for decorative
- [ ] No horizontal page scroll at 320px; wide content scrolls in its own
      container
- [ ] Rendered at 320, 768 and 1280 minimum
- [ ] Rendered in every theme the surface ships. A surface may deliberately
      commit to one theme, in which case the commitment is stated and the theme
      is painted explicitly. Having no answer is the failure.
- [ ] Dynamic viewport units for full-height sections
- [ ] Layout does not shift as images, fonts and embeds load

## Stack specifics

Run the block for the stack you are shipping. Detail in `design-stack-web.md` /
`design-stack-flutter.md`.

### Hugo + Tailwind

- [ ] Fonts self-hosted through the asset pipeline, or `preconnect` present for a
      hosted foundry; every family has a real fallback stack; `font-display: swap`
- [ ] Full-height sections use `dvh`, never `vh`
- [ ] No `window.addEventListener('scroll')` driving animation — view timeline,
      `IntersectionObserver`, or `ScrollTimeline` only
- [ ] Reduced motion gates the animation, rather than shortening it to 0.01ms
- [ ] Images through Hugo's pipeline with explicit `width`/`height`; the LCP image
      is `fetchpriority="high"` and not lazy
- [ ] CSS fingerprinted and minified
- [ ] `backdrop-filter` effects carry both an `@supports` and a
      `prefers-reduced-transparency` fallback
- [ ] Grain or noise on a fixed `pointer-events: none` layer, never on a scroller
- [ ] Icons from one vendored set through a partial; a missing icon fails the build

### Flutter + eden-ui

- [ ] Colours from `Theme.of(context).colorScheme` or `EdenColors` — no raw
      `Color(0xFF…)` or `Colors.*`
- [ ] Type from `EdenTypography`, spacing from `EdenSpacing`, radius from
      `EdenRadii`, shadow from `EdenShadows` — no raw values
- [ ] Fonts bundled in `pubspec.yaml`, not fetched at runtime
- [ ] Breakpoints via `EdenResponsive` (600 / 1024dp), not the web scale
- [ ] Every `AnimationController` disposed; no `setState` driving a per-frame value
- [ ] `MediaQuery.disableAnimationsOf` honoured above MOTION 3
- [ ] Tap targets ≥ 48×48dp
- [ ] `const` constructors used wherever possible; rebuild scope narrow
- [ ] `flutter analyze` clean; no overflow warnings in logs
- [ ] Layout survives 200% text scale

## Evidence

- [ ] Screenshots captured, or `/devflow:ui-eval` run, for anything the verifier
      will judge
- [ ] Design read and dial values recorded in `SUMMARY.md`

---

**If a single box cannot honestly be ticked, the surface is not done.**
