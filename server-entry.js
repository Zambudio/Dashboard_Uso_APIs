'use strict';

// Loaded as the spawned process's entry point instead of standalone/server.js
// directly, so inspector-shim.js patches Module._load before Next.js's own
// require-hook (which unconditionally requires('inspector') on first
// server-side fetch()) ever runs. pkg's Node runtime doesn't support
// --require/NODE_OPTIONS, so this plain sequential require is the only way
// to guarantee load order. See inspector-shim.js and launcher.js.
require('./inspector-shim.js');
require('./standalone/server.js');
