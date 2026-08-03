const waspasModel = require('../models/waspasModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');
const { hitungWASPAS } = require('../utils/waspasCalculator');

const waspasController = {
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                return res.render('admin/waspas', {
                    user: req.session.user, activePage: 'waspas', pageTitle: 'Perhitungan WASPAS',
                    hasilRanking: [], cekData: null, error: 'Belum ada periode seleksi aktif.', success: null
                });
            }

            const cekData = await waspasModel.checkDataLengkap(periode.id_periode);
            const hasilRanking = await waspasModel.getHasilRanking(periode.id_periode);

            res.render('admin/waspas', {
                user: req.session.user, activePage: 'waspas', pageTitle: 'Perhitungan WASPAS',
                hasilRanking, cekData, kuota: periode.kuota_kelas_digital,
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data WASPAS.');
        }
    },

    async hitung(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            const cekData = await waspasModel.checkDataLengkap(periode.id_periode);

            if (cekData.totalBobot === 0) {
                return res.redirect('/admin/waspas?error=Bobot kriteria belum dihitung. Lakukan perhitungan FUCOM terlebih dahulu.');
            }
            if (cekData.totalSiswa === 0) {
                return res.redirect('/admin/waspas?error=Belum ada data siswa.');
            }

            const siswaData = await waspasModel.getSiswaWithNilai(periode.id_periode);
            const kriteriaList = await waspasModel.getKriteria(periode.id_periode);
            const bobotList = await waspasModel.getBobot(periode.id_periode);

            const hasil = hitungWASPAS(siswaData, kriteriaList, bobotList);

            await waspasModel.saveHasil(periode.id_periode, hasil);
            await waspasModel.updateStatusPenerimaan(periode.id_periode, periode.kuota_kelas_digital);

            await userModel.logActivity(req.session.user.id_user, `Menghitung perangkingan WASPAS untuk ${hasil.length} siswa`);

            let pesan = 'Perangkingan WASPAS berhasil dihitung.';
            if (cekData.siswaBelumLengkap > 0) {
                pesan += ` Perhatian: ${cekData.siswaBelumLengkap} siswa belum memiliki nilai lengkap untuk semua kriteria, hasil bersifat sementara.`;
            }

            res.redirect(`/admin/waspas?success=${encodeURIComponent(pesan)}`);
        } catch (error) {
            console.error(error);
            res.redirect('/admin/waspas?error=Terjadi kesalahan sistem: ' + error.message);
        }
    }
};

module.exports = waspasController;