'use strict';

// pkg's bundled Node binary is built without inspector support, so
// require('inspector') throws ERR_INSPECTOR_NOT_AVAILABLE. Next.js's
// internal tracer (loaded as soon as any route does a server-side fetch())
// requires it unconditionally at module scope, before any env-flag check
// can skip it. Loaded via NODE_OPTIONS=--require before server.js starts,
// this makes require('inspector') return a harmless no-op stub instead of
// throwing, so Next's tracer initializes fine and fetch() tracing is just
// inert.
const Module = require('module');

const inspectorStub = {
  open() {},
  close() {},
  url() {
    return undefined;
  },
  Session: class {
    connect() {}
    disconnect() {}
    post(_method, _params, callback) {
      if (typeof callback === 'function') callback(null, {});
    }
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'inspector' || request === 'node:inspector') {
    return inspectorStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};
