---
mode: quick
job: 1
type: standard
wave: 1
depends_on: []
files_modified:
  - .github/workflows/release.yml
autonomous: true
must_haves:
  - .github/workflows/release.yml exists and is valid YAML
  - Workflow triggers on tag push matching v*
  - Permissions block grants contents:write
  - actions/checkout@v4 used with fetch-depth:0
  - Idempotent skip when release for tag already exists (gh release view)
  - Title sourced from annotated tag subject; falls back to tag name when empty
  - Body source priority correct (CHANGELOG section first, --generate-notes fallback)
  - awk-based CHANGELOG section extraction matches "## [X.Y.Z]" → next "## [" boundary
  - GH_TOKEN env wired from secrets.GITHUB_TOKEN
  - Run script uses set -euo pipefail
---

<objective>
Add a release-on-tag GitHub Actions workflow at .github/workflows/release.yml. Triggered when a tag matching v* is pushed, the workflow creates a GitHub Release for that tag — using the annotated tag's subject line as the title and (in priority order) a matching CHANGELOG.md section or auto-generated commit notes as the body. Idempotent: re-running for an existing release exits success without creating a duplicate.

Single-file addition. No tests, no abstractions. Match the formatting style of the existing .github/workflows/auto-label-issues.yml.
</objective>

<embedded_context>
  <codebase_examples>
    <example file=".github/workflows/auto-label-issues.yml">
Existing workflow for formatting reference. Two-space YAML indent, top-level keys: name, on, jobs. Job uses runs-on: ubuntu-latest with permissions block declared on the job. Steps array with - uses: action@vN. Match this style exactly.
    </example>
  </codebase_examples>

  <gotchas>
    - This repo enforces an edit gate via hooks/gate-edits.js. The executor must operate under an active skill marker (.planning/.skill-active) so Write is allowed. Quick-task skill should already be setting this. DO NOT add "skip devflow" override or DEVFLOW_SKIP_EDIT_GATE=1 to the workflow or task instructions.
    - fetch-depth: 0 is REQUIRED — without it, actions/checkout fetches a shallow clone that does not include annotated tag objects/messages, and `git tag -l --format='%(contents:subject)'` returns empty.
    - The GITHUB_TOKEN with contents:write permission is sufficient for `gh release create` and `gh release view`. No PAT required.
    - `gh release view "$TAG"` returns non-zero (exit 1) when the release does not exist. Use it inside an `if` to branch, not as a hard precondition — and combine with `set -euo pipefail` carefully (use `if gh release view "$TAG" >/dev/null 2>&1; then ... fi` so the non-zero doesn't trip pipefail).
    - awk extraction must stop at the next `## [` heading regardless of version, not just at end-of-file. Use a flag-flip pattern: set flag on match of target heading, print while flagged, unset on next `## [`.
    - The tag name pushed is `vX.Y.Z`; the CHANGELOG heading is `## [X.Y.Z]` (no leading v). Strip the leading `v` before matching.
    - Use `--notes-file` for CHANGELOG-sourced bodies (path to a temp file written from awk output). Use `--generate-notes` when no CHANGELOG section is found. These two flags are mutually exclusive in `gh release create`.
  </gotchas>

  <anti_patterns>
    - Do NOT use `actions/create-release` — deprecated. Use `gh` CLI bundled with the runner.
    - Do NOT pre-fetch tag list with `git fetch --tags` — `fetch-depth: 0` already pulls all refs.
    - Do NOT use `softprops/action-gh-release` (third-party); stick with `gh` CLI for minimal supply-chain surface.
    - Do NOT skip `set -euo pipefail` — silent failures on malformed CHANGELOG would create empty releases.
    - Do NOT include any "skip devflow" override or DEVFLOW_SKIP_EDIT_GATE references in the workflow file or planning artifacts. The executor handles edit-gate compliance via the active skill marker.
  </anti_patterns>

  <error_recovery>
    - If awk extraction yields empty output (heading found but section blank): fall through to `--generate-notes` rather than creating an empty release body.
    - If `gh release view` succeeds (release exists): `echo "release for $TAG already exists, skipping"` and `exit 0`.
    - If annotated-tag subject is empty (lightweight tag pushed instead of annotated): fall back to `$TAG` as the title.
  </error_recovery>
</embedded_context>

<file_tree>
.github/
└── workflows/
    ├── auto-label-issues.yml      (existing — reference for style)
    └── release.yml                ← CREATE
</file_tree>

<task type="auto">
  <name>Create .github/workflows/release.yml</name>
  <files>.github/workflows/release.yml</files>
  <action>
Create `.github/workflows/release.yml` with the following structure. Use two-space YAML indent matching `.github/workflows/auto-label-issues.yml`.

Top-level shape:
- name: Release on tag
- on.push.tags: ['v*']
- jobs.release.runs-on: ubuntu-latest
- jobs.release.permissions.contents: write
- jobs.release.steps: [checkout, create-release]

Step 1 — checkout:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0

Step 2 — create-release (single `run:` block):
  - name: Create release
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    run: |
      set -euo pipefail
      TAG="${GITHUB_REF_NAME}"
      VERSION="${TAG#v}"

      # Idempotency: skip if release already exists
      if gh release view "$TAG" >/dev/null 2>&1; then
        echo "release for $TAG already exists, skipping"
        exit 0
      fi

      # Title: annotated tag subject, fall back to tag name
      TITLE="$(git tag -l --format='%(contents:subject)' "$TAG")"
      if [ -z "$TITLE" ]; then
        TITLE="$TAG"
      fi

      # Body: CHANGELOG section if present, else auto-generate
      NOTES_FILE="$(mktemp)"
      if [ -f CHANGELOG.md ]; then
        awk -v ver="$VERSION" '
          $0 ~ "^## \\[" ver "\\]" { flag=1; next }
          flag && /^## \[/ { flag=0 }
          flag { print }
        ' CHANGELOG.md > "$NOTES_FILE"
      fi

      if [ -s "$NOTES_FILE" ]; then
        gh release create "$TAG" --title "$TITLE" --notes-file "$NOTES_FILE"
      else
        gh release create "$TAG" --title "$TITLE" --generate-notes
      fi

# CRITICAL: fetch-depth: 0 is non-negotiable — annotated tag messages are unavailable in shallow clones
# CRITICAL: Use `if gh release view ... ; then` form — bare invocation under set -e would abort on missing release
# GOTCHA: CHANGELOG heading uses VERSION (no v); tag name uses TAG (with v). Don't mix them in awk.
# GOTCHA: awk uses `^## \\[` ver `\\]` — escape the brackets in the regex; ver is interpolated via -v
# PATTERN: Match auto-label-issues.yml indent + step structure
  </action>
  <verify>
1. File exists: `test -f .github/workflows/release.yml && echo OK`
2. YAML parses: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "yaml OK"` (or `yq eval '.' .github/workflows/release.yml >/dev/null && echo OK` if yq available)
3. Required keys present: grep checks
   - `grep -q "tags:" .github/workflows/release.yml`
   - `grep -q "fetch-depth: 0" .github/workflows/release.yml`
   - `grep -q "contents: write" .github/workflows/release.yml`
   - `grep -q "set -euo pipefail" .github/workflows/release.yml`
   - `grep -q "GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}" .github/workflows/release.yml`
   - `grep -q "gh release view" .github/workflows/release.yml`
   - `grep -q -- "--generate-notes" .github/workflows/release.yml`
   - `grep -q -- "--notes-file" .github/workflows/release.yml`
4. actionlint (if available): `actionlint .github/workflows/release.yml` — no errors
5. Cross-check style: confirm two-space indent and step ordering matches `.github/workflows/auto-label-issues.yml`
  </verify>
  <done>
.github/workflows/release.yml exists, parses as valid YAML, contains all required directives (v* tag trigger, contents:write, fetch-depth:0, set -euo pipefail, GH_TOKEN wiring, idempotent gh release view check, CHANGELOG awk extraction, --notes-file/--generate-notes branching), and matches the formatting style of auto-label-issues.yml. No "skip devflow" override anywhere.
  </done>
  <recovery>
If actionlint reports errors: read the message, fix indentation or missing keys, re-run. Do not work around by removing required directives.
If YAML parser rejects the file: most likely cause is heredoc/run-block indentation drift — ensure the `run: |` block content is indented at least one level beyond `run:` and that no tab characters were introduced.
If awk regex fails to match a known good `## [X.Y.Z]` heading: verify the bracket escapes — the pattern needs `\\[` and `\\]` in the awk source so awk sees `\[` and `\]` at runtime.
  </recovery>
</task>

<verification>
Single-file workflow addition. Verification is exhaustively covered in the task's `<verify>` block. No additional integration tests — workflow runtime correctness will be exercised on the next `vX.Y.Z` tag push (the natural integration test).

Optional dry-run sanity (post-merge, pre-tag): use `act` (https://github.com/nektos/act) to simulate a tag push locally if the user has it installed. Not required for this task.
</verification>

<success_criteria>
- [ ] .github/workflows/release.yml exists
- [ ] Valid YAML (parser OK)
- [ ] Triggers on tag push matching v*
- [ ] permissions.contents: write declared
- [ ] actions/checkout@v4 with fetch-depth: 0
- [ ] Idempotent: existing-release check via `gh release view` short-circuits with exit 0
- [ ] Title pulled from annotated tag subject with tag-name fallback
- [ ] Body source: CHANGELOG `## [X.Y.Z]` section (awk-extracted) → `--notes-file`; else `--generate-notes`
- [ ] GH_TOKEN env from secrets.GITHUB_TOKEN
- [ ] `set -euo pipefail` at top of run script
- [ ] Two-space YAML indent matching auto-label-issues.yml
- [ ] No "skip devflow" / DEVFLOW_SKIP_EDIT_GATE references anywhere
</success_criteria>

<output>
.github/workflows/release.yml — production-ready release-on-tag workflow that creates a GitHub Release whenever a v* tag is pushed, sourcing the title from the annotated tag and the body from CHANGELOG.md when available (falling back to auto-generated notes), idempotent on re-run.
</output>
