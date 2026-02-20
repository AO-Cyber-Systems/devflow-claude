<purpose>

Archive accumulated objective directories from completed milestones into `.planning/milestones/v{X.Y}-objectives/`. Identifies which objectives belong to each completed milestone, shows a dry-run summary, and moves directories on confirmation.

</purpose>

<required_reading>

1. `.planning/MILESTONES.md`
2. `.planning/milestones/` directory listing
3. `.planning/objectives/` directory listing

</required_reading>

<process>

<step name="identify_completed_milestones">

Read `.planning/MILESTONES.md` to identify completed milestones and their versions.

```bash
cat .planning/MILESTONES.md
```

Extract each milestone version (e.g., v1.0, v1.1, v2.0).

Check which milestone archive dirs already exist:

```bash
ls -d .planning/milestones/v*-objectives 2>/dev/null
```

Filter to milestones that do NOT already have a `-objectives` archive directory.

If all milestones already have objective archives:

```
All completed milestones already have objective directories archived. Nothing to clean up.
```

Stop here.

</step>

<step name="determine_phase_membership">

For each completed milestone without a `-objectives` archive, read the archived ROADMAP snapshot to determine which objectives belong to it:

```bash
cat .planning/milestones/v{X.Y}-ROADMAP.md
```

Extract objective numbers and names from the archived roadmap (e.g., Objective 1: Foundation, Objective 2: Auth).

Check which of those objective directories still exist in `.planning/objectives/`:

```bash
ls -d .planning/objectives/*/ 2>/dev/null
```

Match objective directories to milestone membership. Only include directories that still exist in `.planning/objectives/`.

</step>

<step name="show_dry_run">

Present a dry-run summary for each milestone:

```
## Cleanup Summary

### v{X.Y} — {Milestone Name}
These objective directories will be archived:
- 01-foundation/
- 02-auth/
- 03-core-features/

Destination: .planning/milestones/v{X.Y}-objectives/

### v{X.Z} — {Milestone Name}
These objective directories will be archived:
- 04-security/
- 05-hardening/

Destination: .planning/milestones/v{X.Z}-objectives/
```

If no objective directories remain to archive (all already moved or deleted):

```
No objective directories found to archive. Objectives may have been removed or archived previously.
```

Stop here.

AskUserQuestion: "Proceed with archiving?" with options: "Yes — archive listed objectives" | "Cancel"

If "Cancel": Stop.

</step>

<step name="archive_phases">

For each milestone, move objective directories:

```bash
mkdir -p .planning/milestones/v{X.Y}-objectives
```

For each objective directory belonging to this milestone:

```bash
mv .planning/objectives/{dir} .planning/milestones/v{X.Y}-objectives/
```

Repeat for all milestones in the cleanup set.

</step>

<step name="commit">

Commit the changes:

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "chore: archive objective directories from completed milestones" --files .planning/milestones/ .planning/objectives/
```

</step>

<step name="report">

```
Archived:
{For each milestone}
- v{X.Y}: {N} objective directories → .planning/milestones/v{X.Y}-objectives/

.planning/objectives/ cleaned up.
```

</step>

</process>

<success_criteria>

- [ ] All completed milestones without existing objective archives identified
- [ ] Objective membership determined from archived ROADMAP snapshots
- [ ] Dry-run summary shown and user confirmed
- [ ] Objective directories moved to `.planning/milestones/v{X.Y}-objectives/`
- [ ] Changes committed

</success_criteria>
