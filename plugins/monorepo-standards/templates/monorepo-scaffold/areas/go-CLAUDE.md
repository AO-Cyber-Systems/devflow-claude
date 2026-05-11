# go/

Go services + CLI tools for {{PRODUCT_NAME}}.

## Layout

```
go/
├── cmd/                # entrypoints — one subdirectory per binary
│   └── server/main.go
├── internal/           # private packages (most code lives here)
│   ├── api/            # HTTP/gRPC handlers
│   ├── store/          # persistence
│   └── domain/         # business logic
├── pkg/                # public, importable packages (rare)
├── go.mod
└── Makefile
```

## Commands

| Task | Command |
|------|---------|
| Build all binaries | `make build` |
| Build one binary | `go build -o bin/server ./cmd/server` |
| Run tests | `make test` (or `go test ./...`) |
| Race-detector | `go test -race ./...` |
| Lint | `golangci-lint run ./...` |
| Tidy modules | `go mod tidy` |

## Conventions

- **Go version:** see `go.mod`. Bump via PR — do not silently bump in passing.
- **Errors:** wrap with `fmt.Errorf("%w: %v", ErrFoo, err)`; never use `errors.New` for typed errors.
- **Context:** every IO-touching function takes `ctx context.Context` as first arg.
- **Tests:** `_test.go` adjacent to source. Use `testify/require` for assertions.
- **No init():** explicit `New*` constructors only. Globals are forbidden except for compile-time constants.
- **Logging:** structured (slog or zerolog). No `log.Printf` in production code.

## Build artifacts

Binaries land in `go/bin/` and are gitignored. Do not commit them — see root `CLAUDE.md` "No binaries in git". Release via `gh release upload`.

## When adding a new service

1. New subdirectory in `cmd/<name>/`.
2. `internal/<name>/` for its private packages.
3. New `Makefile` target.
4. New `.github/workflows/go-<name>.yml` if it needs a dedicated CI lane (otherwise the umbrella `go.yml` covers it).
