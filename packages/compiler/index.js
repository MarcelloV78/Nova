const fs = require('fs');

/**
 * Parse the contents of a Nova machine‑language file into a simple
 * JavaScript object. This parser is intentionally minimal: it trims
 * whitespace, ignores comment lines beginning with '#', and then
 * recognises declarations for models, enums, properties, routes and
 * transitions based on their leading prefixes (e.g. M1, E1, P1).
 *
 * Models (M# { ... }) are parsed into an object where each field
 * maps to its declared type string. Enums (E# = [...]) become an
 * array of string values. Everything else (properties, routes,
 * transitions) is stored verbatim as a string for downstream tools
 * to interpret.
 *
 * @param {string} text The raw text of a .nova file
 * @returns {object} Parsed representation of the file
 */
function parseNova(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  const result = {
    models: {},
    enums: {},
    properties: {},
    routes: {},
    transitions: {},
  };

  for (const line of lines) {
    // Model definitions: M1 { U1:uuid, U2:txt, ... }
    if (/^M\d+\s*\{/.test(line)) {
      const mMatch = line.match(/^M(\d+)\s*\{(.+)\}$/);
      if (mMatch) {
        const id = `M${mMatch[1]}`;
        const fieldsStr = mMatch[2];
        const fields = {};
        fieldsStr.split(',').forEach((field) => {
          const [name, type] = field.trim().split(':');
          fields[name.trim()] = (type || '').trim();
        });
        result.models[id] = fields;
      }
      continue;
    }
    // Enum definitions: E1 = [0,1,2]
    if (/^E\d+\s*=/.test(line)) {
      const eMatch = line.match(/^E(\d+)\s*=\s*\[(.+)\]$/);
      if (eMatch) {
        const id = `E${eMatch[1]}`;
        const values = eMatch[2].split(',').map((v) => v.trim());
        result.enums[id] = values;
      }
      continue;
    }
    // Properties: P1: <expression>
    if (/^P\d+:/.test(line)) {
      const pMatch = line.match(/^(P\d+):\s*(.+)$/);
      if (pMatch) {
        result.properties[pMatch[1]] = pMatch[2];
      }
      continue;
    }
    // Routes: R1: <definition>
    if (/^R\d+:/.test(line)) {
      const rMatch = line.match(/^(R\d+):\s*(.+)$/);
      if (rMatch) {
        result.routes[rMatch[1]] = rMatch[2];
      }
      continue;
    }
    // Transitions: T1: <map>
    if (/^T\d+:/.test(line)) {
      const tMatch = line.match(/^(T\d+):\s*(.+)$/);
      if (tMatch) {
        result.transitions[tMatch[1]] = tMatch[2];
      }
      continue;
    }
  }
  return result;
}

/**
 * Read a file from disk and parse it into a Nova AST.
 *
 * @param {string} path Path to a .nova file on disk
 * @returns {object} Parsed representation of the file
 */
function parseFile(path) {
  const text = fs.readFileSync(path, 'utf8');
  return parseNova(text);
}

module.exports = {
  parseNova,
  parseFile,
};
