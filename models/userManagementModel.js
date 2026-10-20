const db = require('../config/database');
const bcrypt = require('bcrypt');

const userManagementModel = {
    // Hanya tampilkan akun yang masih aktif (status_aktif = TRUE)
    async getAllUsers() {
        const [rows] = await db.query(
            "SELECT id_user, nama, username, email, nip, role, status_aktif, created_at FROM users WHERE role IN ('operator','kepsek') AND status_aktif = TRUE ORDER BY created_at DESC"
        );
        return rows;
    },

    async getUserById(id_user) {
        const [rows] = await db.query('SELECT * FROM users WHERE id_user = ?', [id_user]);
        return rows[0];
    },

    // Kepala Sekolah yang sedang AKTIF. Kepsek hanya boleh 1 yang aktif.
    // excludeId (opsional) dipakai untuk mengabaikan akun tertentu (mis. akun yang sedang diedit).
    // Return { id_user, nama, username } atau undefined jika tidak ada kepsek aktif.
    async getKepsekAktif(excludeId = null) {
        let query = "SELECT id_user, nama, username FROM users WHERE role = 'kepsek' AND status_aktif = TRUE";
        const params = [];

        if (excludeId) {
            query += ' AND id_user != ?';
            params.push(excludeId);
        }

        query += ' ORDER BY created_at DESC, id_user DESC LIMIT 1';

        const [rows] = await db.query(query, params);
        return rows[0];
    },

    // Hanya cek username yang MASIH AKTIF. Username milik akun nonaktif dianggap "bebas dipakai lagi".
    async checkUsernameExists(username) {
        const [rows] = await db.query(
            'SELECT id_user FROM users WHERE username = ? AND status_aktif = TRUE',
            [username]
        );
        return rows.length > 0;
    },

    // Hanya cek email yang MASIH AKTIF. Email milik akun nonaktif dianggap "bebas dipakai lagi".
    async checkEmailExists(email, excludeId = null) {
        let query = 'SELECT id_user FROM users WHERE email = ? AND status_aktif = TRUE';
        const params = [email];

        if (excludeId) {
            query += ' AND id_user != ?';
            params.push(excludeId);
        }

        const [rows] = await db.query(query, params);
        return rows.length > 0;
    },

    // Hanya cek NIP yang MASIH AKTIF (sama seperti email/username). NIP kosong tidak dicek.
    async checkNipExists(nip, excludeId = null) {
        if (!nip) return false;

        let query = 'SELECT id_user FROM users WHERE nip = ? AND status_aktif = TRUE';
        const params = [nip];

        if (excludeId) {
            query += ' AND id_user != ?';
            params.push(excludeId);
        }

        const [rows] = await db.query(query, params);
        return rows.length > 0;
    },

    // Cari akun NONAKTIF berdasarkan username saja (dipisah dari email supaya bisa dideteksi
    // kalau username dan email ternyata cocok ke DUA akun lama yang berbeda).
    async findInactiveByUsername(username) {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE username = ? AND status_aktif = FALSE LIMIT 1',
            [username]
        );
        return rows[0];
    },

    // Cari akun NONAKTIF berdasarkan email saja.
    async findInactiveByEmail(email) {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE email = ? AND status_aktif = FALSE LIMIT 1',
            [email]
        );
        return rows[0];
    },

    // nip = null untuk role selain kepsek yang tidak mengisi NIP.
    async createUser(nama, username, email, password, role, nip = null) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO users (nama, username, email, nip, password, role, status_aktif) VALUES (?, ?, ?, ?, ?, ?, TRUE)',
            [nama, username, email, nip || null, hashedPassword, role]
        );
        return result.insertId;
    },

    // BARU: reaktivasi akun lama yang nonaktif -> ditimpa dengan data baru + status_aktif jadi TRUE.
    // Row lama TETAP dipakai (id_user sama), jadi log_aktivitas lama akun ini tetap nyambung.
    async reactivateUser(id_user, nama, username, email, password, role, nip = null) {
        const hashedPassword = await bcrypt.hash(password, 10);
        try {
            await db.query(
                'UPDATE users SET nama = ?, username = ?, email = ?, nip = ?, password = ?, role = ?, status_aktif = TRUE WHERE id_user = ?',
                [nama, username, email, nip || null, hashedPassword, role, id_user]
            );
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                throw new Error(`Username atau email sudah dipakai akun lain (mungkin diinput bersamaan oleh pengguna lain). Detail: ${err.sqlMessage}`);
            }
            throw err;
        }
    },

    async updateUser(id_user, nama, username, email, role, nip = null) {
        await db.query(
            'UPDATE users SET nama = ?, username = ?, email = ?, nip = ?, role = ? WHERE id_user = ?',
            [nama, username, email, nip || null, role, id_user]
        );
    },

    async updatePassword(id_user, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password = ? WHERE id_user = ?', [hashedPassword, id_user]);
    },

    async toggleStatus(id_user) {
        await db.query('UPDATE users SET status_aktif = NOT status_aktif WHERE id_user = ?', [id_user]);
    },

    // Soft delete: akun tidak dihapus dari database, hanya ditandai nonaktif.
    // Log aktivitas tetap aman karena row users tidak pernah dihapus.
    async deleteUser(id_user) {
        const [result] = await db.query(
            'UPDATE users SET status_aktif = FALSE WHERE id_user = ?',
            [id_user]
        );
        return result;
    }
};

module.exports = userManagementModel;