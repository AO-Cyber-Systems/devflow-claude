---
title: "Changelog and releases"
weight: 60
lede: "Generating Keep-a-Changelog entries from conventional commits, and the gate that stops an undocumented release tag."
---

## Generating an entry

```bash
df-tools changelog update --version v2.6.0
df-tools changelog update --version v2.6.0 --dry-run
df-tools changelog update --version 1.27.4 --from 6aafba1 --to dcfba83
df-tools changelog check 2.5.0
```

Commits since the last tag are grouped by conventional-commit type:

| Prefix | Section |
|---|---|
| `feat` | Added |
| `fix` | Fixed |
| `perf` | Performance |
| `refactor` | Changed |
| `docs` | Documentation |
| `test`, `chore` | grouped accordingly |
| unrecognised | Other |

`--from` / `--to` let you backfill an older release with an explicit commit range.

## The tag gate

`changelog-on-tag` is a `PreToolUse(Bash)` hook that fires when an annotated
version tag is about to be created. It enforces two invariants:

1. **`CHANGELOG.md` has a `## [X.Y.Z]` heading** for that version.
2. **The three release manifests carry matching versions:**

```text
package.json
plugins/devflow/.claude-plugin/plugin.json
.claude-plugin/marketplace.json        (the plugin entry matching plugin.json .name)
```

Either failure denies the tag with an actionable message. Escape hatch:
`DEVFLOW_SKIP_CHANGELOG_GATE=1`.

The version-sync half exists because three-file drift is silent — the marketplace
advertises one version, the plugin manifest another, and users get whichever the
resolver happens to pick.

{{< callout title="Both this gate and gate-interactive match on the raw command string" type="warn" >}}
`gate-commits` was made invocation-aware so that heredoc bodies and quoted
arguments are stripped before matching — text that merely *mentions* a command is
not gated. `changelog-on-tag` and `gate-interactive` do not yet do the same, so
writing documentation that contains a tag command or an auth command in a heredoc
can trip them. Use the documented escape hatch when it happens.
{{< /callout >}}

## Release notes on GitHub

With the [GitHub integration](/docs/guides/github/) enabled:

```bash
df-tools gh sync-release v2.6.0
```

Generates release notes from the `SUMMARY.md` files written since the previous tag
— what each job actually did, rather than a flat list of commit subjects — and
creates or edits the GitHub release.

## A release, end to end

1. Bump the three manifests to the same version.
2. Generate the changelog entry:
   `df-tools changelog update --version v2.6.0`
3. Review it, then commit: `df-tools commit "chore(release): v2.6.0"`
4. Create the annotated tag. The gate verifies the changelog entry and the three
   manifests before allowing it, then push with `--follow-tags`.
5. Generate release notes: `df-tools gh sync-release v2.6.0`
