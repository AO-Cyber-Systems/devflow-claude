#!/bin/bash
# DevFlow Design Document Manager
# Initialize and manage project design documents

set -euo pipefail

# =============================================================================
# CONSTANTS
# =============================================================================
DEVFLOW_DIR=".devflow"
DESIGN_FILE="$DEVFLOW_DIR/design.md"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# =============================================================================
# HELP
# =============================================================================
show_help() {
  cat <<'HELP_EOF'
DevFlow Design Document Manager

USAGE:
  design.sh <command> [args]

COMMANDS:
  init [name]       Initialize design.md from template
  view              View current design document
  edit              Open design.md in $EDITOR
  validate          Validate design document structure

OPTIONS:
  --template <t>    Template type: fullstack (default), svelte, fastapi, hybrid, capacitor, electron
  -h, --help        Show this help

EXAMPLES:
  design.sh init "My Project"           # Create design doc
  design.sh init --template svelte      # Use Svelte template
  design.sh view                        # View design doc
  design.sh validate                    # Check structure

The design document provides high-level architecture for TRDs.
HELP_EOF
  exit 0
}

# =============================================================================
# TEMPLATES
# =============================================================================

generate_template_fullstack() {
  local project_name=$1
  cat <<EOF
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
<!-- What problem does this project solve? -->

### Goals
- Goal 1
- Goal 2
- Goal 3

### Non-Goals
- What this project will NOT do

## Architecture

### System Overview
\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                         Client                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Browser   │  │   Mobile    │  │   Desktop   │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
└─────────┼────────────────┼────────────────┼─────────────────┘
          │                │                │
          └────────────────┼────────────────┘
                           │ HTTPS
          ┌────────────────▼────────────────┐
          │           Frontend              │
          │     (SvelteKit / Next.js)       │
          └────────────────┬────────────────┘
                           │ API
          ┌────────────────▼────────────────┐
          │           Backend               │
          │    (FastAPI / Node.js)          │
          └────────────────┬────────────────┘
                           │ SQL
          ┌────────────────▼────────────────┐
          │          Database               │
          │         (PostgreSQL)            │
          └─────────────────────────────────┘
\`\`\`

### Component Diagram
<!-- Add component relationships -->

## Tech Stack

### Frontend
| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | SvelteKit | SSR, routing |
| UI | Tailwind CSS | Styling |
| State | Svelte stores | Client state |
| Forms | Superforms | Form handling |
| Testing | Vitest, Playwright | Unit, E2E |

### Backend
| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | FastAPI | REST API |
| ORM | SQLAlchemy | Database access |
| Auth | JWT / OAuth | Authentication |
| Validation | Pydantic | Request/response |
| Testing | pytest | Unit, integration |

### Infrastructure
| Component | Technology | Purpose |
|-----------|------------|---------|
| Database | PostgreSQL | Data persistence |
| Storage | S3 / Cloud Storage | File storage |
| Hosting | Vercel / Railway | Deployment |
| CI/CD | GitHub Actions | Automation |

## Data Models

### Core Entities
\`\`\`
User
├── id: UUID (PK)
├── email: String (unique)
├── name: String
├── created_at: Timestamp
└── updated_at: Timestamp

Entity
├── id: UUID (PK)
├── user_id: UUID (FK -> User)
├── name: String
├── data: JSONB
├── created_at: Timestamp
└── updated_at: Timestamp
\`\`\`

### Relationships
<!-- Describe entity relationships -->

## API Design

### Endpoints Overview
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| POST | /api/auth/login | User login |
| GET | /api/users/me | Current user |
| GET | /api/entities | List entities |
| POST | /api/entities | Create entity |
| GET | /api/entities/:id | Get entity |
| PUT | /api/entities/:id | Update entity |
| DELETE | /api/entities/:id | Delete entity |

### Authentication
- Method: JWT
- Header: \`Authorization: Bearer <token>\`

### Error Handling
\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [...]
  }
}
\`\`\`

## Security

### Authentication
- Email/password authentication
- OAuth providers: Google, GitHub
- Session management via JWT

### Authorization
- Row Level Security (RLS) in database
- API middleware for permission checks

### Data Protection
- HTTPS everywhere
- Input validation
- SQL injection prevention (parameterized queries)
- XSS prevention (content security policy)

## Deployment

### Environments
| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | localhost:5173 | Local dev |
| Staging | staging.example.com | Testing |
| Production | example.com | Live |

### CI/CD Pipeline
1. Push to main → Run tests
2. Tests pass → Build
3. Build succeeds → Deploy to staging
4. Manual approval → Deploy to production

## Project Structure

\`\`\`
project/
├── src/
│   ├── lib/
│   │   ├── components/     # Svelte components
│   │   ├── stores/         # Svelte stores
│   │   ├── utils/          # Utilities
│   │   └── api/            # API client
│   └── routes/             # SvelteKit routes
├── backend/
│   ├── api/                # FastAPI routes
│   ├── models/             # SQLAlchemy models
│   ├── schemas/            # Pydantic schemas
│   └── services/           # Business logic
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .devflow/
│   ├── design.md           # This document
│   ├── trds/               # Task requirements
│   └── regression/         # Test suite
└── docs/
    └── api/                # API documentation
\`\`\`

## Implementation Plan

### Phase 1: Foundation
- [ ] Project setup
- [ ] Database schema
- [ ] Authentication
- [ ] Basic CRUD

### Phase 2: Core Features
- [ ] Feature A
- [ ] Feature B
- [ ] Feature C

### Phase 3: Polish
- [ ] Testing
- [ ] Documentation
- [ ] Performance optimization

## Open Questions

<!-- List unresolved design decisions -->
1. Question 1?
2. Question 2?

## References

<!-- Links to external docs, specs, etc. -->
- [SvelteKit Docs](https://kit.svelte.dev)
- [FastAPI Docs](https://fastapi.tiangolo.com)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
EOF
}

generate_template_svelte() {
  local project_name=$1
  cat <<EOF
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
<!-- What problem does this project solve? -->

### Goals
- Goal 1
- Goal 2

## Architecture

### SvelteKit Application
\`\`\`
src/
├── lib/
│   ├── components/     # Reusable components
│   │   ├── ui/         # Base UI components
│   │   └── features/   # Feature components
│   ├── stores/         # Svelte stores
│   ├── utils/          # Utility functions
│   └── server/         # Server-only code
├── routes/
│   ├── +layout.svelte  # Root layout
│   ├── +page.svelte    # Home page
│   └── (app)/          # Authenticated routes
└── app.html            # HTML template
\`\`\`

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | SvelteKit 2 | Full-stack framework |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Utility-first CSS |
| UI | shadcn-svelte | Component library |
| State | Svelte 5 runes | Reactive state |
| Forms | Superforms | Form handling |
| Validation | Zod | Schema validation |
| Testing | Vitest | Unit tests |
| E2E | Playwright | End-to-end tests |

## Component Architecture

### Component Hierarchy
\`\`\`
+layout.svelte
└── +page.svelte
    ├── Header
    ├── Sidebar
    └── Content
        └── [Feature Components]
\`\`\`

### State Management
- Global: Svelte stores (\`\$state\` runes)
- Local: Component state
- Server: Load functions

## Routes

| Route | Component | Auth | Description |
|-------|-----------|------|-------------|
| / | +page.svelte | No | Landing page |
| /login | +page.svelte | No | Login |
| /app | +page.svelte | Yes | Dashboard |

## Data Flow

1. Server load function fetches data
2. Data passed to page via \`data\` prop
3. Forms submit via Superforms actions
4. Stores provide reactive state

## Project Structure

\`\`\`
project/
├── src/
│   ├── lib/
│   └── routes/
├── static/
├── tests/
├── .devflow/
├── package.json
├── svelte.config.js
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
\`\`\`

## Implementation Plan

### Phase 1: Setup
- [ ] SvelteKit project
- [ ] Tailwind + shadcn
- [ ] Basic routing

### Phase 2: Features
- [ ] Feature components
- [ ] State management
- [ ] API integration

### Phase 3: Testing
- [ ] Unit tests
- [ ] E2E tests
- [ ] Accessibility
EOF
}

generate_template_fastapi() {
  local project_name=$1
  cat <<EOF
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
<!-- What problem does this project solve? -->

### Goals
- Goal 1
- Goal 2

## Architecture

### FastAPI Application
\`\`\`
src/
├── api/
│   ├── routes/         # API route handlers
│   ├── deps.py         # Dependencies
│   └── main.py         # App factory
├── core/
│   ├── config.py       # Settings
│   └── security.py     # Auth utilities
├── models/
│   └── *.py            # SQLAlchemy models
├── schemas/
│   └── *.py            # Pydantic schemas
├── services/
│   └── *.py            # Business logic
└── db/
    ├── session.py      # Database session
    └── migrations/     # Alembic migrations
\`\`\`

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | FastAPI | REST API |
| Language | Python 3.11+ | Type hints |
| ORM | SQLAlchemy 2.0 | Database |
| Validation | Pydantic v2 | Schemas |
| Auth | python-jose | JWT |
| Testing | pytest | Tests |
| Linting | ruff | Code quality |
| Typing | mypy | Type checking |

## API Design

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /auth/token | Get token |
| GET | /users/me | Current user |

### Request/Response
\`\`\`python
# Request
class CreateUser(BaseModel):
    email: EmailStr
    password: str

# Response
class UserResponse(BaseModel):
    id: UUID
    email: str
    created_at: datetime
\`\`\`

### Error Handling
\`\`\`python
class APIError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status
\`\`\`

## Database

### Models
\`\`\`python
class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    hashed_password: Mapped[str]
    created_at: Mapped[datetime]
\`\`\`

### Migrations
Using Alembic for schema migrations.

## Project Structure

\`\`\`
project/
├── src/
│   ├── api/
│   ├── core/
│   ├── models/
│   ├── schemas/
│   └── services/
├── tests/
├── .devflow/
├── pyproject.toml
├── Makefile
└── docker-compose.yml
\`\`\`

## Implementation Plan

### Phase 1: Setup
- [ ] Project structure
- [ ] Database models
- [ ] Authentication

### Phase 2: API
- [ ] CRUD endpoints
- [ ] Validation
- [ ] Error handling

### Phase 3: Testing
- [ ] Unit tests
- [ ] Integration tests
- [ ] Documentation
EOF
}

generate_template_hybrid() {
  local project_name=$1
  cat <<EOF
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
<!-- What problem does this project solve? -->

### Goals
- Goal 1
- Goal 2

## Architecture

### Monorepo Structure
\`\`\`
frontend/                 # SvelteKit app
├── src/
│   ├── routes/           # SvelteKit pages
│   ├── lib/
│   │   ├── api/          # Typed API client
│   │   ├── components/   # Svelte components
│   │   └── stores/       # Shared state
│   └── app.html
├── svelte.config.js
└── package.json

backend/                  # FastAPI app
├── app/
│   ├── main.py           # FastAPI entry + CORS
│   ├── api/routes/       # Route handlers
│   ├── models/           # Pydantic models
│   ├── services/         # Business logic
│   └── db/               # Database layer
├── tests/
└── pyproject.toml

docker-compose.yml        # Orchestrates both services
\`\`\`

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | SvelteKit 2 | Full-stack framework |
| Backend | FastAPI | REST API |
| Language | TypeScript + Python | Type safety |
| Styling | Tailwind CSS | Utility-first CSS |
| ORM | SQLAlchemy 2.0 | Database |
| Validation | Zod + Pydantic v2 | Schemas |
| Frontend Tests | Vitest | Unit tests |
| Backend Tests | pytest | Unit + integration |
| E2E | Playwright | End-to-end tests |

## API Contract

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /auth/token | Get token |
| GET | /api/users/me | Current user |

### Cross-Stack Schema Alignment
- Backend Pydantic models are source of truth
- Frontend TypeScript types must match
- Use consistent naming: \`ItemResponse\`, \`ItemCreate\`, \`ItemUpdate\`

## Data Flow

1. Frontend calls typed API client in \`frontend/src/lib/api/\`
2. Backend validates with Pydantic, processes via services
3. Backend returns structured JSON responses
4. Frontend renders via Svelte components with rune state

## Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Frontend unit | Vitest + @testing-library/svelte | Components, stores |
| Backend unit | pytest + pytest-asyncio | Routes, services |
| Backend integration | httpx.AsyncClient | API endpoints |
| Full-stack E2E | Playwright | Critical user flows |

## Implementation Plan

### Phase 1: Setup
- [ ] Monorepo structure (frontend/ + backend/)
- [ ] Docker Compose for local dev
- [ ] CORS configuration
- [ ] Typed API client

### Phase 2: Features
- [ ] Authentication flow (JWT)
- [ ] Core API endpoints
- [ ] Frontend pages + components

### Phase 3: Testing
- [ ] Frontend unit tests
- [ ] Backend unit + integration tests
- [ ] E2E tests against full stack
EOF
}

generate_template_capacitor() {
  local project_name=$1
  cat <<EOF
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
<!-- What problem does this project solve? -->

### Goals
- Goal 1
- Goal 2

### Target Platforms
- iOS (15+)
- Android (API 24+)
- Web (progressive enhancement)

## Architecture

### Project Structure
\`\`\`
src/                      # SvelteKit app (web layer)
├── routes/
├── lib/
│   ├── native/           # Capacitor plugin wrappers
│   ├── components/
│   └── stores/
└── app.html
ios/                      # Xcode project (auto-generated)
android/                  # Android Studio project (auto-generated)
capacitor.config.ts       # Capacitor configuration
svelte.config.js          # Must use adapter-static
\`\`\`

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | SvelteKit 2 | Web app framework |
| Mobile | Capacitor | Native iOS/Android wrapper |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Utility-first CSS |
| State | Svelte 5 runes | Reactive state |
| Unit Tests | Vitest | Component + logic tests |
| E2E (Web) | Playwright | Browser-based E2E |
| E2E (Native) | WebdriverIO + Appium | Device-based E2E |

## Native Features

### Capacitor Plugins
| Plugin | Purpose | Platforms |
|--------|---------|-----------|
| @capacitor/camera | Photo capture | iOS, Android |
| @capacitor/filesystem | File storage | iOS, Android |
| @capacitor/geolocation | Location | iOS, Android |
| @capacitor/push-notifications | Push | iOS, Android |

### Platform Detection
\`\`\`typescript
import { Capacitor } from '@capacitor/core';
Capacitor.isNativePlatform()  // true on iOS/Android
Capacitor.getPlatform()       // 'ios' | 'android' | 'web'
\`\`\`

## Configuration

### SvelteKit (adapter-static required)
- Output to \`build/\` directory
- SPA fallback: \`index.html\`
- SSR disabled: \`export const ssr = false\`

### Capacitor
- \`webDir: 'build'\` — points to SvelteKit output
- \`androidScheme: 'https'\` — secure WebView

## Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | Components, stores, utils |
| Component | @testing-library/svelte | UI interactions |
| Plugin mocks | Manual \`__mocks__/@capacitor/\` | Native API stubs |
| E2E (web) | Playwright | Web UI flows |
| E2E (native) | WebdriverIO + Appium | Device flows |

## Implementation Plan

### Phase 1: Setup
- [ ] SvelteKit + adapter-static
- [ ] Capacitor init + platforms
- [ ] Base navigation + layout

### Phase 2: Features
- [ ] Native plugin wrappers in \`src/lib/native/\`
- [ ] Core screens + components
- [ ] Platform-specific UI adjustments

### Phase 3: Testing & Distribution
- [ ] Unit + component tests with plugin mocks
- [ ] Playwright E2E for web layer
- [ ] iOS TestFlight / Android internal testing
EOF
}

generate_template_electron() {
  local project_name=$1
  cat <<EOF
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
<!-- What problem does this project solve? -->

### Goals
- Goal 1
- Goal 2

### Target Platforms
- macOS
- Windows
- Linux

## Architecture

### Process Model
\`\`\`
src/
├── main/                 # Main process (Node.js)
│   ├── index.ts          # App entry, window management
│   └── ipc.ts            # IPC handler registration
├── preload/              # Preload scripts (bridge)
│   └── index.ts          # contextBridge API exposure
└── renderer/             # Renderer process (Svelte)
    ├── src/
    │   ├── App.svelte
    │   ├── lib/
    │   └── routes/
    └── index.html
electron.vite.config.ts   # Unified build config
electron-builder.yml      # Packaging config
\`\`\`

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Electron | Desktop framework |
| Build | electron-vite | Dev server + bundling |
| UI | Svelte 5 | Renderer UI framework |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Utility-first CSS |
| Packaging | electron-builder | Distribution |
| Updates | electron-updater | Auto-updates |
| Unit Tests | Vitest | Main + renderer tests |
| E2E | Playwright | Electron app testing |

## Security Model

### Requirements
- \`contextIsolation: true\` (mandatory)
- \`nodeIntegration: false\` (mandatory)
- \`sandbox: true\` (recommended)
- Minimal preload API surface via \`contextBridge\`

### IPC Design
| Channel | Direction | Purpose |
|---------|-----------|---------|
| dialog:openFile | Renderer → Main | File picker |
| file:save | Renderer → Main | Save file |
| update-available | Main → Renderer | Update notification |

## Preload API

\`\`\`typescript
// Exposed to renderer via window.api
interface API {
  openFile(): Promise<string | null>;
  saveFile(data: string): Promise<void>;
  onUpdateAvailable(cb: () => void): void;
}
\`\`\`

## Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Main process | Vitest (Node) | IPC handlers, business logic |
| Renderer | Vitest (jsdom) | Svelte components, stores |
| IPC | electron-mock-ipc | Main↔renderer communication |
| E2E | Playwright (Electron) | Full app interaction |

## Distribution

### Targets
| Platform | Format | Signing |
|----------|--------|---------|
| macOS | .dmg, .zip | Apple Developer ID |
| Windows | .exe (NSIS) | Azure Trusted Signing |
| Linux | .AppImage, .deb | N/A |

### Auto-Updates
- electron-updater checks on launch + periodically
- GitHub Releases as update source
- Background download, install on quit

## Implementation Plan

### Phase 1: Setup
- [ ] electron-vite + Svelte scaffold
- [ ] Security model (contextBridge, preload)
- [ ] Basic window management

### Phase 2: Features
- [ ] IPC handlers for core functionality
- [ ] Svelte UI components
- [ ] File system operations

### Phase 3: Distribution
- [ ] electron-builder packaging
- [ ] Code signing (macOS + Windows)
- [ ] Auto-update integration
- [ ] Unit + E2E tests
EOF
}

# =============================================================================
# COMMANDS
# =============================================================================

cmd_init() {
  local project_name=""
  local template="fullstack"

  # Parse args
  while [[ $# -gt 0 ]]; do
    case $1 in
      --template)
        template="$2"
        shift 2
        ;;
      *)
        if [[ -z "$project_name" ]]; then
          project_name="$1"
        else
          project_name="$project_name $1"
        fi
        shift
        ;;
    esac
  done

  # Default project name from directory
  if [[ -z "$project_name" ]]; then
    project_name=$(basename "$(pwd)")
  fi

  mkdir -p "$DEVFLOW_DIR"

  if [[ -f "$DESIGN_FILE" ]]; then
    echo -e "${YELLOW}$DESIGN_FILE already exists${NC}"
    read -p "Overwrite? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 0
    fi
  fi

  case "$template" in
    svelte)
      generate_template_svelte "$project_name" > "$DESIGN_FILE"
      ;;
    fastapi)
      generate_template_fastapi "$project_name" > "$DESIGN_FILE"
      ;;
    hybrid)
      generate_template_hybrid "$project_name" > "$DESIGN_FILE"
      ;;
    capacitor)
      generate_template_capacitor "$project_name" > "$DESIGN_FILE"
      ;;
    electron)
      generate_template_electron "$project_name" > "$DESIGN_FILE"
      ;;
    fullstack|*)
      generate_template_fullstack "$project_name" > "$DESIGN_FILE"
      ;;
  esac

  echo -e "${GREEN}Created:${NC} $DESIGN_FILE"
  echo -e "${CYAN}Template:${NC} $template"
  echo -e "${CYAN}Project:${NC} $project_name"
  echo ""
  echo "Edit the design document to fill in project details."
  echo "Then create TRDs based on the implementation plan."
}

cmd_view() {
  if [[ ! -f "$DESIGN_FILE" ]]; then
    echo -e "${YELLOW}No design document found${NC}"
    echo "Create one with: design.sh init"
    exit 1
  fi

  cat "$DESIGN_FILE"
}

cmd_edit() {
  if [[ ! -f "$DESIGN_FILE" ]]; then
    echo -e "${YELLOW}No design document found${NC}"
    echo "Create one with: design.sh init"
    exit 1
  fi

  local editor="${EDITOR:-vim}"
  "$editor" "$DESIGN_FILE"
}

cmd_validate() {
  if [[ ! -f "$DESIGN_FILE" ]]; then
    echo -e "${RED}No design document found${NC}"
    exit 1
  fi

  echo -e "${BLUE}Validating Design Document${NC}"
  echo ""

  local errors=0

  # Check required sections
  local sections=(
    "## Overview"
    "## Architecture"
    "## Tech Stack"
    "## Implementation Plan"
  )

  for section in "${sections[@]}"; do
    if grep -q "^$section" "$DESIGN_FILE"; then
      echo -e "  ${GREEN}✓${NC} $section"
    else
      echo -e "  ${RED}✗${NC} $section (missing)"
      errors=$((errors + 1))
    fi
  done

  # Check metadata table
  if grep -q "| Project |" "$DESIGN_FILE"; then
    echo -e "  ${GREEN}✓${NC} Metadata table"
  else
    echo -e "  ${YELLOW}!${NC} Metadata table (recommended)"
  fi

  echo ""
  if [[ $errors -eq 0 ]]; then
    echo -e "${GREEN}Design document is valid${NC}"
  else
    echo -e "${RED}$errors required section(s) missing${NC}"
    exit 1
  fi
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
  init)
    cmd_init "$@"
    ;;
  view)
    cmd_view
    ;;
  edit)
    cmd_edit
    ;;
  validate)
    cmd_validate
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    echo -e "${RED}Unknown command: $COMMAND${NC}" >&2
    exit 1
    ;;
esac
