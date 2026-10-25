const fucomModel = require('../models/fucomModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');
const { hitungFUCOM } = require('../utils/fucomCalculator');
const { cekTerkunci } = require('../utils/lockHelper');
const { isPeriodeSudahMulai, pesanBelumMulai } = require('../utils/periodeHelper');

const DFC_THRESHOLD = 0.1;

const BOBOT_MINIMAL = 0.03;

const REGEX_SKALA = /^[0-9]([.,][0-9]{1,2})?$/;
const SKALA_MAKS = 9;

function normalisasiSkala(raw) {
    const teks = String(raw === undefined || raw === null ? '' : raw).trim();

    if (!REGEX_SKALA.test(teks)) return null;

    const angka = Number(teks.replace(',', '.'));

    if (!Number.isFinite(angka) || angka <= 0 || angka > SKALA_MAKS) return null;

    return String(angka);
}

function persenIndo(desimal) {
    return (parseFloat(desimal) * 100).toFixed(2).replace('.', ',') + '%';
}

async function ambilNamaResponden(req) {
    let nama = '';
    try {
        const userData = await userModel.getById(req.session.user.id_user);
        nama = userData && userData.nama ? String(userData.nama).trim() : '';
    } catch (e) {
        console.error('Gagal mengambil nama profil:', e);
    }
    return nama || String(req.session.user.nama || '').trim();
}

function parseDanValidasiPayload(body, kriteriaList) {
    const { id_kriteria_urutan } = body;

    if (!id_kriteria_urutan) {
        return { errorMsg: 'Data tidak lengkap.' };
    }

    const urutanKriteria = (Array.isArray(id_kriteria_urutan) ? id_kriteria_urutan : [id_kriteria_urutan])
        .map(function (v) { return String(v); });

    const idSet = new Set(urutanKriteria);
    if (idSet.size !== urutanKriteria.length) {
        return { errorMsg: 'Setiap kriteria hanya boleh dipilih satu kali dalam urutan peringkat.' };
    }

    const idValid = new Set(kriteriaList.map(function (k) { return String(k.id_kriteria); }));
    if (urutanKriteria.length !== idValid.size || !urutanKriteria.every(function (id) { return idValid.has(id); })) {
        return { errorMsg: 'Urutan kriteria tidak valid. Pastikan semua kriteria dipilih tepat satu kali.' };
    }

    const jumlahPasangan = urutanKriteria.length - 1;
    const nilaiPerbandingan = [];
    for (let i = 0; i < jumlahPasangan; i++) {
        const nilai = normalisasiSkala(body[`nilai_perbandingan_${i}`]);
        if (nilai === null) {
            return {
                errorMsg: 'Nilai perbandingan harus berupa angka lebih dari 0 sampai 9 dengan maksimal 2 angka desimal (contoh: 1 atau 1,5). Nilai 0, 0,0, 0,00, huruf, minus, dan angka 10 ke atas tidak diperbolehkan.'
            };
        }
        nilaiPerbandingan.push(nilai);
    }

    const dataPerbandingan = [];
    for (let i = 0; i < urutanKriteria.length - 1; i++) {
        dataPerbandingan.push({
            id_kriteria_asal: urutanKriteria[i],
            id_kriteria_pembanding: urutanKriteria[i + 1],
            peringkat_asal: i + 1,
            nilai_perbandingan: nilaiPerbandingan[i]
        });
    }

    return { dataPerbandingan };
}

const PESAN_TOLAK = {
    sudah_ada: 'Data responden sudah ada (kemungkinan baru saja disimpan). Muat ulang halaman, lalu gunakan tombol Edit jika ingin mengubahnya.',
    final: 'Bobot kriteria sudah dihitung dan konsisten. Data responden tidak dapat diubah lagi.',
    tidak_ada: 'Data responden tidak ditemukan. Muat ulang halaman terlebih dahulu.'
};

const fucomController = {
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            const namaResponden = await ambilNamaResponden(req);

            if (!periode || !isPeriodeSudahMulai(periode)) {
                return res.render('operator/fucom', {
                    user: req.session.user,
                    activePage: 'fucom',
                    pageTitle: 'Perhitungan FUCOM',
                    kriteriaList: [],
                    respondenList: [],
                    dataResponden: {},
                    bobotFinal: [],
                    dfcKonsisten: false,
                    namaResponden,
                    error: !periode ? 'Belum ada periode seleksi aktif.' : pesanBelumMulai(periode),
                    success: null,
                    terkunci: false
                });
            }

            const kriteriaList = await fucomModel.getKriteria(periode.id_periode);
            const respondenList = await fucomModel.getRespondenList(periode.id_periode);

            const dataResponden = {};
            for (const nama of respondenList) {
                dataResponden[nama] = await fucomModel.getPerbandinganByResponden(
                    periode.id_periode,
                    nama
                );
            }

            const bobotFinal = await fucomModel.getBobotFinal(periode.id_periode);

            let dfcKonsisten = false;
            if (bobotFinal.length > 0) {
                dfcKonsisten = parseFloat(bobotFinal[0].nilai_dfc) < DFC_THRESHOLD;
            }

            const terkunci = await cekTerkunci(periode.id_periode);

            res.render('operator/fucom', {
                user: req.session.user,
                activePage: 'fucom',
                pageTitle: 'Perhitungan FUCOM',
                kriteriaList,
                respondenList,
                dataResponden,
                bobotFinal,
                dfcKonsisten,
                namaResponden,
                error: req.query.error || null,
                success: req.query.success || null,
                terkunci
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data FUCOM.');
        }
    },

    async saveInput(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent('Belum ada periode seleksi aktif.'));
            }
            if (!isPeriodeSudahMulai(periode)) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent(pesanBelumMulai(periode)));
            }
            if (await cekTerkunci(periode.id_periode)) {
                return res.redirect('/operator/fucom?error=Pembobotan terkunci karena sudah ada siswa yang ditetapkan Lulus.');
            }

            const kriteriaList = await fucomModel.getKriteria(periode.id_periode);
            const parsed = parseDanValidasiPayload(req.body, kriteriaList);
            if (parsed.errorMsg) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent(parsed.errorMsg));
            }

            const namaResponden = await ambilNamaResponden(req);
            if (!namaResponden) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent('Nama pada profil akun Anda kosong. Isi dulu nama lengkap di menu Profil.'));
            }

            let hasil;
            try {
                hasil = await fucomModel.simpanResponden(
                    periode.id_periode,
                    namaResponden,
                    parsed.dataPerbandingan,
                    DFC_THRESHOLD
                );
            } catch (err) {
                if (err && err.code === 'ER_DUP_ENTRY') {
                    return res.redirect('/operator/fucom?error=' + encodeURIComponent(PESAN_TOLAK.sudah_ada));
                }
                throw err;
            }

            if (!hasil.ok) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent(PESAN_TOLAK[hasil.alasan] || 'Data tidak dapat disimpan.'));
            }

            await userModel.logActivity(
                req.session.user.id_user,
                `Menyimpan data perbandingan kriteria FUCOM (responden: ${namaResponden})`
            );

            res.redirect('/operator/fucom?success=Data responden berhasil disimpan. Klik Hitung Bobot FUCOM untuk melanjutkan.');
        } catch (error) {
            console.error(error);
            res.redirect('/operator/fucom?error=Terjadi kesalahan sistem.');
        }
    },

    async editInput(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent('Belum ada periode seleksi aktif.'));
            }
            if (!isPeriodeSudahMulai(periode)) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent(pesanBelumMulai(periode)));
            }
            if (await cekTerkunci(periode.id_periode)) {
                return res.redirect('/operator/fucom?error=Pembobotan terkunci karena sudah ada siswa yang ditetapkan Lulus.');
            }

            const respondenSaatIni = await fucomModel.getRespondenList(periode.id_periode);
            if (respondenSaatIni.length === 0) {
                return res.redirect('/operator/fucom?error=Data responden yang ingin diedit tidak ditemukan.');
            }
            const namaLama = respondenSaatIni[0];

            const kriteriaList = await fucomModel.getKriteria(periode.id_periode);
            const parsed = parseDanValidasiPayload(req.body, kriteriaList);
            if (parsed.errorMsg) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent(parsed.errorMsg));
            }

            const namaBaru = await ambilNamaResponden(req);
            if (!namaBaru) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent('Nama pada profil akun Anda kosong. Isi dulu nama lengkap di menu Profil.'));
            }

            const hasil = await fucomModel.gantiResponden(
                periode.id_periode,
                namaBaru,
                parsed.dataPerbandingan,
                DFC_THRESHOLD
            );

            if (!hasil.ok) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent(PESAN_TOLAK[hasil.alasan] || 'Data tidak dapat diubah.'));
            }

            await userModel.logActivity(
                req.session.user.id_user,
                `Mengedit data perbandingan kriteria FUCOM (responden: ${namaLama} -> ${namaBaru})`
            );

            res.redirect('/operator/fucom?success=Data responden berhasil diperbarui. Klik Hitung Bobot FUCOM untuk melanjutkan.');
        } catch (error) {
            console.error(error);
            res.redirect('/operator/fucom?error=Terjadi kesalahan sistem.');
        }
    },

    async hapusResponden(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent('Belum ada periode seleksi aktif.'));
            }
            if (await cekTerkunci(periode.id_periode)) {
                return res.redirect('/operator/fucom?error=Pembobotan terkunci karena sudah ada siswa yang ditetapkan Lulus.');
            }

            const respondenSaatIni = await fucomModel.getRespondenList(periode.id_periode);
            const namaDihapus = respondenSaatIni[0] || '(tidak ada)';

            const hasil = await fucomModel.hapusResponden(periode.id_periode, DFC_THRESHOLD);

            if (!hasil.ok) {
                const pesanHapus = hasil.alasan === 'final'
                    ? 'Bobot kriteria sudah dihitung dan konsisten. Data responden tidak dapat dihapus lagi.'
                    : PESAN_TOLAK[hasil.alasan];
                return res.redirect('/operator/fucom?error=' + encodeURIComponent(pesanHapus));
            }

            await userModel.logActivity(
                req.session.user.id_user,
                `Menghapus data responden FUCOM: ${namaDihapus}`
            );

            res.redirect('/operator/fucom?success=Data responden berhasil dihapus. Silakan input ulang data untuk menghitung kembali.');
        } catch (error) {
            console.error(error);
            res.redirect('/operator/fucom?error=Terjadi kesalahan sistem.');
        }
    },

    async hitungBobot(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent('Belum ada periode seleksi aktif.'));
            }
            if (await cekTerkunci(periode.id_periode)) {
                return res.redirect('/operator/fucom?error=Pembobotan terkunci karena sudah ada siswa yang ditetapkan Lulus.');
            }

            const respondenList = await fucomModel.getRespondenList(periode.id_periode);
            if (respondenList.length < 1) {
                return res.redirect(`/operator/fucom?error=Data perbandingan kriteria belum diisi. Silakan input data responden terlebih dahulu.`);
            }

            const bobotTersimpan = await fucomModel.getBobotFinal(periode.id_periode);
            if (bobotTersimpan.length > 0 && parseFloat(bobotTersimpan[0].nilai_dfc) < DFC_THRESHOLD) {
                return res.redirect('/operator/fucom?error=Bobot kriteria sudah final dan konsisten.');
            }

            const namaResponden = respondenList[0];
            const perbandinganData = await fucomModel.getPerbandinganByResponden(
                periode.id_periode,
                namaResponden
            );

            const kriteriaOrder = [];
            perbandinganData.forEach(row => {
                if (!kriteriaOrder.find(k => k.id_kriteria === row.id_kriteria_asal)) {
                    kriteriaOrder.push({
                        id_kriteria: row.id_kriteria_asal,
                        nama: row.nama_kriteria_asal
                    });
                }
            });
            const lastRow = perbandinganData[perbandinganData.length - 1];
            if (
                lastRow &&
                !kriteriaOrder.find(k => k.id_kriteria === lastRow.id_kriteria_pembanding)
            ) {
                kriteriaOrder.push({
                    id_kriteria: lastRow.id_kriteria_pembanding,
                    nama: lastRow.nama_kriteria_pembanding
                });
            }
            const comparisonValues = perbandinganData.map(row =>
                parseFloat(row.nilai_perbandingan)
            );

            const sidikJari = fucomModel.buatSidikJari(perbandinganData);

            const hasil = hitungFUCOM(kriteriaOrder, comparisonValues);
            const dfc = parseFloat(hasil.dfc);
            const dfcLolos = dfc < DFC_THRESHOLD;

            if (dfcLolos) {
                const terkecil = hasil.bobot.reduce(function (min, b) {
                    return parseFloat(b.bobot) < parseFloat(min.bobot) ? b : min;
                }, hasil.bobot[0]);

                if (parseFloat(terkecil.bobot) < BOBOT_MINIMAL) {
                    const kriteriaTerkecil = kriteriaOrder.find(
                        k => String(k.id_kriteria) === String(terkecil.id_kriteria)
                    );
                    const namaTerkecil = kriteriaTerkecil ? kriteriaTerkecil.nama : 'salah satu kriteria';

                    const pesan =
                        `Bobot belum disimpan karena distribusinya terlalu timpang: kriteria "${namaTerkecil}" hanya mendapat bobot ` +
                        `${persenIndo(terkecil.bobot)} (minimal ${persenIndo(BOBOT_MINIMAL)}). ` +
                        `Klik Edit pada data responden, turunkan nilai perbandingan yang besar agar lebih seimbang, lalu hitung ulang.`;

                    await userModel.logActivity(
                        req.session.user.id_user,
                        `Perhitungan bobot FUCOM ditahan karena bobot timpang (${namaTerkecil}: ${persenIndo(terkecil.bobot)}, DFC: ${hasil.dfc})`
                    );

                    return res.redirect('/operator/fucom?error=' + encodeURIComponent(pesan));
                }
            }

            const tersimpan = await fucomModel.saveBobotFinal(
                periode.id_periode,
                hasil.bobot,
                hasil.dfc,
                sidikJari
            );

            if (!tersimpan) {
                return res.redirect('/operator/fucom?error=' + encodeURIComponent('Data perbandingan berubah saat perhitungan berjalan, bobot tidak disimpan. Silakan klik Hitung Bobot FUCOM sekali lagi.'));
            }

            await userModel.logActivity(
                req.session.user.id_user,
                `Menghitung bobot kriteria FUCOM (responden: ${namaResponden}, DFC: ${hasil.dfc})`
            );

            if (dfcLolos) {
                res.redirect(`/operator/fucom?success=Bobot kriteria berhasil dihitung dan konsisten. Bobot telah dikunci sebagai bobot final.`);
            } else {
                const dfcTampil = dfc.toFixed(3).replace('.', ',');
                const pesan = `Hasil belum konsisten (DFC ${dfcTampil}, syarat di bawah 0,1). Ikuti panduan perbaikan di bawah, lalu hitung ulang.`;
                res.redirect('/operator/fucom?error=' + encodeURIComponent(pesan));
            }
        } catch (error) {
            console.error(error);
            res.redirect('/operator/fucom?error=' + encodeURIComponent('Terjadi kesalahan dalam perhitungan: ' + error.message));
        }
    }
};

module.exports = fucomController;