#!/usr/bin/env node

/**
 * Nova command‑line interface. This script accepts a path to a Nova
 * machine file (*.nova) and prints a JSON representation of its
 * contents. It's a simple wrapper around the compiler's parseFile
 * function. Future versions of Nova may extend this CLI with
 * commands to run, verify and optimise programs.
 */

const { parseFile } = require('../compiler/index.js');

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: nova <file.nova>');
    process.exit(1);
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
