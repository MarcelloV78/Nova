/*
 * Nova runtime runner for Node.js.
 *
 * This module reads a compiled Nova program (machine specification) from
 * a .nova file, seeds an in‑memory key/value store with dummy data for
 * demonstration purposes and starts an HTTP server to expose the API
 * endpoints defined in the program. The goal of this runner is to
 * showcase how a Nova program can be executed without any human
 * intervention: it interprets the pipeline definitions, evaluates
 * filter conditions, enforces simple preconditions and invokes the
 * appropriate runtime capabilities (kv, http, clock, crypto) exposed
 * by the Runtime class.
 */
const http = require('http');
const { parseFile } = require('../compiler/index.js');
const { Runtime } = require('./index.js');

/**
 * Parse the first half of a route specification (before `::`).
 * Examples:
 *   "GET /j -> [M1]" → { method: 'GET', path: '/j', returnType: '[M1]' }
 *   "GET /j/{U1} -> M1" → { method: 'GET', path: '/j/{U1}', returnType: 'M1' }
 *
 * @param {string} pathPart
 */
function parsePathPart(pathPart) {
  const match = pathPart.match(/^([A-Z]+)\s+(.+)\s+->\s*(.+)$/);
  if (!match) throw new Error(`Invalid path part: ${pathPart}`);
  const method = match[1];
  const path = match[2].trim();
  const returnType = match[3].trim();
  return { method, path, returnType };
}

/**
 * Convert a path with variable placeholders into a regular expression
 * capturing named groups for each variable. For example:
 *   '/j/{U1}' → /^\/j\/(?<U1>[^\/]+)$/
 *   '/jobs/{U1}/photos' → /^\/jobs\/(?<U1>[^\/]+)\/photos$/
 *
 * @param {string} path
 */
function buildPathRegex(path) {
  const regex = path.replace(/\{([^}]+)\}/g, (_, name) => `(?<${name}>[^/]+)`);
  return new RegExp('^' + regex + '$');
}

/**
 * Split a pipeline string (everything after `::`) into segments. Each
 * segment corresponds to a stage in the request pipeline. Budgets
 * starting with '!' are preserved as separate segments so that they
 * can be ignored or processed later.
 *
 * @param {string} pipelineStr
 * @returns {string[]}
 */
function parsePipeline(pipelineStr) {
  return pipelineStr.split('|').map(s => s.trim());
}

/**
 * Evaluate an expression consisting of string literals concatenated
 * with variable names (path variables). For example:
 *   '"j:"+U1' becomes 'j:' + value of U1
 *
 * @param {string} expr
 * @param {object} ctx
 */
function evaluateExpression(expr, ctx) {
  const tokens = expr.split('+').map(t => t.trim());
  let result = '';
  for (const tok of tokens) {
    if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) {
      // strip quotes
      result += tok.slice(1, -1);
    } else if (ctx.pathVars && ctx.pathVars[tok] !== undefined) {
      result += ctx.pathVars[tok];
    } else {
      // fallback: treat as literal
      result += tok;
    }
  }
  return result;
}

/**
 * Split a function argument string into individual arguments. This
 * helper does not fully parse nested parentheses but suffices for
 * simple comma‑separated argument lists used in Nova specs.
 *
 * @param {string} str
 * @returns {string[]}
 */
function splitArgs(str) {
  let args = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      current += ch;
      if (ch === quoteChar) {
        inQuote = false;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
        current += ch;
      } else if (ch === ',') {
        args.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  if (current) args.push(current);
  return args;
}

/**
 * Evaluate a filter condition on a data item. Supported conditions:
 *   U4 in ?q.s   → keep items whose field U4 matches any query parameter 's'
 *   U2 ~ ?q.q    → keep items whose field U2 contains the query parameter 'q'
 *
 * @param {string} cond
 * @param {object} item
 * @param {object} ctx
 */
function evaluateFilter(cond, item, ctx) {
  if (cond.includes(' in ')) {
    const [field, rest] = cond.split(' in ');
    const value = item[field.trim()];
    const param = rest.trim().replace('?q.', '');
    const values = ctx.searchParams.getAll(param);
    // If no query parameter provided, do not filter out the item
    return values.length === 0 || values.includes(String(value));
  } else if (cond.includes('~')) {
    const [field, rest] = cond.split('~');
    const value = item[field.trim()];
    const param = rest.trim().replace('?q.', '');
    const query = ctx.searchParams.get(param) || '';
    return String(value).toLowerCase().includes(query.toLowerCase());
  }
  throw new Error(`Unsupported filter condition: ${cond}`);
}

/**
 * Evaluate a precondition (req) on the current request context. For
 * example: U4 ∈ [2,3] means the status field of the specified item
 * must be in the given set. This implementation fetches the item
 * based on the path variable U1 and then tests the field.
 *
 * @param {string} cond
 * @param {object} ctx
 */
function evaluatePrecondition(cond, ctx) {
  const match = cond.match(/(U\d+)\s*[^[]*\[(.+)\]/);
  if (!match) throw new Error(`Unsupported precondition: ${cond}`);
  const field = match[1];
  const values = match[2].split(',').map(v => v.trim());
  const key = 'j:' + ctx.pathVars['U1'];
  const item = ctx.runtime.kvGet(key);
  if (!item) return false;
  return values.includes(String(item[field]));
}

/**
 * Parse an argument string like '"m","/u/"+U1' into actual values
 * based on path variables. Returns an array of evaluated arguments.
 *
 * @param {string} argsStr
 * @param {object} ctx
 */
function parseArgs(argsStr, ctx) {
  const parts = splitArgs(argsStr);
  return parts.map(part => evaluateExpression(part.trim(), ctx));
}

/**
 * Execute a pipeline of stages for a given request. Each segment is
 * applied sequentially, producing data that feeds into the next
 * segment. The runtime instance is provided via the context.
 * Supported segments:
 *   kv.scan("prefix")
 *   kv.get(expr)
 *   filter(cond)
 *   page(n)
 *   req(cond)
 *   http.post(args)
 * Segments starting with '!' (budgets) are ignored.
 *
 * @param {string[]} segments
 * @param {object} ctx
 */
async function executePipeline(segments, ctx) {
  let data;
  for (const seg of segments) {
    if (seg.startsWith('kv.scan')) {
      const m = seg.match(/kv\.scan\("(.*)"\)/);
      if (!m) throw new Error(`Invalid kv.scan segment: ${seg}`);
      const prefix = m[1];
      data = ctx.runtime.kvScan(prefix);
    } else if (seg.startsWith('kv.get')) {
      const m = seg.match(/kv\.get\((.+)\)/);
      const expr = m[1];
      const key = evaluateExpression(expr, ctx);
      data = ctx.runtime.kvGet(key);
    } else if (seg.startsWith('filter')) {
      const m = seg.match(/filter\((.+)\)/);
      const cond = m[1];
      if (!Array.isArray(data)) throw new Error('filter can only be applied to arrays');
      data = data.filter(item => evaluateFilter(cond, item, ctx));
    } else if (seg.startsWith('page')) {
      const m = seg.match(/page\((\d+)\)/);
      const n = parseInt(m[1], 10);
      if (Array.isArray(data)) {
        data = data.slice(0, n);
      }
    } else if (seg.startsWith('req')) {
      const m = seg.match(/req\((.+)\)/);
      const cond = m[1];
      const ok = evaluatePrecondition(cond, ctx);
      if (!ok) {
        throw new Error(`Precondition failed: ${cond}`);
      }
    } else if (seg.startsWith('http.post')) {
      const m = seg.match(/http\.post\((.+)\)/);
      const argsStr = m[1];
      const args = parseArgs(argsStr, ctx);
      await ctx.runtime.httpPost(...args);
    } else if (seg.startsWith('!')) {
      // budget or other annotation – ignored in this demo
      continue;
    } else {
      throw new Error(`Unsupported segment: ${seg}`);
    }
  }
  return data;
}

/**
 * Main runner function. Given a Nova file and optional port, this
 * function parses the program, seeds the runtime with dummy data
 * (jobs) and starts an HTTP server handling the defined routes.
 *
 * @param {string} filePath
 * @param {number} port
 */
async function run(filePath, port = 3000) {
  const ast = parseFile(filePath);
  const runtime = new Runtime();
  // Seed in-memory store with dummy job data. Each job is stored
  // under a key prefixed with 'j:' and has fields U1 through U6.
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

  // Compile routes
  const compiled = [];
  for (const spec of Object.values(ast.routes)) {
    const parts = spec.split('::').map(s => s.trim());
    const pathPart = parts[0];
    const pipeline = parts[1] || '';
    const { method, path } = parsePathPart(pathPart);
    compiled.push({
      method,
      path,
      regex: buildPathRegex(path),
      segments: parsePipeline(pipeline),
    });
  }

  const server = http.createServer(async (req, res) => {
    const method = req.method;
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;
    const searchParams = parsedUrl.searchParams;
    for (const route of compiled) {
      if (route.method !== method) continue;
      const m = pathname.match(route.regex);
      if (m) {
        const pathVars = m.groups || {};
        const ctx = { runtime, pathVars, searchParams };
        try {
          const result = await executePipeline(route.segments, ctx);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (err) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
    }
    res.statusCode = 404;
    res.end('Not found');
  });
  await new Promise(resolve => server.listen(port, resolve));
  console.log(`Nova service running at http://localhost:${port}`);
}

module.exports = { run };

// Allow direct execution: `node runner.js <file> [port]`
if (require.main === module) {
  const file = process.argv[2];
  const port = process.argv[3] ? parseInt(process.argv[3], 10) : 3000;
  run(file, port).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
