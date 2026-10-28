const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');
const akunSiswaModel = require('../models/akunSiswaModel');
const { sendDefaultPasswordEmail } = require('../utils/mailer');
const cfg = require('../config/sessionConfig');
const { statusSesiSiswa, statusSesiStaf, pesanTimeout } = require('../middlewares/sessionTimeout');

// Password default per role saat reset lewat "Lupa Password"
const DEFAULT_PASSWORD_BY_ROLE = {
    admin: 'Admin123',
    operator: 'Panitia123',
    kepsek: 'Kepsek123'
};

const ALASAN_TIMEOUT_VALID = ['idle', 'absolut'];

// ====== LOGIN SISWA (dipanggil kalau username tidak ada di tabel users) ======
async function prosesLoginSiswa(req, res, usernameInput, password) {
    const nisn = String(usernameInput || '').trim();
    const akun = await akunSiswaModel.findForLogin(nisn);

    if (!akun) {
        // pesan sama seperti login staf yang sudah ada
        return res.render('login', { error: 'Username tidak ditemukan.' });
    }

    const passwordCocok = await bcrypt.compare(password, akun.password);

    // status 401 dipakai oleh pembatas percobaan login (loginLimiter)
    if (!passwordCocok) {
        // Diagnosis saja (password TIDAK dicatat): membantu melihat apakah input
        // salah ketik, ada spasi ikut ter-copy, atau terisi otomatis oleh browser.
        const teksPassword = String(password || '');
        console.warn(
            `[LOGIN SISWA] Password salah untuk NISN ${nisn}. ` +
            `Panjang input: ${teksPassword.length}, ` +
            `ada spasi di awal/akhir: ${teksPassword !== teksPassword.trim()}`
        );

        return res.status(401).render('login', { error: 'Password salah.' });
    }

    if (akun.status_akun !== 'aktif') {
        return res.status(401).render('login', {
            error: 'Akun Anda sudah dinonaktifkan. Silakan hubungi operator sekolah.'
        });
    }

    // siswa dan staf memakai session key yang berbeda
    delete req.session.user;

    const sekarang = Date.now();
    req.session.siswa = {
        id_akun_siswa: akun.id_akun_siswa,
        id_siswa: akun.id_siswa,
        id_periode: akun.id_periode,
        nama: akun.nama,
        nisn: akun.nisn,
        // loginAt   : waktu login, dipakai untuk absolute timeout (tidak pernah diperbarui)
        // lastActivity: aktivitas terakhir, dipakai untuk idle timeout (diperbarui tiap request)
        loginAt: sekarang,
        lastActivity: sekarang
    };

    await akunSiswaModel.updateLastLogin(akun.id_akun_siswa);

    res.redirect('/siswa');
}

// Tentukan tipe sesi untuk pesan timeout ('staf' atau 'siswa')
function tentukanTipe(nilai) {
    return nilai === 'staf' ? 'staf' : 'siswa';
}

const authController = {
    showLoginPage(req, res) {
        // Sesi yang sudah melewati batas (idle atau absolute) dianggap tidak ada,
        // supaya tidak dilempar ke dashboard lalu bolak-balik.
        let alasan = null;
        let tipe = 'siswa';

        if (req.session.siswa) {
            const status = statusSesiSiswa(req.session.siswa);
            if (status) {
                delete req.session.siswa;
                alasan = status;
                tipe = 'siswa';
            }
        }

        if (req.session.user) {
            const status = statusSesiStaf(req.session.user);
            if (status) {
                delete req.session.user;
                alasan = status;
                tipe = 'staf';
            }
        }

        // kalau sudah login, langsung lempar ke dashboard, gak perlu login lagi
        if (req.session.user) {
            return res.redirect('/dashboard');
        }
        if (req.session.siswa) {
            return res.redirect('/siswa');
        }

        // Datang dari redirect timeout (?timeout=idle atau ?timeout=absolut, opsional &tipe=staf)
        if (!alasan && ALASAN_TIMEOUT_VALID.indexOf(req.query.timeout) !== -1) {
            alasan = req.query.timeout;
            tipe = tentukanTipe(req.query.tipe);
        }

        // Halaman login tidak boleh disimpan di cache browser.
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.render('login', { error: alasan ? pesanTimeout(alasan, tipe) : null });
    },
    async processLogin(req, res) {
        const { username, password } = req.body;

        try {
            const user = await userModel.findByUsername(username);

            if (!user) {
                // bukan staf -> coba sebagai siswa (username = NISN)
                return await prosesLoginSiswa(req, res, username, password);
            }

            const passwordCocok = await bcrypt.compare(password, user.password);

            if (!passwordCocok) {
                return res.render('login', { error: 'Password salah.' });
            }

            const isFirstLogin = user.last_login === null;

            delete req.session.siswa;

            const sekarang = Date.now();
            req.session.user = {
                id_user: user.id_user,
                nama: user.nama,
                username: user.username,
                role: user.role,
                foto_profil: user.foto_profil || null,
                isFirstLogin: isFirstLogin,
                wajibGantiPassword: !!user.wajib_ganti_password,
                // loginAt   : waktu login, dipakai untuk absolute timeout (tidak pernah diperbarui)
                // lastActivity: aktivitas terakhir, dipakai untuk idle timeout (diperbarui tiap request)
                loginAt: sekarang,
                lastActivity: sekarang
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
        // ?alasan=idle atau ?alasan=absolut dikirim oleh script timeout di browser
        const alasan = ALASAN_TIMEOUT_VALID.indexOf(req.query.alasan) !== -1 ? req.query.alasan : null;

        // Tipe diambil dari sesi yang sedang aktif SEBELUM sesi dihancurkan
        let tipe = 'siswa';
        if (req.session.user) {
            tipe = 'staf';
        } else if (!req.session.siswa) {
            tipe = tentukanTipe(req.query.tipe);
        }

        req.session.destroy(() => {
            res.clearCookie(cfg.SESSION_COOKIE_NAME);
            res.redirect(alasan ? '/login?timeout=' + alasan + (tipe === 'staf' ? '&tipe=staf' : '') : '/login');
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