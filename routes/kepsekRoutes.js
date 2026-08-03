const express = require('express');
const router = express.Router();
const { isAuthenticated, checkRole } = require('../middlewares/authMiddleware');
const dashboardController = require('../controllers/dashboardController');
const laporanController = require('../controllers/laporanController');

router.use(isAuthenticated, checkRole('kepsek'));

router.get('/dashboard', dashboardController.showKepsekDashboard);
router.get('/laporan', laporanController.index);
router.get('/laporan/unduh', laporanController.unduhPDF);

module.exports = router;