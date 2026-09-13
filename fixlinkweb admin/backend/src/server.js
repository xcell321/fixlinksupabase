const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Root/admin shortcuts land on the admin sign-in page.
// Registered before express.static so bare '/admin' doesn't get a static-folder redirect first.
app.get(['/', '/admin', '/admin/'], (req, res) => res.redirect('/admin/login.html'));

app.use(express.static(path.join(__dirname, '../public')));

// Import Routes (Notice the ./routes/ since server.js is inside src/)
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin panel available at http://localhost:${PORT}/admin/technicians.html`);
});