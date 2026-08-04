const nilaiModel = require('../models/nilaiModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');
const { generateTemplateNilai } = require('../utils/templateGenerator');
const kriteriaModel = require('../models/kriteriaModel');
const xlsx = require('xlsx');
const fs = require('fs');


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
            const { id_kriteria, nilai_mentah } = req.body;

            const idKriteriaArr = Array.isArray(id_kriteria) ? id_kriteria : [id_kriteria];
            const nilaiArr = Array.isArray(nilai_mentah) ? nilai_mentah : [nilai_mentah];

            for (let i = 0; i < idKriteriaArr.length; i++) {
                const nilai = nilaiArr[i] === '' ? null : nilaiArr[i];
                await nilaiModel.upsertNilai(id_siswa, idKriteriaArr[i], nilai);
            }

            const siswa = await nilaiModel.getSiswaById(id_siswa);
            await userModel.logActivity(req.session.user.id_user, `Menginput/memperbarui nilai siswa: ${siswa.nama}`);

            res.redirect(`/admin/nilai/${id_siswa}?success=Nilai berhasil disimpan.`);
        } catch (error) {
            console.error(error);
            res.redirect(`/admin/nilai/${req.params.id_siswa}?error=Terjadi kesalahan sistem.`);
        }
    },

    async getSiswaWithAllNilai(id_periode) {
        const siswaList = await nilaiModel.getSiswaWithNilaiStatus(id_periode);
        const result = [];

        for (const s of siswaList) {
            const [nilaiRows] = await db.query(
                'SELECT id_kriteria, nilai_mentah FROM nilai_siswa WHERE id_siswa = ?', [s.id_siswa]
            );
            const nilai = {};
            nilaiRows.forEach(n => { nilai[n.id_kriteria] = n.nilai_mentah; });
            result.push({ ...s, nilai });
        }

        return result;
    },

    async downloadTemplate(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) return res.status(400).send('Periode seleksi belum aktif.');

            const siswaList = await nilaiModel.getSiswaWithAllNilai(periode.id_periode);
            const kriteriaList = await kriteriaModel.getAll(periode.id_periode);

            if (kriteriaList.length === 0) {
                return res.status(400).send('Belum ada kriteria terdaftar. Hubungi Super Admin.');
            }

            await generateTemplateNilai(res, siswaList, kriteriaList);
        } catch (error) {
            console.error('ERROR DOWNLOAD TEMPLATE NILAI:', error);
            res.status(500).send('Gagal membuat template: ' + error.message);
        }
    },

    async importNilai(req, res) {
        try {
            if (!req.file) return res.redirect('/admin/nilai?error=Silakan pilih file Excel terlebih dahulu.');

            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                fs.unlinkSync(req.file.path);
                return res.redirect('/admin/nilai?error=Periode seleksi belum aktif.');
            }

            const kriteriaList = await kriteriaModel.getAll(periode.id_periode);
            const kriteriaMap = {};
            kriteriaList.forEach(k => { kriteriaMap[k.nama_kriteria] = k.id_kriteria; });

            const workbook = xlsx.readFile(req.file.path);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = xlsx.utils.sheet_to_json(sheet);

            fs.unlinkSync(req.file.path);

            const dataToSave = [];
            const nisnTidakDitemukan = [];

            for (const row of jsonData) {
                const nisn = String(row['NISN'] || '').trim();
                if (!nisn) continue;

                const siswa = await nilaiModel.getSiswaByNisn(nisn, periode.id_periode);
                if (!siswa) {
                    nisnTidakDitemukan.push(nisn);
                    continue;
                }

                // Cocokkan tiap kolom kriteria berdasarkan nama header
                Object.keys(kriteriaMap).forEach(namaKriteria => {
                    if (row[namaKriteria] !== undefined && row[namaKriteria] !== '') {
                        dataToSave.push({
                            id_siswa: siswa.id_siswa,
                            nisn: nisn,
                            id_kriteria: kriteriaMap[namaKriteria],
                            nilai_mentah: row[namaKriteria]
                        });
                    }
                });
            }

            if (dataToSave.length === 0) {
                return res.redirect('/admin/nilai?error=Tidak ada data nilai valid ditemukan. Pastikan NISN dan nama kolom kriteria sesuai template.');
            }

            const hasil = await nilaiModel.bulkUpsertNilai(dataToSave);
            await userModel.logActivity(req.session.user.id_user, `Mengimpor nilai siswa dari Excel (${hasil.berhasil} data berhasil)`);

            let pesan = `Import nilai selesai: ${hasil.berhasil} data berhasil disimpan.`;
            if (nisnTidakDitemukan.length > 0) {
                pesan += ` ${nisnTidakDitemukan.length} NISN tidak ditemukan di sistem (dilewati).`;
            }

            res.redirect(`/admin/nilai?success=${encodeURIComponent(pesan)}`);
        } catch (error) {
            console.error(error);
            if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.redirect('/admin/nilai?error=Gagal membaca file Excel. Pastikan format sesuai template.');
        }
    }
};

module.exports = nilaiController;