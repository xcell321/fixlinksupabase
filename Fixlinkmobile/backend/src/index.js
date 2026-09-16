// Load environment variables FIRST so config modules can read them at require time.
require('dotenv').config();

const express = require('express');
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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiters — blocks excess requests instantly, before touching the database
const globalLimiter = createRateLimiter({
  windowMs: 60000,
  max: 300,
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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
