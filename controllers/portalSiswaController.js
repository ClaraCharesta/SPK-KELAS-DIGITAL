const bcrypt = require('bcrypt');
const akunSiswaModel = require('../models/akunSiswaModel');
const waspasModel = require('../models/waspasModel');

// nama_kriteria harus sama dengan tabel kriteria.
const PERTANYAAN = [
    {
        key: 'minat',
        nama_kriteria: 'Minat Belajar Teknologi',
        judul: 'Minat Belajar Teknologi',
        pertanyaan: 'Seberapa besar minat Anda untuk belajar di Kelas Digital?',
        opsi: [
            'Sangat tidak berminat',
            'Kurang berminat',
            'Cukup berminat',
            'Berminat',
            'Sangat berminat'
        ]
    },
    {
        key: 'perangkat',
        nama_kriteria: 'Kepemilikan Perangkat Digital',
        judul: 'Kesiapan Perangkat Digital',
        pertanyaan: 'Apakah Anda memiliki perangkat komputer/laptop atau bersedia menyiapkannya untuk pembelajaran?',
        opsi: [
            'Tidak memiliki dan tidak dapat menyiapkan perangkat',
            'Tidak memiliki dan sulit menyiapkan perangkat',
            'Belum memiliki, tetapi bisa menyiapkan (pinjam/cicil/bantuan)',
            'Memiliki perangkat yang dipakai bersama keluarga',
            'Memiliki perangkat pribadi yang memadai'
        ]
    },
    {
        key: 'kuota',
        nama_kriteria: 'Kondisi Ekonomi Keluarga',
        judul: 'Kesanggupan Kuota Internet Bulanan',
        pertanyaan: 'Apakah Anda/orang tua bersedia dan mampu menyediakan kuota internet bulanan untuk kelas digital?',
        opsi: [
            'Tidak mampu menyediakan kuota',
            'Sangat sulit, kuota sering tidak tersedia',
            'Mampu tetapi terbatas atau kadang terlambat',
            'Mampu, kuota biasanya tersedia',
            'Sangat mampu, kuota selalu tersedia setiap bulan'
        ]
    },
    {
        key: 'literasi',
        nama_kriteria: 'Kemampuan Komputer',
        judul: 'Kemampuan Komputer / Literasi Digital',
        pertanyaan: 'Seberapa baik kemampuan Anda dalam menggunakan komputer/laptop dan internet (mengetik, aplikasi perkantoran, mencari informasi, mengelola file)?',
        opsi: [
            'Belum bisa menggunakan komputer sama sekali',
            'Hanya bisa hal dasar (menyalakan komputer, membuka aplikasi sederhana)',
            'Cukup bisa (mengetik, Word/PowerPoint dasar, menjelajah internet)',
            'Mahir (mengelola file, memakai aplikasi perkantoran, memasang aplikasi)',
            'Sangat mahir (menguasai banyak aplikasi, mengatasi masalah dasar, belajar software baru secara mandiri)'
        ]
    }
];

const PESAN_ERROR_SIMPAN = {
    SISWA_TIDAK_DITEMUKAN: 'Data siswa tidak ditemukan.',
    PERIODE_TERKUNCI: 'Periode seleksi sudah ditutup atau difinalisasi. Jawaban tidak dapat diubah.',
    AKUN_TIDAK_AKTIF: 'Akun Anda tidak aktif.',
    MINAT_DITOLAK: 'Anda sudah menyatakan tidak berminat.',
    KRITERIA_TIDAK_LENGKAP: 'Kriteria periode ini belum lengkap. Silakan hubungi operator.',
    NILAI_KRITERIA_TIDAK_VALID: 'Semua pertanyaan wajib dijawab dengan skala 1 sampai 5.'
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function periodeMasihBuka(d) {
    return d.status_periode === 'aktif' && !d.hasil_final;
}

function bolehIsiForm(d) {
    return periodeMasihBuka(d) &&
        d.status_akun === 'aktif' &&
        d.status_minat !== 'tidak_berminat';
}

function bolehTolak(d) {
    return periodeMasihBuka(d) &&
        d.status_akun === 'aktif' &&
        d.status_minat === 'belum_respon';
}

// Siswa boleh menyatakan setuju hanya jika masih belum merespons.
function bolehSetuju(d) {
    return bolehTolak(d);
}

// Semua pertanyaan sudah terjawab?
function jawabanLengkap(jawaban) {
    return PERTANYAAN.every(function (p) {
        const nilai = jawaban[p.nama_kriteria];
        return nilai !== null && nilai !== undefined && Number(nilai) >= 1;
    });
}

// Siswa sudah menyatakan setuju (berminat) tetapi form belum lengkap:
// wajib tetap berada di form.
function wajibLengkapiForm(d, jawaban) {
    return bolehIsiForm(d) &&
        d.status_minat === 'berminat' &&
        !jawabanLengkap(jawaban);
}

function tentukanTahap(d) {
    if (d.status_minat === 'tidak_berminat' || d.status_akun !== 'aktif') {
        return 'tidak_ikut';
    }

    if (d.hasil_final) {
        if (d.status_minat !== 'berminat') return 'tidak_ikut';
        return d.status_penerimaan === 'diterima' ? 'diterima' : 'belum_lolos';
    }

    if (d.status_minat === 'berminat') return 'menunggu';

    return d.status_periode === 'aktif' ? 'minat' : 'periode_tutup';
}

function setFlash(req, tipe, pesan) {
    req.session.siswaFlash = {
        success: tipe === 'success' ? pesan : null,
        error: tipe === 'error' ? pesan : null
    };
}

function ambilFlash(req) {
    const flash = req.session.siswaFlash || { success: null, error: null };
    delete req.session.siswaFlash;
    return flash;
}

// Selalu ambil data segar dari database (tanpa hash password).
async function ambilDetail(req) {
    const detail = await akunSiswaModel.findDetailByIdSiswa(req.akunSiswa.id_siswa);

    if (!detail) return null;

    const { password, ...aman } = detail;
    return aman;
}

// Halaman form tidak boleh disimpan di cache browser (supaya tombol back/forward tidak menampilkan halaman lama).
function matikanCache(res) {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
const portalSiswaController = {

    // GET /siswa : beranda sesuai tahap siswa
    async index(req, res) {
        try {
            const d = await ambilDetail(req);

            if (!d) {
                return req.session.destroy(() => res.redirect('/login'));
            }

            const jawaban = await akunSiswaModel.getJawaban(d.id_siswa, d.id_periode);

            // Sudah setuju tapi form belum lengkap: paksa kembali ke form.
            if (wajibLengkapiForm(d, jawaban)) {
                return res.redirect('/siswa/form');
            }

            const flash = ambilFlash(req);
            const tahap = tentukanTahap(d);

            return res.render('siswa/beranda', {
                pageTitle: 'Beranda',
                siswa: d,
                tahap,
                pertanyaan: PERTANYAAN,
                jawaban,
                bisaUbahJawaban: bolehIsiForm(d) && d.status_minat === 'berminat',
                error: req.query.error || flash.error || null,
                success: flash.success
            });
        } catch (error) {
            console.error(error);
            return res.status(500).send('Terjadi kesalahan.');
        }
    },

    // Dipanggil dari POST /siswa/form saat body berisi aksi=setuju
    // (siswa menekan "Ya, saya yakin"). Status langsung 'berminat' (mengikat),
    // lalu diarahkan ke form pertanyaan.
    async setuju(req, res) {
        try {
            const d = await ambilDetail(req);

            if (!d) {
                return req.session.destroy(() => res.redirect('/login'));
            }

            // Sudah pernah setuju: langsung ke form (tanpa bertanya lagi).
            if (bolehIsiForm(d) && d.status_minat === 'berminat') {
                return res.redirect('/siswa/form');
            }

            if (!bolehSetuju(d)) {
                setFlash(req, 'error', 'Pilihan ini tidak tersedia saat ini.');
                return res.redirect('/siswa');
            }

            const diubah = await akunSiswaModel.setBerminat(d.id_siswa);

            if (!diubah) {
                setFlash(req, 'error', 'Perubahan gagal diproses. Silakan coba lagi.');
                return res.redirect('/siswa');
            }

            // Peserta seleksi bertambah, hasil ranking lama tidak valid lagi.
            await waspasModel.invalidateHasilJikaAda(d.id_periode);

            return res.redirect('/siswa/form');
        } catch (error) {
            console.error(error);
            setFlash(req, 'error', 'Terjadi kesalahan sistem.');
            return res.redirect('/siswa');
        }
    },

    // GET /siswa/form : form pertanyaan skala
    async tampilForm(req, res) {
        try {
            const d = await ambilDetail(req);

            if (!d || !bolehIsiForm(d)) {
                setFlash(req, 'error', 'Form tidak dapat diisi saat ini.');
                return res.redirect('/siswa');
            }

            // Belum menyatakan setuju: form belum boleh dibuka.
            if (d.status_minat !== 'berminat') {
                return res.redirect('/siswa');
            }

            const flash = ambilFlash(req);
            const jawaban = await akunSiswaModel.getJawaban(d.id_siswa, d.id_periode);

            matikanCache(res);

            return res.render('siswa/form-skala', {
                pageTitle: 'Form Minat Kelas Digital',
                siswa: d,
                pertanyaan: PERTANYAAN,
                jawaban,
                // Selama form belum lengkap, siswa terkunci di halaman ini.
                wajibLengkap: !jawabanLengkap(jawaban),
                error: req.query.error || flash.error || null
            });
        } catch (error) {
            console.error(error);
            return res.status(500).send('Terjadi kesalahan.');
        }
    },

    // POST /siswa/form : simpan jawaban (atau proses "setuju" jika aksi=setuju)
    async submitForm(req, res) {
        try {
            // Tombol "Ya, saya yakin" di beranda mengirim ke sini dengan aksi=setuju.
            if (req.body && req.body.aksi === 'setuju') {
                return portalSiswaController.setuju(req, res);
            }

            const d = await ambilDetail(req);

            if (!d || !bolehIsiForm(d)) {
                setFlash(req, 'error', 'Form tidak dapat diisi saat ini.');
                return res.redirect('/siswa');
            }

            if (d.status_minat !== 'berminat') {
                return res.redirect('/siswa');
            }

            const jawaban = {};

            for (const p of PERTANYAAN) {
                const nilai = Number(req.body[p.key]);

                if (!Number.isInteger(nilai) || nilai < 1 || nilai > 5) {
                    return res.redirect(
                        '/siswa/form?error=' +
                        encodeURIComponent('Semua pertanyaan wajib dijawab dengan skala 1 sampai 5.')
                    );
                }

                jawaban[p.nama_kriteria] = nilai;
            }

            await akunSiswaModel.simpanJawaban(d.id_siswa, d.id_periode, jawaban);
            await waspasModel.invalidateHasilJikaAda(d.id_periode);

            setFlash(req, 'success', 'Jawaban Anda berhasil disimpan.');
            return res.redirect('/siswa');
        } catch (error) {
            const pesan = PESAN_ERROR_SIMPAN[error.message];

            if (pesan) {
                setFlash(req, 'error', pesan);
                return res.redirect('/siswa');
            }

            console.error(error);
            return res.redirect('/siswa/form?error=' + encodeURIComponent('Terjadi kesalahan, coba lagi.'));
        }
    },

    // GET /siswa/tolak : langkah 1
    async tolakLangkah1(req, res) {
        const d = await ambilDetail(req);

        if (!d || !bolehTolak(d)) {
            setFlash(req, 'error', 'Pilihan ini tidak tersedia saat ini.');
            return res.redirect('/siswa');
        }

        delete req.session.siswa.tolakLangkah;

        return res.render('siswa/tolak', {
            pageTitle: 'Konfirmasi',
            siswa: d,
            langkah: 1
        });
    },

    // POST /siswa/tolak/langkah-1
    async prosesLangkah1(req, res) {
        const d = await ambilDetail(req);

        if (!d || !bolehTolak(d)) {
            setFlash(req, 'error', 'Pilihan ini tidak tersedia saat ini.');
            return res.redirect('/siswa');
        }

        req.session.siswa.tolakLangkah = 1;
        return res.redirect('/siswa/tolak/langkah-2');
    },

    // GET /siswa/tolak/langkah-2
    async tolakLangkah2(req, res) {
        const d = await ambilDetail(req);

        if (!d || !bolehTolak(d) || req.session.siswa.tolakLangkah !== 1) {
            return res.redirect('/siswa/tolak');
        }

        return res.render('siswa/tolak', {
            pageTitle: 'Konfirmasi Akhir',
            siswa: d,
            langkah: 2
        });
    },

    // POST /siswa/tolak/konfirmasi
    async prosesTolak(req, res) {
        try {
            const d = await ambilDetail(req);

            if (!d || !bolehTolak(d) || req.session.siswa.tolakLangkah !== 1) {
                return res.redirect('/siswa/tolak');
            }

            const diubah = await akunSiswaModel.setTidakBerminat(d.id_siswa);

            if (!diubah) {
                setFlash(req, 'error', 'Perubahan gagal diproses.');
                return res.redirect('/siswa');
            }

            return req.session.destroy(() => {
                res.render('siswa/akun-dinonaktifkan', { pageTitle: 'Terima Kasih' });
            });
        } catch (error) {
            console.error(error);
            setFlash(req, 'error', 'Terjadi kesalahan sistem.');
            return res.redirect('/siswa');
        }
    },

    // GET /siswa/ganti-password
    // Hanya untuk alur wajib ganti password (login pertama / setelah reset operator).
    async tampilGantiPassword(req, res) {
        try {
            const d = await ambilDetail(req);

            if (!d) {
                return req.session.destroy(() => res.redirect('/login'));
            }

            // Tidak sedang wajib ganti password: halaman ini tidak tersedia.
            if (!d.wajib_ganti_password) {
                return res.redirect('/siswa');
            }

            const flash = ambilFlash(req);

            matikanCache(res);

            return res.render('siswa/ganti-password', {
                pageTitle: 'Ganti Password',
                siswa: d,
                wajib: true,
                success: flash.success,
                error: flash.error
            });
        } catch (error) {
            console.error(error);
            return res.status(500).send('Terjadi kesalahan.');
        }
    },

    // POST /siswa/ganti-password
    async prosesGantiPassword(req, res) {
        try {
            const d = req.akunSiswa;
            const { password_lama, password_baru, konfirmasi_password } = req.body;
            const kembali = '/siswa/ganti-password';

            // Ganti password mandiri tidak disediakan. Hanya alur wajib yang diizinkan.
            // Jika lupa password, siswa meminta reset ke operator.
            if (!d || !d.wajib_ganti_password) {
                setFlash(req, 'error', 'Ganti password mandiri tidak tersedia. Hubungi operator jika perlu mereset akun.');
                return res.redirect('/siswa');
            }

            if (!password_lama || !password_baru || !konfirmasi_password) {
                setFlash(req, 'error', 'Semua kolom wajib diisi.');
                return res.redirect(kembali);
            }

            if (password_baru.length < 8) {
                setFlash(req, 'error', 'Password baru minimal 8 karakter.');
                return res.redirect(kembali);
            }

            if (password_baru !== konfirmasi_password) {
                setFlash(req, 'error', 'Konfirmasi password tidak cocok dengan password baru.');
                return res.redirect(kembali);
            }

            const lamaCocok = await bcrypt.compare(password_lama, d.password);

            if (!lamaCocok) {
                setFlash(req, 'error', 'Password lama salah.');
                return res.redirect(kembali);
            }

            if (password_baru === password_lama) {
                setFlash(req, 'error', 'Password baru tidak boleh sama dengan password lama.');
                return res.redirect(kembali);
            }

            if (password_baru === String(d.nisn) || password_baru === String(d.username)) {
                setFlash(req, 'error', 'Password baru tidak boleh sama dengan NISN.');
                return res.redirect(kembali);
            }

            const hash = await bcrypt.hash(password_baru, 10);
            await akunSiswaModel.updatePasswordSendiri(d.id_akun_siswa, hash);

            setFlash(req, 'success', 'Password berhasil diganti.');
            return res.redirect('/siswa');
        } catch (error) {
            console.error(error);
            setFlash(req, 'error', 'Terjadi kesalahan sistem saat mengganti password.');
            return res.redirect('/siswa/ganti-password');
        }
    }
};

module.exports = portalSiswaController;