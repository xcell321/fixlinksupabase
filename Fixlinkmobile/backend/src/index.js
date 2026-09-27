// Load environment variables FIRST so config modules can read them at require time.
require('dotenv').config();

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');

// routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const requestRoutes = require('./routes/requests');
const adminRoutes = require('./routes/admin');
const profileRoutes = require('./routes/profile');
const recoveryRoutes = require('./routes/recovery');
const aiRoutes = require('./routes/ai');
const mapsRoutes = require('./routes/maps');
const { createRateLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 5050;

// Trust Cloudflare Tunnel and other proxies so req.protocol and req.ip reflect
// the real client instead of 127.0.0.1. This keeps rate limiting fair and lets
// email links use the correct https scheme when behind a tunnel.
app.set('trust proxy', 1);

// Middleware
app.use(cors());
// Gzip shrinks JSON feeds several-fold. Matters most on tunnel links and
// mobile data when many users poll at once.
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Health check. Open /api/health in a browser to verify the backend is
// reachable through localhost, LAN, or a tunnel. No authentication needed.
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

// Rate limiters — blocks excess requests instantly, before touching the database.
// Budget sized for shared-IP crowds: 10 phones on one WiFi poll about
// 300-400 req/min combined, so the cap sits safely above that.
const globalLimiter = createRateLimiter({
  windowMs: 60000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api', (req, res, next) => {
  // Map tiles burst ~9 requests per view and pan even more; they are cached
  // server-side and must never be cut off by the API limiter.
  if (req.path.startsWith('/maps/tiles/')) return next();
  return globalLimiter(req, res, next);
});

// Serve static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Password-recovery landing page (standard https link referenced from emails)
app.use('/', recoveryRoutes);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/maps', mapsRoutes);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    try {
        const { getLocalIp } = require('./utils/network');
        const autoIp = getLocalIp();
        const autoUrl = `http://${autoIp}:${PORT}`;
        const envUrl = String(process.env.PUBLIC_BASE_URL || '').trim();
        console.log(`🔗 Auto-detected PUBLIC_BASE_URL=${autoUrl} (for password-reset email links)`);
        if (envUrl && envUrl !== autoUrl) {
            console.log(`   .env PUBLIC_BASE_URL=${envUrl} will be used if set; leave empty to auto-detect, or set https domain for prod`);
        } else if (!envUrl) {
            console.log(`   .env PUBLIC_BASE_URL is empty — using auto-detected IP; email links will be reachable from phone on same WiFi`);
        }
    } catch (_) {}
});
