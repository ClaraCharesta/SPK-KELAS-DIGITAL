const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');

const periodeController = {
    async index(req, res) {
        try {
            const periodeList = await periodeModel.getAll();
            const latestId = await periodeModel.getLatestId();
            res.render('superadmin/periode', {
                user: req.session.user, periodeList, latestId, activePage: 'periode',
                pageTitle: 'Kelola Periode Seleksi',
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data periode.');
        }
    },

    async create(req, res) {
        try {
            const { tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai } = req.body;

            if (!tahun_ajaran || !kuota_kelas_digital) {
                return res.redirect('/superadmin/periode?error=Tahun ajaran dan kuota wajib diisi.');
            }

            await periodeModel.create({ tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai });
            await userModel.logActivity(req.session.user.id_user, `Super Admin membuka periode seleksi baru: ${tahun_ajaran}`);

            res.redirect('/superadmin/periode?success=Periode seleksi berhasil dibuat dan diaktifkan.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=Terjadi kesalahan sistem.');
        }
    },

    async updateKuota(req, res) {
        try {
            const { id_periode, kuota_kelas_digital } = req.body;
            await periodeModel.updateKuota(id_periode, kuota_kelas_digital);
            await userModel.logActivity(req.session.user.id_user, `Super Admin mengubah kuota periode ID ${id_periode} menjadi ${kuota_kelas_digital}`);
            res.redirect('/superadmin/periode?success=Kuota berhasil diperbarui. Jika sudah ada hasil WASPAS, hitung ulang untuk memperbarui status Diterima/Cadangan.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=Terjadi kesalahan sistem.');
        }
    },

    async setActive(req, res) {
        try {
            const { id_periode } = req.params;
            await periodeModel.setActive(id_periode);
            await userModel.logActivity(req.session.user.id_user, `Super Admin mengaktifkan periode ID ${id_periode}`);
            res.redirect('/superadmin/periode?success=Periode berhasil diaktifkan.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=Terjadi kesalahan sistem.');
        }
    },

    async update(req, res) {
        try {
            const { id_periode, tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai } = req.body;
            const latestId = await periodeModel.getLatestId();

            if (parseInt(id_periode) !== latestId) {
                return res.redirect('/superadmin/periode?error=Hanya periode terbaru yang dapat diedit.');
            }

            await periodeModel.update(id_periode, { tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai });
            await userModel.logActivity(req.session.user.id_user, `Super Admin memperbarui periode: ${tahun_ajaran}`);
            res.redirect('/superadmin/periode?success=Periode berhasil diperbarui.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=Terjadi kesalahan sistem.');
        }
    },

    async delete(req, res) {
        try {
            const { id_periode } = req.params;
            const latestId = await periodeModel.getLatestId();

            if (parseInt(id_periode) !== latestId) {
                return res.redirect('/superadmin/periode?error=Hanya periode terbaru yang dapat dihapus.');
            }

            const statusPenyelesaian = await periodeModel.getStatusPenyelesaian(id_periode);
            if (statusPenyelesaian === 'selesai') {
                return res.redirect('/superadmin/periode?error=Periode ini tidak dapat dihapus karena sudah dinyatakan selesai dan tersimpan sebagai data historis.');
            }

            await periodeModel.deleteCascade(id_periode);
            await userModel.logActivity(req.session.user.id_user, `Super Admin menghapus periode ID ${id_periode} beserta seluruh data terkait`);
            res.redirect('/superadmin/periode?success=Periode beserta seluruh data terkait berhasil dihapus.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=Terjadi kesalahan sistem.');
        }
    },

    async tutupManual(req, res) {
        try {
            const { id_periode } = req.params;
            await periodeModel.tutupManual(id_periode);
            await userModel.logActivity(req.session.user.id_user, `Super Admin menutup periode ID ${id_periode} secara manual`);
            res.redirect('/superadmin/periode?success=Periode berhasil ditutup.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=Terjadi kesalahan sistem.');
        }
    }
};

module.exports = periodeController;