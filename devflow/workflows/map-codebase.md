<purpose>
Orchestrate parallel codebase mapper agents to analyze codebase and produce structured documents in .planning/codebase/, then synthesize a CLAUDE.md with coding rules.

Each agent has fresh context, explores a specific focus area, and **writes documents directly**. The orchestrator only receives confirmation + line counts, then synthesizes CLAUDE.md and writes a summary.

Output: .planning/codebase/ folder with 8 structured documents + CLAUDE.md at project root with prescriptive coding rules.
</purpose>

<philosophy>
**Why dedicated mapper agents:**
- Fresh context per domain (no token contamination)
- Agents write documents directly (no context transfer back to orchestrator)
- Orchestrator only summarizes what was created (minimal context usage)
- Faster execution (agents run simultaneously)

**Document quality over length:**
Include enough detail to be useful as reference. Prioritize practical examples (especially code patterns) over arbitrary brevity.

**Always include file paths:**
Documents are reference material for Claude when planning/executing. Always include actual file paths formatted with backticks: `src/services/user.ts`.
</philosophy>

<process>

<step name="init_context" priority="first">
Load codebase mapping context:

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init map-codebase)
```

Extract from init JSON: `mapper_model`, `commit_docs`, `codebase_dir`, `existing_maps`, `has_maps`, `codebase_dir_exists`.
</step>

<step name="check_existing">
Check if .planning/codebase/ already exists using `has_maps` from init context.

If `codebase_dir_exists` is true:
```bash
ls -la .planning/codebase/
```

**If exists:**

```
.planning/codebase/ already exists with these documents:
[List files found]

What's next?
1. Refresh - Delete existing and remap codebase
2. Update - Keep existing, only update specific documents
3. Skip - Use existing codebase map as-is
```

Wait for user response.

If "Refresh": Delete .planning/codebase/, continue to create_structure
If "Update": Ask which documents to update, continue to spawn_agents (filtered)
If "Skip": Exit workflow

**If doesn't exist:**
Continue to create_structure.
</step>

<step name="create_structure">
Create .planning/codebase/ directory:

```bash
mkdir -p .planning/codebase
```

**Expected output files:**
- STACK.md (from tech mapper)
- INTEGRATIONS.md (from tech mapper)
- ARCHITECTURE.md (from arch mapper)
- STRUCTURE.md (from arch mapper)
- CONVENTIONS.md (from quality mapper)
- TESTING.md (from quality mapper)
- PATTERNS.md (from quality mapper)
- CONCERNS.md (from concerns mapper)

Continue to spawn_agents.
</step>

<step name="spawn_agents">
Spawn 4 parallel df-codebase-mapper agents.

Use Task tool with `subagent_type="df-codebase-mapper"`, `model="{mapper_model}"`, and `run_in_background=true` for parallel execution.

**CRITICAL:** Use the dedicated `df-codebase-mapper` agent, NOT `Explore`. The mapper agent writes documents directly.

**Agent 1: Tech Focus**

Task tool parameters:
```
subagent_type: "df-codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase tech stack"
```

Prompt:
```
Focus: tech

Analyze this codebase for technology stack and external integrations.

Write these documents to .planning/codebase/:
- STACK.md - Languages, runtime, frameworks, dependencies, configuration
- INTEGRATIONS.md - External APIs, databases, auth providers, webhooks

Explore thoroughly. Write documents directly using templates. Return confirmation only.
```

**Agent 2: Architecture Focus**

Task tool parameters:
```
subagent_type: "df-codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase architecture"
```

Prompt:
```
Focus: arch

Analyze this codebase architecture and directory structure.

Write these documents to .planning/codebase/:
- ARCHITECTURE.md - Pattern, layers, data flow, abstractions, entry points
- STRUCTURE.md - Directory layout, key locations, naming conventions

Explore thoroughly. Write documents directly using templates. Return confirmation only.
```

**Agent 3: Quality Focus**

Task tool parameters:
```
subagent_type: "df-codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase conventions"
```

Prompt:
```
Focus: quality

Analyze this codebase for coding conventions, testing patterns, and representative code examples.

Write these documents to .planning/codebase/:
- CONVENTIONS.md - Code style, naming, patterns, error handling
- TESTING.md - Framework, structure, mocking, coverage
- PATTERNS.md - 3-5 real code snippets (30-60 lines each) showing how code is written here

Explore thoroughly. Write documents directly using templates. Return confirmation only.
```

**Agent 4: Concerns Focus**

Task tool parameters:
```
subagent_type: "df-codebase-mapper"
model: "{mapper_model}"
run_in_background: true
description: "Map codebase concerns"
```

Prompt:
```
Focus: concerns

Analyze this codebase for technical debt, known issues, and areas of concern.

Write this document to .planning/codebase/:
- CONCERNS.md - Tech debt, bugs, security, performance, fragile areas

Explore thoroughly. Write document directly using template. Return confirmation only.
```

Continue to collect_confirmations.
</step>

<step name="collect_confirmations">
Wait for all 4 agents to complete.

Read each agent's output file to collect confirmations.

**Expected confirmation format from each agent:**
```
## Mapping Complete

**Focus:** {focus}
**Documents written:**
- `.planning/codebase/{DOC1}.md` ({N} lines)
- `.planning/codebase/{DOC2}.md` ({N} lines)

Ready for orchestrator summary.
```

**What you receive:** Just file paths and line counts. NOT document contents.

If any agent failed, note the failure and continue with successful documents.

Continue to verify_output.
</step>

<step name="verify_output">
Verify all documents created successfully:

```bash
ls -la .planning/codebase/
wc -l .planning/codebase/*.md
```

**Verification checklist:**
- All 8 documents exist
- No empty documents (each should have >20 lines)

If any documents missing or empty, note which agents may have failed.

Continue to generate_claude_md.
</step>

<step name="generate_claude_md">
**Synthesize CLAUDE.md from codebase analysis.**

Read all 8 analysis documents and the template:

```
Read: .planning/codebase/STACK.md
Read: .planning/codebase/ARCHITECTURE.md
Read: .planning/codebase/STRUCTURE.md
Read: .planning/codebase/CONVENTIONS.md
Read: .planning/codebase/TESTING.md
Read: .planning/codebase/PATTERNS.md
Read: .planning/codebase/INTEGRATIONS.md
Read: .planning/codebase/CONCERNS.md
Read: ~/.claude/devflow/templates/claude-md.md
```

Follow the template's section structure and guidelines to synthesize a CLAUDE.md:
- **Prescriptive tone:** "Use X", "Never Y", "Always Z" — not "The codebase uses X"
- **Concrete:** Include actual file paths, command names, patterns from the analysis docs
- **Concise:** Aim for 80-150 lines — this is auto-loaded every session, brevity matters
- **Skip empty sections:** If a section has nothing meaningful (e.g., no integrations), omit it entirely

**Merge with existing CLAUDE.md:**

If `CLAUDE.md` already exists at project root:
1. Read existing CLAUDE.md
2. If `<!-- DEVFLOW:START -->` and `<!-- DEVFLOW:END -->` markers found:
   - Replace everything between markers (inclusive of markers) with new DevFlow section
   - Preserve all content before and after the markers exactly as-is
3. If no markers found:
   - Prepend the new DevFlow section (wrapped in markers) above existing content
   - Add a blank line between the DevFlow section and existing content

If no CLAUDE.md exists:
1. Write fresh file with markers wrapping the generated content

Write CLAUDE.md to project root.

Continue to scan_for_secrets.
</step>

<step name="scan_for_secrets">
**CRITICAL SECURITY CHECK:** Scan output files for accidentally leaked secrets before committing.

Run secret pattern detection:

```bash
# Check for common API key patterns in generated docs
grep -E '(sk-[a-zA-Z0-9]{20,}|sk_live_[a-zA-Z0-9]+|sk_test_[a-zA-Z0-9]+|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9_-]+|AKIA[A-Z0-9]{16}|xox[baprs]-[a-zA-Z0-9-]+|-----BEGIN.*PRIVATE KEY|eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.)' .planning/codebase/*.md CLAUDE.md 2>/dev/null && SECRETS_FOUND=true || SECRETS_FOUND=false
```

**If SECRETS_FOUND=true:**

```
⚠️  SECURITY ALERT: Potential secrets detected in codebase documents!

Found patterns that look like API keys or tokens in:
[show grep output]

This would expose credentials if committed.

**Action required:**
1. Review the flagged content above
2. If these are real secrets, they must be removed before committing
3. Consider adding sensitive files to Claude Code "Deny" permissions

Pausing before commit. Reply "safe to proceed" if the flagged content is not actually sensitive, or edit the files first.
```

Wait for user confirmation before continuing to commit_codebase_map.

**If SECRETS_FOUND=false:**

Continue to commit_codebase_map.
</step>

<step name="commit_codebase_map">
Commit the codebase map:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs: map existing codebase" --files .planning/codebase/*.md CLAUDE.md
```

Continue to offer_next.
</step>

<step name="offer_next">
Present completion summary and next steps.

**Get line counts:**
```bash
wc -l .planning/codebase/*.md CLAUDE.md
```

**Output format:**

```
Codebase mapping complete.

Created .planning/codebase/:
- STACK.md ([N] lines) - Technologies and dependencies
- ARCHITECTURE.md ([N] lines) - System design and patterns
- STRUCTURE.md ([N] lines) - Directory layout and organization
- CONVENTIONS.md ([N] lines) - Code style and patterns
- TESTING.md ([N] lines) - Test structure and practices
- PATTERNS.md ([N] lines) - Representative code examples
- INTEGRATIONS.md ([N] lines) - External services and APIs
- CONCERNS.md ([N] lines) - Technical debt and issues

Generated CLAUDE.md ([N] lines) — coding rules auto-loaded every session


---

## ▶ Next Up

**Initialize project** — use codebase context for planning

`/df:new-project`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- Re-run mapping: `/df:map-codebase`
- Review CLAUDE.md: `cat CLAUDE.md`
- Review specific file: `cat .planning/codebase/STACK.md`
- Edit any document before proceeding

---
```

End workflow.
</step>

</process>

<success_criteria>
- .planning/codebase/ directory created
- 4 parallel df-codebase-mapper agents spawned with run_in_background=true
- Agents write documents directly (orchestrator doesn't receive document contents)
- Read agent output files to collect confirmations
- All 8 codebase documents exist
- CLAUDE.md generated at project root with prescriptive coding rules
- CLAUDE.md wrapped in <!-- DEVFLOW:START/END --> markers
- If CLAUDE.md existed, user content outside markers is preserved
- Clear completion summary with line counts
- User offered clear next steps in DevFlow style
</success_criteria>
