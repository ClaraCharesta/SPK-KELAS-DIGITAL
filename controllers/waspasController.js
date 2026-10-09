const waspasModel = require('../models/waspasModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');
const { hitungWASPAS } = require('../utils/waspasCalculator');
const { cekTerkunci } = require('../utils/lockHelper');
const { isPeriodeSudahMulai, pesanBelumMulai } = require('../utils/periodeHelper');

const redirectError = (res, pesan) =>
    res.redirect('/admin/waspas?error=' + encodeURIComponent(pesan));

const waspasController = {
    // GET /admin/waspas
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return res.render('admin/waspas', {
                    user: req.session.user,
                    activePage: 'waspas',
                    pageTitle: 'Perhitungan WASPAS',
                    hasilRanking: [],
                    cekData: null,
                    kuota: 0,
                    detailPerhitungan: null,
                    error: !periode ? 'Belum ada periode seleksi aktif.' : pesanBelumMulai(periode),
                    success: null,
                    terkunci: false
                });
            }

            const cekData = await waspasModel.checkDataLengkap(periode.id_periode);
            const hasilRanking = await waspasModel.getHasilRanking(periode.id_periode);
            const terkunci = await cekTerkunci(periode.id_periode);

            // Detail tahapan dihitung ulang dari data saat ini (tidak disimpan di database).
            let detailPerhitungan = null;

            if (hasilRanking.length > 0 && cekData.totalBobot > 0) {
                try {
                    const siswaData = await waspasModel.getSiswaWithNilai(periode.id_periode);
                    const kriteriaList = await waspasModel.getKriteria(periode.id_periode);
                    const bobotList = await waspasModel.getBobot(periode.id_periode);

                    if (siswaData.length > 0 && kriteriaList.length > 0 && bobotList.length > 0) {
                        detailPerhitungan = hitungWASPAS(siswaData, kriteriaList, bobotList);
                    }
                } catch (detailError) {
                    console.error('Gagal membangun detail perhitungan WASPAS:', detailError);
                    detailPerhitungan = null;
                }
            }

            return res.render('admin/waspas', {
                user: req.session.user,
                activePage: 'waspas',
                pageTitle: 'Perhitungan WASPAS',
                hasilRanking,
                cekData,
                kuota: periode.kuota_kelas_digital,
                detailPerhitungan,
                success: req.query.success || null,
                error: req.query.error || null,
                terkunci
            });
        } catch (error) {
            console.error(error);
            return res.status(500).send('Terjadi kesalahan mengambil data WASPAS.');
        }
    },

    // POST /admin/waspas/hitung
    async hitung(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return redirectError(res, !periode ? 'Belum ada periode seleksi aktif.' : pesanBelumMulai(periode));
            }

            if (await cekTerkunci(periode.id_periode)) {
                return redirectError(res, 'Perhitungan terkunci karena hasil seleksi sudah difinalisasi.');
            }

            const cekData = await waspasModel.checkDataLengkap(periode.id_periode);

            if (cekData.totalBobot === 0) {
                return redirectError(res, 'Bobot kriteria belum dihitung. Lakukan perhitungan FUCOM terlebih dahulu.');
            }

            if (cekData.totalSiswa === 0) {
                return redirectError(res, 'Belum ada siswa yang berminat mengikuti seleksi.');
            }

            if (cekData.totalSiswa <= periode.kuota_kelas_digital) {
                return redirectError(
                    res,
                    `Jumlah siswa berminat (${cekData.totalSiswa}) harus lebih banyak dari kuota (${periode.kuota_kelas_digital}).`
                );
            }

            if (!cekData.bisaHitung) {
                return redirectError(
                    res,
                    'Perhitungan tidak dapat dijalankan. Pastikan bobot kriteria tersedia dan seluruh siswa berminat memiliki nilai lengkap.'
                );
            }

            const siswaData = await waspasModel.getSiswaWithNilai(periode.id_periode);
            const kriteriaList = await waspasModel.getKriteria(periode.id_periode);
            const bobotList = await waspasModel.getBobot(periode.id_periode);

            const detail = hitungWASPAS(siswaData, kriteriaList, bobotList);
            const hasil = detail.hasil;

            await waspasModel.saveHasil(periode.id_periode, hasil, periode.kuota_kelas_digital);

            await userModel.logActivity(
                req.session.user.id_user,
                `Menghitung perangkingan WASPAS untuk ${hasil.length} siswa`
            );

            return res.redirect('/admin/waspas?success=' + encodeURIComponent('Perangkingan WASPAS berhasil dihitung.'));
        } catch (error) {
            if (error.message === 'PERIODE_FINAL') {
                return redirectError(res, 'Hasil seleksi sudah difinalisasi dan tidak dapat dihitung ulang.');
            }

            console.error(error);
            return redirectError(res, 'Terjadi kesalahan sistem: ' + error.message);
        }
    },

    // POST /admin/waspas/hapus
    async hapusHasil(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return redirectError(res, !periode ? 'Belum ada periode seleksi aktif.' : pesanBelumMulai(periode));
            }

            if (await cekTerkunci(periode.id_periode)) {
                return redirectError(res, 'Tidak dapat menghapus hasil karena sudah difinalisasi.');
            }

            await waspasModel.hapusHasil(periode.id_periode);
            await userModel.logActivity(req.session.user.id_user, 'Menghapus hasil perankingan WASPAS');

            return res.redirect(
                '/admin/waspas?success=' +
                encodeURIComponent('Hasil perankingan berhasil dihapus. Pembobotan kriteria kini dapat diubah kembali.')
            );
        } catch (error) {
            console.error(error);
            return redirectError(res, 'Terjadi kesalahan sistem.');
        }
    },

    // POST /admin/waspas/finalisasi
    async finalisasi(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return redirectError(res, !periode ? 'Belum ada periode seleksi aktif.' : pesanBelumMulai(periode));
            }

            const hasil = await waspasModel.finalisasi(periode.id_periode);

            if (!hasil.ok) {
                const PESAN = {
                    PERIODE_TIDAK_DITEMUKAN: 'Periode seleksi tidak ditemukan.',
                    SUDAH_FINAL: 'Hasil seleksi sudah difinalisasi sebelumnya.',
                    TIDAK_ADA_HASIL: 'Belum ada hasil perankingan. Jalankan perhitungan WASPAS terlebih dahulu.',
                    HASIL_USANG: 'Hasil perankingan tidak sesuai dengan data siswa terbaru. Hitung ulang WASPAS sebelum finalisasi.'
                };

                return redirectError(res, PESAN[hasil.alasan] || 'Finalisasi gagal.');
            }

            await userModel.logActivity(
                req.session.user.id_user,
                `Memfinalisasi hasil seleksi (${hasil.jumlah} siswa diperingkat)`
            );

            return res.redirect(
                '/admin/waspas?success=' +
                encodeURIComponent('Hasil seleksi berhasil difinalisasi. Seluruh data kini terkunci dan siswa dapat melihat pengumuman.')
            );
        } catch (error) {
            console.error(error);
            return redirectError(res, 'Terjadi kesalahan sistem saat finalisasi.');
        }
    }
};

module.exports = waspasController;