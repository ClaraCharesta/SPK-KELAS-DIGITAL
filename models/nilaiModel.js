const db = require('../config/database');

const nilaiModel = {
    async getSiswaWithNilaiStatus(id_periode) {
        // Ambil semua siswa + hitung berapa kriteria yang sudah terisi nilainya
        const [rows] = await db.query(
            `SELECT s.id_siswa, s.nisn, s.nama,
                    COUNT(ns.id_nilai) AS jumlah_terisi,
                    (SELECT COUNT(*) FROM kriteria WHERE id_periode = ?) AS total_kriteria
             FROM siswa s
             LEFT JOIN nilai_siswa ns ON s.id_siswa = ns.id_siswa
             WHERE s.id_periode = ?
             GROUP BY s.id_siswa
             ORDER BY s.nama ASC`,
            [id_periode, id_periode]
        );
        return rows;
    },

    async getSiswaById(id_siswa) {
        const [rows] = await db.query('SELECT * FROM siswa WHERE id_siswa = ?', [id_siswa]);
        return rows[0];
    },

    async getKriteriaWithNilai(id_siswa, id_periode) {
        // Ambil semua kriteria periode ini, JOIN dengan nilai siswa (kalau ada)
        const [rows] = await db.query(
            `SELECT k.id_kriteria, k.nama_kriteria, k.jenis,
                    ns.id_nilai, ns.nilai_mentah, ns.sumber_data
             FROM kriteria k
             LEFT JOIN nilai_siswa ns ON k.id_kriteria = ns.id_kriteria AND ns.id_siswa = ?
             WHERE k.id_periode = ?
             ORDER BY k.id_kriteria ASC`,
            [id_siswa, id_periode]
        );
        return rows;
    },

    async upsertNilai(id_siswa, id_kriteria, nilai_mentah, sumber_data) {
        // Cek dulu apakah sudah ada nilai untuk kombinasi siswa+kriteria ini
        const [existing] = await db.query(
            'SELECT id_nilai FROM nilai_siswa WHERE id_siswa = ? AND id_kriteria = ?',
            [id_siswa, id_kriteria]
        );

        if (existing.length > 0) {
            await db.query(
                'UPDATE nilai_siswa SET nilai_mentah = ?, sumber_data = ? WHERE id_siswa = ? AND id_kriteria = ?',
                [nilai_mentah, sumber_data, id_siswa, id_kriteria]
            );
        } else {
            await db.query(
                'INSERT INTO nilai_siswa (id_siswa, id_kriteria, nilai_mentah, sumber_data) VALUES (?, ?, ?, ?)',
                [id_siswa, id_kriteria, nilai_mentah, sumber_data]
            );
        }
    }
};

module.exports = nilaiModel;