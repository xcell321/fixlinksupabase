// Refactor safety net: locks down the /api/requests surface.
//
// The big requests router is being split into domain / repositories /
// services / controllers / routes modules. These tests make sure the split
// never renames a path, changes a method, drops a route, reorders routes so a
// specific path stops matching first, or removes a security middleware.
//
// Run with: npm test   (node --test)

const { test } = require('node:test');
const assert = require('node:assert/strict');

const requestRoutes = require('../src/routes/requests');
const { collectRoutes, routeKeys, middlewareNames } = require('./helpers/routeInventory');

// Exact surface, in registration order. Express matches in registration order,
// so this doubles as an ordering guard (e.g. PUT /notifications/:id/read must
// stay ahead of the generic PUT /:id/* routes).
const EXPECTED_ROUTES = [
  'POST /',
  'GET /',
  'GET /messages/unread',
  'GET /messages/inbox',
  'GET /notifications',
  'PUT /notifications/:id/read',
  'GET /job/:id',
  'PUT /accepted/:id/messages/read',
  'GET /customer/:customerName',
  'GET /customer/:uid/reviews',
  'GET /technician/:technicianUid/workload',
  'GET /technician/:technicianUid',
  'GET /accepted/:id/messages',
  'POST /accepted/:id/messages',
  'PUT /:id/decline',
  'PUT /:id/cancel',
  'GET /accepted/:id/location',
  'GET /accepted/:id/live-tracking',
  'PUT /accepted/:id/customer-location',
  'PUT /accepted/:id/status',
  'POST /:id/confirm-repair',
  'POST /:id/customer-ready',
  'POST /:id/arrive',
  'POST /:id/report-no-show',
  'GET /completed/:customerName',
  'POST /:id/review',
  'POST /:id/rate-customer',
  'POST /:id/report-scam',
  'PUT /:id/accept',
  'POST /:id/verify-completion',
];

test('requests router exposes exactly the expected endpoints, in order', () => {
  assert.deepEqual(routeKeys(requestRoutes), EXPECTED_ROUTES);
});

test('requests router guards every endpoint with requireAuth then the per-user limiter', () => {
  assert.deepEqual(middlewareNames(requestRoutes), ['requireAuth', 'rateLimitMiddleware']);
});

test('routes keep their extra middleware (uploads, limiters, OTP gate)', () => {
  const byKey = new Map(
    collectRoutes(requestRoutes).map((route) => [`${route.method} ${route.path}`, route])
  );

  // route.stack = [...middleware, handler]
  const expectedMiddlewareDepth = {
    'POST /': 2, // multer upload.single('photo') + handler
    'GET /messages/unread': 2, // unreadLimiter + handler
    'POST /accepted/:id/messages': 2, // multer upload.single('photo') + handler
    'POST /:id/verify-completion': 3, // otpVerifyLimiter + otpGate + handler
  };

  for (const [key, depth] of Object.entries(expectedMiddlewareDepth)) {
    const route = byKey.get(key);
    assert.ok(route, `expected route ${key} to exist`);
    assert.equal(
      route.middlewareCount,
      depth,
      `${key} middleware chain changed (expected ${depth} entries)`
    );
  }
});

test('every route has a handler and no route is registered twice', () => {
  const routes = collectRoutes(requestRoutes);
  assert.equal(routes.length, EXPECTED_ROUTES.length);

  for (const route of routes) {
    assert.ok(route.middlewareCount >= 1, `${route.method} ${route.path} has no handler`);
  }

  const keys = routeKeys(requestRoutes);
  assert.equal(new Set(keys).size, keys.length, 'duplicate route registration detected');
});
