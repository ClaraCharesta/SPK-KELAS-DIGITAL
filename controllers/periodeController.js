const periodeModel = require('../models/periodeModel');
const kriteriaModel = require('../models/kriteriaModel');
const userModel = require('../models/userModel');
const waspasModel = require('../models/waspasModel');

function computeDisplayStatus(p) {
    if (p.status_periode !== 'aktif') {
        return { label: 'Ditutup', badgeClass: 'badge-red' };
    }
    if (p.tanggal_mulai) {
        const tglMulai = new Date(p.tanggal_mulai);
        const tglMulaiStr = tglMulai.toISOString().split('T')[0];
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (tglMulaiStr > todayStr) {
            return { label: 'Belum Aktif', badgeClass: 'badge-yellow' };
        }
    }
    return { label: 'Aktif', badgeClass: 'badge-green' };
}

const periodeController = {
    async index(req, res) {
        try {
            const periodeListRaw = await periodeModel.getAll();
            const periodeList = await Promise.all(periodeListRaw.map(async p => ({
                ...p,
                display_status: computeDisplayStatus(p),
                bobot_final: await kriteriaModel.checkBobotSudahFinal(p.id_periode)
            })));
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
            if (parseInt(kuota_kelas_digital) < 30) {
                return res.redirect('/superadmin/periode?error=Kuota minimal 30 siswa.');
            }

            const sudahAda = await periodeModel.existsByTahunAjaran(tahun_ajaran);
            if (sudahAda) {
                return res.redirect(`/superadmin/periode?error=Tahun ajaran "${tahun_ajaran}" sudah pernah dibuat sebelumnya. Gunakan nama lain, atau edit periode yang sudah ada.`);
            }

            const id_periode_baru = await periodeModel.create({ tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai });

            await kriteriaModel.createDefault(id_periode_baru);
            await userModel.logActivity(req.session.user.id_user, `Super Admin membuka periode seleksi baru: ${tahun_ajaran}`);

            // Periode lama otomatis ditutup, jadi akun siswanya ikut dinonaktifkan.
            const dinonaktifkan = await periodeModel.nonaktifkanAkunPeriodeDitutup();
            if (dinonaktifkan > 0) {
                await userModel.logActivity(
                    req.session.user.id_user,
                    `Sistem menonaktifkan ${dinonaktifkan} akun siswa dari periode yang ditutup`
                );
            }

            res.redirect('/superadmin/periode?success=Periode seleksi berhasil dibuat dan diaktifkan beserta 6 kriteria default.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=Terjadi kesalahan sistem.');
        }
    },

    async updateKuota(req, res) {
        try {
            const { id_periode, kuota_kelas_digital } = req.body;

            if (parseInt(kuota_kelas_digital) < 30) {
                return res.redirect('/superadmin/periode?error=Kuota minimal 30 siswa.');
            }

            // Status Masuk/Tidak Masuk dihitung dari ranking dan kuota,
            // jadi kuota tidak boleh diubah setelah hasil difinalisasi.
            if (await waspasModel.isFinal(id_periode)) {
                return res.redirect('/superadmin/periode?error=Kuota tidak dapat diubah karena hasil seleksi sudah difinalisasi.');
            }

            await periodeModel.updateKuota(id_periode, kuota_kelas_digital);

            // Perubahan kuota membuat hasil ranking lama tidak valid.
            await waspasModel.invalidateHasilJikaAda(id_periode);

            await userModel.logActivity(req.session.user.id_user, `Super Admin mengubah kuota periode ID ${id_periode} menjadi ${kuota_kelas_digital}`);
            res.redirect('/superadmin/periode?success=Kuota berhasil diperbarui. Hasil ranking sebelumnya dikosongkan, silakan hitung ulang WASPAS.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=Terjadi kesalahan sistem.');
        }
    },

    async setActive(req, res) {
        try {
            const { id_periode } = req.params;
            await periodeModel.setActive(id_periode);

            // Periode lain ditutup (akunnya dinonaktifkan), periode ini dibuka kembali (akunnya diaktifkan).
            const dinonaktifkan = await periodeModel.nonaktifkanAkunPeriodeDitutup();
            const diaktifkan = await periodeModel.aktifkanKembaliAkunPeriode(id_periode);

            await userModel.logActivity(
                req.session.user.id_user,
                `Super Admin mengaktifkan periode ID ${id_periode} (${diaktifkan} akun siswa diaktifkan, ${dinonaktifkan} akun periode lain dinonaktifkan)`
            );
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

            const statusPenyelesaian = await periodeModel.getStatusPenyelesaian(id_periode);
            if (statusPenyelesaian === 'selesai') {
                return res.redirect('/superadmin/periode?error=Periode ini tidak dapat diedit karena hasil seleksinya sudah difinalisasi.');
            }

            if (await kriteriaModel.checkBobotSudahFinal(id_periode)) {
                return res.redirect('/superadmin/periode?error=Periode ini tidak dapat diedit karena pembobotan FUCOM sudah dijalankan dan final.');
            }

            if (parseInt(kuota_kelas_digital) < 30) {
                return res.redirect('/superadmin/periode?error=Kuota minimal 30 siswa.');
            }

            const sudahAda = await periodeModel.existsByTahunAjaran(tahun_ajaran, id_periode);
            if (sudahAda) {
                return res.redirect(`/superadmin/periode?error=Tahun ajaran "${tahun_ajaran}" sudah dipakai periode lain.`);
            }

            await periodeModel.update(id_periode, { tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai });

            // Kuota bisa ikut berubah, jadi hasil ranking lama dikosongkan.
            await waspasModel.invalidateHasilJikaAda(id_periode);

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
                return res.redirect('/superadmin/periode?error=Periode ini tidak dapat dihapus karena sudah difinalisasi dan tersimpan sebagai data historis.');
            }

            if (await kriteriaModel.checkBobotSudahFinal(id_periode)) {
                return res.redirect('/superadmin/periode?error=Periode ini tidak dapat dihapus karena pembobotan FUCOM sudah dijalankan dan final.');
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

            // Periode ditutup, akun siswanya ikut dinonaktifkan.
            const dinonaktifkan = await periodeModel.nonaktifkanAkunPeriodeDitutup();

            await userModel.logActivity(
                req.session.user.id_user,
                `Super Admin menutup periode ID ${id_periode} secara manual (${dinonaktifkan} akun siswa dinonaktifkan)`
            );
            res.redirect('/superadmin/periode?success=Periode berhasil ditutup. Akun siswa pada periode ini dinonaktifkan.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=Terjadi kesalahan sistem.');
        }
    }
};

module.exports = periodeController;