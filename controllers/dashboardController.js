const dashboardModel = require('../models/dashboardModel');
const periodeModel = require('../models/periodeModel');
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

            const latestPeriode = await periodeModel.getLatestPeriode();
            const chartData = await dashboardModel.getChartData(latestPeriode ? latestPeriode.id_periode : null);
            const riwayatPeriode = await dashboardModel.getRiwayatAntarPeriode();

            res.render('admin/dashboard', {
                user: req.session.user, stats, chartData, latestPeriode, riwayatPeriode,
                activePage: 'dashboard', pageTitle: 'Dashboard Admin'
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data dashboard.');
        }
    },

    async showKepsekDashboard(req, res) {
        try {
            const latestPeriode = await periodeModel.getLatestPeriode();
            const chartData = await dashboardModel.getChartData(latestPeriode ? latestPeriode.id_periode : null);
            const riwayatPeriode = await dashboardModel.getRiwayatAntarPeriode();

            res.render('kepsek/dashboard', {
                user: req.session.user, chartData, latestPeriode, riwayatPeriode,
                activePage: 'dashboard', pageTitle: 'Dashboard Kepala Sekolah'
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data dashboard.');
        }
    }
};

module.exports = dashboardController;