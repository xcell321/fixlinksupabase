// Route-inventory helper for refactor regression tests.
//
// Express 5 keeps layers on `app.router.stack` / `router.stack`. Each layer is
// either a `route` (a concrete METHOD + path) or a mounted sub-router (whose
// own stack we recurse into). Listing routes lets a test fail loudly when a
// refactor accidentally renames, drops, duplicates, or reorders an endpoint.

function collectRoutes(router) {
  const found = [];

  const walk = (stack) => {
    if (!Array.isArray(stack)) return;
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods || {}).filter(
          (method) => layer.route.methods[method]
        );
        for (const method of methods) {
          found.push({
            method: method.toUpperCase(),
            path: layer.route.path,
            middlewareCount: (layer.route.stack || []).length,
            handlers: (layer.route.stack || []).map((entry) => entry.name),
          });
        }
      } else if (layer.handle && Array.isArray(layer.handle.stack)) {
        walk(layer.handle.stack);
      }
    }
  };

  walk(router && router.stack);
  return found;
}

// "GET /messages/unread" strings, in registration order.
function routeKeys(router) {
  return collectRoutes(router).map((route) => `${route.method} ${route.path}`);
}

// Router-level `router.use(...)` middleware names, in order (auth guards,
// shared limiters, etc). Nested mounts appear as `router`.
function middlewareNames(router) {
  const names = [];
  for (const layer of (router && router.stack) || []) {
    if (layer.route) break; // stop at the first actual route
    names.push(layer.name || (layer.handle && layer.handle.name) || 'anonymous');
  }
  return names;
}

module.exports = { collectRoutes, routeKeys, middlewareNames };
