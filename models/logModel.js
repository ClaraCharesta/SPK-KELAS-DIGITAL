const db = require('../config/database');

const logModel = {
    async getAllLogs(filterRole = null, tanggal = null) {
        // role diambil dari snapshot di log (la.role_log).
        // COALESCE ke u.role hanya sebagai cadangan kalau ada baris lama yang role_log-nya masih NULL.
        let query = `
            SELECT la.*, u.nama, COALESCE(la.role_log, u.role) AS role
            FROM log_aktivitas la
            JOIN users u ON la.id_user = u.id_user
            WHERE 1=1
        `;
        const params = [];

        if (filterRole) {
            query += ' AND COALESCE(la.role_log, u.role) = ?';
            params.push(filterRole);
        }
        if (tanggal) {
            query += ' AND DATE(la.waktu) = ?';
            params.push(tanggal);
        }

        query += ' ORDER BY la.waktu DESC LIMIT 200';

        const [rows] = await db.query(query, params);
        return rows;
    }
};

module.exports = logModel;