# TRD-001: Project Onboarding System

## Metadata
| Field | Value |
|-------|-------|
| ID | TRD-001 |
| Status | in_progress |
| Priority | 1 |
| Effort | large |
| Created | 2026-02-05 |
| Updated | 2026-02-05 |

## Description

Implement a comprehensive project onboarding system that allows DevFlow to be adopted into existing codebases. The onboarding process analyzes the project structure, detects the tech stack, understands existing build/test infrastructure, and sets up the DevFlow configuration accordingly.

This addresses the current gap where DevFlow is designed primarily for greenfield projects. Existing projects need a way to:
1. Analyze their codebase structure and patterns
2. Document existing architecture
3. Configure verification checks based on existing tooling
4. Optionally inventory existing features as completed TRDs
5. Import requirements from existing documentation

## Acceptance Criteria

- [x] `onboard analyze` scans project and detects tech stack, build commands, test commands
- [x] `onboard document` generates design.md from analysis results
- [x] `onboard verify` creates verification.json from detected commands
- [x] `onboard inventory` identifies existing features and optionally creates TRDs
- [x] `onboard import` extracts requirements from README, PRD, or other docs
- [x] `onboard full` runs complete onboarding pipeline
- [x] Analysis output is saved to `.devflow/analysis.json` for reference
- [x] Non-destructive - preserves existing .devflow content unless explicitly overwritten
- [x] Works with Node/npm, Python/Poetry, and mixed projects
- [x] Detects common patterns: SvelteKit, FastAPI, Next.js, Express, Django, etc.

## Dependencies

### Blocked By
- None

### Blocks
- None

## Technical Approach

### Overview

The onboarding system is a multi-phase pipeline:

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   analyze   │────▶│   document   │────▶│   verify   │
└─────────────┘     └──────────────┘     └────────────┘
       │                                        │
       │            ┌──────────────┐            │
       └───────────▶│  inventory   │◀───────────┘
                    └──────────────┘
                           │
                    ┌──────────────┐
                    │    import    │
                    └──────────────┘
```

Each phase can run independently or as part of the `full` pipeline.

### Files to Create/Modify

1. `scripts/onboard.sh` - Main onboarding script with subcommands
2. `commands/onboard.md` - Command registration for `/devflow-agent:onboard`

### Analysis Phase (`onboard analyze`)

Scans the project to detect:

**Project Structure:**
- Root directory files (package.json, pyproject.toml, Cargo.toml, etc.)
- Source directories (src/, lib/, app/, etc.)
- Test directories (tests/, __tests__/, spec/, etc.)
- Configuration files

**Tech Stack Detection:**
```yaml
detectors:
  # Frontend frameworks
  svelte: ["svelte.config.js", "svelte.config.ts"]
  sveltekit: ["svelte.config.js" + "src/routes"]
  next: ["next.config.js", "next.config.mjs"]
  react: ["package.json contains react"]
  vue: ["vue.config.js", "package.json contains vue"]
  angular: ["angular.json"]

  # Backend frameworks
  fastapi: ["pyproject.toml contains fastapi"]
  django: ["manage.py", "settings.py"]
  flask: ["pyproject.toml contains flask"]
  express: ["package.json contains express"]
  nestjs: ["nest-cli.json"]

  # Languages/runtimes
  typescript: ["tsconfig.json"]
  python: ["pyproject.toml", "requirements.txt", "setup.py"]
  rust: ["Cargo.toml"]
  go: ["go.mod"]

  # Tools
  docker: ["Dockerfile", "docker-compose.yml"]
  github_actions: [".github/workflows"]
  eslint: [".eslintrc*", "eslint.config.*"]
  prettier: [".prettierrc*"]
  vitest: ["vitest.config.*"]
  jest: ["jest.config.*"]
  pytest: ["pytest.ini", "pyproject.toml contains pytest"]
```

**Build/Test Command Detection:**
- Parse package.json scripts
- Parse Makefile targets
- Parse pyproject.toml scripts
- Common patterns: `npm run build`, `npm test`, `make test`, `poetry run pytest`

**Output:** `.devflow/analysis.json`
```json
{
  "version": "1.0",
  "analyzed_at": "2026-02-05T10:00:00Z",
  "project": {
    "name": "my-project",
    "root": "/path/to/project"
  },
  "structure": {
    "source_dirs": ["src", "lib"],
    "test_dirs": ["tests", "src/__tests__"],
    "config_files": ["package.json", "tsconfig.json"],
    "has_monorepo": false
  },
  "tech_stack": {
    "languages": ["typescript", "python"],
    "frameworks": {
      "frontend": "sveltekit",
      "backend": "fastapi"
    },
    "tools": ["docker", "eslint", "vitest", "pytest"]
  },
  "commands": {
    "build": ["npm run build"],
    "test": ["npm test", "poetry run pytest"],
    "lint": ["npm run lint", "poetry run ruff check ."],
    "type_check": ["npm run check", "poetry run mypy ."],
    "dev": ["npm run dev"]
  },
  "existing_docs": {
    "readme": "README.md",
    "prd": null,
    "architecture": null
  }
}
```

### Document Phase (`onboard document`)

Generates `.devflow/design.md` from analysis:

1. Uses analysis.json to select appropriate template
2. Pre-fills tech stack section from detected tools
3. Pre-fills project structure from actual structure
4. Identifies placeholder sections that need manual completion
5. Preserves existing design.md content if present (offers merge)

### Verify Phase (`onboard verify`)

Creates `.devflow/verification.json` from detected commands:

1. Maps detected commands to verification categories:
   - `npm test` / `pytest` → unit tests
   - `npm run test:integration` → integration tests
   - `npm run lint` / `ruff check` → lint
   - `npm run check` / `tsc` / `mypy` → type_check
   - `npm run build` → build

2. Sets appropriate detection files for auto-enable
3. Estimates timeouts based on command type
4. Marks common patterns as required vs optional

### Inventory Phase (`onboard inventory`)

Analyzes existing code to identify features:

**Methods:**
1. **Route scanning** - Identify pages/endpoints
   - SvelteKit: `src/routes/**/+page.svelte`
   - Next.js: `pages/**/*.tsx`, `app/**/page.tsx`
   - FastAPI: `@app.get`, `@app.post`, etc.
   - Express: `router.get`, `router.post`, etc.

2. **Component scanning** - Major UI components
   - Look for feature directories
   - Identify shared vs feature-specific components

3. **TODO/FIXME scanning** - Existing work items
   - Extract TODO comments from codebase
   - Convert to potential TRDs

4. **Test coverage** - What's already tested
   - Map tests to features
   - Identify untested areas

**Output Options:**
- `--dry-run` - Show what would be created
- `--create-trds` - Actually create TRD files (status=complete for existing features)
- `--todos-only` - Only create TRDs from TODOs (status=pending)

### Import Phase (`onboard import`)

Imports requirements from external sources:

**Supported Sources:**
- README.md - Extract features/roadmap sections
- PRD documents (markdown)
- GitHub issues (via `gh` CLI)
- Linear issues (if configured)
- Plain text requirement lists

**Process:**
1. Parse source document
2. Identify requirement-like sections
3. Extract individual requirements
4. Generate TRD drafts with:
   - Name from requirement title
   - Description from requirement body
   - Status: pending
   - Priority: inferred or default

**Options:**
- `--source <path>` - Path to document or URL
- `--dry-run` - Show what would be imported
- `--priority <n>` - Default priority for imported items

### Full Pipeline (`onboard full`)

Runs complete onboarding:

```bash
onboard full [--no-trds] [--import <source>]
```

1. Run analyze
2. Run document (prompt to overwrite if exists)
3. Run verify
4. Optionally run inventory with --create-trds
5. Optionally run import if source specified

## Implementation Steps

1. Create `scripts/onboard.sh` with subcommand structure
2. Implement `analyze` - project scanning logic
3. Implement `document` - design.md generation
4. Implement `verify` - verification.json creation
5. Implement `inventory` - feature detection
6. Implement `import` - requirement parsing
7. Implement `full` - pipeline orchestration
8. Create `commands/onboard.md` for command registration
9. Test with sample projects

## Verification Steps

### Unit Tests
```yaml
tests:
  - name: "Analyze detects package.json"
    command: "echo '{}' > /tmp/test/package.json && onboard.sh analyze /tmp/test"
    expected: "analysis.json contains npm"
```

### Integration Tests
```yaml
tests:
  - name: "Full onboard on SvelteKit project"
    command: "cd test-project && ../scripts/onboard.sh full"
    expected: "Creates analysis.json, design.md, verification.json"
```

### Manual Verification
1. Run `onboard analyze` on a real project
2. Verify tech stack detection accuracy
3. Run `onboard full` and check all outputs
4. Verify verification.json commands work

## UI Test Scenarios

N/A - CLI tool

## Regression Tests to Add

```yaml
regression:
  unit:
    - path: "tests/onboard_test.sh"
      description: "Onboard command tests"
  integration:
    - path: "tests/integration/onboard_full_test.sh"
      description: "Full onboarding pipeline test"
```

## Notes

### Edge Cases
- Monorepo detection (multiple package.json files)
- Hybrid projects (frontend + backend in same repo)
- Projects without standard structure
- Empty/new projects (should suggest starting fresh instead)

### Future Enhancements
- GUI wizard for onboarding
- Project health scoring
- Migration assistance from other task systems
- Team onboarding (shared config)
