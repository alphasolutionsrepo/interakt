// Shim that lets tsx scripts import server-side code that contains
// `import "server-only"`. Loaded via NODE_OPTIONS=--require.
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  return originalLoad.call(this, request, parent, isMain);
};
