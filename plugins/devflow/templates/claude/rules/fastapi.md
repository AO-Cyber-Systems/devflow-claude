---
paths:
  - "**/*.py"
  - "pyproject.toml"
  - "requirements*.txt"
---

# FastAPI / Python Conventions

## Project Structure
```
app/
├── main.py           # FastAPI app entry
├── api/
│   ├── __init__.py
│   ├── routes/       # Route handlers
│   └── deps.py       # Dependencies
├── core/
│   ├── config.py     # Settings
│   └── security.py   # Auth utilities
├── models/           # Pydantic models
├── schemas/          # Request/response schemas
├── services/         # Business logic
└── db/               # Database layer
```

## Route Handlers
```python
from fastapi import APIRouter, Depends, HTTPException, status

router = APIRouter(prefix="/items", tags=["items"])

@router.get("/{item_id}", response_model=ItemResponse)
async def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ItemResponse:
    """Get item by ID."""
    item = await item_service.get(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item
```

## Dependency Injection
Use `Depends()` for:
- Database sessions
- Current user
- Permissions checks
- Service instances

## Pydantic Models
```python
from pydantic import BaseModel, Field

class ItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    price: float = Field(..., gt=0)

class ItemResponse(ItemCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

## Error Handling
- Use `HTTPException` for expected errors
- Use custom exception handlers for domain errors
- Always include meaningful error messages

## Async/Await
- Use `async def` for I/O-bound operations
- Use `def` for CPU-bound operations
- Never mix sync DB calls in async routes

## Testing
- Use `pytest` with `pytest-asyncio`
- Use `httpx.AsyncClient` for route tests
- Use factories for test data (factory_boy)

## Type Hints
- Always use type hints on function signatures
- Use `Optional[T]` or `T | None` for nullable types
- Run `mypy` for type checking
