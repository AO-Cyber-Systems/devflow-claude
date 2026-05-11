'use strict';

/**
 * Stamps the monorepo-scaffold template into a target directory.
 *
 * Behaviour:
 *   - Copies the entire `templates/monorepo-scaffold/` tree
 *   - Renames `gitignore` → `.gitignore` and `no-binaries.yml` →
 *     `.devflow/no-binaries.yml` (the dotfiles need to be packaged
 *     non-dot so npm-style installers don't mangle them)
 *   - Expands `{{PRODUCT_NAME}}`, `{{PRODUCT_SLUG}}`,
 *     `{{ONE_LINE_DESCRIPTION}}`, `{{STATE_LIB}}`, `{{FRAMEWORK}}`
 *   - Stamps per-area `CLAUDE.md` from `areas/<area>-CLAUDE.md` for every
 *     area listed in `options.areas`
 *   - Refuses to overwrite existing files unless `force: true`
 *
 * Returns { written: [paths], skipped: [paths] }.
 */

const fs = require('fs');
const path = require('path');

const SUPPORTED_AREAS = ['go', 'flutter', 'admin', 'proto'];

function expand(tmpl, vars) {
  return tmpl.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
    return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
  });
}

function copyDirRecursive(src, dst, opts, written, skipped) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const ent of fs.readdirSync(src)) {
      copyDirRecursive(path.join(src, ent), path.join(dst, ent), opts, written, skipped);
    }
    return;
  }
  // file
  if (fs.existsSync(dst) && !opts.force) {
    skipped.push(dst);
    return;
  }
  const isText = /\.(md|ya?ml|json|js|ts|go|dart|toml|gitignore)$/i.test(src) ||
                 path.basename(src) === 'gitignore' ||
                 path.basename(src).endsWith('CLAUDE.md');
  if (isText) {
    const content = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(dst, expand(content, opts.vars));
  } else {
    fs.copyFileSync(src, dst);
  }
  written.push(dst);
}

/**
 * @param {Object} options
 * @param {string} options.templateRoot — path to plugins/monorepo-standards/templates/monorepo-scaffold
 * @param {string} options.target       — destination repo root
 * @param {string} options.productName
 * @param {string} options.productSlug
 * @param {string} options.description
 * @param {string[]} options.areas      — subset of SUPPORTED_AREAS
 * @param {string=} options.framework
 * @param {string=} options.stateLib
 * @param {boolean=} options.force
 */
function scaffold(options) {
  const {
    templateRoot, target,
    productName, productSlug,
    description = '',
    areas, framework = 'Next.js', stateLib = 'Riverpod',
    force = false
  } = options;

  if (!fs.existsSync(templateRoot)) {
    throw new Error(`template root not found: ${templateRoot}`);
  }
  for (const a of areas) {
    if (!SUPPORTED_AREAS.includes(a)) {
      throw new Error(`unsupported area "${a}". Supported: ${SUPPORTED_AREAS.join(', ')}`);
    }
  }
  fs.mkdirSync(target, { recursive: true });

  const vars = {
    PRODUCT_NAME: productName,
    PRODUCT_SLUG: productSlug,
    ONE_LINE_DESCRIPTION: description,
    FRAMEWORK: framework,
    STATE_LIB: stateLib
  };

  const written = [];
  const skipped = [];
  const opts = { force, vars };

  // 1. Root CLAUDE.md, README.md
  for (const f of ['CLAUDE.md', 'README.md']) {
    const src = path.join(templateRoot, f);
    if (fs.existsSync(src)) {
      copyDirRecursive(src, path.join(target, f), opts, written, skipped);
    }
  }

  // 2. gitignore → .gitignore
  const giSrc = path.join(templateRoot, 'gitignore');
  if (fs.existsSync(giSrc)) {
    copyDirRecursive(giSrc, path.join(target, '.gitignore'), opts, written, skipped);
  }

  // 3. .devflow/no-binaries.yml
  const nbSrc = path.join(templateRoot, 'no-binaries.yml');
  if (fs.existsSync(nbSrc)) {
    fs.mkdirSync(path.join(target, '.devflow'), { recursive: true });
    copyDirRecursive(nbSrc, path.join(target, '.devflow', 'no-binaries.yml'),
      opts, written, skipped);
  }

  // 4. .github/workflows/<area>.yml + monorepo-doctor.yml
  const ghSrc = path.join(templateRoot, '.github', 'workflows');
  if (fs.existsSync(ghSrc)) {
    fs.mkdirSync(path.join(target, '.github', 'workflows'), { recursive: true });
    for (const file of fs.readdirSync(ghSrc)) {
      // For area workflows, only copy ones the user opted into.
      const base = file.replace(/\.yml$/, '');
      const isAreaWorkflow = SUPPORTED_AREAS.includes(base);
      if (isAreaWorkflow && !areas.includes(base)) continue;
      copyDirRecursive(
        path.join(ghSrc, file),
        path.join(target, '.github', 'workflows', file),
        opts, written, skipped
      );
    }
  }

  // 5. Per-area CLAUDE.md + directory
  const areasSrc = path.join(templateRoot, 'areas');
  for (const area of areas) {
    const tmpl = path.join(areasSrc, `${area}-CLAUDE.md`);
    if (!fs.existsSync(tmpl)) continue;
    const dst = path.join(target, area, 'CLAUDE.md');
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    copyDirRecursive(tmpl, dst, opts, written, skipped);
  }

  return { written, skipped };
}

module.exports = { scaffold, expand, SUPPORTED_AREAS };
