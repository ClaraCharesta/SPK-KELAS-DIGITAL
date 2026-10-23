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

    // Dipakai untuk chart — pakai periode TERAKHIR (bukan cuma yang aktif), supaya tetap tampil walau ditutup
    async getChartData(id_periode) {
        if (!id_periode) {
            return {
                diusulkan: 0,
                cadangan: 0,
                lulus: 0,
                tidak_lulus: 0,
                mengundurkan_diri: 0,
                bobotKriteria: [],
                sebaranNilai: [0, 0, 0, 0, 0]
            };
        }

        const [[{ diusulkan }]] = await db.query("SELECT COUNT(*) AS diusulkan FROM siswa WHERE id_periode = ? AND status_penerimaan = 'diusulkan'", [id_periode]);
        const [[{ cadangan }]] = await db.query("SELECT COUNT(*) AS cadangan FROM siswa WHERE id_periode = ? AND status_penerimaan = 'cadangan'", [id_periode]);
        const [[{ lulus }]] = await db.query("SELECT COUNT(*) AS lulus FROM siswa WHERE id_periode = ? AND status_penerimaan = 'lulus'", [id_periode]);
        const [[{ tidak_lulus }]] = await db.query("SELECT COUNT(*) AS tidak_lulus FROM siswa WHERE id_periode = ? AND status_penerimaan = 'tidak_lulus'", [id_periode]);
        const [[{ mengundurkan_diri }]] = await db.query("SELECT COUNT(*) AS mengundurkan_diri FROM siswa WHERE id_periode = ? AND status_penerimaan = 'mengundurkan_diri'", [id_periode]);

        const [bobotKriteria] = await db.query(
            'SELECT nama_kriteria, nilai_bobot FROM bobot_kriteria bk JOIN kriteria k ON bk.id_kriteria = k.id_kriteria WHERE bk.id_periode = ?', [id_periode]
        );

        const [hasilQ] = await db.query('SELECT nilai_akhir_q FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
        const sebaran = [0, 0, 0, 0, 0];
        hasilQ.forEach(row => {
            const skorPersen = parseFloat(row.nilai_akhir_q) * 100;
            if (skorPersen <= 20) sebaran[0]++;
            else if (skorPersen <= 40) sebaran[1]++;
            else if (skorPersen <= 60) sebaran[2]++;
            else if (skorPersen <= 80) sebaran[3]++;
            else sebaran[4]++;
        });

        return { diusulkan, cadangan, lulus, tidak_lulus, mengundurkan_diri, bobotKriteria, sebaranNilai: sebaran };
    },

    async getRiwayatAntarPeriode() {
        const [rows] = await db.query(`
            SELECT 
                p.id_periode,
                p.tahun_ajaran,
                p.status_periode,
                p.kuota_kelas_digital,
                (SELECT COUNT(*) FROM siswa s WHERE s.id_periode = p.id_periode) AS totalSiswa,
                (SELECT COUNT(*) FROM siswa s WHERE s.id_periode = p.id_periode AND s.status_penerimaan = 'lulus') AS totalLulus,
                (SELECT COUNT(*) FROM siswa s WHERE s.id_periode = p.id_periode AND s.status_penerimaan = 'cadangan') AS totalCadangan,
                (SELECT COUNT(*) FROM siswa s WHERE s.id_periode = p.id_periode AND s.status_penerimaan = 'diusulkan') AS totalDiusulkan,
                (SELECT COUNT(*) FROM siswa s WHERE s.id_periode = p.id_periode AND s.status_penerimaan = 'mengundurkan_diri') AS totalMundur
            FROM periode_seleksi p
            ORDER BY p.id_periode ASC
        `);
        return rows;
    },

    // ======================================================================
    // BARU: data mentah untuk bagian "Progres Periode Berjalan" di dashboard operator.
    // Hanya membaca data (SELECT), tidak mengubah apa pun.
    // "Peserta" = siswa yang status minatnya 'berminat'.
    // ======================================================================
    async getProgresPeriode(id_periode) {
        // Kelengkapan nilai per kriteria (dihitung dari peserta berminat saja)
        const [kriteriaRows] = await db.query(
            `SELECT k.id_kriteria, k.nama_kriteria, k.jenis,
                    (SELECT COUNT(*)
                     FROM nilai_siswa ns
                     INNER JOIN siswa s ON s.id_siswa = ns.id_siswa
                     INNER JOIN akun_siswa a ON a.id_siswa = ns.id_siswa
                     WHERE ns.id_kriteria = k.id_kriteria
                       AND s.id_periode = k.id_periode
                       AND a.status_minat = 'berminat'
                       AND ns.nilai_mentah IS NOT NULL) AS terisi
             FROM kriteria k
             WHERE k.id_periode = ?
             ORDER BY k.id_kriteria ASC`,
            [id_periode]
        );

        const kriteria = kriteriaRows.map(r => ({
            id_kriteria: r.id_kriteria,
            nama_kriteria: r.nama_kriteria,
            jenis: r.jenis,
            terisi: Number(r.terisi) || 0
        }));

        // Bobot FUCOM yang tersimpan
        const [bobot] = await db.query(
            `SELECT k.nama_kriteria, bk.nilai_bobot, bk.nilai_dfc
             FROM bobot_kriteria bk
             JOIN kriteria k ON k.id_kriteria = bk.id_kriteria
             WHERE bk.id_periode = ?
             ORDER BY bk.nilai_bobot DESC`,
            [id_periode]
        );

        const [[responden]] = await db.query(
            'SELECT COUNT(DISTINCT nama_responden) AS jumlah FROM perbandingan_fucom WHERE id_periode = ?',
            [id_periode]
        );

        const [[waspas]] = await db.query(
            'SELECT COUNT(*) AS jumlah FROM hasil_waspas WHERE id_periode = ?',
            [id_periode]
        );

        // Akun aktif yang belum pernah login / belum mengganti password awal
        const [[akun]] = await db.query(
            `SELECT
                SUM(CASE WHEN a.last_login IS NULL THEN 1 ELSE 0 END) AS belumLogin,
                SUM(CASE WHEN a.wajib_ganti_password = 1 THEN 1 ELSE 0 END) AS belumGantiPassword
             FROM akun_siswa a
             INNER JOIN siswa s ON s.id_siswa = a.id_siswa
             WHERE s.id_periode = ? AND a.status_akun = 'aktif'`,
            [id_periode]
        );

        // Jumlah kriteria yang sudah terisi untuk tiap siswa
        const [nilaiRows] = await db.query(
            `SELECT ns.id_siswa, COUNT(DISTINCT ns.id_kriteria) AS terisi
             FROM nilai_siswa ns
             INNER JOIN siswa s ON s.id_siswa = ns.id_siswa
             INNER JOIN kriteria k ON k.id_kriteria = ns.id_kriteria AND k.id_periode = s.id_periode
             WHERE s.id_periode = ? AND ns.nilai_mentah IS NOT NULL
             GROUP BY ns.id_siswa`,
            [id_periode]
        );

        const nilaiPerSiswa = {};
        nilaiRows.forEach(r => { nilaiPerSiswa[String(r.id_siswa)] = Number(r.terisi) || 0; });

        return {
            totalKriteria: kriteria.length,
            kriteria,
            bobot,
            jumlahResponden: Number(responden && responden.jumlah) || 0,
            jumlahHasilWaspas: Number(waspas && waspas.jumlah) || 0,
            belumLogin: Number(akun && akun.belumLogin) || 0,
            belumGantiPassword: Number(akun && akun.belumGantiPassword) || 0,
            nilaiPerSiswa
        };
    }
};

module.exports = dashboardModel;