const db = require('../config/database');

// Tanggal hari ini (zona waktu server) dalam format 'YYYY-MM-DD'.
function hariIniLokal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const periodeModel = {
    async getAll() {
        const [rows] = await db.query(
            `SELECT *,
                    DATE_FORMAT(tanggal_mulai, '%Y-%m-%d') AS tanggal_mulai_str,
                    DATE_FORMAT(tanggal_selesai, '%Y-%m-%d') AS tanggal_selesai_str
             FROM periode_seleksi
             ORDER BY id_periode DESC`
        );
        return rows;
    },

    // Sebelum mengambil periode aktif, status disinkronkan dulu dengan tanggal di database,
    // jadi semua halaman yang memakai fungsi ini selalu melihat status terbaru.
    async getActivePeriode() {
        try {
            await periodeModel.sinkronkanDenganTanggal();
        } catch (e) {
            console.error('[PERIODE] Gagal sinkronisasi status periode:', e);
        }

        const [rows] = await db.query("SELECT * FROM periode_seleksi WHERE status_periode = 'aktif' LIMIT 1");
        return rows[0];
    },

    async create(data) {
        const { tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai } = data;
        await db.query("UPDATE periode_seleksi SET status_periode = 'ditutup'");
        const [result] = await db.query(
            `INSERT INTO periode_seleksi (tahun_ajaran, kuota_kelas_digital, status_periode, tanggal_mulai, tanggal_selesai)
             VALUES (?, ?, 'aktif', ?, ?)`,
            [tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai]
        );
        return result.insertId;
    },

    async existsByTahunAjaran(tahun_ajaran, excludeId = null) {
        let query = 'SELECT id_periode FROM periode_seleksi WHERE LOWER(TRIM(tahun_ajaran)) = LOWER(TRIM(?))';
        const params = [tahun_ajaran];
        if (excludeId) {
            query += ' AND id_periode != ?';
            params.push(excludeId);
        }
        const [rows] = await db.query(query, params);
        return rows.length > 0;
    },

    async updateKuota(id_periode, kuota_baru) {
        await db.query(
            'UPDATE periode_seleksi SET kuota_kelas_digital = ? WHERE id_periode = ?',
            [kuota_baru, id_periode]
        );
    },

    async close(id_periode) {
        await db.query(
            "UPDATE periode_seleksi SET status_periode = 'ditutup' WHERE id_periode = ?",
            [id_periode]
        );
    },

    async getLatestId() {
        const [rows] = await db.query('SELECT id_periode FROM periode_seleksi ORDER BY id_periode DESC LIMIT 1');
        return rows.length > 0 ? rows[0].id_periode : null;
    },

    async update(id_periode, data) {
        const { tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai } = data;
        await db.query(
            'UPDATE periode_seleksi SET tahun_ajaran = ?, kuota_kelas_digital = ?, tanggal_mulai = ?, tanggal_selesai = ? WHERE id_periode = ?',
            [tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai, id_periode]
        );
    },

    async deleteCascade(id_periode) {
        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            await conn.query('DELETE FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
            await conn.query('DELETE FROM bobot_kriteria WHERE id_periode = ?', [id_periode]);
            await conn.query('DELETE FROM perbandingan_fucom WHERE id_periode = ?', [id_periode]);
            await conn.query(
                'DELETE FROM nilai_siswa WHERE id_siswa IN (SELECT id_siswa FROM siswa WHERE id_periode = ?)',
                [id_periode]
            );
            await conn.query(
                'DELETE FROM akun_siswa WHERE id_siswa IN (SELECT id_siswa FROM siswa WHERE id_periode = ?)',
                [id_periode]
            );
            await conn.query('DELETE FROM siswa WHERE id_periode = ?', [id_periode]);
            await conn.query('DELETE FROM kriteria WHERE id_periode = ?', [id_periode]);
            await conn.query('DELETE FROM periode_seleksi WHERE id_periode = ?', [id_periode]);

            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async getStatusPenyelesaian(id_periode) {
        const [[row]] = await db.query('SELECT status_penyelesaian FROM periode_seleksi WHERE id_periode = ?', [id_periode]);
        return row ? row.status_penyelesaian : null;
    },

    async tutupManual(id_periode) {
        await db.query(
            "UPDATE periode_seleksi SET status_periode = 'ditutup' WHERE id_periode = ?",
            [id_periode]
        );
    },

    async getLatestPeriode() {
        const [rows] = await db.query('SELECT * FROM periode_seleksi ORDER BY id_periode DESC LIMIT 1');
        return rows[0];
    },

    // Tutup semua periode aktif yang tanggal selesainya sudah lewat (sebelum hari ini).
    // hariIniStr format 'YYYY-MM-DD' (dihitung di sisi aplikasi supaya tidak bergantung timezone MySQL).
    // Return: jumlah periode yang baru saja ditutup.
    async tutupPeriodeKedaluwarsa(hariIniStr) {
        const [hasil] = await db.query(
            `UPDATE periode_seleksi
             SET status_periode = 'ditutup'
             WHERE status_periode = 'aktif'
               AND tanggal_selesai IS NOT NULL
               AND tanggal_selesai < ?`,
            [hariIniStr]
        );
        return hasil.affectedRows;
    },

    async nonaktifkanAkunPeriodeDitutup() {
        const [hasil] = await db.query(
            `UPDATE akun_siswa a
             INNER JOIN siswa s ON s.id_siswa = a.id_siswa
             INNER JOIN periode_seleksi p ON p.id_periode = s.id_periode
             SET a.status_akun = 'nonaktif'
             WHERE p.status_periode = 'ditutup'
               AND a.status_akun = 'aktif'`
        );
        return hasil.affectedRows;
    },

    async aktifkanKembaliAkunPeriode(id_periode) {
        const [hasil] = await db.query(
            `UPDATE akun_siswa a
             INNER JOIN siswa s ON s.id_siswa = a.id_siswa
             SET a.status_akun = 'aktif'
             WHERE s.id_periode = ?
               AND a.status_akun = 'nonaktif'
               AND a.status_minat <> 'tidak_berminat'`,
            [id_periode]
        );
        return hasil.affectedRows;
    },

    // =========================================================
    // Sinkronisasi DUA ARAH antara tanggal di database dan status periode.
    //
    // 1) Periode aktif yang tanggal selesainya sudah lewat  -> ditutup.
    // 2) Periode TERBARU yang berstatus ditutup tetapi tanggal selesainya
    //    belum lewat (misal tanggal di database dimajukan lagi) -> diaktifkan kembali,
    //    dan akun siswanya diaktifkan kembali.
    // 3) Akun siswa dari semua periode yang ditutup -> dinonaktifkan.
    //
    // Hanya periode terbaru yang bisa dibuka otomatis, supaya periode lama
    // tidak ikut aktif dan tidak pernah ada dua periode aktif sekaligus.
    // Periode tanpa tanggal selesai tidak dibuka otomatis.
    //
    // Return: { ditutup, dibuka, akunDinonaktifkan, akunDiaktifkan }
    // =========================================================
    async sinkronkanDenganTanggal(hariIniStr = null) {
        const hariIni = hariIniStr || hariIniLokal();
        const hasil = { ditutup: 0, dibuka: 0, akunDinonaktifkan: 0, akunDiaktifkan: 0 };

        // 1) Tutup yang sudah kedaluwarsa.
        hasil.ditutup = await periodeModel.tutupPeriodeKedaluwarsa(hariIni);

        // 2) Buka kembali periode terbaru jika tanggalnya masih berlaku.
        const [terbaruRows] = await db.query(
            'SELECT id_periode, status_periode FROM periode_seleksi ORDER BY id_periode DESC LIMIT 1'
        );
        const terbaru = terbaruRows[0];

        if (terbaru && terbaru.status_periode !== 'aktif') {
            const [masihBerlaku] = await db.query(
                `SELECT id_periode FROM periode_seleksi
                 WHERE id_periode = ?
                   AND tanggal_selesai IS NOT NULL
                   AND tanggal_selesai >= ?`,
                [terbaru.id_periode, hariIni]
            );

            if (masihBerlaku.length > 0) {
                // Pastikan tidak ada periode lain yang aktif.
                await db.query(
                    "UPDATE periode_seleksi SET status_periode = 'ditutup' WHERE id_periode <> ? AND status_periode = 'aktif'",
                    [terbaru.id_periode]
                );

                const [dibuka] = await db.query(
                    "UPDATE periode_seleksi SET status_periode = 'aktif' WHERE id_periode = ?",
                    [terbaru.id_periode]
                );
                hasil.dibuka = dibuka.affectedRows;

                hasil.akunDiaktifkan = await periodeModel.aktifkanKembaliAkunPeriode(terbaru.id_periode);
            }
        }

        // 3) Akun dari periode yang ditutup dinonaktifkan.
        hasil.akunDinonaktifkan = await periodeModel.nonaktifkanAkunPeriodeDitutup();

        return hasil;
    },

    async getTahunAwalTerbesar(excludeId = null) {
        let query = 'SELECT tahun_ajaran FROM periode_seleksi';
        const params = [];

        if (excludeId) {
            query += ' WHERE id_periode != ?';
            params.push(excludeId);
        }

        const [rows] = await db.query(query, params);

        let maks = null;

        rows.forEach(r => {
            const m = String(r.tahun_ajaran || '').match(/^(\d{4})\/(\d{4})$/);
            if (!m) return;
            const awal = Number(m[1]);
            if (maks === null || awal > maks) maks = awal;
        });

        return maks;
    }
};

module.exports = periodeModel;