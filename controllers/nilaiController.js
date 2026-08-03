const nilaiModel = require('../models/nilaiModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');

const nilaiController = {
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                return res.render('admin/nilai', {
                    user: req.session.user, siswaList: [], activePage: 'nilai',
                    pageTitle: 'Input Nilai Siswa', error: 'Belum ada periode seleksi aktif.', success: null
                });
            }

            const siswaList = await nilaiModel.getSiswaWithNilaiStatus(periode.id_periode);
            res.render('admin/nilai', {
                user: req.session.user, siswaList, activePage: 'nilai',
                pageTitle: 'Input Nilai Siswa',
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data.');
        }
    },

    async showForm(req, res) {
        try {
            const { id_siswa } = req.params;
            const periode = await periodeModel.getActivePeriode();
            const siswa = await nilaiModel.getSiswaById(id_siswa);

            if (!siswa) return res.redirect('/admin/nilai?error=Siswa tidak ditemukan.');

            const kriteriaList = await nilaiModel.getKriteriaWithNilai(id_siswa, periode.id_periode);

            res.render('admin/nilai-form', {
                user: req.session.user, siswa, kriteriaList, activePage: 'nilai',
                pageTitle: 'Input Nilai: ' + siswa.nama,
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data.');
        }
    },

    async saveNilai(req, res) {
        try {
            const { id_siswa } = req.params;
            const { id_kriteria, nilai_mentah, sumber_data } = req.body;

            // id_kriteria, nilai_mentah, sumber_data ini array (karena banyak kriteria sekaligus)
            const idKriteriaArr = Array.isArray(id_kriteria) ? id_kriteria : [id_kriteria];
            const nilaiArr = Array.isArray(nilai_mentah) ? nilai_mentah : [nilai_mentah];
            const sumberArr = Array.isArray(sumber_data) ? sumber_data : [sumber_data];

            for (let i = 0; i < idKriteriaArr.length; i++) {
                const nilai = nilaiArr[i] === '' ? null : nilaiArr[i];
                await nilaiModel.upsertNilai(id_siswa, idKriteriaArr[i], nilai, sumberArr[i]);
            }

            const siswa = await nilaiModel.getSiswaById(id_siswa);
            await userModel.logActivity(req.session.user.id_user, `Menginput/memperbarui nilai siswa: ${siswa.nama}`);

            res.redirect(`/admin/nilai/${id_siswa}?success=Nilai berhasil disimpan.`);
        } catch (error) {
            console.error(error);
            res.redirect(`/admin/nilai/${req.params.id_siswa}?error=Terjadi kesalahan sistem.`);
        }
    }
};

module.exports = nilaiController;