const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const db = require('./config/database');

const authRoutes = require('./routes/authRoutes');
const akunSiswaRoutes = require('./routes/akunSiswaRoutes');
const siswaRoutes = require('./routes/siswaRoutes');
const adminRoutes = require('./routes/adminRoutes');
const operatorRoutes = require('./routes/operatorRoutes');
const kepsekRoutes = require('./routes/kepsekRoutes');
const profileRoutes = require('./routes/profileRoutes');

const {
    isAuthenticated,
    wajibGantiPasswordGuard
} = require('./middlewares/authMiddleware');

const autoTutupPeriode = require('./middlewares/autoTutupPeriode');
const authController = require('./controllers/authController');
const pengingatService = require('./services/pengingatService');

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION! Alasan:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! Error:', err);
});

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
    cookie: {
        maxAge: 1000 * 60 * 60 * 2
    }
}));

app.use(autoTutupPeriode);
app.use((req, res, next) => {
    res.locals.akunSiswaFlash = null;

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

app.use('/akun-siswa', akunSiswaRoutes);

app.use('/', authRoutes);

app.post(
    '/ganti-password-wajib',
    isAuthenticated,
    authController.processGantiPasswordWajib
);

app.use('/siswa', siswaRoutes);

app.use(isAuthenticated, wajibGantiPasswordGuard);

app.use('/admin', adminRoutes);
app.use('/operator', operatorRoutes);
app.use('/kepsek', kepsekRoutes);
app.use('/', profileRoutes);

pengingatService.mulaiJadwal();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
