const express = require('express');
const router = express.Router();
const { isAuthenticated, checkRole } = require('../middlewares/authMiddleware');
const dashboardController = require('../controllers/dashboardController');
const userManagementController = require('../controllers/userManagementController');
const periodeController = require('../controllers/periodeController');
const kriteriaController = require('../controllers/kriteriaController');
const logController = require('../controllers/logController');
const riwayatController = require('../controllers/riwayatController');
const cekLock = require('../middlewares/lockMiddleware');


router.use(isAuthenticated, checkRole('super_admin'));

router.get('/dashboard', dashboardController.showSuperAdminDashboard);

router.get('/akun-admin', userManagementController.index);
router.post('/akun-admin/create', userManagementController.create);
router.post('/akun-admin/update', userManagementController.update);
router.post('/akun-admin/reset-password', userManagementController.resetPassword);
router.post('/akun-admin/toggle-status/:id_user', userManagementController.toggleStatus);
router.post('/akun-admin/delete/:id_user', userManagementController.delete);
router.get('/periode', periodeController.index);
router.post('/periode/create', periodeController.create);
router.post('/periode/set-active/:id_periode', periodeController.setActive);
router.post('/periode/update', periodeController.update);
router.post('/periode/delete/:id_periode', periodeController.delete);

router.get('/kriteria', kriteriaController.index);

router.post('/kriteria/create', cekLock, kriteriaController.create);
router.post('/kriteria/update', cekLock, kriteriaController.update);
router.post('/kriteria/delete/:id_kriteria', cekLock, kriteriaController.delete);

router.post('/periode/update-kuota', periodeController.updateKuota);
router.get('/log', logController.index);
router.get('/riwayat', riwayatController.index);
router.get('/riwayat/:id_periode', riwayatController.detail);
router.post('/periode/tutup/:id_periode', periodeController.tutupManual);

module.exports = router;