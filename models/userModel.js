const db = require('../config/database');

const userModel = {
    async findByUsername(username) {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE username = ? AND status_aktif = TRUE',
            [username]
        );
        return rows[0];
    },

    async logActivity(id_user, aktivitas) {
        await db.query(
            'INSERT INTO log_aktivitas (id_user, aktivitas) VALUES (?, ?)',
            [id_user, aktivitas]
        );
    }
};

module.exports = userModel;