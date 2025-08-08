/**
 * Nova runtime for Node.js. Provides basic capabilities (kv, http, clock, crypto)
 * using in-memory implementations. This skeleton will be expanded in future
 * iterations. It is not production-ready.
 */

class Runtime {
  constructor() {
    this.kvStore = new Map();
  }

  kvGet(key) {
    return this.kvStore.get(key);
  }

  kvSet(key, value) {
    this.kvStore.set(key, value);
  }

  kvScan(prefix) {
    const results = [];
    for (const [k, v] of this.kvStore.entries()) {
      if (k.startsWith(prefix)) results.push(v);
    }
    return results;
  }

  async httpPost(host, path, body) {
    // TODO: integrate with real HTTP client
    return { ok: true };
  }

  clockNow() {
    return new Date().toISOString();
  }

  cryptoHash(data) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(String(data)).digest('hex');
  }
}

module.exports = { Runtime };
