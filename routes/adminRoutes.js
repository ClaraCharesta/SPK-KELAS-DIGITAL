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

router.get('/dashboard', dashboardController.showAdminDashboard);

router.get('/siswa', siswaController.index);
router.post('/siswa/create', siswaController.create);
router.post('/siswa/update', siswaController.update);
router.post('/siswa/delete/:id_siswa', siswaController.delete);
router.post('/siswa/import', upload.single('fileExcel'), siswaController.importExcel);
router.get('/kriteria', kriteriaController.index);
router.post('/kriteria/create', kriteriaController.create);
router.post('/kriteria/update', kriteriaController.update);
router.post('/kriteria/delete/:id_kriteria', kriteriaController.delete);
router.get('/nilai', nilaiController.index);
router.get('/nilai/:id_siswa', nilaiController.showForm);
router.post('/nilai/:id_siswa/save', nilaiController.saveNilai);
router.get('/fucom', fucomController.index);
router.post('/fucom/input-responden', fucomController.saveInputResponden);
router.post('/fucom/hitung', fucomController.hitungBobot);
router.get('/waspas', waspasController.index);
router.post('/waspas/hitung', waspasController.hitung);
router.get('/laporan', laporanController.index);
router.get('/laporan/unduh', laporanController.unduhPDF);

module.exports = router;