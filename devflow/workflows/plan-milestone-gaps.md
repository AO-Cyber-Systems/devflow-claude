<purpose>
Create all objectives necessary to close gaps identified by `/df:audit-milestone`. Reads MILESTONE-AUDIT.md, groups gaps into logical objectives, creates objective entries in ROADMAP.md, and offers to plan each objective. One command creates all fix objectives — no manual `/df:add-objective` per gap.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

## 1. Load Audit Results

```bash
# Find the most recent audit file
ls -t .planning/v*-MILESTONE-AUDIT.md 2>/dev/null | head -1
```

Parse YAML frontmatter to extract structured gaps:
- `gaps.requirements` — unsatisfied requirements
- `gaps.integration` — missing cross-objective connections
- `gaps.flows` — broken E2E flows

If no audit file exists or has no gaps, error:
```
No audit gaps found. Run `/df:audit-milestone` first.
```

## 2. Prioritize Gaps

Group gaps by priority from REQUIREMENTS.md:

| Priority | Action |
|----------|--------|
| `must` | Create objective, blocks milestone |
| `should` | Create objective, recommended |
| `nice` | Ask user: include or defer? |

For integration/flow gaps, infer priority from affected requirements.

## 3. Group Gaps into Objectives

Cluster related gaps into logical objectives:

**Grouping rules:**
- Same affected objective → combine into one fix objective
- Same subsystem (auth, API, UI) → combine
- Dependency order (fix stubs before wiring)
- Keep objectives focused: 2-4 tasks each

**Example grouping:**
```
Gap: DASH-01 unsatisfied (Dashboard doesn't fetch)
Gap: Integration Objective 1→3 (Auth not passed to API calls)
Gap: Flow "View dashboard" broken at data fetch

→ Objective 6: "Wire Dashboard to API"
  - Add fetch to Dashboard.tsx
  - Include auth header in fetch
  - Handle response, update state
  - Render user data
```

## 4. Determine Objective Numbers

Find highest existing objective:
```bash
# Get sorted objective list, extract last one
PHASES=$(node ~/.claude/devflow/bin/df-tools.cjs objectives list)
HIGHEST=$(echo "$PHASES" | jq -r '.directories[-1]')
```

New objectives continue from there:
- If Objective 5 is highest, gaps become Objective 6, 7, 8...

## 5. Present Gap Closure Plan

```markdown
## Gap Closure Plan

**Milestone:** {version}
**Gaps to close:** {N} requirements, {M} integration, {K} flows

### Proposed Objectives

**Objective {N}: {Name}**
Closes:
- {REQ-ID}: {description}
- Integration: {from} → {to}
Tasks: {count}

**Objective {N+1}: {Name}**
Closes:
- {REQ-ID}: {description}
- Flow: {flow name}
Tasks: {count}

{If nice-to-have gaps exist:}

### Deferred (nice-to-have)

These gaps are optional. Include them?
- {gap description}
- {gap description}

---

Create these {X} objectives? (yes / adjust / defer all optional)
```

Wait for user confirmation.

## 6. Update ROADMAP.md

Add new objectives to current milestone:

```markdown
### Objective {N}: {Name}
**Goal:** {derived from gaps being closed}
**Requirements:** {REQ-IDs being satisfied}
**Gap Closure:** Closes gaps from audit

### Objective {N+1}: {Name}
...
```

## 7. Update REQUIREMENTS.md Traceability Table (REQUIRED)

For each REQ-ID assigned to a gap closure objective:
- Update the Objective column to reflect the new gap closure objective
- Reset Status to `Pending`

Reset checked-off requirements the audit found unsatisfied:
- Change `[x]` → `[ ]` for any requirement marked unsatisfied in the audit
- Update coverage count at top of REQUIREMENTS.md

```bash
# Verify traceability table reflects gap closure assignments
grep -c "Pending" .planning/REQUIREMENTS.md
```

## 8. Create Objective Directories

```bash
mkdir -p ".planning/objectives/{NN}-{name}"
```

## 9. Commit Roadmap and Requirements Update

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs(roadmap): add gap closure objectives {N}-{M}" --files .planning/ROADMAP.md .planning/REQUIREMENTS.md
```

## 10. Offer Next Steps

```markdown
## ✓ Gap Closure Objectives Created

**Objectives added:** {N} - {M}
**Gaps addressed:** {count} requirements, {count} integration, {count} flows

---

## ▶ Next Up

**Plan first gap closure objective**

`/df:plan-objective {N}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/df:execute-objective {N}` — if plans already exist
- `cat .planning/ROADMAP.md` — see updated roadmap

---

**After all gap objectives complete:**

`/df:audit-milestone` — re-audit to verify gaps closed
`/df:complete-milestone {version}` — archive when audit passes
```

</process>

<gap_to_phase_mapping>

## How Gaps Become Tasks

**Requirement gap → Tasks:**
```yaml
gap:
  id: DASH-01
  description: "User sees their data"
  reason: "Dashboard exists but doesn't fetch from API"
  missing:
    - "useEffect with fetch to /api/user/data"
    - "State for user data"
    - "Render user data in JSX"

becomes:

objective: "Wire Dashboard Data"
tasks:
  - name: "Add data fetching"
    files: [src/components/Dashboard.tsx]
    action: "Add useEffect that fetches /api/user/data on mount"

  - name: "Add state management"
    files: [src/components/Dashboard.tsx]
    action: "Add useState for userData, loading, error states"

  - name: "Render user data"
    files: [src/components/Dashboard.tsx]
    action: "Replace placeholder with userData.map rendering"
```

**Integration gap → Tasks:**
```yaml
gap:
  from_phase: 1
  to_phase: 3
  connection: "Auth token → API calls"
  reason: "Dashboard API calls don't include auth header"
  missing:
    - "Auth header in fetch calls"
    - "Token refresh on 401"

becomes:

objective: "Add Auth to Dashboard API Calls"
tasks:
  - name: "Add auth header to fetches"
    files: [src/components/Dashboard.tsx, src/lib/api.ts]
    action: "Include Authorization header with token in all API calls"

  - name: "Handle 401 responses"
    files: [src/lib/api.ts]
    action: "Add interceptor to refresh token or redirect to login on 401"
```

**Flow gap → Tasks:**
```yaml
gap:
  name: "User views dashboard after login"
  broken_at: "Dashboard data load"
  reason: "No fetch call"
  missing:
    - "Fetch user data on mount"
    - "Display loading state"
    - "Render user data"

becomes:

# Usually same objective as requirement/integration gap
# Flow gaps often overlap with other gap types
```

</gap_to_phase_mapping>

<success_criteria>
- [ ] MILESTONE-AUDIT.md loaded and gaps parsed
- [ ] Gaps prioritized (must/should/nice)
- [ ] Gaps grouped into logical objectives
- [ ] User confirmed objective plan
- [ ] ROADMAP.md updated with new objectives
- [ ] REQUIREMENTS.md traceability table updated with gap closure objective assignments
- [ ] Unsatisfied requirement checkboxes reset (`[x]` → `[ ]`)
- [ ] Coverage count updated in REQUIREMENTS.md
- [ ] Objective directories created
- [ ] Changes committed (includes REQUIREMENTS.md)
- [ ] User knows to run `/df:plan-objective` next
</success_criteria>
