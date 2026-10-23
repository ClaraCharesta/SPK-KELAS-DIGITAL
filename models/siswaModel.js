const db = require('../config/database');

const PEKERJAAN_DEFAULT = 'Tidak bekerja';

function bersihkan(nilai) {
    return String(nilai === undefined || nilai === null ? '' : nilai).replace(/\s+/g, ' ').trim();
}

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
        const { id_periode, jenis_kelamin, status_pip_pkh } = data;

        const nisn = bersihkan(data.nisn);
        const nama = bersihkan(data.nama);
        const sekolah_asal = bersihkan(data.sekolah_asal);
        // Pekerjaan opsional: kosong -> "Tidak bekerja"
        const pekerjaan_ayah = bersihkan(data.pekerjaan_ayah) || PEKERJAAN_DEFAULT;
        const pekerjaan_ibu = bersihkan(data.pekerjaan_ibu) || PEKERJAAN_DEFAULT;

        try {
            const [result] = await db.query(
                `INSERT INTO siswa (id_periode, nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh, status_penerimaan)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'belum_diproses')`,
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
        const { jenis_kelamin, status_pip_pkh } = data;

        const nisn = bersihkan(data.nisn);
        const nama = bersihkan(data.nama);
        const sekolah_asal = bersihkan(data.sekolah_asal);
        const pekerjaan_ayah = bersihkan(data.pekerjaan_ayah) || PEKERJAAN_DEFAULT;
        const pekerjaan_ibu = bersihkan(data.pekerjaan_ibu) || PEKERJAAN_DEFAULT;

        try {
            await db.query(
                `UPDATE siswa SET nisn=?, nama=?, jenis_kelamin=?, sekolah_asal=?, pekerjaan_ayah=?, pekerjaan_ibu=?, status_pip_pkh=?
                 WHERE id_siswa=?`,
                [nisn, nama, jenis_kelamin, sekolah_asal, pekerjaan_ayah, pekerjaan_ibu, status_pip_pkh, id_siswa]
            );
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                throw new Error(`NISN ${nisn} sudah terdaftar pada siswa lain.`);
            }
            throw err;
        }
    },

    // Hapus siswa beserta seluruh data turunannya dalam satu transaksi.
    async deleteSiswa(id_siswa) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM hasil_waspas WHERE id_siswa = ?', [id_siswa]);
            await conn.query('DELETE FROM nilai_siswa WHERE id_siswa = ?', [id_siswa]);
            await conn.query('DELETE FROM akun_siswa WHERE id_siswa = ?', [id_siswa]);
            await conn.query('DELETE FROM siswa WHERE id_siswa = ?', [id_siswa]);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    // BARU: hapus BANYAK siswa sekaligus (checklist) beserta data turunannya, satu transaksi.
    // Hanya siswa milik periode yang diberikan yang dihapus; id lain dilewati.
    // Ditolak jika periode sudah difinalisasi (status_penyelesaian = 'selesai').
    // Return { ok: true, dihapus, dilewati } atau { ok: false, alasan }.
    async deleteSiswaMassal(daftarId, id_periode) {
        if (!Array.isArray(daftarId) || daftarId.length === 0) {
            return { ok: false, alasan: 'TIDAK_ADA_PILIHAN' };
        }

        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            // Kunci bersama baris periode: finalisasi akan menunggu transaksi ini.
            const [[periode]] = await conn.query(
                'SELECT status_penyelesaian FROM periode_seleksi WHERE id_periode = ? LOCK IN SHARE MODE',
                [id_periode]
            );

            if (!periode || periode.status_penyelesaian === 'selesai') {
                await conn.rollback();
                return { ok: false, alasan: 'PERIODE_FINAL' };
            }

            // Hanya siswa yang benar-benar milik periode ini.
            const [rows] = await conn.query(
                'SELECT id_siswa FROM siswa WHERE id_periode = ? AND id_siswa IN (?) FOR UPDATE',
                [id_periode, daftarId]
            );

            if (rows.length === 0) {
                await conn.rollback();
                return { ok: false, alasan: 'SISWA_TIDAK_DITEMUKAN' };
            }

            const idValid = rows.map(r => r.id_siswa);

            await conn.query('DELETE FROM hasil_waspas WHERE id_siswa IN (?)', [idValid]);
            await conn.query('DELETE FROM nilai_siswa WHERE id_siswa IN (?)', [idValid]);
            await conn.query('DELETE FROM akun_siswa WHERE id_siswa IN (?)', [idValid]);
            await conn.query('DELETE FROM siswa WHERE id_siswa IN (?)', [idValid]);

            await conn.commit();

            return {
                ok: true,
                dihapus: idValid.length,
                dilewati: daftarId.length - idValid.length
            };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async checkNisnExists(nisn, id_periode, excludeId = null) {
        let query = 'SELECT id_siswa FROM siswa WHERE nisn = ? AND id_periode = ?';
        const params = [bersihkan(nisn), id_periode];

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
        const pesanGagal = [];
        const nisnDalamFile = new Set();

        for (const row of dataArray) {
            const labelBaris = row.baris ? `Baris ${row.baris}` : 'Baris ?';
            const nisnBersih = bersihkan(row.nisn);

            if (nisnDalamFile.has(nisnBersih)) {
                gagal++;
                pesanGagal.push(`${labelBaris} - NISN ${nisnBersih} (${row.nama}): duplikat dalam file, baris kedua dilewati.`);
                continue;
            }

            nisnDalamFile.add(nisnBersih);

            try {
                const exists = await siswaModel.checkNisnExists(nisnBersih, id_periode);

                if (exists) {
                    gagal++;
                    pesanGagal.push(`${labelBaris} - NISN ${nisnBersih} (${row.nama}): sudah terdaftar di sistem.`);
                    continue;
                }

                await siswaModel.createSiswa({ ...row, nisn: nisnBersih, id_periode });
                berhasil++;
            } catch (err) {
                gagal++;
                pesanGagal.push(`${labelBaris} - NISN ${nisnBersih || '-'} (${row.nama || '-'}): ${err.message}`);
            }
        }

        return { berhasil, gagal, pesanGagal };
    },

    // Daftar siswa + status akun + status minat (sumber: akun_siswa).
    async getAllWithAkun(id_periode) {
        const [rows] = await db.query(
            `SELECT
                s.id_siswa, s.id_periode, s.nisn, s.nama, s.jenis_kelamin,
                s.sekolah_asal, s.pekerjaan_ayah, s.pekerjaan_ibu,
                s.status_pip_pkh, s.status_penerimaan,
                a.id_akun_siswa, a.username, a.status_akun, a.status_minat,
                a.tanggal_respon_minat, a.last_login, a.wajib_ganti_password,
                (a.id_akun_siswa IS NOT NULL) AS punya_akun
             FROM siswa s
             LEFT JOIN akun_siswa a ON a.id_siswa = s.id_siswa
             WHERE s.id_periode = ?
             ORDER BY s.nama ASC`,
            [id_periode]
        );
        return rows;
    },

    async checkPunyaHasilRanking(id_siswa) {
        const [[{ jumlah }]] = await db.query(
            'SELECT COUNT(*) AS jumlah FROM hasil_waspas WHERE id_siswa = ?',
            [id_siswa]
        );
        return jumlah > 0;
    },

    // Operator mengubah status minat satu siswa.
    // Syarat: periode belum final, siswa punya akun, dan status saat ini 'belum_respon'.
    // 'tidak_berminat' juga menonaktifkan akun (sama seperti jika siswa memilih sendiri).
    // Return { ok: true } atau { ok: false, alasan }.
    async setMinatOlehOperator(id_siswa, id_periode, statusBaru) {
        if (!['berminat', 'tidak_berminat'].includes(statusBaru)) {
            return { ok: false, alasan: 'STATUS_TIDAK_VALID' };
        }

        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            const [[periode]] = await conn.query(
                'SELECT status_penyelesaian FROM periode_seleksi WHERE id_periode = ? LOCK IN SHARE MODE',
                [id_periode]
            );

            if (!periode || periode.status_penyelesaian === 'selesai') {
                await conn.rollback();
                return { ok: false, alasan: 'PERIODE_FINAL' };
            }

            const [rows] = await conn.query(
                `SELECT s.id_siswa, a.id_akun_siswa, a.status_minat
                 FROM siswa s
                 LEFT JOIN akun_siswa a ON a.id_siswa = s.id_siswa
                 WHERE s.id_siswa = ? AND s.id_periode = ?
                 FOR UPDATE`,
                [id_siswa, id_periode]
            );

            if (!rows.length) {
                await conn.rollback();
                return { ok: false, alasan: 'SISWA_TIDAK_DITEMUKAN' };
            }

            const baris = rows[0];

            if (baris.id_akun_siswa === null || baris.id_akun_siswa === undefined) {
                await conn.rollback();
                return { ok: false, alasan: 'TANPA_AKUN' };
            }

            if (baris.status_minat !== 'belum_respon') {
                await conn.rollback();
                return { ok: false, alasan: 'SUDAH_MERESPONS' };
            }

            if (statusBaru === 'tidak_berminat') {
                await conn.query(
                    `UPDATE akun_siswa
                     SET status_minat = 'tidak_berminat',
                         status_akun = 'nonaktif',
                         tanggal_respon_minat = NOW()
                     WHERE id_siswa = ? AND status_minat = 'belum_respon'`,
                    [id_siswa]
                );
            } else {
                await conn.query(
                    `UPDATE akun_siswa
                     SET status_minat = 'berminat',
                         tanggal_respon_minat = NOW()
                     WHERE id_siswa = ? AND status_minat = 'belum_respon'`,
                    [id_siswa]
                );
            }

            await conn.commit();
            return { ok: true };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    // Operator menandai BANYAK siswa sekaligus (checklist) sebagai 'berminat' ATAU 'tidak_berminat'.
    // Hanya siswa yang punya akun dan masih 'belum_respon' pada periode ini yang diubah;
    // sisanya dilewati. Semua dalam satu transaksi.
    // 'tidak_berminat' juga menonaktifkan akun (sama seperti pada setMinatOlehOperator).
    // Return { ok: true, diubah, dilewati } atau { ok: false, alasan }.
    async setMinatMassal(daftarId, id_periode, statusBaru = 'berminat') {
        if (!Array.isArray(daftarId) || daftarId.length === 0) {
            return { ok: false, alasan: 'TIDAK_ADA_PILIHAN' };
        }

        if (!['berminat', 'tidak_berminat'].includes(statusBaru)) {
            return { ok: false, alasan: 'STATUS_TIDAK_VALID' };
        }

        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            const [[periode]] = await conn.query(
                'SELECT status_penyelesaian FROM periode_seleksi WHERE id_periode = ? LOCK IN SHARE MODE',
                [id_periode]
            );

            if (!periode || periode.status_penyelesaian === 'selesai') {
                await conn.rollback();
                return { ok: false, alasan: 'PERIODE_FINAL' };
            }

            // Kunci baris akun yang dipilih agar tidak bentrok dengan jawaban siswa.
            const [terkunci] = await conn.query(
                `SELECT a.id_siswa
                 FROM akun_siswa a
                 INNER JOIN siswa s ON s.id_siswa = a.id_siswa
                 WHERE s.id_periode = ?
                   AND a.id_siswa IN (?)
                   AND a.status_minat = 'belum_respon'
                 FOR UPDATE`,
                [id_periode, daftarId]
            );

            const idLayak = terkunci.map(r => r.id_siswa);
            let diubah = 0;

            if (idLayak.length > 0) {
                let hasil;

                if (statusBaru === 'tidak_berminat') {
                    [hasil] = await conn.query(
                        `UPDATE akun_siswa
                         SET status_minat = 'tidak_berminat',
                             status_akun = 'nonaktif',
                             tanggal_respon_minat = NOW()
                         WHERE id_siswa IN (?)
                           AND status_minat = 'belum_respon'`,
                        [idLayak]
                    );
                } else {
                    [hasil] = await conn.query(
                        `UPDATE akun_siswa
                         SET status_minat = 'berminat',
                             tanggal_respon_minat = NOW()
                         WHERE id_siswa IN (?)
                           AND status_minat = 'belum_respon'`,
                        [idLayak]
                    );
                }

                diubah = hasil.affectedRows;
            }

            await conn.commit();

            return {
                ok: true,
                diubah,
                dilewati: daftarId.length - diubah
            };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }
};

module.exports = siswaModel;