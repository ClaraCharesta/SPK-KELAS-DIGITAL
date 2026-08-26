const waspasModel = require('../models/waspasModel');
const periodeModel = require('../models/periodeModel');
const { generateLaporanPDF } = require('../utils/pdfGenerator');
const { hitungWASPAS } = require('../utils/waspasCalculator');

// ================================================================
// Helper: sisipkan wsm & wpm ke tiap baris hasilRanking dengan
// menghitung ulang WASPAS dari data siswa/kriteria/bobot periode
// yang bersangkutan.
// ================================================================
async function lengkapiWsmWpm(idPeriode, hasilRanking) {
    if (!hasilRanking || hasilRanking.length === 0) return hasilRanking;

    try {
        const siswaData = await waspasModel.getSiswaWithNilai(idPeriode);
        const kriteriaList = await waspasModel.getKriteria(idPeriode);
        const bobotList = await waspasModel.getBobot(idPeriode);

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
        console.error('Gagal menghitung detail WSM/WPM untuk laporan:', detailError);
    }

    return hasilRanking;
}

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

            await lengkapiWsmWpm(periode.id_periode, hasilRanking);

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
            const basePath = req.session.user.role === 'kepsek' ? 'kepsek' : 'admin';
            if (!periode) {
                return res.redirect(`/${basePath}/dashboard?error=${encodeURIComponent('Belum ada periode seleksi aktif.')}`);
            }
            const hasilRanking = await waspasModel.getHasilRanking(periode.id_periode);
            const bobotKriteria = await waspasModel.getBobotForLaporan(periode.id_periode);
            if (hasilRanking.length === 0) {
                return res.redirect(`/${basePath}/dashboard?error=${encodeURIComponent('Belum ada hasil perankingan untuk dicetak. Admin perlu menjalankan perhitungan WASPAS terlebih dahulu.')}`);
            }

            await lengkapiWsmWpm(periode.id_periode, hasilRanking);

            generateLaporanPDF(res, { periode, hasilRanking, bobotKriteria });
        } catch (error) {
            console.error(error);
            const basePath = req.session.user.role === 'kepsek' ? 'kepsek' : 'admin';
            res.redirect(`/${basePath}/dashboard?error=${encodeURIComponent('Terjadi kesalahan membuat laporan PDF.')}`);
        }
    }
};
module.exports = laporanController;