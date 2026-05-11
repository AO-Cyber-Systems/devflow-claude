#!/usr/bin/env node

/**
 * CLI for stamping the monorepo-scaffold template.
 *
 * Usage:
 *   node cli.js \
 *     --name "Eden Biz" \
 *     --slug eden-biz \
 *     --description "Eden small-business ops" \
 *     --areas go,flutter,admin,proto \
 *     --target /path/to/new-repo \
 *     [--framework "Next.js"] [--state-lib Riverpod] [--force]
 */

const path = require('path');
const { scaffold, SUPPORTED_AREAS } = require('./scaffold.js');

function parseArgs(argv) {
  const args = { force: false, areas: SUPPORTED_AREAS.slice() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eat = () => argv[++i];
    switch (a) {
      case '--name': args.productName = eat(); break;
      case '--slug': args.productSlug = eat(); break;
      case '--description': args.description = eat(); break;
      case '--areas':
        args.areas = eat().split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--target': args.target = path.resolve(eat()); break;
      case '--framework': args.framework = eat(); break;
      case '--state-lib': args.stateLib = eat(); break;
      case '--force': args.force = true; break;
      case '-h':
      case '--help':
        process.stdout.write(`new-monorepo: stamp a monorepo from the scaffold template

required:
  --name "Eden Biz"
  --slug eden-biz
  --target /path/to/new-repo
optional:
  --description "..."
  --areas go,flutter,admin,proto   (default: all)
  --framework "Next.js"
  --state-lib Riverpod
  --force                          overwrite existing files
`);
        process.exit(0);
      default:
        process.stderr.write(`unknown arg: ${a}\n`);
        process.exit(2);
    }
  }
  for (const req of ['productName', 'productSlug', 'target']) {
    if (!args[req]) {
      process.stderr.write(`missing required arg: --${req.replace(/^productS?l?u?g?/, 'slug').replace('productName', 'name')}\n`);
      process.exit(2);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const templateRoot = path.resolve(__dirname, '..', '..', '..', 'templates', 'monorepo-scaffold');
  let result;
  try {
    result = scaffold({ templateRoot, ...args });
  } catch (err) {
    process.stderr.write(`new-monorepo: ${err.message}\n`);
    process.exit(2);
  }
  process.stdout.write(
    `Wrote ${result.written.length} file(s) to ${args.target}\n` +
    (result.skipped.length
      ? `Skipped ${result.skipped.length} existing file(s) (use --force to overwrite):\n  - ${result.skipped.join('\n  - ')}\n`
      : '')
  );
}

if (require.main === module) main();
