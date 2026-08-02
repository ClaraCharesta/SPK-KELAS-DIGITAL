const express = require('express');
const router = express.Router();
const { isAuthenticated, checkRole } = require('../middlewares/authMiddleware');

router.use(isAuthenticated, checkRole('admin'));

router.get('/dashboard', (req, res) => {
    res.render('admin/dashboard', { user: req.session.user });
});

module.exports = router;