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
        const [rows] = await db.query(
            `SELECT k.id_kriteria, k.nama_kriteria, k.jenis,
                    ns.id_nilai, ns.nilai_mentah
             FROM kriteria k
             LEFT JOIN nilai_siswa ns ON k.id_kriteria = ns.id_kriteria AND ns.id_siswa = ?
             WHERE k.id_periode = ?
             ORDER BY k.id_kriteria ASC`,
            [id_siswa, id_periode]
        );
        return rows;
    },

    async getSiswaWithAllNilai(id_periode) {
        const siswaList = await nilaiModel.getSiswaWithNilaiStatus(id_periode);
        const result = [];
        for (const s of siswaList) {
            const nilaiRows = await db.query(
                'SELECT id_kriteria, nilai_mentah FROM nilai_siswa WHERE id_siswa = ?', [s.id_siswa]
            );
            const nilai = {};
            nilaiRows[0].forEach(n => { nilai[n.id_kriteria] = n.nilai_mentah; });
            result.push({ ...s, nilai });
        }
        return result;
    },

    async getSiswaByNisn(nisn, id_periode) {
        const [rows] = await db.query('SELECT * FROM siswa WHERE nisn = ? AND id_periode = ?', [nisn, id_periode]);
        return rows[0];
    },

    async bulkUpsertNilai(dataArray) {
        let berhasil = 0;
        let gagal = 0;
        let pesanGagal = [];

        for (const item of dataArray) {
            try {
                await nilaiModel.upsertNilai(item.id_siswa, item.id_kriteria, item.nilai_mentah);
                berhasil++;
            } catch (err) {
                gagal++;
                pesanGagal.push(`Gagal simpan nilai untuk NISN ${item.nisn}: ${err.message}`);
            }
        }
        return { berhasil, gagal, pesanGagal };
    },
    
    async upsertNilai(id_siswa, id_kriteria, nilai_mentah) {
        const [existing] = await db.query(
            'SELECT id_nilai FROM nilai_siswa WHERE id_siswa = ? AND id_kriteria = ?',
            [id_siswa, id_kriteria]
        );

        if (existing.length > 0) {
            await db.query(
                'UPDATE nilai_siswa SET nilai_mentah = ? WHERE id_siswa = ? AND id_kriteria = ?',
                [nilai_mentah, id_siswa, id_kriteria]
            );
        } else {
            await db.query(
                'INSERT INTO nilai_siswa (id_siswa, id_kriteria, nilai_mentah) VALUES (?, ?, ?)',
                [id_siswa, id_kriteria, nilai_mentah]
            );
        }
    }
};
module.exports = nilaiModel;