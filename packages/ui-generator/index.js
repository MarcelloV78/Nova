#!/usr/bin/env node
/*
 * Nova UI Generator
 *
 * This module provides a simple CLI for converting a declarative
 * Nova UI specification into React components. The goal is not
 * to produce a full‑featured UI framework but to demonstrate how
 * Nova’s machine‑native philosophy can extend to user interfaces.
 *
 * A UI spec file is a plaintext document with one or more screen
 * definitions. Each screen starts with a line beginning with
 * ``Screen:`` followed by a name. Subsequent indented lines
 * define properties such as the route to bind (`route:`), which
 * fields of the model to display (`fields:`), the layout type
 * (`layout:`), actions (`actions:`) and other hints. Blank lines
 * separate screens.
 *
 * Example:
 *
 *   Screen: JobsList
 *   route: R1
 *   fields: U1,U2,U3,U4,U5,U6
 *   layout: table
 *   actions: openJob(U1)
 *   filterable: U4(status),U2(title)
 *   pageSize: 50
 *
 * Running ``node packages/ui-generator/index.js examples/my_vessel_ui.nova``
 * will generate a React component in the directory ``generated-ui``.
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse a UI spec file into an array of screen definitions. Each
 * screen is represented as an object with a name and key/value
 * pairs for its properties.
 *
 * @param {string} text Raw contents of a UI spec
 * @returns {Array<{name: string, props: Record<string,string>}>}
 */
function parseUiSpec(text) {
  const lines = text.split(/\r?\n/);
  const screens = [];
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('Screen:')) {
      const name = line.substring('Screen:'.length).trim();
      current = { name, props: {} };
      screens.push(current);
    } else if (current) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        current.props[key] = value;
      }
    }
  }
  return screens;
}

/**
 * Generate a React component for a screen definition. The component
 * uses Tailwind CSS classes for styling and expects to receive
 * ``data`` as a prop (array of items) and ``onSelect`` callback
 * for row clicks. The component supports only table layout for
 * brevity.
 *
 * @param {string} name Screen name
 * @param {Record<string,string>} props Screen properties
 * @returns {string} Source code of a React component
 */
function generateReactComponent(name, props) {
  const componentName = name;
  const fields = (props.fields || '').split(',').map(f => f.trim()).filter(Boolean);
  const filterable = (props.filterable || '').split(',').map(p => p.trim()).filter(Boolean);
  const actions = (props.actions || '').split(',').map(a => a.trim()).filter(Boolean);
  // Build table headers based on field names
  const headers = fields.map(f => `<th className="px-4 py-2 text-left">${f}</th>`).join('\n          ');
  const cells = fields.map(f => `<td className="border px-4 py-2">{item.${f}}</td>`).join('\n              ');
  // Simple filter UI for filterable fields
  const filters = filterable.map(f => {
    const parts = f.split('(');
    const field = parts[0];
    const label = parts[1] ? parts[1].replace(')', '') : field;
    return `<div className="mr-4"><label className="mr-2">${label}</label><input type="text" name="${field}" onChange={onFilterChange} className="border px-2 py-1" /></div>`;
  }).join('\n          ');

  return `import React from 'react';

function ${componentName}({ data, onSelect }) {
  const [filters, setFilters] = React.useState({});

  const onFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const filtered = data.filter(item => {
    return Object.keys(filters).every(f => {
      const v = filters[f];
      if (!v) return true;
      const val = String(item[f] || '').toLowerCase();
      return val.includes(v.toLowerCase());
    });
  });

  return (
    <div className="p-4">
      ${filterable.length > 0 ? '<div className="mb-4 flex">${filters}</div>' : 'null'}
      <table className="table-auto w-full border-collapse">
        <thead>
          <tr>
            ${headers}
          </tr>
        </thead>
        <tbody>
          {filtered.map(item => (
            <tr key={item.${fields[0]}} className="hover:bg-gray-100 cursor-pointer" onClick={() => onSelect(item)}>
              ${cells}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ${componentName};
`;
}

/**
 * Main entry point for the CLI. Usage: nova-ui <ui-spec-file>
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: nova-ui <ui-spec-file>');
    process.exit(1);
  }
  const file = args[0];
  const text = fs.readFileSync(file, 'utf8');
  const screens = parseUiSpec(text);
  const outDir = path.resolve('generated-ui');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }
  for (const screen of screens) {
    const code = generateReactComponent(screen.name, screen.props);
    const fileName = `${screen.name}.jsx`;
    fs.writeFileSync(path.join(outDir, fileName), code, 'utf8');
    console.log(`Generated UI component: ${fileName}`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
  });
}
