const waspasModel = require('../models/waspasModel');
const periodeModel = require('../models/periodeModel');
const { generateLaporanPDF } = require('../utils/pdfGenerator');

const laporanController = {
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            const basePath = req.session.user.role === 'kepsek' ? 'kepsek' : 'admin';

            if (!periode) {
                return res.render(`${basePath}/laporan`, {
                    user: req.session.user, activePage: 'laporan', pageTitle: 'Laporan',
                    hasilRanking: [], bobotKriteria: [], periode: null,
                    error: 'Belum ada periode seleksi aktif.'
                });
            }

            const hasilRanking = await waspasModel.getHasilRanking(periode.id_periode);
            const bobotKriteria = await waspasModel.getBobotForLaporan(periode.id_periode);

            res.render(`${basePath}/laporan`, {
                user: req.session.user, activePage: 'laporan', pageTitle: 'Laporan',
                hasilRanking, bobotKriteria, periode,
                error: null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data laporan.');
        }
    },

    async unduhPDF(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) return res.status(400).send('Belum ada periode seleksi aktif.');

            const hasilRanking = await waspasModel.getHasilRanking(periode.id_periode);
            const bobotKriteria = await waspasModel.getBobotForLaporan(periode.id_periode);

            if (hasilRanking.length === 0) {
                return res.status(400).send('Belum ada hasil ranking untuk dicetak. Lakukan perhitungan WASPAS terlebih dahulu.');
            }

            generateLaporanPDF(res, { periode, hasilRanking, bobotKriteria });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan membuat laporan PDF.');
        }
    }
};

module.exports = laporanController;