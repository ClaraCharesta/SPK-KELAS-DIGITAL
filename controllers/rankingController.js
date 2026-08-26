const waspasModel = require('../models/waspasModel');
const periodeModel = require('../models/periodeModel');
const { hitungWASPAS } = require('../utils/waspasCalculator');

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

            // ================================================================
            // Sisipkan nilai WSM & WPM ke tiap baris hasilRanking dengan
            // menghitung ulang WASPAS dari data siswa/kriteria/bobot saat ini
            // (detail WSM/WPM tidak disimpan ke database, hanya nilai_akhir_q
            // & ranking yang tersimpan lewat waspasModel.saveHasil()).
            // ================================================================
            if (hasilRanking.length > 0) {
                try {
                    const siswaData = await waspasModel.getSiswaWithNilai(periode.id_periode);
                    const kriteriaList = await waspasModel.getKriteria(periode.id_periode);
                    const bobotList = await waspasModel.getBobot(periode.id_periode);

                    if (siswaData.length > 0 && kriteriaList.length > 0 && bobotList.length > 0) {
                        const detailPerhitungan = hitungWASPAS(siswaData, kriteriaList, bobotList);
                        const detailMap = {};
                        detailPerhitungan.hasil.forEach(d => { detailMap[d.id_siswa] = d; });

                        hasilRanking.forEach(h => {
                            const d = detailMap[h.id_siswa];
                            h.wsm = d ? d.wsm : null;
                            h.wpm = d ? d.wpm : null;
                        });
                    }
                } catch (detailError) {
                    console.error('Gagal menghitung detail WSM/WPM untuk ranking:', detailError);
                }
            }

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