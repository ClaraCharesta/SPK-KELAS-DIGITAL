const db = require('../config/database');

const siswaModel = {
    async getActivePeriode() {
        const [rows] = await db.query("SELECT * FROM periode_seleksi WHERE status_periode = 'aktif' LIMIT 1");
        return rows[0];
    },

    async getAllSiswa(id_periode) {
        const [rows] = await db.query(
            'SELECT * FROM siswa WHERE id_periode = ? ORDER BY nama ASC',
            [id_periode]
        );
        return rows;
    },

    async getSiswaById(id_siswa) {
        const [rows] = await db.query('SELECT * FROM siswa WHERE id_siswa = ?', [id_siswa]);
        return rows[0];
    },

    async createSiswa(data) {
        const { id_periode, nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh } = data;
        try {
            const [result] = await db.query(
                `INSERT INTO siswa (id_periode, nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh, status_penerimaan) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cadangan')`,
                [id_periode, nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh]
            );
            return result.insertId;
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                throw new Error(`NISN ${nisn} sudah terdaftar (kemungkinan diinput bersamaan oleh pengguna lain).`);
            }
            throw err;
        }
    },

    async updateSiswa(id_siswa, data) {
        const { nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh } = data;
        await db.query(
            `UPDATE siswa SET nisn=?, nama=?, jenis_kelamin=?, sekolah_asal=?, pekerjaan_ayah=?, pekerjaan_ibu=?, status_pip_pkh=? 
             WHERE id_siswa=?`,
            [nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh, id_siswa]
        );
    },

    async deleteSiswa(id_siswa) {
        await db.query('DELETE FROM nilai_siswa WHERE id_siswa = ?', [id_siswa]);
        await db.query('DELETE FROM siswa WHERE id_siswa = ?', [id_siswa]);
    },

    async checkNisnExists(nisn, id_periode, excludeId = null) {
        let query = 'SELECT id_siswa FROM siswa WHERE nisn = ? AND id_periode = ?';
        const params = [nisn, id_periode];
        if (excludeId) {
            query += ' AND id_siswa != ?';
            params.push(excludeId);
        }
        const [rows] = await db.query(query, params);
        return rows.length > 0;
    },

    async bulkInsert(dataArray, id_periode) {
    let berhasil = 0;
    let gagal = 0;
    let pesanGagal = [];
    const nisnDalamFile = new Set();

    for (const row of dataArray) {
        // Cegah duplikat DALAM file yang sama diimpor bersamaan
        if (nisnDalamFile.has(row.nisn)) {
            gagal++;
            pesanGagal.push(`NISN ${row.nisn} (${row.nama}) duplikat dalam file, baris kedua dilewati.`);
            continue;
        }
        nisnDalamFile.add(row.nisn);

        try {
            const exists = await siswaModel.checkNisnExists(row.nisn, id_periode);
            if (exists) {
                gagal++;
                pesanGagal.push(`NISN ${row.nisn} (${row.nama}) sudah terdaftar di sistem.`);
                continue;
            }

            await siswaModel.createSiswa({ ...row, id_periode });
            berhasil++;
        } catch (err) {
            gagal++;
            pesanGagal.push(`NISN ${row.nisn || '-'}: ${err.message}`);
        }
    }

    return { berhasil, gagal, pesanGagal };
},

async checkPunyaHasilRanking(id_siswa) {
    const [[{ jumlah }]] = await db.query(
        'SELECT COUNT(*) AS jumlah FROM hasil_waspas WHERE id_siswa = ?', [id_siswa]
    );
    return jumlah > 0;
}
};

module.exports = siswaModel;