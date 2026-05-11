#!/usr/bin/env node

/**
 * Thin CLI wrapper around lib/doctor.js so the skill can invoke it with
 * a single bash call:
 *
 *   node <plugin>/skills/monorepo-doctor/lib/cli.js [--json] [--root <path>]
 *
 * Exit code:
 *   0 — clean
 *   1 — at least one issue found
 *   2 — internal error (missing path, etc.)
 */

const { audit, renderReport } = require('./doctor.js');
const path = require('path');

function parseArgs(argv) {
  const args = { root: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') args.root = path.resolve(argv[++i]);
    else if (a === '--json') args.json = true;
    else if (a === '--no-binary-scan') args.skipBinaryScan = true;
    else if (a === '-h' || a === '--help') {
      process.stdout.write(
        'usage: monorepo-doctor [--root <path>] [--json] [--no-binary-scan]\n'
      );
      process.exit(0);
    } else {
      process.stderr.write(`unknown arg: ${a}\n`);
      process.exit(2);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let report;
  try {
    report = audit(args.root, { skipBinaryScan: args.skipBinaryScan });
  } catch (err) {
    process.stderr.write(`monorepo-doctor: ${err.message}\n`);
    process.exit(2);
  }
  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(renderReport(report) + '\n');
  }
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) main();
