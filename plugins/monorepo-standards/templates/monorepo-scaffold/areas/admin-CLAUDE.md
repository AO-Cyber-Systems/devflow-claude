# admin/

Admin web console for {{PRODUCT_NAME}}.

## Stack

- **Framework:** {{FRAMEWORK}} (Next.js 14 app router / Vite + React / SvelteKit — pick one)
- **Language:** TypeScript strict mode
- **Styling:** Tailwind CSS + Harbor color tokens
- **Data fetching:** TanStack Query (React Query)
- **Forms:** React Hook Form + Zod
- **Tests:** Vitest (unit) + Playwright (e2e)

## Layout

```
admin/
├── src/
│   ├── app/             # Next.js routes (or `pages/` for pages router)
│   ├── components/      # reusable UI
│   ├── lib/             # shared utilities (api client, types)
│   └── styles/
├── tests/
├── e2e/
├── package.json
└── tsconfig.json
```

## Commands

| Task | Command |
|------|---------|
| Install | `pnpm install` (or `npm ci`) |
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Test (unit) | `pnpm test` |
| Test (e2e) | `pnpm test:e2e` |
| Lint | `pnpm lint` |
| Type-check | `pnpm tsc --noEmit` |

## Conventions

- **Imports:** path aliases from `tsconfig.json` (`@/components/...`, `@/lib/...`).
- **API client:** generated from `proto/` via `buf` or hand-rolled in `src/lib/api/`.
- **Auth:** session cookies or JWT — never store tokens in localStorage.
- **Accessibility:** every interactive element passes Axe. CI enforces this.
- **Color tokens:** import from `@/styles/theme` — never hardcode hex.

## Build artifacts

`.next/`, `dist/`, `out/`, `node_modules/` are gitignored. Production builds ship as Docker images (see root CI), not as committed bundles.
