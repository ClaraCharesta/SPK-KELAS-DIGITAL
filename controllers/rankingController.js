const waspasModel = require('../models/waspasModel');
const periodeModel = require('../models/periodeModel');

const rankingController = {
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                return res.render('kepsek/ranking', {
                    user: req.session.user, activePage: 'ranking', pageTitle: 'Hasil Ranking Siswa',
                    hasilRanking: [], periode: null, error: 'Belum ada periode seleksi aktif.'
                });
            }

            const hasilRanking = await waspasModel.getHasilRanking(periode.id_periode);

            res.render('kepsek/ranking', {
                user: req.session.user, activePage: 'ranking', pageTitle: 'Hasil Ranking Siswa',
                hasilRanking, periode, error: null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data ranking.');
        }
    },

    async detailSiswaJSON(req, res) {
        try {
            const { id_siswa } = req.params;
            const detail = await waspasModel.getDetailNilaiSiswa(id_siswa);
            res.json({ success: true, detail });
        } catch (error) {
            console.error(error);
            res.json({ success: false, error: error.message });
        }
    }
};

module.exports = rankingController;