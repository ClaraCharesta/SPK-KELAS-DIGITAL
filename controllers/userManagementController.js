const userManagementModel = require('../models/userManagementModel');
const userModel = require('../models/userModel');

const REGEX_EMAIL = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;

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
            const { nama, username, email, password, role } = req.body;

            if (!nama || !username || !email || !password || !role) {
                return res.redirect('/superadmin/akun-admin?error=Semua field wajib diisi, termasuk email.');
            }

            if (!REGEX_EMAIL.test(email.trim())) {
                return res.redirect('/superadmin/akun-admin?error=Email harus menggunakan domain @gmail.com.');
            }

            // Cek duplikasi hanya terhadap akun yang MASIH AKTIF
            const usernameExists = await userManagementModel.checkUsernameExists(username);
            if (usernameExists) {
                return res.redirect('/superadmin/akun-admin?error=Username sudah digunakan oleh akun aktif lain.');
            }

            const emailExists = await userManagementModel.checkEmailExists(email.trim());
            if (emailExists) {
                return res.redirect('/superadmin/akun-admin?error=Email sudah digunakan oleh akun aktif lain.');
            }

            // Cek apakah username/email ini dulu pernah dipakai akun yang SUDAH DIHAPUS (nonaktif)
            // Kalau ada, aktifkan kembali akun lama itu (update data) daripada bikin row baru
            const inactiveUser = await userManagementModel.findInactiveByUsernameOrEmail(username, email.trim());

            if (inactiveUser) {
                await userManagementModel.reactivateUser(
                    inactiveUser.id_user,
                    nama,
                    username,
                    email.trim(),
                    password,
                    role
                );
                await userModel.logActivity(
                    req.session.user.id_user,
                    `Super Admin mengaktifkan kembali akun lama: ${nama} (${role})`
                );
                return res.redirect('/superadmin/akun-admin?success=Akun lama ditemukan dan berhasil diaktifkan kembali dengan data baru.');
            }

            // Kalau tidak ada akun lama yang cocok, baru buat akun benar-benar baru
            await userManagementModel.createUser(nama, username, email.trim(), password, role);
            await userModel.logActivity(req.session.user.id_user, `Super Admin menambahkan akun baru: ${nama} (${role})`);

            res.redirect('/superadmin/akun-admin?success=Akun berhasil ditambahkan.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/akun-admin?error=Terjadi kesalahan sistem.');
        }
    },

    async update(req, res) {
        try {
            const { id_user, nama, username, email, role } = req.body;

            if (!nama || !username || !email || !role) {
                return res.redirect('/superadmin/akun-admin?error=Semua field wajib diisi, termasuk email.');
            }

            if (!REGEX_EMAIL.test(email.trim())) {
                return res.redirect('/superadmin/akun-admin?error=Email harus menggunakan domain @gmail.com.');
            }

            const emailExists = await userManagementModel.checkEmailExists(email.trim(), id_user);
            if (emailExists) {
                return res.redirect('/superadmin/akun-admin?error=Email sudah digunakan oleh akun lain.');
            }

            await userManagementModel.updateUser(id_user, nama, username, email.trim(), role);
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
            // Password ini juga password "sementara" yang Super Admin tahu — jadi user tetap wajib ganti sendiri saat login berikutnya
            await userModel.setWajibGantiPassword(id_user, true);
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