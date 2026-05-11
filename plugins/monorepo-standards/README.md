# monorepo-standards

Enforces AO Cyber Systems monorepo conventions across product repos (aodex, aosentry, eden-biz, politihub, aohealth, ...).

## What it ships

| Component | Type | Purpose |
|-----------|------|---------|
| `hooks/no-binaries.js` | Pre-commit hook (PreToolUse, Bash) | Blocks `git commit` when staged files include compiled binaries, oversize blobs, or deny-listed extensions outside allowed paths. |
| `skills/monorepo-doctor/` | Skill (`/devflow:monorepo-doctor`) | Validates the working tree against the root CLAUDE.md Layout table — every declared area exists, every area has its own CLAUDE.md, no tracked binaries. |
| `skills/new-monorepo/` | Skill (`/devflow:new-monorepo`) | Stamps a fresh monorepo from `templates/monorepo-scaffold/` — root + per-area CLAUDE.md, `.gitignore`, path-filtered CI, `.devflow/no-binaries.yml`. |
| `templates/monorepo-scaffold/` | Template tree | Source-of-truth files copied by `new-monorepo`. |

## Install

```
/plugin marketplace add AO-Cyber-Systems/devflow-claude
/plugin install monorepo-standards@aocyber
```

After install, the no-binaries hook is **automatically active** in any repo you visit — no per-repo config needed unless you want to customise thresholds.

## Per-repo enforcement (recommended)

To make the hook visible to teammates without requiring them to install the plugin separately, drop a line into each product monorepo's `.claude/settings.json` (or `.claude/settings.local.json`):

```jsonc
{
  "plugins": {
    "enabled": ["monorepo-standards@aocyber"]
  }
}
```

Or pin the plugin via the marketplace block:

```jsonc
{
  "plugins": {
    "marketplaces": ["AO-Cyber-Systems/devflow-claude"],
    "enabled": ["monorepo-standards@aocyber", "devflow@aocyber"]
  }
}
```

## Configure (optional)

Create `.devflow/no-binaries.yml` at the repo root:

```yaml
enabled: true
max_size_mb: 5
deny_extensions: [".exe", ".dll", ".so", ".dylib"]
allowed_paths:
  - "assets/**"
  - "docs/**/*.png"
allowed_extensions: [".png", ".jpg", ".pdf"]
```

A starter copy lives at `templates/monorepo-scaffold/no-binaries.yml`.

## Bypass (emergency only)

```bash
DEVFLOW_ALLOW_BINARIES=1 git commit -m "vendored runtime"
```

Document why in the commit message and open a follow-up to add the path to `allowed_paths` if it's recurring.

## Doctor — usage

Inside a Claude Code session in any monorepo:

```
/devflow:monorepo-doctor
```

Or from the shell:

```bash
node ~/.claude/plugins/monorepo-standards/skills/monorepo-doctor/lib/cli.js --root .
```

Exit 0 = clean, exit 1 = at least one issue. Pass `--json` for machine-readable output.

## Scaffold a new monorepo

```
/devflow:new-monorepo --slug eden-biz --name "Eden Biz" --areas go,flutter,admin,proto
```

Stamps `./eden-biz/` with the full layout. Run the doctor after to confirm:

```bash
( cd eden-biz && node ~/.claude/plugins/monorepo-standards/skills/monorepo-doctor/lib/cli.js )
```

## Testing

```bash
cd plugins/monorepo-standards
node --test hooks/*.test.js skills/**/*.test.js test/**/*.test.js
```

## Layout

```
plugins/monorepo-standards/
├── .claude-plugin/plugin.json
├── README.md
├── hooks/
│   ├── hooks.json              # PreToolUse(Bash) registration
│   ├── no-binaries.js          # the hook
│   └── no-binaries.test.js     # 30 unit tests
├── skills/
│   ├── monorepo-doctor/
│   │   ├── SKILL.md
│   │   └── lib/
│   │       ├── doctor.js
│   │       ├── doctor.test.js  # 17 tests
│   │       └── cli.js
│   └── new-monorepo/
│       ├── SKILL.md
│       └── lib/
│           ├── scaffold.js
│           ├── scaffold.test.js  # 9 tests
│           └── cli.js
├── templates/
│   └── monorepo-scaffold/
│       ├── CLAUDE.md
│       ├── README.md
│       ├── gitignore             # → .gitignore on stamp
│       ├── no-binaries.yml       # → .devflow/no-binaries.yml
│       ├── areas/
│       │   ├── go-CLAUDE.md
│       │   ├── flutter-CLAUDE.md
│       │   ├── admin-CLAUDE.md
│       │   └── proto-CLAUDE.md
│       └── .github/workflows/
│           ├── go.yml
│           ├── flutter.yml
│           ├── admin.yml
│           ├── proto.yml
│           └── monorepo-doctor.yml
└── test/
    └── no-binaries/e2e.test.js   # 12 end-to-end tests
```
