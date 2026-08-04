const fucomModel = require('../models/fucomModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');
const db = require('../config/database');
const { hitungFUCOM, agregasiBobot } = require('../utils/fucomCalculator');

async function cekStatusFinal(id_periode) {
    const [[statusFinal]] = await db.query(
        "SELECT status_final FROM hasil_waspas WHERE id_periode = ? AND status_final = 'final' LIMIT 1",
        [id_periode]
    );
    return !!statusFinal;
}

const fucomController = {
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                return res.render('admin/fucom', {
                    user: req.session.user, activePage: 'fucom', pageTitle: 'Perhitungan FUCOM',
                    kriteriaList: [], respondenList: [], dataResponden: {}, bobotFinal: [],
                    error: 'Belum ada periode seleksi aktif.', success: null
                });
            }

            const kriteriaList = await fucomModel.getKriteria(periode.id_periode);
            const respondenList = await fucomModel.getRespondenList(periode.id_periode);

            // Ambil detail perbandingan untuk tiap responden yang sudah ada (maks 2)
            const dataResponden = {};
            for (const nama of respondenList) {
                dataResponden[nama] = await fucomModel.getPerbandinganByResponden(periode.id_periode, nama);
            }

            const bobotFinal = await fucomModel.getBobotFinal(periode.id_periode);

            res.render('admin/fucom', {
                user: req.session.user, activePage: 'fucom', pageTitle: 'Perhitungan FUCOM',
                kriteriaList, respondenList, dataResponden, bobotFinal,
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data FUCOM.');
        }
    },

    async saveInput(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (await cekStatusFinal(periode.id_periode)) {
                return res.redirect('/admin/fucom?error=Tidak dapat mengubah data karena hasil penempatan siswa sudah ditetapkan Final.');
            }

            const { nama_responden, id_kriteria_urutan, nilai_perbandingan } = req.body;

            if (!nama_responden || !id_kriteria_urutan) {
                return res.redirect('/admin/fucom?error=Data tidak lengkap.');
            }

            // Batasi maksimal 2 responden berbeda
            const respondenList = await fucomModel.getRespondenList(periode.id_periode);
            const isRespondenBaru = !respondenList.includes(nama_responden.trim());
            if (isRespondenBaru && respondenList.length >= 2) {
                return res.redirect('/admin/fucom?error=Sistem hanya menerima maksimal 2 responden. Hapus salah satu data responden terlebih dahulu jika ingin menggantinya.');
            }

            const urutanKriteria = Array.isArray(id_kriteria_urutan) ? id_kriteria_urutan : [id_kriteria_urutan];
            const nilaiPerbandingan = Array.isArray(nilai_perbandingan) ? nilai_perbandingan : [nilai_perbandingan];

            const idSet = new Set(urutanKriteria);
            if (idSet.size !== urutanKriteria.length) {
                return res.redirect('/admin/fucom?error=Setiap kriteria hanya boleh dipilih satu kali dalam urutan peringkat.');
            }

            const dataPerbandingan = [];
            for (let i = 0; i < urutanKriteria.length - 1; i++) {
                dataPerbandingan.push({
                    id_kriteria_asal: urutanKriteria[i],
                    id_kriteria_pembanding: urutanKriteria[i + 1],
                    peringkat_asal: i + 1,
                    nilai_perbandingan: nilaiPerbandingan[i]
                });
            }

            await fucomModel.savePerbandingan(periode.id_periode, nama_responden.trim(), dataPerbandingan);
            await fucomModel.hapusBobotFinal(periode.id_periode);

            await userModel.logActivity(req.session.user.id_user, `Menyimpan data perbandingan kriteria FUCOM (responden: ${nama_responden})`);

            res.redirect('/admin/fucom?success=Data responden berhasil disimpan. Lengkapi kedua responden lalu klik Hitung Bobot FUCOM.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/fucom?error=Terjadi kesalahan sistem.');
        }
    },

    async hapusResponden(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (await cekStatusFinal(periode.id_periode)) {
                return res.redirect('/admin/fucom?error=Tidak dapat menghapus data karena hasil penempatan siswa sudah ditetapkan Final.');
            }

            const { nama_responden } = req.body;
            await fucomModel.hapusPerbandinganByResponden(periode.id_periode, decodeURIComponent(nama_responden));
            await fucomModel.hapusBobotFinal(periode.id_periode);

            await userModel.logActivity(req.session.user.id_user, `Menghapus data responden FUCOM: ${nama_responden}`);

            res.redirect('/admin/fucom?success=Data responden berhasil dihapus.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/fucom?error=Terjadi kesalahan sistem.');
        }
    },

    async hitungBobot(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (await cekStatusFinal(periode.id_periode)) {
                return res.redirect('/admin/fucom?error=Tidak dapat menghitung ulang bobot karena hasil penempatan siswa sudah ditetapkan Final.');
            }

            const respondenList = await fucomModel.getRespondenList(periode.id_periode);

            if (respondenList.length < 2) {
                return res.redirect(`/admin/fucom?error=Diperlukan tepat 2 responden untuk menghitung bobot. Saat ini baru ${respondenList.length} responden.`);
            }

            const hasilPerResponden = [];

            for (const nama of respondenList) {
                const perbandinganData = await fucomModel.getPerbandinganByResponden(periode.id_periode, nama);

                const kriteriaOrder = [];
                perbandinganData.forEach(row => {
                    if (!kriteriaOrder.find(k => k.id_kriteria === row.id_kriteria_asal)) {
                        kriteriaOrder.push({ id_kriteria: row.id_kriteria_asal, nama: row.nama_kriteria_asal });
                    }
                });
                const lastRow = perbandinganData[perbandinganData.length - 1];
                if (lastRow && !kriteriaOrder.find(k => k.id_kriteria === lastRow.id_kriteria_pembanding)) {
                    kriteriaOrder.push({ id_kriteria: lastRow.id_kriteria_pembanding, nama: lastRow.nama_kriteria_pembanding });
                }

                const comparisonValues = perbandinganData.map(row => parseFloat(row.nilai_perbandingan));

                const hasil = hitungFUCOM(kriteriaOrder, comparisonValues);
                hasilPerResponden.push({ nama_responden: nama, bobot: hasil.bobot, dfc: hasil.dfc });
            }

            // Agregasi bobot dari 2 responden (rata-rata geometris)
            const bobotAgregasi = agregasiBobot(hasilPerResponden[0].bobot, hasilPerResponden[1].bobot);

            const dfcFinal = (hasilPerResponden[0].dfc + hasilPerResponden[1].dfc) / 2;

            await fucomModel.saveBobotFinal(periode.id_periode, bobotAgregasi, dfcFinal);
            await userModel.logActivity(req.session.user.id_user, `Menghitung bobot kriteria FUCOM (agregasi 2 responden: ${respondenList.join(', ')})`);

            res.redirect('/admin/fucom?success=Bobot kriteria berhasil dihitung dari agregasi 2 responden.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/fucom?error=Terjadi kesalahan dalam perhitungan: ' + error.message);
        }
    }
};

module.exports = fucomController;