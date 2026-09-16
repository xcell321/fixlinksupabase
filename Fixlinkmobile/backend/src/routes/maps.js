const express = require('express');
const router = express.Router();

// LocationIQ credential lives ONLY on the server (backend/.env). The mobile app
// reaches LocationIQ exclusively through these proxy endpoints so the API key
// never ships inside the app bundle.
const LOCATIONIQ_KEY = process.env.LOCATIONIQ_ACCESS_TOKEN || '';
const SEARCH_BASE_URL = 'https://us1.locationiq.com/v1';
const TILES_BASE_URL = 'https://tiles.locationiq.com/v3/streets/r';

// Server-side tile cache + in-flight dedupe. Leaflet bursts ~9 tiles per map
// view and pans flush many more; caching means each tile hits LocationIQ at
// most once, cutting both latency and LocationIQ free-tier rate-limit (429)
// exposure dramatically.
const tileCache = new Map();
const tileInFlight = new Map();
const TILE_CACHE_MAX = 800;

const putTile = (key, buffer) => {
  tileCache.set(key, buffer);
  if (tileCache.size > TILE_CACHE_MAX) {
    const oldest = tileCache.keys().next().value;
    if (oldest !== undefined) tileCache.delete(oldest);
  }
};

const sendTile = (res, buffer) => {
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
};

const fetchJson = async (url, timeoutMs = 6000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

// GET /api/maps/tiles/:z/:x/:y.png — LocationIQ street tile proxy. Leaflet image
// requests cannot carry Authorization headers, so this tile route stays open
// (like the public tile CDN it replaces); the token is never exposed to clients.
router.get('/tiles/:z/:x/:y.png', async (req, res) => {
  const z = Number(req.params.z);
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  if (![z, x, y].every((value) => Number.isInteger(value) && value >= 0) || z > 19) {
    return res.status(400).send('Bad tile coordinates');
  }
  if (!LOCATIONIQ_KEY) return res.status(502).send('Map tiles are not configured.');

  const cacheKey = `${z}/${x}/${y}`;
  const cached = tileCache.get(cacheKey);
  if (cached) return sendTile(res, cached);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const fetchTile = async () => {
    try {
      const url = `${TILES_BASE_URL}/${z}/${x}/${y}.png?key=${encodeURIComponent(LOCATIONIQ_KEY)}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`LocationIQ tile ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  };

  let pending = tileInFlight.get(cacheKey);
  if (!pending) {
    pending = fetchTile().finally(() => tileInFlight.delete(cacheKey));
    tileInFlight.set(cacheKey, pending);
  }

  try {
    const buffer = await pending;
    putTile(cacheKey, buffer);
    return sendTile(res, buffer);
  } catch (error) {
    return res.status(502).send('Tile unavailable');
  }
});

// GET /api/maps/search?q= — forward-query geocoding (raw address first).
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length > 200) return res.status(400).json({ error: 'Valid search query is required.' });
  if (!LOCATIONIQ_KEY) return res.status(502).json({ error: 'Geocoding is not configured.' });

  const url = `${SEARCH_BASE_URL}/search?key=${encodeURIComponent(LOCATIONIQ_KEY)}&q=${encodeURIComponent(q)}&format=json&limit=1`;
  const data = await fetchJson(url);
  res.json(Array.isArray(data) ? data : []);
});

// GET /api/maps/autocomplete?q= — type-ahead place suggestions (Philippines).
router.get('/autocomplete', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length > 100) return res.status(400).json({ error: 'Valid query is required.' });
  if (!LOCATIONIQ_KEY) return res.status(502).json({ error: 'Geocoding is not configured.' });

  const url = `${SEARCH_BASE_URL}/autocomplete?key=${encodeURIComponent(LOCATIONIQ_KEY)}&q=${encodeURIComponent(q)}&limit=10&countrycodes=ph&dedupe=1&accept-language=en`;
  const data = await fetchJson(url);
  res.json(Array.isArray(data) ? data : []);
});

// GET /api/maps/directions/driving/:coords — driving directions between
// "lng,lat;lng,lat" coordinate pairs.
router.get('/directions/driving/:coords', async (req, res) => {
  const coords = String(req.params.coords || '').trim();
  const segments = coords.split(';');
  if (segments.length !== 2 || !segments.every((segment) => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(segment))) {
    return res.status(400).json({ error: 'Invalid coordinates.' });
  }
  if (!LOCATIONIQ_KEY) return res.status(502).json({ error: 'Routing is not configured.' });

  const url = `${SEARCH_BASE_URL}/directions/driving/${encodeURIComponent(coords)}?key=${encodeURIComponent(LOCATIONIQ_KEY)}&steps=true&geometries=geojson`;
  const data = await fetchJson(url, 9000);
  if (!data || !Array.isArray(data.routes)) {
    return res.status(502).json({ error: 'Directions unavailable.' });
  }
  res.json({ routes: data.routes, code: data.code });
});

module.exports = router;