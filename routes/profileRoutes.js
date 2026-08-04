const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middlewares/authMiddleware');
const profileController = require('../controllers/profileController');
const uploadFoto = require('../middlewares/uploadFotoMiddleware');

router.use(isAuthenticated);

router.get('/profile', profileController.index);
router.post('/profile/update-nama', profileController.updateNama);
router.post('/profile/update-password', profileController.updatePassword);
router.post('/profile/update-foto', uploadFoto.single('foto'), profileController.updateFoto);

module.exports = router;