// Metro config — extend defaults so the bundled SQLite file ships as an asset, and
// so the web bundle can include sql.js (whose WASM glue references Node core modules).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `.db` is data, not source: register it as an asset so require('...ifct2017.db')
// resolves to a bundled file we can copy into writable storage on first launch.
if (!config.resolver.assetExts.includes('db')) {
  config.resolver.assetExts.push('db');
}

// sql.js (web SQLite) ships Emscripten glue with node-only `require('fs'|'path'|
// 'crypto'|...)` branches. They never execute in a browser, but Metro resolves them
// statically — so on web we map those builtins to an empty stub.
const NODE_BUILTIN_STUBS = new Set(['fs', 'path', 'crypto', 'perf_hooks', 'worker_threads']);
const EMPTY = path.resolve(__dirname, 'web-shims/empty.js');
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && NODE_BUILTIN_STUBS.has(moduleName)) {
    return { type: 'sourceFile', filePath: EMPTY };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
