const periodeModel = require('../models/periodeModel');
const waspasModel = require('../models/waspasModel');

const riwayatController = {
    async index(req, res) {
        try {
            const semuaPeriode = await periodeModel.getAll();
            const periodeTertutup = semuaPeriode.filter(p => p.status_periode === 'ditutup' && p.status_penyelesaian === 'selesai');

            res.render('superadmin/riwayat', {
                user: req.session.user, activePage: 'riwayat', pageTitle: 'Riwayat Periode',
                periodeTertutup, selectedPeriode: null, hasilRanking: [], bobotKriteria: []
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data riwayat.');
        }
    },

    async detail(req, res) {
        try {
            const { id_periode } = req.params;
            const semuaPeriode = await periodeModel.getAll();
            const periodeTertutup = semuaPeriode.filter(p => p.status_periode === 'ditutup' && p.status_penyelesaian === 'selesai');
            const selectedPeriode = periodeTertutup.find(p => p.id_periode == id_periode);

            if (!selectedPeriode) {
                return res.status(404).send('Periode tidak ditemukan atau belum selesai.');
            }

            const hasilRanking = await waspasModel.getHasilRanking(id_periode);
            const bobotKriteria = await waspasModel.getBobotForLaporan(id_periode);

            res.render('superadmin/riwayat', {
                user: req.session.user, activePage: 'riwayat', pageTitle: 'Riwayat Periode',
                periodeTertutup, selectedPeriode, hasilRanking, bobotKriteria
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil detail riwayat.');
        }
    }
};

module.exports = riwayatController;