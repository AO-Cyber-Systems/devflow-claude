---
quick_task: 14-bump-mcp-gem-to-0-25-0-in-aosentry-mcp-l
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock
  - plugins/aosentry-mcp/mcp_servers/media/Gemfile.lock
  - .github/dependabot.yml
autonomous: true
must_haves:
  - "Both Gemfile.lock files resolve mcp to 0.25.0 (the highest version satisfying the existing `~> 0.8` constraint), closing all 10 open Dependabot alerts"
  - "Neither Gemfile is modified — `gem \"mcp\", \"~> 0.8\"` already admits 0.25.0, so the DEPENDENCIES block stays byte-identical"
  - "No Ruby source changes — server.rb and lib/tools/*.rb are untouched"
  - "The json-schema -> json_schemer dependency swap is reflected correctly: json-schema removed, json_schemer + hana + regexp_parser + simpleidn added, each with a CHECKSUMS entry"
  - "The PLATFORMS block still contains exactly x86_64-linux-gnu and x86_64-linux-musl — no darwin platform leaked in from the local machine"
  - "BUNDLED WITH still reads 4.0.6"
  - "The two lockfiles remain byte-identical to each other after the update (they are identical today)"
  - ".github/dependabot.yml exists with exactly three update blocks: bundler at the two mcp_servers dirs, npm at /"
  - "No dependabot entry points at a directory with no manifest (the two mcp-servers npm dirs from the original recon do NOT exist)"
  - "`npm test` still passes at its pre-change baseline (regression check only — it does not cover the Ruby servers)"
---

<objective>
Close 10 open Dependabot alerts by bumping the `mcp` (MCP Ruby SDK) gem from **0.12.0 to 0.25.0** in the two `aosentry-mcp` lockfiles, and add the `.github/dependabot.yml` that was missing — which is *why* these alerts sat open with no automated update PRs.

Advisories closed: GHSA-5p9g-j988-pcwv, GHSA-h669-8m4g-r2hc, GHSA-52jp-gj8w-j6xh, GHSA-7683-3w9x-ch42, GHSA-rjr6-rcgv-9m7m. Patched floor is 0.23.0.

Three files: two regenerated lockfiles, one new config. **No Gemfile change, no Ruby source change.**

Output: two `Gemfile.lock` files resolving `mcp (0.25.0)`, and a new `.github/dependabot.yml` covering bundler x2 + npm x1.
</objective>

<file_tree>
```
.github/
└── dependabot.yml                                    ← CREATE

plugins/aosentry-mcp/mcp_servers/
├── management/
│   ├── Gemfile                                       (untouched)
│   └── Gemfile.lock                                  ← MODIFY (regenerate)
└── media/
    ├── Gemfile                                       (untouched)
    └── Gemfile.lock                                  ← MODIFY (regenerate)
```
</file_tree>

<embedded_context>

  <corrections_to_prior_recon>
Two facts from the original reconnaissance were checked against the working tree and are **wrong**. Both corrections are load-bearing.

**Correction 1 — the npm directories do not exist.**
The recon said dependabot should cover npm at `/plugins/devflow/mcp-servers` and `/plugins/devflow-agent/mcp-servers`. Neither path exists:

```
$ ls plugins/devflow/mcp-servers
ls: plugins/devflow/mcp-servers: No such file or directory
$ ls plugins/devflow-agent/mcp-servers
ls: plugins/devflow-agent/mcp-servers: No such file or directory

$ git ls-files | grep -E 'package(-lock)?\.json$'
package-lock.json
package.json
```

They were removed — which is exactly why the two `@playwright/mcp` alerts already show state `fixed`. **Dependabot hard-errors on a configured directory with no manifest**, so configuring them would break the config. The only tracked npm manifests are `package.json` + `package-lock.json` at the repo root.

(`find` also surfaces lockfiles under `.claude/worktrees/mystifying-gates/` — those are **gitignored** (`.gitignore:10:.claude/`), invisible to Dependabot, and must not be configured.)

**Correction 2 — this is NOT a one-line version bump.**
The recon described the change as line 38 plus a checksum line. In fact **0.25.0 swaps its schema-validation dependency to a different gem**:

```
mcp 0.12.0  runtime dep:  json-schema  (>= 4.1)
mcp 0.25.0  runtime dep:  json_schemer (>= 2.4)     <-- different gem, note the underscore
```

So the lockfile diff is a small dependency-tree change, not a one-liner. See `<expected_lockfile_delta>` below for the exact predicted shape.
  </corrections_to_prior_recon>

  <why_0_25_0_and_not_1_x>
The gem has shipped 1.0.0 through 1.4.0 (latest 1.4.0, 2026-08-28). Those are **correctly excluded** — the Gemfile's pessimistic constraint `gem "mcp", "~> 0.8"` means `>= 0.8, < 1.0`. 0.25.0 (2026-07-18) is the highest version that resolves. This is expected, not a resolution failure. Do **not** widen the constraint to reach 1.x; that is out of scope for this task and would require the API review that was only done for the 0.x line.
  </why_0_25_0_and_not_1_x>

  <api_compatibility_already_verified>
Verified against the unpacked gem — **no source changes needed** in `server.rb` or `lib/tools/*.rb`:

- `MCP::Server.new(name:, version:, tools:)` — unchanged
- `MCP::Tool` DSL: `description`, `input_schema(properties:)`, `def self.call(server_context:)` — unchanged
- `MCP::Tool::Response.new(content, error: true)` — unchanged. (The *deprecated* form is the positional 2nd arg; this repo uses the keyword form, so it is unaffected.)
- `MCP::Server::Transports::StdioTransport.new(server)` — unchanged; 0.23+ adds an *optional* `max_line_bytes:` kwarg defaulting to 4 MiB.

Do not "fix" Ruby source. If something looks like it needs changing, stop and report instead.
  </api_compatibility_already_verified>

  <current_lockfile_state>
Both lockfiles are **byte-identical to each other** (`diff` returns clean). Both Gemfiles are byte-identical too. Relevant excerpts:

`Gemfile` (both servers — DO NOT EDIT):
```ruby
# frozen_string_literal: true

source "https://rubygems.org"
source "https://rubygems.pkg.github.com/ao-cyber-systems" do
  gem "aosentry", "~> 2.0"
end

gem "mcp", "~> 0.8"
gem "base64"
```

`Gemfile.lock` — the three places `mcp` appears today:
```
38:    mcp (0.12.0)
39:      json-schema (>= 4.1)
66:  mcp (~> 0.8)                 <- DEPENDENCIES block; must NOT change
92:  mcp (0.12.0) sha256=9ebbb0e39dda4845db720c7efbafdaca7a6db8f1e42d17bcc6f9df78733d0f2e
```

Blocks that must survive untouched:
```
PLATFORMS
  x86_64-linux-gnu
  x86_64-linux-musl

DEPENDENCIES
  aosentry (~> 2.0)!
  base64
  mcp (~> 0.8)

BUNDLED WITH
  4.0.6
```
  </current_lockfile_state>

  <expected_lockfile_delta>
Predicted from the rubygems API. Use this to sanity-check the diff — if the real diff is materially larger, stop and report.

**GEM specs block — changed:**
```
-    json-schema (6.2.0)
-      addressable (~> 2.8)
-      bigdecimal (>= 3.1, < 5)
+    hana (1.3.7)
+    json_schemer (2.5.0)
+      bigdecimal
+      hana (~> 1.3)
+      regexp_parser (~> 2.0)
+      simpleidn (~> 0.2)
-    mcp (0.12.0)
-      json-schema (>= 4.1)
+    mcp (0.25.0)
+      json_schemer (>= 2.4)
+    regexp_parser (2.12.0)
+    simpleidn (0.3.0)
```
(Exact versions come from the resolver; treat the numbers above as expected-approximate, the *gem names* as exact. Specs stay alphabetically sorted, so the new entries interleave rather than appending at the end.)

**Gems that STAY (do not expect them to disappear):**
- `addressable (2.9.0)` — still required by `http (5.3.1)` -> `addressable (~> 2.8)`, independent of json-schema
- `bigdecimal (4.1.1)` — json-schema wanted `>= 3.1, < 5`; json_schemer wants `>= 0`. Still satisfied, version should not move.

**CHECKSUMS block:** remove the `json-schema` line, update the `mcp` line, add lines for `hana`, `json_schemer`, `regexp_parser`, `simpleidn`. Alphabetically sorted.

**Unchanged:** `PLATFORMS`, `DEPENDENCIES`, `BUNDLED WITH`, and the entire private-source `GEM remote: https://rubygems.pkg.github.com/...` block.
  </expected_lockfile_delta>

  <private_source_credential>
Both Gemfiles pull `aosentry` from a **private** GitHub Packages source, so resolution needs credentials. The credential currently in `~/.bundle/config` is **rejected** ("Bad username or password"). Override it per-invocation with an env var — Bundler maps the source host to an env var by uppercasing and replacing `.` with `__`:

```
https://rubygems.pkg.github.com  ->  BUNDLE_RUBYGEMS__PKG__GITHUB__COM
```

The working invocation (confirmed in a scratch copy — it produced `mcp (0.25.0)`):
```bash
BUNDLE_RUBYGEMS__PKG__GITHUB__COM="justindonnaruma:$(gh auth token)" bundle lock --update=mcp
```

The env var takes precedence over the stale `~/.bundle/config` entry. Do **not** edit `~/.bundle/config`.

Preconditions verified on this machine: ruby 4.0.1, bundler 4.0.6 (matches `BUNDLED WITH`, so that line will not move), `gh` authenticated as `justindonnaruma` with `write:packages` scope (which implies read).
  </private_source_credential>

  <anti_patterns>
    - Do NOT run `bundle install` — it installs gems and will add the local `arm64-darwin` platform to the lockfile. Lockfile-only resolution is the goal.
    - Do NOT run `bundle update` (bare) — it re-resolves *every* gem. The diff must be confined to the `mcp` tree. Use `bundle lock --update=mcp`.
    - Do NOT edit either `Gemfile`. `~> 0.8` already admits 0.25.0. A Gemfile change means something went wrong.
    - Do NOT hand-edit the lockfiles. The CHECKSUMS sha256 values cannot be fabricated — they must come from the resolver.
    - Do NOT touch `server.rb` or `lib/tools/*.rb`. API compatibility is already verified (see above).
    - Do NOT widen the constraint to reach mcp 1.x. Out of scope.
    - Do NOT add dependabot entries for `plugins/devflow/mcp-servers` or `plugins/devflow-agent/mcp-servers` — they do not exist and would error the config.
    - Do NOT add dependabot entries for anything under `.claude/worktrees/` — gitignored.
    - Do NOT edit `~/.bundle/config` to fix the stale credential — scope the fix to the command invocation.
    - Do NOT use raw `git commit` — the repo's `gate-commits.js` hook blocks it. Use `df-tools commit`.
  </anti_patterns>

  <error_recovery>
    - **"Bad username or password" / 401 from rubygems.pkg.github.com** → the `BUNDLE_RUBYGEMS__PKG__GITHUB__COM` env var was not set or `gh auth token` returned empty. Verify with `gh auth status`; confirm `gh auth token` prints a `gho_` token.
    - **Resolver reports mcp stays at 0.12.0** → `--update=mcp` was dropped from the command; without it bundler honors the existing lock. Re-run with the flag.
    - **Resolver picks 1.x** → the Gemfile constraint was modified. Revert the Gemfile; `~> 0.8` must stay.
    - **`arm64-darwin-25` (or similar) appears in PLATFORMS** → the most likely unwanted side effect on this machine. Remove it: `bundle lock --remove-platform arm64-darwin-25` (with the same credential env var). If that fails, revert and re-run, or hand-remove *only* the added PLATFORMS line — that block is plain text with no checksums, so it is safe to edit by hand. This is the one hunk where manual correction is acceptable.
    - **`BUNDLED WITH` changes** → unexpected, since local bundler is 4.0.6 and matches. Revert that hunk by hand.
    - **Diff is much larger than `<expected_lockfile_delta>` (many unrelated gems moved)** → `bundle update` was run instead of `bundle lock --update=mcp`. Revert both lockfiles and re-run with the correct command.
    - **Network unavailable / rubygems.org unreachable** → cannot proceed; CHECKSUMS require the remote. Report as blocked; do not fabricate checksums.
    - **Rollback for Task 1:** `git checkout -- plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock plugins/aosentry-mcp/mcp_servers/media/Gemfile.lock`
    - **Rollback for Task 2:** `rm .github/dependabot.yml` (new file, nothing else touched).
  </error_recovery>

</embedded_context>

<gotchas>
  - **`json-schema` vs `json_schemer` are different gems.** Hyphen vs underscore. Easy to misread as a version bump of the same gem. The old one is removed and the new one added.
  - **The schema *engine* changed even though the *API* did not.** `input_schema(properties:)` has the same signature, but validation is now performed by json_schemer. Error message text and edge-case strictness could differ at runtime. The public API review found no breakage, so this does not block the bump — but if the servers are smoke-tested later and a schema-validation message looks different, this is the cause, not a regression introduced here.
  - **PLATFORMS has no darwin entry** (`x86_64-linux-gnu`, `x86_64-linux-musl` only) and we are resolving on arm64 macOS. This is the highest-probability unwanted diff hunk. Check it explicitly — it is in the `<verify>` block for exactly this reason.
  - **The two lockfiles are byte-identical today.** After both updates they should still be byte-identical. `diff` between them is a free, high-signal correctness check — a difference means one resolve went wrong.
  - **`bundle lock --update=mcp` must run with each server directory as CWD** (bundler resolves relative to `Gemfile`). Run it twice, once per directory. Do not try to do both from the repo root.
  - **`npm test` does not cover the Ruby servers.** It runs `node --test` over `plugins/devflow/**/*.test.cjs`. It is a regression check that nothing else broke — it is *not* validation that the gem bump works. There is no lint command in this repo.
  - **`.github/` already exists** (CODEOWNERS, FUNDING.yml, ISSUE_TEMPLATE/, pull_request_template.md, workflows/). Only `dependabot.yml` is new — do not disturb the directory's other contents.
  - **Dependabot directory paths are repo-root-absolute** and start with `/`. `/plugins/aosentry-mcp/mcp_servers/management`, not a relative path.
  - **No `target-branch` needed.** Dependabot defaults to the repo's default branch (`main`), which is correct even though this work happens on a feature branch.
</gotchas>

<task type="auto">
  <name>Regenerate both aosentry-mcp lockfiles to resolve mcp 0.25.0</name>
  <files>plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock, plugins/aosentry-mcp/mcp_servers/media/Gemfile.lock</files>
  <action>
Regenerate both lockfiles so `mcp` resolves to 0.25.0. **Lockfiles only** — no Gemfile edit, no Ruby source edit.

Run once per server directory, each with the server directory as CWD:

```bash
cd /Users/justin/dev/devflow-claude/plugins/aosentry-mcp/mcp_servers/management && \
  BUNDLE_RUBYGEMS__PKG__GITHUB__COM="justindonnaruma:$(gh auth token)" bundle lock --update=mcp
```

```bash
cd /Users/justin/dev/devflow-claude/plugins/aosentry-mcp/mcp_servers/media && \
  BUNDLE_RUBYGEMS__PKG__GITHUB__COM="justindonnaruma:$(gh auth token)" bundle lock --update=mcp
```

# CRITICAL: `bundle lock --update=mcp` — NOT `bundle install` (installs + adds local darwin platform), NOT bare `bundle update` (re-resolves every gem). The flag confines the diff to the mcp dependency subtree.
# CRITICAL: The BUNDLE_RUBYGEMS__PKG__GITHUB__COM env var is required — the credential in ~/.bundle/config is stale and returns "Bad username or password". Do not edit ~/.bundle/config; scope the credential to the invocation.
# GOTCHA: Expect json-schema to be REMOVED and json_schemer + hana + regexp_parser + simpleidn to be ADDED. mcp 0.25.0 changed its schema dependency. This is correct, not scope creep — see <expected_lockfile_delta>.
# GOTCHA: addressable and bigdecimal must SURVIVE (addressable is required by http; bigdecimal by json_schemer). If they vanish, the resolve went wrong.
# GOTCHA: Highest-risk side effect is a darwin platform being appended to PLATFORMS. Verify that block is unchanged; see <error_recovery> for the remove-platform fix.
# PATTERN: Both Gemfiles and both lockfiles are byte-identical. After both resolves they should still be byte-identical to each other — diff them as a correctness check.

Do NOT hand-edit the CHECKSUMS block. Those sha256 values come from the resolver and cannot be fabricated.
  </action>
  <verify>
Run from the repo root `/Users/justin/dev/devflow-claude`.

1. Both lockfiles resolve 0.25.0, and nothing still references 0.12.0:
```bash
grep -n 'mcp (0.25.0)' plugins/aosentry-mcp/mcp_servers/*/Gemfile.lock
grep -rn 'mcp (0.12.0)' plugins/aosentry-mcp/mcp_servers/*/Gemfile.lock && echo "FAIL: 0.12.0 still present" || echo "OK: no 0.12.0"
```
Expect two `mcp (0.25.0)` hits (one spec line + one CHECKSUMS line, per file — so four lines total across both files) and the "OK: no 0.12.0" branch.

2. The dependency swap landed:
```bash
grep -n 'json_schemer\|json-schema' plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock
```
Expect `json_schemer` present, `json-schema` absent.

3. Survivors still present:
```bash
grep -cn 'addressable\|bigdecimal' plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock
```
Expect a non-zero count.

4. PLATFORMS block unchanged — no darwin leak (**the highest-risk check**):
```bash
sed -n '/^PLATFORMS$/,/^$/p' plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock
```
Expect exactly `x86_64-linux-gnu` and `x86_64-linux-musl`. Any `darwin` entry must be removed before proceeding.

5. DEPENDENCIES and BUNDLED WITH unchanged:
```bash
grep -n 'mcp (~> 0.8)' plugins/aosentry-mcp/mcp_servers/*/Gemfile.lock
sed -n '/^BUNDLED WITH$/,+1p' plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock
```
Expect `mcp (~> 0.8)` still present in both, and `4.0.6`.

6. The two lockfiles are still byte-identical:
```bash
diff plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock \
     plugins/aosentry-mcp/mcp_servers/media/Gemfile.lock && echo "IDENTICAL"
```
Expect `IDENTICAL`.

7. Nothing outside the two lockfiles changed:
```bash
git status --porcelain
```
Expect only the two `Gemfile.lock` paths as modified. **No `Gemfile`, no `.rb` file.**

8. Diff shape matches the prediction:
```bash
git diff --stat plugins/aosentry-mcp/
git diff plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock
```
Expect a modest diff confined to the GEM specs block and CHECKSUMS block. If many unrelated gems moved, bare `bundle update` was run — revert and redo.
  </verify>
  <done>
- Both `Gemfile.lock` files contain `mcp (0.25.0)` in the specs block and a matching `mcp (0.25.0) sha256=...` CHECKSUMS line
- No occurrence of `mcp (0.12.0)` remains in either file
- `json-schema` removed; `json_schemer` present with a CHECKSUMS entry; `hana`, `regexp_parser`, `simpleidn` added with CHECKSUMS entries
- `addressable` and `bigdecimal` still present
- `PLATFORMS` contains exactly `x86_64-linux-gnu` and `x86_64-linux-musl` — no darwin entry
- `DEPENDENCIES` still lists `mcp (~> 0.8)`; `BUNDLED WITH` still `4.0.6`
- The two lockfiles are byte-identical to each other
- `git status --porcelain` shows only the two lockfiles modified — no Gemfile, no Ruby source
  </done>
  <recovery>
- Revert: `git checkout -- plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock plugins/aosentry-mcp/mcp_servers/media/Gemfile.lock`
- Darwin platform leaked into PLATFORMS → `bundle lock --remove-platform arm64-darwin-25` from the affected server dir (same credential env var), or hand-remove only that line (PLATFORMS is plain text with no checksums — safe to hand-edit; the CHECKSUMS block is not).
- 401 from the private source → re-check `gh auth status`; confirm `gh auth token` emits a token; ensure the env var name is exactly `BUNDLE_RUBYGEMS__PKG__GITHUB__COM` (double underscores between each host segment).
- Oversized diff → bare `bundle update` was used; revert and re-run with `bundle lock --update=mcp`.
- Network failure → report blocked. Do not fabricate CHECKSUMS values.
  </recovery>
</task>

<task type="auto">
  <name>Create .github/dependabot.yml covering the two bundler dirs and root npm</name>
  <files>.github/dependabot.yml</files>
  <action>
Create `.github/dependabot.yml` (new file — `.github/` exists but has no dependabot config, which is why the 10 alerts sat open with no update PRs).

Exactly **three** update blocks:

```yaml
version: 2

updates:
  # MCP Ruby SDK servers — the two Gemfiles that carried the mcp advisories.
  - package-ecosystem: "bundler"
    directory: "/plugins/aosentry-mcp/mcp_servers/management"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5

  - package-ecosystem: "bundler"
    directory: "/plugins/aosentry-mcp/mcp_servers/media"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5

  # Root Node package — the only tracked npm manifest in the repo.
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
```

# CRITICAL: Exactly three blocks. Do NOT add npm entries for `/plugins/devflow/mcp-servers` or `/plugins/devflow-agent/mcp-servers` — those directories DO NOT EXIST (they were removed; that is why the @playwright/mcp alerts already read `fixed`). Dependabot hard-errors on a configured directory with no manifest, which would break the whole config.
# CRITICAL: Do NOT add entries for lockfiles under `.claude/worktrees/` — that path is gitignored (.gitignore:10) and invisible to Dependabot.
# GOTCHA: `directory` values are repo-root-absolute and begin with `/`.
# GOTCHA: No `target-branch` key — Dependabot defaults to the repo default branch (`main`), which is correct even though this work happens on a feature branch.
# PATTERN: Use the Write tool for this file (the repo's gate-edits hook governs Edit/Write; a skill marker is active during execution).

Do not add a `github-actions` ecosystem block. `.github/workflows/` exists, but action updates are outside this task's scope — mention it in the summary as a possible follow-up rather than adding it here.
  </action>
  <verify>
Run from the repo root `/Users/justin/dev/devflow-claude`.

1. File exists and is valid YAML with the right shape:
```bash
python3 -c "
import yaml
d = yaml.safe_load(open('.github/dependabot.yml'))
assert d['version'] == 2, 'version must be 2'
u = d['updates']
assert len(u) == 3, f'expected 3 update blocks, got {len(u)}'
for e in u:
    print(e['package-ecosystem'], e['directory'], e['schedule']['interval'])
print('OK')
"
```
Expect:
```
bundler /plugins/aosentry-mcp/mcp_servers/management weekly
bundler /plugins/aosentry-mcp/mcp_servers/media weekly
npm / weekly
OK
```

2. **Every configured directory actually contains a manifest** (this is the check that prevents a broken config):
```bash
python3 -c "
import yaml, os
m = {'bundler': 'Gemfile', 'npm': 'package.json'}
for e in yaml.safe_load(open('.github/dependabot.yml'))['updates']:
    p = os.path.join('.' + e['directory'], m[e['package-ecosystem']])
    print(('OK  ' if os.path.exists(p) else 'FAIL'), p)
"
```
Every line must read `OK`.

3. The non-existent directories are absent from the config:
```bash
grep -n 'devflow/mcp-servers\|devflow-agent/mcp-servers\|worktrees' .github/dependabot.yml && echo "FAIL: bad path present" || echo "OK: no bad paths"
```
Expect `OK: no bad paths`.

4. Nothing else in `.github/` disturbed:
```bash
git status --porcelain .github/
```
Expect a single `?? .github/dependabot.yml` entry.
  </verify>
  <done>
- `.github/dependabot.yml` exists, parses as YAML, `version: 2`
- Exactly three update blocks: bundler at the two `mcp_servers` directories, npm at `/`
- Every configured directory contains the manifest its ecosystem requires (verify step 2 all `OK`)
- No reference to `plugins/devflow/mcp-servers`, `plugins/devflow-agent/mcp-servers`, or `.claude/worktrees`
- All three blocks on a weekly schedule
- No other file in `.github/` modified
  </done>
  <recovery>
- Revert: `rm .github/dependabot.yml` (new file; nothing else touched).
- YAML parse error → check indentation; `updates` is a list of mappings, `schedule` is a nested mapping.
- Verify step 2 reports FAIL → a configured directory has no manifest. Remove that block rather than creating a manifest.
  </recovery>
</task>

<verification>
After both tasks:

1. Regression check (does **not** cover the Ruby servers — it runs `node --test` over `plugins/devflow/**/*.test.cjs`). Compare against the pre-change baseline; capture the baseline first if not already known:
```bash
npm test
```
Expect the same pass/fail counts as before this change. Any delta is unrelated to a Ruby lockfile bump and should be investigated as pre-existing.

2. Full change footprint is exactly three files:
```bash
git status --porcelain
```
Expect: `M plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock`, `M plugins/aosentry-mcp/mcp_servers/media/Gemfile.lock`, `?? .github/dependabot.yml`. Nothing else.

3. Confirm no Gemfile and no Ruby source drifted:
```bash
git diff --name-only | grep -E 'Gemfile$|\.rb$' && echo "FAIL: out-of-scope file changed" || echo "OK: lockfiles only"
```
Expect `OK: lockfiles only`.

4. Alerts should close once this lands on the default branch. The five advisories (GHSA-5p9g-j988-pcwv, GHSA-h669-8m4g-r2hc, GHSA-52jp-gj8w-j6xh, GHSA-7683-3w9x-ch42, GHSA-rjr6-rcgv-9m7m) all have a patched floor of 0.23.0, which 0.25.0 clears.

5. Commit via df-tools (the `gate-commits.js` hook blocks raw `git commit`):
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "fix(deps): bump mcp gem to 0.25.0 and add dependabot config" --files plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock plugins/aosentry-mcp/mcp_servers/media/Gemfile.lock .github/dependabot.yml
```
</verification>

<success_criteria>
- Exactly three files changed: two `Gemfile.lock` (modified), one `.github/dependabot.yml` (created)
- Both lockfiles resolve `mcp (0.25.0)`; no `mcp (0.12.0)` remains anywhere
- The `json-schema` -> `json_schemer` swap is correctly reflected, with CHECKSUMS entries for `json_schemer`, `hana`, `regexp_parser`, `simpleidn`
- `PLATFORMS`, `DEPENDENCIES`, and `BUNDLED WITH` blocks are unchanged in both lockfiles
- The two lockfiles remain byte-identical to each other
- No `Gemfile` modified; no `server.rb` or `lib/tools/*.rb` modified
- `.github/dependabot.yml` has exactly three update blocks, every one pointing at a directory that actually contains the required manifest
- `npm test` matches its pre-change baseline
- All 10 Dependabot alerts are addressed (patched floor 0.23.0, cleared by 0.25.0)
</success_criteria>

<output>
- `plugins/aosentry-mcp/mcp_servers/management/Gemfile.lock` — mcp 0.12.0 -> 0.25.0, json-schema -> json_schemer subtree
- `plugins/aosentry-mcp/mcp_servers/media/Gemfile.lock` — identical change
- `.github/dependabot.yml` — new; weekly bundler updates for the two MCP server directories and weekly npm updates for the repo root, so future advisories arrive as PRs instead of accumulating as silent alerts

Follow-up worth noting in the summary (not in scope here): a `github-actions` ecosystem block could be added for `.github/workflows/`, and the `mcp` gem's 1.x line (currently 1.4.0) is excluded by the `~> 0.8` constraint and would need an API review before adopting.
</output>
