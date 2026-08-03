const db = require('../config/database');

const dashboardModel = {
    async getAdminStats(id_periode) {
        const [[{ totalSiswa }]] = await db.query(
            'SELECT COUNT(*) AS totalSiswa FROM siswa WHERE id_periode = ?', [id_periode]
        );
        const [[{ totalKriteria }]] = await db.query(
            'SELECT COUNT(*) AS totalKriteria FROM kriteria WHERE id_periode = ?', [id_periode]
        );
        const [[{ kriteriaTerisi }]] = await db.query(
            `SELECT COUNT(DISTINCT ns.id_siswa) AS kriteriaTerisi 
             FROM nilai_siswa ns 
             JOIN siswa s ON ns.id_siswa = s.id_siswa 
             WHERE s.id_periode = ?`, [id_periode]
        );
        const [[bobot]] = await db.query(
            'SELECT COUNT(*) AS jumlah FROM bobot_kriteria WHERE id_periode = ?', [id_periode]
        );
        const [[hasil]] = await db.query(
            'SELECT COUNT(*) AS jumlah FROM hasil_waspas WHERE id_periode = ?', [id_periode]
        );

        return {
            totalSiswa,
            totalKriteria,
            kriteriaTerisi,
            statusFucom: bobot.jumlah > 0 ? 'Sudah' : 'Belum',
            statusWaspas: hasil.jumlah > 0 ? 'Sudah' : 'Belum'
        };
    },

    async getSuperAdminStats() {
        const [[{ totalAdmin }]] = await db.query(
            "SELECT COUNT(*) AS totalAdmin FROM users WHERE role = 'admin' AND status_aktif = TRUE"
        );
        const [[periodeAktif]] = await db.query(
            "SELECT tahun_ajaran FROM periode_seleksi WHERE status_periode = 'aktif' LIMIT 1"
        );
        const [[{ totalKriteria }]] = await db.query(
            'SELECT COUNT(*) AS totalKriteria FROM kriteria'
        );
        const [[{ logHariIni }]] = await db.query(
            'SELECT COUNT(*) AS logHariIni FROM log_aktivitas WHERE DATE(waktu) = CURDATE()'
        );

        return {
            totalAdmin,
            periodeAktif: periodeAktif ? periodeAktif.tahun_ajaran : 'Belum ada',
            totalKriteria,
            logHariIni
        };
    },

async getKepsekStats(id_periode) {
        const [[{ diterima }]] = await db.query(
            "SELECT COUNT(*) AS diterima FROM siswa WHERE id_periode = ? AND status_penerimaan = 'diterima'", [id_periode]
        );
        const [[{ cadangan }]] = await db.query(
            "SELECT COUNT(*) AS cadangan FROM siswa WHERE id_periode = ? AND status_penerimaan = 'cadangan'", [id_periode]
        );
        const [[statusHasil]] = await db.query(
            "SELECT status_final FROM hasil_waspas WHERE id_periode = ? LIMIT 1", [id_periode]
        );
        const [bobot] = await db.query(
            'SELECT nama_kriteria, nilai_bobot FROM bobot_kriteria bk JOIN kriteria k ON bk.id_kriteria = k.id_kriteria WHERE bk.id_periode = ?', [id_periode]
        );

        // Hitung sebaran nilai Q siswa per rentang (0-20, 21-40, dst, dikonversi ke skala 0-100)
        const [hasilQ] = await db.query(
            'SELECT nilai_akhir_q FROM hasil_waspas WHERE id_periode = ?', [id_periode]
        );

        const sebaran = [0, 0, 0, 0, 0]; // 0-20, 21-40, 41-60, 61-80, 81-100
        hasilQ.forEach(row => {
            const skorPersen = parseFloat(row.nilai_akhir_q) * 100; // Q biasanya 0-1, diubah ke skala 0-100
            if (skorPersen <= 20) sebaran[0]++;
            else if (skorPersen <= 40) sebaran[1]++;
            else if (skorPersen <= 60) sebaran[2]++;
            else if (skorPersen <= 80) sebaran[3]++;
            else sebaran[4]++;
        });

        return {
            diterima,
            cadangan,
            statusKeputusan: statusHasil ? (statusHasil.status_final === 'final' ? 'Final' : 'Rekomendasi') : 'Belum Ada',
            bobotKriteria: bobot,
            sebaranNilai: sebaran
        };
    }
};

module.exports = dashboardModel;