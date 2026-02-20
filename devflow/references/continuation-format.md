# Continuation Format

Standard format for presenting next steps after completing a command or workflow.

## Core Structure

```
---

## ▶ Next Up

**{identifier}: {name}** — {one-line description}

`{command to copy-paste}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `{alternative option 1}` — description
- `{alternative option 2}` — description

---
```

## Format Rules

1. **Always show what it is** — name + description, never just a command path
2. **Pull context from source** — ROADMAP.md for objectives, JOB.md `<objective>` for plans
3. **Command in inline code** — backticks, easy to copy-paste, renders as clickable link
4. **`/clear` explanation** — always include, keeps it concise but explains why
5. **"Also available" not "Other options"** — sounds more app-like
6. **Visual separators** — `---` above and below to make it stand out

## Variants

### Execute Next Plan

```
---

## ▶ Next Up

**02-03: Refresh Token Rotation** — Add /api/auth/refresh with sliding expiry

`/df:execute-objective 2`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- Review plan before executing
- `/df:list-objective-assumptions 2` — check assumptions

---
```

### Execute Final Plan in Objective

Add note that this is the last plan and what comes after:

```
---

## ▶ Next Up

**02-03: Refresh Token Rotation** — Add /api/auth/refresh with sliding expiry
<sub>Final plan in Objective 2</sub>

`/df:execute-objective 2`

<sub>`/clear` first → fresh context window</sub>

---

**After this completes:**
- Objective 2 → Objective 3 transition
- Next: **Objective 3: Core Features** — User dashboard and settings

---
```

### Plan a Objective

```
---

## ▶ Next Up

**Objective 2: Authentication** — JWT login flow with refresh tokens

`/df:plan-objective 2`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/df:discuss-objective 2` — gather context first
- `/df:research-objective 2` — investigate unknowns
- Review roadmap

---
```

### Objective Complete, Ready for Next

Show completion status before next action:

```
---

## ✓ Objective 2 Complete

3/3 jobs executed

## ▶ Next Up

**Objective 3: Core Features** — User dashboard, settings, and data export

`/df:plan-objective 3`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/df:discuss-objective 3` — gather context first
- `/df:research-objective 3` — investigate unknowns
- Review what Objective 2 built

---
```

### Multiple Equal Options

When there's no clear primary action:

```
---

## ▶ Next Up

**Objective 3: Core Features** — User dashboard, settings, and data export

**To plan directly:** `/df:plan-objective 3`

**To discuss context first:** `/df:discuss-objective 3`

**To research unknowns:** `/df:research-objective 3`

<sub>`/clear` first → fresh context window</sub>

---
```

### Milestone Complete

```
---

## 🎉 Milestone v1.0 Complete

All 4 objectives shipped

## ▶ Next Up

**Start v1.1** — questioning → research → requirements → roadmap

`/df:new-milestone`

<sub>`/clear` first → fresh context window</sub>

---
```

## Pulling Context

### For objectives (from ROADMAP.md):

```markdown
### Objective 2: Authentication
**Goal**: JWT login flow with refresh tokens
```

Extract: `**Objective 2: Authentication** — JWT login flow with refresh tokens`

### For plans (from ROADMAP.md):

```markdown
Jobs:
- [ ] 02-03: Add refresh token rotation
```

Or from JOB.md `<objective>`:

```xml
<objective>
Add refresh token rotation with sliding expiry window.

Purpose: Extend session lifetime without compromising security.
</objective>
```

Extract: `**02-03: Refresh Token Rotation** — Add /api/auth/refresh with sliding expiry`

## Anti-Patterns

### Don't: Command-only (no context)

```
## To Continue

Run `/clear`, then paste:
/df:execute-objective 2
```

User has no idea what 02-03 is about.

### Don't: Missing /clear explanation

```
`/df:plan-objective 3`

Run /clear first.
```

Doesn't explain why. User might skip it.

### Don't: "Other options" language

```
Other options:
- Review roadmap
```

Sounds like an afterthought. Use "Also available:" instead.

### Don't: Fenced code blocks for commands

```
```
/df:plan-objective 3
```
```

Fenced blocks inside templates create nesting ambiguity. Use inline backticks instead.
