const db = require('../config/database');
const nilaiModel = require('../models/nilaiModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');
const kriteriaModel = require('../models/kriteriaModel');
const akunSiswaModel = require('../models/akunSiswaModel');
const waspasModel = require('../models/waspasModel');
const { generateTemplateNilai, isKriteriaIsianSiswa, adaNilai } = require('../utils/templateGenerator');
const xlsx = require('xlsx');
const fs = require('fs');
const { cekTerkunci } = require('../utils/lockHelper');
const { isPeriodeSudahMulai, pesanBelumMulai } = require('../utils/periodeHelper');
const { cekBobotFinal } = require('../utils/bobotHelper');

// Input nilai TIDAK berhubungan dengan FUCOM.
// Syaratnya: sudah ada data siswa dan tidak ada siswa yang masih "Belum merespons".
const PESAN_BELUM_ADA_SISWA =
    'Input nilai belum dapat dilakukan karena belum ada data siswa. ' +
    'Tambahkan data siswa terlebih dahulu di menu Data Siswa.';

// Teks nilai hanya boleh angka murni: digit, lalu (opsional) satu tanda koma atau titik beserta desimalnya.
// Koma dan titik sama-sama diterima sebagai pemisah desimal. Menolak huruf, minus, dan notasi seperti "1e2".
const REGEX_ANGKA_NILAI = /^(\d+([.,]\d*)?|[.,]\d+)$/;

const BATAS_RINCIAN_PER_KELOMPOK = 200;

function hapusFileUpload(req) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* abaikan */ }
    }
}

// Akademik & Psikotes: skala 0-100 (boleh desimal). Kriteria lain: bilangan bulat 1-5.
function skalaKriteria(nama) {
    const n = String(nama || '').toLowerCase();
    const isSkor100 = n.includes('akademik') || n.includes('psikotes');
    return { isSkor100, minVal: isSkor100 ? 0 : 1, maxVal: isSkor100 ? 100 : 5 };
}

// Bulatkan ke 2 angka di belakang koma.
function bulatkanDuaDesimal(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Hapus spasi biasa, spasi non-breaking, dan zero-width space dari teks nilai.
function bersihkanTeksNilai(raw) {
    if (raw === undefined || raw === null) return '';
    return String(raw).replace(/[\s\u00A0\u200B]/g, '');
}

// Baca satu nilai dari form atau Excel.
// Menerima angka dengan koma maupun titik sebagai pemisah desimal.
// Hasil: { ok: true, nilai } atau { ok: false, kosong?, alasan }.
function parseNilai(raw, skala) {
    const { isSkor100 } = skala;
    let nilai;

    if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) {
            return { ok: false, alasan: 'bukan angka yang valid' };
        }
        nilai = raw;
    } else {
        const teks = bersihkanTeksNilai(raw);

        if (teks === '') {
            return { ok: false, kosong: true, alasan: 'belum diisi' };
        }

        if (/^[-\u2212\u2013]/.test(teks)) {
            return { ok: false, alasan: 'tidak boleh bernilai negatif' };
        }

        if (!REGEX_ANGKA_NILAI.test(teks)) {
            return {
                ok: false,
                alasan: isSkor100
                    ? 'bukan angka yang valid (gunakan angka saja, desimal dengan satu koma atau titik, contoh 85,5 atau 85.5)'
                    : 'bukan angka yang valid (isi bilangan bulat 1, 2, 3, 4, atau 5)'
            };
        }

        nilai = Number(teks.replace(',', '.'));

        if (!Number.isFinite(nilai)) {
            return { ok: false, alasan: 'bukan angka yang valid' };
        }
    }

    if (nilai < 0) {
        return { ok: false, alasan: 'tidak boleh bernilai negatif' };
    }

    if (!isSkor100) {
        if (Math.abs(nilai - Math.round(nilai)) > 1e-9) {
            return { ok: false, alasan: 'skala 1-5 harus bilangan bulat, tanpa desimal' };
        }

        nilai = Math.round(nilai);

        if (nilai === 0) {
            return { ok: false, alasan: 'tidak boleh 0, isi 1, 2, 3, 4, atau 5' };
        }

        if (nilai < 1 || nilai > 5) {
            return { ok: false, alasan: 'di luar skala (harus 1 sampai 5)' };
        }

        return { ok: true, nilai };
    }

    if (nilai > 100) {
        return { ok: false, alasan: 'di luar skala (harus 0 sampai 100)' };
    }

    return { ok: true, nilai: bulatkanDuaDesimal(nilai) };
}

// Apakah nilai di file sama dengan nilai yang sudah tersimpan (toleransi pembulatan 2 desimal).
function nilaiSama(lama, baru) {
    return Math.abs(Number(lama) - Number(baru)) < 0.005;
}

// Tampilan nilai untuk pesan rincian.
function tampilNilaiPesan(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

// Ambil nilai yang sudah tersimpan untuk satu siswa: Map(id_kriteria -> nilai_mentah).
async function ambilNilaiLamaSiswa(id_siswa, executor) {
    const [rows] = await (executor || db).query(
        'SELECT id_kriteria, nilai_mentah FROM nilai_siswa WHERE id_siswa = ?',
        [id_siswa]
    );
    return new Map(rows.map(r => [Number(r.id_kriteria), r.nilai_mentah]));
}

function normalisasiHeader(teks) {
    return String(teks === undefined || teks === null ? '' : teks)
        .replace(/[\u00A0\u200B]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function bersihkanNisn(raw) {
    return String(raw === undefined || raw === null ? '' : raw).replace(/[\s\u00A0\u200B'`]/g, '');
}

function potongDaftar(items, batas) {
    if (items.length <= batas) return items.slice();
    const dipotong = items.slice(0, batas);
    dipotong.push('dan ' + (items.length - batas) + ' lainnya');
    return dipotong;
}

// Simpan pesan hasil import (ringkasan + rincian) ke session, lalu arahkan ke halaman nilai.
function simpanFlashDanRedirect(req, res, tipe, ringkasan, kelompok) {
    const bersih = (kelompok || [])
        .filter(g => g.items.length > 0)
        .map(g => ({
            judul: g.judul,
            jumlah: g.items.length,
            items: potongDaftar(g.items, BATAS_RINCIAN_PER_KELOMPOK)
        }));

    req.session.flashNilai = { tipe, ringkasan, kelompok: bersih };

    if (typeof req.session.save === 'function') {
        return req.session.save(() => res.redirect('/operator/nilai'));
    }

    return res.redirect('/operator/nilai');
}

function ambilFlash(req) {
    if (!req.session || !req.session.flashNilai) return null;
    const flash = req.session.flashNilai;
    delete req.session.flashNilai;
    return flash;
}

// Jumlah siswa yang masih "Belum merespons" (termasuk yang belum punya akun).
async function hitungBelumRespon(id_periode) {
    const ringkasan = await akunSiswaModel.ringkasan(id_periode);
    return Number(ringkasan.belumKonfirmasi || 0);
}

// Jumlah seluruh siswa pada periode.
async function hitungTotalSiswa(id_periode) {
    const [[r]] = await db.query(
        'SELECT COUNT(*) AS jumlah FROM siswa WHERE id_periode = ?',
        [id_periode]
    );
    return Number((r && r.jumlah) || 0);
}

function pesanBelumRespon(jumlah) {
    return `Input nilai belum dapat dilakukan karena masih ada ${jumlah} siswa yang belum merespons. ` +
           'Ubah status minat mereka di menu Data Siswa atau tunggu siswa menjawab.';
}

// Daftar kriteria satu periode, dibaca langsung dari database.
async function ambilKriteriaPeriode(id_periode) {
    const [rows] = await db.query(
        `SELECT id_kriteria, nama_kriteria, jenis
         FROM kriteria
         WHERE id_periode = ?
         ORDER BY id_kriteria ASC`,
        [id_periode]
    );
    return rows;
}

// Semua nilai satu periode sekaligus (satu query),
// bentuk: { [id_siswa]: { [id_kriteria]: nilai_mentah } }
async function ambilPetaNilai(id_periode) {
    const [rows] = await db.query(
        `SELECT ns.id_siswa, ns.id_kriteria, ns.nilai_mentah
         FROM nilai_siswa ns
         INNER JOIN siswa s ON s.id_siswa = ns.id_siswa
         INNER JOIN kriteria k ON k.id_kriteria = ns.id_kriteria
         WHERE s.id_periode = ? AND k.id_periode = ?`,
        [id_periode, id_periode]
    );

    const peta = {};

    rows.forEach(r => {
        const idSiswa = String(r.id_siswa);
        if (!peta[idSiswa]) peta[idSiswa] = {};
        peta[idSiswa][String(r.id_kriteria)] =
            r.nilai_mentah === null || r.nilai_mentah === undefined
                ? null
                : Number(r.nilai_mentah);
    });

    return peta;
}

// Kriteria + nilai satu siswa, dibaca langsung dari database.
async function ambilKriteriaDenganNilai(id_siswa, id_periode) {
    const [rows] = await db.query(
        `SELECT k.id_kriteria, k.nama_kriteria, k.jenis, ns.nilai_mentah
         FROM kriteria k
         LEFT JOIN nilai_siswa ns
            ON ns.id_kriteria = k.id_kriteria
           AND ns.id_siswa = ?
         WHERE k.id_periode = ?
         ORDER BY k.id_kriteria ASC`,
        [id_siswa, id_periode]
    );

    return rows.map(r => ({
        ...r,
        nilai_mentah:
            r.nilai_mentah === null || r.nilai_mentah === undefined
                ? null
                : Number(r.nilai_mentah),
        // Penanda untuk view: nilai isian siswa yang sudah terisi tidak boleh diubah operator.
        dikunci_siswa:
            isKriteriaIsianSiswa(r.nama_kriteria) && adaNilai(r.nilai_mentah)
    }));
}

const nilaiController = {
    // =========================================================
    // GET /operator/nilai
    // =========================================================
    async index(req, res) {
        try {
            const pesanImport = ambilFlash(req);
            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return res.render('operator/nilai', {
                    user: req.session.user,
                    siswaList: [],
                    kriteriaList: [],
                    nilaiMap: {},
                    terkunci: false,
                    bobotFinal: false,
                    jumlahBelumRespon: 0,
                    pesanImport,
                    activePage: 'nilai',
                    pageTitle: 'Input Nilai Siswa',
                    error: !periode ? 'Belum ada periode seleksi aktif.' : pesanBelumMulai(periode),
                    success: null
                });
            }

            const daftar = await nilaiModel.getSiswaWithNilaiStatus(periode.id_periode);

            // Status minat dari akun_siswa (sumber kebenaran tunggal).
            const [akunRows] = await db.query(
                `SELECT a.id_siswa, a.status_minat
                 FROM akun_siswa a
                 INNER JOIN siswa s ON s.id_siswa = a.id_siswa
                 WHERE s.id_periode = ?`,
                [periode.id_periode]
            );
            const akunMap = new Map(akunRows.map(r => [Number(r.id_siswa), r]));

            // Kriteria dan nilai dibaca langsung agar tampilan selalu sesuai database.
            const kriteriaList = await ambilKriteriaPeriode(periode.id_periode);
            const nilaiMap = await ambilPetaNilai(periode.id_periode);

            const siswaList = daftar.map(s => {
                const akun = akunMap.get(Number(s.id_siswa));
                const barisNilai = nilaiMap[String(s.id_siswa)] || {};

                const jumlahTerisi = kriteriaList.filter(k => {
                    const v = barisNilai[String(k.id_kriteria)];
                    return v !== null && v !== undefined;
                }).length;

                return {
                    ...s,
                    punya_akun: !!akun,
                    status_minat: akun ? akun.status_minat : null,
                    jumlah_terisi: jumlahTerisi,
                    total_kriteria: kriteriaList.length
                };
            });

            const terkunci = await cekTerkunci(periode.id_periode);
            const bobotFinal = await cekBobotFinal(periode.id_periode);
            const jumlahBelumRespon = await hitungBelumRespon(periode.id_periode);

            return res.render('operator/nilai', {
                user: req.session.user,
                siswaList,
                kriteriaList,
                nilaiMap,
                terkunci,
                bobotFinal,
                jumlahBelumRespon,
                pesanImport,
                activePage: 'nilai',
                pageTitle: 'Input Nilai Siswa',
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error('ERROR HALAMAN NILAI:', error);
            return res.status(500).send('Terjadi kesalahan mengambil data.');
        }
    },

    // =========================================================
    // GET /operator/nilai/:id_siswa
    // =========================================================
    async showForm(req, res) {
        try {
            const { id_siswa } = req.params;
            const periode = await periodeModel.getActivePeriode();

            if (!periode) {
                return res.redirect('/operator/nilai?error=' + encodeURIComponent('Belum ada periode seleksi aktif.'));
            }

            if (!isPeriodeSudahMulai(periode)) {
                return res.redirect('/operator/nilai?error=' + encodeURIComponent(pesanBelumMulai(periode)));
            }

            const siswa = await nilaiModel.getSiswaById(id_siswa);

            if (!siswa || Number(siswa.id_periode) !== Number(periode.id_periode)) {
                return res.redirect('/operator/nilai?error=' + encodeURIComponent('Siswa tidak ditemukan pada periode aktif.'));
            }

            // Dibaca langsung dari database agar nilai selalu tampil, juga setelah finalisasi.
            // Tiap kriteria punya penanda `dikunci_siswa` (true = isian siswa yang sudah terisi).
            const kriteriaList = await ambilKriteriaDenganNilai(id_siswa, periode.id_periode);
            const terkunci = await cekTerkunci(periode.id_periode);
            const bobotFinal = await cekBobotFinal(periode.id_periode);
            const jumlahBelumRespon = await hitungBelumRespon(periode.id_periode);
            const totalSiswa = await hitungTotalSiswa(periode.id_periode);

            const [akunRows] = await db.query(
                'SELECT status_minat FROM akun_siswa WHERE id_siswa = ? LIMIT 1',
                [id_siswa]
            );
            const akun = akunRows[0] || null;
            const statusMinat = akun ? akun.status_minat : null;

            // Nilai hanya bisa diisi jika: belum final, sudah ada data siswa,
            // siswa tidak menolak, dan tidak ada lagi siswa yang belum merespons.
            // (Tidak ada hubungannya dengan pembobotan FUCOM.)
            const bolehIsi =
                !terkunci &&
                totalSiswa > 0 &&
                statusMinat !== 'tidak_berminat' &&
                jumlahBelumRespon === 0;

            return res.render('operator/nilai-form', {
                user: req.session.user,
                siswa,
                kriteriaList,
                terkunci,
                bobotFinal,
                statusMinat,
                jumlahBelumRespon,
                bolehIsi,
                activePage: 'nilai',
                pageTitle: (terkunci ? 'Nilai: ' : 'Input Nilai: ') + siswa.nama,
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error('ERROR FORM NILAI:', error);
            return res.status(500).send('Terjadi kesalahan mengambil data.');
        }
    },

    // =========================================================
    // POST /operator/nilai/:id_siswa/save
    // Syarat: sudah ada data siswa + tidak ada siswa "Belum merespons".
    // Nilai isian siswa (minat, perangkat, ekonomi, komputer) yang sudah terisi
    // TIDAK bisa diubah operator: nilainya dipertahankan.
    // =========================================================
    async saveNilai(req, res) {
        let conn;
        const id_siswa = req.params.id_siswa;

        const redirectError = (pesan) =>
            res.redirect(
                `/operator/nilai/${encodeURIComponent(id_siswa)}?error=` + encodeURIComponent(pesan)
            );

        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode) {
                return res.redirect('/operator/nilai?error=' + encodeURIComponent('Belum ada periode seleksi aktif.'));
            }

            if (!isPeriodeSudahMulai(periode)) {
                return res.redirect('/operator/nilai?error=' + encodeURIComponent(pesanBelumMulai(periode)));
            }

            if (await cekTerkunci(periode.id_periode)) {
                return redirectError('Nilai tidak dapat diubah karena hasil seleksi telah difinalisasi.');
            }

            if ((await hitungTotalSiswa(periode.id_periode)) === 0) {
                return redirectError(PESAN_BELUM_ADA_SISWA);
            }

            const jumlahBelumRespon = await hitungBelumRespon(periode.id_periode);

            if (jumlahBelumRespon > 0) {
                return redirectError(pesanBelumRespon(jumlahBelumRespon));
            }

            // Ambil data form.
            const { id_kriteria, nilai_mentah } = req.body;

            const idKriteriaArr = Array.isArray(id_kriteria)
                ? id_kriteria
                : id_kriteria !== undefined ? [id_kriteria] : [];

            const nilaiArr = Array.isArray(nilai_mentah)
                ? nilai_mentah
                : nilai_mentah !== undefined ? [nilai_mentah] : [];

            if (idKriteriaArr.length === 0 || idKriteriaArr.length !== nilaiArr.length) {
                return redirectError('Data nilai tidak lengkap atau format form tidak valid. Muat ulang form lalu isi semua kolom nilai.');
            }

            // ID kriteria valid dan tidak duplikat.
            const idUnik = new Set();
            for (const id of idKriteriaArr) {
                if (!/^[1-9]\d*$/.test(String(id)) || idUnik.has(String(id))) {
                    return redirectError('Daftar kriteria tidak valid atau terdapat kriteria duplikat.');
                }
                idUnik.add(String(id));
            }

            conn = await db.getConnection();
            await conn.beginTransaction();

            // Kunci bersama baris periode: finalisasi akan menunggu transaksi ini.
            const [periodeRows] = await conn.query(
                `SELECT status_penyelesaian FROM periode_seleksi
                 WHERE id_periode = ? LOCK IN SHARE MODE`,
                [periode.id_periode]
            );

            if (!periodeRows.length || periodeRows[0].status_penyelesaian === 'selesai') {
                await conn.rollback();
                return redirectError('Nilai tidak dapat diubah karena hasil seleksi telah difinalisasi.');
            }

            const [siswaRows] = await conn.query(
                `SELECT s.id_siswa, s.nama, a.status_minat
                 FROM siswa s
                 LEFT JOIN akun_siswa a ON a.id_siswa = s.id_siswa
                 WHERE s.id_siswa = ? AND s.id_periode = ?
                 FOR UPDATE`,
                [id_siswa, periode.id_periode]
            );

            const siswa = siswaRows[0];

            if (!siswa) {
                await conn.rollback();
                return redirectError('Siswa tidak ditemukan pada periode seleksi aktif.');
            }

            if (siswa.status_minat === 'tidak_berminat') {
                await conn.rollback();
                return redirectError(
                    'Siswa ini menyatakan tidak berminat mengikuti Kelas Digital. Nilai tidak dapat diisi.'
                );
            }

            // Pengaman tambahan jika status berubah saat permintaan diproses.
            if (siswa.status_minat !== 'berminat') {
                await conn.rollback();
                return redirectError(
                    'Siswa ini masih belum merespons. Ubah status minatnya di menu Data Siswa terlebih dahulu.'
                );
            }

            // Validasi kriteria resmi periode ini.
            const [kriteriaRows] = await conn.query(
                `SELECT id_kriteria, nama_kriteria FROM kriteria
                 WHERE id_periode = ? ORDER BY id_kriteria ASC`,
                [periode.id_periode]
            );

            if (kriteriaRows.length === 0) {
                await conn.rollback();
                return redirectError('Belum ada kriteria pada periode seleksi aktif.');
            }

            const kriteriaMap = new Map(kriteriaRows.map(k => [Number(k.id_kriteria), k.nama_kriteria]));
            const idKriteriaAngka = idKriteriaArr.map(id => Number(id));

            if (
                idKriteriaAngka.length !== kriteriaRows.length ||
                idKriteriaAngka.some(id => !kriteriaMap.has(id))
            ) {
                await conn.rollback();
                return redirectError('Daftar kriteria pada form tidak sesuai dengan periode aktif. Muat ulang form nilai.');
            }

            // Nilai yang sudah tersimpan (dikunci dalam transaksi ini).
            const nilaiLama = await ambilNilaiLamaSiswa(id_siswa, conn);

            // Validasi semua nilai sekaligus, lalu laporkan seluruh kriteria yang bermasalah.
            const nilaiTervalidasi = [];
            const masalah = [];
            const dikunciDipertahankan = [];

            for (let i = 0; i < idKriteriaAngka.length; i++) {
                const idKrit = idKriteriaAngka[i];
                const namaKriteria = kriteriaMap.get(idKrit);

                // Isian siswa yang sudah terisi: tidak boleh diubah operator, nilai lama dipertahankan.
                if (isKriteriaIsianSiswa(namaKriteria) && adaNilai(nilaiLama.get(idKrit))) {
                    dikunciDipertahankan.push(namaKriteria);
                    continue;
                }

                const hasil = parseNilai(nilaiArr[i], skalaKriteria(namaKriteria));

                if (!hasil.ok) {
                    masalah.push(`"${namaKriteria}" ${hasil.alasan}`);
                    continue;
                }

                nilaiTervalidasi.push({ id_kriteria: idKrit, nilai_mentah: hasil.nilai });
            }

            if (masalah.length > 0) {
                await conn.rollback();
                return redirectError('Nilai belum bisa disimpan. Perbaiki: ' + masalah.join('; ') + '.');
            }

            // Simpan nilai.
            for (const item of nilaiTervalidasi) {
                await nilaiModel.upsertNilai(id_siswa, item.id_kriteria, item.nilai_mentah, conn);
            }

            await conn.commit();
            conn.release();
            conn = null;

            if (nilaiTervalidasi.length > 0) {
                await userModel.logActivity(
                    req.session.user.id_user,
                    `Menginput/memperbarui nilai siswa: ${siswa.nama}`
                );

                await waspasModel.invalidateHasilJikaAda(periode.id_periode);
            }

            let pesanSukses = `Nilai siswa ${siswa.nama} berhasil disimpan.`;

            if (dikunciDipertahankan.length > 0) {
                pesanSukses += ` Nilai isian siswa (${dikunciDipertahankan.join(', ')}) tidak diubah karena sudah diisi oleh siswa.`;
            }

            return res.redirect('/operator/nilai?success=' + encodeURIComponent(pesanSukses));
        } catch (error) {
            if (conn) {
                try { await conn.rollback(); } catch (e) { console.error('Rollback gagal:', e); }
            }

            console.error('ERROR SIMPAN NILAI:', error);
            return redirectError('Terjadi kesalahan sistem saat menyimpan nilai.');
        } finally {
            if (conn) conn.release();
        }
    },

    // =========================================================
    // Data nilai semua siswa (untuk template Excel)
    // =========================================================
    async getSiswaWithAllNilai(id_periode) {
        const siswaList = await nilaiModel.getSiswaWithNilaiStatus(id_periode);
        const result = [];

        for (const s of siswaList) {
            const [nilaiRows] = await db.query(
                `SELECT ns.id_kriteria, ns.nilai_mentah
                 FROM nilai_siswa ns
                 INNER JOIN kriteria k ON k.id_kriteria = ns.id_kriteria
                 WHERE ns.id_siswa = ? AND k.id_periode = ?`,
                [s.id_siswa, id_periode]
            );

            const nilai = {};
            nilaiRows.forEach(n => { nilai[n.id_kriteria] = n.nilai_mentah; });

            result.push({ ...s, nilai });
        }

        return result;
    },

    // =========================================================
    // GET /operator/nilai/template
    // =========================================================
    async downloadTemplate(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return res.status(400).send(!periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode));
            }

            const siswaList = await nilaiController.getSiswaWithAllNilai(periode.id_periode);
            const kriteriaList = await kriteriaModel.getAll(periode.id_periode);

            if (kriteriaList.length === 0) {
                return res.status(400).send('Belum ada kriteria terdaftar. Hubungi Admin.');
            }

            return await generateTemplateNilai(res, siswaList, kriteriaList);
        } catch (error) {
            console.error('ERROR DOWNLOAD TEMPLATE NILAI:', error);

            if (!res.headersSent) {
                return res.status(500).send('Gagal membuat template: ' + error.message);
            }
        }
    },

    // =========================================================
    // POST /operator/nilai/import
    // Syarat: sudah ada data siswa + tidak ada siswa "Belum merespons".
    // Siswa tidak berminat dilewati.
    // Nilai isian siswa (minat, perangkat, ekonomi, komputer) yang sudah terisi
    // TIDAK bisa diubah lewat import. Jika masih kosong, operator boleh mengisi.
    // =========================================================
    async importNilai(req, res) {
        const kembaliError = (pesan) =>
            res.redirect('/operator/nilai?error=' + encodeURIComponent(pesan));

        try {
            if (!req.file) {
                return kembaliError('Silakan pilih file Excel terlebih dahulu.');
            }

            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                hapusFileUpload(req);
                return kembaliError(!periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode));
            }

            if (await cekTerkunci(periode.id_periode)) {
                hapusFileUpload(req);
                return kembaliError('Nilai tidak dapat diubah karena hasil seleksi telah difinalisasi.');
            }

            if ((await hitungTotalSiswa(periode.id_periode)) === 0) {
                hapusFileUpload(req);
                return kembaliError(PESAN_BELUM_ADA_SISWA);
            }

            const jumlahBelumRespon = await hitungBelumRespon(periode.id_periode);

            if (jumlahBelumRespon > 0) {
                hapusFileUpload(req);
                return kembaliError(pesanBelumRespon(jumlahBelumRespon));
            }

            const kriteriaList = await kriteriaModel.getAll(periode.id_periode);

            if (kriteriaList.length === 0) {
                hapusFileUpload(req);
                return kembaliError('Belum ada kriteria pada periode seleksi aktif.');
            }

            const workbook = xlsx.readFile(req.file.path);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = xlsx.utils.sheet_to_json(sheet, { defval: '' });

            hapusFileUpload(req);

            if (jsonData.length === 0) {
                return kembaliError('File Excel kosong atau tidak ada baris data di sheet pertama. Isi data pada template lalu import lagi.');
            }

            // Cocokkan header kolom tanpa peduli huruf besar/kecil dan spasi berlebih.
            const petaKolom = {};
            jsonData.forEach(row => {
                Object.keys(row).forEach(key => {
                    const n = normalisasiHeader(key);
                    if (!(n in petaKolom)) petaKolom[n] = key;
                });
            });

            const headerTerbaca = Object.keys(jsonData[0]).map(h => String(h).trim()).filter(h => h !== '');
            const kolomNisn = petaKolom['nisn'];

            if (kolomNisn === undefined) {
                return simpanFlashDanRedirect(
                    req, res, 'error',
                    'Import gagal: kolom NISN tidak ditemukan di file. Pastikan baris pertama berisi header sesuai template (jangan mengubah nama kolom).',
                    [{ judul: 'Kolom yang terbaca di file', items: headerTerbaca }]
                );
            }

            const kolomKriteria = [];
            const kriteriaHilang = [];

            kriteriaList.forEach(k => {
                const kolom = petaKolom[normalisasiHeader(k.nama_kriteria)];
                if (kolom === undefined) {
                    kriteriaHilang.push(k.nama_kriteria);
                } else {
                    kolomKriteria.push({ nama: k.nama_kriteria, id: k.id_kriteria, kolom });
                }
            });

            if (kolomKriteria.length === 0) {
                return simpanFlashDanRedirect(
                    req, res, 'error',
                    'Import gagal: tidak ada satu pun kolom kriteria yang cocok dengan header di file. Unduh template terbaru lalu isi ulang.',
                    [
                        { judul: 'Kolom kriteria yang dibutuhkan', items: kriteriaList.map(k => k.nama_kriteria) },
                        { judul: 'Kolom yang terbaca di file', items: headerTerbaca }
                    ]
                );
            }

            const dataToSave = [];
            const nisnKosong = [];
            const nisnTidakDitemukan = [];
            const nilaiTidakValid = [];
            const siswaDilewati = [];
            const nilaiDikunci = [];

            for (let idx = 0; idx < jsonData.length; idx++) {
                const row = jsonData[idx];
                const baris = idx + 2; // baris 1 = header
                let nisn = bersihkanNisn(row[kolomNisn]);

                if (!nisn) {
                    nisnKosong.push(`Baris ${baris}: kolom NISN kosong`);
                    continue;
                }

                let siswa = await nilaiModel.getSiswaByNisn(nisn, periode.id_periode);

                // Excel sering menghapus angka 0 di depan NISN. Coba lagi dengan 0 di depan.
                if (!siswa && /^\d{1,9}$/.test(nisn)) {
                    const nisnLengkap = nisn.padStart(10, '0');
                    const siswaLengkap = await nilaiModel.getSiswaByNisn(nisnLengkap, periode.id_periode);
                    if (siswaLengkap) {
                        siswa = siswaLengkap;
                        nisn = nisnLengkap;
                    }
                }

                if (!siswa) {
                    nisnTidakDitemukan.push(`Baris ${baris}: NISN ${nisn} tidak terdaftar pada periode aktif`);
                    continue;
                }

                // Hanya siswa berminat yang boleh dinilai.
                const [akunRows] = await db.query(
                    'SELECT status_minat FROM akun_siswa WHERE id_siswa = ? LIMIT 1',
                    [siswa.id_siswa]
                );
                const akun = akunRows[0];

                if (!akun || akun.status_minat !== 'berminat') {
                    const alasan = akun && akun.status_minat === 'tidak_berminat'
                        ? 'siswa tidak berminat, jadi tidak ikut dinilai'
                        : 'siswa belum berminat atau belum merespons';
                    siswaDilewati.push(`Baris ${baris} (NISN ${nisn}): ${alasan}`);
                    continue;
                }

                // Nilai yang sudah tersimpan untuk siswa ini (dipakai untuk mengunci isian siswa).
                const nilaiLama = await ambilNilaiLamaSiswa(siswa.id_siswa);

                for (const kr of kolomKriteria) {
                    const rawVal = row[kr.kolom];

                    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;

                    const skala = skalaKriteria(kr.nama);
                    const hasil = parseNilai(rawVal, skala);

                    // Isian siswa yang sudah terisi: TIDAK boleh diubah operator.
                    const lama = nilaiLama.get(Number(kr.id));
                    if (isKriteriaIsianSiswa(kr.nama) && adaNilai(lama)) {
                        // Nilai di file sama dengan yang tersimpan: abaikan tanpa pesan.
                        if (hasil.ok && nilaiSama(lama, hasil.nilai)) continue;

                        nilaiDikunci.push(
                            `Baris ${baris} (NISN ${nisn}), kolom "${kr.nama}": nilai ini sudah diisi siswa (${tampilNilaiPesan(lama)}) dan tidak bisa diubah operator (nilai di file: "${String(rawVal).trim()}")`
                        );
                        continue;
                    }

                    if (!hasil.ok) {
                        if (hasil.kosong) continue;
                        nilaiTidakValid.push(
                            `Baris ${baris} (NISN ${nisn}), kolom "${kr.nama}": ${hasil.alasan} (nilai diinput: "${String(rawVal).trim()}")`
                        );
                        continue;
                    }

                    dataToSave.push({
                        id_siswa: siswa.id_siswa,
                        nisn,
                        id_kriteria: kr.id,
                        nilai_mentah: hasil.nilai
                    });
                }
            }

            const kelompok = [
                { judul: 'Kolom kriteria tidak ada di file (dilewati)', items: kriteriaHilang.map(n => `Kolom "${n}" tidak ditemukan`) },
                { judul: 'Baris tanpa NISN', items: nisnKosong },
                { judul: 'NISN tidak ditemukan', items: nisnTidakDitemukan },
                { judul: 'Siswa dilewati', items: siswaDilewati },
                { judul: 'Nilai isian siswa terkunci (tidak diubah)', items: nilaiDikunci },
                { judul: 'Nilai tidak valid', items: nilaiTidakValid }
            ];

            const ringkasMasalah = [];
            if (kriteriaHilang.length) ringkasMasalah.push(`${kriteriaHilang.length} kolom kriteria tidak ada di file`);
            if (nisnKosong.length) ringkasMasalah.push(`${nisnKosong.length} baris tanpa NISN`);
            if (nisnTidakDitemukan.length) ringkasMasalah.push(`${nisnTidakDitemukan.length} NISN tidak ditemukan`);
            if (siswaDilewati.length) ringkasMasalah.push(`${siswaDilewati.length} siswa dilewati`);
            if (nilaiDikunci.length) ringkasMasalah.push(`${nilaiDikunci.length} nilai isian siswa terkunci dan tidak diubah`);
            if (nilaiTidakValid.length) ringkasMasalah.push(`${nilaiTidakValid.length} nilai tidak valid`);

            if (dataToSave.length === 0) {
                const ringkasan = ringkasMasalah.length > 0
                    ? `Tidak ada nilai yang bisa disimpan. Penyebab: ${ringkasMasalah.join(', ')}. Klik "Lihat rincian" untuk melihat baris dan kolom yang bermasalah.`
                    : 'Tidak ada nilai baru yang perlu disimpan. Semua sel nilai di file masih kosong atau sama dengan nilai yang sudah tersimpan.';

                return simpanFlashDanRedirect(req, res, 'error', ringkasan, kelompok);
            }

            const hasilSimpan = await nilaiModel.bulkUpsertNilai(dataToSave);

            if (hasilSimpan.gagal > 0) {
                kelompok.push({ judul: 'Gagal disimpan ke database', items: hasilSimpan.pesanGagal });
                ringkasMasalah.push(`${hasilSimpan.gagal} data gagal disimpan ke database`);
            }

            const jumlahSiswaTersimpan = new Set(dataToSave.map(d => d.id_siswa)).size;

            await userModel.logActivity(
                req.session.user.id_user,
                `Mengimpor nilai siswa dari Excel (${hasilSimpan.berhasil} data berhasil)`
            );

            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            let ringkasan = `Import nilai selesai: ${hasilSimpan.berhasil} nilai dari ${jumlahSiswaTersimpan} siswa berhasil disimpan.`;

            if (ringkasMasalah.length > 0) {
                ringkasan += ` Namun ada yang tidak bisa diproses: ${ringkasMasalah.join(', ')}. Klik "Lihat rincian" untuk melihat penyebabnya.`;
            }

            return simpanFlashDanRedirect(
                req, res,
                ringkasMasalah.length > 0 ? 'sebagian' : 'sukses',
                ringkasan,
                kelompok
            );
        } catch (error) {
            console.error('ERROR IMPORT NILAI:', error);
            hapusFileUpload(req);

            return kembaliError(
                'Gagal membaca atau mengimpor file Excel. Pastikan file berformat .xlsx/.xls sesuai template dan tidak rusak, lalu coba lagi.'
            );
        }
    }
};

module.exports = nilaiController;