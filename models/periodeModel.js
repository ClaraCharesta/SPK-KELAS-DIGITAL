const db = require('../config/database');

const periodeModel = {
    async getAll() {
        const [rows] = await db.query('SELECT * FROM periode_seleksi ORDER BY id_periode DESC');
        return rows;
    },

    async getActivePeriode() {
        const [rows] = await db.query("SELECT * FROM periode_seleksi WHERE status_periode = 'aktif' LIMIT 1");
        return rows[0];
    },

    async create(data) {
        const { tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai } = data;
        // Nonaktifkan semua periode lain dulu supaya cuma 1 yang aktif
        await db.query("UPDATE periode_seleksi SET status_periode = 'ditutup'");
        const [result] = await db.query(
            `INSERT INTO periode_seleksi (tahun_ajaran, kuota_kelas_digital, status_periode, tanggal_mulai, tanggal_selesai) 
             VALUES (?, ?, 'aktif', ?, ?)`,
            [tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai]
        );
        return result.insertId;
    },

    async setActive(id_periode) {
        await db.query("UPDATE periode_seleksi SET status_periode = 'ditutup'");
        await db.query("UPDATE periode_seleksi SET status_periode = 'aktif' WHERE id_periode = ?", [id_periode]);
    },

    async close(id_periode) {
        await db.query("UPDATE periode_seleksi SET status_periode = 'ditutup' WHERE id_periode = ?", [id_periode]);
    }
};

module.exports = periodeModel;