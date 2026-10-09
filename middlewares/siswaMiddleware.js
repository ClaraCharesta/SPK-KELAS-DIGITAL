const akunSiswaModel = require('../models/akunSiswaModel');

const formatTanggal = (nilai) => {
    if (!nilai) return '-';

    const t = new Date(nilai);
    if (isNaN(t.getTime())) return '-';

    return t.toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
};

// Siswa yang login. Status akun selalu diperiksa ulang dari database.
const isSiswa = async (req, res, next) => {
    try {
        const sesi = req.session && req.session.siswa;

        if (!sesi) {
            return res.redirect('/login');
        }

        const akun = await akunSiswaModel.findDetailByIdSiswa(
            sesi.id_siswa
        );

        if (!akun) {
            return req.session.destroy(() => res.redirect('/login'));
        }

        req.akunSiswa = akun;

        // Jangan kirim hash password ke view.
        const { password, ...aman } = akun;
        res.locals.siswa = aman;
        res.locals.formatTanggal = formatTanggal;

        next();
    } catch (error) {
        console.error(error);
        res.status(500).send('Terjadi kesalahan pada server.');
    }
};

// Akun nonaktif hanya boleh membuka halaman yang diizinkan.
const SISWA_NONAKTIF_BEBAS = [
    '/siswa/tahap-3'
];

const kunciJikaSudahMengisi = (req, res, next) => {
    if (
        req.akunSiswa &&
        req.akunSiswa.status_akun === 'nonaktif'
    ) {
        const alamat = (req.baseUrl + req.path).replace(/\/+$/, '');

        if (!SISWA_NONAKTIF_BEBAS.includes(alamat)) {
            return res.redirect('/siswa/tahap-3');
        }
    }

    next();
};

// Password wajib diganti sebelum pengisian,
// kecuali akun sudah nonaktif.
const wajibGantiPasswordSiswa = (req, res, next) => {
    const akun = req.akunSiswa;

    if (
        akun &&
        akun.status_akun !== 'nonaktif' &&
        akun.wajib_ganti_password
    ) {
        const alamat = (req.baseUrl + req.path).replace(/\/+$/, '');

        if (alamat !== '/siswa/ganti-password') {
            return res.redirect('/siswa/ganti-password');
        }
    }

    next();
};

module.exports = {
    isSiswa,
    kunciJikaSudahMengisi,
    wajibGantiPasswordSiswa
};

