---
title: "Design craft"
weight: 35
lede: "Seven references that give DevFlow's design skills taste: reading a brief, tuning dials, a catalogue of generated-look patterns, a mechanical pre-flight gate, and a redesign protocol."
---

DevFlow's design skills already enforce correctness: brand tokens, dark mode,
contrast, semantic markup, performance budgets. Correctness does not buy taste. A
surface can pass every one of those checks and still look generated, because the
model reached for a default instead of making a decision.

Seven references close that gap. They ship in the DevFlow runtime, so every design
skill loads the same judgement:

| Reference | Covers | Loaded by |
|---|---|---|
| `design-craft.md` | Design read, three dials, four consistency locks, typography, colour, layout discipline, motion, content, floors | Both design skills, `brand-builder` |
| `design-tells.md` | The catalogue of generated-look patterns, seven categories | Both design skills |
| `design-preflight.md` | The gate run before a surface is called done | Both design skills |
| `design-redesign.md` | Changing a surface that already exists | On demand, when redesign mode is detected |
| `design-stack-web.md` | Hugo + Tailwind: font loading, icons, breakpoints, motion, performance | `eden-web:frontend-design`, `brand-builder` |
| `design-stack-flutter.md` | Flutter + eden-ui: `EdenTheme` tokens, motion, states, performance | `eden-flutter:frontend-design` |
| `full-output.md` | Output-completeness enforcement | The `executor` agent |

```text
~/.claude/devflow/references/
```

That last one is not a design concern. It applies to every agent that writes
files, and it is wired into the executor.

## Which skills use them

| Skill | Plugin | What it gained |
|---|---|---|
| `eden-web:frontend-design` | `eden-ui-web` | Design read, redesign detection, tells audit, pre-flight gate |
| `eden-flutter:frontend-design` | `eden-ui-flutter` | Same, with `/devflow:ui-eval` as the evidence step |
| `eden-web:brand-builder` | `eden-ui-web` | Records a per-brand design posture the others inherit |
| `executor` (agent) | `devflow` | `<output_completeness>`: scope locking and a placeholder ban |

The design skills live in companion plugins from the same marketplace. The
references live in the `devflow` plugin runtime because that is the one every
install has, and because `@~/.claude/devflow/references/...` resolves at runtime
where a repo-relative path does not.

## The four moves

### 1. State a design read

Before any markup, one line naming the surface kind, the audience, the visual
language and the foundation:

> Reading this as: a pricing page for procurement-minded B2B buyers, restrained
> editorial language, on the project's existing brand tokens with low motion.

The read forces decisions that otherwise get made by accident — most importantly
that **the audience picks the register**, not the agent's preference. If the read
is genuinely ambiguous, the skill asks exactly one question. Not a questionnaire;
a questionnaire is a way of avoiding the decision.

### 2. Set three dials

| Dial | 1 | 10 |
|---|---|---|
| `EXPRESSION` | symmetrical, conventional | asymmetric, art-directed |
| `MOTION` | static | choreographed |
| `DENSITY` | gallery-airy | instrument-panel |

Derived from the surface kind, then bounded by two DevFlow-specific rules:

- **The brand outranks the dials.** A deliberately restrained brand caps
  `EXPRESSION` even on a landing page. `brand-builder` now records a design
  posture — including an explicit *"deliberately not"* line — so the boundary is
  settled once per brand rather than re-derived per page.
- **Work type caps the budget.** An objective whose `work` is `prototype` or
  `spike` holds `EXPRESSION` and `MOTION` at or below 4 and spends the effort on
  whether the thing functions. See the
  [intent model](/docs/concepts/intent-model/).

Dial values get recorded in the job's `SUMMARY.md`, so a reviewer can tell
whether restraint was a decision or an omission.

### 3. Sweep the tells

A catalogue of what generated interfaces look like, organised as a review
checklist: structure, typography, colour, motion, decoration, placeholder
content, and interface copy.

Most of these were good ideas before they became defaults. They are tells because
a model reaches for them when it has not made a decision — so their presence is
evidence, not a crime. Representative entries:

- Three equal feature cards in a row; every section the same centred shape
- Section-number eyebrows (`001 · Features`), decorative status dots, scroll cues
- Pure `#000`, full-saturation accents, gradient display text
- `div`-built fake product screenshots in a hero
- Placeholder tells: "John Doe", "Acme", `99.99%`, repeated generic avatars
- Copy tells: "elevate", "seamless", "Step 1 / Step 2", version stamps on
  marketing pages, em-dashes in interface strings

{{< callout title="A tell is a finding only when the brief does not call for it" >}}
The skills are instructed to name the justification they looked for rather than
listing a pattern name on its own. A brutalist brief genuinely wants raw hairline
grids; a trading dashboard genuinely wants status dots. The rule is that the
pattern needs a reason, not that the pattern is banned.
{{< /callout >}}

### 4. Clear the floors, then pre-flight

Floors are not dials and do not move for aesthetics: AA contrast in both themes,
visible focus, 44×44 targets, a real `prefers-reduced-motion` path, semantic
landmarks, deliberate alt text, no horizontal scroll at 320px.

The pre-flight check is a **gate**, not a checklist to note. A failure means fix
and re-check. Three of its items need actual rendering — both themes, the
320/768/1280 breakpoints, and evidence capture — because reasoning about markup
is not checking.

For Flutter, [`/devflow:ui-eval`](/docs/guides/ui-eval/) is the stronger evidence
path: it scores every declared state offline and writes output the verifier
consumes, which catches the usual gap of a widget test that exercises the happy
path and ignores loading, empty and error.

## The stack layer

The principles are stack-neutral; the recommendations are not. Upstream they
assume React, Next.js, Motion and GSAP. Here they are re-grounded twice:

| Upstream | Hugo + Tailwind | Flutter + eden-ui |
|---|---|---|
| `next/font` | Self-host via `resources.Get` + `@font-face`, or `preconnect` for a hosted foundry | Bundle in `pubspec.yaml`; never fetch at runtime |
| React icon packages | One vendored SVG set rendered through a partial that `errorf`s on a miss | One icon family, one optical weight, `tooltip` as accessible name |
| GSAP `ScrollTrigger` sticky-stack | `position: sticky` plus `animation-timeline: view()` | `AnimationController` with disposal, `AnimatedBuilder` with a `child` |
| Motion `useMotionValue` | `IntersectionObserver` fallback; never a scroll listener | Never `setState` per frame; `ValueListenable` or a controller |
| `min-h-[100dvh]` | Same — `dvh`, never `vh` | `EdenResponsive` bands at 600 / 1024dp |
| Exact banned hex values | Named palette *families* to avoid, with alternatives | Same, applied at brand-authoring time |
| `npm install …` | `hugo mod graph`, `hugo version \| grep extended` | `flutter pub get`, `flutter analyze` |

Two details worth calling out, because they are easy to get wrong in both
directions:

- **Target sizes differ by platform.** The web floor is 24×24 CSS px under WCAG
  2.2 with inline links exempt; Flutter's is 48×48dp under Material. Carrying one
  number across produces either false findings or missed ones.
- **Reduced motion is a gate, not a speed-up.** Collapsing every transition to
  `0.01ms` still moves the element. On web, wrap the animation in
  `prefers-reduced-motion: no-preference`; on Flutter, branch on
  `MediaQuery.disableAnimationsOf`.

## Attribution

DevFlow's design guidance is **derived from
[taste-skill](https://github.com/Leonxlnx/taste-skill)** by Leonxlnx, used under
the MIT License. This is derivation, not inspiration: structure, many rules, and
specific thresholds are adapted from that project, and the MIT license text and
copyright notice are reproduced in
[`NOTICE.md`](https://github.com/AO-Cyber-Systems/devflow-claude/blob/main/NOTICE.md)
as that license requires. Every derived file carries an attribution header.

Nothing is copied verbatim and no taste-skill files are redistributed. The
material was adapted rather than vendored:

- **Stack.** taste-skill targets React, Next.js and Motion; DevFlow targets Hugo
  plus Tailwind and `eden-ui-flutter`, so framework-specific rules were rewritten
  or generalised.
- **Dials** were renamed and their derivation bounded by DevFlow's
  brand-per-project model and the [intent model](/docs/concepts/intent-model/).
- **Accessibility floors** were separated out as non-negotiable and calibrated
  against WCAG 2.2, including the inline-link exemption a flat 44×44 rule gets
  wrong.
- **Named typefaces, exact banned hex values and vendor install commands** were
  dropped in favour of stack-neutral principles, since DevFlow projects carry
  their own brands.

taste-skill is worth reading directly for a much larger pattern catalogue, its
research notes on model truncation, and a set of style-variant skills DevFlow
does not mirror.
