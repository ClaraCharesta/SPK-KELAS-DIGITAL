const db = require('../config/database');
const nilaiModel = require('../models/nilaiModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');
const kriteriaModel = require('../models/kriteriaModel');
const akunSiswaModel = require('../models/akunSiswaModel');
const waspasModel = require('../models/waspasModel');
const { generateTemplateNilai } = require('../utils/templateGenerator');
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

// Nilai dari form hanya boleh angka murni: digit, lalu (opsional) titik dan 1-2 digit desimal.
// Menolak huruf, spasi di tengah, tanda minus/plus, dan notasi seperti "1e2" atau "0x10".
const REGEX_ANGKA_NILAI = /^\d+(\.\d{1,2})?$/;

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
                : Number(r.nilai_mentah)
    }));
}

const nilaiController = {
    // =========================================================
    // GET /operator/nilai
    // =========================================================
    async index(req, res) {
        try {
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
                return redirectError('Data nilai tidak lengkap atau format form tidak valid.');
            }

            // ID kriteria valid dan tidak duplikat.
            const idUnik = new Set();
            for (const id of idKriteriaArr) {
                if (!/^[1-9]\d*$/.test(String(id)) || idUnik.has(String(id))) {
                    return redirectError('Daftar kriteria tidak valid atau terdapat kriteria duplikat.');
                }
                idUnik.add(String(id));
            }

            // Validasi angka sebelum membuka transaksi.
            const nilaiTervalidasi = [];

            for (let i = 0; i < idKriteriaArr.length; i++) {
                const raw = nilaiArr[i];

                if (raw === undefined || raw === null || String(raw).trim() === '') {
                    return redirectError('Semua kriteria wajib memiliki nilai.');
                }

                const teksNilai = String(raw).trim();

                // Hanya angka murni. Huruf, simbol, minus, dan notasi eksponen ditolak.
                if (!REGEX_ANGKA_NILAI.test(teksNilai)) {
                    return redirectError('Nilai hanya boleh berupa angka (tanpa huruf atau simbol), desimal maksimal 2 digit.');
                }

                const nilai = Number(teksNilai);

                if (!Number.isFinite(nilai)) {
                    return redirectError('Nilai harus berupa angka yang valid.');
                }

                nilaiTervalidasi.push({
                    id_kriteria: Number(idKriteriaArr[i]),
                    nilai_mentah: nilai
                });
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

            if (
                nilaiTervalidasi.length !== kriteriaRows.length ||
                nilaiTervalidasi.some(n => !kriteriaMap.has(n.id_kriteria))
            ) {
                await conn.rollback();
                return redirectError('Daftar kriteria pada form tidak sesuai dengan periode aktif. Muat ulang form nilai.');
            }

            // Validasi skala.
            for (const item of nilaiTervalidasi) {
                const namaKriteria = kriteriaMap.get(item.id_kriteria);
                const { isSkor100, minVal, maxVal } = skalaKriteria(namaKriteria);
                const nilai = item.nilai_mentah;

                if (nilai < minVal || nilai > maxVal) {
                    await conn.rollback();
                    return redirectError(`Nilai kriteria "${namaKriteria}" harus berada pada skala ${minVal}-${maxVal}.`);
                }

                if (!isSkor100 && !Number.isInteger(nilai)) {
                    await conn.rollback();
                    return redirectError(`Nilai kriteria "${namaKriteria}" harus berupa bilangan bulat 1-5.`);
                }
            }

            // Simpan nilai.
            for (const item of nilaiTervalidasi) {
                await nilaiModel.upsertNilai(id_siswa, item.id_kriteria, item.nilai_mentah, conn);
            }

            await conn.commit();
            conn.release();
            conn = null;

            await userModel.logActivity(
                req.session.user.id_user,
                `Menginput/memperbarui nilai siswa: ${siswa.nama}`
            );

            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            return res.redirect(
                '/operator/nilai?success=' +
                encodeURIComponent(`Nilai siswa ${siswa.nama} berhasil disimpan.`)
            );
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

            const kriteriaMap = {};
            kriteriaList.forEach(k => { kriteriaMap[k.nama_kriteria] = k.id_kriteria; });

            const workbook = xlsx.readFile(req.file.path);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = xlsx.utils.sheet_to_json(sheet);

            hapusFileUpload(req);

            const dataToSave = [];
            const nisnKosong = [];
            const nisnTidakDitemukan = [];
            const nilaiTidakValid = [];
            const siswaDilewati = [];

            for (let idx = 0; idx < jsonData.length; idx++) {
                const row = jsonData[idx];
                const baris = idx + 2; // baris 1 = header
                const nisn = String(row['NISN'] || '').trim();

                if (!nisn) {
                    nisnKosong.push(`Baris ${baris}`);
                    continue;
                }

                const siswa = await nilaiModel.getSiswaByNisn(nisn, periode.id_periode);

                if (!siswa) {
                    nisnTidakDitemukan.push(`Baris ${baris} (NISN ${nisn})`);
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
                        ? 'tidak berminat'
                        : 'belum berminat';
                    siswaDilewati.push(`Baris ${baris} (NISN ${nisn}, ${alasan})`);
                    continue;
                }

                for (const namaKriteria of Object.keys(kriteriaMap)) {
                    if (row[namaKriteria] === undefined || row[namaKriteria] === '') continue;

                    const rawVal = row[namaKriteria];
                    const { isSkor100, minVal, maxVal } = skalaKriteria(namaKriteria);
                    const nilaiNumerik = Number(rawVal);

                    const isNumberValid =
                        typeof rawVal === 'number' ||
                        (typeof rawVal === 'string' && /^-?\d*\.?\d+$/.test(rawVal.trim()));

                    let alasanGagal = null;

                    if (!isNumberValid || !Number.isFinite(nilaiNumerik)) {
                        alasanGagal = 'nilai bukan angka';
                    } else if (nilaiNumerik < minVal || nilaiNumerik > maxVal) {
                        alasanGagal = `nilai di luar skala (harus ${minVal}-${maxVal})`;
                    } else if (!isSkor100 && !Number.isInteger(nilaiNumerik)) {
                        alasanGagal = 'skala 1-5 harus bilangan bulat, tanpa desimal';
                    }

                    if (alasanGagal) {
                        nilaiTidakValid.push(
                            `Baris ${baris} (NISN ${nisn}) - kolom "${namaKriteria}": ${alasanGagal} (nilai diinput: "${rawVal}")`
                        );
                        continue;
                    }

                    dataToSave.push({
                        id_siswa: siswa.id_siswa,
                        nisn,
                        id_kriteria: kriteriaMap[namaKriteria],
                        nilai_mentah: nilaiNumerik
                    });
                }
            }

            const formatDetail = (list, batas) => {
                const dipotong = list.slice(0, batas);
                const sisa = list.length - dipotong.length;
                const teks = dipotong.join(' || ');
                return sisa > 0 ? `${teks} || dan ${sisa} lainnya` : teks;
            };

            if (dataToSave.length === 0) {
                let pesan = 'Tidak ada data nilai valid yang bisa disimpan.';
                if (nisnKosong.length) pesan += ` Kolom NISN kosong pada: ${formatDetail(nisnKosong, 10)}.`;
                if (nisnTidakDitemukan.length) pesan += ` NISN tidak ditemukan pada: ${formatDetail(nisnTidakDitemukan, 10)}.`;
                if (siswaDilewati.length) pesan += ` Siswa dilewati: ${formatDetail(siswaDilewati, 10)}.`;
                if (nilaiTidakValid.length) pesan += ` Detail kegagalan nilai: ${formatDetail(nilaiTidakValid, 10)}.`;
                return kembaliError(pesan);
            }

            const hasil = await nilaiModel.bulkUpsertNilai(dataToSave);

            await userModel.logActivity(
                req.session.user.id_user,
                `Mengimpor nilai siswa dari Excel (${hasil.berhasil} data berhasil)`
            );

            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            let pesan = `Import nilai selesai: ${hasil.berhasil} data berhasil disimpan.`;
            if (nisnKosong.length) pesan += ` ${nisnKosong.length} baris dilewati karena NISN kosong (${formatDetail(nisnKosong, 10)}).`;
            if (nisnTidakDitemukan.length) pesan += ` ${nisnTidakDitemukan.length} NISN tidak ditemukan (${formatDetail(nisnTidakDitemukan, 10)}).`;
            if (siswaDilewati.length) pesan += ` ${siswaDilewati.length} siswa dilewati (${formatDetail(siswaDilewati, 10)}).`;
            if (nilaiTidakValid.length) pesan += ` ${nilaiTidakValid.length} nilai gagal disimpan (${formatDetail(nilaiTidakValid, 10)}).`;

            return res.redirect('/operator/nilai?success=' + encodeURIComponent(pesan));
        } catch (error) {
            console.error('ERROR IMPORT NILAI:', error);
            hapusFileUpload(req);

            return kembaliError(
                'Gagal membaca atau mengimpor file Excel. Pastikan format sesuai template dan periksa log server.'
            );
        }
    }
};

module.exports = nilaiController;