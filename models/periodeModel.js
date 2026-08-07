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

    async setActive(id_periode) {
        await db.query("UPDATE periode_seleksi SET status_periode = 'ditutup'");
        await db.query("UPDATE periode_seleksi SET status_periode = 'aktif' WHERE id_periode = ?", [id_periode]);
    },

    async updateKuota(id_periode, kuota_baru) {
        await db.query(
            'UPDATE periode_seleksi SET kuota_kelas_digital = ? WHERE id_periode = ?',
            [kuota_baru, id_periode]
        );
    },

    async close(id_periode) {
        await db.query("UPDATE periode_seleksi SET status_periode = 'ditutup' WHERE id_periode = ?", [id_periode]);
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
        await db.query('DELETE FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
        await db.query('DELETE FROM bobot_kriteria WHERE id_periode = ?', [id_periode]);
        await db.query('DELETE FROM perbandingan_fucom WHERE id_periode = ?', [id_periode]);
        await db.query('DELETE FROM nilai_siswa WHERE id_siswa IN (SELECT id_siswa FROM siswa WHERE id_periode = ?)', [id_periode]);
        await db.query('DELETE FROM siswa WHERE id_periode = ?', [id_periode]);
        await db.query('DELETE FROM kriteria WHERE id_periode = ?', [id_periode]);
        await db.query('DELETE FROM periode_seleksi WHERE id_periode = ?', [id_periode]);
    },

    async getStatusPenyelesaian(id_periode) {
        const [[row]] = await db.query('SELECT status_penyelesaian FROM periode_seleksi WHERE id_periode = ?', [id_periode]);
        return row ? row.status_penyelesaian : null;
    },

    async tutupManual(id_periode) {
        await db.query("UPDATE periode_seleksi SET status_periode = 'ditutup' WHERE id_periode = ?", [id_periode]);
    },

    async getLatestPeriode() {
        const [rows] = await db.query('SELECT * FROM periode_seleksi ORDER BY id_periode DESC LIMIT 1');
        return rows[0];
    }
};

module.exports = periodeModel;