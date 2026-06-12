---
work: bugfix
---

# 24-natural-language-routing-trigger-fixes

## Goal

Natural-language prompts route to the correct DevFlow skill at every layer:
gate-edits override phrases work at runtime via a single-turn marker,
route-intent fires on flagship phrases, BUILD stops over-matching, override
phrases / active-skill marker suppress the directive, and build vs
execute-objective triggers are disambiguated. Tests cover real PreToolUse
payload shapes.

---
*Created: 2026-06-12 (routing review follow-up)*
