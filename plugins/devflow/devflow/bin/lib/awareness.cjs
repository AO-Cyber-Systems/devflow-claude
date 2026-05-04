'use strict';

// STUB — RED phase placeholder. Task 3 (GREEN) replaces this with real implementations.

function parseStateMd() { return null; }
function aggregateOrgByProductQuarter() { return {}; }

const DEFAULT_TTL_MINUTES = 10;
const DEFAULT_STALE_DAYS = 30;
const DEFAULT_BRANCH_PATTERNS = ['feature/*', 'df/*', 'fix/*', 'proposal/*'];
const AWARENESS_CACHE_REL = '.planning/.awareness-cache.json';

module.exports = {
  parseStateMd,
  aggregateOrgByProductQuarter,
  DEFAULT_TTL_MINUTES,
  DEFAULT_STALE_DAYS,
  DEFAULT_BRANCH_PATTERNS,
  AWARENESS_CACHE_REL,
};
