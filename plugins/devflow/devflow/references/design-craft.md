# Design craft

Shared design judgement for every DevFlow surface that renders something a person
looks at. Web, Flutter, and anything else with a viewport.

The design skills already enforce *correctness*: brand tokens, dark mode,
contrast, semantic markup, performance. This file covers what correctness does
not buy, which is **taste** — whether the result looks considered or generated.

> **Derived from [taste-skill](https://github.com/Leonxlnx/taste-skill) by
> Leonxlnx (MIT).** Structure, many rules, and specific thresholds are adapted
> from that project, with DevFlow's stack and intent model substituted for its
> React/Next assumptions. Full attribution and licence: `NOTICE.md`.

**Companion files:**
- `design-tells.md` — the full catalogue of generated-look patterns
- `design-preflight.md` — the mechanical gate to run before shipping
- `design-redesign.md` — protocol for changing a surface that already exists

---

## 1. The design read

**Before writing any markup, state what you are building in one line.**

> Reading this as: a pricing page for procurement-minded B2B buyers, restrained
> editorial language, on the project's existing brand tokens with low motion.

Read these signals first:

| Signal | What to look for |
|---|---|
| **Surface kind** | Landing, marketing, dashboard, docs, settings, onboarding, editorial. |
| **Vibe words the user used** | "minimalist", "calm", "brutalist", "premium", "editorial", "playful", "serious B2B". Their words, not your preference. |
| **Reference signals** | URLs linked, screenshots pasted, products named, competitors mentioned. |
| **Audience** | A procurement panel and a design-conscious consumer want opposite things. **The audience picks the register.** |
| **Existing material** | Brand tokens, components already built, pages already shipped. On any surface that is not the first, consistency outranks novelty. |
| **Quiet constraints** | Accessibility-critical audiences, regulated industries, trust-first commerce, low bandwidth. These **override aesthetics** without discussion. |

**Ask exactly one question, or none.** Ask only when the read genuinely diverges
("closer to the marketing site or the product UI?"). A multi-question dump is a
way of avoiding the decision. If you can infer it, declare the read and build.

**Anti-default discipline.** Do not reach for: AI-purple gradients, a centred
hero over a dark mesh, three equal feature cards, glassmorphism on everything,
perpetual micro-animation, or the default UI sans. Those are the defaults every
model reaches for. Reach past them deliberately, based on the read.

---

## 2. Three dials

The read sets three dials. Every layout, motion and spacing decision below is
gated by them, so set them explicitly rather than drifting.

| Dial | 1 | 10 |
|---|---|---|
| **EXPRESSION** | perfectly symmetrical, conventional | asymmetric, art-directed |
| **MOTION** | fully static | choreographed, physics-driven |
| **DENSITY** | gallery-airy | instrument-panel packed |

### Deriving them

| Surface / signal | EXPRESSION | MOTION | DENSITY |
|---|---|---|---|
| Marketing landing | 7 | 6 | 4 |
| Agency / creative landing | 9 | 8 | 3 |
| Editorial / docs | 5 | 3 | 3 |
| Product dashboard | 4 | 3 | 7 |
| Settings / admin | 3 | 2 | 6 |
| Onboarding flow | 6 | 5 | 3 |
| Portfolio / showcase | 8 | 7 | 3 |
| Trust-first, regulated, public-sector | 3 | 2 | 5 |
| "minimalist / calm / editorial" | 5-6 | 3-4 | 2-3 |
| "premium consumer / luxury" | 7-8 | 5-7 | 3-4 |
| "playful / experimental / award-y" | 9-10 | 8-10 | 3-4 |

### What the values concretely mean

**EXPRESSION 1-3** — symmetrical grid, equal columns, equal padding, centred.
**4-7** — deliberate offsets, negative-margin overlaps, mixed aspect ratios,
left-aligned headers over centred data.
**8-10** — masonry, fractional grid columns (`2fr 1fr 1fr`), large intentional
empty zones.
**Mobile override:** at 4 and above, asymmetric desktop layouts must collapse to
a strict single column below 768px. Asymmetry is a desktop affordance.

**MOTION 1-3** — no automatic animation; hover and active states only.
**4-7** — transitions on transform and opacity, cascade delays on load.
**8-10** — scroll-driven reveals, parallax, pinned sections.

**DENSITY 1-3** — large section gaps, generous whitespace.
**4-7** — standard application spacing.
**8-10** — tight padding, hairlines instead of cards, monospace for all numerals.

### DevFlow-specific bounds

- **The brand outranks the dials.** Read `data/brand/config.toml`,
  `assets/css/brand.css` and `data/brand/reference.md` (web) or the `EdenTheme`
  configuration (Flutter) first. If the brand records a design posture, that is
  the outer boundary the dials move inside.
- **Work type caps the budget.** `prototype` or `spike` holds EXPRESSION and
  MOTION at or below 4 and spends the effort on whether the thing works. A
  `feature` on an `app` or `ui-lib` gets the full range. See `defaults-table.md`.
- **Consistency caps novelty.** The second page inherits the first page's
  language. Deviating is a decision to justify in the summary.

**Motion claimed is motion shown.** If MOTION is above 4, the surface must
actually move: entry transition, scroll reveal, hover feedback at minimum. A
static page claiming MOTION 7 is broken. If you cannot ship working motion in
the available scope, drop the dial to 3 and ship a clean static page. Never
half-build motion that breaks.

Record the dials in the job's `SUMMARY.md`.

---

## 3. Choose a foundation honestly

**The brief implies a real design system.** Enterprise dashboards, platform
surfaces, public-sector services, anything sitting inside somebody else's
product. Install and use the official package. Do not hand-reimplement its CSS,
and do not import its tokens then override most of them — that is worse than not
using it, because it looks official and behaves differently.

| Brief reads as | Reach for |
|---|---|
| Microsoft / enterprise SaaS | Fluent UI |
| Google-flavoured product | Material 3 |
| IBM-style B2B analytics | Carbon |
| GitHub-style devtool | Primer |
| Atlassian-style product | Atlaskit |
| UK public sector | GOV.UK Frontend |
| US public sector / trust-first | USWDS |
| Modern accessible React base | Radix Themes |
| Own-the-code modern SaaS | shadcn/ui, never in default state |

**The brief is an aesthetic, not a system.** Glass, bento, brutalist, editorial,
dark-tech, mesh gradients, kinetic type: none has an owner or an official
package. Build with the project's own stack and say plainly in a comment that the
implementation approximates a look rather than implementing a spec. In
particular, there is no official "liquid glass" CSS — web versions are
approximations, and should be labelled as such.

**One system per project.** Two component libraries in one tree means two sets of
tokens, two focus rings, two ideas about spacing.

**DevFlow's foundations are usually already chosen:** Hugo + Tailwind + the
project brand for web; `eden-ui-flutter` widgets + `EdenTheme` for Flutter. Reach
outside that only with a stated reason.

**Verify dependencies before importing.** Check the manifest — `package.json`,
`pubspec.yaml`, `go.mod`. If the package is missing, output the install command
first. Never assume a library exists.

---

## 4. The consistency locks

Four locks. Each is a single decision made once and then applied everywhere.
Breaking one mid-surface is the most reliable sign that no decision was made.

**Colour lock.** One accent, chosen once, used on the whole surface. A warm-grey
site does not get a blue CTA in section 7. A rose-accented site does not get a
teal badge in the footer. Maximum one accent; saturation under 80% by default.
One palette per project — do not drift between warm and cool neutrals.

**Shape lock.** One corner-radius system. All-sharp, all-soft, or a documented
rule ("buttons pill, cards 16, inputs 8") followed everywhere. Round buttons in a
square layout is broken.

**Theme lock.** The surface has one theme. Sections do not invert. No light band
sandwiched between dark sections. A deliberate one-time theme switch as a
composition device is allowed once, when the brief calls for it; random
alternation is not. Section-level tints within one theme family are fine.

**Icon lock.** One icon family, one stroke weight, set globally. Never hand-roll
icon paths — if a glyph is missing, add a second library rather than drawing it.

---

## 5. Typography

- **Establish hierarchy with weight, colour and spacing before size.** An
  enormous heading doing the work that hierarchy should do is a tell.
- **Body measure ~65ch.** Longer is unreadable, shorter is choppy.
- **Emphasis inside a headline uses italic or bold of the same family.** Injecting
  a serif word into a sans headline to add interest is amateur.
- **Italic descender clearance.** An italic display word containing `y g j p q`
  will clip at `line-height: 1`. Use 1.1 minimum and reserve bottom padding.

### Serif discipline

**Serif is not the default for "creative".** The mental model that a creative,
premium or studio brief calls for a serif is the most reliable single tell there
is. Serif is correct for genuinely editorial, publication, luxury, heritage or
manuscript registers, and for those you should be able to say why *this* serif
fits *this* brand.

For everything else — agency, studio, modern brand, premium consumer, portfolio,
lifestyle — **default to a sans display face**. Sans display is not boring; it is
the default for the same reason black is the default in tailoring.

If the project brand names a face, that decision is already made. Use it, with a
real fallback stack.

---

## 6. Colour

- **No pure `#000000` or `#ffffff`.** Off-black and off-white. Pure values kill
  depth and read as unfinished, especially on OLED.
- **Desaturate accents** so they sit within the neutral palette rather than
  vibrating against it.
- **No neon or outer glows** as a default treatment. Prefer an inner border or a
  tinted shadow. Tint shadows to the background hue; never a pure-black shadow on
  a light surface.
- **Colour never carries meaning alone.** Anything conveyed by colour needs a
  second channel: icon, label, or shape.

### Two banned default palettes

**The purple-glow default.** Violet-to-blue gradients, purple button glows and
neon accent gradients are the single most recognisable generated aesthetic. Use
neutral bases with one high-contrast accent instead. *Override:* if the brand is
genuinely purple, embrace it, and execute it with a harmonised neutral set rather
than gradient slop.

**The warm-craft default.** For premium-consumer briefs — cookware, wellness,
artisan, heritage, DTC home goods — the reliable default reach is cream or bone
backgrounds, brass/clay/ochre accents, and espresso near-black text. It is
plausible every time, which is exactly the problem: the brand becomes invisible.
Rotate to a different family: cold luxury (silver, chrome, smoke); forest (deep
green, bone, amber); black-and-tan; cobalt and cream; terracotta and slate; or
monochrome plus one saturated accent. *Override:* acceptable when the brand
explicitly names those colours and you can say why they fit this brand.

---

## 7. Layout discipline

These are countable. `design-preflight.md` checks them mechanically.

### Hero

- **Fits in the first viewport.** Headline at most 2 lines on desktop; subtext at
  most 20 words and 4 lines; CTA visible without scrolling. If the copy does not
  fit, the value proposition is unclear, not the rule too tight.
- **Font scale planned together with the asset.** A four-line hero headline is a
  font-size error, never a copy-length error.
- **Top padding capped.** Beyond roughly 6rem at desktop, hero content floats
  halfway down the viewport and reads as a bug.
- **At most 4 text elements:** one eyebrow *or* brand strip *or* neither; the
  headline; the subtext; the CTAs (one primary, at most one secondary). A trust
  micro-strip, pricing teaser, feature bullets or avatar row belong in sections
  below, not in the hero.
- **The logo wall lives under the hero, never inside it.**

### Navigation

- **One line at desktop.** If items do not fit at 1024px, shorten labels, drop
  secondary items, or collapse to a menu. A two-line desktop nav is broken.
- **Height capped around 80px**, 64-72 typical. A nav eating 15% of the viewport
  is an agency affectation.

### Sections

- **A layout family appears at most once.** Once a section uses three-column
  image cards, no other section may. Eight sections need at least four families.
- **Alternating image/text splits cap at two in a row.** The third consecutive
  zigzag fails. Break it with a full-width band, a vertical stack, a grid, or a
  different family.
- **Eyebrows ration to one per three sections**, hero included. This is the most
  frequently violated rule: every generated site puts a small uppercase label
  above every heading, producing an identical rhythm. Usually the right move is
  to drop it — the section's position already categorises it.
- **No split header.** A big left headline with a small explainer paragraph
  floating in the right column is a default, not a composition. Stack them.
- **Grids have exactly as many cells as items.** An empty tile means the grid was
  planned wrong. Multi-cell grids need real visual variation in two or three
  cells — an image, a pattern, a tint — not six text cards.
- **Mobile collapse is explicit per section.** Declare the sub-768px behaviour in
  the same component. Never assume the framework handles it.

### Cards and containers

Use a card only when elevation communicates real hierarchy. Otherwise group with
a rule, a divider, or negative space. At DENSITY above 7, generic card containers
are banned outright — dense data breathes better in plain layout.

---

## 8. Motion

**Every animation must be motivated.** Before adding one, answer in a sentence
what it communicates. Valid: hierarchy, storytelling, feedback, state transition.
Invalid: it looked good. If you cannot articulate the reason, drop it.

- **Animate transform and opacity only.** Never `top`, `left`, `width`, `height`.
- **Use spring or eased curves, not linear.**
- **Marquees cap at one per surface.** Two reads as filler.
- **Never attach a scroll listener that runs work every frame**, and never drive
  continuous pointer or scroll values through component state — it re-renders on
  every frame and collapses on mobile. Use the platform's scroll-driven
  animation, an intersection observer, or the animation library's motion values.
- **Animations with a lifecycle need explicit cleanup.**
- **Isolate heavy motion.** Do not mix two animation engines in one component
  tree; they fight over the same frames.
- **Reduced motion is mandatory above MOTION 3.** Infinite loops, parallax,
  scroll hijacking and pointer physics collapse to static. See §10.

---

## 9. Content, copy and assets

### Density

- **Per section:** a headline of 8 words or fewer, a paragraph of 25 words or
  fewer, and one asset or one CTA. More needs justification.
- **No data dumps.** A 20-row table or 30-item list on a marketing surface is the
  wrong component, not a long one. Use top-3 highlights plus a link, grouped
  clusters, a card grid, tabs, scroll-snap pills, or a carousel.
- **Long lists need a different component, not more rows.** A ten-row spec sheet
  with a hairline under every row is the laziest available layout.
- **Quotes cap at three lines.** Attribution is name plus role, never a bare name.
  Use real typographic quote marks or none.

### Copy self-audit (mandatory before shipping)

Re-read every visible string: headings, labels, buttons, body, captions, alt
text, empty states, errors. Flag and rewrite anything that is grammatically
broken, has an unclear referent, is cute-but-wrong wordplay, or reads as a model
trying to sound thoughtful. **Plain functional copy beats clever generated copy
every time.** When unsure, replace with a plain sentence.

- **One copy register per surface.** Do not mix technical mono, editorial prose
  and marketing punch unless the brand voice genuinely does.
- **Fake-precise numbers are banned** unless they come from real data or are
  explicitly labelled as sample. Do not invent engineering precision the brand
  does not claim.

### Placeholder content

Not "John Doe". Not "Acme" or "Nexus". Not `99.99%` or `10,000+`. Not the same
generic avatar six times. Real placeholder work means plausible, varied,
locale-appropriate names, untidy numbers, and believable company names.

### Assets

**A text-only page is not minimalism, it is incomplete.** Even a restrained
editorial surface needs real imagery.

Priority order:
1. **Generate assets** if an image tool is available in the environment, at the
   right aspect ratio for the section.
2. **Real or seeded photography** otherwise — a seeded placeholder service with a
   descriptive seed, or real brand assets when supplied.
3. **Labelled placeholder slots** as a last resort, plus an explicit note to the
   user listing what imagery the surface needs.

- **Never build a fake product screenshot out of styled containers.** It is the
  strongest single tell. Use a real screenshot, a real rendered component, a
  generated image, or nothing.
- **Logo walls use real logos**, not styled text wordmarks. For an invented
  brand, generate a simple monogram mark. Logos only — no category label under
  each one. Ensure they work in both themes.
- **Hand-rolled decorative SVG is discouraged**, except a single simple
  geometric mark.

### Interactive states

Generated work ships the successful state only. Always implement the full cycle:

- **Loading** — skeletons shaped like the final layout, not a generic spinner.
- **Empty** — composed, and it says how to populate.
- **Error** — inline for forms, contextual for transient failures.
- **Active** — a tactile press response.
- **Every CTA passes contrast** against its own background. White-on-white, a
  ghost button on a photo with no scrim, a transparent button with no border —
  all broken.
- **CTA labels never wrap** at desktop. Three words maximum, ideally one or two.
- **No two CTAs share an intent.** "Get in touch" plus "Let's talk" plus "Start a
  project" is one intent and needs one label used everywhere.
- **Forms:** label above the input, error below it, helper text present in
  markup. Never placeholder-as-label. Inputs, placeholders, helper and error text
  all pass contrast.

---

## 10. Floors

Not dials. They do not move for aesthetics, and a surface missing one is not
finished regardless of how it looks.

- **Contrast.** Body text at WCAG AA against its actual rendered background, in
  every theme the surface ships. Check the computed value, not the token name,
  and composite semi-transparent layers before measuring.
- **Focus.** Every interactive element has a visible focus state that survives
  the theme. Never remove an outline without replacing it.
- **Target size.** Standalone controls at least 24×24 CSS px (WCAG 2.2 AA), 44×44
  preferred. **Links inline in a sentence are exempt** — flagging them produces
  noise that buries real findings.
- **Reduced motion.** Everything above MOTION 3 has a path that removes movement
  rather than shortening it.
- **Semantics.** Real landmarks and heading order. A container with a click
  handler is not a button.
- **Alt text.** Descriptive for content, empty for decorative. Both are decisions.
- **Layout integrity.** No horizontal page scroll at 320px. Wide content scrolls
  inside its own container. Use dynamic viewport units for full-height sections;
  static viewport height jumps on mobile browsers.
- **Weight.** Hero image prioritised, below-fold images lazy, fonts subset and
  preloaded, no render-blocking script that could be deferred. Reserve space for
  images, fonts and embeds so layout does not shift.
- **Restraint in stacking.** Z-index is for real layer contexts — sticky headers,
  modals, overlays — on a documented scale, not sprinkled per element.

---

## 11. Out of scope

This guidance targets marketing surfaces, landing pages, portfolios, docs and
ordinary product screens. It does not make these better, and reaching for it
here is a mistake:

- Dense admin panels and data-heavy dashboards — use a real design system.
- Data tables — use a table library.
- Multi-step wizards, code editors, realtime collaborative surfaces.
- Native mobile conventions — follow the platform's own guidelines.

If the brief is one of these, say so, name the right tool, and apply only the
parts that genuinely transfer.
