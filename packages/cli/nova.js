#!/usr/bin/env node

/**
 * Nova command-line interface. This script accepts commands to parse or run Nova programs.
 */
const { parseFile } = require('../compiler/index.js');
const { run } = require('../runtime-node/runner.js');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: nova <file.nova> | nova run <file.nova> [port]');
    process.exit(1);
  }
  if (args[0] === 'run') {
    if (args.length < 2) {
      console.error('Usage: nova run <file.nova> [port]');
      process.exit(1);
    }
    const file = args[1];
    const port = args[2] ? parseInt(args[2], 10) : 3000;
    try {
      await run(file, port);
    } catch (err) {
      console.error(err.message || err);
      process.exit(1);
    }
    return;
  }
  const filePath = args[0];
  try {
    const ast = parseFile(filePath);
    process.stdout.write(JSON.stringify(ast, null, 2) + '\n');
  } catch (err) {
    console.error(`Failed to parse ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
