# {{PRODUCT_NAME}}

{{ONE_LINE_DESCRIPTION}}

## Layout

This is a polyglot monorepo. See [CLAUDE.md](./CLAUDE.md) for the canonical Layout table — every entry there has its own area-local `CLAUDE.md`.

```
.
├── go/         # backend services
├── flutter/    # mobile/desktop client
├── admin/      # admin web console
├── proto/      # gRPC schemas
└── docs/       # architecture, ADRs, design
```

## Getting started

```bash
git clone https://github.com/AO-Cyber-Systems/{{PRODUCT_SLUG}}.git
cd {{PRODUCT_SLUG}}

# Install per-area deps
( cd go      && go mod download )
( cd flutter && flutter pub get )
( cd admin   && pnpm install --frozen-lockfile )

# Generate proto stubs (one-time)
( cd proto && make generate )
```

## Building

Per-area Makefiles / package scripts. See each area's `CLAUDE.md` for the canonical commands.

## Standards

- **No binaries in git.** Enforced by the [`monorepo-standards`](https://github.com/AO-Cyber-Systems/devflow-claude) plugin.
- **Path-filtered CI.** Each area has its own workflow under `.github/workflows/`.
- **Conventional commits, scoped by area** — `feat(go): ...`, `fix(flutter): ...`.

## Contributing

1. Branch: `feat/<area>/<slug>` or `fix/<area>/<slug>`.
2. Run the area's tests locally.
3. Open a PR. Area-scoped CI will run.
4. `/devflow:monorepo-doctor` must pass before merge.

## License

See [LICENSE](./LICENSE).
