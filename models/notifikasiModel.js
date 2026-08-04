const db = require('../config/database');

const notifikasiModel = {
    async getForAdmin(id_periode) {
        const notif = [];

        if (!id_periode) return notif;

        const [[{ siswaBelumLengkap }]] = await db.query(
            `SELECT COUNT(*) AS siswaBelumLengkap FROM siswa s
             WHERE s.id_periode = ? AND (
                SELECT COUNT(*) FROM nilai_siswa ns WHERE ns.id_siswa = s.id_siswa AND ns.nilai_mentah IS NOT NULL
             ) < (SELECT COUNT(*) FROM kriteria WHERE id_periode = ?)`,
            [id_periode, id_periode]
        );
        if (siswaBelumLengkap > 0) {
            notif.push({ icon: 'bi-exclamation-triangle-fill', warna: 'orange', pesan: `${siswaBelumLengkap} siswa belum memiliki nilai lengkap.` });
        }

        const [[{ totalBobot }]] = await db.query('SELECT COUNT(*) AS totalBobot FROM bobot_kriteria WHERE id_periode = ?', [id_periode]);
        if (totalBobot === 0) {
            notif.push({ icon: 'bi-sliders', warna: 'blue', pesan: 'Bobot kriteria (FUCOM) belum dihitung.' });
        }

        const [[{ totalHasil }]] = await db.query('SELECT COUNT(*) AS totalHasil FROM hasil_waspas WHERE id_periode = ?', [id_periode]);
        if (totalHasil === 0 && totalBobot > 0) {
            notif.push({ icon: 'bi-graph-up-arrow', warna: 'blue', pesan: 'Perangkingan WASPAS belum dihitung.' });
        }

        return notif;
    },

    async getForKepsek(id_periode) {
        const notif = [];
        if (!id_periode) return notif;

        const [[statusHasil]] = await db.query(
            "SELECT status_final FROM hasil_waspas WHERE id_periode = ? LIMIT 1", [id_periode]
        );

        if (statusHasil) {
            if (statusHasil.status_final === 'final') {
                notif.push({ icon: 'bi-check-circle-fill', warna: 'green', pesan: 'Hasil penempatan siswa sudah ditetapkan final.' });
            } else {
                notif.push({ icon: 'bi-hourglass-split', warna: 'orange', pesan: 'Hasil rekomendasi tersedia, menunggu penetapan final.' });
            }
        }

        return notif;
    },

    async getForSuperAdmin() {
        const [rows] = await db.query(
            `SELECT la.aktivitas, la.waktu, u.nama 
             FROM log_aktivitas la JOIN users u ON la.id_user = u.id_user
             ORDER BY la.waktu DESC LIMIT 5`
        );
        return rows.map(r => ({ icon: 'bi-clock-history', warna: 'blue', pesan: `${r.nama}: ${r.aktivitas}` }));
    }
};

module.exports = notifikasiModel;