const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const userModel = require('../models/userModel');

const profileController = {
    async index(req, res) {
        try {
            const userData = await userModel.getById(req.session.user.id_user);

            res.render('shared/profile', {
                user: req.session.user, userData, activePage: 'profile',
                pageTitle: 'Profil Saya',
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data profil.');
        }
    },

    async updateNama(req, res) {
        try {
            const { nama } = req.body;
            if (!nama || nama.trim() === '') {
                return res.redirect('/profile?error=Nama tidak boleh kosong.');
            }

            await userModel.updateProfile(req.session.user.id_user, nama.trim());
            req.session.user.nama = nama.trim();

            res.redirect('/profile?success=Nama berhasil diperbarui.');
        } catch (error) {
            console.error(error);
            res.redirect('/profile?error=Terjadi kesalahan sistem.');
        }
    },

    async updatePassword(req, res) {
        try {
            const { password_lama, password_baru, konfirmasi_password } = req.body;

            const userData = await userModel.getById(req.session.user.id_user);
            const cocok = await bcrypt.compare(password_lama, userData.password);

            if (!cocok) {
                return res.redirect('/profile?error=Password lama tidak sesuai.');
            }
            if (password_baru !== konfirmasi_password) {
                return res.redirect('/profile?error=Konfirmasi password baru tidak cocok.');
            }
            if (password_baru.length < 6) {
                return res.redirect('/profile?error=Password baru minimal 6 karakter.');
            }

            const hashedPassword = await bcrypt.hash(password_baru, 10);
            await userModel.updatePassword(req.session.user.id_user, hashedPassword);

            res.redirect('/profile?success=Password berhasil diubah.');
        } catch (error) {
            console.error(error);
            res.redirect('/profile?error=Terjadi kesalahan sistem.');
        }
    },

    async updateFoto(req, res) {
        try {
            if (!req.file) return res.redirect('/profile?error=Silakan pilih foto terlebih dahulu.');

            const userData = await userModel.getById(req.session.user.id_user);

            // Hapus foto lama kalau ada
            if (userData.foto_profil) {
                const fotoLamaPath = path.join(__dirname, '../public/img/profile', userData.foto_profil);
                if (fs.existsSync(fotoLamaPath)) fs.unlinkSync(fotoLamaPath);
            }

            await userModel.updateFoto(req.session.user.id_user, req.file.filename);
            req.session.user.foto_profil = req.file.filename;

            res.redirect('/profile?success=Foto profil berhasil diperbarui.');
        } catch (error) {
            console.error(error);
            res.redirect('/profile?error=Terjadi kesalahan sistem.');
        }
    }
};

module.exports = profileController;