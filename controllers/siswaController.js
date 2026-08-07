const siswaModel = require('../models/siswaModel');
const userModel = require('../models/userModel');
const xlsx = require('xlsx');
const fs = require('fs');
const { generateTemplateSiswa } = require('../utils/templateGenerator');
const { cekTerkunci } = require('../utils/lockHelper');
const { isPeriodeSudahMulai, pesanBelumMulai } = require('../utils/periodeHelper');
const waspasModel = require('../models/waspasModel');



const siswaController = {
    async index(req, res) {
        try {
            const periode = await siswaModel.getActivePeriode();
            if (!periode || !isPeriodeSudahMulai(periode)) {
                return res.render('admin/siswa', {
                    user: req.session.user, siswaList: [], terkunci: false, activePage: 'siswa',
                    pageTitle: 'Data Siswa', success: null,
                    error: !periode
                        ? 'Belum ada periode seleksi aktif. Silakan hubungi Super Admin untuk membuat periode terlebih dahulu.'
                        : pesanBelumMulai(periode)
                });
            }
            const siswaList = await siswaModel.getAllSiswa(periode.id_periode);
            const terkunci = await cekTerkunci(periode.id_periode);

            res.render('admin/siswa', {
                user: req.session.user, siswaList, terkunci, activePage: 'siswa',
                pageTitle: 'Data Siswa',
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data siswa.');
        }
    },



    async create(req, res) {
    try {
        const periode = await siswaModel.getActivePeriode();
        if (!periode || !isPeriodeSudahMulai(periode)) {
            return res.redirect('/admin/siswa?error=' + encodeURIComponent(!periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode)));
        }

        if (await cekTerkunci(periode.id_periode)) {
            return res.redirect('/admin/siswa?error=' + encodeURIComponent('Data siswa terkunci karena status siswa telah final.'));
        }

        const bobotTersedia = await waspasModel.checkBobotTersedia(periode.id_periode);
        if (!bobotTersedia) {
            return res.redirect('/admin/siswa?error=' + encodeURIComponent('Belum bisa menambah siswa. Hitung bobot kriteria (FUCOM) terlebih dahulu di menu Pembobotan Kriteria.'));
        }

        const { nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh } = req.body;

        if (!nisn || !nama || !jenis_kelamin || !sekolah_asal || !pekerjaan_ayah || !pekerjaan_ibu) {
            return res.redirect('/admin/siswa?error=' + encodeURIComponent('Semua data siswa wajib diisi lengkap (NISN, nama, jenis kelamin, sekolah asal, pekerjaan ayah, pekerjaan ibu).'));
        }

        const exists = await siswaModel.checkNisnExists(nisn, periode.id_periode);
        if (exists) return res.redirect('/admin/siswa?error=NISN sudah terdaftar di periode ini.');

        try {
            await siswaModel.createSiswa({
                id_periode: periode.id_periode,
                nisn,
                nama,
                jenis_kelamin,
                sekolah_asal,
                pekerjaan_ayah,
                pekerjaan_ibu,
                status_pip_pkh: status_pip_pkh === 'ya'
            });
        } catch (dupErr) {
            if (dupErr.message.includes('sudah terdaftar')) {
                return res.redirect('/admin/siswa?error=' + encodeURIComponent(dupErr.message));
            }
            throw dupErr;
        }

        await userModel.logActivity(req.session.user.id_user, `Admin menambahkan data siswa: ${nama}`);
        await waspasModel.invalidateHasilJikaAda(periode.id_periode);
        res.redirect('/admin/siswa?success=Data siswa berhasil ditambahkan.');
    } catch (error) {
        console.error(error);
        res.redirect('/admin/siswa?error=Terjadi kesalahan sistem.');
    }
},

   async update(req, res) {
        try {
            const { id_siswa, nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh } = req.body;
            const periode = await siswaModel.getActivePeriode();

            if (!nisn || !nama || !jenis_kelamin || !sekolah_asal || !pekerjaan_ayah || !pekerjaan_ibu) {
                return res.redirect('/admin/siswa?error=' + encodeURIComponent('Semua data siswa wajib diisi lengkap (NISN, nama, jenis kelamin, sekolah asal, pekerjaan ayah, pekerjaan ibu).'));
            }

            if (await cekTerkunci(periode.id_periode)) {
                return res.redirect('/admin/siswa?error=' + encodeURIComponent('Data siswa terkunci karena status siswa telah final.'));
            }

            const exists = await siswaModel.checkNisnExists(nisn, periode.id_periode, id_siswa);
            if (exists) {
                return res.redirect('/admin/siswa?error=NISN tersebut sudah digunakan oleh siswa lain. Periksa kembali data yang diinput.');
            }

            await siswaModel.updateSiswa(id_siswa, {
                nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu,
                status_pip_pkh: status_pip_pkh === 'ya'
            });
            await userModel.logActivity(req.session.user.id_user, `Admin memperbarui data siswa: ${nama}`);
            await waspasModel.invalidateHasilJikaAda(periode.id_periode);
            res.redirect('/admin/siswa?success=Data siswa berhasil diperbarui.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/siswa?error=Terjadi kesalahan sistem.');
        }
    },

async delete(req, res) {
        try {
            const { id_siswa } = req.params;
            const siswa = await siswaModel.getSiswaById(id_siswa);
            const periode = await siswaModel.getActivePeriode();

            if (periode && await cekTerkunci(periode.id_periode)) {
                return res.redirect('/admin/siswa?error=' + encodeURIComponent('Data siswa terkunci karena status siswa telah final.'));
            }

            const punyaHasil = await siswaModel.checkPunyaHasilRanking(id_siswa);
            if (punyaHasil) {
                return res.redirect('/admin/siswa?error=Siswa ini tidak dapat dihapus karena sudah termasuk dalam hasil perankingan. Hapus hasil perankingan terlebih dahulu di menu Perankingan jika ingin menghapus siswa ini.');
            }

            await siswaModel.deleteSiswa(id_siswa);
            await userModel.logActivity(req.session.user.id_user, `Admin menghapus data siswa: ${siswa ? siswa.nama : id_siswa}`);
            if (periode) await waspasModel.invalidateHasilJikaAda(periode.id_periode);
            res.redirect('/admin/siswa?success=Data siswa berhasil dihapus.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/siswa?error=Terjadi kesalahan sistem. Pastikan siswa ini belum memiliki nilai/hasil terkait.');
        }
    },

     async downloadTemplate(req, res) {
        try {
            await generateTemplateSiswa(res);
        } catch (error) {
            console.error(error);
            res.status(500).send('Gagal membuat template.');
        }
    },

    async importExcel(req, res) {
        try {
            if (!req.file) return res.redirect('/admin/siswa?error=Silakan pilih file Excel terlebih dahulu.');

            const periode = await siswaModel.getActivePeriode();
            if (!periode || !isPeriodeSudahMulai(periode)) {
                fs.unlinkSync(req.file.path);
                return res.redirect('/admin/siswa?error=' + encodeURIComponent(!periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode)));
            }

            if (await cekTerkunci(periode.id_periode)) {
                fs.unlinkSync(req.file.path);
                return res.redirect('/admin/siswa?error=' + encodeURIComponent('Data siswa terkunci karena status siswa telah final.'));
            }

            const bobotTersedia = await waspasModel.checkBobotTersedia(periode.id_periode);
            if (!bobotTersedia) {
                fs.unlinkSync(req.file.path);
                return res.redirect('/admin/siswa?error=' + encodeURIComponent('Belum bisa mengimpor siswa. Hitung bobot kriteria (FUCOM) terlebih dahulu di menu Pembobotan Kriteria.'));
            }

            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(sheet);

            // Mapping kolom Excel ke format yang dibutuhkan sistem
            // Sesuaikan nama kolom di sini dengan header asli file Excel PPDB kamu
            const dataSiswaRaw = jsonData.map(row => ({
                nisn: String(row['NISN'] || row['nisn'] || '').trim(),
                nama: String(row['NAMA SISWA'] || row['nama'] || '').trim(),
                jenis_kelamin: (row['JENIS KELAMIN SISWA'] || row['jenis_kelamin'] || '').toString().toUpperCase().startsWith('L') ? 'L' : 'P',
                sekolah_asal: String(row['ASAL SEKOLAH'] || row['sekolah_asal'] || '').trim(),
                pekerjaan_ayah: String(row['PEKERJAAAN AYAH'] || row['pekerjaan_ayah'] || '').trim(),
                pekerjaan_ibu: String(row['PEKERJAAN IBU'] || row['pekerjaan_ibu'] || '').trim(),
                status_pip_pkh: String(row['APAKAH ANANDA PENERIMA PIP / PKH'] || '').toUpperCase() === 'YA'
            }));

            const dataSiswa = dataSiswaRaw.filter(row =>
                row.nisn && row.nama && row.sekolah_asal && row.pekerjaan_ayah && row.pekerjaan_ibu
            );
            const dataTidakLengkap = dataSiswaRaw.filter(row =>
                !(row.nisn && row.nama && row.sekolah_asal && row.pekerjaan_ayah && row.pekerjaan_ibu)
            );

            fs.unlinkSync(req.file.path); // hapus file sementara setelah dibaca

            if (dataSiswa.length === 0) {
                return res.redirect('/admin/siswa?error=Tidak ada data valid ditemukan di file Excel. Periksa kembali format kolom, dan pastikan semua kolom terisi.');
            }

            const hasil = await siswaModel.bulkInsert(dataSiswa, periode.id_periode);
            await userModel.logActivity(req.session.user.id_user, `Admin mengimpor ${hasil.berhasil} data siswa dari Excel`);
            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            let pesan = `Import selesai: ${hasil.berhasil} berhasil, ${hasil.gagal} gagal.`;
            if (dataTidakLengkap.length > 0) {
                pesan += ` ${dataTidakLengkap.length} baris dilewati karena ada kolom yang kosong.`;
            }
            res.redirect(`/admin/siswa?success=${encodeURIComponent(pesan)}`);
        } catch (error) {
            console.error(error);
            if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.redirect('/admin/siswa?error=Gagal membaca file Excel. Pastikan format file sesuai template.');
        }
    }
};

module.exports = siswaController;