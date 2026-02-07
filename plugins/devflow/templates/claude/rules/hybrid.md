---
paths:
  - "frontend/**/*.svelte"
  - "frontend/**/*.ts"
  - "frontend/**/*.js"
  - "backend/**/*.py"
  - "docker-compose*.yml"
---

# Hybrid Svelte/FastAPI Monorepo Conventions

## Project Structure
```
frontend/               # SvelteKit app
├── src/
│   ├── routes/         # SvelteKit pages
│   ├── lib/
│   │   ├── api/        # Typed API client (calls backend)
│   │   ├── components/ # Shared Svelte components
│   │   └── stores/     # Shared state ($state runes)
│   └── app.html
├── svelte.config.js
├── vite.config.ts
└── package.json

backend/                # FastAPI app
├── app/
│   ├── main.py         # FastAPI entry, CORS config
│   ├── api/routes/     # Route handlers
│   ├── models/         # Pydantic models (shared schemas)
│   ├── services/       # Business logic
│   └── db/             # Database layer
├── tests/
├── pyproject.toml
└── alembic/            # DB migrations (if applicable)

docker-compose.yml      # Orchestrates both services
```

## API Contract

### Typed API Client (frontend)
Keep a thin typed client in `frontend/src/lib/api/` that mirrors backend schemas:
```typescript
// frontend/src/lib/api/client.ts
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export async function fetchItems(): Promise<Item[]> {
  const res = await fetch(`${BASE}/api/items`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

### Backend CORS
Always configure CORS in `backend/app/main.py` to allow the frontend origin:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Schema Alignment
- Backend Pydantic models are the source of truth for API shapes
- Frontend TypeScript types must match — generate them or keep manually in sync
- Name response models consistently: `ItemResponse`, `ItemCreate`, `ItemUpdate`

## Development Workflow

### Running Both Services
```bash
# Option 1: docker-compose (recommended)
docker compose up

# Option 2: run separately
cd backend && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```

### Environment Variables
- `frontend/.env` — `VITE_API_URL=http://localhost:8000`
- `backend/.env` — `DATABASE_URL`, `FRONTEND_URL`, secrets
- Never commit `.env` files — use `.env.example` templates

## Testing Strategy

### Frontend Tests (Vitest + Playwright)
- **Unit/component**: `vitest` with `@testing-library/svelte`
- **E2E**: Playwright against the running full stack
- Mock API calls in unit tests using `msw` (Mock Service Worker)

### Backend Tests (pytest)
- **Unit**: `pytest` with `pytest-asyncio` for async routes
- **Integration**: `httpx.AsyncClient` against the FastAPI test app
- **DB tests**: Use test database or SQLite in-memory

### Full-Stack E2E
- Playwright tests in `frontend/` that hit the real backend
- Use `docker compose -f docker-compose.test.yml up` for isolated test env
- Seed test data via backend API or direct DB fixtures

## Cross-Cutting Concerns

### Authentication Flow
1. Frontend sends credentials to `POST /api/auth/login`
2. Backend returns JWT token (or sets httpOnly cookie)
3. Frontend stores token and sends in `Authorization` header
4. Backend validates via `Depends(get_current_user)`

### Error Handling
- Backend: Return structured errors with `detail` field and proper HTTP status codes
- Frontend: Catch API errors and display user-friendly messages
- Never expose stack traces to the frontend in production

### Database Migrations
- Use Alembic for schema migrations in `backend/alembic/`
- Run migrations before deploying: `alembic upgrade head`
- Never modify migration files after they've been applied
