const db = require('../config/database');

const fucomModel = {
    async getKriteria(id_periode) {
        const [rows] = await db.query(
            'SELECT id_kriteria, nama_kriteria FROM kriteria WHERE id_periode = ? ORDER BY id_kriteria ASC',
            [id_periode]
        );
        return rows;
    },

    // Ambil daftar nama responden unik yang sudah input data (sistem hanya mengizinkan 1)
    async getRespondenList(id_periode) {
        const [rows] = await db.query(
            'SELECT DISTINCT nama_responden FROM perbandingan_fucom WHERE id_periode = ? ORDER BY nama_responden ASC',
            [id_periode]
        );
        return rows.map(r => r.nama_responden);
    },

    async getPerbandinganByResponden(id_periode, nama_responden) {
        const [rows] = await db.query(
            `SELECT pf.*, 
                    k1.nama_kriteria AS nama_kriteria_asal, 
                    k2.nama_kriteria AS nama_kriteria_pembanding
             FROM perbandingan_fucom pf
             JOIN kriteria k1 ON pf.id_kriteria_asal = k1.id_kriteria
             JOIN kriteria k2 ON pf.id_kriteria_pembanding = k2.id_kriteria
             WHERE pf.id_periode = ? AND pf.nama_responden = ?
             ORDER BY pf.peringkat_asal ASC`,
            [id_periode, nama_responden]
        );
        return rows;
    },

    async hapusPerbandinganByResponden(id_periode, nama_responden) {
        await db.query(
            'DELETE FROM perbandingan_fucom WHERE id_periode = ? AND nama_responden = ?',
            [id_periode, nama_responden]
        );
    },

    async hapusSemuaPerbandingan(id_periode) {
        await db.query('DELETE FROM perbandingan_fucom WHERE id_periode = ?', [id_periode]);
    },

    // (Lama, tetap dipertahankan supaya kode lain yang memakainya tidak rusak.)
    async savePerbandingan(id_periode, nama_responden, dataPerbandingan) {
        // Hapus data lama untuk responden ini dulu (kalau input ulang/edit)
        await fucomModel.hapusPerbandinganByResponden(id_periode, nama_responden);

        for (const item of dataPerbandingan) {
            await db.query(
                `INSERT INTO perbandingan_fucom 
                 (id_periode, nama_responden, id_kriteria_asal, id_kriteria_pembanding, peringkat_asal, nilai_perbandingan) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id_periode, nama_responden, item.id_kriteria_asal, item.id_kriteria_pembanding, item.peringkat_asal, item.nilai_perbandingan]
            );
        }
    },

    // =====================================================================
    // BAGIAN ANTI-TABRAKAN (CONCURRENCY)
    // Semua operasi yang mengubah data FUCOM satu periode dijalankan satu per satu
    // lewat kunci baris periode (SELECT ... FOR UPDATE). Request kedua yang datang
    // di waktu yang sama otomatis menunggu beberapa milidetik, lalu melihat data
    // terbaru dan ditolak kalau sudah tidak boleh.
    // =====================================================================
    async denganKunciPeriode(id_periode, callback) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('SELECT id_periode FROM periode_seleksi WHERE id_periode = ? FOR UPDATE', [id_periode]);
            const hasil = await callback(conn);
            await conn.commit();
            return hasil;
        } catch (err) {
            try { await conn.rollback(); } catch (e) { /* abaikan */ }
            throw err;
        } finally {
            conn.release();
        }
    },

    // Apakah bobot di periode ini sudah final (ada dan DFC di bawah ambang)? Dibaca di dalam kunci.
    async _bobotFinalDi(conn, id_periode, dfcThreshold) {
        const [rows] = await conn.query(
            'SELECT nilai_dfc FROM bobot_kriteria WHERE id_periode = ? LIMIT 1',
            [id_periode]
        );
        if (rows.length === 0) return false;
        return parseFloat(rows[0].nilai_dfc) < dfcThreshold;
    },

    async _tulisPerbandingan(conn, id_periode, namaResponden, dataPerbandingan) {
        if (!dataPerbandingan.length) return;
        const values = dataPerbandingan.map(item => [
            id_periode,
            namaResponden,
            item.id_kriteria_asal,
            item.id_kriteria_pembanding,
            item.peringkat_asal,
            item.nilai_perbandingan
        ]);
        await conn.query(
            `INSERT INTO perbandingan_fucom
             (id_periode, nama_responden, id_kriteria_asal, id_kriteria_pembanding, peringkat_asal, nilai_perbandingan)
             VALUES ?`,
            [values]
        );
    },

    async _kosongkanHasilTurunan(conn, id_periode) {
        // Bobot dan hasil WASPAS tidak valid lagi kalau data perbandingan berubah
        await conn.query('DELETE FROM bobot_kriteria WHERE id_periode = ?', [id_periode]);
        await conn.query('DELETE FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
    },

    // Simpan responden BARU. Hanya 1 responden per periode.
    // Return: { ok: true } atau { ok: false, alasan: 'sudah_ada' | 'final' }
    async simpanResponden(id_periode, namaResponden, dataPerbandingan, dfcThreshold) {
        return fucomModel.denganKunciPeriode(id_periode, async function (conn) {
            const [[{ jumlah }]] = await conn.query(
                'SELECT COUNT(DISTINCT nama_responden) AS jumlah FROM perbandingan_fucom WHERE id_periode = ?',
                [id_periode]
            );
            if (jumlah > 0) return { ok: false, alasan: 'sudah_ada' };

            if (await fucomModel._bobotFinalDi(conn, id_periode, dfcThreshold)) {
                return { ok: false, alasan: 'final' };
            }

            await fucomModel._kosongkanHasilTurunan(conn, id_periode);
            await fucomModel._tulisPerbandingan(conn, id_periode, namaResponden, dataPerbandingan);
            return { ok: true };
        });
    },

    // Ganti data responden yang sudah ada (edit). Hapus + tulis ulang dalam SATU transaksi,
    // jadi kalau gagal di tengah, data lama tidak hilang.
    // Return: { ok: true } atau { ok: false, alasan: 'tidak_ada' | 'final' }
    async gantiResponden(id_periode, namaBaru, dataPerbandingan, dfcThreshold) {
        return fucomModel.denganKunciPeriode(id_periode, async function (conn) {
            const [rows] = await conn.query(
                'SELECT DISTINCT nama_responden FROM perbandingan_fucom WHERE id_periode = ?',
                [id_periode]
            );
            if (rows.length === 0) return { ok: false, alasan: 'tidak_ada' };

            if (await fucomModel._bobotFinalDi(conn, id_periode, dfcThreshold)) {
                return { ok: false, alasan: 'final' };
            }

            await conn.query('DELETE FROM perbandingan_fucom WHERE id_periode = ?', [id_periode]);
            await fucomModel._kosongkanHasilTurunan(conn, id_periode);
            await fucomModel._tulisPerbandingan(conn, id_periode, namaBaru, dataPerbandingan);
            return { ok: true };
        });
    },

    // Hapus data responden periode ini.
    // Return: { ok: true } atau { ok: false, alasan: 'tidak_ada' | 'final' }
    async hapusResponden(id_periode, dfcThreshold) {
        return fucomModel.denganKunciPeriode(id_periode, async function (conn) {
            const [[{ jumlah }]] = await conn.query(
                'SELECT COUNT(*) AS jumlah FROM perbandingan_fucom WHERE id_periode = ?',
                [id_periode]
            );
            if (jumlah === 0) return { ok: false, alasan: 'tidak_ada' };

            if (await fucomModel._bobotFinalDi(conn, id_periode, dfcThreshold)) {
                return { ok: false, alasan: 'final' };
            }

            await conn.query('DELETE FROM perbandingan_fucom WHERE id_periode = ?', [id_periode]);
            await fucomModel._kosongkanHasilTurunan(conn, id_periode);
            return { ok: true };
        });
    },

    // Simpan bobot hasil hitung. Delete + insert dalam satu transaksi.
    // sidikJariAwal (opsional): ringkasan data perbandingan yang dipakai saat menghitung.
    // Kalau data sudah berubah sebelum bobot disimpan (misal ada edit di waktu yang sama),
    // bobot TIDAK disimpan dan fungsi mengembalikan false.
    async saveBobotFinal(id_periode, hasilBobot, dfc, sidikJariAwal) {
        return fucomModel.denganKunciPeriode(id_periode, async function (conn) {
            if (sidikJariAwal !== undefined) {
                const [rows] = await conn.query(
                    `SELECT id_kriteria_asal, id_kriteria_pembanding, nilai_perbandingan
                     FROM perbandingan_fucom WHERE id_periode = ? ORDER BY peringkat_asal ASC`,
                    [id_periode]
                );
                const sekarang = fucomModel.buatSidikJari(rows);
                if (sekarang !== sidikJariAwal) return false;
            }

            await conn.query('DELETE FROM bobot_kriteria WHERE id_periode = ?', [id_periode]);

            if (hasilBobot.length) {
                const values = hasilBobot.map(item => [item.id_kriteria, id_periode, item.bobot, dfc]);
                await conn.query(
                    'INSERT INTO bobot_kriteria (id_kriteria, id_periode, nilai_bobot, nilai_dfc) VALUES ?',
                    [values]
                );
            }
            return true;
        });
    },

    // Ringkasan data perbandingan (urutan + nilai) untuk mendeteksi perubahan data.
    buatSidikJari(rows) {
        return rows.map(function (r) {
            return String(r.id_kriteria_asal) + ':' + String(r.id_kriteria_pembanding) + ':' + parseFloat(r.nilai_perbandingan);
        }).join('|');
    },

    async getBobotFinal(id_periode) {
        const [rows] = await db.query(
            `SELECT bk.*, k.nama_kriteria FROM bobot_kriteria bk 
             JOIN kriteria k ON bk.id_kriteria = k.id_kriteria 
             WHERE bk.id_periode = ? ORDER BY bk.nilai_bobot DESC`,
            [id_periode]
        );
        return rows;
    },

    async checkBobotSudahDihitung(id_periode) {
        const [[{ jumlah }]] = await db.query(
            'SELECT COUNT(*) AS jumlah FROM bobot_kriteria WHERE id_periode = ?', [id_periode]
        );
        return jumlah > 0;
    },

    async hapusBobotFinal(id_periode) {
        await db.query('DELETE FROM bobot_kriteria WHERE id_periode = ?', [id_periode]);
        // PENTING: hasil WASPAS otomatis tidak valid lagi tanpa bobot, ikut dihapus
        await db.query('DELETE FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
    }
};

module.exports = fucomModel;