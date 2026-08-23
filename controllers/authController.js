const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');
const { sendDefaultPasswordEmail } = require('../utils/mailer');

// Password default per role saat reset lewat "Lupa Password"
const DEFAULT_PASSWORD_BY_ROLE = {
    super_admin: 'SuperAdmin123',
    admin: 'Admin123',
    kepsek: 'Kepsek123'
};

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
                isFirstLogin: isFirstLogin,
                wajibGantiPassword: !!user.wajib_ganti_password
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
    },

    // ====== LUPA PASSWORD (versi sederhana: kirim password default sesuai role) ======

    // Tampilkan form input email
    showForgotPasswordPage(req, res) {
        if (req.session.user) {
            return res.redirect('/dashboard');
        }
        res.render('forgot-password', { error: null, success: null });
    },

    // Proses: cari user by email, reset password ke default sesuai role, kirim email
    async processForgotPassword(req, res) {
        const { email } = req.body;

        try {
            if (!email) {
                return res.render('forgot-password', { error: 'Email wajib diisi.', success: null });
            }

            const user = await userModel.findByEmail(email.trim());

            // Catatan keamanan: pesan sukses ditampilkan sama saja baik email ditemukan atau tidak,
            // supaya orang luar tidak bisa menebak-nebak email mana saja yang terdaftar di sistem.
            const pesanSukses = 'Jika email terdaftar, password baru telah dikirim ke email kamu. Silakan cek inbox/folder spam.';

            if (!user) {
                return res.render('forgot-password', { error: null, success: pesanSukses });
            }

            const passwordBaru = DEFAULT_PASSWORD_BY_ROLE[user.role] || 'Password123';
            const hashedPassword = await bcrypt.hash(passwordBaru, 10);

            await userModel.updatePassword(user.id_user, hashedPassword);
            // Tandai akun ini wajib ganti password setelah login pakai password sementara
            await userModel.setWajibGantiPassword(user.id_user, true);
            await sendDefaultPasswordEmail(user.email, user.nama, passwordBaru);
            await userModel.logActivity(user.id_user, `${user.nama} mereset password lewat "Lupa Password" (dikirim ke email)`);

            res.render('forgot-password', { error: null, success: pesanSukses });
        } catch (error) {
            console.error(error);
            res.render('forgot-password', { error: 'Terjadi kesalahan pada server. Silakan coba lagi.', success: null });
        }
    },

    // ====== GANTI PASSWORD WAJIB (dipicu overlay di dashboard) ======
    async processGantiPasswordWajib(req, res) {
        try {
            const { newPassword, confirmPassword } = req.body;
            const id_user = req.session.user.id_user;

            if (!newPassword || !confirmPassword) {
                return res.redirect('/dashboard?error=' + encodeURIComponent('Password baru dan konfirmasi password wajib diisi.'));
            }
            if (newPassword.length < 6) {
                return res.redirect('/dashboard?error=' + encodeURIComponent('Password baru minimal 6 karakter.'));
            }
            if (newPassword !== confirmPassword) {
                return res.redirect('/dashboard?error=' + encodeURIComponent('Konfirmasi password tidak cocok dengan password baru.'));
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await userModel.updatePassword(id_user, hashedPassword);
            await userModel.setWajibGantiPassword(id_user, false);
            await userModel.logActivity(id_user, `${req.session.user.nama} mengganti password wajib setelah reset`);

            // update session supaya overlay langsung hilang tanpa perlu login ulang
            req.session.user.wajibGantiPassword = false;

            res.redirect('/dashboard?success=' + encodeURIComponent('Password berhasil diganti. Selamat menggunakan sistem.'));
        } catch (error) {
            console.error(error);
            res.redirect('/dashboard?error=' + encodeURIComponent('Terjadi kesalahan sistem saat mengganti password.'));
        }
    }
};

module.exports = authController;