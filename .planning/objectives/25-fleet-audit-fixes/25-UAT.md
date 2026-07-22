---
status: complete
objective: 25-fleet-audit-fixes
source: 25-01-SUMMARY.md, 25-02-SUMMARY.md, 25-03-SUMMARY.md, 25-04-SUMMARY.md, 25-05-SUMMARY.md, 25-06-SUMMARY.md
started: 2026-07-22T00:00:00Z
updated: 2026-07-22T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Router phantom skill names corrected
expected: matchIntent() emits only consolidated post-Phase-G skill names (/devflow:milestone new, /devflow:todo add, /devflow:todo list, /devflow:milestone audit); zero phantom names remain in route-intent.js
result: pass
evidence: grep for 4 phantom names in route-intent.js → 0 matches; matchIntent("add a todo") → /devflow:todo add, matchIntent("audit the milestone") → /devflow:milestone audit; route-intent.test.js 109/109 pass

### 2. VERIFY rule tightened
expected: Generic dev-speech like "check the build" / "test the feature" returns no routing match; explicit "verify the work" / "validate this feature" still fires /devflow:verify-work
result: pass
evidence: matchIntent("check the build") → [], ("test the feature") → [], ("check the work") → []; ("verify the work") → /devflow:verify-work, ("validate this feature") → /devflow:verify-work

### 3. Broadened adoption rules fire on realistic phrasings
expected: Realistic phrasings for milestone new, todo list, gh-sync, and discuss-objective each produce a routing match to the correct consolidated skill
result: pass
evidence: "start a new milestone" → /devflow:milestone new; "any todos"/"list my todos" → /devflow:todo list; "sync the roadmap to github"/"push this to github issues" → /devflow:gh-sync; "discuss the next objective"/"walk me through the plan" → /devflow:discuss-objective

### 4. gates.editGate config knob (warn/off/strict)
expected: With .planning/config.json gates.editGate set to "warn", an ambient edit produces permissionDecision "ask"; "off" produces no gate output; "strict"/absent/invalid stays "deny"
result: pass
evidence: scratch-dir e2e — warn → ask, off → (no output), strict → deny, invalid ("bogus") → deny, no config.json → deny; gate-edits.test.js 55/55 pass

### 5. join-discord skill pruned
expected: plugins/devflow/skills/join-discord/ no longer exists; /devflow:help catalog (help.md) and docs/USER-GUIDE.md contain no join-discord references
result: pass
evidence: skill dir absent; grep -c join-discord → 0 in both help.md and USER-GUIDE.md; repo-wide sweep (excluding CHANGELOG/ROADMAP/objectives-25) clean

### 6. Global ~/.claude/CLAUDE.md routing + TDD playbook
expected: Routing table references status/micro/milestone/todo/gh-sync/discuss-objective with no retired resume-work or progress names; a "## TDD & Quality" section exists; deriveOverrides() yields only {_playbookDetected: true}
result: pass
evidence: retired-name grep → 0; devflow:micro present; all 4 adoption skills present; "## TDD & Quality" at line 31; absorb() + deriveOverrides() → exactly {"_playbookDetected":true}, zero structured overrides

### 7. Fleet kind: frontmatter in six repos
expected: PROJECT.md in eden-circle, eden-biz/go, aodex/flutter, eden-libs/eden-platform-go, devflowops, and aocore each carry a valid kind: frontmatter value readable by extractFrontmatter()
result: pass
evidence: extractFrontmatter() → eden-circle app, eden-biz/go api, aodex/flutter app, eden-platform-go library, devflowops app, aocore api — all valid enum values

### 8. Fleet CLAUDE.md + eden-press editGate warn
expected: opsCluster/CLAUDE.md and eden-press/CLAUDE.md exist with repo-grounded content; eden-press .planning/config.json has gates.editGate "warn" and the live gate-edits.js hook emits "ask" for an eden-press edit
result: pass
evidence: opsCluster/CLAUDE.md (51 lines, 9 anchor-term hits: gitleaks/opscluster-gitops/control-plane/Terraform); eden-press/CLAUDE.md (49 lines, all 5 conventions found); config gates.editGate === "warn"; live hook invocation from eden-press cwd → permissionDecision "ask"

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
