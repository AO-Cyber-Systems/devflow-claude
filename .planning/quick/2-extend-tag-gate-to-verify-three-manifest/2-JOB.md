---
quick_task: 2-extend-tag-gate-to-verify-three-manifest
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/changelog-on-tag.js
autonomous: true
must_haves:
  - "git tag -a vX.Y.Z is denied if CHANGELOG.md is missing the entry (existing behavior preserved)"
  - "After CHANGELOG check passes, hook reads package.json, plugin.json, and marketplace.json and compares each .version to the tag (minus leading v)"
  - "If any of the three versions disagree with the tag, hook denies with a message listing each mismatched file with current vs expected version"
  - "If any of the three files is missing, the version-sync check is skipped silently (hook stays a no-op for non-devflow repos)"
  - "DEVFLOW_SKIP_CHANGELOG_GATE=1 still bypasses the entire hook (no new env var)"
  - "Header JSDoc comment block updated to reflect broadened scope (now a tag gate, not just a changelog gate); filename unchanged"
  - "Marketplace.json plugin entry located by name match against plugin.json .name; falls back to plugins[0] if no name match"
  - "All file I/O is synchronous; no new dependencies added; matches existing hook style"
---

<objective>
Extend `plugins/devflow/hooks/changelog-on-tag.js` so that, after the existing CHANGELOG entry check passes for `git tag -a vX.Y.Z`, the hook ALSO verifies that the three release manifests (`package.json`, `plugins/devflow/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`) all carry the matching version. If any disagree, deny the tag command with a clear per-file mismatch listing.

This closes a known release foot-gun: today the version-sync requirement (documented in CLAUDE.md > Conventions > "Version sync: Three files must have matching versions on every release") is enforced only by reviewer eyeballs at tag time. The hook already gates on CHANGELOG.md presence; extending it to gate on manifest-sync makes the three-file invariant non-violable at the same checkpoint.

Single file edit. ~30 LOC added. Synchronous fs, plain Node, reuses existing `deny()` helper and the `DEVFLOW_SKIP_CHANGELOG_GATE=1` escape hatch.
</objective>

<embedded_context>
  <codebase_examples>
    <example name="existing hook style — synchronous fs + deny() pattern">
File: plugins/devflow/hooks/changelog-on-tag.js (the file being edited)

```js
const fs = require('fs');
const path = require('path');

function findRepoRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

// ... CHANGELOG check using fs.existsSync + fs.readFileSync
const clPath = path.join(repoRoot, 'CHANGELOG.md');
if (!fs.existsSync(clPath)) return; // No CHANGELOG = nothing to gate
const content = fs.readFileSync(clPath, 'utf-8');
const versionRe = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm');
if (versionRe.test(content)) return; // Already documented — pass through
deny([...].join(' '));
```

Pattern to match:
- Synchronous `fs.existsSync` + `fs.readFileSync`
- `path.join(repoRoot, ...)` for repo-relative paths
- Skip silently (`return`) on missing files
- `deny()` for failure with multi-line reason joined by space
- No async, no try/catch around the deny — let it throw and the hook process exits non-zero
    </example>
  </codebase_examples>

  <file_shapes>
    <shape name="package.json (repo root)">
```json
{
  "name": "@ao-cyber-systems/devflow-cc",
  "version": "2.1.0",
  ...
}
```
Read `.version` (top-level scalar string).
    </shape>

    <shape name="plugins/devflow/.claude-plugin/plugin.json">
```json
{
  "name": "devflow",
  "version": "2.1.0",
  ...
}
```
Read `.version` AND `.name` (top-level scalar strings). The `.name` value ("devflow") is what we look up in marketplace.json.
    </shape>

    <shape name=".claude-plugin/marketplace.json">
```json
{
  "name": "aocyber",
  "version": "2.1.0",
  "plugins": [
    { "name": "devflow", "version": "2.1.0", ... },
    { "name": "social-media-generator", "version": "1.3.0", ... },
    { "name": "aosentry-mcp", "version": "1.0.0", ... }
  ]
}
```
Locate the entry in `.plugins[]` whose `.name` matches plugin.json's `.name`. Read that entry's `.version`. If no match found, defensively fall back to `plugins[0].version`.

Note: the top-level `.version` on marketplace.json is the marketplace bundle version, NOT the plugin version — do NOT compare it. Only the plugin entry's `.version` matters for this check.
    </shape>
  </file_shapes>

  <anti_patterns>
    - Do NOT compare marketplace.json's top-level `.version` (that's the marketplace bundle version, separate concern) — only the matched plugin entry's `.version`
    - Do NOT `try { JSON.parse } catch { deny(...) }` for parse errors — match existing pattern: skip silently on any read/parse failure (treat as "file not present" = no-op). The hook is a guardrail, not a JSON validator.
    - Do NOT introduce a new env var for the manifest-sync escape hatch — reuse `DEVFLOW_SKIP_CHANGELOG_GATE=1` (covers the entire hook, which is the right granularity since this hook IS the tag gate)
    - Do NOT change the filename `changelog-on-tag.js` — task body is explicit: "keep the filename for now"
    - Do NOT add async/await — match existing synchronous style
    - Do NOT `require()` any new dependencies — pure Node `fs`/`path` only
    - Do NOT swap the existing CHANGELOG check ordering — manifest check runs AFTER CHANGELOG check passes (matches task body: "additionally")
  </anti_patterns>

  <error_recovery>
    - If `package.json` doesn't exist at repo root → skip silently (return; no-op)
    - If `plugins/devflow/.claude-plugin/plugin.json` doesn't exist → skip silently
    - If `.claude-plugin/marketplace.json` doesn't exist → skip silently
    - If any JSON.parse throws → skip silently (treat as file-not-present)
    - If marketplace.json has no `plugins` array, or it's empty → skip silently
    - If named plugin not found in marketplace plugins[] → fall back to plugins[0] (defensive, per task spec)
    - All three files present + parsed + version mismatch → DENY with per-file listing
  </error_recovery>
</embedded_context>

<gotchas>
  - The `version` variable in main() is the tag minus leading `v` (e.g., tag `v2.1.0` → version `2.1.0`). All three manifest comparisons must compare against this same string, not against the tag.
  - `plugin.json` is at `plugins/devflow/.claude-plugin/plugin.json` (NOT `.claude-plugin/plugin.json` at repo root). The repo-root `.claude-plugin/` directory holds `marketplace.json`. Easy to mix up — both are `.claude-plugin/` directories at different depths.
  - JSON.parse failures must NOT crash the hook. Wrap each read+parse in try/catch and treat any failure as "skip silently" (file effectively missing). The hook's contract is "guardrail when applicable, no-op otherwise" — never a source of false denials.
  - The fallback "plugins[0] if named plugin not found" is defensive — in the actual repo, the `devflow` plugin IS plugins[0], so this fallback is for resilience if marketplace.json is reordered. The mismatch message should still report which plugin entry was actually compared (use the entry's `.name`, not plugin.json's `.name`, in the message — clearer for the reader).
  - The deny message format already uses single-line space-joined sentences. Manifest mismatch listing benefits from being multi-line for readability — use `\n` inside the joined string, OR build a multi-line string and pass it as-is to `deny()`. `deny()` doesn't constrain newlines; both work. Prefer readable multi-line.
</gotchas>

<task type="auto">
  <name>Extend changelog-on-tag.js with three-manifest version-sync verification</name>
  <files>plugins/devflow/hooks/changelog-on-tag.js</files>
  <action>
Modify `plugins/devflow/hooks/changelog-on-tag.js` to add a manifest-version-sync check that runs AFTER the existing CHANGELOG check passes (i.e., after `if (versionRe.test(content)) return;` would have returned but didn't deny — actually the existing flow is: CHANGELOG check passes → fall through; CHANGELOG check fails → deny. So manifest check runs in the "fall through" path).

Step 1 — Update the JSDoc header at the top of the file (lines 3-14) to reflect the broadened scope. Keep the `@fileoverview`-style top sentence accurate. New header text:

```
/**
 * DevFlow Tag Gate (PreToolUse, Bash)
 *
 * Fires when Claude is about to run `git tag -a vX.Y.Z`. Enforces two invariants:
 *
 *   1. CHANGELOG.md has a heading for that version (`## [X.Y.Z]`).
 *   2. The three release manifests carry matching versions:
 *        - package.json
 *        - plugins/devflow/.claude-plugin/plugin.json
 *        - .claude-plugin/marketplace.json (the plugin entry matching plugin.json `.name`)
 *
 * If CHANGELOG is missing the entry, denies and tells Claude to run
 * `df-tools changelog update --version vX.Y.Z` first.
 *
 * If any manifest version disagrees with the tag, denies with a per-file
 * mismatch listing.
 *
 * Repos without a CHANGELOG.md skip the changelog check silently.
 * Repos missing any of the three manifests skip the version-sync check silently
 * (so the hook stays a no-op for repos that aren't this one).
 * Tags that do not match vMAJOR.MINOR.PATCH skip silently.
 *
 * Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1 (covers both checks).
 *
 * Filename intentionally retained as `changelog-on-tag.js` for now; rename deferred.
 */
```

Step 2 — Add a helper function above `main()` (between `deny()` and `main()`):

```js
function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}
```

Step 3 — Inside `main()`, after the existing CHANGELOG check (`if (versionRe.test(content)) return;` is the gate that returns early when CHANGELOG is OK; the line right after that — `deny([...])` — fires when CHANGELOG is missing the entry). The new manifest check goes AFTER the early-return but BEFORE the deny — meaning we need to restructure: CHANGELOG OK falls through to manifest check, CHANGELOG missing fires its own deny first.

Concretely, replace:

```js
  if (versionRe.test(content)) return; // Already documented — pass through

  deny([
    `CHANGELOG.md has no entry for ${tag}.`,
    ...
  ].join(' '));
}
```

With:

```js
  if (!versionRe.test(content)) {
    deny([
      `CHANGELOG.md has no entry for ${tag}.`,
      `Run before tagging:`,
      `  node ~/.claude/devflow/bin/df-tools.cjs changelog update --version ${tag}`,
      `Then commit the CHANGELOG update, then re-run the tag command.`,
      `Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1`,
    ].join(' '));
  }

  // Manifest version-sync check.
  const pkg = readJsonSafe(path.join(repoRoot, 'package.json'));
  const plugin = readJsonSafe(path.join(repoRoot, 'plugins/devflow/.claude-plugin/plugin.json'));
  const market = readJsonSafe(path.join(repoRoot, '.claude-plugin/marketplace.json'));

  // Skip silently if any of the three are absent / unparseable — keeps hook a no-op for other repos.
  if (!pkg || !plugin || !market) return;
  if (!Array.isArray(market.plugins) || market.plugins.length === 0) return;

  const pluginName = plugin.name;
  const marketEntry =
    market.plugins.find((p) => p && p.name === pluginName) || market.plugins[0];

  const mismatches = [];
  if (pkg.version !== version) {
    mismatches.push(`  package.json: ${pkg.version} (expected ${version})`);
  }
  if (plugin.version !== version) {
    mismatches.push(`  plugins/devflow/.claude-plugin/plugin.json: ${plugin.version} (expected ${version})`);
  }
  if (marketEntry && marketEntry.version !== version) {
    mismatches.push(`  .claude-plugin/marketplace.json [${marketEntry.name}]: ${marketEntry.version} (expected ${version})`);
  }

  if (mismatches.length > 0) {
    deny([
      `Manifest versions out of sync for tag ${tag}:`,
      ...mismatches,
      ``,
      `Update each file to ${version} and commit before tagging.`,
      `Escape hatch: DEVFLOW_SKIP_CHANGELOG_GATE=1`,
    ].join('\n'));
  }
}
```

# CRITICAL: The CHANGELOG-missing branch must DENY (terminates via process.exit(0) inside deny()), so manifest check ONLY runs when CHANGELOG is present and has the entry. The control flow is:
#   - CHANGELOG.md missing entirely → return (existing line 63 behavior, preserved)
#   - CHANGELOG.md exists, missing version entry → deny CHANGELOG message
#   - CHANGELOG.md exists, has version entry → fall through to manifest check
#   - Any manifest missing → return silently
#   - All manifests present, all versions match → fall through (implicit return at end of main)
#   - Any manifest version disagrees → deny manifest mismatch message

# GOTCHA: deny() calls process.exit(0), so once it fires control never returns. Don't worry about double-denying.

# GOTCHA: The marketplace entry name in the deny message uses `marketEntry.name` (what we actually looked at) rather than `pluginName` (what we wanted) — handles the defensive fallback case where plugins[0] was used because pluginName wasn't found. The user sees exactly which entry was compared.

# PATTERN: Match existing `deny([...].join(' '))` pattern, but switch to `.join('\n')` for the manifest message — multi-line is more readable for a list of mismatches and `deny()` does not constrain the reason format.
  </action>
  <verify>
1. The file parses and runs without throwing:
   ```
   node -e "require('/Users/markemerson/Source/devflow-claude/plugins/devflow/hooks/changelog-on-tag.js')"
   ```
   (Loading the module will execute `main()` which reads stdin; with no stdin it should return silently from the early `JSON.parse` failure path. Exit code 0, no thrown error.)

2. CHANGELOG-pass + manifest-pass scenario (current repo state, all at 2.1.0): simulate a `git tag -a v2.1.0` PreToolUse:
   ```
   echo '{"tool_name":"Bash","tool_input":{"command":"git tag -a v2.1.0 -m test"}}' | \
     node /Users/markemerson/Source/devflow-claude/plugins/devflow/hooks/changelog-on-tag.js
   ```
   Expected: empty stdout (hook allows by emitting nothing), exit code 0. Verifies both checks pass when CHANGELOG has the entry AND all three manifests match.

3. Manifest-mismatch scenario (without modifying real files): simulate a tag for a version that doesn't exist in CHANGELOG to confirm CHANGELOG-deny still fires first:
   ```
   echo '{"tool_name":"Bash","tool_input":{"command":"git tag -a v9.9.9 -m test"}}' | \
     node /Users/markemerson/Source/devflow-claude/plugins/devflow/hooks/changelog-on-tag.js
   ```
   Expected: stdout contains `"permissionDecision":"deny"` and `"CHANGELOG.md has no entry for v9.9.9"`. Confirms CHANGELOG check still fires first and manifest check is correctly gated behind it.

4. Tag-not-matching pattern still skips silently:
   ```
   echo '{"tool_name":"Bash","tool_input":{"command":"git tag -a release-1 -m test"}}' | \
     node /Users/markemerson/Source/devflow-claude/plugins/devflow/hooks/changelog-on-tag.js
   ```
   Expected: empty stdout (no match on regex, early return).

5. Escape hatch still works:
   ```
   DEVFLOW_SKIP_CHANGELOG_GATE=1 echo '{"tool_name":"Bash","tool_input":{"command":"git tag -a v9.9.9 -m test"}}' | \
     DEVFLOW_SKIP_CHANGELOG_GATE=1 node /Users/markemerson/Source/devflow-claude/plugins/devflow/hooks/changelog-on-tag.js
   ```
   Expected: empty stdout (env-var bypass at top of main() returns immediately).

6. Visual diff inspection: `git diff plugins/devflow/hooks/changelog-on-tag.js` should show only the JSDoc header rewrite, the new `readJsonSafe` helper, and the manifest-check block inserted after the CHANGELOG check (CHANGELOG deny logic restructured into an `if (!versionRe.test(content)) { deny(...) }` block). No other changes. Total LOC delta: ~30-40 lines added.
  </verify>
  <done>
- File compiles and runs without errors via `node -e require(...)` smoke test
- All four verify scenarios produce expected behavior
- JSDoc header reflects "Tag Gate" with two invariants documented
- `readJsonSafe()` helper is defined between `deny()` and `main()`
- CHANGELOG check restructured to `if (!versionRe.test(content)) deny(...)` (so flow falls through to manifest check on success)
- Manifest check reads all three files via `readJsonSafe`, returns silently if any missing/unparseable
- Marketplace entry resolved by `plugins.find(p => p.name === plugin.name) || plugins[0]`
- Mismatch listing names each file with current and expected version
- Marketplace mismatch line uses the actual `marketEntry.name` (handles fallback case)
- Multi-line deny message via `.join('\n')`
- DEVFLOW_SKIP_CHANGELOG_GATE=1 still bypasses everything
- No new env vars, no new dependencies, no async, no filename change
  </done>
  <recovery>
If verify steps fail:
- "ReferenceError: readJsonSafe is not defined" → helper placement wrong; ensure it's at module scope above `main()`, not inside `main()`
- CHANGELOG-pass scenario produces a deny → control flow regression; check that the CHANGELOG check is `if (!versionRe.test(content)) { deny(...) }` (negated) and NOT `if (versionRe.test(content)) return; deny(...)` (the original) — the restructure flips the condition so flow continues on pass
- Manifest mismatch scenario produces no deny when versions actually disagree → check that `pkg.version !== version` (NOT `!== tag`); the comparison is against the stripped version string, not the `v`-prefixed tag
- "TypeError: Cannot read properties of null" reading marketplace plugin entry → missing the `if (!Array.isArray(market.plugins) || market.plugins.length === 0) return;` guard

Rollback: `git checkout -- plugins/devflow/hooks/changelog-on-tag.js` restores the previous behavior. No other files touched.
  </recovery>
</task>

<verification>
After the task completes:
1. Run `node --test plugins/devflow/hooks/changelog-on-tag.test.cjs 2>/dev/null` if test file exists; otherwise rely on the manual verify scenarios in the task `<verify>` block.
2. Inspect with `git diff plugins/devflow/hooks/changelog-on-tag.js`. Confirm: (a) JSDoc header rewritten, (b) `readJsonSafe` helper added, (c) CHANGELOG check restructured, (d) manifest block added, (e) no other unintended edits.
3. Confirm the CHANGELOG.md current entry for v2.1.0 still exists (`grep '^## \[2.1.0\]' CHANGELOG.md`) — sanity check that the test repo state still passes the gate end-to-end.
</verification>

<success_criteria>
- Single file modified: `plugins/devflow/hooks/changelog-on-tag.js`
- ~30 LOC added (JSDoc rewrite + helper + manifest block)
- All five verify scenarios pass
- Hook continues to no-op for repos missing any of the three manifests
- Hook denies tags when manifests are out of sync, with per-file mismatch detail
- Existing CHANGELOG check behavior preserved (just restructured)
- Existing escape hatch preserved
- No new dependencies, no new env vars, no filename change
</success_criteria>

<output>
A modified `plugins/devflow/hooks/changelog-on-tag.js` that:
- Documents itself as a "Tag Gate" enforcing two invariants (CHANGELOG entry + manifest sync)
- Reads all three manifests synchronously with safe JSON parsing
- Compares each `.version` against the tag's stripped version string
- Locates the marketplace plugin entry by name match (with defensive fallback to plugins[0])
- Denies with a per-file mismatch listing when any disagree
- Skips the manifest check silently in repos missing any of the three files
- Reuses the existing `DEVFLOW_SKIP_CHANGELOG_GATE=1` escape hatch
- Maintains the existing synchronous-fs, plain-Node, no-deps style
</output>
