const dashboardModel = require('../models/dashboardModel');
const db = require('../config/database');

const dashboardController = {
    async showSuperAdminDashboard(req, res) {
        try {
            const stats = await dashboardModel.getSuperAdminStats();
            res.render('superadmin/dashboard', { user: req.session.user, stats, activePage: 'dashboard', pageTitle: 'Dashboard Super Admin' });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data dashboard.');
        }
    },

    async showAdminDashboard(req, res) {
        try {
            const [[periode]] = await db.query("SELECT id_periode FROM periode_seleksi WHERE status_periode = 'aktif' LIMIT 1");
            const stats = periode
                ? await dashboardModel.getAdminStats(periode.id_periode)
                : { totalSiswa: 0, totalKriteria: 0, kriteriaTerisi: 0, statusFucom: 'Belum', statusWaspas: 'Belum' };
            res.render('admin/dashboard', { user: req.session.user, stats, activePage: 'dashboard', pageTitle: 'Dashboard Admin' });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data dashboard.');
        }
    },

    async showKepsekDashboard(req, res) {
        try {
            const [[periode]] = await db.query("SELECT id_periode FROM periode_seleksi WHERE status_periode = 'aktif' LIMIT 1");
            const stats = periode
                ? await dashboardModel.getKepsekStats(periode.id_periode)
                : { diterima: 0, cadangan: 0, statusKeputusan: 'Belum Ada', bobotKriteria: [] };
            res.render('kepsek/dashboard', { user: req.session.user, stats, activePage: 'dashboard', pageTitle: 'Dashboard Kepala Sekolah' });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data dashboard.');
        }
    }
};

module.exports = dashboardController;