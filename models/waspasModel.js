const db = require('../config/database');

const waspasModel = {
    async getSiswaWithNilai(id_periode) {
        const [siswaRows] = await db.query(
            'SELECT id_siswa, nama FROM siswa WHERE id_periode = ?', [id_periode]
        );

        const [nilaiRows] = await db.query(
            `SELECT ns.id_siswa, ns.id_kriteria, ns.nilai_mentah 
             FROM nilai_siswa ns 
             JOIN siswa s ON ns.id_siswa = s.id_siswa 
             WHERE s.id_periode = ?`, [id_periode]
        );

        return siswaRows.map(s => {
            const nilai = {};
            nilaiRows.filter(n => n.id_siswa === s.id_siswa).forEach(n => {
                nilai[n.id_kriteria] = n.nilai_mentah !== null ? parseFloat(n.nilai_mentah) : null;
            });
            return { id_siswa: s.id_siswa, nama: s.nama, nilai };
        });
    },

    async getKriteria(id_periode) {
        const [rows] = await db.query(
            'SELECT id_kriteria, nama_kriteria, jenis FROM kriteria WHERE id_periode = ?', [id_periode]
        );
        return rows;
    },

    async getBobot(id_periode) {
        const [rows] = await db.query(
            'SELECT id_kriteria, nilai_bobot FROM bobot_kriteria WHERE id_periode = ?', [id_periode]
        );
        return rows;
    },

    async checkDataLengkap(id_periode) {
        const [[{ totalSiswa }]] = await db.query('SELECT COUNT(*) AS totalSiswa FROM siswa WHERE id_periode = ?', [id_periode]);
        const [[{ totalKriteria }]] = await db.query('SELECT COUNT(*) AS totalKriteria FROM kriteria WHERE id_periode = ?', [id_periode]);
        const [[{ totalBobot }]] = await db.query('SELECT COUNT(*) AS totalBobot FROM bobot_kriteria WHERE id_periode = ?', [id_periode]);
        const [[{ siswaBelumLengkap }]] = await db.query(
            `SELECT COUNT(*) AS siswaBelumLengkap FROM siswa s
             WHERE s.id_periode = ? AND (
                SELECT COUNT(*) FROM nilai_siswa ns WHERE ns.id_siswa = s.id_siswa AND ns.nilai_mentah IS NOT NULL
             ) < ?`, [id_periode, totalKriteria]
        );
        return { totalSiswa, totalKriteria, totalBobot, siswaBelumLengkap };
    },

    async saveHasil(id_periode, hasilArray) {
        await db.query('DELETE FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
        for (const item of hasilArray) {
            await db.query(
                `INSERT INTO hasil_waspas (id_siswa, id_periode, nilai_wsm, nilai_wpm, nilai_akhir_q, ranking, status_final) 
                 VALUES (?, ?, ?, ?, ?, ?, 'rekomendasi')`,
                [item.id_siswa, id_periode, item.wsm, item.wpm, item.q, item.ranking]
            );
        }
    },

    async updateStatusPenerimaan(id_periode, kuota) {
        // Ranking 1 s.d kuota => diterima, sisanya cadangan
        await db.query(
            `UPDATE siswa s
             JOIN hasil_waspas hw ON s.id_siswa = hw.id_siswa
             SET s.status_penerimaan = IF(hw.ranking <= ?, 'diterima', 'cadangan')
             WHERE s.id_periode = ?`,
            [kuota, id_periode]
        );
    },

    async getBobotForLaporan(id_periode) {
        const [rows] = await db.query(
            `SELECT bk.*, k.nama_kriteria FROM bobot_kriteria bk 
             JOIN kriteria k ON bk.id_kriteria = k.id_kriteria 
             WHERE bk.id_periode = ? ORDER BY bk.nilai_bobot DESC`,
            [id_periode]
        );
        return rows;
    },

    async getDetailNilaiSiswa(id_siswa) {
        const [rows] = await db.query(
            `SELECT k.nama_kriteria, k.jenis, ns.nilai_mentah, ns.sumber_data
             FROM kriteria k
             LEFT JOIN nilai_siswa ns ON k.id_kriteria = ns.id_kriteria AND ns.id_siswa = ?
             WHERE k.id_periode = (SELECT id_periode FROM siswa WHERE id_siswa = ?)
             ORDER BY k.id_kriteria ASC`,
            [id_siswa, id_siswa]
        );
        return rows;
    },

    async getHasilRanking(id_periode) {
        const [rows] = await db.query(
            `SELECT hw.*, s.nama, s.nisn, s.status_penerimaan 
             FROM hasil_waspas hw 
             JOIN siswa s ON hw.id_siswa = s.id_siswa 
             WHERE hw.id_periode = ? 
             ORDER BY hw.ranking ASC`, [id_periode]
        );
        return rows;
    }
};

module.exports = waspasModel;