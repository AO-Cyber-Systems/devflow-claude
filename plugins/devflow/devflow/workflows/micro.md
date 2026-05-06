---
status: active
---
<purpose>
Execute sub-30-LOC, single-file changes with atomic-commit guarantees in a single context window. Micro is the FLOOR of the DevFlow ladder: no planner, no executor, no SUMMARY.md, no agent spawn. Cost target: ~2k tokens.
</purpose>

<process>
**Step 1: Get the description**

Parse `$ARGUMENTS` as `$DESCRIPTION`. If empty, prompt:
```
AskUserQuestion(header: "Micro Task", question: "One-line description of the change?")
```
Re-prompt if still empty.

**Step 2: Start**

```bash
node ~/.claude/devflow/bin/df-tools.cjs micro start "$DESCRIPTION" --raw
```

Parse JSON: `next_num`, `slug`. The `.planning/.skill-active` marker is written here — gate-edits.js will now allow edits. If `ok: false`, surface the error and abort.

Display: `DF ► MICRO #${next_num}: ${DESCRIPTION}`

**Step 3: Make the edit (inline, no agent spawn)**

Edit/Write/Read/Bash directly — no agents, no JOB.md, no SUMMARY.md. Scope: ≤30 LOC, single file. If the change grows larger, run `node ~/.claude/devflow/bin/df-tools.cjs micro abort` and re-route to `/devflow:quick` or `/devflow:build`.

**Step 4: Commit**

```bash
node ~/.claude/devflow/bin/df-tools.cjs micro commit --raw
```

Produces `chore(micro): ${DESCRIPTION}`, removes marker, appends row to STATE.md "Quick Tasks Completed" table.

If commit fails: surface error. Marker stays active — fix the cause and re-run `node ~/.claude/devflow/bin/df-tools.cjs micro commit --raw`, or run `node ~/.claude/devflow/bin/df-tools.cjs micro abort` to discard.

**Step 5: Done**

Display: `DF ► MICRO COMPLETE — ${commit_hash} chore(micro): ${DESCRIPTION}`

No SUMMARY.md. No further ceremony.
</process>

<success_criteria>
- [ ] Description provided or prompted
- [ ] `df-tools micro start` writes the marker
- [ ] Single-file edit made inline (no agent spawn)
- [ ] `df-tools micro commit` produces `chore(micro): ${DESCRIPTION}`
- [ ] Marker removed on success; retained on failure with retry instructions
- [ ] STATE.md "Quick Tasks Completed" table updated
- [ ] No SUMMARY.md, JOB.md, or TRD.md created
</success_criteria>
