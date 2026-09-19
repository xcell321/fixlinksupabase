const os = require('os');

/**
 * Auto-detect the machine's LAN IP for PUBLIC_BASE_URL.
 * Priority: 192.168.x.x (WiFi/hotspot) > 10.x.x.x > 172.16-31.x.x > first non-internal IPv4.
 * This keeps password-reset email links reachable from the phone that opens the email,
 * without manually editing .env when WiFi changes.
 */
function getLocalIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const interfaces of Object.values(nets)) {
    for (const iface of interfaces || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address) {
        candidates.push(iface.address);
      }
    }
  }
  // Prefer 192.168.x.x (most common hotspot/home router)
  const pref192 = candidates.find((ip) => ip.startsWith('192.168.'));
  if (pref192) return pref192;
  const pref10 = candidates.find((ip) => ip.startsWith('10.'));
  if (pref10) return pref10;
  const pref172 = candidates.find((ip) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip));
  if (pref172) return pref172;
  return candidates[0] || '127.0.0.1';
}

/**
 * Resolve the publicly reachable base URL for email links.
 * Priority: requestHost (from phone's Host header) > PUBLIC_BASE_URL env (for prod https) > auto-detected LAN IP > localhost.
 */
function getPublicBaseUrl(requestHost) {
  if (requestHost) {
    const host = String(requestHost).trim();
    if (host) return `http://${host}`;
  }
  const envUrl = String(process.env.PUBLIC_BASE_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/$/, '');
  const port = process.env.PORT || 5050;
  return `http://${getLocalIp()}:${port}`;
}

module.exports = { getLocalIp, getPublicBaseUrl };
