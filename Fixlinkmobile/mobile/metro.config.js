// Metro dev-server proxy. One tunnel (or LAN host) serves both the app
// bundle and the backend API. The mobile app calls its own origin, so
// tunnel URL changes need zero code changes.
//
//   tester browser (web)
//   Expo Go device         -> Metro :8081 -> /api, /uploads, /reset-password -> backend :5050
//   cloudflared tunnel                (bundle) -> everything else
//
const { getDefaultConfig } = require('expo/metro-config');
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = (async () => {
  const config = await getDefaultConfig(__dirname);

  // Supabase realtime-js ships extensionless ESM imports. Package exports
  // resolution lets Metro resolve them on web plus native.
  config.resolver = config.resolver || {};
  config.resolver.unstable_enablePackageExports = true;

  const backendPort = process.env.FIXLINK_BACKEND_PORT || '5050';
  const backendTarget = process.env.FIXLINK_BACKEND_URL || `http://127.0.0.1:${backendPort}`;

  const shouldProxy = (url) =>
    Boolean(
      url &&
        (url.startsWith('/api') || url.startsWith('/uploads') || url.startsWith('/reset-password')),
    );

  const apiProxy = createProxyMiddleware({
    target: backendTarget,
    changeOrigin: true,
    ws: true,
    xfwd: true,
    proxyTimeout: 120000,
    timeout: 120000,
    logLevel: 'warn',
    onProxyReq: (proxyReq, req) => {
      const originalHost = req.headers && req.headers.host;
      if (originalHost && !proxyReq.getHeader('x-forwarded-host')) {
        proxyReq.setHeader('x-forwarded-host', originalHost);
      }
      const proto = (req.socket && req.socket.encrypted) ? 'https' : 'http';
      if (!proxyReq.getHeader('x-forwarded-proto')) {
        proxyReq.setHeader('x-forwarded-proto', proto);
      }
    },
    onError: (err, req, res) => {
      if (res && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      if (res) {
        res.end(JSON.stringify({ error: 'Backend is not reachable. Start the backend on port 5050.' }));
      }
    },
  });

  config.server = config.server || {};
  config.server.enhanceMiddleware = (middleware, server) => {
    console.log('[fixlink-proxy] enhanceMiddleware invoked. Backend target:', backendTarget);
    return (req, res, next) => {
      if (shouldProxy(req.url)) {
        return apiProxy(req, res, next);
      }
      return middleware(req, res, next);
    };
  };

  return config;
})();
