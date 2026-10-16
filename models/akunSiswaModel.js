const crypto = require('crypto');
const db = require('../config/database');

// Mendukung koneksi mysql2 pool maupun promise pool.
const raw = db.pool || db;
const pool = typeof raw.promise === 'function' ? raw.promise() : raw;

// Nama kriteria yang dijawab sendiri oleh siswa (harus sama dengan tabel kriteria).
const KRITERIA_SISWA = [
    'Minat Belajar Teknologi',
    'Kepemilikan Perangkat Digital',
    'Kondisi Ekonomi Keluarga'
];

// ---------------------------------------------------------------------------
// Enkripsi password awal (untuk cetak kartu). AES-256-GCM.
// Set KARTU_SECRET di .env.
// ---------------------------------------------------------------------------
function kunciEnkripsi() {
    return crypto
        .createHash('sha256')
        .update(String(process.env.KARTU_SECRET || process.env.SESSION_SECRET || 'ganti-secret-ini'))
        .digest();
}

function enkripsi(teks) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', kunciEnkripsi(), iv);
    const enc = Buffer.concat([cipher.update(String(teks), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, enc].map(b => b.toString('base64')).join('.');
}

function dekripsi(nilai) {
    if (!nilai) return null;
    try {
        const [iv, tag, enc] = String(nilai).split('.').map(p => Buffer.from(p, 'base64'));
        const decipher = crypto.createDecipheriv('aes-256-gcm', kunciEnkripsi(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch (e) {
        return null;
    }
}

// Hasil dianggap final jika periode sudah selesai (hasil + periode difinalisasi bersamaan).
function hitungHasilFinal(row) {
    return row.status_penyelesaian === 'selesai';
}

const akunSiswaModel = {
    KRITERIA_SISWA,

    // =========================================================
    // PERIODE DAN DATA AKUN
    // =========================================================

    async getPeriodeAktifId() {
        const [rows] = await pool.query(
            `SELECT id_periode FROM periode_seleksi
             WHERE status_periode = 'aktif'
             ORDER BY id_periode DESC LIMIT 1`
        );
        return rows.length ? rows[0].id_periode : null;
    },

    async hitungSiswaPeriode(id_periode) {
        const [rows] = await pool.query(
            'SELECT COUNT(*) AS total FROM siswa WHERE id_periode = ?',
            [id_periode]
        );
        return Number(rows[0].total || 0);
    },

    async getSiswaTanpaAkun(id_periode) {
        const [rows] = await pool.query(
            `SELECT s.id_siswa, s.nisn, s.nama, s.sekolah_asal
             FROM siswa s
             LEFT JOIN akun_siswa a ON a.id_siswa = s.id_siswa
             WHERE s.id_periode = ? AND a.id_akun_siswa IS NULL
             ORDER BY s.id_siswa`,
            [id_periode]
        );
        return rows;
    },

    // rows: [{ id_siswa, username, passwordHash, passwordAwal }]
    // Akun + password awal terenkripsi dibuat dalam satu transaksi.
    async createBulk(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return 0;

        const conn = await pool.getConnection();

        try {
            await conn.beginTransaction();

            const BATCH = 500;
            let dibuat = 0;

            for (let i = 0; i < rows.length; i += BATCH) {
                const potongan = rows.slice(i, i + BATCH).map(r => [
                    r.id_siswa,
                    r.username,
                    r.passwordHash,
                    1,
                    r.passwordAwal ? enkripsi(r.passwordAwal) : null
                ]);

                const [hasil] = await conn.query(
                    `INSERT INTO akun_siswa
                        (id_siswa, username, password, wajib_ganti_password, password_awal_enc)
                     VALUES ?`,
                    [potongan]
                );

                dibuat += hasil.affectedRows;
            }

            await conn.commit();
            return dibuat;
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    },

    // Siswa yang SUDAH punya nilai otomatis dianggap berminat
    // (tidak perlu menunggu respons siswa). Mengembalikan jumlah siswa yang diubah.
    async syncMinatDariNilai(id_periode) {
        const [hasil] = await pool.query(
            `UPDATE akun_siswa a
             INNER JOIN siswa s ON s.id_siswa = a.id_siswa
             SET a.status_minat = 'berminat',
                 a.tanggal_respon_minat = COALESCE(a.tanggal_respon_minat, NOW())
             WHERE s.id_periode = ?
               AND a.status_minat = 'belum_respon'
               AND a.status_akun = 'aktif'
               AND EXISTS (
                    SELECT 1
                    FROM nilai_siswa ns
                    INNER JOIN kriteria k ON k.id_kriteria = ns.id_kriteria
                    WHERE ns.id_siswa = s.id_siswa
                      AND k.id_periode = s.id_periode
                      AND ns.nilai_mentah IS NOT NULL
               )`,
            [id_periode]
        );
        return hasil.affectedRows;
    },

    async findByIdSiswa(id_siswa) {
        const [rows] = await pool.query(
            `SELECT a.*, s.nama, s.nisn, s.id_periode
             FROM akun_siswa a
             INNER JOIN siswa s ON s.id_siswa = a.id_siswa
             WHERE a.id_siswa = ? LIMIT 1`,
            [id_siswa]
        );
        return rows.length ? rows[0] : null;
    },

    // Reset password oleh operator (password harus sudah berupa hash).
    async updatePassword(id_siswa, passwordHash) {
        const [hasil] = await pool.query(
            `UPDATE akun_siswa
             SET password = ?, wajib_ganti_password = 1
             WHERE id_siswa = ?`,
            [passwordHash, id_siswa]
        );
        return hasil.affectedRows;
    },

    async simpanPasswordAwal(id_siswa, passwordPlain) {
        const [hasil] = await pool.query(
            'UPDATE akun_siswa SET password_awal_enc = ? WHERE id_siswa = ?',
            [enkripsi(passwordPlain), id_siswa]
        );
        return hasil.affectedRows;
    },

    // Data satu kartu. password_awal = null jika siswa sudah mengganti password.
    async getDataKartu(id_siswa) {
        const [rows] = await pool.query(
            `SELECT s.id_siswa, s.id_periode, s.nama, s.nisn, s.sekolah_asal,
                    a.username, a.status_akun, a.wajib_ganti_password, a.password_awal_enc
             FROM akun_siswa a
             INNER JOIN siswa s ON s.id_siswa = a.id_siswa
             WHERE a.id_siswa = ? LIMIT 1`,
            [id_siswa]
        );

        if (!rows.length) return null;

        const r = rows[0];
        r.password_awal = dekripsi(r.password_awal_enc);
        delete r.password_awal_enc;
        return r;
    },

    // Semua kartu pada satu periode.
    async getDataKartuSemua(id_periode) {
        const [rows] = await pool.query(
            `SELECT s.id_siswa, s.id_periode, s.nama, s.nisn, s.sekolah_asal,
                    a.username, a.status_akun, a.wajib_ganti_password, a.password_awal_enc
             FROM siswa s
             INNER JOIN akun_siswa a ON a.id_siswa = s.id_siswa
             WHERE s.id_periode = ?
             ORDER BY s.nama ASC`,
            [id_periode]
        );

        return rows.map(r => {
            const out = { ...r, password_awal: dekripsi(r.password_awal_enc) };
            delete out.password_awal_enc;
            return out;
        });
    },

    // =========================================================
    // LOGIN DAN DETAIL PORTAL SISWA
    // =========================================================

    async findForLogin(username) {
        const [rows] = await pool.query(
            `SELECT a.id_akun_siswa, a.id_siswa, a.username, a.password,
                    a.status_akun, a.wajib_ganti_password,
                    s.nama, s.nisn, s.id_periode
             FROM akun_siswa a
             INNER JOIN siswa s ON s.id_siswa = a.id_siswa
             INNER JOIN periode_seleksi p ON p.id_periode = s.id_periode
             WHERE a.username = ?
             ORDER BY (p.status_periode = 'aktif') DESC, s.id_periode DESC
             LIMIT 1`,
            [username]
        );
        return rows.length ? rows[0] : null;
    },

    async findDetailByIdSiswa(id_siswa) {
        const [rows] = await pool.query(
            `SELECT
                a.id_akun_siswa, a.id_siswa, a.username, a.password,
                a.wajib_ganti_password, a.status_akun,
                a.status_minat, a.tanggal_respon_minat, a.last_login,

                s.nama, s.nisn, s.sekolah_asal, s.status_penerimaan, s.id_periode,

                p.tahun_ajaran, p.kuota_kelas_digital, p.status_periode,
                p.status_penyelesaian, p.tanggal_mulai, p.tanggal_selesai,

                h.ranking AS ranking,
                h.status_final AS status_final_hasil
             FROM akun_siswa a
             INNER JOIN siswa s ON s.id_siswa = a.id_siswa
             INNER JOIN periode_seleksi p ON p.id_periode = s.id_periode
             LEFT JOIN hasil_waspas h
                ON h.id_hasil = (
                    SELECT MAX(h2.id_hasil) FROM hasil_waspas h2
                    WHERE h2.id_siswa = s.id_siswa AND h2.id_periode = s.id_periode
                )
             WHERE a.id_siswa = ?
             LIMIT 1`,
            [id_siswa]
        );

        if (!rows.length) return null;

        const row = rows[0];
        row.hasil_final = hitungHasilFinal(row);
        return row;
    },

    async updateLastLogin(id_akun_siswa) {
        const [hasil] = await pool.query(
            'UPDATE akun_siswa SET last_login = NOW() WHERE id_akun_siswa = ?',
            [id_akun_siswa]
        );
        return hasil.affectedRows;
    },

    // Siswa mengganti password sendiri.
    async updatePasswordSendiri(id_akun_siswa, passwordHash) {
        const [hasil] = await pool.query(
            `UPDATE akun_siswa
             SET password = ?, wajib_ganti_password = 0, password_awal_enc = NULL
             WHERE id_akun_siswa = ?`,
            [passwordHash, id_akun_siswa]
        );
        return hasil.affectedRows;
    },

    // =========================================================
    // JAWABAN KRITERIA SISWA
    // =========================================================

    async getJawaban(id_siswa, id_periode) {
        const [rows] = await pool.query(
            `SELECT k.nama_kriteria, n.nilai_mentah
             FROM kriteria k
             LEFT JOIN nilai_siswa n
                ON n.id_kriteria = k.id_kriteria AND n.id_siswa = ?
             WHERE k.id_periode = ? AND k.nama_kriteria IN (?)`,
            [id_siswa, id_periode, KRITERIA_SISWA]
        );

        const hasil = {};
        KRITERIA_SISWA.forEach(nama => { hasil[nama] = null; });

        rows.forEach(row => {
            hasil[row.nama_kriteria] =
                row.nilai_mentah === null ? null : Number(row.nilai_mentah);
        });

        return hasil;
    },

    // Simpan jawaban siswa + tandai 'berminat' dalam satu transaksi.
    // Error kode: SISWA_TIDAK_DITEMUKAN, PERIODE_TERKUNCI, AKUN_TIDAK_AKTIF,
    // MINAT_DITOLAK, KRITERIA_TIDAK_LENGKAP, NILAI_KRITERIA_TIDAK_VALID.
    async simpanJawaban(id_siswa, id_periode, jawaban) {
        const conn = await pool.getConnection();

        try {
            await conn.beginTransaction();

            // Kunci bersama baris periode: finalisasi (FOR UPDATE) akan menunggu.
            const [periodeRows] = await conn.query(
                `SELECT status_penyelesaian, status_periode
                 FROM periode_seleksi WHERE id_periode = ? LOCK IN SHARE MODE`,
                [id_periode]
            );

            if (
                !periodeRows.length ||
                periodeRows[0].status_penyelesaian === 'selesai' ||
                periodeRows[0].status_periode !== 'aktif'
            ) {
                throw new Error('PERIODE_TERKUNCI');
            }

            const [siswaRows] = await conn.query(
                `SELECT s.id_siswa, a.status_akun, a.status_minat
                 FROM siswa s
                 INNER JOIN akun_siswa a ON a.id_siswa = s.id_siswa
                 WHERE s.id_siswa = ? AND s.id_periode = ?
                 FOR UPDATE`,
                [id_siswa, id_periode]
            );

            if (!siswaRows.length) throw new Error('SISWA_TIDAK_DITEMUKAN');
            if (siswaRows[0].status_akun !== 'aktif') throw new Error('AKUN_TIDAK_AKTIF');
            if (siswaRows[0].status_minat === 'tidak_berminat') throw new Error('MINAT_DITOLAK');

            const [kriteria] = await conn.query(
                `SELECT id_kriteria, nama_kriteria
                 FROM kriteria
                 WHERE id_periode = ? AND nama_kriteria IN (?)`,
                [id_periode, KRITERIA_SISWA]
            );

            if (kriteria.length !== KRITERIA_SISWA.length) {
                throw new Error('KRITERIA_TIDAK_LENGKAP');
            }

            for (const k of kriteria) {
                const nilai = Number(jawaban[k.nama_kriteria]);

                if (!Number.isInteger(nilai) || nilai < 1 || nilai > 5) {
                    throw new Error('NILAI_KRITERIA_TIDAK_VALID');
                }

                const [ada] = await conn.query(
                    `SELECT id_nilai FROM nilai_siswa
                     WHERE id_siswa = ? AND id_kriteria = ?
                     LIMIT 1 FOR UPDATE`,
                    [id_siswa, k.id_kriteria]
                );

                if (ada.length) {
                    await conn.query(
                        'UPDATE nilai_siswa SET nilai_mentah = ?, updated_at = NOW() WHERE id_nilai = ?',
                        [nilai, ada[0].id_nilai]
                    );
                } else {
                    await conn.query(
                        `INSERT INTO nilai_siswa (id_siswa, id_kriteria, nilai_mentah, updated_at)
                         VALUES (?, ?, ?, NOW())`,
                        [id_siswa, k.id_kriteria, nilai]
                    );
                }
            }

            await conn.query(
                `UPDATE akun_siswa
                 SET status_minat = 'berminat',
                     tanggal_respon_minat = COALESCE(tanggal_respon_minat, NOW())
                 WHERE id_siswa = ?`,
                [id_siswa]
            );

            await conn.commit();
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    },

    // Siswa menekan "Ya, saya yakin": status langsung 'berminat' (belum perlu isi form).
    // Hanya bisa jika masih belum_respon, akun aktif, dan periode aktif belum final.
    // Return jumlah baris yang berubah (0 = tidak memenuhi syarat).
    async setBerminat(id_siswa) {
        const [hasil] = await pool.query(
            `UPDATE akun_siswa a
             INNER JOIN siswa s ON s.id_siswa = a.id_siswa
             INNER JOIN periode_seleksi p ON p.id_periode = s.id_periode
             SET a.status_minat = 'berminat',
                 a.tanggal_respon_minat = COALESCE(a.tanggal_respon_minat, NOW())
             WHERE a.id_siswa = ?
               AND a.status_minat = 'belum_respon'
               AND a.status_akun = 'aktif'
               AND p.status_periode = 'aktif'
               AND p.status_penyelesaian <> 'selesai'`,
            [id_siswa]
        );
        return hasil.affectedRows;
    },

    // Siswa menyatakan tidak berminat: akun dinonaktifkan, data tetap disimpan.
    // Hanya bisa jika masih belum_respon dan periode belum final.
    async setTidakBerminat(id_siswa) {
        const [hasil] = await pool.query(
            `UPDATE akun_siswa a
             INNER JOIN siswa s ON s.id_siswa = a.id_siswa
             INNER JOIN periode_seleksi p ON p.id_periode = s.id_periode
             SET a.status_minat = 'tidak_berminat',
                 a.status_akun = 'nonaktif',
                 a.tanggal_respon_minat = NOW()
             WHERE a.id_siswa = ?
               AND a.status_minat = 'belum_respon'
               AND a.status_akun = 'aktif'
               AND p.status_penyelesaian <> 'selesai'`,
            [id_siswa]
        );
        return hasil.affectedRows;
    },

    // =========================================================
    // RINGKASAN HALAMAN ADMIN
    // =========================================================

    async ringkasan(id_periode) {
        const [[r]] = await pool.query(
            `SELECT
                COUNT(*) AS total,
                COALESCE(SUM(a.id_siswa IS NULL), 0) AS tanpaAkun,
                COALESCE(SUM(a.status_akun = 'aktif'), 0) AS aktif,
                COALESCE(SUM(a.status_akun = 'nonaktif'), 0) AS nonaktif,
                COALESCE(SUM(a.status_minat = 'berminat'), 0) AS berminat,
                COALESCE(SUM(a.status_minat = 'tidak_berminat'), 0) AS tidakBerminat,
                COALESCE(SUM(a.id_siswa IS NULL OR a.status_minat = 'belum_respon'), 0) AS belumKonfirmasi
             FROM siswa s
             LEFT JOIN akun_siswa a ON a.id_siswa = s.id_siswa
             WHERE s.id_periode = ?`,
            [id_periode]
        );

        return {
            total: Number(r.total || 0),
            tanpaAkun: Number(r.tanpaAkun || 0),
            aktif: Number(r.aktif || 0),
            nonaktif: Number(r.nonaktif || 0),
            berminat: Number(r.berminat || 0),
            tidakBerminat: Number(r.tidakBerminat || 0),
            belumKonfirmasi: Number(r.belumKonfirmasi || 0)
        };
    }
};

module.exports = akunSiswaModel;