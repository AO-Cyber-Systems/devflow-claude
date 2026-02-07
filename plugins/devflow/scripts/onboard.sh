#!/bin/bash
# DevFlow Project Onboarding System
# Onboard existing projects into DevFlow with automated analysis and configuration

set -euo pipefail

# =============================================================================
# CONSTANTS
# =============================================================================
DEVFLOW_DIR=".devflow"
ANALYSIS_FILE="$DEVFLOW_DIR/analysis.json"
DESIGN_FILE="$DEVFLOW_DIR/design.md"
VERIFY_FILE="$DEVFLOW_DIR/verification.json"
TRD_DIR="$DEVFLOW_DIR/trds"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Script directory for accessing templates
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# =============================================================================
# HELP
# =============================================================================
show_help() {
  cat <<'HELP_EOF'
DevFlow Project Onboarding System

Onboard existing projects into DevFlow with automated analysis and configuration.

USAGE:
  onboard.sh <command> [options]

COMMANDS:
  analyze             Scan project and detect tech stack, structure, commands
  document            Generate design.md from analysis
  verify              Create verification.json from detected commands
  inventory           Identify existing features and create TRDs
  import <source>     Import requirements from external documents
  full                Run complete onboarding pipeline

OPTIONS:
  --target <path>     Target project directory (default: current directory)
  --force             Overwrite existing files without prompting
  --dry-run           Show what would be done without making changes
  -h, --help          Show this help

ANALYZE OPTIONS:
  --deep              Include deep scanning (slower but more thorough)

INVENTORY OPTIONS:
  --create-trds       Create TRD files for detected features
  --todos-only        Only create TRDs from TODO/FIXME comments
  --skip-complete     Don't create TRDs for existing (complete) features

IMPORT OPTIONS:
  --source <path>     Path to document (README.md, PRD, etc.)
  --priority <n>      Default priority for imported items (1-4)
  --github-issues     Import from GitHub issues (requires gh CLI)

EXAMPLES:
  # Analyze current project
  onboard.sh analyze

  # Full onboarding pipeline
  onboard.sh full

  # Onboard with TRD generation
  onboard.sh full --create-trds

  # Import requirements from README
  onboard.sh import --source README.md

  # Analyze a different project
  onboard.sh analyze --target /path/to/project
HELP_EOF
  exit 0
}

# =============================================================================
# HELPERS
# =============================================================================
ensure_dirs() {
  mkdir -p "$DEVFLOW_DIR"
  mkdir -p "$TRD_DIR"
}

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_section() {
  echo ""
  echo -e "${BOLD}${CYAN}=== $1 ===${NC}"
  echo ""
}

# Check if file exists
file_exists() {
  [[ -f "$1" ]]
}

# Check if directory exists
dir_exists() {
  [[ -d "$1" ]]
}

# Get project name from directory
get_project_name() {
  basename "$(pwd)"
}

# Slugify a string
slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//'
}

# Get next TRD ID
get_next_trd_id() {
  local max_id=0
  if [[ -d "$TRD_DIR" ]]; then
    for file in "$TRD_DIR"/TRD-*.md; do
      if [[ -f "$file" ]]; then
        local id_num
        id_num=$(basename "$file" | sed 's/TRD-\([0-9]*\)-.*/\1/' | sed 's/^0*//')
        if [[ -n "$id_num" ]] && [[ "$id_num" =~ ^[0-9]+$ ]]; then
          if [[ $id_num -gt $max_id ]]; then
            max_id=$id_num
          fi
        fi
      fi
    done
  fi
  printf "%03d" $((max_id + 1))
}

# =============================================================================
# DETECTION FUNCTIONS
# =============================================================================

# Detect if a file contains a string
file_contains() {
  local file=$1
  local pattern=$2
  grep -q "$pattern" "$file" 2>/dev/null
}

# Detect tech stack components
detect_tech_stack() {
  local languages=()
  local frameworks_frontend=""
  local frameworks_backend=""
  local tools=()
  local package_manager=""

  # Languages
  if file_exists "package.json"; then
    languages+=("javascript")
    if file_exists "tsconfig.json"; then
      languages+=("typescript")
    fi
  fi
  if file_exists "pyproject.toml" || file_exists "requirements.txt" || file_exists "setup.py"; then
    languages+=("python")
  fi
  if file_exists "Cargo.toml"; then
    languages+=("rust")
  fi
  if file_exists "go.mod"; then
    languages+=("go")
  fi

  # Package managers
  if file_exists "pnpm-lock.yaml"; then
    package_manager="pnpm"
  elif file_exists "yarn.lock"; then
    package_manager="yarn"
  elif file_exists "package-lock.json"; then
    package_manager="npm"
  elif file_exists "bun.lockb"; then
    package_manager="bun"
  fi
  if file_exists "poetry.lock"; then
    package_manager="${package_manager:+$package_manager, }poetry"
  fi

  # Frontend frameworks
  if file_exists "svelte.config.js" || file_exists "svelte.config.ts"; then
    if dir_exists "src/routes"; then
      frameworks_frontend="sveltekit"
    else
      frameworks_frontend="svelte"
    fi
  elif file_exists "next.config.js" || file_exists "next.config.mjs" || file_exists "next.config.ts"; then
    frameworks_frontend="nextjs"
  elif file_exists "nuxt.config.js" || file_exists "nuxt.config.ts"; then
    frameworks_frontend="nuxt"
  elif file_exists "angular.json"; then
    frameworks_frontend="angular"
  elif file_exists "package.json" && file_contains "package.json" '"vue"'; then
    frameworks_frontend="vue"
  elif file_exists "package.json" && file_contains "package.json" '"react"'; then
    frameworks_frontend="react"
  fi

  # Backend frameworks
  if file_exists "pyproject.toml" && file_contains "pyproject.toml" "fastapi"; then
    frameworks_backend="fastapi"
  elif file_exists "manage.py" && file_exists "settings.py"; then
    frameworks_backend="django"
  elif file_exists "pyproject.toml" && file_contains "pyproject.toml" "flask"; then
    frameworks_backend="flask"
  elif file_exists "package.json" && file_contains "package.json" '"express"'; then
    frameworks_backend="express"
  elif file_exists "nest-cli.json"; then
    frameworks_backend="nestjs"
  fi

  # Tools
  if file_exists "Dockerfile" || file_exists "docker-compose.yml" || file_exists "docker-compose.yaml"; then
    tools+=("docker")
  fi
  if dir_exists ".github/workflows"; then
    tools+=("github_actions")
  fi
  if file_exists ".eslintrc" || file_exists ".eslintrc.js" || file_exists ".eslintrc.json" || file_exists "eslint.config.js" || file_exists "eslint.config.mjs"; then
    tools+=("eslint")
  fi
  if file_exists ".prettierrc" || file_exists ".prettierrc.js" || file_exists ".prettierrc.json" || file_exists "prettier.config.js"; then
    tools+=("prettier")
  fi
  if file_exists "vitest.config.js" || file_exists "vitest.config.ts" || file_exists "vitest.config.mjs"; then
    tools+=("vitest")
  fi
  if file_exists "jest.config.js" || file_exists "jest.config.ts" || file_exists "jest.config.json"; then
    tools+=("jest")
  fi
  if file_exists "playwright.config.js" || file_exists "playwright.config.ts"; then
    tools+=("playwright")
  fi
  if file_exists "pytest.ini" || (file_exists "pyproject.toml" && file_contains "pyproject.toml" "pytest"); then
    tools+=("pytest")
  fi
  if file_exists "pyproject.toml" && file_contains "pyproject.toml" "ruff"; then
    tools+=("ruff")
  fi
  if file_exists "pyproject.toml" && file_contains "pyproject.toml" "mypy"; then
    tools+=("mypy")
  fi
  if file_exists "tailwind.config.js" || file_exists "tailwind.config.ts"; then
    tools+=("tailwind")
  fi

  # Platform targets (mobile, desktop)
  local platforms=()
  if file_exists "capacitor.config.ts" || file_exists "capacitor.config.js" || file_exists "capacitor.config.json"; then
    platforms+=("capacitor")
    tools+=("capacitor")
  fi
  if file_exists "electron.vite.config.ts" || file_exists "electron.vite.config.js" || file_exists "electron-builder.yml" || file_exists "electron-builder.json5" || (file_exists "package.json" && file_contains "package.json" '"electron"'); then
    platforms+=("electron")
    tools+=("electron")
  fi

  # Output JSON (handle empty arrays)
  local languages_json="[]"
  if [[ ${#languages[@]} -gt 0 ]]; then
    languages_json=$(printf '%s\n' "${languages[@]}" | jq -R . | jq -s .)
  fi
  local tools_json="[]"
  if [[ ${#tools[@]} -gt 0 ]]; then
    tools_json=$(printf '%s\n' "${tools[@]}" | jq -R . | jq -s .)
  fi
  local platforms_json="[]"
  if [[ ${#platforms[@]} -gt 0 ]]; then
    platforms_json=$(printf '%s\n' "${platforms[@]}" | jq -R . | jq -s .)
  fi

  jq -n \
    --argjson languages "$languages_json" \
    --arg frontend "$frameworks_frontend" \
    --arg backend "$frameworks_backend" \
    --argjson tools "$tools_json" \
    --argjson platforms "$platforms_json" \
    --arg package_manager "$package_manager" \
    '{
      languages: $languages,
      frameworks: {
        frontend: (if $frontend == "" then null else $frontend end),
        backend: (if $backend == "" then null else $backend end)
      },
      tools: $tools,
      platforms: $platforms,
      package_manager: (if $package_manager == "" then null else $package_manager end)
    }'
}

# Detect project structure
detect_structure() {
  local source_dirs=()
  local test_dirs=()
  local config_files=()
  local has_monorepo=false

  # Source directories
  for dir in src lib app backend frontend api server client packages; do
    if dir_exists "$dir"; then
      source_dirs+=("$dir")
    fi
  done

  # Test directories
  for dir in tests test __tests__ spec e2e "src/__tests__" "src/tests"; do
    if dir_exists "$dir"; then
      test_dirs+=("$dir")
    fi
  done

  # Common config files
  for file in package.json pyproject.toml tsconfig.json svelte.config.js next.config.js vite.config.ts vite.config.js Makefile docker-compose.yml .env.example; do
    if file_exists "$file"; then
      config_files+=("$file")
    fi
  done

  # Monorepo detection
  if dir_exists "packages" || file_exists "pnpm-workspace.yaml" || file_exists "lerna.json"; then
    has_monorepo=true
  fi

  local source_json="[]"
  if [[ ${#source_dirs[@]} -gt 0 ]]; then
    source_json=$(printf '%s\n' "${source_dirs[@]}" | jq -R . | jq -s .)
  fi
  local test_json="[]"
  if [[ ${#test_dirs[@]} -gt 0 ]]; then
    test_json=$(printf '%s\n' "${test_dirs[@]}" | jq -R . | jq -s .)
  fi
  local config_json="[]"
  if [[ ${#config_files[@]} -gt 0 ]]; then
    config_json=$(printf '%s\n' "${config_files[@]}" | jq -R . | jq -s .)
  fi

  jq -n \
    --argjson source "$source_json" \
    --argjson test "$test_json" \
    --argjson config "$config_json" \
    --argjson monorepo "$has_monorepo" \
    '{
      source_dirs: $source,
      test_dirs: $test,
      config_files: $config,
      has_monorepo: $monorepo
    }'
}

# Detect available commands from package.json, Makefile, pyproject.toml
detect_commands() {
  local build_cmds=()
  local test_cmds=()
  local lint_cmds=()
  local type_check_cmds=()
  local dev_cmds=()

  # Parse package.json scripts
  if file_exists "package.json"; then
    local scripts
    scripts=$(jq -r '.scripts // {} | keys[]' package.json 2>/dev/null || true)

    for script in $scripts; do
      case "$script" in
        build|build:*) build_cmds+=("npm run $script") ;;
        test|test:unit) test_cmds+=("npm run $script") ;;
        test:integration|test:e2e) test_cmds+=("npm run $script") ;;
        lint|lint:*) lint_cmds+=("npm run $script") ;;
        check|typecheck|type-check) type_check_cmds+=("npm run $script") ;;
        dev|start|serve) dev_cmds+=("npm run $script") ;;
      esac
    done
  fi

  # Parse Makefile targets
  if file_exists "Makefile"; then
    local targets
    targets=$(grep -E '^[a-zA-Z_-]+:' Makefile | sed 's/:.*//' 2>/dev/null || true)

    for target in $targets; do
      case "$target" in
        build) build_cmds+=("make build") ;;
        test|tests) test_cmds+=("make $target") ;;
        lint) lint_cmds+=("make lint") ;;
        typecheck|type-check|check) type_check_cmds+=("make $target") ;;
        dev|run|serve) dev_cmds+=("make $target") ;;
      esac
    done
  fi

  # Parse pyproject.toml
  if file_exists "pyproject.toml"; then
    # Check for pytest
    if file_contains "pyproject.toml" "pytest" || file_exists "pytest.ini"; then
      test_cmds+=("poetry run pytest")
    fi
    # Check for ruff
    if file_contains "pyproject.toml" "ruff"; then
      lint_cmds+=("poetry run ruff check .")
    fi
    # Check for mypy
    if file_contains "pyproject.toml" "mypy"; then
      type_check_cmds+=("poetry run mypy .")
    fi
    # Check for black
    if file_contains "pyproject.toml" "black"; then
      lint_cmds+=("poetry run black --check .")
    fi
  fi

  # Default commands based on detected tools
  if [[ ${#test_cmds[@]} -eq 0 ]]; then
    if file_exists "package.json"; then
      test_cmds+=("npm test")
    fi
  fi
  if [[ ${#build_cmds[@]} -eq 0 ]]; then
    if file_exists "package.json"; then
      build_cmds+=("npm run build")
    fi
  fi

  local build_json="[]"
  if [[ ${#build_cmds[@]} -gt 0 ]]; then
    build_json=$(printf '%s\n' "${build_cmds[@]}" | jq -R . | jq -s .)
  fi
  local test_json="[]"
  if [[ ${#test_cmds[@]} -gt 0 ]]; then
    test_json=$(printf '%s\n' "${test_cmds[@]}" | jq -R . | jq -s .)
  fi
  local lint_json="[]"
  if [[ ${#lint_cmds[@]} -gt 0 ]]; then
    lint_json=$(printf '%s\n' "${lint_cmds[@]}" | jq -R . | jq -s .)
  fi
  local type_json="[]"
  if [[ ${#type_check_cmds[@]} -gt 0 ]]; then
    type_json=$(printf '%s\n' "${type_check_cmds[@]}" | jq -R . | jq -s .)
  fi
  local dev_json="[]"
  if [[ ${#dev_cmds[@]} -gt 0 ]]; then
    dev_json=$(printf '%s\n' "${dev_cmds[@]}" | jq -R . | jq -s .)
  fi

  jq -n \
    --argjson build "$build_json" \
    --argjson test "$test_json" \
    --argjson lint "$lint_json" \
    --argjson type_check "$type_json" \
    --argjson dev "$dev_json" \
    '{
      build: $build,
      test: $test,
      lint: $lint,
      type_check: $type_check,
      dev: $dev
    }'
}

# Detect existing documentation
detect_docs() {
  local readme=""
  local prd=""
  local architecture=""
  local changelog=""

  for file in README.md README.rst README.txt README; do
    if file_exists "$file"; then
      readme="$file"
      break
    fi
  done

  for file in PRD.md prd.md REQUIREMENTS.md requirements.md docs/PRD.md docs/requirements.md; do
    if file_exists "$file"; then
      prd="$file"
      break
    fi
  done

  for file in ARCHITECTURE.md architecture.md docs/architecture.md docs/ARCHITECTURE.md DESIGN.md design.md; do
    if file_exists "$file"; then
      architecture="$file"
      break
    fi
  done

  for file in CHANGELOG.md CHANGELOG changelog.md HISTORY.md; do
    if file_exists "$file"; then
      changelog="$file"
      break
    fi
  done

  jq -n \
    --arg readme "$readme" \
    --arg prd "$prd" \
    --arg architecture "$architecture" \
    --arg changelog "$changelog" \
    '{
      readme: (if $readme == "" then null else $readme end),
      prd: (if $prd == "" then null else $prd end),
      architecture: (if $architecture == "" then null else $architecture end),
      changelog: (if $changelog == "" then null else $changelog end)
    }'
}

# =============================================================================
# ANALYZE COMMAND
# =============================================================================
cmd_analyze() {
  local target_dir="."
  local deep_scan=false
  local dry_run=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --target)
        target_dir="$2"
        shift 2
        ;;
      --deep)
        deep_scan=true
        shift
        ;;
      --dry-run)
        dry_run=true
        shift
        ;;
      *)
        shift
        ;;
    esac
  done

  # Change to target directory
  if [[ "$target_dir" != "." ]]; then
    if ! dir_exists "$target_dir"; then
      log_error "Directory not found: $target_dir"
      exit 1
    fi
    cd "$target_dir"
  fi

  log_section "Analyzing Project"

  local project_name
  project_name=$(get_project_name)
  log_info "Project: $project_name"
  log_info "Root: $(pwd)"

  # Run detection
  echo ""
  echo -e "${CYAN}Detecting tech stack...${NC}"
  local tech_stack
  tech_stack=$(detect_tech_stack)

  echo -e "${CYAN}Detecting project structure...${NC}"
  local structure
  structure=$(detect_structure)

  echo -e "${CYAN}Detecting commands...${NC}"
  local commands
  commands=$(detect_commands)

  echo -e "${CYAN}Detecting documentation...${NC}"
  local docs
  docs=$(detect_docs)

  # Build analysis JSON
  local analysis
  analysis=$(jq -n \
    --arg version "1.0" \
    --arg analyzed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg name "$project_name" \
    --arg root "$(pwd)" \
    --argjson structure "$structure" \
    --argjson tech_stack "$tech_stack" \
    --argjson commands "$commands" \
    --argjson existing_docs "$docs" \
    '{
      version: $version,
      analyzed_at: $analyzed_at,
      project: {
        name: $name,
        root: $root
      },
      structure: $structure,
      tech_stack: $tech_stack,
      commands: $commands,
      existing_docs: $existing_docs
    }')

  # Output results
  log_section "Analysis Results"

  echo -e "${BOLD}Tech Stack:${NC}"
  echo "$tech_stack" | jq -r '
    "  Languages: \(.languages | join(", "))",
    "  Frontend: \(.frameworks.frontend // "none")",
    "  Backend: \(.frameworks.backend // "none")",
    "  Tools: \(.tools | join(", "))",
    "  Package Manager: \(.package_manager // "none")"
  '

  echo ""
  echo -e "${BOLD}Structure:${NC}"
  echo "$structure" | jq -r '
    "  Source dirs: \(.source_dirs | join(", "))",
    "  Test dirs: \(.test_dirs | join(", "))",
    "  Config files: \(.config_files | length) found",
    "  Monorepo: \(.has_monorepo)"
  '

  echo ""
  echo -e "${BOLD}Commands:${NC}"
  echo "$commands" | jq -r '
    "  Build: \(.build | join(", ") | if . == "" then "none detected" else . end)",
    "  Test: \(.test | join(", ") | if . == "" then "none detected" else . end)",
    "  Lint: \(.lint | join(", ") | if . == "" then "none detected" else . end)",
    "  Type check: \(.type_check | join(", ") | if . == "" then "none detected" else . end)"
  '

  echo ""
  echo -e "${BOLD}Documentation:${NC}"
  echo "$docs" | jq -r '
    "  README: \(.readme // "not found")",
    "  PRD: \(.prd // "not found")",
    "  Architecture: \(.architecture // "not found")"
  '

  if [[ "$dry_run" == "true" ]]; then
    echo ""
    log_info "Dry run - not writing files"
    echo ""
    echo "$analysis" | jq .
    return 0
  fi

  # Write analysis file
  ensure_dirs
  echo "$analysis" > "$ANALYSIS_FILE"
  echo ""
  log_success "Analysis saved to: $ANALYSIS_FILE"
}

# =============================================================================
# DOCUMENT COMMAND
# =============================================================================
cmd_document() {
  local force=false
  local dry_run=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --force)
        force=true
        shift
        ;;
      --dry-run)
        dry_run=true
        shift
        ;;
      *)
        shift
        ;;
    esac
  done

  log_section "Generating Design Document"

  # Check for analysis file
  if ! file_exists "$ANALYSIS_FILE"; then
    log_warn "No analysis file found. Running analyze first..."
    cmd_analyze
  fi

  local analysis
  analysis=$(cat "$ANALYSIS_FILE")

  # Extract info from analysis
  local project_name frontend backend
  project_name=$(echo "$analysis" | jq -r '.project.name')
  frontend=$(echo "$analysis" | jq -r '.tech_stack.frameworks.frontend // "none"')
  backend=$(echo "$analysis" | jq -r '.tech_stack.frameworks.backend // "none"')

  # Detect platforms (capacitor, electron)
  local has_capacitor has_electron
  has_capacitor=$(echo "$analysis" | jq -r 'if .tech_stack.platforms and (.tech_stack.platforms | index("capacitor")) then "true" else "false" end')
  has_electron=$(echo "$analysis" | jq -r 'if .tech_stack.platforms and (.tech_stack.platforms | index("electron")) then "true" else "false" end')

  # Select template based on tech stack
  local template="fullstack"
  if [[ "$frontend" != "null" ]] && [[ "$backend" == "null" ]]; then
    template="svelte"  # Frontend only
  elif [[ "$frontend" == "null" ]] && [[ "$backend" != "null" ]]; then
    template="fastapi"  # Backend only
  fi
  # Hybrid overrides when both frontend and backend detected
  if [[ "$frontend" != "null" ]] && [[ "$backend" != "null" ]]; then
    template="hybrid"
  fi

  log_info "Using template: $template"

  # Check for existing design file
  if file_exists "$DESIGN_FILE" && [[ "$force" != "true" ]]; then
    log_warn "$DESIGN_FILE already exists"
    if [[ "$dry_run" != "true" ]]; then
      read -p "Overwrite? [y/N] " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Skipping design document generation"
        return 0
      fi
    fi
  fi

  # Generate design document with filled-in details
  local tech_stack_table=""
  local languages tools
  languages=$(echo "$analysis" | jq -r '.tech_stack.languages | join(", ")')
  tools=$(echo "$analysis" | jq -r '.tech_stack.tools | join(", ")')

  # Build tech stack section based on detected stack
  tech_stack_table="| Layer | Technology | Purpose |
|-------|------------|---------|"

  if [[ "$frontend" != "null" ]]; then
    case "$frontend" in
      sveltekit)
        tech_stack_table="$tech_stack_table
| Framework | SvelteKit | Full-stack framework |"
        ;;
      nextjs)
        tech_stack_table="$tech_stack_table
| Framework | Next.js | React framework |"
        ;;
      *)
        tech_stack_table="$tech_stack_table
| Framework | $frontend | Frontend framework |"
        ;;
    esac
  fi

  if [[ "$backend" != "null" ]]; then
    case "$backend" in
      fastapi)
        tech_stack_table="$tech_stack_table
| Backend | FastAPI | REST API |"
        ;;
      express)
        tech_stack_table="$tech_stack_table
| Backend | Express | Node.js server |"
        ;;
      *)
        tech_stack_table="$tech_stack_table
| Backend | $backend | Backend framework |"
        ;;
    esac
  fi

  # Add detected tools
  if echo "$tools" | grep -q "tailwind"; then
    tech_stack_table="$tech_stack_table
| Styling | Tailwind CSS | Utility-first CSS |"
  fi
  if echo "$tools" | grep -q "vitest"; then
    tech_stack_table="$tech_stack_table
| Testing | Vitest | Unit testing |"
  fi
  if echo "$tools" | grep -q "playwright"; then
    tech_stack_table="$tech_stack_table
| E2E | Playwright | End-to-end testing |"
  fi
  if echo "$tools" | grep -q "pytest"; then
    tech_stack_table="$tech_stack_table
| Testing | pytest | Python testing |"
  fi

  # Add platform targets
  if [[ "$has_capacitor" == "true" ]]; then
    tech_stack_table="$tech_stack_table
| Mobile | Capacitor | iOS/Android native wrapper |"
  fi
  if [[ "$has_electron" == "true" ]]; then
    tech_stack_table="$tech_stack_table
| Desktop | Electron | Cross-platform desktop app |"
  fi

  # Get project structure
  local source_dirs test_dirs
  source_dirs=$(echo "$analysis" | jq -r '.structure.source_dirs | join(", ")')
  test_dirs=$(echo "$analysis" | jq -r '.structure.test_dirs | join(", ")')

  # Generate the design document
  local design_content
  design_content=$(cat <<EOF
# $project_name - Design Document

## Metadata
| Field | Value |
|-------|-------|
| Project | $project_name |
| Version | 0.1.0 |
| Status | Draft |
| Created | $(date +%Y-%m-%d) |
| Updated | $(date +%Y-%m-%d) |

## Overview

### Purpose
<!-- Describe what this project does and the problem it solves -->

### Goals
- Goal 1
- Goal 2
- Goal 3

### Non-Goals
- What this project will NOT do

## Architecture

### System Overview
\`\`\`
<!-- Add architecture diagram -->
\`\`\`

## Tech Stack

$tech_stack_table

**Languages:** $languages
**Tools:** $tools

## Project Structure

\`\`\`
$project_name/
├── ${source_dirs:-src/}     # Source code
├── ${test_dirs:-tests/}     # Tests
├── .devflow/                 # DevFlow configuration
│   ├── design.md            # This document
│   ├── trds/                # Task requirements
│   └── regression/          # Test suite
└── ...
\`\`\`

## Implementation Plan

### Phase 1: Foundation
- [ ] Core setup
- [ ] Basic infrastructure

### Phase 2: Features
- [ ] Feature A
- [ ] Feature B

### Phase 3: Polish
- [ ] Testing
- [ ] Documentation

## Open Questions

<!-- List unresolved design decisions -->

## References

<!-- Links to external docs -->
EOF
)

  if [[ "$dry_run" == "true" ]]; then
    echo ""
    log_info "Dry run - would create:"
    echo "$design_content"
    return 0
  fi

  ensure_dirs
  echo "$design_content" > "$DESIGN_FILE"
  log_success "Created: $DESIGN_FILE"
  echo ""
  echo "Edit the design document to fill in project-specific details."
}

# =============================================================================
# VERIFY COMMAND
# =============================================================================
cmd_verify_setup() {
  local force=false
  local dry_run=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --force)
        force=true
        shift
        ;;
      --dry-run)
        dry_run=true
        shift
        ;;
      *)
        shift
        ;;
    esac
  done

  log_section "Setting Up Verification Checks"

  # Check for analysis file
  if ! file_exists "$ANALYSIS_FILE"; then
    log_warn "No analysis file found. Running analyze first..."
    cmd_analyze
  fi

  local analysis
  analysis=$(cat "$ANALYSIS_FILE")

  # Check for existing verification file
  if file_exists "$VERIFY_FILE" && [[ "$force" != "true" ]]; then
    log_warn "$VERIFY_FILE already exists"
    if [[ "$dry_run" != "true" ]]; then
      read -p "Overwrite? [y/N] " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Skipping verification setup"
        return 0
      fi
    fi
  fi

  # Extract commands from analysis
  local build_cmds test_cmds lint_cmds type_cmds
  build_cmds=$(echo "$analysis" | jq -r '.commands.build[]' 2>/dev/null || true)
  test_cmds=$(echo "$analysis" | jq -r '.commands.test[]' 2>/dev/null || true)
  lint_cmds=$(echo "$analysis" | jq -r '.commands.lint[]' 2>/dev/null || true)
  type_cmds=$(echo "$analysis" | jq -r '.commands.type_check[]' 2>/dev/null || true)

  # Build unit test checks
  local unit_checks="[]"
  if [[ -n "$test_cmds" ]]; then
    local checks=()
    local i=0
    while IFS= read -r cmd; do
      if [[ -n "$cmd" ]]; then
        local name="test-$i"
        local detect=""
        if echo "$cmd" | grep -q "npm\|pnpm\|yarn"; then
          detect="package.json"
        elif echo "$cmd" | grep -q "pytest\|poetry"; then
          detect="pyproject.toml"
        fi
        checks+=("$(jq -n \
          --arg name "$name" \
          --arg cmd "$cmd" \
          --arg detect "$detect" \
          '{
            name: $name,
            command: $cmd,
            timeout: 120,
            required: true,
            working_dir: ".",
            enabled: true,
            detect: (if $detect == "" then null else $detect end)
          }')")
        ((i++)) || true
      fi
    done <<< "$test_cmds"
    if [[ ${#checks[@]} -gt 0 ]]; then
      unit_checks=$(printf '%s\n' "${checks[@]}" | jq -s .)
    fi
  fi

  # Build lint checks
  local lint_checks="[]"
  if [[ -n "$lint_cmds" ]]; then
    local checks=()
    local i=0
    while IFS= read -r cmd; do
      if [[ -n "$cmd" ]]; then
        local name="lint-$i"
        checks+=("$(jq -n \
          --arg name "$name" \
          --arg cmd "$cmd" \
          '{
            name: $name,
            command: $cmd,
            timeout: 60,
            required: true,
            working_dir: ".",
            enabled: true
          }')")
        ((i++)) || true
      fi
    done <<< "$lint_cmds"
    if [[ ${#checks[@]} -gt 0 ]]; then
      lint_checks=$(printf '%s\n' "${checks[@]}" | jq -s .)
    fi
  fi

  # Build type check checks
  local type_checks="[]"
  if [[ -n "$type_cmds" ]]; then
    local checks=()
    local i=0
    while IFS= read -r cmd; do
      if [[ -n "$cmd" ]]; then
        local name="typecheck-$i"
        checks+=("$(jq -n \
          --arg name "$name" \
          --arg cmd "$cmd" \
          '{
            name: $name,
            command: $cmd,
            timeout: 60,
            required: true,
            working_dir: ".",
            enabled: true
          }')")
        ((i++)) || true
      fi
    done <<< "$type_cmds"
    if [[ ${#checks[@]} -gt 0 ]]; then
      type_checks=$(printf '%s\n' "${checks[@]}" | jq -s .)
    fi
  fi

  # Build build checks
  local build_checks="[]"
  if [[ -n "$build_cmds" ]]; then
    local checks=()
    local i=0
    while IFS= read -r cmd; do
      if [[ -n "$cmd" ]]; then
        local name="build-$i"
        checks+=("$(jq -n \
          --arg name "$name" \
          --arg cmd "$cmd" \
          '{
            name: $name,
            command: $cmd,
            timeout: 180,
            required: true,
            working_dir: ".",
            enabled: true
          }')")
        ((i++)) || true
      fi
    done <<< "$build_cmds"
    if [[ ${#checks[@]} -gt 0 ]]; then
      build_checks=$(printf '%s\n' "${checks[@]}" | jq -s .)
    fi
  fi

  # Build verification config
  local verification
  verification=$(jq -n \
    --argjson unit "$unit_checks" \
    --argjson lint "$lint_checks" \
    --argjson type_check "$type_checks" \
    --argjson build "$build_checks" \
    '{
      version: "1.0",
      description: "DevFlow verification checks (auto-generated from project analysis)",
      categories: {
        unit: {
          description: "Unit tests",
          checks: $unit
        },
        integration: {
          description: "Integration tests",
          checks: []
        },
        type_check: {
          description: "Type checking",
          checks: $type_check
        },
        lint: {
          description: "Linting",
          checks: $lint
        },
        build: {
          description: "Build verification",
          checks: $build
        }
      },
      lastRun: null
    }')

  if [[ "$dry_run" == "true" ]]; then
    echo ""
    log_info "Dry run - would create:"
    echo "$verification" | jq .
    return 0
  fi

  ensure_dirs
  echo "$verification" > "$VERIFY_FILE"
  log_success "Created: $VERIFY_FILE"

  # Summary
  echo ""
  echo -e "${BOLD}Verification checks configured:${NC}"
  echo "  Unit tests: $(echo "$unit_checks" | jq 'length')"
  echo "  Type checks: $(echo "$type_checks" | jq 'length')"
  echo "  Lint checks: $(echo "$lint_checks" | jq 'length')"
  echo "  Build checks: $(echo "$build_checks" | jq 'length')"
  echo ""
  echo "Run '/devflow:verify list' to see all checks"
  echo "Run '/devflow:verify run' to execute verification"
}

# =============================================================================
# INVENTORY COMMAND
# =============================================================================
cmd_inventory() {
  local create_trds=false
  local todos_only=false
  local skip_complete=false
  local dry_run=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --create-trds)
        create_trds=true
        shift
        ;;
      --todos-only)
        todos_only=true
        shift
        ;;
      --skip-complete)
        skip_complete=true
        shift
        ;;
      --dry-run)
        dry_run=true
        shift
        ;;
      *)
        shift
        ;;
    esac
  done

  log_section "Inventorying Project Features"

  # Ensure analysis exists
  if ! file_exists "$ANALYSIS_FILE"; then
    log_warn "No analysis file found. Running analyze first..."
    cmd_analyze
  fi

  local analysis
  analysis=$(cat "$ANALYSIS_FILE")

  local frontend backend
  frontend=$(echo "$analysis" | jq -r '.tech_stack.frameworks.frontend // "none"')
  backend=$(echo "$analysis" | jq -r '.tech_stack.frameworks.backend // "none"')

  # Collect features
  local features=()
  local todos=()

  # Scan for routes/pages (frontend)
  if [[ "$frontend" != "null" ]] && [[ "$todos_only" != "true" ]]; then
    echo -e "${CYAN}Scanning frontend routes...${NC}"

    case "$frontend" in
      sveltekit)
        if dir_exists "src/routes"; then
          while IFS= read -r file; do
            local route
            route=$(dirname "$file" | sed 's|src/routes||' | sed 's|/+page.svelte||')
            [[ -z "$route" ]] && route="/"
            features+=("Page: $route|$file|complete")
          done < <(find src/routes -name "+page.svelte" 2>/dev/null)
        fi
        ;;
      nextjs)
        if dir_exists "app"; then
          while IFS= read -r file; do
            local route
            route=$(dirname "$file" | sed 's|app||')
            [[ -z "$route" ]] && route="/"
            features+=("Page: $route|$file|complete")
          done < <(find app -name "page.tsx" -o -name "page.jsx" 2>/dev/null)
        elif dir_exists "pages"; then
          while IFS= read -r file; do
            local route
            route=$(echo "$file" | sed 's|pages||' | sed 's|\.tsx$||' | sed 's|\.jsx$||' | sed 's|/index$||')
            [[ -z "$route" ]] && route="/"
            features+=("Page: $route|$file|complete")
          done < <(find pages -name "*.tsx" -o -name "*.jsx" 2>/dev/null | grep -v "_app\|_document")
        fi
        ;;
    esac
  fi

  # Scan for API endpoints (backend)
  if [[ "$backend" != "null" ]] && [[ "$todos_only" != "true" ]]; then
    echo -e "${CYAN}Scanning backend endpoints...${NC}"

    case "$backend" in
      fastapi)
        # Find FastAPI route decorators
        while IFS= read -r match; do
          local file endpoint
          file=$(echo "$match" | cut -d: -f1)
          # Extract endpoint path using sed (portable, no Perl regex)
          # Handle both @app.get("/path") and @app.get('/path')
          endpoint=$(echo "$match" | sed 's/.*@app\.[a-z]*(\s*"\([^"]*\)".*/\1/' | grep -v "@app" || true)
          if [[ -z "$endpoint" ]] || [[ "$endpoint" == *"@app"* ]]; then
            endpoint=$(echo "$match" | sed "s/.*@app\.[a-z]*(\s*'\([^']*\)'.*/\1/" | grep -v "@app" || true)
          fi
          [[ -z "$endpoint" ]] && endpoint="unknown"
          features+=("API: $endpoint|$file|complete")
        done < <(grep -r "@app\.\(get\|post\|put\|delete\|patch\)" --include="*.py" 2>/dev/null || true)
        ;;
      express)
        # Find Express route definitions
        while IFS= read -r match; do
          local file endpoint
          file=$(echo "$match" | cut -d: -f1)
          # Extract endpoint path using sed (portable)
          endpoint=$(echo "$match" | sed 's/.*router\.[a-z]*(\s*"\([^"]*\)".*/\1/' | grep -v "router" || true)
          if [[ -z "$endpoint" ]] || [[ "$endpoint" == *"router"* ]]; then
            endpoint=$(echo "$match" | sed "s/.*router\.[a-z]*(\s*'\([^']*\)'.*/\1/" | grep -v "router" || true)
          fi
          [[ -z "$endpoint" ]] && endpoint="unknown"
          features+=("API: $endpoint|$file|complete")
        done < <(grep -r "router\.\(get\|post\|put\|delete\|patch\)" --include="*.js" --include="*.ts" 2>/dev/null || true)
        ;;
    esac
  fi

  # Scan for TODO/FIXME comments
  echo -e "${CYAN}Scanning for TODO/FIXME comments...${NC}"
  while IFS= read -r match; do
    local file line content
    file=$(echo "$match" | cut -d: -f1)
    line=$(echo "$match" | cut -d: -f2)
    content=$(echo "$match" | cut -d: -f3- | sed 's/.*TODO[: ]*//' | sed 's/.*FIXME[: ]*//' | head -c 100)
    if [[ -n "$content" ]]; then
      todos+=("$content|$file:$line|pending")
    fi
  done < <(grep -rn "TODO\|FIXME" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.svelte" 2>/dev/null | head -50 || true)

  # Output results
  log_section "Inventory Results"

  if [[ "$todos_only" != "true" ]]; then
    echo -e "${BOLD}Existing Features (${#features[@]}):${NC}"
    if [[ ${#features[@]} -gt 0 ]]; then
      for feature in "${features[@]}"; do
        local name file status
        name=$(echo "$feature" | cut -d'|' -f1)
        file=$(echo "$feature" | cut -d'|' -f2)
        echo "  - $name ($file)"
      done
    else
      echo "  (none detected)"
    fi
    echo ""
  fi

  echo -e "${BOLD}TODOs/FIXMEs (${#todos[@]}):${NC}"
  if [[ ${#todos[@]} -gt 0 ]]; then
    for todo in "${todos[@]:0:10}"; do
      local content location
      content=$(echo "$todo" | cut -d'|' -f1)
      location=$(echo "$todo" | cut -d'|' -f2)
      echo "  - $content"
      echo "    ($location)"
    done
    if [[ ${#todos[@]} -gt 10 ]]; then
      echo "  ... and $((${#todos[@]} - 10)) more"
    fi
  else
    echo "  (none found)"
  fi

  # Create TRDs if requested
  if [[ "$create_trds" == "true" ]] && [[ "$dry_run" != "true" ]]; then
    echo ""
    log_section "Creating TRDs"
    ensure_dirs

    local created=0

    # Create TRDs for existing features (marked complete)
    if [[ "$todos_only" != "true" ]] && [[ "$skip_complete" != "true" ]]; then
      for feature in "${features[@]}"; do
        local name file status
        name=$(echo "$feature" | cut -d'|' -f1)
        file=$(echo "$feature" | cut -d'|' -f2)

        local id slug filepath
        id=$(get_next_trd_id)
        slug=$(slugify "$name")
        filepath="$TRD_DIR/TRD-${id}-${slug}.md"

        cat > "$filepath" <<EOF
# TRD-$id: $name

## Metadata
| Field | Value |
|-------|-------|
| ID | TRD-$id |
| Status | complete |
| Priority | 3 |
| Effort | medium |
| Created | $(date +%Y-%m-%d) |
| Updated | $(date +%Y-%m-%d) |

## Description

Existing feature identified during project onboarding.

**Source file:** \`$file\`

## Acceptance Criteria

- [x] Feature exists and is functional

## Notes

This TRD was auto-generated during project onboarding to document existing functionality.
EOF
        log_success "Created: $filepath"
        ((created++)) || true
      done
    fi

    # Create TRDs for TODOs (marked pending)
    for todo in "${todos[@]}"; do
      local content location
      content=$(echo "$todo" | cut -d'|' -f1)
      location=$(echo "$todo" | cut -d'|' -f2)

      local id slug filepath
      id=$(get_next_trd_id)
      slug=$(slugify "$content" | head -c 40)
      filepath="$TRD_DIR/TRD-${id}-${slug}.md"

      cat > "$filepath" <<EOF
# TRD-$id: $content

## Metadata
| Field | Value |
|-------|-------|
| ID | TRD-$id |
| Status | pending |
| Priority | 3 |
| Effort | medium |
| Created | $(date +%Y-%m-%d) |
| Updated | $(date +%Y-%m-%d) |

## Description

TODO item found in codebase during project onboarding.

**Source:** \`$location\`

## Acceptance Criteria

- [ ] Implement the TODO item
- [ ] Remove the TODO comment

## Notes

This TRD was auto-generated from a TODO/FIXME comment found in the codebase.
EOF
      log_success "Created: $filepath"
      ((created++)) || true
    done

    echo ""
    log_success "Created $created TRD(s)"
    echo "Run '/devflow:features sync' to update feature_list.json"
  elif [[ "$dry_run" == "true" ]]; then
    echo ""
    log_info "Dry run - would create TRDs for:"
    if [[ "$todos_only" != "true" ]] && [[ "$skip_complete" != "true" ]]; then
      echo "  - ${#features[@]} existing features (status: complete)"
    fi
    echo "  - ${#todos[@]} TODOs/FIXMEs (status: pending)"
  fi
}

# =============================================================================
# IMPORT COMMAND
# =============================================================================
cmd_import() {
  local source_file=""
  local priority=3
  local github_issues=false
  local dry_run=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --source)
        source_file="$2"
        shift 2
        ;;
      --priority)
        priority="$2"
        shift 2
        ;;
      --github-issues)
        github_issues=true
        shift
        ;;
      --dry-run)
        dry_run=true
        shift
        ;;
      *)
        # Positional argument - treat as source
        if [[ -z "$source_file" ]]; then
          source_file="$1"
        fi
        shift
        ;;
    esac
  done

  log_section "Importing Requirements"

  local requirements=()

  if [[ "$github_issues" == "true" ]]; then
    # Import from GitHub issues
    echo -e "${CYAN}Fetching GitHub issues...${NC}"

    if ! command -v gh &>/dev/null; then
      log_error "GitHub CLI (gh) not installed"
      exit 1
    fi

    while IFS= read -r issue; do
      local title number
      title=$(echo "$issue" | jq -r '.title')
      number=$(echo "$issue" | jq -r '.number')
      requirements+=("$title|GitHub Issue #$number|pending")
    done < <(gh issue list --json title,number --limit 20 2>/dev/null || true)

  elif [[ -n "$source_file" ]]; then
    # Import from file
    if ! file_exists "$source_file"; then
      log_error "File not found: $source_file"
      exit 1
    fi

    echo -e "${CYAN}Parsing $source_file...${NC}"

    # Extract sections that look like requirements
    # Look for: numbered lists, bullet points with feature-like content, ## headers

    # Extract bullet points that look like features/tasks
    while IFS= read -r line; do
      # Clean up the line
      local content
      content=$(echo "$line" | sed 's/^[-*] //' | sed 's/^\[[ x]\] //' | sed 's/^[0-9]\+\. //')

      # Skip empty or very short lines
      if [[ ${#content} -gt 10 ]]; then
        requirements+=("$content|$source_file|pending")
      fi
    done < <(grep -E '^\s*[-*]\s+|^\s*[0-9]+\.\s+|^\s*\[[ x]\]' "$source_file" 2>/dev/null | head -30 || true)

  else
    # Auto-detect README
    if file_exists "README.md"; then
      source_file="README.md"
      log_info "Auto-detected: $source_file"
      cmd_import --source "$source_file" --priority "$priority" ${dry_run:+--dry-run}
      return
    else
      log_error "No source file specified"
      echo "Usage: onboard.sh import --source <file> [--priority <n>]"
      echo "   or: onboard.sh import --github-issues"
      exit 1
    fi
  fi

  # Output results
  log_section "Import Results"

  echo -e "${BOLD}Found ${#requirements[@]} potential requirements:${NC}"
  for req in "${requirements[@]:0:15}"; do
    local content source
    content=$(echo "$req" | cut -d'|' -f1 | head -c 60)
    source=$(echo "$req" | cut -d'|' -f2)
    echo "  - $content"
  done
  if [[ ${#requirements[@]} -gt 15 ]]; then
    echo "  ... and $((${#requirements[@]} - 15)) more"
  fi

  if [[ ${#requirements[@]} -eq 0 ]]; then
    log_warn "No requirements found in source"
    return 0
  fi

  # Create TRDs
  if [[ "$dry_run" == "true" ]]; then
    echo ""
    log_info "Dry run - would create ${#requirements[@]} TRD(s)"
  else
    echo ""
    read -p "Create TRDs for these requirements? [y/N] " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
      ensure_dirs
      local created=0

      for req in "${requirements[@]}"; do
        local content source status
        content=$(echo "$req" | cut -d'|' -f1)
        source=$(echo "$req" | cut -d'|' -f2)

        local id slug filepath
        id=$(get_next_trd_id)
        slug=$(slugify "$content" | head -c 40)
        filepath="$TRD_DIR/TRD-${id}-${slug}.md"

        cat > "$filepath" <<EOF
# TRD-$id: $content

## Metadata
| Field | Value |
|-------|-------|
| ID | TRD-$id |
| Status | pending |
| Priority | $priority |
| Effort | medium |
| Created | $(date +%Y-%m-%d) |
| Updated | $(date +%Y-%m-%d) |

## Description

Requirement imported from: $source

$content

## Acceptance Criteria

- [ ] (Define specific acceptance criteria)

## Notes

This TRD was imported during project onboarding.
EOF
        ((created++)) || true
      done

      log_success "Created $created TRD(s)"
      echo "Run '/devflow:features sync' to update feature_list.json"
    fi
  fi
}

# =============================================================================
# FULL COMMAND
# =============================================================================
cmd_full() {
  local create_trds=false
  local import_source=""
  local force=false
  local dry_run=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      --create-trds)
        create_trds=true
        shift
        ;;
      --import)
        import_source="$2"
        shift 2
        ;;
      --force)
        force=true
        shift
        ;;
      --dry-run)
        dry_run=true
        shift
        ;;
      *)
        shift
        ;;
    esac
  done

  echo -e "${BOLD}${MAGENTA}"
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║           DevFlow Project Onboarding                       ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"

  local dry_run_flag=""
  local force_flag=""
  [[ "$dry_run" == "true" ]] && dry_run_flag="--dry-run"
  [[ "$force" == "true" ]] && force_flag="--force"

  # Phase 1: Analyze
  echo -e "${BOLD}Phase 1/4: Analysis${NC}"
  cmd_analyze $dry_run_flag

  # Phase 2: Document
  echo ""
  echo -e "${BOLD}Phase 2/4: Documentation${NC}"
  cmd_document $force_flag $dry_run_flag

  # Phase 3: Verification
  echo ""
  echo -e "${BOLD}Phase 3/4: Verification Setup${NC}"
  cmd_verify_setup $force_flag $dry_run_flag

  # Phase 4: Inventory (optional)
  if [[ "$create_trds" == "true" ]]; then
    echo ""
    echo -e "${BOLD}Phase 4/4: Feature Inventory${NC}"
    cmd_inventory --create-trds $dry_run_flag
  fi

  # Import (optional)
  if [[ -n "$import_source" ]]; then
    echo ""
    echo -e "${BOLD}Importing Requirements${NC}"
    cmd_import --source "$import_source" $dry_run_flag
  fi

  # Summary
  echo ""
  echo -e "${BOLD}${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${GREEN}║           Onboarding Complete!                             ║${NC}"
  echo -e "${BOLD}${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "Files created:"
  [[ -f "$ANALYSIS_FILE" ]] && echo "  - $ANALYSIS_FILE"
  [[ -f "$DESIGN_FILE" ]] && echo "  - $DESIGN_FILE"
  [[ -f "$VERIFY_FILE" ]] && echo "  - $VERIFY_FILE"
  if [[ -d "$TRD_DIR" ]]; then
    local trd_count
    trd_count=$(ls "$TRD_DIR"/TRD-*.md 2>/dev/null | wc -l | tr -d ' ')
    [[ "$trd_count" -gt 0 ]] && echo "  - $trd_count TRD(s) in $TRD_DIR"
  fi
  echo ""
  echo "Next steps:"
  echo "  1. Review and edit $DESIGN_FILE"
  echo "  2. Run '/devflow:verify run' to test verification checks"
  echo "  3. Run '/devflow:features sync' to generate feature list"
  echo "  4. Create new TRDs with '/devflow:trd create <name>'"
  echo ""
}

# =============================================================================
# MAIN
# =============================================================================
if [[ $# -eq 0 ]]; then
  show_help
fi

COMMAND=$1
shift

case $COMMAND in
  analyze)
    cmd_analyze "$@"
    ;;
  document)
    cmd_document "$@"
    ;;
  verify)
    cmd_verify_setup "$@"
    ;;
  inventory)
    cmd_inventory "$@"
    ;;
  import)
    cmd_import "$@"
    ;;
  full)
    cmd_full "$@"
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    log_error "Unknown command: $COMMAND"
    echo "Run 'onboard.sh --help' for usage"
    exit 1
    ;;
esac
