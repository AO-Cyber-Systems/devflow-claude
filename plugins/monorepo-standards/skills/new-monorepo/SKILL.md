---
name: new-monorepo
description: |
  Stamp a new polyglot monorepo using the AO Cyber Systems scaffold — root CLAUDE.md with Layout table, per-area CLAUDE.md, path-filtered CI workflows, comprehensive .gitignore, and the no-binaries pre-commit hook config.
  Use this for new product monorepos (the 5-monorepo architecture: aodex, aosentry, eden-biz, politihub, aohealth, plus future ones).
  Triggers on: "new monorepo", "scaffold a monorepo", "set up a monorepo", "create a new product monorepo".
argument-hint: "<slug> [--name 'Product Name'] [--areas go,flutter,admin,proto] [--target /path]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Stamp the `monorepo-scaffold` template into a target directory so the new repo starts compliant with the monorepo-doctor checks:

1. Root `CLAUDE.md` with a Layout table
2. Per-area `CLAUDE.md` for every selected area (go / flutter / admin / proto)
3. `.gitignore` covering Go + Flutter + Node + native build artifacts
4. `.devflow/no-binaries.yml` (active by default once the plugin is installed)
5. Per-area GitHub Actions workflows with `paths:` filters
6. `monorepo-doctor.yml` workflow that runs on every PR

The skill is opinionated about the four standard areas. Product-specific extras (mobile/, pos/, api-dart/) should be added by the user after scaffolding and reflected in the Layout table.
</objective>

<context>
Arguments: $ARGUMENTS

Expected forms:
- `<slug>` — minimum; product name defaults to title-cased slug, target defaults to `./<slug>`
- `<slug> --name "Eden Biz" --areas go,flutter --target /tmp/eden-biz`

Standard areas: `go`, `flutter`, `admin`, `proto`. Anything else fails.
</context>

<process>

**1. Resolve plugin root.**

The template lives at `${CLAUDE_PLUGIN_ROOT}/templates/monorepo-scaffold/`. The CLI is `${CLAUDE_PLUGIN_ROOT}/skills/new-monorepo/lib/cli.js`.

**2. Confirm the plan with the user.**

Before stamping, summarise:
- Slug, name, description, target path
- Selected areas
- Files that will be written

Wait for confirmation unless `--yes` or `--force` was passed.

**3. Stamp the template.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/new-monorepo/lib/cli.js" \
  --slug "<slug>" \
  --name "<name>" \
  --description "<desc>" \
  --areas "<comma-separated>" \
  --target "<target>"
```

**4. Validate.**

Run the doctor against the new repo to confirm it's clean:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/monorepo-doctor/lib/cli.js" --root "<target>"
```

Exit code 0 = success.

**5. Suggest next steps.**

- `cd <target> && git init && git add . && git commit -m "chore: scaffold from monorepo-standards"`
- Push to GitHub
- Enable the `monorepo-standards` plugin in `.claude/settings.json` so the no-binaries hook is active for all collaborators (see plugin README)

</process>

<when_to_use>
**Use new-monorepo for:**
- Creating a new product monorepo from scratch
- Re-scaffolding an existing repo into the standard layout (use `--force` carefully)

**Do NOT use for:**
- Adding a new area to an existing monorepo (just create the directory + CLAUDE.md manually and update the Layout table)
- Single-language repos (use language-native init: `cargo new`, `go mod init`, etc.)
</when_to_use>
