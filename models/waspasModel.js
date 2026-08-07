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

            const bisaHitung = totalSiswa > 0 && totalKriteria > 0 && totalBobot > 0 && siswaBelumLengkap === 0;

            return { totalSiswa, totalKriteria, totalBobot, siswaBelumLengkap, bisaHitung };
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
        await db.query(
            `UPDATE siswa s
             JOIN hasil_waspas hw ON s.id_siswa = hw.id_siswa
             SET s.status_penerimaan = IF(hw.ranking <= ?, 'diusulkan', 'cadangan')
             WHERE s.id_periode = ? AND s.status_penerimaan != 'lulus'`,
            [kuota, id_periode]
        );
    },

    async hitungJumlahLulus(id_periode) {
        const [[{ jumlah }]] = await db.query(
            "SELECT COUNT(*) AS jumlah FROM siswa WHERE id_periode = ? AND status_penerimaan = 'lulus'",
            [id_periode]
        );
        return jumlah;
    },

    async tetapkanLulus(id_periode, idSiswaArray) {
        if (idSiswaArray.length === 0) return;
        await db.query(
            `UPDATE siswa SET status_penerimaan = 'lulus' WHERE id_siswa IN (?) AND id_periode = ?`,
            [idSiswaArray, id_periode]
        );
    },

    async kunciJikaKuotaPenuh(id_periode, kuota) {
        const jumlahLulus = await waspasModel.hitungJumlahLulus(id_periode);
        if (jumlahLulus >= kuota) {
            // Siswa yang masih Diusulkan/Cadangan otomatis jadi Tidak Lulus begitu kuota penuh
            await db.query(
                "UPDATE siswa SET status_penerimaan = 'tidak_lulus' WHERE id_periode = ? AND status_penerimaan IN ('diusulkan', 'cadangan')",
                [id_periode]
            );
            await db.query(`UPDATE hasil_waspas SET status_final = 'final' WHERE id_periode = ?`, [id_periode]);
            await db.query(`UPDATE periode_seleksi SET status_penyelesaian = 'selesai' WHERE id_periode = ?`, [id_periode]);
            return true;
        }
        return false;
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
            `SELECT k.nama_kriteria, k.jenis, ns.nilai_mentah
             FROM kriteria k
             LEFT JOIN nilai_siswa ns ON k.id_kriteria = ns.id_kriteria AND ns.id_siswa = ?
             WHERE k.id_periode = (SELECT id_periode FROM siswa WHERE id_siswa = ?)
             ORDER BY k.id_kriteria ASC`,
            [id_siswa, id_siswa]
        );
        return rows;
    },

    async checkAdaSiswaLulus(id_periode) {
        const [[{ jumlah }]] = await db.query(
            "SELECT COUNT(*) AS jumlah FROM siswa WHERE id_periode = ? AND status_penerimaan = 'lulus'",
            [id_periode]
        );
        return jumlah > 0;
    },

    // checkAdaSiswaLulus tetap dipertahankan terpisah, dipakai khusus untuk logic invalidasi hasil (bukan lock)
    async checkStatusFinalisasi(id_periode) {
        const [[{ jumlah }]] = await db.query(
            "SELECT COUNT(*) AS jumlah FROM siswa WHERE id_periode = ? AND status_penerimaan IN ('lulus', 'mengundurkan_diri')",
            [id_periode]
        );
        return jumlah > 0;
    },

    // Hapus hasil_waspas otomatis kalau BELUM ada yang lulus (data lama jadi stale karena ada perubahan)
    async invalidateHasilJikaAda(id_periode) {
        const adaLulus = await waspasModel.checkAdaSiswaLulus(id_periode);
        if (!adaLulus) {
            await db.query('DELETE FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
            await db.query("UPDATE siswa SET status_penerimaan = 'cadangan' WHERE id_periode = ? AND status_penerimaan NOT IN ('lulus', 'mengundurkan_diri')", [id_periode]);
        }
    },

    async getHasilRanking(id_periode) {
        const [rows] = await db.query(
            `SELECT hw.*, s.nama, s.nisn, s.status_penerimaan 
             FROM hasil_waspas hw 
             JOIN siswa s ON hw.id_siswa = s.id_siswa 
             WHERE hw.id_periode = ? 
             ORDER BY 
                CASE s.status_penerimaan 
                    WHEN 'lulus' THEN 0 
                    WHEN 'diusulkan' THEN 1 
                    WHEN 'cadangan' THEN 2 
                    ELSE 3 
                END ASC,
                hw.ranking ASC`, [id_periode]
        );
        return rows;
    },

    async hapusHasil(id_periode) {
        await db.query('DELETE FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
    },

    async updateStatusManual(id_siswa, status_baru) {
        await db.query('UPDATE siswa SET status_penerimaan = ? WHERE id_siswa = ?', [status_baru, id_siswa]);
    },

    async checkBobotTersedia(id_periode) {
        const [[{ jumlah }]] = await db.query(
            'SELECT COUNT(*) AS jumlah FROM bobot_kriteria WHERE id_periode = ?', [id_periode]
        );
        return jumlah > 0;
    },
};

module.exports = waspasModel;