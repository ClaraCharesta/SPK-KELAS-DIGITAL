const db = require('../config/database');

const kriteriaModel = {
    async getAll(id_periode) {
        const [rows] = await db.query(
            'SELECT * FROM kriteria WHERE id_periode = ? ORDER BY id_kriteria ASC',
            [id_periode]
        );
        return rows;
    },

    async getById(id_kriteria) {
        const [rows] = await db.query('SELECT * FROM kriteria WHERE id_kriteria = ?', [id_kriteria]);
        return rows[0];
    },

    async create(data) {
        const { id_periode, nama_kriteria, jenis, keterangan } = data;
        const [result] = await db.query(
            'INSERT INTO kriteria (id_periode, nama_kriteria, jenis, keterangan) VALUES (?, ?, ?, ?)',
            [id_periode, nama_kriteria, jenis, keterangan]
        );
        return result.insertId;
    },

    async update(id_kriteria, data) {
        const { nama_kriteria, jenis, keterangan } = data;
        await db.query(
            'UPDATE kriteria SET nama_kriteria = ?, jenis = ?, keterangan = ? WHERE id_kriteria = ?',
            [nama_kriteria, jenis, keterangan, id_kriteria]
        );
    },

    async delete(id_kriteria) {
        await db.query('DELETE FROM kriteria WHERE id_kriteria = ?', [id_kriteria]);
    },

    async countByPeriode(id_periode) {
        const [[{ jumlah }]] = await db.query(
            'SELECT COUNT(*) AS jumlah FROM kriteria WHERE id_periode = ?', [id_periode]
        );
        return jumlah;
    },

    async checkNamaExists(id_periode, nama_kriteria, excludeId = null) {
        let query = 'SELECT id_kriteria FROM kriteria WHERE id_periode = ? AND LOWER(nama_kriteria) = LOWER(?)';
        const params = [id_periode, nama_kriteria];

        if (excludeId) {
            query += ' AND id_kriteria != ?';
            params.push(excludeId);
        }

        const [rows] = await db.query(query, params);
        return rows.length > 0;
    },

    async checkSedangDipakai(id_kriteria) {
        const [[{ jumlahNilai }]] = await db.query(
            'SELECT COUNT(*) AS jumlahNilai FROM nilai_siswa WHERE id_kriteria = ?', [id_kriteria]
        );
        const [[{ jumlahBobot }]] = await db.query(
            'SELECT COUNT(*) AS jumlahBobot FROM bobot_kriteria WHERE id_kriteria = ?', [id_kriteria]
        );
        const [[{ jumlahPerbandingan }]] = await db.query(
            'SELECT COUNT(*) AS jumlahPerbandingan FROM perbandingan_fucom WHERE id_kriteria_asal = ? OR id_kriteria_pembanding = ?',
            [id_kriteria, id_kriteria]
        );

        return jumlahNilai > 0 || jumlahBobot > 0 || jumlahPerbandingan > 0;
    },

    async checkPerankinganDimulai(id_periode) {
        const [[{ jumlah }]] = await db.query('SELECT COUNT(*) AS jumlah FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
        return jumlah > 0;
    }
};

module.exports = kriteriaModel;