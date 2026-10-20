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
        let gagalDekripsi = 0;
        let sudahGanti = 0;
        let akunHilang = 0;

        for (const k of kartuList) {
            if (!k.password_awal) {
                if (Number(k.wajib_ganti_password) === 0) {
                    // Wajar: siswa sudah mengganti password, password awal sengaja dihapus.
                    sudahGanti++;
                } else {
                    // Bermasalah: belum ganti password tapi password awal tidak terbaca.
                    gagalDekripsi++;
                    console.log('GAGAL DEKRIPSI (belum ganti password):', k.nama, k.nisn);
                }
                continue;
            }

            const detail = await akunSiswaModel.findByIdSiswa(k.id_siswa);

            if (!detail) {
                akunHilang++;
                console.log('AKUN TIDAK DITEMUKAN:', k.nama, k.nisn);
                continue;
            }

            const ok = await bcrypt.compare(k.password_awal, detail.password);

            if (ok) {
                cocok++;
            } else {
                tidakCocok++;
                console.log('TIDAK COCOK:', k.nama, k.nisn, '| username:', k.username);
            }
        }

        console.log('---');
        console.log('Total diperiksa          :', kartuList.length);
        console.log('Cocok                    :', cocok);
        console.log('Tidak cocok              :', tidakCocok);
        console.log('Gagal dekripsi           :', gagalDekripsi);
        console.log('Sudah ganti password     :', sudahGanti);
        console.log('Akun tidak ditemukan     :', akunHilang);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();