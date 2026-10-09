const rateLimit = require('express-rate-limit');

// Dibatasi per USERNAME (bukan per IP), karena satu sekolah biasanya satu IP.
// Hanya login siswa yang gagal (status 401) yang dihitung; login staf tidak terpengaruh.
// Untuk express-rate-limit versi 6 ke bawah, ganti "limit" menjadi "max".
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const username = String((req.body && req.body.username) || '').trim().toLowerCase();
        return username || 'kosong';
    },
    handler: (req, res) => {
        res.status(429).render('login', {
            error: 'Terlalu banyak percobaan login untuk akun ini. Coba lagi dalam 15 menit.'
        });
    }
});

module.exports = { loginLimiter };