'use strict';

// One-time migration of pre-existing DevFlow projects to the kind/work intent
// model. Adds `kind` to PROJECT.md frontmatter and `work` to OBJECTIVE.md
// frontmatter where missing. Always backs up before writing.

const fs = require('fs');
const path = require('path');
const { extractFrontmatter, spliceFrontmatter } = require('./frontmatter.cjs');
const { VALID_KINDS, VALID_WORKS } = require('./intent.cjs');

function loadProject(projectRoot) {
  const projectPath = path.join(projectRoot, '.planning', 'PROJECT.md');
  if (!fs.existsSync(projectPath)) {
    return { exists: false };
  }
  const content = fs.readFileSync(projectPath, 'utf-8');
  const fm = extractFrontmatter(content) || {};
  return { exists: true, path: projectPath, content, frontmatter: fm };
}

function listObjectives(projectRoot) {
  const objDir = path.join(projectRoot, '.planning', 'objectives');
  if (!fs.existsSync(objDir)) return [];
  return fs.readdirSync(objDir).filter((entry) => {
    const full = path.join(objDir, entry);
    return fs.statSync(full).isDirectory();
  });
}

function loadObjective(projectRoot, id) {
  const objPath = path.join(projectRoot, '.planning', 'objectives', id, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) {
    return { exists: false, id };
  }
  const content = fs.readFileSync(objPath, 'utf-8');
  const fm = extractFrontmatter(content) || {};
  return { exists: true, id, path: objPath, content, frontmatter: fm };
}

// Plan computes the diff that migrate would apply, without touching disk.
// Returns:
//   {
//     project: { needsKind, currentKind, currentDefaultWork },
//     objectives: [{ id, exists, needsWork, currentWork }],
//     alreadyMigrated: boolean,
//     errors: string[]
//   }
function plan({ projectRoot }) {
  const errors = [];
  const project = loadProject(projectRoot);
  if (!project.exists) {
    errors.push(`No PROJECT.md at ${path.join(projectRoot, '.planning', 'PROJECT.md')}`);
    return { project: null, objectives: [], alreadyMigrated: false, errors };
  }

  const projectInfo = {
    needsKind: !project.frontmatter.kind,
    currentKind: project.frontmatter.kind || null,
    currentDefaultWork: project.frontmatter.default_work || null,
  };

  const objectives = listObjectives(projectRoot).map((id) => {
    const obj = loadObjective(projectRoot, id);
    if (!obj.exists) {
      return { id, exists: false, needsWork: false, currentWork: null };
    }
    return {
      id,
      exists: true,
      needsWork: !obj.frontmatter.work,
      currentWork: obj.frontmatter.work || null,
    };
  });

  const alreadyMigrated = !projectInfo.needsKind && objectives.every((o) => !o.needsWork);

  return { project: projectInfo, objectives, alreadyMigrated, errors };
}

function backupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function backup(projectRoot, label = backupTimestamp()) {
  const planningDir = path.join(projectRoot, '.planning');
  if (!fs.existsSync(planningDir)) {
    throw new Error(`No .planning/ directory at ${planningDir}`);
  }
  const backupDir = path.join(planningDir, `.migrate-backup-${label}`);
  fs.mkdirSync(backupDir, { recursive: true });

  // Copy PROJECT.md
  const projPath = path.join(planningDir, 'PROJECT.md');
  if (fs.existsSync(projPath)) {
    fs.copyFileSync(projPath, path.join(backupDir, 'PROJECT.md'));
  }

  // Copy each OBJECTIVE.md (preserving directory structure)
  const objectives = listObjectives(projectRoot);
  for (const id of objectives) {
    const src = path.join(planningDir, 'objectives', id, 'OBJECTIVE.md');
    if (fs.existsSync(src)) {
      const destDir = path.join(backupDir, 'objectives', id);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, path.join(destDir, 'OBJECTIVE.md'));
    }
  }

  return backupDir;
}

// Apply the migration. Required input:
//   kind — chosen kind for the project (validated)
//   defaultWork — optional default_work
//   workChoices — { [objectiveId]: workValue } for each objective needing work
//   dryRun — if true, return plan without writing
function apply({ projectRoot, kind, defaultWork, workChoices = {}, dryRun = false }) {
  const result = plan({ projectRoot });
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('\n'));
  }
  if (result.alreadyMigrated) {
    return { ...result, applied: false, reason: 'already migrated', backupDir: null };
  }

  // Validate inputs
  if (result.project.needsKind) {
    if (!kind) throw new Error('kind required: project has no kind set');
    if (!VALID_KINDS.includes(kind)) {
      throw new Error(`Invalid kind '${kind}'. Valid: ${VALID_KINDS.join(', ')}`);
    }
  }
  if (defaultWork !== undefined && defaultWork !== null) {
    if (!VALID_WORKS.includes(defaultWork)) {
      throw new Error(`Invalid default_work '${defaultWork}'. Valid: ${VALID_WORKS.join(', ')}`);
    }
  }
  for (const [id, work] of Object.entries(workChoices)) {
    if (work && !VALID_WORKS.includes(work)) {
      throw new Error(`Invalid work for objective ${id}: '${work}'. Valid: ${VALID_WORKS.join(', ')}`);
    }
  }

  const changes = [];

  // PROJECT.md
  if (result.project.needsKind) {
    const projectPath = path.join(projectRoot, '.planning', 'PROJECT.md');
    const content = fs.readFileSync(projectPath, 'utf-8');
    const fm = extractFrontmatter(content) || {};
    fm.kind = kind;
    if (defaultWork) fm.default_work = defaultWork;
    const newContent = spliceFrontmatter(content, fm);
    changes.push({ path: projectPath, before: content, after: newContent });
  }

  // OBJECTIVE.md files
  for (const objInfo of result.objectives) {
    if (!objInfo.exists || !objInfo.needsWork) continue;
    const work = workChoices[objInfo.id] || defaultWork;
    if (!work) continue; // user can opt to leave it blank — falls back at resolve time
    const objPath = path.join(projectRoot, '.planning', 'objectives', objInfo.id, 'OBJECTIVE.md');
    const content = fs.readFileSync(objPath, 'utf-8');
    const fm = extractFrontmatter(content) || {};
    fm.work = work;
    const newContent = spliceFrontmatter(content, fm);
    changes.push({ path: objPath, before: content, after: newContent });
  }

  if (dryRun) {
    return { ...result, applied: false, reason: 'dry-run', changes, backupDir: null };
  }

  // Backup before any write
  const backupDir = backup(projectRoot);

  // Apply changes
  for (const change of changes) {
    fs.writeFileSync(change.path, change.after, 'utf-8');
  }

  return { ...result, applied: true, changes, backupDir };
}

module.exports = {
  plan,
  apply,
  backup,
  loadProject,
  loadObjective,
  listObjectives,
};
