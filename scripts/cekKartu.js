require('dotenv').config();
const bcrypt = require('bcrypt');
const akunSiswaModel = require('../models/akunSiswaModel');

(async () => {
    try {
        const idPeriode = await akunSiswaModel.getPeriodeAktifId();
        if (!idPeriode) {
            console.log('Tidak ada periode aktif.');
            process.exit(0);
        }

        const kartuList = await akunSiswaModel.getDataKartuSemua(idPeriode);
        let cocok = 0;
        let tidakCocok = 0;
        let tanpaPasswordKartu = 0;

        for (const k of kartuList) {
            if (!k.password_awal) {
                tanpaPasswordKartu++;
                console.log('KARTU KOSONG (sudah ganti password / gagal dekripsi):', k.nama, k.nisn);
                continue;
            }

            const detail = await akunSiswaModel.findByIdSiswa(k.id_siswa);
            const ok = await bcrypt.compare(k.password_awal, detail.password);

            if (ok) {
                cocok++;
            } else {
                tidakCocok++;
                console.log('TIDAK COCOK:', k.nama, k.nisn, '| username:', k.username);
            }
        }

        console.log('---');
        console.log('Cocok:', cocok);
        console.log('Tidak cocok:', tidakCocok);
        console.log('Kartu kosong:', tanpaPasswordKartu);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();