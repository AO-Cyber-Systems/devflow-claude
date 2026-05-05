'use strict';

// PM (Project Management) backend dispatcher.
//
// v1.1 ships GitHub as the single implementation. The seam exists so v1.2+
// can add Linear / Jira / etc. backends without rewriting call sites:
//
//   const pm = require('./pm-backend.cjs');
//   const backend = pm.getBackend(config);
//   const chain = backend.resolveChain(frontmatter, projectCtx);
//
// In v1.1, call sites continue to require('./gh.cjs') directly (back-compat).
// The seam is available for v1.2 to wire in.
//
// Future config field (v1.2+): .planning/config.json
//   { "pm": { "backend": "github" | "linear" | "jira" } }
//
// Unset → defaults to 'github'.

const VALID_BACKENDS = ['github']; // v1.2+ extends: 'linear', 'jira'

/**
 * Return the PM backend module for the given project config.
 *
 * @param {object|null} projectConfig  Parsed .planning/config.json (or null / {})
 * @returns {object}  The backend module (currently always lib/gh.cjs)
 * @throws {Error}    When projectConfig.pm.backend names an unsupported backend
 */
function getBackend(projectConfig) {
  const pm = (projectConfig && projectConfig.pm && projectConfig.pm.backend) || 'github';
  switch (pm) {
    case 'github':
      return require('./gh.cjs');
    case 'linear':
    case 'jira':
      throw new Error(
        `PM backend '${pm}' is not implemented in v1.1 (devflow-claude). ` +
          `Linear/Jira support is v1.2+ work — see ROADMAP.md §"Milestone v1.2".`
      );
    default:
      throw new Error(
        `Unknown pm.backend: '${pm}'. Valid: ${VALID_BACKENDS.join(', ')} (more in v1.2+).`
      );
  }
}

module.exports = { getBackend, VALID_BACKENDS };
