const siswaModel = require('../models/siswaModel');
const userModel = require('../models/userModel');
const xlsx = require('xlsx');
const fs = require('fs');
const { generateTemplateSiswa } = require('../utils/templateGenerator');
const { cekTerkunci } = require('../utils/lockHelper');
const { isPeriodeSudahMulai, pesanBelumMulai } = require('../utils/periodeHelper');
const waspasModel = require('../models/waspasModel');

const REGEX_ANGKA_SAJA = /^[0-9]+$/;
// Untuk nama & pekerjaan: huruf saja (boleh spasi antar kata)
const REGEX_HURUF_SAJA = /^[A-Za-zÀ-ÖØ-öø-ÿ]+( [A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;
// Untuk sekolah asal: huruf DAN angka (contoh: "SMPN 1 Padang", "SMPN 27 Padang")
const REGEX_SEKOLAH = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9]+( [A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*$/;

function validasiDataSiswa(data) {
    const { nisn, nama, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu } = data;
    if (!nisn || !REGEX_ANGKA_SAJA.test(String(nisn).trim())) return 'NISN wajib diisi dan hanya boleh berisi angka.';
    if (!nama || !REGEX_HURUF_SAJA.test(String(nama).trim())) return 'Nama wajib diisi dan hanya boleh berisi huruf.';
    if (!sekolah_asal || !REGEX_SEKOLAH.test(String(sekolah_asal).trim())) return 'Sekolah asal wajib diisi (huruf dan angka diperbolehkan, contoh: SMPN 1 Padang).';
    if (!pekerjaan_ayah || !REGEX_HURUF_SAJA.test(String(pekerjaan_ayah).trim())) return 'Pekerjaan ayah wajib diisi dan hanya boleh berisi huruf.';
    if (!pekerjaan_ibu || !REGEX_HURUF_SAJA.test(String(pekerjaan_ibu).trim())) return 'Pekerjaan ibu wajib diisi dan hanya boleh berisi huruf.';
    return null;
}

// Mengecek satu baris hasil import Excel dan mengembalikan daftar alasan gagal per kolom.
// Return null jika baris valid.
function getAlasanGagalBarisSiswa(row) {
    const alasan = [];

    if (!row.nisn) {
        alasan.push('kolom NISN kosong');
    } else if (!REGEX_ANGKA_SAJA.test(row.nisn)) {
        alasan.push(`kolom NISN "${row.nisn}" harus berupa angka`);
    }

    if (!row.nama) {
        alasan.push('kolom NAMA SISWA kosong');
    } else if (!REGEX_HURUF_SAJA.test(row.nama)) {
        alasan.push(`kolom NAMA SISWA "${row.nama}" harus berupa huruf`);
    }

    if (!row.sekolah_asal) {
        alasan.push('kolom ASAL SEKOLAH kosong');
    } else if (!REGEX_SEKOLAH.test(row.sekolah_asal)) {
        alasan.push(`kolom ASAL SEKOLAH "${row.sekolah_asal}" formatnya tidak valid`);
    }

    if (!row.pekerjaan_ayah) {
        alasan.push('kolom PEKERJAAAN AYAH kosong');
    } else if (!REGEX_HURUF_SAJA.test(row.pekerjaan_ayah)) {
        alasan.push(`kolom PEKERJAAAN AYAH "${row.pekerjaan_ayah}" harus berupa huruf`);
    }

    if (!row.pekerjaan_ibu) {
        alasan.push('kolom PEKERJAAN IBU kosong');
    } else if (!REGEX_HURUF_SAJA.test(row.pekerjaan_ibu)) {
        alasan.push(`kolom PEKERJAAN IBU "${row.pekerjaan_ibu}" harus berupa huruf`);
    }

    return alasan.length > 0 ? alasan : null;
}

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

        if (!jenis_kelamin) {
            return res.redirect('/admin/siswa?error=' + encodeURIComponent('Semua data siswa wajib diisi lengkap (NISN, nama, jenis kelamin, sekolah asal, pekerjaan ayah, pekerjaan ibu).'));
        }

        const pesanValidasi = validasiDataSiswa({ nisn, nama, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu });
        if (pesanValidasi) {
            return res.redirect('/admin/siswa?error=' + encodeURIComponent(pesanValidasi));
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

            if (!jenis_kelamin) {
                return res.redirect('/admin/siswa?error=' + encodeURIComponent('Semua data siswa wajib diisi lengkap (NISN, nama, jenis kelamin, sekolah asal, pekerjaan ayah, pekerjaan ibu).'));
            }

            const pesanValidasi = validasiDataSiswa({ nisn, nama, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu });
            if (pesanValidasi) {
                return res.redirect('/admin/siswa?error=' + encodeURIComponent(pesanValidasi));
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

            if (!siswa) {
                return res.redirect('/admin/siswa?error=Siswa tidak ditemukan.');
            }

            const periode = await siswaModel.getActivePeriode();

            if (periode && await cekTerkunci(periode.id_periode)) {
                return res.redirect(
                    '/admin/siswa?error=' +
                    encodeURIComponent('Data siswa terkunci karena status siswa telah final.')
                );
            }

            if (
                siswa.status_penerimaan === 'lulus' ||
                siswa.status_penerimaan === 'mengundurkan_diri'
            ) {
                return res.redirect(
                    '/admin/siswa?error=' +
                    encodeURIComponent(
                        'Siswa ini tidak dapat dihapus karena statusnya sudah final (Lulus/Mengundurkan Diri).'
                    )
                );
            }

            await siswaModel.deleteSiswa(id_siswa);

            await userModel.logActivity(
                req.session.user.id_user,
                `Admin menghapus data siswa: ${siswa.nama}`
            );

            if (periode) {
                await waspasModel.invalidateHasilJikaAda(periode.id_periode);
            }

            res.redirect('/admin/siswa?success=Data siswa berhasil dihapus.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/siswa?error=Terjadi kesalahan sistem.');
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
            // Baris Excel = index array + 2 (baris 1 = header, data mulai baris 2)
            const dataSiswaRaw = jsonData.map((row, idx) => ({
                baris: idx + 2,
                nisn: String(row['NISN'] || row['nisn'] || '').trim(),
                nama: String(row['NAMA SISWA'] || row['nama'] || '').trim(),
                jenis_kelamin: (row['JENIS KELAMIN SISWA'] || row['jenis_kelamin'] || '').toString().toUpperCase().startsWith('L') ? 'L' : 'P',
                sekolah_asal: String(row['ASAL SEKOLAH'] || row['sekolah_asal'] || '').trim(),
                pekerjaan_ayah: String(row['PEKERJAAAN AYAH'] || row['pekerjaan_ayah'] || '').trim(),
                pekerjaan_ibu: String(row['PEKERJAAN IBU'] || row['pekerjaan_ibu'] || '').trim(),
                status_pip_pkh: String(row['APAKAH ANANDA PENERIMA PIP / PKH'] || '').toUpperCase() === 'YA'
            }));

            const dataSiswa = [];
            const dataTidakLengkap = [];

            dataSiswaRaw.forEach(row => {
                const alasan = getAlasanGagalBarisSiswa(row);
                if (alasan) {
                    dataTidakLengkap.push({
                        baris: row.baris,
                        nisn: row.nisn || '(kosong)',
                        alasan
                    });
                } else {
                    dataSiswa.push(row);
                }
            });

            fs.unlinkSync(req.file.path); // hapus file sementara setelah dibaca

            const formatDetailFormat = (list, batas) => {
                const dipotong = list.slice(0, batas);
                const teks = dipotong
                    .map(d => `Baris ${d.baris} (NISN ${d.nisn}): ${d.alasan.join('; ')}`)
                    .join(' || ');
                const sisa = list.length - dipotong.length;
                return sisa > 0 ? `${teks} || dan ${sisa} baris lainnya` : teks;
            };

            if (dataSiswa.length === 0) {
                let pesanGagalTotal = 'Tidak ada data valid ditemukan di file Excel.';
                if (dataTidakLengkap.length > 0) {
                    pesanGagalTotal += ' Rincian: ' + formatDetailFormat(dataTidakLengkap, 10);
                }
                return res.redirect('/admin/siswa?error=' + encodeURIComponent(pesanGagalTotal));
            }

            const hasil = await siswaModel.bulkInsert(dataSiswa, periode.id_periode);
            await userModel.logActivity(req.session.user.id_user, `Admin mengimpor ${hasil.berhasil} data siswa dari Excel`);
            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            let pesan = `Import selesai: ${hasil.berhasil} berhasil, ${hasil.gagal} gagal.`;

            if (dataTidakLengkap.length > 0) {
                pesan += ` ${dataTidakLengkap.length} baris dilewati karena format tidak sesuai: ${formatDetailFormat(dataTidakLengkap, 10)}`;
            }

            if (hasil.pesanGagal && hasil.pesanGagal.length > 0) {
                const batas = 10;
                const dipotong = hasil.pesanGagal.slice(0, batas);
                const sisa = hasil.pesanGagal.length - dipotong.length;
                pesan += ` Gagal disimpan ke database: ${dipotong.join(' || ')}`;
                if (sisa > 0) pesan += ` || dan ${sisa} baris lainnya`;
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