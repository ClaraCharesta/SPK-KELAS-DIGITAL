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

    async logActivity(id_user, aktivitas) {
        await db.query(
            'INSERT INTO log_aktivitas (id_user, aktivitas) VALUES (?, ?)',
            [id_user, aktivitas]
        );
    }
};

module.exports = userModel;