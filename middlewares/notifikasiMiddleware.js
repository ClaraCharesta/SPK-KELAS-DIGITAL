const notifikasiModel = require('../models/notifikasiModel');
const db = require('../config/database');

const injectNotifikasi = async (req, res, next) => {
    try {
        if (!req.session.user) return next();

        const [[periode]] = await db.query("SELECT id_periode FROM periode_seleksi WHERE status_periode = 'aktif' LIMIT 1");
        const id_periode = periode ? periode.id_periode : null;

        let notifikasi = [];
        if (req.session.user.role === 'admin') {
            notifikasi = await notifikasiModel.getForAdmin(id_periode);
        } else if (req.session.user.role === 'kepsek') {
            notifikasi = await notifikasiModel.getForKepsek(id_periode);
        } else if (req.session.user.role === 'super_admin') {
            notifikasi = await notifikasiModel.getForSuperAdmin();
        }

        res.locals.notifikasi = notifikasi;
        next();
    } catch (error) {
        console.error('Gagal mengambil notifikasi:', error);
        res.locals.notifikasi = [];
        next();
    }
};

module.exports = injectNotifikasi;