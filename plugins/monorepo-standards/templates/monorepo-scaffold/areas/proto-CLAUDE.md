# proto/

Protocol Buffer + gRPC schemas for {{PRODUCT_NAME}}.

## Layout

```
proto/
├── <service>/v1/         # versioned APIs (semver-style breaking changes)
│   ├── service.proto
│   └── messages.proto
├── buf.yaml
├── buf.gen.yaml
└── Makefile
```

## Commands

| Task | Command |
|------|---------|
| Generate code | `make generate` (or `buf generate`) |
| Lint | `buf lint` |
| Check for breaking changes | `buf breaking --against '.git#branch=main'` |
| Format | `buf format -w` |

## Conventions

- **Versioning:** every package ends in `v1`, `v2`, ... Breaking changes go in a new version.
- **Naming:** services in PascalCase (`UserService`), RPCs in PascalCase (`GetUser`), messages in PascalCase, fields in snake_case.
- **Errors:** use `google.rpc.Status` for rich errors; return canonical gRPC codes.
- **Streaming:** justify in a comment above the RPC. Prefer unary unless there's a strong reason.
- **Pagination:** `page_size` + `page_token` (AIP-158).

## Generated code

Generated stubs land in each consumer's tree (`go/internal/pb/`, `flutter/lib/generated/`, `admin/src/lib/pb/`). They are gitignored — generators run in CI before build. Do not commit generated code unless it's the only way to break a chicken-and-egg dep.

## Adding a new service

1. New `<service>/v1/` directory.
2. Update `buf.yaml` modules if applicable.
3. Run `buf lint && buf breaking` locally.
4. PR — CI re-runs both checks.
