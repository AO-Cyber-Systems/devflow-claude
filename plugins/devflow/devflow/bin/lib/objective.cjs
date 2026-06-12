'use strict';

const fs = require('fs');
const path = require('path');
const { output, error, normalizeObjectiveName, generateSlugInternal, findPlanFiles, stripPlanSuffix } = require('./helpers.cjs');

// ─── Internal helpers ─────────────────────────────────────────────────────────

function searchObjectiveInDir(baseDir, relBase, normalized) {
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const match = dirs.find(d => d.startsWith(normalized));
    if (!match) return null;

    const dirMatch = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const objectiveNumber = dirMatch ? dirMatch[1] : normalized;
    const objectiveName = dirMatch && dirMatch[2] ? dirMatch[2] : null;
    const objectiveDir = path.join(baseDir, match);
    const objectiveFiles = fs.readdirSync(objectiveDir);

    const plans = findPlanFiles(objectiveFiles).sort();
    const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();
    const hasResearch = objectiveFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
    const hasContext = objectiveFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
    const hasVerification = objectiveFiles.some(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');

    const completedJobIds = new Set(
      summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
    );
    const incompleteJobs = plans.filter(p => {
      const jobId = stripPlanSuffix(p);
      return !completedJobIds.has(jobId);
    });

    return {
      found: true,
      directory: path.join(relBase, match),
      objective_number: objectiveNumber,
      objective_name: objectiveName,
      objective_slug: objectiveName ? objectiveName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
      jobs: plans,
      summaries,
      incomplete_jobs: incompleteJobs,
      has_research: hasResearch,
      has_context: hasContext,
      has_verification: hasVerification,
    };
  } catch {
    return null;
  }
}

function getArchivedObjectiveDirs(cwd) {
  const milestonesDir = path.join(cwd, '.planning', 'milestones');
  const results = [];

  if (!fs.existsSync(milestonesDir)) return results;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    // Find v*-objectives directories, sort newest first
    const objectiveDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-objectives$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of objectiveDirs) {
      const version = archiveName.match(/^(v[\d.]+)-objectives$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const entries = fs.readdirSync(archivePath, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

      for (const dir of dirs) {
        results.push({
          name: dir,
          milestone: version,
          basePath: path.join('.planning', 'milestones', archiveName),
          fullPath: path.join(archivePath, dir),
        });
      }
    }
  } catch {}

  return results;
}

function findObjectiveInternal(cwd, objective) {
  if (!objective) return null;

  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(objective);

  // Search current objectives first
  const current = searchObjectiveInDir(objectivesDir, path.join('.planning', 'objectives'), normalized);
  if (current) return current;

  // Search archived milestone objectives (newest first)
  const milestonesDir = path.join(cwd, '.planning', 'milestones');
  if (!fs.existsSync(milestonesDir)) return null;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    const archiveDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-objectives$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of archiveDirs) {
      const version = archiveName.match(/^(v[\d.]+)-objectives$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const relBase = path.join('.planning', 'milestones', archiveName);
      const result = searchObjectiveInDir(archivePath, relBase, normalized);
      if (result) {
        result.archived = version;
        return result;
      }
    }
  } catch {}

  return null;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdFindObjective(cwd, objective, raw) {
  if (!objective) {
    error('objective identifier required');
  }

  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(objective);

  const notFound = { found: false, directory: null, objective_number: null, objective_name: null, jobs: [], summaries: [] };

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    const match = dirs.find(d => d.startsWith(normalized));
    if (!match) {
      output(notFound, raw, '');
      return;
    }

    const dirMatch = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const objectiveNumber = dirMatch ? dirMatch[1] : normalized;
    const objectiveName = dirMatch && dirMatch[2] ? dirMatch[2] : null;

    const objectiveDir = path.join(objectivesDir, match);
    const objectiveFiles = fs.readdirSync(objectiveDir);
    const plans = findPlanFiles(objectiveFiles).sort();
    const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();

    const result = {
      found: true,
      directory: path.join('.planning', 'objectives', match),
      objective_number: objectiveNumber,
      objective_name: objectiveName,
      jobs: plans,
      summaries,
    };

    output(result, raw, result.directory);
  } catch {
    output(notFound, raw, '');
  }
}

// cmdObjectiveNextDecimal — DEPRECATED in v1.2 (TRD 12-06, I2 survey: 0% usage across 16 projects).
// Decimal objectives were never used in practice. Use `objective add` to append integer objectives.
function cmdObjectiveNextDecimal(cwd, baseObjective, raw) {
  const deprecationResult = {
    error: 'decimal-objective commands were deprecated in v1.2; use df-tools objective add to append instead',
    removed_in: '12-06',
    recommendation: 'Use `df-tools objective add <description>` to append a new integer objective.',
  };
  process.stdout.write(JSON.stringify(deprecationResult, null, 2) + '\n');
  process.exit(1);
}

function cmdObjectivesList(cwd, options, raw) {
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const { type, objective, includeArchived } = options;

  // If no objectives directory, return empty
  if (!fs.existsSync(objectivesDir)) {
    if (type) {
      output({ files: [], count: 0 }, raw, '');
    } else {
      output({ directories: [], count: 0 }, raw, '');
    }
    return;
  }

  try {
    // Get all objective directories
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    let dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    // Include archived objectives if requested
    if (includeArchived) {
      const archived = getArchivedObjectiveDirs(cwd);
      for (const a of archived) {
        dirs.push(`${a.name} [${a.milestone}]`);
      }
    }

    // Sort numerically (handles decimals: 01, 02, 02.1, 02.2, 03)
    dirs.sort((a, b) => {
      const aNum = parseFloat(a.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      const bNum = parseFloat(b.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      return aNum - bNum;
    });

    // If filtering by objective number
    if (objective) {
      const normalized = normalizeObjectiveName(objective);
      const match = dirs.find(d => d.startsWith(normalized));
      if (!match) {
        output({ files: [], count: 0, objective_dir: null, error: 'Objective not found' }, raw, '');
        return;
      }
      dirs = [match];
    }

    // If listing files of a specific type
    if (type) {
      const files = [];
      for (const dir of dirs) {
        const dirPath = path.join(objectivesDir, dir);
        const dirFiles = fs.readdirSync(dirPath);

        let filtered;
        if (type === 'jobs') {
          filtered = findPlanFiles(dirFiles);
        } else if (type === 'summaries') {
          filtered = dirFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        } else {
          filtered = dirFiles;
        }

        files.push(...filtered.sort());
      }

      const result = {
        files,
        count: files.length,
        objective_dir: objective ? dirs[0].replace(/^\d+(?:\.\d+)?-?/, '') : null,
      };
      output(result, raw, files.join('\n'));
      return;
    }

    // Default: list directories
    output({ directories: dirs, count: dirs.length }, raw, dirs.join('\n'));
  } catch (e) {
    error('Failed to list objectives: ' + e.message);
  }
}

function cmdObjectiveAdd(cwd, description, raw) {
  if (!description) {
    error('description required for objective add');
  }

  // Reject flag-like descriptions (e.g. --help) before touching any files
  if (description.trim().startsWith('--')) {
    error('description must not start with "--" — got a flag-like argument: ' + description);
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    error('ROADMAP.md not found');
  }

  const content = fs.readFileSync(roadmapPath, 'utf-8');

  // Cap slug at 60 chars, strip trailing hyphens left by mid-word cut
  let slug = generateSlugInternal(description);
  if (slug.length > 60) {
    slug = slug.slice(0, 60).replace(/-+$/, '');
  }

  // Find highest integer objective number from ROADMAP headings
  const objectivePattern = /#{2,4}\s*Objective\s+(\d+)(?:\.\d+)?:/gi;
  let maxObjective = 0;
  let m;
  while ((m = objectivePattern.exec(content)) !== null) {
    const num = parseInt(m[1], 10);
    if (num > maxObjective) maxObjective = num;
  }

  // Also scan .planning/objectives/ directory prefixes so a dir without a ROADMAP heading
  // is still counted (prevents number collisions)
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  if (fs.existsSync(objectivesDir)) {
    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      const dirPrefixPattern = /^(\d+)(?:\.\d+)?-/;
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const match = entry.name.match(dirPrefixPattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxObjective) maxObjective = num;
        }
      }
    } catch (_) {
      // Non-fatal: if readdir fails, fall back to ROADMAP-only count
    }
  }

  const newObjectiveNum = maxObjective + 1;
  const paddedNum = String(newObjectiveNum).padStart(2, '0');
  const dirName = `${paddedNum}-${slug}`;
  const dirPath = path.join(cwd, '.planning', 'objectives', dirName);

  // Create directory with .gitkeep so git tracks empty folders
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, '.gitkeep'), '');

  // Build objective entry
  const objectiveEntry = `\n### Objective ${newObjectiveNum}: ${description}\n\n**Goal:** [To be planned]\n**Depends on:** Objective ${maxObjective}\n**Jobs:** 0 jobs\n\nJobs:\n- [ ] TBD (run /df:plan-objective ${newObjectiveNum} to break down)\n`;

  // Find insertion point: before last "---" or at end
  let updatedContent;
  const lastSeparator = content.lastIndexOf('\n---');
  if (lastSeparator > 0) {
    updatedContent = content.slice(0, lastSeparator) + objectiveEntry + content.slice(lastSeparator);
  } else {
    updatedContent = content + objectiveEntry;
  }

  fs.writeFileSync(roadmapPath, updatedContent, 'utf-8');

  const result = {
    objective_number: newObjectiveNum,
    padded: paddedNum,
    name: description,
    slug,
    directory: `.planning/objectives/${dirName}`,
  };

  output(result, raw, paddedNum);
}

// cmdObjectiveInsert — DEPRECATED in v1.2 (TRD 12-06, I2 survey: 0% usage across 16 projects).
// Decimal objectives were never used in practice. Use `objective add` to append integer objectives.
function cmdObjectiveInsert(cwd, afterObjective, description, raw) {
  const deprecationResult = {
    error: 'decimal-objective insertion was deprecated in v1.2; use df-tools objective add to append instead',
    removed_in: '12-06',
    recommendation: 'Use `df-tools objective add <description>` to append a new integer objective.',
  };
  process.stdout.write(JSON.stringify(deprecationResult, null, 2) + '\n');
  process.exit(1);
}

function cmdObjectiveRemove(cwd, targetObjective, options, raw) {
  if (!targetObjective) {
    error('objective number required for objective remove');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const force = options.force || false;

  if (!fs.existsSync(roadmapPath)) {
    error('ROADMAP.md not found');
  }

  // Normalize the target
  const normalized = normalizeObjectiveName(targetObjective);
  const isDecimal = targetObjective.includes('.');

  // Find and validate target directory
  let targetDir = null;
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    targetDir = dirs.find(d => d.startsWith(normalized + '-') || d === normalized);
  } catch {}

  // Check for executed work (SUMMARY.md files)
  if (targetDir && !force) {
    const targetPath = path.join(objectivesDir, targetDir);
    const files = fs.readdirSync(targetPath);
    const summaries = files.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
    if (summaries.length > 0) {
      error(`Objective ${targetObjective} has ${summaries.length} executed job(s). Use --force to remove anyway.`);
    }
  }

  // Delete target directory
  if (targetDir) {
    fs.rmSync(path.join(objectivesDir, targetDir), { recursive: true, force: true });
  }

  // Renumber subsequent objectives
  // Note: decimal-objective renumbering removed in TRD 12-06 (I2 survey: 0% usage).
  const renamedDirs = [];
  const renamedFiles = [];

  if (!isDecimal) {
    // Integer removal: renumber all subsequent integer objectives
    const removedInt = parseInt(normalized, 10);

    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

      // Collect directories that need renumbering (integer objectives > removed, and their decimals)
      const toRename = [];
      for (const dir of dirs) {
        const dm = dir.match(/^(\d+)(?:\.(\d+))?-(.+)$/);
        if (!dm) continue;
        const dirInt = parseInt(dm[1], 10);
        if (dirInt > removedInt) {
          toRename.push({
            dir,
            oldInt: dirInt,
            decimal: dm[2] ? parseInt(dm[2], 10) : null,
            slug: dm[3],
          });
        }
      }

      // Sort descending to avoid conflicts
      toRename.sort((a, b) => {
        if (a.oldInt !== b.oldInt) return b.oldInt - a.oldInt;
        return (b.decimal || 0) - (a.decimal || 0);
      });

      for (const item of toRename) {
        const newInt = item.oldInt - 1;
        const newPadded = String(newInt).padStart(2, '0');
        const oldPadded = String(item.oldInt).padStart(2, '0');
        const decimalSuffix = item.decimal !== null ? `.${item.decimal}` : '';
        const oldPrefix = `${oldPadded}${decimalSuffix}`;
        const newPrefix = `${newPadded}${decimalSuffix}`;
        const newDirName = `${newPrefix}-${item.slug}`;

        // Rename directory
        fs.renameSync(path.join(objectivesDir, item.dir), path.join(objectivesDir, newDirName));
        renamedDirs.push({ from: item.dir, to: newDirName });

        // Rename files inside
        const dirFiles = fs.readdirSync(path.join(objectivesDir, newDirName));
        for (const f of dirFiles) {
          if (f.startsWith(oldPrefix)) {
            const newFileName = newPrefix + f.slice(oldPrefix.length);
            fs.renameSync(
              path.join(objectivesDir, newDirName, f),
              path.join(objectivesDir, newDirName, newFileName)
            );
            renamedFiles.push({ from: f, to: newFileName });
          }
        }
      }
    } catch {}
  }

  // Update ROADMAP.md
  let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

  // Remove the target objective section
  const targetEscaped = targetObjective.replace(/\./g, '\\.');
  const sectionPattern = new RegExp(
    `\\n?#{2,4}\\s*Objective\\s+${targetEscaped}\\s*:[\\s\\S]*?(?=\\n#{2,4}\\s+Objective\\s+\\d|$)`,
    'i'
  );
  roadmapContent = roadmapContent.replace(sectionPattern, '');

  // Remove from objective list (checkbox)
  const checkboxPattern = new RegExp(`\\n?-\\s*\\[[ x]\\]\\s*.*Objective\\s+${targetEscaped}[:\\s][^\\n]*`, 'gi');
  roadmapContent = roadmapContent.replace(checkboxPattern, '');

  // Remove from progress table
  const tableRowPattern = new RegExp(`\\n?\\|\\s*${targetEscaped}\\.?\\s[^|]*\\|[^\\n]*`, 'gi');
  roadmapContent = roadmapContent.replace(tableRowPattern, '');

  // Renumber references in ROADMAP for subsequent objectives
  if (!isDecimal) {
    const removedInt = parseInt(normalized, 10);

    // Collect all integer objectives > removedInt
    const maxObjective = 99; // reasonable upper bound
    for (let oldNum = maxObjective; oldNum > removedInt; oldNum--) {
      const newNum = oldNum - 1;
      const oldStr = String(oldNum);
      const newStr = String(newNum);
      const oldPad = oldStr.padStart(2, '0');
      const newPad = newStr.padStart(2, '0');

      // Objective headings: ## Objective 18: or ### Objective 18: → ## Objective 17: or ### Objective 17:
      roadmapContent = roadmapContent.replace(
        new RegExp(`(#{2,4}\\s*Objective\\s+)${oldStr}(\\s*:)`, 'gi'),
        `$1${newStr}$2`
      );

      // Checkbox items: - [ ] **Objective 18:** → - [ ] **Objective 17:**
      roadmapContent = roadmapContent.replace(
        new RegExp(`(Objective\\s+)${oldStr}([:\\s])`, 'g'),
        `$1${newStr}$2`
      );

      // Job references: 18-01 → 17-01
      roadmapContent = roadmapContent.replace(
        new RegExp(`${oldPad}-(\\d{2})`, 'g'),
        `${newPad}-$1`
      );

      // Table rows: | 18. → | 17.
      roadmapContent = roadmapContent.replace(
        new RegExp(`(\\|\\s*)${oldStr}\\.\\s`, 'g'),
        `$1${newStr}. `
      );

      // Depends on references
      roadmapContent = roadmapContent.replace(
        new RegExp(`(Depends on:\\*\\*\\s*Objective\\s+)${oldStr}\\b`, 'gi'),
        `$1${newStr}`
      );
    }
  }

  fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');

  // Update STATE.md objective count
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');
    // Update "Total Objectives" field
    const totalPattern = /(\*\*Total Objectives:\*\*\s*)(\d+)/;
    const totalMatch = stateContent.match(totalPattern);
    if (totalMatch) {
      const oldTotal = parseInt(totalMatch[2], 10);
      stateContent = stateContent.replace(totalPattern, `$1${oldTotal - 1}`);
    }
    // Update "Objective: X of Y" pattern
    const ofPattern = /(\bof\s+)(\d+)(\s*(?:\(|objectives?))/i;
    const ofMatch = stateContent.match(ofPattern);
    if (ofMatch) {
      const oldTotal = parseInt(ofMatch[2], 10);
      stateContent = stateContent.replace(ofPattern, `$1${oldTotal - 1}$3`);
    }
    fs.writeFileSync(statePath, stateContent, 'utf-8');
  }

  const result = {
    removed: targetObjective,
    directory_deleted: targetDir || null,
    renamed_directories: renamedDirs,
    renamed_files: renamedFiles,
    roadmap_updated: true,
    state_updated: fs.existsSync(statePath),
  };

  output(result, raw);
}

function cmdObjectiveComplete(cwd, objectiveNum, raw) {
  if (!objectiveNum) {
    error('objective number required for objective complete');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(objectiveNum);
  const today = new Date().toISOString().split('T')[0];

  // Verify objective info
  const objectiveInfo = findObjectiveInternal(cwd, objectiveNum);
  if (!objectiveInfo) {
    error(`Objective ${objectiveNum} not found`);
  }

  const jobCount = objectiveInfo.jobs.length;
  const summaryCount = objectiveInfo.summaries.length;

  // Update ROADMAP.md: mark objective complete
  if (fs.existsSync(roadmapPath)) {
    let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

    // Checkbox: - [ ] Objective N: → - [x] Objective N: (...completed DATE)
    const checkboxPattern = new RegExp(
      `(-\\s*\\[)[ ](\\]\\s*.*Objective\\s+${objectiveNum.replace('.', '\\.')}[:\\s][^\\n]*)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(checkboxPattern, `$1x$2 (completed ${today})`);

    // Progress table: update Status to Complete, add date
    const objectiveEscaped = objectiveNum.replace('.', '\\.');
    const tablePattern = new RegExp(
      `(\\|\\s*${objectiveEscaped}\\.?\\s[^|]*\\|[^|]*\\|)\\s*[^|]*(\\|)\\s*[^|]*(\\|)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(
      tablePattern,
      `$1 Complete    $2 ${today} $3`
    );

    // Update job count in objective section
    const jobCountPattern = new RegExp(
      `(#{2,4}\\s*Objective\\s+${objectiveEscaped}[\\s\\S]*?\\*\\*Jobs:\\*\\*\\s*)[^\\n]+`,
      'i'
    );
    roadmapContent = roadmapContent.replace(
      jobCountPattern,
      `$1${summaryCount}/${jobCount} jobs complete`
    );

    fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');

    // Update REQUIREMENTS.md traceability for this objective's requirements
    const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
    if (fs.existsSync(reqPath)) {
      // Extract Requirements line from roadmap for this objective
      const reqMatch = roadmapContent.match(
        new RegExp(`Objective\\s+${objectiveNum.replace('.', '\\.')}[\\s\\S]*?\\*\\*Requirements:\\*\\*\\s*([^\\n]+)`, 'i')
      );

      if (reqMatch) {
        const reqIds = reqMatch[1].replace(/[\[\]]/g, '').split(/[,\s]+/).map(r => r.trim()).filter(Boolean);
        let reqContent = fs.readFileSync(reqPath, 'utf-8');

        for (const reqId of reqIds) {
          // Update checkbox: - [ ] **REQ-ID** → - [x] **REQ-ID**
          reqContent = reqContent.replace(
            new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${reqId}\\*\\*)`, 'gi'),
            '$1x$2'
          );
          // Update traceability table: | REQ-ID | Objective N | Pending | → | REQ-ID | Objective N | Complete |
          reqContent = reqContent.replace(
            new RegExp(`(\\|\\s*${reqId}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi'),
            '$1 Complete $2'
          );
        }

        fs.writeFileSync(reqPath, reqContent, 'utf-8');
      }
    }
  }

  // Find next objective
  let nextObjectiveNum = null;
  let nextObjectiveName = null;
  let isLastObjective = true;

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const currentFloat = parseFloat(objectiveNum);

    // Find the next objective directory after current
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      if (dm) {
        const dirFloat = parseFloat(dm[1]);
        if (dirFloat > currentFloat) {
          nextObjectiveNum = dm[1];
          nextObjectiveName = dm[2] || null;
          isLastObjective = false;
          break;
        }
      }
    }
  } catch {}

  // Update STATE.md
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');

    // Update Current Objective
    stateContent = stateContent.replace(
      /(\*\*Current Objective:\*\*\s*).*/,
      `$1${nextObjectiveNum || objectiveNum}`
    );

    // Update Current Objective Name
    if (nextObjectiveName) {
      stateContent = stateContent.replace(
        /(\*\*Current Objective Name:\*\*\s*).*/,
        `$1${nextObjectiveName.replace(/-/g, ' ')}`
      );
    }

    // Update Status
    stateContent = stateContent.replace(
      /(\*\*Status:\*\*\s*).*/,
      `$1${isLastObjective ? 'Milestone complete' : 'Ready to plan'}`
    );

    // Update Current Job
    stateContent = stateContent.replace(
      /(\*\*Current Job:\*\*\s*).*/,
      `$1Not started`
    );

    // Update Last Activity
    stateContent = stateContent.replace(
      /(\*\*Last Activity:\*\*\s*).*/,
      `$1${today}`
    );

    // Update Last Activity Description
    stateContent = stateContent.replace(
      /(\*\*Last Activity Description:\*\*\s*).*/,
      `$1Objective ${objectiveNum} complete${nextObjectiveNum ? `, transitioned to Objective ${nextObjectiveNum}` : ''}`
    );

    fs.writeFileSync(statePath, stateContent, 'utf-8');
  }

  const result = {
    completed_objective: objectiveNum,
    objective_name: objectiveInfo.objective_name,
    jobs_executed: `${summaryCount}/${jobCount}`,
    next_objective: nextObjectiveNum,
    next_objective_name: nextObjectiveName,
    is_last_objective: isLastObjective,
    date: today,
    roadmap_updated: fs.existsSync(roadmapPath),
    state_updated: fs.existsSync(statePath),
  };

  output(result, raw);
}

module.exports = {
  searchObjectiveInDir,
  getArchivedObjectiveDirs,
  findObjectiveInternal,
  cmdFindObjective,
  cmdObjectiveNextDecimal,
  cmdObjectivesList,
  cmdObjectiveAdd,
  cmdObjectiveInsert,
  cmdObjectiveRemove,
  cmdObjectiveComplete,
};
