const waspasModel = require('../models/waspasModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');
const { hitungWASPAS } = require('../utils/waspasCalculator');
const { cekTerkunci } = require('../utils/lockHelper');

const waspasController = {
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                return res.render('admin/waspas', {
        user: req.session.user,
        activePage: 'waspas',
        pageTitle: 'Perhitungan WASPAS',
        hasilRanking: [],
        cekData: null,
        kuota: 0,
        error: 'Belum ada periode seleksi aktif.',
        success: null,
        terkunci: false
                });
            }

            const cekData = await waspasModel.checkDataLengkap(periode.id_periode);
            const hasilRanking = await waspasModel.getHasilRanking(periode.id_periode);
            const terkunci = await cekTerkunci(periode.id_periode);

            res.render('admin/waspas', {
    user: req.session.user,
    activePage: 'waspas',
    pageTitle: 'Perhitungan WASPAS',
    hasilRanking,
    cekData,
    kuota: periode.kuota_kelas_digital,
    success: req.query.success || null,
    error: req.query.error || null,
    terkunci
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data WASPAS.');
        }
    },

    async hitung(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode) {
                return res.redirect('/admin/waspas?error=Belum ada periode seleksi aktif.');
            }

            // Blokir hitung ulang kalau sudah terkunci
            if (await cekTerkunci(periode.id_periode)) {
                return res.redirect('/admin/waspas?error=Perhitungan terkunci karena sudah ada siswa yang ditetapkan Lulus.');
            }

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
    },

    async hapusHasil(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode) {
                return res.redirect('/admin/waspas?error=Belum ada periode seleksi aktif.');
            }

            // Blokir hapus hasil kalau sudah terkunci
            if (await cekTerkunci(periode.id_periode)) {
                return res.redirect('/admin/waspas?error=Tidak dapat menghapus karena sudah ada siswa yang ditetapkan Lulus.');
            }

            await waspasModel.hapusHasil(periode.id_periode);
            await userModel.logActivity(req.session.user.id_user, 'Menghapus hasil perankingan WASPAS');

            res.redirect('/admin/waspas?success=Hasil perankingan berhasil dihapus. Pembobotan kriteria kini dapat diubah kembali.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/waspas?error=Terjadi kesalahan sistem.');
        }
    },

    async tetapkanLulus(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode) {
                return res.redirect('/admin/waspas?error=Belum ada periode seleksi aktif.');
            }

            let { id_siswa_lulus } = req.body;

            if (!id_siswa_lulus) {
                return res.redirect('/admin/waspas?error=Pilih minimal 1 siswa untuk ditetapkan lulus.');
            }

            const idArray = Array.isArray(id_siswa_lulus) ? id_siswa_lulus : [id_siswa_lulus];

            const jumlahLulusSekarang = await waspasModel.hitungJumlahLulus(periode.id_periode);
            const sisaKuota = periode.kuota_kelas_digital - jumlahLulusSekarang;

            if (idArray.length > sisaKuota) {
                return res.redirect(`/admin/waspas?error=Jumlah yang dipilih (${idArray.length}) melebihi sisa kuota (${sisaKuota}). Kurangi pilihan Anda.`);
            }

            await waspasModel.tetapkanLulus(periode.id_periode, idArray);
            const sudahPenuh = await waspasModel.kunciJikaKuotaPenuh(periode.id_periode, periode.kuota_kelas_digital);

            await userModel.logActivity(req.session.user.id_user, `Menetapkan ${idArray.length} siswa sebagai Lulus`);

            let pesan = `${idArray.length} siswa berhasil ditetapkan Lulus.`;
            if (sudahPenuh) pesan += ' Kuota telah terpenuhi, hasil penempatan kini bersifat final.';

            res.redirect(`/admin/waspas?success=${encodeURIComponent(pesan)}`);
        } catch (error) {
            console.error(error);
            res.redirect('/admin/waspas?error=Terjadi kesalahan sistem.');
        }
    },

    async updateStatusManual(req, res) {
        try {
            const { id_siswa, status_baru } = req.body;
            const periode = await periodeModel.getActivePeriode();

            if (status_baru === 'lulus') {
                const jumlahLulus = await waspasModel.hitungJumlahLulus(periode.id_periode);
                if (jumlahLulus >= periode.kuota_kelas_digital) {
                    return res.redirect('/admin/waspas?error=Kuota sudah terpenuhi, tidak dapat menambah siswa Lulus lagi.');
                }
            }

            await waspasModel.updateStatusManual(id_siswa, status_baru);
            await waspasModel.kunciJikaKuotaPenuh(periode.id_periode, periode.kuota_kelas_digital);

            await userModel.logActivity(req.session.user.id_user, `Mengubah status siswa ID ${id_siswa} menjadi ${status_baru}`);
            res.redirect('/admin/waspas?success=Status siswa berhasil diperbarui.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/waspas?error=Terjadi kesalahan sistem.');
        }
    }
};

module.exports = waspasController;