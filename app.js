const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();


process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION! Alasan:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! Error:', err);
});

const db = require('./config/database');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 2 }
}));


const authRoutes = require('./routes/authRoutes');
const superadminRoutes = require('./routes/superadminRoutes');
const adminRoutes = require('./routes/adminRoutes');
const kepsekRoutes = require('./routes/kepsekRoutes');
const profileRoutes = require('./routes/profileRoutes');
const { isAuthenticated, wajibGantiPasswordGuard } = require('./middlewares/authMiddleware');
const authController = require('./controllers/authController');


// Route publik (login, logout, lupa password) — TIDAK butuh login, jadi dipasang duluan,
// sebelum guard isAuthenticated/wajibGantiPasswordGuard.
app.use('/', authRoutes);

// Mulai dari sini ke bawah, SEMUA route WAJIB login (isAuthenticated),
// dan sekaligus kena cek wajib-ganti-password (wajibGantiPasswordGuard).
// Guard ini yang bikin res.locals.wajibGantiPassword ke-set SEBELUM controller manapun
// di bawah ini sempat render halaman — jadi overlay bisa muncul di semua halaman admin/superadmin/kepsek/profile.
app.use(isAuthenticated, wajibGantiPasswordGuard);

app.use('/superadmin', superadminRoutes);
app.use('/admin', adminRoutes);
app.use('/kepsek', kepsekRoutes);
app.use('/', profileRoutes);

app.post('/ganti-password-wajib', authController.processGantiPasswordWajib);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});