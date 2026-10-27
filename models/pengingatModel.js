const db = require('../config/database');

const TABEL_PERIODE = 'periode_seleksi';

const pengingatModel = {
    async buatTabelJikaBelum() {
        await db.query(
            `CREATE TABLE IF NOT EXISTS pengingat_periode (
                id_pengingat INT AUTO_INCREMENT PRIMARY KEY,
                id_periode INT NOT NULL,
                id_user INT NOT NULL,
                tanggal_kirim DATE NOT NULL,
                sisa_hari INT NOT NULL,
                dibuat_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_pengingat_harian (id_periode, id_user, tanggal_kirim)
            )`
        );
    },

    async getPeriodeAktifKedaluwarsa() {
        const [rows] = await db.query(
            `SELECT id_periode, tahun_ajaran, tanggal_selesai
             FROM ${TABEL_PERIODE}
             WHERE status_periode = 'aktif'
               AND tanggal_selesai IS NOT NULL
               AND tanggal_selesai < CURDATE()
               AND (status_penyelesaian IS NULL OR status_penyelesaian <> 'selesai')`
        );
        return rows;
    },

    async getPeriodeUntukPengingat(minHari, maxHari) {
        const [rows] = await db.query(
            `SELECT id_periode, tahun_ajaran, tanggal_selesai,
                    DATEDIFF(tanggal_selesai, CURDATE()) AS sisa_hari
             FROM ${TABEL_PERIODE}
             WHERE status_periode = 'aktif'
               AND tanggal_selesai IS NOT NULL
               AND (tanggal_mulai IS NULL OR tanggal_mulai <= CURDATE())
               AND (status_penyelesaian IS NULL OR status_penyelesaian <> 'selesai')
               AND DATEDIFF(tanggal_selesai, CURDATE()) BETWEEN ? AND ?`,
            [minHari, maxHari]
        );
        return rows;
    },

    async getPenerima() {
        const [rows] = await db.query(
            `SELECT id_user, nama, email, role
             FROM users
             WHERE status_aktif = TRUE AND email IS NOT NULL AND email <> ''`
        );
        return rows;
    },

    async klaimPengingat(id_periode, id_user, sisa_hari) {
        const [result] = await db.query(
            `INSERT IGNORE INTO pengingat_periode (id_periode, id_user, tanggal_kirim, sisa_hari)
             VALUES (?, ?, CURDATE(), ?)`,
            [id_periode, id_user, sisa_hari]
        );
        return result.affectedRows === 1;
    },

    async batalkanKlaim(id_periode, id_user) {
        await db.query(
            `DELETE FROM pengingat_periode
             WHERE id_periode = ? AND id_user = ? AND tanggal_kirim = CURDATE()`,
            [id_periode, id_user]
        );
    },

    async hapusKlaimHariIni() {
        const [result] = await db.query(
            `DELETE FROM pengingat_periode WHERE tanggal_kirim = CURDATE()`
        );
        return result.affectedRows;
    }
};

module.exports = pengingatModel;