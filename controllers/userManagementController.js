const userManagementModel = require('../models/userManagementModel');
const userModel = require('../models/userModel');

const REGEX_EMAIL = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;

// NIP standar = 18 digit angka. Ubah regex ini jika format NIP sekolah berbeda.
const REGEX_NIP = /^[0-9]{18}$/;

const BASE_URL = '/admin/akun-admin';

// Hapus semua spasi pada NIP (sering ikut ter-copy dari dokumen: "1985 0101 2010 01 1 001").
function rapikanNip(nilai) {
    return String(nilai === undefined || nilai === null ? '' : nilai).replace(/\s+/g, '').trim();
}

// Aturan NIP:
// - role kepsek  -> WAJIB
// - role lainnya -> opsional (kosong disimpan sebagai NULL)
// Jika diisi, harus 18 digit angka.
// Return { error } atau { nip } (nip = string atau null).
function validasiNip(role, nipMentah) {
    const nip = rapikanNip(nipMentah);

    if (role === 'kepsek' && !nip) {
        return { error: 'NIP wajib diisi untuk akun Kepala Sekolah.' };
    }

    if (nip && !REGEX_NIP.test(nip)) {
        return { error: 'NIP harus berupa 18 digit angka.' };
    }

    return { nip: nip || null };
}

// Pesan jika sudah ada Kepala Sekolah aktif (kepsek hanya boleh 1 yang aktif).
function pesanKepsekSudahAda(kepsekAktif) {
    return `Sudah ada Kepala Sekolah aktif: "${kepsekAktif.nama}" (username: ${kepsekAktif.username}). ` +
        'Kepala Sekolah hanya boleh 1 akun aktif. ' +
        'Hapus atau nonaktifkan akun Kepala Sekolah yang lama terlebih dahulu.';
}

const redirectError = (res, pesan) =>
    res.redirect(`${BASE_URL}?error=` + encodeURIComponent(pesan));

const userManagementController = {
    async index(req, res) {
        try {
            const users = await userManagementModel.getAllUsers();
            const kepsekAktif = await userManagementModel.getKepsekAktif();

            res.render('admin/akun-admin', {
                user: req.session.user,
                users,
                kepsekAktif: kepsekAktif || null,
                activePage: 'akun-admin',
                pageTitle: 'Kelola Akun Operator',
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
            const { nama, username, email, password, confirmPassword, role, nip } = req.body;

            if (!nama || !username || !email || !password || !confirmPassword || !role) {
                return res.redirect('/admin/akun-admin?error=Semua field wajib diisi, termasuk email dan konfirmasi password.');
            }

            if (password.length < 6) {
                return res.redirect('/admin/akun-admin?error=Password minimal 6 karakter.');
            }

            if (password !== confirmPassword) {
                return res.redirect('/admin/akun-admin?error=Konfirmasi password tidak cocok dengan password.');
            }

            const emailTrimmed = email.trim();

            if (!REGEX_EMAIL.test(emailTrimmed)) {
                return res.redirect('/admin/akun-admin?error=Email harus menggunakan domain @gmail.com.');
            }

            // NIP: wajib untuk kepsek, opsional untuk role lain.
            const hasilNip = validasiNip(role, nip);
            if (hasilNip.error) return redirectError(res, hasilNip.error);
            const nipBersih = hasilNip.nip;

            // Kepala Sekolah hanya boleh 1 yang aktif.
            // Dicek sebelum jalur reaktivasi, jadi akun kepsek lama yang diaktifkan kembali juga ikut dibatasi.
            if (role === 'kepsek') {
                const kepsekAktif = await userManagementModel.getKepsekAktif();
                if (kepsekAktif) {
                    return redirectError(res, pesanKepsekSudahAda(kepsekAktif));
                }
            }

            // Cek duplikasi hanya terhadap akun yang MASIH AKTIF
            const usernameExists = await userManagementModel.checkUsernameExists(username);
            if (usernameExists) {
                return res.redirect('/admin/akun-admin?error=Username sudah digunakan oleh akun aktif lain.');
            }

            const emailExists = await userManagementModel.checkEmailExists(emailTrimmed);
            if (emailExists) {
                return res.redirect('/admin/akun-admin?error=Email sudah digunakan oleh akun aktif lain.');
            }

            const nipExists = await userManagementModel.checkNipExists(nipBersih);
            if (nipExists) {
                return redirectError(res, 'NIP sudah digunakan oleh akun aktif lain.');
            }

            // Cek apakah username dan email ini dulu pernah dipakai akun yang SUDAH DIHAPUS (nonaktif).
            // Dicek TERPISAH (bukan digabung OR) supaya ketahuan kalau username cocok ke akun lama A
            // sementara email cocok ke akun lama B yang berbeda — dua akun lama tidak boleh digabung paksa.
            const inactiveByUsername = await userManagementModel.findInactiveByUsername(username);
            const inactiveByEmail = await userManagementModel.findInactiveByEmail(emailTrimmed);

            if (inactiveByUsername && inactiveByEmail && inactiveByUsername.id_user !== inactiveByEmail.id_user) {
                return res.redirect('/admin/akun-admin?error=' + encodeURIComponent(
                    `Tidak bisa disimpan: username "${username}" pernah dipakai akun lama "${inactiveByUsername.nama}", sedangkan email "${emailTrimmed}" pernah dipakai akun lama lain "${inactiveByEmail.nama}". Keduanya adalah akun berbeda dan tidak bisa digabung otomatis. Gunakan kombinasi username & email dari akun lama yang sama, atau ganti salah satunya dengan yang benar-benar baru.`
                ));
            }

            const inactiveUser = inactiveByUsername || inactiveByEmail;

            if (inactiveUser) {
                try {
                    await userManagementModel.reactivateUser(
                        inactiveUser.id_user,
                        nama,
                        username,
                        emailTrimmed,
                        password,
                        role,
                        nipBersih
                    );
                } catch (dupErr) {
                    return res.redirect('/admin/akun-admin?error=' + encodeURIComponent(dupErr.message));
                }
                await userModel.logActivity(
                    req.session.user.id_user,
                    `Admin mengaktifkan kembali akun lama: ${nama} (${role})`
                );
                return res.redirect('/admin/akun-admin?success=Akun lama ditemukan dan berhasil diaktifkan kembali dengan data baru.');
            }

            // Kalau tidak ada akun lama yang cocok, baru buat akun benar-benar baru
            await userManagementModel.createUser(nama, username, emailTrimmed, password, role, nipBersih);
            await userModel.logActivity(req.session.user.id_user, `Admin menambahkan akun baru: ${nama} (${role})`);

            res.redirect('/admin/akun-admin?success=Akun berhasil ditambahkan.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/akun-admin?error=Terjadi kesalahan sistem.');
        }
    },

    async update(req, res) {
        try {
            const { id_user, nama, username, email, password, confirmPassword, role, nip } = req.body;

            if (!nama || !username || !email || !role) {
                return res.redirect('/admin/akun-admin?error=Semua field wajib diisi, termasuk email.');
            }

            if (!REGEX_EMAIL.test(email.trim())) {
                return res.redirect('/admin/akun-admin?error=Email harus menggunakan domain @gmail.com.');
            }

            // NIP: wajib untuk kepsek, opsional untuk role lain.
            const hasilNip = validasiNip(role, nip);
            if (hasilNip.error) return redirectError(res, hasilNip.error);
            const nipBersih = hasilNip.nip;

            // Kepala Sekolah hanya boleh 1 yang aktif.
            // Hanya dicek jika akun ini BARU menjadi kepsek (sebelumnya bukan kepsek aktif).
            // Mengedit akun yang memang sudah kepsek aktif tidak diblokir.
            if (role === 'kepsek') {
                const akunSekarang = await userManagementModel.getUserById(id_user);
                const sudahKepsekAktif = akunSekarang && akunSekarang.role === 'kepsek' && Boolean(akunSekarang.status_aktif);

                if (!sudahKepsekAktif) {
                    const kepsekLain = await userManagementModel.getKepsekAktif(id_user);
                    if (kepsekLain) {
                        return redirectError(res, pesanKepsekSudahAda(kepsekLain));
                    }
                }
            }

            // Password di form edit sifatnya OPSIONAL: kosong berarti password tidak diubah.
            const inginGantiPassword = (password && password.trim() !== '') || (confirmPassword && confirmPassword.trim() !== '');
            if (inginGantiPassword) {
                if (!password || password.length < 6) {
                    return res.redirect('/admin/akun-admin?error=Password baru minimal 6 karakter.');
                }
                if (password !== confirmPassword) {
                    return res.redirect('/admin/akun-admin?error=Konfirmasi password baru tidak cocok.');
                }
            }

            const emailExists = await userManagementModel.checkEmailExists(email.trim(), id_user);
            if (emailExists) {
                return res.redirect('/admin/akun-admin?error=Email sudah digunakan oleh akun lain.');
            }

            const nipExists = await userManagementModel.checkNipExists(nipBersih, id_user);
            if (nipExists) {
                return redirectError(res, 'NIP sudah digunakan oleh akun aktif lain.');
            }

            await userManagementModel.updateUser(id_user, nama, username, email.trim(), role, nipBersih);

            if (inginGantiPassword) {
                await userManagementModel.updatePassword(id_user, password);
                // Password baru ini diketahui Admin, jadi user tetap wajib ganti sendiri saat login berikutnya
                await userModel.setWajibGantiPassword(id_user, true);
            }

            await userModel.logActivity(
                req.session.user.id_user,
                `Admin memperbarui akun: ${nama}${inginGantiPassword ? ' (termasuk mengubah password)' : ''}`
            );
            res.redirect('/admin/akun-admin?success=Akun berhasil diperbarui.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/akun-admin?error=Terjadi kesalahan sistem.');
        }
    },

    async resetPassword(req, res) {
        try {
            const { id_user, newPassword } = req.body;
            await userManagementModel.updatePassword(id_user, newPassword);
            // Password ini juga password "sementara" yang Admin tahu — jadi user tetap wajib ganti sendiri saat login berikutnya
            await userModel.setWajibGantiPassword(id_user, true);
            const targetUser = await userManagementModel.getUserById(id_user);
            await userModel.logActivity(req.session.user.id_user, `Admin mereset password akun: ${targetUser.nama}`);
            res.redirect('/admin/akun-admin?success=Password berhasil direset.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/akun-admin?error=Terjadi kesalahan sistem.');
        }
    },

    async toggleStatus(req, res) {
        try {
            const { id_user } = req.params;
            const targetUser = await userManagementModel.getUserById(id_user);

            if (!targetUser) {
                return redirectError(res, 'Akun tidak ditemukan.');
            }

            // Mengaktifkan kembali akun kepsek yang nonaktif: tolak jika sudah ada kepsek aktif lain.
            if (targetUser.role === 'kepsek' && !targetUser.status_aktif) {
                const kepsekLain = await userManagementModel.getKepsekAktif(id_user);
                if (kepsekLain) {
                    return redirectError(res, pesanKepsekSudahAda(kepsekLain));
                }
            }

            await userManagementModel.toggleStatus(id_user);
            await userModel.logActivity(req.session.user.id_user, `Admin mengubah status akun: ${targetUser.nama}`);
            res.redirect('/admin/akun-admin?success=Status akun berhasil diubah.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/akun-admin?error=Terjadi kesalahan sistem.');
        }
    },

    async delete(req, res) {
        try {
            const { id_user } = req.params;
            const targetUser = await userManagementModel.getUserById(id_user);
            await userManagementModel.deleteUser(id_user);
            await userModel.logActivity(req.session.user.id_user, `Admin menghapus akun: ${targetUser.nama}`);
            res.redirect('/admin/akun-admin?success=Akun berhasil dihapus.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/akun-admin?error=Terjadi kesalahan sistem.');
        }
    }
};

module.exports = userManagementController;