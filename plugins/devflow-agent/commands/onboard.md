---
description: Onboard existing projects into DevFlow with automated analysis and configuration
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/onboard.sh *)
  - Read
slash-command-tools: hidden
---

# Project Onboarding

Run the onboarding script to analyze and configure an existing project for DevFlow:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/onboard.sh $ARGUMENTS
```

## Commands

| Command | Description |
|---------|-------------|
| `analyze` | Scan project and detect tech stack, structure, commands |
| `document` | Generate design.md from analysis |
| `verify` | Create verification.json from detected commands |
| `inventory` | Identify existing features and create TRDs |
| `import <source>` | Import requirements from external documents |
| `full` | Run complete onboarding pipeline |

## Options

### Global Options
- `--target <path>` - Target project directory (default: current)
- `--force` - Overwrite existing files without prompting
- `--dry-run` - Show what would be done without making changes

### Inventory Options
- `--create-trds` - Create TRD files for detected features
- `--todos-only` - Only create TRDs from TODO/FIXME comments
- `--skip-complete` - Don't create TRDs for existing features

### Import Options
- `--source <path>` - Path to document (README.md, PRD, etc.)
- `--priority <n>` - Default priority for imported items (1-4)
- `--github-issues` - Import from GitHub issues (requires gh CLI)

## Examples

```bash
# Analyze current project
/devflow-agent:onboard analyze

# Full onboarding pipeline
/devflow-agent:onboard full

# Onboard with TRD generation for existing features
/devflow-agent:onboard full --create-trds

# Import requirements from a document
/devflow-agent:onboard import --source README.md

# Import GitHub issues as TRDs
/devflow-agent:onboard import --github-issues

# Analyze a different project
/devflow-agent:onboard analyze --target /path/to/project

# Dry run to see what would happen
/devflow-agent:onboard full --dry-run
```

## Onboarding Pipeline

The `full` command runs these phases in sequence:

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  1. analyze │────▶│  2. document │────▶│  3. verify │
└─────────────┘     └──────────────┘     └────────────┘
                                                │
                    ┌──────────────┐            │
                    │ 4. inventory │◀───────────┘
                    │  (optional)  │
                    └──────────────┘
```

### Phase 1: Analyze
- Detects tech stack (languages, frameworks, tools)
- Maps project structure (source dirs, test dirs)
- Identifies build/test/lint commands
- Locates existing documentation
- Outputs: `.devflow/analysis.json`

### Phase 2: Document
- Generates design.md from analysis
- Pre-fills tech stack section
- Maps project structure
- Outputs: `.devflow/design.md`

### Phase 3: Verify
- Creates verification checks from detected commands
- Maps commands to categories (unit, lint, type_check, build)
- Outputs: `.devflow/verification.json`

### Phase 4: Inventory (with --create-trds)
- Scans for existing routes/endpoints
- Finds TODO/FIXME comments
- Creates TRDs for discovered items
- Outputs: `.devflow/trds/TRD-*.md`

## Detection Support

### Languages
- JavaScript/TypeScript (package.json, tsconfig.json)
- Python (pyproject.toml, requirements.txt)
- Rust (Cargo.toml)
- Go (go.mod)

### Frontend Frameworks
- SvelteKit, Svelte
- Next.js, React
- Nuxt, Vue
- Angular

### Backend Frameworks
- FastAPI, Flask, Django
- Express, NestJS

### Tools
- Docker, GitHub Actions
- ESLint, Prettier
- Vitest, Jest, Playwright, pytest
- Tailwind

## Generated Files

After onboarding, your `.devflow/` directory will contain:

```
.devflow/
├── analysis.json       # Project analysis results
├── design.md           # Design document
├── verification.json   # Build verification config
├── feature_list.json   # (after /devflow-agent:features sync)
└── trds/               # Task requirement documents
    └── TRD-*.md
```

## Workflow After Onboarding

1. Review and edit `.devflow/design.md`
2. Run `/devflow-agent:verify run` to test checks
3. Run `/devflow-agent:features sync` to generate feature list
4. Create new TRDs: `/devflow-agent:trd create "Feature name"`
5. Start autonomous dev: `/devflow-agent:autonomous`
