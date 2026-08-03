const db = require('../config/database');
const bcrypt = require('bcrypt');

const userManagementModel = {
    async getAllUsers() {
        const [rows] = await db.query(
            "SELECT id_user, nama, username, role, status_aktif, created_at FROM users WHERE role IN ('admin','kepsek') ORDER BY created_at DESC"
        );
        return rows;
    },

    async getUserById(id_user) {
        const [rows] = await db.query('SELECT * FROM users WHERE id_user = ?', [id_user]);
        return rows[0];
    },

    async checkUsernameExists(username) {
        const [rows] = await db.query('SELECT id_user FROM users WHERE username = ?', [username]);
        return rows.length > 0;
    },

    async createUser(nama, username, password, role) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO users (nama, username, password, role, status_aktif) VALUES (?, ?, ?, ?, TRUE)',
            [nama, username, hashedPassword, role]
        );
        return result.insertId;
    },

    async updateUser(id_user, nama, username, role) {
        await db.query(
            'UPDATE users SET nama = ?, username = ?, role = ? WHERE id_user = ?',
            [nama, username, role, id_user]
        );
    },

    async updatePassword(id_user, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password = ? WHERE id_user = ?', [hashedPassword, id_user]);
    },

    async toggleStatus(id_user) {
        await db.query('UPDATE users SET status_aktif = NOT status_aktif WHERE id_user = ?', [id_user]);
    },

    async deleteUser(id_user) {
        await db.query('DELETE FROM users WHERE id_user = ?', [id_user]);
    }
};

module.exports = userManagementModel;