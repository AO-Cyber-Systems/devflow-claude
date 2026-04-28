'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HANDOFF_DIR = '.devflow-handoff';

function dirs(cwd) {
  const root = path.join(cwd, HANDOFF_DIR);
  return {
    root,
    pending: path.join(root, 'pending'),
    done: path.join(root, 'done'),
  };
}

function ensureDirs(cwd) {
  const d = dirs(cwd);
  fs.mkdirSync(d.pending, { recursive: true });
  fs.mkdirSync(d.done, { recursive: true });
  return d;
}

function newId() {
  return 'h-' + crypto.randomBytes(4).toString('hex');
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => readJson(path.join(dir, f)))
      .filter(Boolean)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  } catch {
    return [];
  }
}

function output(obj, raw) {
  if (raw) {
    process.stdout.write(typeof obj === 'string' ? obj : JSON.stringify(obj));
  } else {
    process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  }
}

function cmdHandoffCreate(cwd, cmd, raw) {
  if (!cmd) {
    process.stderr.write('handoff create requires a command\n');
    process.exit(2);
  }
  const d = ensureDirs(cwd);
  const id = newId();
  const record = {
    id,
    cmd,
    cwd,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  const filePath = path.join(d.pending, `${id}.json`);
  writeJson(filePath, record);
  output({ id, path: path.relative(cwd, filePath), record }, raw);
}

function cmdHandoffComplete(cwd, id, opts, raw) {
  if (!id) {
    process.stderr.write('handoff complete requires an id\n');
    process.exit(2);
  }
  const d = ensureDirs(cwd);
  const pendingPath = path.join(d.pending, `${id}.json`);
  const record = readJson(pendingPath);
  if (!record) {
    process.stderr.write(`No pending handoff found for id: ${id}\n`);
    process.exit(2);
  }
  record.status = 'done';
  record.completed_at = new Date().toISOString();
  if (opts.exitCode !== undefined) record.exit_code = opts.exitCode;
  if (opts.outputFile) {
    try { record.output = fs.readFileSync(opts.outputFile, 'utf8'); } catch {}
  } else if (opts.output !== undefined) {
    record.output = opts.output;
  }

  const donePath = path.join(d.done, `${id}.json`);
  writeJson(donePath, record);
  try { fs.unlinkSync(pendingPath); } catch {}

  output({ id, path: path.relative(cwd, donePath), record }, raw);
}

function cmdHandoffList(cwd, raw) {
  const d = ensureDirs(cwd);
  const pending = listDir(d.pending);
  const done = listDir(d.done);
  output({ pending, done, counts: { pending: pending.length, done: done.length } }, raw);
}

function cmdHandoffGet(cwd, id, raw) {
  if (!id) {
    process.stderr.write('handoff get requires an id\n');
    process.exit(2);
  }
  const d = ensureDirs(cwd);
  const fromPending = readJson(path.join(d.pending, `${id}.json`));
  const fromDone = readJson(path.join(d.done, `${id}.json`));
  const record = fromPending || fromDone;
  if (!record) {
    process.stderr.write(`No handoff found for id: ${id}\n`);
    process.exit(2);
  }
  output(record, raw);
}

module.exports = {
  cmdHandoffCreate,
  cmdHandoffComplete,
  cmdHandoffList,
  cmdHandoffGet,
};
