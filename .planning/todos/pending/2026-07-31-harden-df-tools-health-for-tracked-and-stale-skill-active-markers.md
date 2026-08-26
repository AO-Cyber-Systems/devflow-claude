---
created: 2026-07-31T17:03:29.282Z
title: Harden df-tools health for tracked and stale skill-active markers
area: tooling
files:
  - plugins/devflow/devflow/bin/lib/skill-active.cjs:202
  - plugins/devflow/devflow/bin/lib/skill-active.cjs:16-22
  - plugins/devflow/hooks/gate-edits.js:74-77
  - plugins/devflow/hooks/lib/edit-override.js:36
---

## Problem

Destined for **objective 26 / v1.3 Phase 1**. Two distinct failure modes let a
`.planning/.skill-active` marker silently disable the edit gate. Both were
observed live in the 2026-07-31 fleet audit (30 repos, 974 transcripts).

**1. Tracked markers.** `gate-edits.js` treats marker *presence* as proof a skill
is running (`hasSkillActiveMarker()` is `existsSync` only, gate-edits.js:74-77).
If the marker is ever committed, the gate is disabled for every clone and
checkout, permanently. Found in two repos:

| Repo | Committed | Marker age |
|---|---|---|
| justinforme | `b188f16` (2026-05-20) | 66 days |
| smartWellness | `10b58dc` (2026-05-15) | 77 days |

Both fixed 2026-07-31 (`adccefa`, `4621fa7`); all 28 fleet repos now gitignore
the path. `df-tools health` must ERROR on a tracked marker so this cannot
silently return — detect with `git ls-files --error-unmatch`.

**2. Stale markers.** 11 of 30 repos held leaked markers, ages 5.5h to 66 days,
left behind by skills that crashed or lost context. Swept manually 2026-07-31;
the sweep is cleanup, not a fix — leaks recur on every abnormal skill exit.

## Solution

**Do NOT use `process.kill(pid, 0)` as the liveness check.** This was the
original audit recommendation and it is wrong. `skill-active.cjs:202` records
`process.pid` of the *df-tools subprocess*, which exits milliseconds after
writing the marker — the source documents this at lines 16-22 ("pid is the
df-tools subprocess PID, not the calling skill's PID"). Every marker therefore
has a dead PID within seconds, including valid in-flight ones. A PID liveness
gate would invalidate active markers and break running skills.

Viable staleness signals instead:

- **mtime/TTL bound.** Simplest. TTL must exceed realistic skill duration —
  `execute-objective` has a 67-min median and 177-min p90, so 4-6h, not the
  5-minute value used for `.edit-override` (edit-override.js:36).
- **Heartbeat.** Change the marker format so the skill touches it per step;
  staleness becomes "mtime older than one step interval". Most accurate.
- **Session id.** Record the Claude session id and check it against live
  sessions.

**Repair must be fail-closed.** An unparseable or expired marker counts as
ABSENT (gate armed), never permissive. 2 of the 11 markers found in the audit
(aodex, EdenDocs) were empty/unparseable — a truncated write must not read as
"skill active".

**Evidence standard for this objective:** landed state — working-tree presence
plus `git merge-base --is-ancestor` — not commit existence. Objective 25 marked
its aocore PROJECT.md deliverable PASS on the strength of commit `3f7f29951`,
which lives only on branch `parked/local-project-md` and never reached HEAD. The
file has never existed on the working branch.
