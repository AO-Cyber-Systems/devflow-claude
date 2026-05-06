---
objective: 19-pty-handoff-watcher
trd: "04"
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - docs/handoff-watcher-guide.md
autonomous: true
requirements:
  - DOC-PTY-CAVEATS
must_haves:
  truths:
    - "handoff-watcher-guide.md has a new top-level section titled '## PTY support (v1.2+)' or similar that explains node-pty backing"
    - "handoff-watcher-guide.md has a 'Platform notes' subsection covering macOS, Linux, Windows install behavior"
    - "handoff-watcher-guide.md has a 'Token-passing for prompts' subsection documenting inputs.secrets[] schema"
    - "handoff-watcher-guide.md 'Future (v1.2+)' section is updated to reflect PTY shipped (move out of future) and stash CLI documented as the next step"
    - "handoff-watcher-guide.md mentions 'sudo / su -' is still deny-listed even with PTY backing"
    - "handoff-watcher-guide.md mentions DEVFLOW_HANDOFF_PID_FILE / DEVFLOW_WATCH_ALLOW_FILE env override table is unchanged"
    - "Existing sections (What it is, When you'd use it, Quick start, Subcommands, Architecture, Configuration, Watcher-off mode, Troubleshooting, Security model) are preserved"
  artifacts:
    - path: "docs/handoff-watcher-guide.md"
      provides: "Updated user-facing guide covering PTY backing, platform install notes, token-passing"
      min_lines: 290
      contains: "node-pty"
  key_links:
    - from: "docs/handoff-watcher-guide.md"
      to: "node-pty install troubleshooting"
      via: "Platform notes subsection"
      pattern: "macOS|Linux|Windows"
    - from: "docs/handoff-watcher-guide.md"
      to: "Token-passing schema"
      via: "Documents inputs.secrets[].value_source = stash | env (keyring deferred)"
      pattern: "inputs\\.secrets|value_source"
---

<objective>
Update `docs/handoff-watcher-guide.md` with PTY caveats, platform install notes, token-passing schema documentation, and security implications. Preserve all existing sections (What it is, Quick start, Architecture, Configuration, Troubleshooting, etc.).

Purpose: Locked decision 1 + 4 of 19-CONTEXT.md require user-facing docs to cover the node-pty install requirement, platform behavior (macOS-first, Linux out-of-box, Windows best-effort), and the new token-passing schema (`inputs.secrets[]`). Without these, users will be surprised by the native dependency and the new pending-record fields.

Output: Updated `handoff-watcher-guide.md` with three new/expanded sections: PTY support, Platform notes, Token-passing for prompts. Existing sections preserved.
</objective>

<file_tree>
docs/
└── handoff-watcher-guide.md     ← MODIFY (add PTY sections, preserve existing)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: Existing handoff-watcher-guide.md structure (docs/handoff-watcher-guide.md)

The file currently has these top-level sections (preserve all of them):
- `# Seamless Handoff Watcher — User Guide` (title)
- `## What it is`
- `## When you'd use it`
- `## Quick start`
- `## Subcommands`
- `## Architecture (brief)` (with ASCII diagram)
- `## Configuration` (with `### Allowlist`, `### Deny list`, `### Environment overrides`)
- `## Watcher-off mode (still useful)`
- `## Troubleshooting`
- `## Security model`
- `## Future (v1.2+)`

### Pattern: Section-insertion location (recommended)

Insert new sections in this order, after `## Configuration` and before `## Watcher-off mode`:

```
## Configuration
  ### Allowlist
  ### Deny list
  ### Environment overrides

## PTY support (v1.2+)               ← NEW
  ### Platform notes                  ← NEW
  ### Token-passing for prompts       ← NEW

## Watcher-off mode (still useful)
...
```

This keeps the operational sections (allowlist, deny list, env vars) together and the new PTY content adjacent to operational concerns.

### Pattern: Style / voice of existing doc

The existing guide uses:
- Sentence-case section headings
- Tables for env vars and field references
- Fenced code blocks with `bash` or `json` syntax tags
- Tone: concise, second-person ("you"), no emojis

Match this style.

</codebase_examples>

<anti_patterns>

- **DO NOT** rewrite or restructure existing sections (What it is, Quick start, Architecture, etc.). Append-only / insert-only edits.
- **DO NOT** rewrite the ASCII architecture diagram. The flow is unchanged at the protocol level — only the dispatch backend changed (pipe → PTY when `interactive:true`).
- **DO NOT** advertise the `keyring` value_source. Locked decision 5: it's rejected at runtime in v1.2. Document it as "v1.3+" if mentioned at all.
- **DO NOT** include code that pretends to invoke a `devflow-watch stash add` CLI if the stash CLI hasn't shipped — verify against TRD 19-02 SUMMARY before referencing the CLI in examples. Per CONTEXT.md §4, the stash backend is deferred unless 19-02's executor included it.
- **DO NOT** drop the `## Future (v1.2+)` section header or its content wholesale; just update bullets to reflect what's now shipped vs. what remains. The header itself can be retitled to `## Future (v1.3+)` since the section is now describing post-PTY work.

</anti_patterns>

<error_recovery>

- **If 19-02 SUMMARY shows the stash CLI shipped:** include a "Stash CLI" subsection with concrete examples. If 19-02 SUMMARY shows stash CLI was deferred: include a "Stash backend (deferred)" subsection that says env-source is the v1.2 working path and stash will land in v1.3.
- **If a referenced env var name doesn't exist** (typo in DEVFLOW_HANDOFF_PID_FILE etc.): grep `plugins/devflow/devflow/bin/lib/watcher-state.cjs` for the exact name and fix.
- **If markdown rendering breaks** (broken table, unclosed code fence): proofread by viewing the file in a markdown viewer or running `markdownlint` if available. Otherwise visual-inspect the file with `cat` and confirm no orphan ` ``` ` blocks.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/objectives/19-pty-handoff-watcher/19-CONTEXT.md
@.planning/objectives/19-pty-handoff-watcher/19-RESEARCH.md
@docs/handoff-watcher-guide.md
</context>

<gotchas>

- **Verify referenced files exist:** the doc references `plugins/devflow/devflow/bin/lib/watcher-shell.cjs` (now PTY-aware), `plugins/devflow/devflow/bin/lib/handoff.cjs` (validateInputsSchema), `plugins/devflow/hooks/gate-interactive.js` (PTY-backed daemon wording). Cross-check before publishing.

- **macOS-first language:** Locked decision 2. Document Linux as "out of the box," Windows as "best-effort with winpty-agent."

- **Don't promise things 19-02 may not have shipped:** if the stash CLI was deferred (per CONTEXT.md §4 discretion), the doc must accurately reflect that env is the working v1.2 path.

- **Existing "Future (v1.2+)" bullets** include OS notifications, auto-launch, multi-project, status-line, cross-shell. None of these change in this objective; they remain v1.2/v1.3 work. The doc just needs to:
  1. Move "PTY support" out of future and into a new dedicated section.
  2. Add a brief "what's still future" bullet for `keyring` secret backend.

- **Table for value_source enum:** use a small table to document the schema:

  | value_source | v1.2 status | Notes |
  |---|---|---|
  | `env` | shipped | Reads from `process.env[value_ref]` at dispatch time |
  | `stash` | (slot reserved) | In-memory per-handoff stash; populating CLI deferred |
  | `keyring` | rejected | Deferred to v1.3+ — daemon refuses pending records using this |

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Add PTY support section + Platform notes + Token-passing section to handoff-watcher-guide.md</name>
  <files>docs/handoff-watcher-guide.md</files>
  <action>
Insert three new sections in `docs/handoff-watcher-guide.md` between `## Configuration` and `## Watcher-off mode (still useful)`. Update the `## Future (v1.2+)` section to reflect PTY shipped.

Steps:

1. Read the current file to confirm section order and word count baseline (~223 lines today).

2. Cross-reference the SUMMARY files for 19-01 and 19-02 to confirm:
   - Pinned `node-pty` version (from 19-01 SUMMARY).
   - Whether stash CLI shipped (from 19-02 SUMMARY).
   - Any platform install issues encountered during 19-01 install (worth a sentence).

3. Insert `## PTY support (v1.2+)` section after `## Configuration` ends and before `## Watcher-off mode`. Suggested content:

```markdown
## PTY support (v1.2+)

The daemon allocates a real pseudo-terminal (PTY) for the user's shell when running
interactively. This closes the gap that v1.1 had with TTY-required commands —
`gh auth login`, `doctl auth init`, `gcloud auth login`, `gpg --decrypt`, and
similar tools that fail with "unknown terminal" or hang silently when run on
plain pipes.

Under the hood: the daemon uses [`node-pty`](https://www.npmjs.com/package/node-pty)
to allocate the PTY. The sentinel-fenced output protocol is unchanged — PTY only
swaps the dispatch backend, not the wire format the daemon writes to the
`.devflow-handoff/done/<id>.json` records.

Sub-sections:
- [Platform notes](#platform-notes)
- [Token-passing for prompts](#token-passing-for-prompts)

### Platform notes

`node-pty` is a native Node module with prebuilt binaries published for the
common platforms. `npm install` should fetch a binary for your platform without
a build step. If prebuild-install fails, `npm install` falls back to compiling
from source — which needs the platform's build tools.

| Platform | Status | Build tools needed if prebuilt fails |
|---|---|---|
| macOS (x64 + arm64) | First-class | Xcode Command Line Tools (`xcode-select --install`) |
| Linux (x64 + arm64) | First-class | `build-essential`, `python3` |
| Windows (x64) | Best-effort | `windows-build-tools`; node-pty ships `winpty-agent` automatically |

If your `devflow-watch start` fails with `Error: Cannot find module 'node-pty'`,
run `npm install` again — the prebuilt binary fetch may have been skipped on
the original install. If install genuinely fails (rare on supported platforms),
file an issue with the npm log.

The deny-list (`sudo`, `su -`, `rm -rf /`, fork bombs, `curl|bash`) is unchanged
under PTY. Even though PTY makes `sudo` *runnable*, the deny-list still rejects
it because silent privilege elevation in a long-running daemon is not a
trade-off we want.

### Token-passing for prompts

When a tool the daemon runs prompts for a secret (token, password, passphrase),
the daemon can answer the prompt automatically using the new optional
`inputs.secrets[]` field on a pending record. The hook (`gate-interactive.js`)
doesn't populate this today; it's available for clients that write pending
records directly via `df-tools handoff create --inputs-json '...'`.

Schema:

```json
{
  "id": "h-abc123",
  "cmd": "doctl auth init",
  "cwd": "/path/to/project",
  "status": "pending",
  "created_at": "...",
  "inputs": {
    "secrets": [
      {
        "prompt_match": "Enter your access token:",
        "value_source": "env",
        "value_ref": "DIGITALOCEAN_TOKEN"
      }
    ]
  }
}
```

`prompt_match` is a JS RegExp source; the daemon compiles it and scans the
accumulated PTY buffer for matches. On match, the daemon writes the resolved
value (followed by carriage-return) to the PTY.

`value_source` enum:

| value_source | v1.2 status | Notes |
|---|---|---|
| `env` | shipped | Resolved from `process.env[value_ref]` at dispatch time. Fails if env var unset/empty. |
| `stash` | slot reserved | In-memory per-handoff stash. Stash-populating CLI deferred to v1.3 — schema accepts it but the runtime fails the dispatch with a clear error if v1.2 sees `stash` without a populated stash. |
| `keyring` | rejected | Deferred to v1.3+. Daemon refuses pending records that use this. |

Resolved secret values are redacted (replaced with `***REDACTED***`) in the
done record's `stdout` and `stderr` fields before persistence. Only values
≥ 8 characters are redacted to avoid eating legitimate short strings.

If a prompt is matched twice (e.g. tool re-prompts after a wrong answer), the
daemon writes Ctrl+C to the PTY and emits `status: failed` with stderr
`duplicate prompt match for "<value_ref>"`. This prevents stuck dispatches
when the resolved value is wrong.
```

4. Update the existing `## Future (v1.2+)` section title to `## Future (v1.3+)` and update the bullet list:

```markdown
## Future (v1.3+)

Out of scope for v1.2, on the roadmap:

- `stash` value_source backend — populate via `devflow-watch stash add <handoff-id> <key> <value>` CLI
- `keyring` value_source backend — read secrets from the OS keyring (macOS Keychain, Linux Secret Service, Windows Credential Manager)
- OS desktop notifications when a command starts / completes
- Auto-launch via launchd / systemd
- Multi-project watching from a single daemon
- Status-line indicator showing pending count
- Cross-shell support (fish, nushell, pwsh)
```

(Adjust the bullet list based on what 19-02 SUMMARY says actually shipped.)

5. Verify the doc still parses cleanly as markdown (no broken tables, no unterminated code fences). Spot-check by inspecting the file end-to-end with `cat`.

6. Commit: `docs(19-04): document PTY backing, platform install, and token-passing schema in handoff-watcher-guide`.

# CRITICAL: Read the SUMMARY for 19-01 (pinned node-pty version) and 19-02 (stash CLI status) BEFORE writing this section.
# CRITICAL: Append-only / insert-only edits to existing sections. Don't rewrite What it is, Quick start, Architecture, Configuration, Watcher-off mode, Troubleshooting, Security model.
# GOTCHA: macOS arm64 is first-class — node-pty has prebuilt arm64 binaries from 1.0+. Don't suggest macOS arm64 needs special handling.
# PATTERN: Match existing section style — sentence-case headings, tables for enums, fenced JSON for schema examples, second-person voice.
  </action>
  <verify>
1. `wc -l docs/handoff-watcher-guide.md` shows growth (≥290 lines vs. 223 baseline).
2. `grep -n "## PTY support" docs/handoff-watcher-guide.md` returns exactly 1 line.
3. `grep -n "## Platform notes" docs/handoff-watcher-guide.md` (sub-section under PTY support) returns 1 line.
4. `grep -n "## Token-passing" docs/handoff-watcher-guide.md` returns 1 line.
5. `grep -n "node-pty" docs/handoff-watcher-guide.md` returns ≥3 hits (in PTY support, Platform notes, and architecture/intro mentions).
6. `grep -c "^## " docs/handoff-watcher-guide.md` shows total top-level section count went up by 1 (PTY support added; Future section title changed but not duplicated).
7. `grep -n "## What it is\|## Quick start\|## Architecture\|## Configuration\|## Watcher-off mode\|## Troubleshooting\|## Security model" docs/handoff-watcher-guide.md` shows all 7 preserved sections still present.
  </verify>
  <done>
- New `## PTY support (v1.2+)` top-level section exists with `### Platform notes` and `### Token-passing for prompts` sub-sections.
- `## Future` section retitled to `## Future (v1.3+)` with updated bullets reflecting PTY shipped.
- All existing sections (What it is, When you'd use it, Quick start, Subcommands, Architecture, Configuration, Watcher-off mode, Troubleshooting, Security model) preserved.
- File parses as well-formed markdown.
- Single docs commit: `docs(19-04): document PTY backing, platform install, and token-passing schema in handoff-watcher-guide`.
  </done>
  <recovery>
- If existing sections were inadvertently modified: revert with `git checkout docs/handoff-watcher-guide.md` and retry insert-only.
- If 19-01 or 19-02 SUMMARY files don't exist yet (this TRD ran in parallel with them per Wave 1): hold off on the precise version mention; use placeholder `<see 19-01 SUMMARY for pinned version>` and update in a follow-up commit. Wave structure (per CONTEXT §8) puts 19-04 in Wave 1 alongside 19-01; 19-02 is in Wave 2 — so this TRD will start before 19-02 finishes. The doc can use forward-references to 19-02 schema decisions if 19-02 SUMMARY isn't ready, OR this TRD's executor can wait for 19-02 to finish before writing the Token-passing section. Wait is preferred for accuracy.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none)</lint>
<test>npm test</test>
<build>(none — docs only)</build>
</validation_gates>

<verification>
- `docs/handoff-watcher-guide.md` has new `## PTY support (v1.2+)` section
- New section includes `### Platform notes` (macOS/Linux/Windows table) and `### Token-passing for prompts` (schema + value_source table) sub-sections
- `## Future` section retitled to `## Future (v1.3+)` with updated bullets
- All 9 pre-existing sections preserved verbatim
- File length ≥290 lines (vs. 223 baseline)
- No npm test regressions (doc-only change has no test impact, but npm test should still pass)
</verification>

<success_criteria>
- [ ] `## PTY support (v1.2+)` top-level section exists
- [ ] `### Platform notes` sub-section with platform table (macOS, Linux, Windows)
- [ ] `### Token-passing for prompts` sub-section with schema example and value_source enum table
- [ ] `## Future` section title bumped to v1.3+ with stash + keyring bullets
- [ ] All existing top-level sections preserved
- [ ] Single atomic docs commit
- [ ] No npm test regressions
</success_criteria>

<output>
After completion, create `.planning/objectives/19-pty-handoff-watcher/19-04-doc-update-SUMMARY.md` per @/Users/markemerson/.claude/devflow/templates/summary.md. Document:
- Final line count of `handoff-watcher-guide.md`
- Confirmation that all 9 existing sections are preserved
- The exact `node-pty` version referenced (cross-check with 19-01 SUMMARY)
- Whether the doc accurately reflects 19-02's stash CLI status (shipped vs. deferred)
- Commit hash for the docs change
</output>
