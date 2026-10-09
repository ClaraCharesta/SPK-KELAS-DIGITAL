const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isAuthenticated } = require('../middlewares/authMiddleware');
const { loginLimiter } = require('../middlewares/loginLimiter');

router.get('/', (req, res) => {
    res.redirect('/login');
});

router.get('/login', authController.showLoginPage);
router.post('/login', loginLimiter, authController.processLogin);
router.get('/logout', authController.logout);

// ====== LUPA PASSWORD (kirim password default ke email) ======
router.get('/forgot-password', authController.showForgotPasswordPage);
router.post('/forgot-password', authController.processForgotPassword);

// Redirect otomatis ke dashboard sesuai role setelah login
router.get('/dashboard', isAuthenticated, (req, res) => {
    const role = req.session.user.role;

    if (role === 'admin') return res.redirect('/superadmin/dashboard');
    if (role === 'operator') return res.redirect('/admin/dashboard');
    if (role === 'kepsek') return res.redirect('/kepsek/dashboard');

    return res.status(403).send('Role akun tidak dikenali.');
});

module.exports = router;