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
    }
};

module.exports = kriteriaModel;