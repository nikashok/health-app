// Empty stub. sql.js's WASM glue references Node core modules (fs/path/crypto) inside
// node-only branches that never run in the browser; Metro still resolves those
// requires statically, so on web we point them here. See metro.config.js.
module.exports = {};
