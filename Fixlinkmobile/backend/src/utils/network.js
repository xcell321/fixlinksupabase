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
 * Priority: original tunnel or LAN host > PUBLIC_BASE_URL env (for prod https) > auto-detected LAN IP.
 * The Metro proxy forwards the original public host in X-Forwarded-Host, while
 * Host becomes 127.0.0.1 after proxying. The forwarded host always wins so the
 * email link never points at a proxy-internal address.
 * Loopback hosts always use http because the backend serves plain http locally.
 * No host is hardcoded. Tunnel and LAN hosts are detected from the request at runtime.
 */
function getPublicBaseUrl(requestHost, forwardedProto, forwardedHost) {
  const envUrl = String(process.env.PUBLIC_BASE_URL || '').trim();
  const rawForwarded = String(forwardedHost || '').trim().split(',')[0].trim().replace(/\/$/, '');
  const rawHost = String(requestHost || '').trim().replace(/\/$/, '');
  const host = (rawForwarded || rawHost).replace(/^https?:\/\//i, '');
  if (host) {
    const bare = host.split(':')[0].trim().toLowerCase();
    const isLoopback = bare === 'localhost' || bare === '127.0.0.1' || bare === '[::1]' || bare === '::1';
    if (isLoopback) {
      if (envUrl) return envUrl.replace(/\/$/, '');
      const port = process.env.PORT || 5050;
      return `http://${getLocalIp()}:${port}`;
    }
    const proto = String(forwardedProto || '').trim().toLowerCase().split(',')[0].trim();
    const isHttpsProto = proto === 'https';
    const isTunnelHost = /(trycloudflare\.com|cfargotunnel\.com|ngrok\.io|ngrok-free\.app|ngrok\.app|loca\.lt|serveo\.net)$/i.test(bare);
    const scheme = isHttpsProto || isTunnelHost ? 'https' : 'http';
    if (envUrl) return envUrl.replace(/\/$/, '');
    return `${scheme}://${host}`;
  }
  if (envUrl) return envUrl.replace(/\/$/, '');
  const port = process.env.PORT || 5050;
  return `http://${getLocalIp()}:${port}`;
}

module.exports = { getLocalIp, getPublicBaseUrl };
