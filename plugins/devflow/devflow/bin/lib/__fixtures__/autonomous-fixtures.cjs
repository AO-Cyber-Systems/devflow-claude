'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Build a temporary directory with an optional .planning/config.json fixture.
 *
 * @param {string} tmpdir  - Root temp directory (caller allocates via fs.mkdtempSync)
 * @param {object|string|null} configObj
 *   - null   → no config.json written (simulates missing-config case)
 *   - string → written raw (enables malformed-JSON case)
 *   - object → written as JSON.stringify(obj, null, 2)
 * @returns {string} tmpdir (pass-through for chaining)
 */
function buildPlanningDirWithConfig(tmpdir, configObj) {
  const planning = path.join(tmpdir, '.planning');
  fs.mkdirSync(planning, { recursive: true });
  if (configObj !== null) {
    fs.writeFileSync(
      path.join(planning, 'config.json'),
      typeof configObj === 'string' ? configObj : JSON.stringify(configObj, null, 2)
    );
  }
  return tmpdir;
}

module.exports = { buildPlanningDirWithConfig };
