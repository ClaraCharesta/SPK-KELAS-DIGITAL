const kriteriaModel = require('../models/kriteriaModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');

const kriteriaController = {
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            const basePath = req.session.user.role === 'super_admin' ? 'superadmin' : 'admin';

            if (!periode) {
                return res.render(`${basePath}/kriteria`, {
                    user: req.session.user, kriteriaList: [], activePage: 'kriteria',
                    pageTitle: 'Kelola Kriteria', success: null,
                    error: 'Belum ada periode seleksi aktif.'
                });
            }

            const kriteriaList = await kriteriaModel.getAll(periode.id_periode);
            res.render(`${basePath}/kriteria`, {
                user: req.session.user, kriteriaList, activePage: 'kriteria',
                pageTitle: 'Kelola Kriteria',
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data kriteria.');
        }
    },

    async create(req, res) {
        try {
            const basePath = req.session.user.role === 'super_admin' ? 'superadmin' : 'admin';
            const periode = await periodeModel.getActivePeriode();
            if (!periode) return res.redirect(`/${basePath}/kriteria?error=Periode seleksi belum aktif.`);

            const { nama_kriteria, jenis, keterangan } = req.body;
            if (!nama_kriteria || !jenis) {
                return res.redirect(`/${basePath}/kriteria?error=Nama kriteria dan jenis wajib diisi.`);
            }

            await kriteriaModel.create({ id_periode: periode.id_periode, nama_kriteria, jenis, keterangan });
            await userModel.logActivity(req.session.user.id_user, `Menambahkan kriteria baru: ${nama_kriteria}`);

            res.redirect(`/${basePath}/kriteria?success=Kriteria berhasil ditambahkan.`);
        } catch (error) {
            console.error(error);
            const basePath = req.session.user.role === 'super_admin' ? 'superadmin' : 'admin';
            res.redirect(`/${basePath}/kriteria?error=Terjadi kesalahan sistem.`);
        }
    },

    async update(req, res) {
        try {
            const basePath = req.session.user.role === 'super_admin' ? 'superadmin' : 'admin';
            const { id_kriteria, nama_kriteria, jenis, keterangan } = req.body;

            await kriteriaModel.update(id_kriteria, { nama_kriteria, jenis, keterangan });
            await userModel.logActivity(req.session.user.id_user, `Memperbarui kriteria: ${nama_kriteria}`);

            res.redirect(`/${basePath}/kriteria?success=Kriteria berhasil diperbarui.`);
        } catch (error) {
            console.error(error);
            const basePath = req.session.user.role === 'super_admin' ? 'superadmin' : 'admin';
            res.redirect(`/${basePath}/kriteria?error=Terjadi kesalahan sistem.`);
        }
    },

    async delete(req, res) {
        try {
            const basePath = req.session.user.role === 'super_admin' ? 'superadmin' : 'admin';
            const { id_kriteria } = req.params;
            const kriteria = await kriteriaModel.getById(id_kriteria);

            await kriteriaModel.delete(id_kriteria);
            await userModel.logActivity(req.session.user.id_user, `Menghapus kriteria: ${kriteria ? kriteria.nama_kriteria : id_kriteria}`);

            res.redirect(`/${basePath}/kriteria?success=Kriteria berhasil dihapus.`);
        } catch (error) {
            console.error(error);
            const basePath = req.session.user.role === 'super_admin' ? 'superadmin' : 'admin';
            res.redirect(`/${basePath}/kriteria?error=Gagal menghapus. Pastikan kriteria ini belum memiliki nilai/bobot terkait.`);
        }
    }
};

module.exports = kriteriaController;