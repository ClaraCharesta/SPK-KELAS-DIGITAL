const logModel = require('../models/logModel');

const logController = {
    async index(req, res) {
        try {
            const { role, tanggal } = req.query;
            const logs = await logModel.getAllLogs(role || null, tanggal || null);

            res.render('superadmin/log', {
                user: req.session.user, activePage: 'log', pageTitle: 'Log Aktivitas',
                logs, filterRole: role || '', filterTanggal: tanggal || ''
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data log.');
        }
    }
};

module.exports = logController;