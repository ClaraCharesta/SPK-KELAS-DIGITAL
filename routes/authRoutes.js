const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isAuthenticated } = require('../middlewares/authMiddleware');

router.get('/', (req, res) => {
    res.redirect('/login');
});

router.get('/login', authController.showLoginPage);
router.post('/login', authController.processLogin);
router.get('/logout', authController.logout);

// Redirect otomatis ke dashboard sesuai role setelah login
router.get('/dashboard', isAuthenticated, (req, res) => {
    const role = req.session.user.role;
    if (role === 'super_admin') return res.redirect('/superadmin/dashboard');
    if (role === 'admin') return res.redirect('/admin/dashboard');
    if (role === 'kepsek') return res.redirect('/kepsek/dashboard');
    res.redirect('/login');
});

module.exports = router;