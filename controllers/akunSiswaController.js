const akunSiswaService = require('../utils/akunSiswaService');
const akunSiswaModel = require('../models/akunSiswaModel');
const periodeModel = require('../models/periodeModel');
const waspasModel = require('../models/waspasModel');
const userModel = require('../models/userModel');
const { isPeriodeSudahMulai, pesanBelumMulai } = require('../utils/periodeHelper');

const PESAN_KARTU_TERKUNCI =
    'Hasil seleksi sudah difinalisasi. Kartu akun siswa tidak dapat dicetak atau diunduh lagi.';

function setFlashError(req, pesan) {
    req.session.akunSiswaFlash = { tipe: 'error', pesan };
}

function urlLogin(req) {
    return `${req.protocol}://${req.get('host')}/login`;
}

const akunSiswaController = {

    // POST /akun-siswa/generate
    async generate(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode || !isPeriodeSudahMulai(periode)) {
                setFlashError(req, !periode ? 'Belum ada periode seleksi aktif.' : pesanBelumMulai(periode));
                return res.redirect('/operator/siswa');
            }

            const hasil = await akunSiswaService.generateAkunUntukPeriode(
                periode.id_periode,
                req.session.user
            );

            req.session.akunSiswaFlash = akunSiswaService.buatFlash(hasil);
            return res.redirect('/operator/siswa');
        } catch (error) {
            console.error('ERROR GENERATE AKUN SISWA:', error);
            setFlashError(req, error.message || 'Terjadi kesalahan saat membuat akun siswa.');
            return res.redirect('/operator/siswa');
        }
    },

    // POST /akun-siswa/:id_siswa/reset-password
    // Setelah reset, langsung tampil kartu dengan password baru.
    // Ditolak setelah finalisasi (dicek di service).
    async resetPassword(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode) {
                setFlashError(req, 'Belum ada periode seleksi aktif.');
                return res.redirect('/operator/siswa');
            }

            const hasil = await akunSiswaService.resetPasswordSiswa(
                req.params.id_siswa,
                req.session.user
            );

            if (!hasil) {
                setFlashError(req, 'Akun siswa tidak ditemukan.');
                return res.redirect('/operator/siswa');
            }

            if (hasil.error) {
                setFlashError(req, hasil.error);
                return res.redirect('/operator/siswa');
            }

            const kartu = await akunSiswaModel.getDataKartu(req.params.id_siswa);

            return res.render('operator/kartu-akun', {
                pageTitle: 'Kartu Akun Siswa',
                periode,
                urlLogin: urlLogin(req),
                kartuList: [kartu],
                judul: 'Password baru berhasil dibuat'
            });
        } catch (error) {
            console.error('ERROR RESET PASSWORD SISWA:', error);
            setFlashError(req, 'Terjadi kesalahan saat mereset password.');
            return res.redirect('/operator/siswa');
        }
    },

    // GET /akun-siswa/kartu : semua kartu pada periode aktif
    async kartuSemua(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode) {
                setFlashError(req, 'Belum ada periode seleksi aktif.');
                return res.redirect('/operator/siswa');
            }

            if (await waspasModel.isFinal(periode.id_periode)) {
                setFlashError(req, PESAN_KARTU_TERKUNCI);
                return res.redirect('/operator/siswa');
            }

            const kartuList = await akunSiswaModel.getDataKartuSemua(periode.id_periode);

            await userModel.logActivity(
                req.session.user.id_user,
                `${req.session.user.nama} mencetak ${kartuList.length} kartu akun siswa`
            );

            return res.render('operator/kartu-akun', {
                pageTitle: 'Kartu Akun Siswa',
                periode,
                urlLogin: urlLogin(req),
                kartuList,
                judul: 'Kartu Akun Siswa'
            });
        } catch (error) {
            console.error('ERROR KARTU SEMUA:', error);
            return res.status(500).send('Gagal menampilkan kartu akun siswa.');
        }
    },

    // GET /akun-siswa/:id/kartu : kartu satu siswa
    async kartuSatu(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode) {
                setFlashError(req, 'Belum ada periode seleksi aktif.');
                return res.redirect('/operator/siswa');
            }

            if (await waspasModel.isFinal(periode.id_periode)) {
                setFlashError(req, PESAN_KARTU_TERKUNCI);
                return res.redirect('/operator/siswa');
            }

            const kartu = await akunSiswaModel.getDataKartu(req.params.id);

            if (!kartu || Number(kartu.id_periode) !== Number(periode.id_periode)) {
                return res.status(404).send('Akun siswa tidak ditemukan pada periode aktif.');
            }

            await userModel.logActivity(
                req.session.user.id_user,
                `${req.session.user.nama} mencetak kartu akun siswa: ${kartu.nama}`
            );

            return res.render('operator/kartu-akun', {
                pageTitle: 'Kartu Akun Siswa',
                periode,
                urlLogin: urlLogin(req),
                kartuList: [kartu],
                judul: 'Kartu Akun Siswa'
            });
        } catch (error) {
            console.error('ERROR KARTU SATU:', error);
            return res.status(500).send('Gagal menampilkan kartu akun siswa.');
        }
    }
};

module.exports = akunSiswaController;