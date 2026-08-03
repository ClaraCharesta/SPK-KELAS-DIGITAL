const express = require('express');
const router = express.Router();
const { isAuthenticated, checkRole } = require('../middlewares/authMiddleware');
const dashboardController = require('../controllers/dashboardController');
const userManagementController = require('../controllers/userManagementController');
const periodeController = require('../controllers/periodeController');
const kriteriaController = require('../controllers/kriteriaController');

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
router.get('/kriteria', kriteriaController.index);
router.post('/kriteria/create', kriteriaController.create);
router.post('/kriteria/update', kriteriaController.update);
router.post('/kriteria/delete/:id_kriteria', kriteriaController.delete);

module.exports = router;