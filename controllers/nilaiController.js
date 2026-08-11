const nilaiModel = require('../models/nilaiModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');
const { generateTemplateNilai } = require('../utils/templateGenerator');
const kriteriaModel = require('../models/kriteriaModel');
const xlsx = require('xlsx');
const fs = require('fs');
const { cekTerkunci } = require('../utils/lockHelper');
const { isPeriodeSudahMulai, pesanBelumMulai } = require('../utils/periodeHelper');
const waspasModel = require('../models/waspasModel');

const nilaiController = {
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode || !isPeriodeSudahMulai(periode)) {
                return res.render('admin/nilai', {
                    user: req.session.user, siswaList: [], terkunci: false, activePage: 'nilai',
                    pageTitle: 'Input Nilai Siswa',
                    error: !periode ? 'Belum ada periode seleksi aktif.' : pesanBelumMulai(periode),
                    success: null
                });
            }
            const siswaList = await nilaiModel.getSiswaWithNilaiStatus(periode.id_periode);
            const terkunci = await cekTerkunci(periode.id_periode);
            res.render('admin/nilai', {
                user: req.session.user, siswaList, terkunci, activePage: 'nilai',
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
            const terkunci = await cekTerkunci(periode.id_periode);
            res.render('admin/nilai-form', {
                user: req.session.user, siswa, kriteriaList, terkunci, activePage: 'nilai',
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
            const periode = await periodeModel.getActivePeriode();
            if (periode && await cekTerkunci(periode.id_periode)) {
                return res.redirect(`/admin/nilai/${id_siswa}?error=` + encodeURIComponent('Nilai ini terkunci karena status siswa telah final.'));
            }
            if (periode) {
                const bobotTersedia = await waspasModel.checkBobotTersedia(periode.id_periode);
                if (!bobotTersedia) {
                    return res.redirect(`/admin/nilai/${id_siswa}?error=` + encodeURIComponent('Belum bisa menginput nilai. Hitung bobot kriteria (FUCOM) terlebih dahulu di menu Pembobotan Kriteria.'));
                }
            }
            const { id_kriteria, nilai_mentah } = req.body;
            const idKriteriaArr = Array.isArray(id_kriteria) ? id_kriteria : [id_kriteria];
            const nilaiArr = Array.isArray(nilai_mentah) ? nilai_mentah : [nilai_mentah];
            for (let i = 0; i < idKriteriaArr.length; i++) {
                const nilai = nilaiArr[i] === '' ? null : nilaiArr[i];
                await nilaiModel.upsertNilai(id_siswa, idKriteriaArr[i], nilai);
            }
            const siswa = await nilaiModel.getSiswaById(id_siswa);
            await userModel.logActivity(req.session.user.id_user, `Menginput/memperbarui nilai siswa: ${siswa.nama}`);
            if (periode) await waspasModel.invalidateHasilJikaAda(periode.id_periode);
            res.redirect(`/admin/nilai?success=${encodeURIComponent('Nilai siswa ' + siswa.nama + ' berhasil disimpan.')}`);
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
            if (!periode || !isPeriodeSudahMulai(periode)) {
                return res.status(400).send(!periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode));
            }
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
            if (!periode || !isPeriodeSudahMulai(periode)) {
                fs.unlinkSync(req.file.path);
                return res.redirect('/admin/nilai?error=' + encodeURIComponent(!periode ? 'Periode seleksi belum aktif.' : pesanBelumMulai(periode)));
            }

            if (await cekTerkunci(periode.id_periode)) {
                fs.unlinkSync(req.file.path);
                return res.redirect('/admin/nilai?error=' + encodeURIComponent('Nilai terkunci karena status siswa telah final.'));
            }

            const bobotTersedia = await waspasModel.checkBobotTersedia(periode.id_periode);
            if (!bobotTersedia) {
                fs.unlinkSync(req.file.path);
                return res.redirect('/admin/nilai?error=' + encodeURIComponent('Belum bisa mengimpor nilai. Hitung bobot kriteria (FUCOM) terlebih dahulu.'));
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
            const nilaiTidakValid = [];

            for (const row of jsonData) {
                const nisn = String(row['NISN'] || '').trim();
                if (!nisn) continue;

                const siswa = await nilaiModel.getSiswaByNisn(nisn, periode.id_periode);
                if (!siswa) {
                    nisnTidakDitemukan.push(nisn);
                    continue;
                }

                Object.keys(kriteriaMap).forEach(namaKriteria => {
                    if (row[namaKriteria] === undefined || row[namaKriteria] === '') return;

                    const rawVal = row[namaKriteria];
                    const namaLower = namaKriteria.toLowerCase();
                    const isSkor100 = namaLower.indexOf('akademik') !== -1 || namaLower.indexOf('psikotes') !== -1;
                    const minVal = isSkor100 ? 10 : 1;
                    const maxVal = isSkor100 ? 100 : 5;

                    // Validasi ketat: HARUS berupa angka murni (bukan string huruf, bukan campuran)
                    const nilaiNumerik = Number(rawVal);
                    const isNumberValid = typeof rawVal === 'number' || (typeof rawVal === 'string' && /^-?\d*\.?\d+$/.test(rawVal.trim()));

                    let alasanGagal = null;

                    if (!isNumberValid || isNaN(nilaiNumerik)) {
                        alasanGagal = 'nilai bukan angka';
                    } else if (nilaiNumerik < minVal || nilaiNumerik > maxVal) {
                        alasanGagal = `nilai di luar skala (harus ${minVal}-${maxVal})`;
                    } else if (!isSkor100 && !Number.isInteger(nilaiNumerik)) {
                        alasanGagal = 'skala 1-5 harus bilangan bulat, tanpa desimal';
                    }

                    if (alasanGagal) {
                        nilaiTidakValid.push(`NISN ${nisn} - ${namaKriteria}: ${alasanGagal} (nilai diinput: "${rawVal}")`);
                        return; // baris kriteria ini dilewati, tidak disimpan
                    }

                    dataToSave.push({
                        id_siswa: siswa.id_siswa,
                        nisn: nisn,
                        id_kriteria: kriteriaMap[namaKriteria],
                        nilai_mentah: nilaiNumerik
                    });
                });
            }

            if (dataToSave.length === 0) {
                let pesanGagalTotal = 'Tidak ada data nilai valid yang bisa disimpan.';
                if (nilaiTidakValid.length > 0) {
                    pesanGagalTotal += ' Detail kegagalan: ' + nilaiTidakValid.slice(0, 5).join('; ');
                    if (nilaiTidakValid.length > 5) pesanGagalTotal += ` (dan ${nilaiTidakValid.length - 5} lainnya)`;
                }
                return res.redirect('/admin/nilai?error=' + encodeURIComponent(pesanGagalTotal));
            }

            const hasil = await nilaiModel.bulkUpsertNilai(dataToSave);
            await userModel.logActivity(req.session.user.id_user, `Mengimpor nilai siswa dari Excel (${hasil.berhasil} data berhasil)`);
            await waspasModel.invalidateHasilJikaAda(periode.id_periode);

            let pesan = `Import nilai selesai: ${hasil.berhasil} data berhasil disimpan.`;
            if (nisnTidakDitemukan.length > 0) {
                pesan += ` ${nisnTidakDitemukan.length} NISN tidak ditemukan di sistem (dilewati).`;
            }
            if (nilaiTidakValid.length > 0) {
                pesan += ` ${nilaiTidakValid.length} nilai gagal disimpan karena tidak valid (skala/format salah).`;
            }

            res.redirect(`/admin/nilai?success=${encodeURIComponent(pesan)}`);
        } catch (error) {
            console.error(error);
            if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.redirect('/admin/nilai?error=Gagal membaca file Excel. Pastikan format sesuai template.');
        }
    },
};

module.exports = nilaiController;