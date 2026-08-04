const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../public/img/profile'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'user_' + req.session.user.id_user + '_' + Date.now() + ext);
    }
});

const uploadFoto = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // maksimal 2MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.png', '.jpg', '.jpeg'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file PNG, JPG, atau JPEG yang diizinkan.'));
        }
    }
});

module.exports = uploadFoto;