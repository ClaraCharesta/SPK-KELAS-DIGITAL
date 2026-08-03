const fucomModel = require('../models/fucomModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');
const { hitungFUCOM, agregasiBobot } = require('../utils/fucomCalculator');

const fucomController = {
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                return res.render('admin/fucom', {
                    user: req.session.user, activePage: 'fucom', pageTitle: 'Perhitungan FUCOM',
                    kriteriaList: [], respondenList: [], bobotFinal: [],
                    error: 'Belum ada periode seleksi aktif.', success: null
                });
            }

            const kriteriaList = await fucomModel.getKriteria(periode.id_periode);
            const respondenList = await fucomModel.getAllResponden(periode.id_periode);
            const bobotFinal = await fucomModel.getBobotFinal(periode.id_periode);

            res.render('admin/fucom', {
                user: req.session.user, activePage: 'fucom', pageTitle: 'Perhitungan FUCOM',
                kriteriaList, respondenList, bobotFinal,
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data FUCOM.');
        }
    },

    async saveInputResponden(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            const { nama_responden, id_kriteria_urutan, nilai_perbandingan } = req.body;

            if (!nama_responden || !id_kriteria_urutan) {
                return res.redirect('/admin/fucom?error=Data tidak lengkap.');
            }

            const urutanKriteria = Array.isArray(id_kriteria_urutan) ? id_kriteria_urutan : [id_kriteria_urutan];
            const nilaiPerbandingan = Array.isArray(nilai_perbandingan) ? nilai_perbandingan : [nilai_perbandingan];

            // Hapus data lama responden ini kalau input ulang
            await fucomModel.deletePerbandinganByResponden(periode.id_periode, nama_responden);

            const dataPerbandingan = [];
            for (let i = 0; i < urutanKriteria.length - 1; i++) {
                dataPerbandingan.push({
                    id_kriteria_asal: urutanKriteria[i],
                    id_kriteria_pembanding: urutanKriteria[i + 1],
                    peringkat_asal: i + 1,
                    nilai_perbandingan: nilaiPerbandingan[i]
                });
            }

            await fucomModel.savePerbandingan(periode.id_periode, nama_responden, dataPerbandingan);
            await userModel.logActivity(req.session.user.id_user, `Menginput data perbandingan FUCOM dari responden: ${nama_responden}`);

            res.redirect('/admin/fucom?success=Data perbandingan kriteria berhasil disimpan.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/fucom?error=Terjadi kesalahan sistem.');
        }
    },

    async hitungBobot(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            const respondenList = await fucomModel.getAllResponden(periode.id_periode);

            if (respondenList.length === 0) {
                return res.redirect('/admin/fucom?error=Belum ada data perbandingan kriteria dari responden manapun.');
            }

            const hasilPerResponden = [];

            for (const nama of respondenList) {
                const perbandinganData = await fucomModel.getPerbandinganByResponden(periode.id_periode, nama);

                // Susun urutan kriteria dari data perbandingan
                const kriteriaOrder = [];
                perbandinganData.forEach(row => {
                    if (!kriteriaOrder.find(k => k.id_kriteria === row.id_kriteria_asal)) {
                        kriteriaOrder.push({ id_kriteria: row.id_kriteria_asal, nama: '' });
                    }
                });
                // Tambahkan kriteria terakhir (pembanding di baris terakhir)
                const lastRow = perbandinganData[perbandinganData.length - 1];
                if (lastRow && !kriteriaOrder.find(k => k.id_kriteria === lastRow.id_kriteria_pembanding)) {
                    kriteriaOrder.push({ id_kriteria: lastRow.id_kriteria_pembanding, nama: '' });
                }

                const comparisonValues = perbandinganData.map(row => parseFloat(row.nilai_perbandingan));

                const hasil = hitungFUCOM(kriteriaOrder, comparisonValues);
                hasilPerResponden.push({ nama_responden: nama, bobot: hasil.bobot, dfc: hasil.dfc });
            }

            // Agregasi bobot dari semua responden (rata-rata geometris)
            const bobotAgregasi = agregasiBobot(hasilPerResponden);

            // DFC final = rata-rata DFC semua responden
            const dfcFinal = hasilPerResponden.reduce((sum, r) => sum + r.dfc, 0) / hasilPerResponden.length;

            await fucomModel.saveBobotFinal(periode.id_periode, bobotAgregasi, dfcFinal);
            await userModel.logActivity(req.session.user.id_user, `Menghitung bobot kriteria menggunakan FUCOM (${respondenList.length} responden)`);

            res.redirect('/admin/fucom?success=Bobot kriteria berhasil dihitung.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/fucom?error=Terjadi kesalahan dalam perhitungan: ' + error.message);
        }
    }
};

module.exports = fucomController;