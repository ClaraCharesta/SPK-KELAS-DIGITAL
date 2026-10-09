const express = require('express');
const router = express.Router();
const akunSiswaController = require('../controllers/akunSiswaController');

// Hanya admin dan operator
function hanyaAdminOperator(req, res, next) {
    const user = req.session && req.session.user;

    if (!user) {
        return res.redirect('/login');
    }

    if (!['admin', 'operator'].includes(user.role)) {
        return res.status(403).send('Akses ditolak.');
    }

    next();
}

// Cetak semua kartu siswa pada periode aktif.
// Letakkan sebelum route dinamis agar /kartu tidak dianggap sebagai ID.
router.get(
    '/kartu',
    hanyaAdminOperator,
    akunSiswaController.kartuSemua
);

// Cetak kartu untuk satu siswa berdasarkan ID siswa.
router.get(
    '/:id/kartu',
    hanyaAdminOperator,
    akunSiswaController.kartuSatu
);

// Generate akun siswa yang belum memiliki akun (sekali klik).
router.post(
    '/generate',
    hanyaAdminOperator,
    akunSiswaController.generate
);

// Reset password akun siswa.
router.post(
    '/:id_siswa/reset-password',
    hanyaAdminOperator,
    akunSiswaController.resetPassword
);

module.exports = router;