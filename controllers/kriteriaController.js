const kriteriaModel = require('../models/kriteriaModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');

const kriteriaController = {
    // Untuk Super Admin — full CRUD
        async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                return res.render('superadmin/kriteria', {
                    user: req.session.user, kriteriaList: [], terkunci: false, activePage: 'kriteria',
                    pageTitle: 'Kelola Kriteria', success: null, error: 'Belum ada periode seleksi aktif.'
                });
            }

            const kriteriaList = await kriteriaModel.getAll(periode.id_periode);
            const terkunci = await kriteriaModel.checkPerankinganDimulai(periode.id_periode);

            res.render('superadmin/kriteria', {
                user: req.session.user, kriteriaList, terkunci, activePage: 'kriteria',
                pageTitle: 'Kelola Kriteria',
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data kriteria.');
        }
    },

    // Untuk Admin — read-only, cuma buat lihat referensi
    async indexReadOnly(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();

            if (!periode) {
                return res.render('admin/kriteria', {
                    user: req.session.user, kriteriaList: [], activePage: 'kriteria',
                    pageTitle: 'Kriteria Penilaian', error: 'Belum ada periode seleksi aktif.', success: null
                });
            }

            const kriteriaList = await kriteriaModel.getAll(periode.id_periode);
            res.render('admin/kriteria', {
                user: req.session.user, kriteriaList, activePage: 'kriteria',
                pageTitle: 'Kriteria Penilaian', error: null, success: null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data kriteria.');
        }
    },

    async create(req, res) {
        try {

            
            const periode = await periodeModel.getActivePeriode();
            if (!periode) return res.redirect('/superadmin/kriteria?error=Periode seleksi belum aktif.');

            if (await kriteriaModel.checkPerankinganDimulai(periode.id_periode)) {
                return res.redirect('/superadmin/kriteria?error=Kriteria terkunci karena perankingan sudah pernah dijalankan pada periode ini.');
            }

            const { nama_kriteria, jenis, keterangan } = req.body;
            if (!nama_kriteria || !jenis) {
                return res.redirect('/superadmin/kriteria?error=Nama kriteria dan jenis wajib diisi.');
            }

            // VALIDASI BARU: Cek duplikasi nama kriteria dalam periode yang sama
            const namaSudahAda = await kriteriaModel.checkNamaExists(periode.id_periode, nama_kriteria.trim());
            if (namaSudahAda) {
                return res.redirect('/superadmin/kriteria?error=Kriteria dengan nama tersebut sudah ada pada periode ini.');
            }

            await kriteriaModel.create({ id_periode: periode.id_periode, nama_kriteria: nama_kriteria.trim(), jenis, keterangan });
            await userModel.logActivity(req.session.user.id_user, `Menambahkan kriteria baru: ${nama_kriteria}`);

            res.redirect('/superadmin/kriteria?success=Kriteria berhasil ditambahkan.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/kriteria?error=Terjadi kesalahan sistem.');
        }
    },

    async update(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            const { id_kriteria, nama_kriteria, jenis, keterangan } = req.body;

            // VALIDASI BARU: Cek duplikasi nama kriteria (kecuali dirinya sendiri)
            const namaSudahAda = await kriteriaModel.checkNamaExists(periode.id_periode, nama_kriteria.trim(), id_kriteria);
            if (namaSudahAda) {
                return res.redirect('/superadmin/kriteria?error=Kriteria dengan nama tersebut sudah ada pada periode ini.');
            }

            await kriteriaModel.update(id_kriteria, { nama_kriteria: nama_kriteria.trim(), jenis, keterangan });
            await userModel.logActivity(req.session.user.id_user, `Memperbarui kriteria: ${nama_kriteria}`);

            res.redirect('/superadmin/kriteria?success=Kriteria berhasil diperbarui.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/kriteria?error=Terjadi kesalahan sistem.');
        }
    },

    async delete(req, res) {
        try {
            const { id_kriteria } = req.params;
            const kriteria = await kriteriaModel.getById(id_kriteria);

            // VALIDASI BARU: Cegah hapus kriteria yang sudah punya nilai siswa atau bobot FUCOM
            const sedangDipakai = await kriteriaModel.checkSedangDipakai(id_kriteria);
            if (sedangDipakai) {
                return res.redirect('/superadmin/kriteria?error=Kriteria ini tidak dapat dihapus karena sudah memiliki data nilai siswa atau bobot FUCOM terkait.');
            }

            await kriteriaModel.delete(id_kriteria);
            await userModel.logActivity(req.session.user.id_user, `Menghapus kriteria: ${kriteria ? kriteria.nama_kriteria : id_kriteria}`);

            res.redirect('/superadmin/kriteria?success=Kriteria berhasil dihapus.');
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/kriteria?error=Gagal menghapus kriteria.');
        }
    },

    
};

module.exports = kriteriaController;