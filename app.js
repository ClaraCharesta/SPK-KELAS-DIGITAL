require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const db = require('./config/database');

const cfg = require('./config/sessionConfig');
const { siswaIdleTimeout, userIdleTimeout, pingSesi } = require('./middlewares/sessionTimeout');
const sesiRoutes = require('./routes/sesiRoutes');

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

const periodeModel = require('./models/periodeModel');
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

const COOKIE_MAX_AGE_MS = Math.max(
    cfg.KONFIGURASI.siswa.absolutMs,
    cfg.KONFIGURASI.staf.absolutMs
) + (5 * 60 * 1000);

app.use(session({
    name: cfg.SESSION_COOKIE_NAME,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE_MS
    }
}));

app.use(userIdleTimeout);

// =========================================================
// SINKRONISASI STATUS PERIODE DENGAN TANGGAL DI DATABASE
// Dijalankan sebelum semua route (login siswa, halaman admin/operator/kepsek, dll),
// jadi status periode dan akun siswa selalu mengikuti tanggal terbaru di database.
//
// - Dua arah: tanggal dimundurkan -> ditutup, tanggal dimajukan lagi -> aktif lagi.
// - Dibatasi paling sering sekali per JEDA_SINKRON_MS agar database tidak
//   dibebani query di setiap request. Permintaan yang bersamaan memakai satu proses yang sama.
// - Kalau gagal, request tetap lanjut (tidak membuat aplikasi error).
// =========================================================
const JEDA_SINKRON_MS = 2000;
let sinkronTerakhir = 0;
let sinkronBerjalan = null;

const JALUR_DILEWATI = ['/sesi/ping', '/siswa/sesi/ping'];

async function jalankanSinkronPeriode() {
    try {
        const hasil = await periodeModel.sinkronkanDenganTanggal();

        if (hasil.ditutup > 0) {
            console.log(`[PERIODE] ${hasil.ditutup} periode ditutup otomatis (tanggal selesai terlewat)`);
        }
        if (hasil.dibuka > 0) {
            console.log(`[PERIODE] ${hasil.dibuka} periode dibuka kembali (tanggal selesai masih berlaku)`);
        }
        if (hasil.akunDinonaktifkan > 0) {
            console.log(`[PERIODE] ${hasil.akunDinonaktifkan} akun siswa dinonaktifkan`);
        }
        if (hasil.akunDiaktifkan > 0) {
            console.log(`[PERIODE] ${hasil.akunDiaktifkan} akun siswa diaktifkan kembali`);
        }
    } catch (e) {
        console.error('[PERIODE] Gagal sinkronisasi status periode:', e);
    } finally {
        sinkronTerakhir = Date.now();
        sinkronBerjalan = null;
    }
}

app.use(async (req, res, next) => {
    try {
        if (JALUR_DILEWATI.includes(req.path)) return next();

        if (sinkronBerjalan) {
            await sinkronBerjalan;
        } else if (Date.now() - sinkronTerakhir >= JEDA_SINKRON_MS) {
            sinkronBerjalan = jalankanSinkronPeriode();
            await sinkronBerjalan;
        }
    } catch (e) {
        console.error('[PERIODE] Middleware sinkronisasi error:', e);
    }

    next();
});

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

app.post('/sesi/ping', pingSesi);

app.post(
    '/ganti-password-wajib',
    isAuthenticated,
    authController.processGantiPasswordWajib
);

app.use('/siswa', siswaIdleTimeout);

app.use('/siswa', (req, res, next) => {
    if (req.method === 'GET' && !req.originalUrl.includes('/sesi/')) {
        console.log(
            '[DEBUG SESI]',
            req.originalUrl,
            '| session.siswa:', Boolean(req.session && req.session.siswa),
            '| sesiIdleMs:', res.locals.sesiIdleMs,
            '| sesiPeringatanMs:', res.locals.sesiPeringatanMs
        );
    }
    next();
});

app.post('/siswa/sesi/ping', pingSesi);
app.use('/siswa/sesi', sesiRoutes);
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