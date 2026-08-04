const db = require('../config/database');

const logModel = {
    async getAllLogs(filterRole = null, tanggal = null) {
        let query = `
            SELECT la.*, u.nama, u.role 
            FROM log_aktivitas la
            JOIN users u ON la.id_user = u.id_user
            WHERE 1=1
        `;
        const params = [];

        if (filterRole) {
            query += ' AND u.role = ?';
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