
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

// Session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 2
    }
}));

// ===== Akun siswa: flash message + route =====
app.use((req, res, next) => {
    res.locals.akunSiswaFlash = null;

    // Hanya halaman HTML (bukan file CSS/JS/gambar)
    const halamanBiasa =
        req.method === 'GET' &&
        !/\.[a-z0-9]+$/i.test(req.path);

    if (
        halamanBiasa &&
        req.session &&
        req.session.akunSiswaFlash
    ) {
        res.locals.akunSiswaFlash = req.session.akunSiswaFlash;
        delete req.session.akunSiswaFlash;
    }

    next();
});

// Route akun siswa untuk admin dan operator
app.use('/akun-siswa', require('./routes/akunSiswaRoutes'));

const authRoutes = require('./routes/authRoutes');
const superadminRoutes = require('./routes/superadminRoutes');
const adminRoutes = require('./routes/adminRoutes');
const kepsekRoutes = require('./routes/kepsekRoutes');
const profileRoutes = require('./routes/profileRoutes');

const {
    isAuthenticated,
    wajibGantiPasswordGuard
} = require('./middlewares/authMiddleware');

const authController = require('./controllers/authController');

// Route publik (login, logout, lupa password)
app.use('/', authRoutes);

// Endpoint ganti password wajib untuk pengguna yang sudah login.
// Diletakkan sebelum guard wajib ganti password agar prosesnya bisa dijalankan.
app.post(
    '/ganti-password-wajib',
    isAuthenticated,
    authController.processGantiPasswordWajib
);

// Route siswa dipisahkan dari middleware autentikasi staf.
// Autentikasi siswa harus ditangani oleh middleware di siswaRoutes.
app.use('/siswa', require('./routes/siswaRoutes'));

// Semua route staf di bawah ini wajib login
app.use(isAuthenticated, wajibGantiPasswordGuard);

app.use('/superadmin', superadminRoutes);
app.use('/admin', adminRoutes);
app.use('/kepsek', kepsekRoutes);
app.use('/', profileRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});

