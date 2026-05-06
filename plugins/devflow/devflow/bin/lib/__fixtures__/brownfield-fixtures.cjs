'use strict';

// Hand-built fixture factories for brownfield-detector module tests.
// Per TDD Playbook habit 4: factory functions, not LLM-generated test data.
// No lorem ipsum, no randomised inputs — explicit named scenarios.

const fs = require('fs');
const path = require('path');

// ─── Source file extensions (mirrors detector) ────────────────────────────────

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.py', '.go', '.rs', '.rb', '.java'];

// ─── makeSourceFile ───────────────────────────────────────────────────────────

/**
 * Write a minimal valid source file at <dir>/<name><ext>.
 * Content is a minimal stub appropriate for the extension.
 *
 * @param {string} dir - absolute directory path (must exist)
 * @param {string} name - base filename without extension (e.g. "index")
 * @param {string} ext - extension including dot (e.g. ".ts")
 */
function makeSourceFile(dir, name, ext) {
  const filePath = path.join(dir, name + ext);
  let content = '';
  switch (ext) {
    case '.ts':
    case '.tsx':
      content = `// ${name}${ext}\nexport const ${name} = null;\n`;
      break;
    case '.js':
    case '.jsx':
    case '.cjs':
    case '.mjs':
      content = `'use strict';\n// ${name}${ext}\nmodule.exports = {};\n`;
      break;
    case '.py':
      content = `# ${name}${ext}\n${name} = None\n`;
      break;
    case '.go':
      content = `// ${name}${ext}\npackage main\n`;
      break;
    case '.rs':
      content = `// ${name}${ext}\nfn main() {}\n`;
      break;
    case '.rb':
      content = `# ${name}${ext}\n${name} = nil\n`;
      break;
    case '.java':
      content = `// ${name}${ext}\npublic class ${name} {}\n`;
      break;
    default:
      content = `// ${name}${ext}\n`;
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ─── makeScaffold ─────────────────────────────────────────────────────────────

/**
 * Build a project scaffold under tmpRoot for testing the brownfield detector.
 *
 * @param {string} tmpRoot - absolute path to temp directory (must exist)
 * @param {object} opts
 * @param {boolean} [opts.hasPlanning=false] - create .planning/ directory
 * @param {boolean} [opts.hasCodebaseMap=false] - create .planning/codebase/ directory
 * @param {{ count: number, exts?: string[], subdir?: string }} [opts.sourceFiles]
 *   - count: number of source files to create
 *   - exts: cycle through these extensions (default ['.ts'])
 *   - subdir: create files inside this subdirectory of tmpRoot (default 'src')
 * @param {Record<string, number>} [opts.otherDirs]
 *   - create extra directories with the given name and file count
 *   - e.g. { 'node_modules': 200, '.git': 50 }
 * @returns {string} tmpRoot (for convenience)
 */
function makeScaffold(tmpRoot, {
  hasPlanning = false,
  hasCodebaseMap = false,
  sourceFiles = null,
  otherDirs = {},
} = {}) {
  // .planning/
  if (hasPlanning) {
    fs.mkdirSync(path.join(tmpRoot, '.planning'), { recursive: true });
  }

  // .planning/codebase/
  if (hasCodebaseMap) {
    fs.mkdirSync(path.join(tmpRoot, '.planning', 'codebase'), { recursive: true });
  }

  // Source files in src/ (or specified subdir)
  if (sourceFiles && sourceFiles.count > 0) {
    const subdir = sourceFiles.subdir || 'src';
    const srcDir = path.join(tmpRoot, subdir);
    fs.mkdirSync(srcDir, { recursive: true });

    const exts = sourceFiles.exts || ['.ts'];
    for (let i = 0; i < sourceFiles.count; i++) {
      const ext = exts[i % exts.length];
      makeSourceFile(srcDir, `file${i}`, ext);
    }
  }

  // Extra directories (e.g. node_modules, .git) with dummy .js files
  for (const [dirName, count] of Object.entries(otherDirs)) {
    const dirPath = path.join(tmpRoot, dirName);
    // For node_modules: create a fake package subdir to simulate real structure
    const innerDir = dirName === 'node_modules'
      ? path.join(dirPath, 'some-package', 'lib')
      : dirPath;
    fs.mkdirSync(innerDir, { recursive: true });
    for (let i = 0; i < count; i++) {
      fs.writeFileSync(path.join(innerDir, `file${i}.js`), `// file${i}\n`, 'utf-8');
    }
  }

  return tmpRoot;
}

// ─── makeNestedSourceTree ─────────────────────────────────────────────────────

/**
 * Create a nested directory tree with source files to test recursive counting.
 *
 * Layout:
 *   <tmpRoot>/
 *     src/
 *       components/
 *         Button.tsx
 *         Modal.tsx
 *       utils/
 *         format.ts
 *         parse.ts
 *       index.ts
 *
 * @param {string} tmpRoot
 * @returns {number} total source files created (5)
 */
function makeNestedSourceTree(tmpRoot) {
  const componentsDir = path.join(tmpRoot, 'src', 'components');
  const utilsDir = path.join(tmpRoot, 'src', 'utils');
  const srcDir = path.join(tmpRoot, 'src');

  fs.mkdirSync(componentsDir, { recursive: true });
  fs.mkdirSync(utilsDir, { recursive: true });

  makeSourceFile(componentsDir, 'Button', '.tsx');
  makeSourceFile(componentsDir, 'Modal', '.tsx');
  makeSourceFile(utilsDir, 'format', '.ts');
  makeSourceFile(utilsDir, 'parse', '.ts');
  makeSourceFile(srcDir, 'index', '.ts');

  return 5;
}

module.exports = { makeScaffold, makeSourceFile, makeNestedSourceTree };
