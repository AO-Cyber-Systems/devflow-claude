'use strict';

// Hand-built fixture builders for conflict tests (TRD 21-03).
// Per TDD playbook habit 4: factory functions, not LLM-generated test data.

/**
 * Build a 3-way scenario: { disk_fm, gh_norm, last_sync }.
 *
 * - disk_fm: disk-shape frontmatter ({ status, labels, assignees, milestone })
 * - gh_norm: normalized GH issue ({ status, labels, assignees, milestone, updatedAt })
 * - last_sync: sync-state record (last_sync.label_set is `label_set`, not `labels`)
 */
function buildThreeWayScenario({
  disk = { status: 'open', labels: ['devflow:objective'], assignees: [], milestone: null },
  gh   = { status: 'open', labels: ['devflow:objective'], assignees: [], milestone: null },
  last = {
    issue_ref: 'TestOrg/TestRepo#1',
    gh_updated_at: '2026-05-01T00:00:00Z',
    status: 'open',
    label_set: ['devflow:objective'],
    assignees: [],
    milestone: null,
    last_synced_at: '2026-05-01T00:00:00Z',
    last_synced_disk_hash: 'sha256:initial',
  },
} = {}) {
  return { disk_fm: disk, gh_norm: gh, last_sync: last };
}

module.exports = { buildThreeWayScenario };
