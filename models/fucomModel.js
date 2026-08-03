const db = require('../config/database');

const fucomModel = {
    async getKriteria(id_periode) {
        const [rows] = await db.query(
            'SELECT id_kriteria, nama_kriteria FROM kriteria WHERE id_periode = ? ORDER BY id_kriteria ASC',
            [id_periode]
        );
        return rows;
    },

    async getAllResponden(id_periode) {
        const [rows] = await db.query(
            'SELECT DISTINCT nama_responden FROM perbandingan_fucom WHERE id_periode = ?',
            [id_periode]
        );
        return rows.map(r => r.nama_responden);
    },

    async getPerbandinganByResponden(id_periode, nama_responden) {
        const [rows] = await db.query(
            `SELECT * FROM perbandingan_fucom 
             WHERE id_periode = ? AND nama_responden = ? 
             ORDER BY peringkat_asal ASC`,
            [id_periode, nama_responden]
        );
        return rows;
    },

    async deletePerbandinganByResponden(id_periode, nama_responden) {
        await db.query(
            'DELETE FROM perbandingan_fucom WHERE id_periode = ? AND nama_responden = ?',
            [id_periode, nama_responden]
        );
    },

    async savePerbandingan(id_periode, nama_responden, dataPerbandingan) {
        // dataPerbandingan = [{ id_kriteria_asal, id_kriteria_pembanding, peringkat_asal, nilai_perbandingan }, ...]
        for (const item of dataPerbandingan) {
            await db.query(
                `INSERT INTO perbandingan_fucom 
                 (id_periode, nama_responden, id_kriteria_asal, id_kriteria_pembanding, peringkat_asal, nilai_perbandingan) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id_periode, nama_responden, item.id_kriteria_asal, item.id_kriteria_pembanding, item.peringkat_asal, item.nilai_perbandingan]
            );
        }
    },

    async saveBobotFinal(id_periode, hasilBobot, dfc) {
        // Hapus bobot lama untuk periode ini (kalau ada, misal hitung ulang)
        await db.query('DELETE FROM bobot_kriteria WHERE id_periode = ?', [id_periode]);

        for (const item of hasilBobot) {
            await db.query(
                'INSERT INTO bobot_kriteria (id_kriteria, id_periode, nilai_bobot, nilai_dfc) VALUES (?, ?, ?, ?)',
                [item.id_kriteria, id_periode, item.bobot, dfc]
            );
        }
    },

    async getBobotFinal(id_periode) {
        const [rows] = await db.query(
            `SELECT bk.*, k.nama_kriteria FROM bobot_kriteria bk 
             JOIN kriteria k ON bk.id_kriteria = k.id_kriteria 
             WHERE bk.id_periode = ? ORDER BY bk.nilai_bobot DESC`,
            [id_periode]
        );
        return rows;
    }
};

module.exports = fucomModel;