const express = require('express');
const router = express.Router();
const { isAuthenticated, checkRole } = require('../middlewares/authMiddleware');

// Semua route di file ini wajib login DAN role harus super_admin
router.use(isAuthenticated, checkRole('super_admin'));

router.get('/dashboard', (req, res) => {
    res.render('superadmin/dashboard', { user: req.session.user });
});

module.exports = router;