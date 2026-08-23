const db = require('../config/database');

const userModel = {
    async findByUsername(username) {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE username = ? AND status_aktif = TRUE',
            [username]
        );
        return rows[0];
    },

    async getById(id_user) {
        const [rows] = await db.query('SELECT * FROM users WHERE id_user = ?', [id_user]);
        return rows[0];
    },

    async updateProfile(id_user, nama) {
        await db.query('UPDATE users SET nama = ? WHERE id_user = ?', [nama, id_user]);
    },

    async updatePassword(id_user, hashedPassword) {
        await db.query('UPDATE users SET password = ? WHERE id_user = ?', [hashedPassword, id_user]);
    },

    async updateFoto(id_user, namaFile) {
        await db.query('UPDATE users SET foto_profil = ? WHERE id_user = ?', [namaFile, id_user]);
    },

    async logActivity(id_user, aktivitas) {
        await db.query(
            'INSERT INTO log_aktivitas (id_user, aktivitas) VALUES (?, ?)',
            [id_user, aktivitas]
        );
    },

    async updateLastLogin(id_user) {
        await db.query('UPDATE users SET last_login = NOW() WHERE id_user = ?', [id_user]);
    },

    // Cari user berdasarkan email (hanya akun aktif) — dipakai saat proses "Lupa Password"
    async findByEmail(email) {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE email = ? AND status_aktif = TRUE',
            [email]
        );
        return rows[0];
    },

    // Tandai/hapus tanda "wajib ganti password" — dipakai saat reset password (lupa password / reset manual admin)
    // dan saat user selesai mengganti passwordnya sendiri.
    async setWajibGantiPassword(id_user, value) {
        await db.query('UPDATE users SET wajib_ganti_password = ? WHERE id_user = ?', [value, id_user]);
    }
};

module.exports = userModel;