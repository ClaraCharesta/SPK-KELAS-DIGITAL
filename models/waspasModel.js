const db = require('../config/database');

// Hanya siswa dengan akun yang berstatus 'berminat' yang ikut perankingan.
const JOIN_IKUT = `INNER JOIN akun_siswa a
                      ON a.id_siswa = s.id_siswa
                     AND a.status_minat = 'berminat'`;

const waspasModel = {
    async getSiswaWithNilai(id_periode) {
        const [siswaRows] = await db.query(
            `SELECT s.id_siswa, s.nama
             FROM siswa s
             ${JOIN_IKUT}
             WHERE s.id_periode = ?
             ORDER BY s.id_siswa ASC`,
            [id_periode]
        );

        const [nilaiRows] = await db.query(
            `SELECT ns.id_siswa, ns.id_kriteria, ns.nilai_mentah
             FROM nilai_siswa ns
             INNER JOIN siswa s ON s.id_siswa = ns.id_siswa
             INNER JOIN kriteria k ON k.id_kriteria = ns.id_kriteria
             WHERE s.id_periode = ? AND k.id_periode = ?`,
            [id_periode, id_periode]
        );

        const perSiswa = new Map();
        nilaiRows.forEach(n => {
            const key = Number(n.id_siswa);
            if (!perSiswa.has(key)) perSiswa.set(key, {});
            perSiswa.get(key)[n.id_kriteria] =
                n.nilai_mentah !== null ? parseFloat(n.nilai_mentah) : null;
        });

        return siswaRows.map(s => ({
            id_siswa: s.id_siswa,
            nama: s.nama,
            nilai: perSiswa.get(Number(s.id_siswa)) || {}
        }));
    },

    async getKriteria(id_periode) {
        const [rows] = await db.query(
            'SELECT id_kriteria, nama_kriteria, jenis FROM kriteria WHERE id_periode = ?',
            [id_periode]
        );
        return rows;
    },

    async getBobot(id_periode) {
        const [rows] = await db.query(
            'SELECT id_kriteria, nilai_bobot FROM bobot_kriteria WHERE id_periode = ?',
            [id_periode]
        );
        return rows;
    },

    async checkDataLengkap(id_periode) {
        const [[{ totalSiswa }]] = await db.query(
            `SELECT COUNT(*) AS totalSiswa
             FROM siswa s ${JOIN_IKUT}
             WHERE s.id_periode = ?`,
            [id_periode]
        );

        const [[{ totalKriteria }]] = await db.query(
            'SELECT COUNT(*) AS totalKriteria FROM kriteria WHERE id_periode = ?',
            [id_periode]
        );

        const [[{ totalBobot }]] = await db.query(
            'SELECT COUNT(*) AS totalBobot FROM bobot_kriteria WHERE id_periode = ?',
            [id_periode]
        );

        const [[{ siswaBelumLengkap }]] = await db.query(
            `SELECT COUNT(*) AS siswaBelumLengkap
             FROM siswa s ${JOIN_IKUT}
             WHERE s.id_periode = ?
               AND (
                    SELECT COUNT(*)
                    FROM nilai_siswa ns
                    INNER JOIN kriteria k ON k.id_kriteria = ns.id_kriteria
                    WHERE ns.id_siswa = s.id_siswa
                      AND k.id_periode = s.id_periode
                      AND ns.nilai_mentah IS NOT NULL
               ) < ?`,
            [id_periode, totalKriteria]
        );

        // Belum merespons = belum punya akun ATAU akun masih belum_respon
        const [[{ belumKonfirmasi }]] = await db.query(
            `SELECT COUNT(*) AS belumKonfirmasi
             FROM siswa s
             LEFT JOIN akun_siswa a ON a.id_siswa = s.id_siswa
             WHERE s.id_periode = ?
               AND (a.id_siswa IS NULL OR a.status_minat = 'belum_respon')`,
            [id_periode]
        );

        const [[{ tidakBerminat }]] = await db.query(
            `SELECT COUNT(*) AS tidakBerminat
             FROM siswa s
             INNER JOIN akun_siswa a ON a.id_siswa = s.id_siswa
             WHERE s.id_periode = ? AND a.status_minat = 'tidak_berminat'`,
            [id_periode]
        );

        const bisaHitung =
            totalSiswa > 0 &&
            totalKriteria > 0 &&
            totalBobot > 0 &&
            siswaBelumLengkap === 0;

        return {
            totalSiswa,
            totalKriteria,
            totalBobot,
            siswaBelumLengkap,
            belumKonfirmasi,
            tidakBerminat,
            bisaHitung
        };
    },

    // Simpan hasil + tetapkan status usulan dalam SATU transaksi.
    // Ditolak jika periode sudah final.
    async saveHasil(id_periode, hasilArray, kuota = null) {
        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            const [[p]] = await conn.query(
                'SELECT status_penyelesaian FROM periode_seleksi WHERE id_periode = ? FOR UPDATE',
                [id_periode]
            );

            if (!p) throw new Error('PERIODE_TIDAK_DITEMUKAN');
            if (p.status_penyelesaian === 'selesai') throw new Error('PERIODE_FINAL');

            await conn.query('DELETE FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
            await conn.query(
                "UPDATE siswa SET status_penerimaan = 'belum_diproses' WHERE id_periode = ?",
                [id_periode]
            );

            if (hasilArray.length > 0) {
                const values = hasilArray.map(item => [
                    item.id_siswa,
                    id_periode,
                    item.wsm,
                    item.wpm,
                    item.q,
                    item.ranking,
                    'rekomendasi'
                ]);

                await conn.query(
                    `INSERT INTO hasil_waspas
                        (id_siswa, id_periode, nilai_wsm, nilai_wpm, nilai_akhir_q, ranking, status_final)
                     VALUES ?`,
                    [values]
                );
            }

            if (kuota !== null) {
                await conn.query(
                    `UPDATE siswa s
                     INNER JOIN hasil_waspas hw ON hw.id_siswa = s.id_siswa
                     SET s.status_penerimaan =
                         CASE WHEN hw.ranking <= ? THEN 'diterima' ELSE 'tidak_diterima' END
                     WHERE s.id_periode = ?`,
                    [kuota, id_periode]
                );
            }

            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    // rank <= kuota -> 'diterima', selebihnya 'tidak_diterima'
    async updateStatusPenerimaan(id_periode, kuota) {
        await db.query(
            `UPDATE siswa s
             JOIN hasil_waspas hw ON s.id_siswa = hw.id_siswa
             SET s.status_penerimaan = CASE WHEN hw.ranking <= ? THEN 'diterima' ELSE 'tidak_diterima' END
             WHERE s.id_periode = ?`,
            [kuota, id_periode]
        );
    },

    async resetStatusPenerimaan(id_periode) {
        await db.query(
            "UPDATE siswa SET status_penerimaan = 'belum_diproses' WHERE id_periode = ?",
            [id_periode]
        );
    },

    async hitungJumlahDiterima(id_periode) {
        const [[{ jumlah }]] = await db.query(
            "SELECT COUNT(*) AS jumlah FROM siswa WHERE id_periode = ? AND status_penerimaan = 'diterima'",
            [id_periode]
        );
        return jumlah;
    },

    async isFinal(id_periode) {
        const [[row]] = await db.query(
            'SELECT status_penyelesaian FROM periode_seleksi WHERE id_periode = ?',
            [id_periode]
        );
        return !!row && row.status_penyelesaian === 'selesai';
    },

    // Finalisasi: hasil dikunci, periode selesai. Atomik.
    // Return { ok: true, jumlah } atau { ok: false, alasan }.
    async finalisasi(id_periode) {
        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            const [[p]] = await conn.query(
                'SELECT status_penyelesaian FROM periode_seleksi WHERE id_periode = ? FOR UPDATE',
                [id_periode]
            );

            if (!p) {
                await conn.rollback();
                return { ok: false, alasan: 'PERIODE_TIDAK_DITEMUKAN' };
            }

            if (p.status_penyelesaian === 'selesai') {
                await conn.rollback();
                return { ok: false, alasan: 'SUDAH_FINAL' };
            }

            const [[{ jumlahHasil }]] = await conn.query(
                'SELECT COUNT(*) AS jumlahHasil FROM hasil_waspas WHERE id_periode = ?',
                [id_periode]
            );

            if (jumlahHasil === 0) {
                await conn.rollback();
                return { ok: false, alasan: 'TIDAK_ADA_HASIL' };
            }

            // Pastikan hasil masih sesuai dengan jumlah siswa yang berminat.
            const [[{ jumlahBerminat }]] = await conn.query(
                `SELECT COUNT(*) AS jumlahBerminat
                 FROM siswa s ${JOIN_IKUT}
                 WHERE s.id_periode = ?`,
                [id_periode]
            );

            if (jumlahBerminat !== jumlahHasil) {
                await conn.rollback();
                return { ok: false, alasan: 'HASIL_USANG' };
            }

            await conn.query(
                "UPDATE hasil_waspas SET status_final = 'final' WHERE id_periode = ?",
                [id_periode]
            );
            await conn.query(
                "UPDATE periode_seleksi SET status_penyelesaian = 'selesai' WHERE id_periode = ?",
                [id_periode]
            );

            await conn.commit();
            return { ok: true, jumlah: jumlahHasil };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
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

    // Nama lama dipertahankan agar controller lain (kriteria/FUCOM/nilai/lockHelper) tetap jalan.
    // Artinya: "apakah periode sudah difinalisasi".
    async checkAdaSiswaLulus(id_periode) {
        return waspasModel.isFinal(id_periode);
    },
    async checkStatusFinalisasi(id_periode) {
        return waspasModel.isFinal(id_periode);
    },

    // Panggil setiap ada perubahan yang mempengaruhi ranking
    // (nilai, minat, data siswa, kriteria, bobot). Selama belum final,
    // hasil lama dihapus dan perlu dihitung ulang.
    async invalidateHasilJikaAda(id_periode) {
        const sudahFinal = await waspasModel.isFinal(id_periode);
        if (!sudahFinal) {
            await db.query('DELETE FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
            await waspasModel.resetStatusPenerimaan(id_periode);
        }
    },

    async getHasilRanking(id_periode) {
        const [rows] = await db.query(
            `SELECT hw.*, s.nama, s.nisn, s.status_penerimaan
             FROM hasil_waspas hw
             JOIN siswa s ON hw.id_siswa = s.id_siswa
             WHERE hw.id_periode = ?
             ORDER BY hw.ranking ASC`,
            [id_periode]
        );
        return rows;
    },

    async hapusHasil(id_periode) {
        await db.query('DELETE FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
        await waspasModel.resetStatusPenerimaan(id_periode);
    },

    async checkBobotTersedia(id_periode) {
        const [[{ jumlah }]] = await db.query(
            'SELECT COUNT(*) AS jumlah FROM bobot_kriteria WHERE id_periode = ?',
            [id_periode]
        );
        return jumlah > 0;
    }
};

module.exports = waspasModel;