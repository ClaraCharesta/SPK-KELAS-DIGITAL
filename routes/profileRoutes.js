const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middlewares/authMiddleware');
const profileController = require('../controllers/profileController');

router.use(isAuthenticated);

router.get('/profile', profileController.index);
router.post('/profile/update-nama', profileController.updateNama);
router.post('/profile/update-password', profileController.updatePassword);

module.exports = router;