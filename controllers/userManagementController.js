const userManagementModel = require('../models/userManagementModel');
const userModel = require('../models/userModel');

const userManagementController = {
    async index(req, res) {
        try {
            const users = await userManagementModel.getAllUsers();
            res.render('superadmin/akun-admin', {
                user: req.session.user,
                users,
                activePage: 'akun-admin',
                pageTitle: 'Kelola Akun Admin',
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data pengguna.');
        }
    },

    async create(req, res) {
        try {
            const { nama, username, password, role } = req.body;

            if (!nama || !username || !password || !role) {
                return res.redirect('/superadmin/akun-admin?error=Semua field wajib diisi.');
            }

            const exists = await userManagementModel.checkUsernameExists(username);
            if (exists) {
                return res.redirect('/superadmin/akun-admin?error=Username sudah digunakan.');
            }

            await userManagementModel.createUser(nama, username, password, role);
            await userModel.logActivity(req.session.user.id_user, `Super Admin menambahkan akun baru: ${nama} (${role})`);

            res.redirect('/superadmin/akun-admin?success=Akun berhasil ditambahkan.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/akun-admin?error=Terjadi kesalahan sistem.');
        }
    },

    async update(req, res) {
        try {
            const { id_user, nama, username, role } = req.body;
            await userManagementModel.updateUser(id_user, nama, username, role);
            await userModel.logActivity(req.session.user.id_user, `Super Admin memperbarui akun: ${nama}`);
            res.redirect('/superadmin/akun-admin?success=Akun berhasil diperbarui.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/akun-admin?error=Terjadi kesalahan sistem.');
        }
    },

    async resetPassword(req, res) {
        try {
            const { id_user, newPassword } = req.body;
            await userManagementModel.updatePassword(id_user, newPassword);
            const targetUser = await userManagementModel.getUserById(id_user);
            await userModel.logActivity(req.session.user.id_user, `Super Admin mereset password akun: ${targetUser.nama}`);
            res.redirect('/superadmin/akun-admin?success=Password berhasil direset.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/akun-admin?error=Terjadi kesalahan sistem.');
        }
    },

    async toggleStatus(req, res) {
        try {
            const { id_user } = req.params;
            const targetUser = await userManagementModel.getUserById(id_user);
            await userManagementModel.toggleStatus(id_user);
            await userModel.logActivity(req.session.user.id_user, `Super Admin mengubah status akun: ${targetUser.nama}`);
            res.redirect('/superadmin/akun-admin?success=Status akun berhasil diubah.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/akun-admin?error=Terjadi kesalahan sistem.');
        }
    },

    async delete(req, res) {
        try {
            const { id_user } = req.params;
            const targetUser = await userManagementModel.getUserById(id_user);
            await userManagementModel.deleteUser(id_user);
            await userModel.logActivity(req.session.user.id_user, `Super Admin menghapus akun: ${targetUser.nama}`);
            res.redirect('/superadmin/akun-admin?success=Akun berhasil dihapus.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/akun-admin?error=Terjadi kesalahan sistem.');
        }
    }
};

module.exports = userManagementController;