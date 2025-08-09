#!/usr/bin/env node

/**
 * Nova command‑line interface. This script supports three modes:
 *
 * 1. `nova <file.nova>` – parse a Nova program and print its AST as JSON.
 * 2. `nova run <file.nova> [port]` – run a Nova service defined in the file on the given port.
 * 3. `nova check <file.nova>` – seed a runtime with dummy data and check the program's properties.
 *
 * The CLI imports functionality from the compiler and runtime packages to
 * parse, run and verify programs. Additional subcommands can be added
 * in the future for tasks such as optimisation and schema generation.
 */

const { parseFile } = require('../compiler/index.js');
const { run, checkProperties } = require('../runtime-node/runner.js');
const { Runtime } = require('../runtime-node/index.js');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: nova [run|check] <file.nova> [port]');
    process.exit(1);
  }
  const cmd = args[0];
  // Subcommand: run a Nova service
  if (cmd === 'run') {
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
  // Subcommand: check properties
  if (cmd === 'check') {
    if (args.length < 2) {
      console.error('Usage: nova check <file.nova>');
      process.exit(1);
    }
    const file = args[1];
    try {
      const ast = parseFile(file);
      const runtime = new Runtime();
      // Seed dummy data similar to run() for property evaluation
      const statuses = [0, 1, 2, 3, 4, 5];
      for (let i = 1; i <= 100; i++) {
        const id = `job${i}`;
        const job = {
          U1: id,
          U2: `Job ${i}`,
          U3: Math.floor(Math.random() * 1000),
          U4: statuses[i % statuses.length],
          U5: `Vessel ${((i % 5) + 1)}`,
          U6: runtime.clockNow(),
        };
        runtime.kvSet('j:' + id, job);
      }
      const ok = checkProperties(ast, runtime);
      if (ok) {
        console.log('All property checks passed');
        return;
      }
      console.error('Property check failed');
      process.exit(1);
    } catch (err) {
      console.error(err.message || err);
      process.exit(1);
    }
    return;
  }
  // Subcommand: optimize program
  if (cmd === 'optimize') {
    if (args.length < 2) {
      console.error('Usage: nova optimize <file.nova>');
      process.exit(1);
    }
    const file = args[1];
    try {
      const ast = parseFile(file);
      // Helper functions copied from runner to parse routes for optimisation.
      function parsePathPartLocal(pathPart) {
        const match = pathPart.match(/^([A-Z]+)\s+(.+)\s+->\s*(.+)$/);
        if (!match) throw new Error(`Invalid path part: ${pathPart}`);
        const method = match[1];
        const path = match[2].trim();
        const returnType = match[3].trim();
        return { method, path, returnType };
      }
      function parsePipelineLocal(pipelineStr) {
        return pipelineStr.split('|').map(s => s.trim());
      }
      const compiled = [];
      for (const spec of Object.values(ast.routes)) {
        const parts = spec.split('::').map(s => s.trim());
        const pathPart = parts[0];
        const pipeline = parts[1] || '';
        const { method, path } = parsePathPartLocal(pathPart);
        const rawSegments = parsePipelineLocal(pipeline);
        const segments = [];
        const budgets = [];
        for (const seg of rawSegments) {
          if (seg.startsWith('!')) {
            const m = seg.match(/p(\d+)<(\d+)(ms|s)/);
            if (m) {
              const percentile = parseInt(m[1], 10);
              let threshold = parseInt(m[2], 10);
              const unit = m[3];
              if (unit === 's') threshold = threshold * 1000;
              budgets.push({ percentile, threshold });
            }
            continue;
          }
          segments.push(seg);
        }
        compiled.push({ method, path, segments, budgets, latencies: [] });
      }
      const { suggestOptimizations } = require('../runtime-node/runner.js');
      const suggestions = suggestOptimizations(ast, compiled);
      if (suggestions.length === 0) {
        console.log('No optimisations suggested.');
      } else {
        for (const s of suggestions) {
          console.log(`${s.route}: ${s.suggestion}`);
        }
      }
    } catch (err) {
      console.error(err.message || err);
      process.exit(1);
    }
    return;
  }
  // Default: parse and print the AST
  const file = args[0];
  try {
    const ast = parseFile(file);
    process.stdout.write(JSON.stringify(ast, null, 2) + '\n');
  } catch (err) {
    console.error(`Failed to parse ${file}: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
  });
}
