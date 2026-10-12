const siswaModel = require('../models/siswaModel');
const userModel = require('../models/userModel');
const periodeModel = require('../models/periodeModel');
const akunSiswaModel = require('../models/akunSiswaModel');
const waspasModel = require('../models/waspasModel');
const xlsx = require('xlsx');
const fs = require('fs');
const { generateTemplateSiswa } = require('../utils/templateGenerator');
const { cekTerkunci } = require('../utils/lockHelper');
const { isPeriodeSudahMulai, pesanBelumMulai } = require('../utils/periodeHelper');

const REGEX_ANGKA_SAJA = /^[0-9]+$/;
// Untuk nama & pekerjaan: huruf saja (boleh spasi antar kata)
const REGEX_HURUF_SAJA = /^[A-Za-zÀ-ÖØ-öø-ÿ]+( [A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;
// Untuk sekolah asal: huruf DAN angka (contoh: "SMPN 1 Padang")
const REGEX_SEKOLAH = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9]+( [A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*$/;

const redirectError = (res, pesan) =>
    res.redirect('/admin/siswa?error=' + encodeURIComponent(pesan));

const redirectSuccess = (res, pesan) =>
    res.redirect('/admin/siswa?success=' + encodeURIComponent(pesan));

function hapusFileUpload(req) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* abaikan */ }
    }
}

function validasiDataSiswa(data) {
    const { nisn, nama, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu } = data;

    if (!nisn || !REGEX_ANGKA_SAJA.test(String(nisn).trim())) return 'NISN wajib diisi dan hanya boleh berisi angka.';
    if (!nama || !REGEX_HURUF_SAJA.test(String(nama).trim())) return 'Nama wajib diisi dan hanya boleh berisi huruf.';
    if (!sekolah_asal || !REGEX_SEKOLAH.test(String(sekolah_asal).trim())) return 'Sekolah asal wajib diisi (huruf dan angka diperbolehkan, contoh: SMPN 1 Padang).';
    if (!pekerjaan_ayah || !REGEX_HURUF_SAJA.test(String(pekerjaan_ayah).trim())) return 'Pekerjaan ayah wajib diisi dan hanya boleh berisi huruf.';
    if (!pekerjaan_ibu || !REGEX_HURUF_SAJA.test(String(pekerjaan_ibu).trim())) return 'Pekerjaan ibu wajib diisi dan hanya boleh berisi huruf.';

    return null;
}

// Mengecek satu baris hasil import Excel dan mengembalikan daftar alasan gagal.
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
        alasan.push('kolom PEKERJAAN AYAH kosong');
    } else if (!REGEX_HURUF_SAJA.test(row.pekerjaan_ayah)) {
        alasan.push(`kolom PEKERJAAN AYAH "${row.pekerjaan_ayah}" harus berupa huruf`);
    }

    if (!row.pekerjaan_ibu) {
        alasan.push('kolom PEKERJAAN IBU kosong');
    } else if (!REGEX_HURUF_SAJA.test(row.pekerjaan_ibu)) {
        alasan.push(`kolom PEKERJAAN IBU "${row.pekerjaan_ibu}" harus berupa huruf`);
    }

    return alasan.length > 0 ? alasan : null;
}

const PESAN_UBAH_MINAT = {
    STATUS_TIDAK_VALID: 'Status minat tidak valid.',
    PERIODE_FINAL: 'Hasil seleksi sudah difinalisasi. Status minat tidak dapat diubah.',
    SISWA_TIDAK_DITEMUKAN: 'Siswa tidak ditemukan pada periode aktif.',
    TANPA_AKUN: 'Siswa ini belum punya akun. Buat akun siswa terlebih dahulu.',
    SUDAH_MERESPONS: 'Status minat hanya dapat diubah jika siswa masih "Belum merespons".'
};

const siswaController = {

    // GET /admin/siswa
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            const dasar = {
                user: req.session.user,
                activePage: 'siswa',
                pageTitle: 'Data Siswa',
                filterAwal: req.query.filter || ''
            };

            // app.js memindahkan flash dari session ke res.locals, jadi cek keduanya.
            const akunSiswaFlash =
                res.locals.akunSiswaFlash ||
                req.session.akunSiswaFlash ||
                null;

            delete req.session.akunSiswaFlash;

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return res.render('admin/siswa', {
                    ...dasar,
                    siswaList: [],
                    ringkasan: null,
                    terkunci: false,
                    akunSiswaFlash,
                    success: null,
                    error: !periode ? 'Belum ada periode seleksi aktif.' : pesanBelumMulai(periode)
                });
            }

            const siswaList = await siswaModel.getAllWithAkun(periode.id_periode);
            const ringkasan = await akunSiswaModel.ringkasan(periode.id_periode);
            const terkunci = await cekTerkunci(periode.id_periode);

            return res.render('admin/siswa', {
                ...dasar,
                siswaList,
                ringkasan,
                terkunci,
                akunSiswaFlash,
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error('ERROR HALAMAN SISWA:', error);
            return res.status(500).send('Terjadi kesalahan mengambil data siswa.');
        }
    },

    // POST /admin/siswa/create
    // Akun siswa TIDAK dibuat otomatis; operator membuatnya lewat tombol "Buat Akun Siswa".
    async create(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return redirectError(res, !periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode));
            }

            if (await cekTerkunci(periode.id_periode)) {
                return redirectError(res, 'Data siswa terkunci karena hasil seleksi telah difinalisasi.');
            }

            if (!(await waspasModel.checkBobotTersedia(periode.id_periode))) {
                return redirectError(
                    res,
                    'Belum bisa menambah siswa. Hitung bobot kriteria (FUCOM) terlebih dahulu di menu Pembobotan Kriteria.'
                );
            }

            const { nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh } = req.body;

            if (!jenis_kelamin) {
                return redirectError(
                    res,
                    'Semua data siswa wajib diisi lengkap (NISN, nama, jenis kelamin, sekolah asal, pekerjaan ayah, pekerjaan ibu).'
                );
            }

            const pesanValidasi = validasiDataSiswa({ nisn, nama, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu });
            if (pesanValidasi) return redirectError(res, pesanValidasi);

            const nisnBersih = String(nisn).trim();

            if (await siswaModel.checkNisnExists(nisnBersih, periode.id_periode)) {
                return redirectError(res, 'NISN sudah terdaftar di periode ini.');
            }

            try {
                await siswaModel.createSiswa({
                    id_periode: periode.id_periode,
                    nisn: nisnBersih,
                    nama: String(nama).trim(),
                    jenis_kelamin,
                    sekolah_asal: String(sekolah_asal).trim(),
                    pekerjaan_ayah: String(pekerjaan_ayah).trim(),
                    pekerjaan_ibu: String(pekerjaan_ibu).trim(),
                    status_pip_pkh: status_pip_pkh === 'ya'
                });
            } catch (dupErr) {
                if (dupErr.message && dupErr.message.includes('sudah terdaftar')) {
                    return redirectError(res, dupErr.message);
                }
                throw dupErr;
            }

            await userModel.logActivity(req.session.user.id_user, `Admin menambahkan data siswa: ${nama}`);
            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            return redirectSuccess(res, 'Data siswa berhasil ditambahkan. Klik "Buat Akun Siswa" untuk membuat akunnya.');
        } catch (error) {
            console.error('ERROR TAMBAH SISWA:', error);
            return redirectError(res, 'Terjadi kesalahan sistem.');
        }
    },

    // POST /admin/siswa/update
    async update(req, res) {
        try {
            const { id_siswa, nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh } = req.body;

            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return redirectError(res, !periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode));
            }

            if (await cekTerkunci(periode.id_periode)) {
                return redirectError(res, 'Data siswa terkunci karena hasil seleksi telah difinalisasi.');
            }

            if (!jenis_kelamin) {
                return redirectError(
                    res,
                    'Semua data siswa wajib diisi lengkap (NISN, nama, jenis kelamin, sekolah asal, pekerjaan ayah, pekerjaan ibu).'
                );
            }

            const pesanValidasi = validasiDataSiswa({ nisn, nama, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu });
            if (pesanValidasi) return redirectError(res, pesanValidasi);

            // Siswa harus ada dan milik periode aktif.
            const siswa = await siswaModel.getSiswaById(id_siswa);

            if (!siswa || Number(siswa.id_periode) !== Number(periode.id_periode)) {
                return redirectError(res, 'Siswa tidak ditemukan pada periode aktif.');
            }

            const nisnBersih = String(nisn).trim();

            if (await siswaModel.checkNisnExists(nisnBersih, periode.id_periode, id_siswa)) {
                return redirectError(res, 'NISN tersebut sudah digunakan oleh siswa lain. Periksa kembali data yang diinput.');
            }

            await siswaModel.updateSiswa(id_siswa, {
                nisn: nisnBersih,
                nama: String(nama).trim(),
                jenis_kelamin,
                sekolah_asal: String(sekolah_asal).trim(),
                pekerjaan_ayah: String(pekerjaan_ayah).trim(),
                pekerjaan_ibu: String(pekerjaan_ibu).trim(),
                status_pip_pkh: status_pip_pkh === 'ya'
            });

            // Username akun siswa = NISN, jadi ikut disamakan jika NISN berubah.
            if (siswa.nisn !== nisnBersih) {
                const db = require('../config/database');
                await db.query(
                    'UPDATE akun_siswa SET username = ? WHERE id_siswa = ?',
                    [nisnBersih, id_siswa]
                );
            }

            await userModel.logActivity(req.session.user.id_user, `Admin memperbarui data siswa: ${nama}`);
            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            return redirectSuccess(res, 'Data siswa berhasil diperbarui.');
        } catch (error) {
            console.error('ERROR UPDATE SISWA:', error);
            return redirectError(res, 'Terjadi kesalahan sistem.');
        }
    },

    // POST /admin/siswa/minat
    // Operator mengubah status minat. Hanya untuk siswa yang masih "Belum merespons".
    async ubahMinat(req, res) {
        try {
            const { id_siswa, status_minat } = req.body;

            if (!id_siswa || !['berminat', 'tidak_berminat'].includes(status_minat)) {
                return redirectError(res, 'Data perubahan status minat tidak valid.');
            }

            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return redirectError(res, !periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode));
            }

            if (await cekTerkunci(periode.id_periode)) {
                return redirectError(res, PESAN_UBAH_MINAT.PERIODE_FINAL);
            }

            const siswa = await siswaModel.getSiswaById(id_siswa);

            if (!siswa || Number(siswa.id_periode) !== Number(periode.id_periode)) {
                return redirectError(res, PESAN_UBAH_MINAT.SISWA_TIDAK_DITEMUKAN);
            }

            const hasil = await siswaModel.setMinatOlehOperator(
                id_siswa,
                periode.id_periode,
                status_minat
            );

            if (!hasil.ok) {
                return redirectError(res, PESAN_UBAH_MINAT[hasil.alasan] || 'Status minat gagal diubah.');
            }

            const labelStatus = status_minat === 'berminat' ? 'Berminat' : 'Tidak berminat';

            await userModel.logActivity(
                req.session.user.id_user,
                `Operator mengubah status minat siswa ${siswa.nama} menjadi ${labelStatus}`
            );

            // Mengubah peserta seleksi mempengaruhi ranking.
            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            return redirectSuccess(
                res,
                `Status minat ${siswa.nama} diubah menjadi "${labelStatus}".` +
                (status_minat === 'tidak_berminat' ? ' Akun siswa dinonaktifkan.' : '')
            );
        } catch (error) {
            console.error('ERROR UBAH MINAT SISWA:', error);
            return redirectError(res, 'Terjadi kesalahan sistem.');
        }
    },

    // POST /admin/siswa/delete/:id_siswa
    async delete(req, res) {
        try {
            const { id_siswa } = req.params;

            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return redirectError(res, !periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode));
            }

            if (await cekTerkunci(periode.id_periode)) {
                return redirectError(res, 'Data siswa terkunci karena hasil seleksi telah difinalisasi.');
            }

            const siswa = await siswaModel.getSiswaById(id_siswa);

            if (!siswa || Number(siswa.id_periode) !== Number(periode.id_periode)) {
                return redirectError(res, 'Siswa tidak ditemukan pada periode aktif.');
            }

            await siswaModel.deleteSiswa(id_siswa);

            await userModel.logActivity(req.session.user.id_user, `Admin menghapus data siswa: ${siswa.nama}`);
            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            return redirectSuccess(res, 'Data siswa berhasil dihapus.');
        } catch (error) {
            console.error('ERROR HAPUS SISWA:', error);
            return redirectError(res, 'Terjadi kesalahan sistem.');
        }
    },

    // GET /admin/siswa/template
    async downloadTemplate(req, res) {
        try {
            await generateTemplateSiswa(res);
        } catch (error) {
            console.error(error);
            if (!res.headersSent) res.status(500).send('Gagal membuat template.');
        }
    },

    // POST /admin/siswa/import
    // Akun siswa TIDAK dibuat otomatis; operator membuatnya lewat tombol "Buat Akun Siswa".
    async importExcel(req, res) {
        try {
            if (!req.file) {
                return redirectError(res, 'Silakan pilih file Excel terlebih dahulu.');
            }

            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                hapusFileUpload(req);
                return redirectError(res, !periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode));
            }

            if (await cekTerkunci(periode.id_periode)) {
                hapusFileUpload(req);
                return redirectError(res, 'Data siswa terkunci karena hasil seleksi telah difinalisasi.');
            }

            if (!(await waspasModel.checkBobotTersedia(periode.id_periode))) {
                hapusFileUpload(req);
                return redirectError(
                    res,
                    'Belum bisa mengimpor siswa. Hitung bobot kriteria (FUCOM) terlebih dahulu di menu Pembobotan Kriteria.'
                );
            }

            const workbook = xlsx.readFile(req.file.path);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = xlsx.utils.sheet_to_json(sheet);

            hapusFileUpload(req);

            // Baris Excel = index + 2 (baris 1 = header).
            const dataSiswaRaw = jsonData.map((row, idx) => ({
                baris: idx + 2,
                nisn: String(row['NISN'] || row['nisn'] || '').trim(),
                nama: String(row['NAMA SISWA'] || row['nama'] || '').trim(),
                jenis_kelamin: String(row['JENIS KELAMIN SISWA'] || row['jenis_kelamin'] || '')
                    .toUpperCase()
                    .startsWith('L') ? 'L' : 'P',
                sekolah_asal: String(row['ASAL SEKOLAH'] || row['sekolah_asal'] || '').trim(),
                pekerjaan_ayah: String(
                    row['PEKERJAAAN AYAH'] || row['PEKERJAAN AYAH'] || row['pekerjaan_ayah'] || ''
                ).trim(),
                pekerjaan_ibu: String(row['PEKERJAAN IBU'] || row['pekerjaan_ibu'] || '').trim(),
                status_pip_pkh: String(row['APAKAH ANANDA PENERIMA PIP / PKH'] || '').trim().toUpperCase() === 'YA'
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

                return redirectError(res, pesanGagalTotal);
            }

            const hasil = await siswaModel.bulkInsert(dataSiswa, periode.id_periode);

            await userModel.logActivity(req.session.user.id_user, `Admin mengimpor ${hasil.berhasil} data siswa dari Excel`);
            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            let pesan = `Import selesai: ${hasil.berhasil} berhasil, ${hasil.gagal} gagal.`;

            if (hasil.berhasil > 0) {
                pesan += ' Klik "Buat Akun Siswa" untuk membuat akun siswa yang baru.';
            }

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

            return redirectSuccess(res, pesan);
        } catch (error) {
            console.error('ERROR IMPORT SISWA:', error);
            hapusFileUpload(req);

            return redirectError(res, 'Gagal membaca file Excel. Pastikan format file sesuai template.');
        }
    }
};

module.exports = siswaController;