const express = require('express');
const router = express.Router();
const { isAuthenticated, checkRole } = require('../middlewares/authMiddleware');
const dashboardController = require('../controllers/dashboardController');
const siswaController = require('../controllers/siswaController');
const upload = require('../middlewares/uploadMiddleware');
const kriteriaController = require('../controllers/kriteriaController');
const nilaiController = require('../controllers/nilaiController');
const fucomController = require('../controllers/fucomController');
const waspasController = require('../controllers/waspasController');
const laporanController = require('../controllers/laporanController');
const cekLock = require('../middlewares/lockMiddleware');

router.use(isAuthenticated, checkRole('operator'));

// Dashboard
router.get('/dashboard', dashboardController.showOperatorDashboard);

// Kriteria (read-only untuk Admin)
router.get('/kriteria', kriteriaController.indexReadOnly);

// Data Siswa
router.get('/siswa/template', siswaController.downloadTemplate);
router.get('/siswa', siswaController.index);
router.post('/siswa/create', cekLock, siswaController.create);
router.post('/siswa/update', cekLock, siswaController.update);
router.post('/siswa/minat', cekLock, siswaController.ubahMinat);
router.post('/siswa/minat-massal', cekLock, siswaController.ubahMinatMassal);
router.post('/siswa/delete/:id_siswa', cekLock, siswaController.delete);
router.post('/siswa/import', cekLock, upload.single('fileExcel'), siswaController.importExcel);

// Input Nilai
router.get('/nilai/template', nilaiController.downloadTemplate);
router.post('/nilai/import', cekLock, upload.single('fileExcel'), nilaiController.importNilai);
router.get('/nilai', nilaiController.index);
router.get('/nilai/:id_siswa', nilaiController.showForm);
router.post('/nilai/:id_siswa/save', cekLock, nilaiController.saveNilai);

// Pembobotan Kriteria (FUCOM)
router.get('/fucom', fucomController.index);
router.post('/fucom/input', cekLock, fucomController.saveInput);
router.post('/fucom/hapus', cekLock, fucomController.hapusResponden);
router.post('/fucom/hitung', cekLock, fucomController.hitungBobot);
router.post('/fucom/edit', fucomController.editInput);

// Perankingan (WASPAS)
router.get('/waspas', waspasController.index);
router.post('/waspas/hitung', waspasController.hitung);
router.post('/waspas/hapus', waspasController.hapusHasil);
router.post('/waspas/finalisasi', waspasController.finalisasi);
router.post('/siswa/hapus-massal', siswaController.hapusMassal);

// Laporan
router.get('/laporan', laporanController.index);
router.get('/laporan/unduh', laporanController.unduhPDF);

module.exports = router;