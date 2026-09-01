# NOTICE

Third-party attributions for DevFlow.

DevFlow itself is released under the MIT License; see [`LICENSE`](./LICENSE).

---

## taste-skill

Portions of DevFlow's design guidance are **derived from
[taste-skill](https://github.com/Leonxlnx/taste-skill)** by Leonxlnx
(<https://tasteskill.dev>), used under the MIT License. The full license text and
copyright notice are reproduced below, as that license requires.

### What is derived

These files adapt substantial material — structure, rules, thresholds, and the
catalogue of patterns — from taste-skill:

| DevFlow file | Derived from |
|---|---|
| `plugins/devflow/devflow/references/design-craft.md` | `skills/taste-skill/SKILL.md` §0-§8, §13 |
| `plugins/devflow/devflow/references/design-tells.md` | `skills/taste-skill/SKILL.md` §4, §9 |
| `plugins/devflow/devflow/references/design-preflight.md` | `skills/taste-skill/SKILL.md` §14 |
| `plugins/devflow/devflow/references/design-redesign.md` | `skills/taste-skill/SKILL.md` §11 |
| `plugins/devflow/devflow/references/design-stack-web.md` | `skills/taste-skill/SKILL.md` §3, §4.1-4.2, §5, §6, Appendix C |
| `plugins/devflow/devflow/references/design-stack-flutter.md` | same sections, rewritten for Flutter |
| `plugins/devflow/devflow/references/full-output.md` | `skills/output-skill/SKILL.md` and `research/laziness/` |

Each of those files carries an attribution header pointing here.

The design skills that consume them — `eden-web:frontend-design`,
`eden-flutter:frontend-design`, `eden-web:brand-builder` — and the
`<output_completeness>` block in `plugins/devflow/agents/executor.md` are
DevFlow's own, but they exist to enforce the guidance above.

### What was changed

The material is adapted rather than vendored. Nothing is copied verbatim, and no
files from taste-skill are redistributed in this repository.

- **Stack.** taste-skill targets React, Next.js and Motion. DevFlow targets Hugo
  plus Tailwind for web and `eden-ui-flutter` plus `EdenTheme` for Flutter, so
  every framework-specific rule was rewritten against those stacks or generalised
  to be stack-neutral.
- **Dial names and derivation.** `DESIGN_VARIANCE` / `MOTION_INTENSITY` /
  `VISUAL_DENSITY` became `EXPRESSION` / `MOTION` / `DENSITY`, and derivation is
  bounded by DevFlow's brand-per-project model and the `(kind, work)` intent
  model rather than by page type alone.
- **Accessibility floors** were separated out as non-negotiable and calibrated
  against WCAG 2.2, including the inline-link exemption for target size that a
  flat 44×44 rule gets wrong.
- **Em-dash scope** was redrawn as chrome versus long-form body, because the
  original marketing-versus-documentation framing is incoherent on a
  documentation site.
- **Specific recommendations were re-grounded rather than dropped.**
  `design-stack-web.md` and `design-stack-flutter.md` carry the concrete layer:
  typeface pools and pairings, the serif rotation pool, the two palette families
  to avoid with alternatives, icon strategy, breakpoints, motion implementations
  and performance targets. Upstream these assume React, Next.js, Motion and GSAP;
  here they are rewritten against Hugo's asset pipeline and web-native scroll
  timelines, and against Flutter's widget model and the `EdenTheme` token set.
  The GSAP sticky-stack and horizontal-pan skeletons became CSS `position: sticky`
  plus view timelines on web, and `AnimationController` with disposal on Flutter.
  Exact banned hex values became named palette *families*, because DevFlow
  projects carry their own brands and a hardcoded hex list would fight the brand
  layer that is supposed to win.
- **The redesign protocol** was mapped onto DevFlow's own mechanisms: audits land
  in `CONTEXT.md`, and irreversible changes become `checkpoint:decision` items.
- **Output completeness** was connected to DevFlow's existing anti-stub
  machinery: job sizing, `SUMMARY.md` evidence, the `verify-completion` hook, and
  goal-based verification.

Where our judgement differs from taste-skill's, ours is what the files say.
taste-skill is worth reading directly for a much larger pattern catalogue, its
research notes, and a set of style-variant skills that DevFlow does not mirror.

### taste-skill license

```
MIT License

Copyright (c) 2026 Leonxlnx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Retrieved from <https://github.com/Leonxlnx/taste-skill/blob/main/LICENSE> on
2026-09-01.
