# {{PROJECT_NAME}}

## Overview
{{PROJECT_DESCRIPTION}}

## Tech Stack
{{TECH_STACK}}

## Commands
{{COMMANDS}}

## Project Structure
{{PROJECT_STRUCTURE}}

## DevFlow Integration

This project uses DevFlow for autonomous development workflows.

### Key Directories
- `.devflow/` - DevFlow state and configuration
- `.devflow/trds/` - Task Requirement Documents
- `.devflow/design.md` - Project architecture document

### Available Commands
- `/devflow:autonomous` - Start autonomous development loop
- `/devflow:trd` - Manage Task Requirement Documents
- `/devflow:verify` - Run build verification
- `/devflow:regression` - Run regression tests

### Workflow
1. TRDs define what to build
2. Autonomous loop implements TRDs sequentially
3. Verification gates ensure quality
4. Regression tests prevent breakage

## Protected Files

Never modify without explicit request:
- `.env*` files (contain secrets)
- `*.lock` files (dependency locks)
- Database migration files (require careful review)
- CI/CD configuration (`.github/`, `.gitlab-ci.yml`)

## Code Style

@.claude/rules/

## Additional Context

@.devflow/design.md
