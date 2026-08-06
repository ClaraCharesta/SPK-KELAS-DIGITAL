const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');
const authController = {
    showLoginPage(req, res) {
        // kalau sudah login, langsung lempar ke dashboard, gak perlu login lagi
        if (req.session.user) {
            return res.redirect('/dashboard');
        }
        res.render('login', { error: null });
    },
    async processLogin(req, res) {
        const { username, password } = req.body;

        try {
            const user = await userModel.findByUsername(username);

            if (!user) {
                return res.render('login', { error: 'Username tidak ditemukan.' });
            }

            const passwordCocok = await bcrypt.compare(password, user.password);

            if (!passwordCocok) {
                return res.render('login', { error: 'Password salah.' });
            }

            const isFirstLogin = user.last_login === null;

            req.session.user = {
                id_user: user.id_user,
                nama: user.nama,
                username: user.username,
                role: user.role,
                foto_profil: user.foto_profil || null,
                isFirstLogin: isFirstLogin
            };

            await userModel.updateLastLogin(user.id_user);
            await userModel.logActivity(user.id_user, `${user.nama} login ke sistem`);

            res.redirect('/dashboard');

        } catch (error) {
            console.error(error);
            res.render('login', { error: 'Terjadi kesalahan pada server.' });
        }
    },
    logout(req, res) {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    }
};
module.exports = authController;