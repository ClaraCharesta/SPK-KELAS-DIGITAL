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
const { cekBobotFinal } = require('../utils/bobotHelper');

const REGEX_ANGKA_SAJA = /^[0-9]+$/;
// Untuk nama & pekerjaan: huruf saja (boleh spasi antar kata)
const REGEX_HURUF_SAJA = /^[A-Za-zÀ-ÖØ-öø-ÿ]+( [A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;
// Untuk sekolah asal: huruf DAN angka (contoh: "SMPN 1 Padang")
const REGEX_SEKOLAH = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9]+( [A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*$/;

// NISN resmi terdiri dari 10 digit. Isi null jika ingin tidak membatasi panjang.
const PANJANG_NISN = 10;

// Nilai bawaan jika pekerjaan orang tua tidak diisi.
const PEKERJAAN_DEFAULT = 'Tidak bekerja';

const PESAN_SEKOLAH_TIDAK_VALID =
    'Sekolah asal hanya boleh SMP / MTs / SMPLB / Paket B (contoh: SMPN 1 Padang). Data SMA/SMK/MA tidak diterima.';

// ===== Jenjang sekolah asal =====
// Kata jenjang PERTAMA yang ditemukan di teks menentukan hasilnya,
// jadi "SMA Negeri 1" ditolak sedangkan "SMPN 3 Padang" diterima.
const JENJANG_DIIZINKAN = new Set([
    'SMP', 'SMPN', 'SMPS', 'SMPIT', 'SMPLB',
    'MTS', 'MTSN', 'MTSS',
    'PAKETB'
]);

const JENJANG_DITOLAK = new Set([
    'SMA', 'SMAN', 'SMAS', 'SMAIT', 'SMALB',
    'SMK', 'SMKN', 'SMKS',
    'MA', 'MAN', 'MAS', 'MAK',
    'SD', 'SDN', 'SDS', 'SDIT', 'SDLB',
    'MI', 'MIN', 'MIS',
    'PAKETA', 'PAKETC',
    'TK', 'PAUD'
]);

function sekolahAsalValid(teks) {
    let s = String(teks || '').toUpperCase().replace(/\s+/g, ' ').trim();

    // Gabungkan penulisan terpisah: "PAKET B" -> "PAKETB", "SMP LB" -> "SMPLB", dst.
    s = s
        .replace(/\bPAKET\s+([ABC])\b/g, 'PAKET$1')
        .replace(/\bSMP\s+LB\b/g, 'SMPLB')
        .replace(/\bSMA\s+LB\b/g, 'SMALB')
        .replace(/\bSD\s+LB\b/g, 'SDLB');

    for (const kata of s.split(' ')) {
        // Angka di belakang kata diabaikan: "SMPN1" -> "SMPN"
        const m = kata.match(/^([A-Z]+)\d*$/);
        if (!m) continue;

        if (JENJANG_DIIZINKAN.has(m[1])) return true;
        if (JENJANG_DITOLAK.has(m[1])) return false;
    }

    // Tidak ada kata jenjang yang dikenali -> tolak.
    return false;
}

// Rapikan spasi berlebih dan ubah null/undefined menjadi string kosong.
function rapikan(nilai) {
    return String(nilai === undefined || nilai === null ? '' : nilai).replace(/\s+/g, ' ').trim();
}

// Pekerjaan opsional: kosong -> "Tidak bekerja".
function pekerjaanAtauDefault(nilai) {
    return rapikan(nilai) || PEKERJAAN_DEFAULT;
}

const BATAS_MASSAL = 1000;

const PESAN_BOBOT_BELUM_FINAL =
    'Data siswa baru bisa diinput setelah pembobotan FUCOM selesai dan konsisten. ' +
    'Selesaikan dulu di menu Pembobotan Kriteria.';

// Pesan umum untuk aksi lain di halaman Data Siswa (edit, hapus, ubah minat, template).
const PESAN_BOBOT_BELUM_FINAL_AKSI =
    'Fitur Data Siswa baru bisa digunakan setelah pembobotan FUCOM selesai dan konsisten. ' +
    'Selesaikan dulu di menu Pembobotan Kriteria.';

const redirectError = (res, pesan) =>
    res.redirect('/admin/siswa?error=' + encodeURIComponent(pesan));

const redirectSuccess = (res, pesan) =>
    res.redirect('/admin/siswa?success=' + encodeURIComponent(pesan));

function hapusFileUpload(req) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* abaikan */ }
    }
}

// Validasi input manual (tambah / edit). Pekerjaan orang tua OPSIONAL.
function validasiDataSiswa(data) {
    const { nisn, nama, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu } = data;

    const nisnBersih = rapikan(nisn);
    const namaBersih = rapikan(nama);
    const sekolahBersih = rapikan(sekolah_asal);
    const ayahBersih = rapikan(pekerjaan_ayah);
    const ibuBersih = rapikan(pekerjaan_ibu);

    if (!nisnBersih || !REGEX_ANGKA_SAJA.test(nisnBersih)) return 'NISN wajib diisi dan hanya boleh berisi angka.';
    if (PANJANG_NISN && nisnBersih.length !== PANJANG_NISN) return `NISN harus tepat ${PANJANG_NISN} digit angka.`;
    if (!namaBersih || !REGEX_HURUF_SAJA.test(namaBersih)) return 'Nama wajib diisi dan hanya boleh berisi huruf.';
    if (!sekolahBersih || !REGEX_SEKOLAH.test(sekolahBersih)) return 'Sekolah asal wajib diisi (huruf dan angka diperbolehkan, contoh: SMPN 1 Padang).';
    if (!sekolahAsalValid(sekolahBersih)) return PESAN_SEKOLAH_TIDAK_VALID;

    // Pekerjaan opsional: hanya dicek formatnya jika diisi.
    if (ayahBersih && !REGEX_HURUF_SAJA.test(ayahBersih)) return 'Pekerjaan ayah hanya boleh berisi huruf (boleh dikosongkan).';
    if (ibuBersih && !REGEX_HURUF_SAJA.test(ibuBersih)) return 'Pekerjaan ibu hanya boleh berisi huruf (boleh dikosongkan).';

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
    } else if (PANJANG_NISN && row.nisn.length !== PANJANG_NISN) {
        alasan.push(`kolom NISN "${row.nisn}" harus ${PANJANG_NISN} digit (jika diawali angka 0, pastikan sel Excel berformat teks)`);
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
    } else if (!sekolahAsalValid(row.sekolah_asal)) {
        alasan.push(`kolom ASAL SEKOLAH "${row.sekolah_asal}" bukan SMP / MTs / SMPLB / Paket B`);
    }

    // Pekerjaan orang tua OPSIONAL: kosong diperbolehkan (otomatis "Tidak bekerja").
    if (row.pekerjaan_ayah && !REGEX_HURUF_SAJA.test(row.pekerjaan_ayah)) {
        alasan.push(`kolom PEKERJAAN AYAH "${row.pekerjaan_ayah}" harus berupa huruf`);
    }

    if (row.pekerjaan_ibu && !REGEX_HURUF_SAJA.test(row.pekerjaan_ibu)) {
        alasan.push(`kolom PEKERJAAN IBU "${row.pekerjaan_ibu}" harus berupa huruf`);
    }

    return alasan.length > 0 ? alasan : null;
}

const PESAN_UBAH_MINAT = {
    STATUS_TIDAK_VALID: 'Status minat tidak valid.',
    PERIODE_FINAL: 'Hasil seleksi sudah difinalisasi. Status minat tidak dapat diubah.',
    SISWA_TIDAK_DITEMUKAN: 'Siswa tidak ditemukan pada periode aktif.',
    TANPA_AKUN: 'Siswa ini belum punya akun. Buat akun siswa terlebih dahulu.',
    SUDAH_MERESPONS: 'Status minat hanya dapat diubah jika siswa masih "Belum merespons".',
    TIDAK_ADA_PILIHAN: 'Pilih minimal satu siswa.'
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
                    bobotFinal: false,
                    akunSiswaFlash,
                    success: null,
                    error: !periode ? 'Belum ada periode seleksi aktif.' : pesanBelumMulai(periode)
                });
            }

            const siswaList = await siswaModel.getAllWithAkun(periode.id_periode);
            const ringkasan = await akunSiswaModel.ringkasan(periode.id_periode);
            const terkunci = await cekTerkunci(periode.id_periode);
            const bobotFinal = await cekBobotFinal(periode.id_periode);

            return res.render('admin/siswa', {
                ...dasar,
                siswaList,
                ringkasan,
                terkunci,
                bobotFinal,
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
    // Hanya bisa jika bobot FUCOM sudah final dan konsisten.
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

            if (!(await cekBobotFinal(periode.id_periode))) {
                return redirectError(res, PESAN_BOBOT_BELUM_FINAL);
            }

            const { nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh } = req.body;

            if (!jenis_kelamin) {
                return redirectError(
                    res,
                    'Data wajib belum lengkap (NISN, nama, jenis kelamin, sekolah asal). Pekerjaan orang tua boleh dikosongkan.'
                );
            }

            const pesanValidasi = validasiDataSiswa({ nisn, nama, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu });
            if (pesanValidasi) return redirectError(res, pesanValidasi);

            const nisnBersih = rapikan(nisn);
            const namaBersih = rapikan(nama);

            if (await siswaModel.checkNisnExists(nisnBersih, periode.id_periode)) {
                return redirectError(res, `NISN ${nisnBersih} sudah terdaftar di periode ini. Data tidak boleh duplikat.`);
            }

            try {
                await siswaModel.createSiswa({
                    id_periode: periode.id_periode,
                    nisn: nisnBersih,
                    nama: namaBersih,
                    jenis_kelamin,
                    sekolah_asal: rapikan(sekolah_asal),
                    pekerjaan_ayah: pekerjaanAtauDefault(pekerjaan_ayah),
                    pekerjaan_ibu: pekerjaanAtauDefault(pekerjaan_ibu),
                    status_pip_pkh: status_pip_pkh === 'ya'
                });
            } catch (dupErr) {
                if (dupErr.message && dupErr.message.includes('sudah terdaftar')) {
                    return redirectError(res, dupErr.message);
                }
                throw dupErr;
            }

            await userModel.logActivity(req.session.user.id_user, `Admin menambahkan data siswa: ${namaBersih}`);
            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            return redirectSuccess(res, 'Data siswa berhasil ditambahkan. Klik "Buat Akun Siswa" untuk membuat akunnya.');
        } catch (error) {
            console.error('ERROR TAMBAH SISWA:', error);
            return redirectError(res, 'Terjadi kesalahan sistem.');
        }
    },

    // POST /admin/siswa/update
    // Hanya bisa jika bobot FUCOM sudah final dan konsisten.
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

            if (!(await cekBobotFinal(periode.id_periode))) {
                return redirectError(res, PESAN_BOBOT_BELUM_FINAL_AKSI);
            }

            if (!jenis_kelamin) {
                return redirectError(
                    res,
                    'Data wajib belum lengkap (NISN, nama, jenis kelamin, sekolah asal). Pekerjaan orang tua boleh dikosongkan.'
                );
            }

            const pesanValidasi = validasiDataSiswa({ nisn, nama, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu });
            if (pesanValidasi) return redirectError(res, pesanValidasi);

            // Siswa harus ada dan milik periode aktif.
            const siswa = await siswaModel.getSiswaById(id_siswa);

            if (!siswa || Number(siswa.id_periode) !== Number(periode.id_periode)) {
                return redirectError(res, 'Siswa tidak ditemukan pada periode aktif.');
            }

            const nisnBersih = rapikan(nisn);
            const namaBersih = rapikan(nama);

            if (await siswaModel.checkNisnExists(nisnBersih, periode.id_periode, id_siswa)) {
                return redirectError(res, 'NISN tersebut sudah digunakan oleh siswa lain. Periksa kembali data yang diinput.');
            }

            await siswaModel.updateSiswa(id_siswa, {
                nisn: nisnBersih,
                nama: namaBersih,
                jenis_kelamin,
                sekolah_asal: rapikan(sekolah_asal),
                pekerjaan_ayah: pekerjaanAtauDefault(pekerjaan_ayah),
                pekerjaan_ibu: pekerjaanAtauDefault(pekerjaan_ibu),
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

            await userModel.logActivity(req.session.user.id_user, `Admin memperbarui data siswa: ${namaBersih}`);
            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            return redirectSuccess(res, 'Data siswa berhasil diperbarui.');
        } catch (error) {
            console.error('ERROR UPDATE SISWA:', error);
            return redirectError(res, 'Terjadi kesalahan sistem.');
        }
    },

    // POST /admin/siswa/minat
    // Operator mengubah status minat. Hanya untuk siswa yang masih "Belum merespons".
    // Hanya bisa jika bobot FUCOM sudah final dan konsisten.
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

            if (!(await cekBobotFinal(periode.id_periode))) {
                return redirectError(res, PESAN_BOBOT_BELUM_FINAL_AKSI);
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

    // POST /admin/siswa/minat-massal
    // Operator menandai banyak siswa (checklist) sebagai "Berminat" ATAU "Tidak berminat" sekaligus.
    // Status dikirim lewat field status_minat. Hanya siswa yang punya akun dan masih
    // "Belum merespons" yang diubah. Untuk "Tidak berminat", akun siswa ikut dinonaktifkan.
    // Hanya bisa jika bobot FUCOM sudah final dan konsisten.
    async ubahMinatMassal(req, res) {
        try {
            let ids = req.body.id_siswa;
            const statusMinat = req.body.status_minat;

            if (!['berminat', 'tidak_berminat'].includes(statusMinat)) {
                return redirectError(res, PESAN_UBAH_MINAT.STATUS_TIDAK_VALID);
            }

            if (ids === undefined || ids === null || ids === '') {
                return redirectError(res, PESAN_UBAH_MINAT.TIDAK_ADA_PILIHAN);
            }

            if (!Array.isArray(ids)) ids = [ids];

            ids = [...new Set(ids.map(v => String(v).trim()))];

            if (ids.length === 0) {
                return redirectError(res, PESAN_UBAH_MINAT.TIDAK_ADA_PILIHAN);
            }

            if (ids.length > BATAS_MASSAL) {
                return redirectError(res, `Terlalu banyak siswa dipilih sekaligus (maksimal ${BATAS_MASSAL}).`);
            }

            if (ids.some(v => !/^[1-9]\d*$/.test(v))) {
                return redirectError(res, 'Data siswa yang dipilih tidak valid.');
            }

            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return redirectError(res, !periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode));
            }

            if (await cekTerkunci(periode.id_periode)) {
                return redirectError(res, PESAN_UBAH_MINAT.PERIODE_FINAL);
            }

            if (!(await cekBobotFinal(periode.id_periode))) {
                return redirectError(res, PESAN_BOBOT_BELUM_FINAL_AKSI);
            }

            const hasil = await siswaModel.setMinatMassal(ids.map(Number), periode.id_periode, statusMinat);

            if (!hasil.ok) {
                return redirectError(res, PESAN_UBAH_MINAT[hasil.alasan] || 'Status minat gagal diubah.');
            }

            const labelStatus = statusMinat === 'berminat' ? 'Berminat' : 'Tidak berminat';

            if (hasil.diubah > 0) {
                await userModel.logActivity(
                    req.session.user.id_user,
                    `Operator menandai ${hasil.diubah} siswa sebagai ${labelStatus} (checklist massal)`
                );

                // Mengubah peserta seleksi mempengaruhi ranking.
                await waspasModel.invalidateHasilJikaAda(periode.id_periode);
            }

            if (hasil.diubah === 0) {
                return redirectError(
                    res,
                    'Tidak ada siswa yang diubah. Pastikan siswa yang dipilih punya akun dan masih "Belum merespons".'
                );
            }

            let pesan = `${hasil.diubah} siswa berhasil diubah menjadi "${labelStatus}".`;

            if (statusMinat === 'tidak_berminat') {
                pesan += ' Akun siswa tersebut dinonaktifkan.';
            }

            if (hasil.dilewati > 0) {
                pesan += ` ${hasil.dilewati} siswa dilewati karena sudah merespons atau tidak memenuhi syarat.`;
            }

            return redirectSuccess(res, pesan);
        } catch (error) {
            console.error('ERROR UBAH MINAT MASSAL:', error);
            return redirectError(res, 'Terjadi kesalahan sistem.');
        }
    },

    // POST /admin/siswa/delete/:id_siswa
    // Hanya bisa jika bobot FUCOM sudah final dan konsisten.
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

            if (!(await cekBobotFinal(periode.id_periode))) {
                return redirectError(res, PESAN_BOBOT_BELUM_FINAL_AKSI);
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
    // Hanya bisa jika bobot FUCOM sudah final dan konsisten.
    async downloadTemplate(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return redirectError(res, !periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode));
            }

            if (!(await cekTerkunci(periode.id_periode)) && !(await cekBobotFinal(periode.id_periode))) {
                return redirectError(res, PESAN_BOBOT_BELUM_FINAL_AKSI);
            }

            await generateTemplateSiswa(res);
        } catch (error) {
            console.error(error);
            if (!res.headersSent) res.status(500).send('Gagal membuat template.');
        }
    },

    // POST /admin/siswa/import
    // Hanya bisa jika bobot FUCOM sudah final dan konsisten.
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

            if (!(await cekBobotFinal(periode.id_periode))) {
                hapusFileUpload(req);
                return redirectError(res, PESAN_BOBOT_BELUM_FINAL);
            }

            const workbook = xlsx.readFile(req.file.path);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = xlsx.utils.sheet_to_json(sheet);

            hapusFileUpload(req);

            // Baris Excel = index + 2 (baris 1 = header).
            const dataSiswaRaw = jsonData.map((row, idx) => ({
                baris: idx + 2,
                nisn: rapikan(row['NISN'] || row['nisn'] || ''),
                nama: rapikan(row['NAMA SISWA'] || row['nama'] || ''),
                jenis_kelamin: String(row['JENIS KELAMIN SISWA'] || row['jenis_kelamin'] || '')
                    .toUpperCase()
                    .startsWith('L') ? 'L' : 'P',
                sekolah_asal: rapikan(row['ASAL SEKOLAH'] || row['sekolah_asal'] || ''),
                pekerjaan_ayah: rapikan(
                    row['PEKERJAAAN AYAH'] || row['PEKERJAAN AYAH'] || row['pekerjaan_ayah'] || ''
                ),
                pekerjaan_ibu: rapikan(row['PEKERJAAN IBU'] || row['pekerjaan_ibu'] || ''),
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
                    // Baris valid: pekerjaan kosong otomatis menjadi "Tidak bekerja".
                    dataSiswa.push({
                        ...row,
                        pekerjaan_ayah: pekerjaanAtauDefault(row.pekerjaan_ayah),
                        pekerjaan_ibu: pekerjaanAtauDefault(row.pekerjaan_ibu)
                    });
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

            // Duplikat NISN (dalam file maupun dengan data yang sudah ada) ditolak di bulkInsert.
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