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

router.use(isAuthenticated, checkRole('admin'));

// Dashboard
router.get('/dashboard', dashboardController.showAdminDashboard);

// Kriteria (read-only untuk Admin)
router.get('/kriteria', kriteriaController.indexReadOnly);

// Data Siswa
router.get('/siswa/template', siswaController.downloadTemplate);   // statis duluan
router.post('/siswa/import', upload.single('fileExcel'), siswaController.importExcel);
router.get('/siswa', siswaController.index);
router.post('/siswa/create', siswaController.create);
router.post('/siswa/update', siswaController.update);
router.post('/siswa/delete/:id_siswa', siswaController.delete);

// Input Nilai
router.get('/nilai/template', nilaiController.downloadTemplate);   // statis duluan
router.post('/nilai/import', upload.single('fileExcel'), nilaiController.importNilai);
router.get('/nilai', nilaiController.index);
router.get('/nilai/:id_siswa', nilaiController.showForm);          // dinamis belakangan
router.post('/nilai/:id_siswa/save', nilaiController.saveNilai);

// Pembobotan Kriteria (FUCOM)
router.get('/fucom', fucomController.index);
router.post('/fucom/input', fucomController.saveInput);
router.post('/fucom/hapus', fucomController.hapusResponden);
router.post('/fucom/hitung', fucomController.hitungBobot);

// Perankingan (WASPAS)
router.get('/waspas', waspasController.index);
router.post('/waspas/hitung', waspasController.hitung);
router.post('/waspas/hapus', waspasController.hapusHasil);
router.post('/waspas/tetapkan-lulus', waspasController.tetapkanLulus);

// Laporan
router.get('/laporan', laporanController.index);
router.get('/laporan/unduh', laporanController.unduhPDF);


module.exports = router;