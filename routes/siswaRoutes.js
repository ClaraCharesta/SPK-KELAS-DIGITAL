const express = require('express');
const router = express.Router();

const portalSiswaController = require('../controllers/portalSiswaController');

const {
    isSiswa,
    wajibGantiPasswordSiswa
} = require('../middlewares/siswaMiddleware');

// Middleware untuk seluruh portal siswa
router.use(
    isSiswa,
    wajibGantiPasswordSiswa
);

// Beranda (menampilkan tahap sesuai status siswa)
router.get('/', portalSiswaController.index);

// Form 3 pertanyaan (otomatis berminat setelah disimpan)
router.get('/form', portalSiswaController.tampilForm);
router.post('/form', portalSiswaController.submitForm);

// Menyatakan tidak berminat (2 langkah)
router.get('/tolak', portalSiswaController.tolakLangkah1);
router.post('/tolak/langkah-1', portalSiswaController.prosesLangkah1);
router.get('/tolak/langkah-2', portalSiswaController.tolakLangkah2);
router.post('/tolak/konfirmasi', portalSiswaController.prosesTolak);

// Profil dan ganti password
router.get('/profil', portalSiswaController.profil);
router.get('/ganti-password', portalSiswaController.tampilGantiPassword);
router.post('/ganti-password', portalSiswaController.prosesGantiPassword);

module.exports = router;