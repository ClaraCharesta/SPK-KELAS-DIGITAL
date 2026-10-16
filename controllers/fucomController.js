const fucomModel = require('../models/fucomModel');
const periodeModel = require('../models/periodeModel');
const userModel = require('../models/userModel');
const db = require('../config/database');
const { hitungFUCOM } = require('../utils/fucomCalculator');
const { cekTerkunci } = require('../utils/lockHelper');
const { isPeriodeSudahMulai, pesanBelumMulai } = require('../utils/periodeHelper');

const DFC_THRESHOLD = 0.1;

// Bobot terkecil yang masih diterima (3%). Di bawah ini distribusi dianggap terlalu timpang:
// bobot TIDAK disimpan dan TIDAK dikunci, user diminta memperbaiki nilai perbandingan.
const BOBOT_MINIMAL = 0.03;

// Skala perbandingan: angka lebih dari 0 sampai 9, maksimal 2 desimal.
// Contoh valid: 1, 1,5, 2.25, 0,5, 9. Tidak valid: 0, 0,0, 0,00, 10, 9,5, -1, huruf.
const REGEX_SKALA = /^[0-9]([.,][0-9]{1,2})?$/;
const SKALA_MAKS = 9;

function normalisasiSkala(raw) {
    const teks = String(raw === undefined || raw === null ? '' : raw).trim();

    if (!REGEX_SKALA.test(teks)) return null;

    const angka = Number(teks.replace(',', '.'));

    if (!Number.isFinite(angka) || angka <= 0 || angka > SKALA_MAKS) return null;

    return String(angka);
}

// Format angka desimal ke gaya Indonesia (koma), contoh 0.0234 -> "2,34%"
function persenIndo(desimal) {
    return (parseFloat(desimal) * 100).toFixed(2).replace('.', ',') + '%';
}

// Helper: cek apakah bobot yang tersimpan sudah final (dihitung DAN konsisten)
async function bobotSudahFinal(id_periode) {
    const bobot = await fucomModel.getBobotFinal(id_periode);
    if (bobot.length === 0) return false;
    return parseFloat(bobot[0].nilai_dfc) < DFC_THRESHOLD;
}

// Helper: parsing & validasi payload urutan kriteria + nilai perbandingan dari body form
// Dipakai bersama oleh saveInput dan editInput supaya tidak duplikat logika
function parseDanValidasiPayload(body) {
    const { nama_responden, id_kriteria_urutan } = body;

    if (!nama_responden || !id_kriteria_urutan) {
        return { errorMsg: 'Data tidak lengkap.' };
    }

    const urutanKriteria = Array.isArray(id_kriteria_urutan)
        ? id_kriteria_urutan
        : [id_kriteria_urutan];

    const idSet = new Set(urutanKriteria);
    if (idSet.size !== urutanKriteria.length) {
        return { errorMsg: 'Setiap kriteria hanya boleh dipilih satu kali dalam urutan peringkat.' };
    }

    // Ambil nilai perbandingan dari field bernama nilai_perbandingan_0, nilai_perbandingan_1, dst
    // (sesuai jumlah pasangan kriteria berurutan = jumlah kriteria - 1)
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

    return { namaResponden: nama_responden.trim(), dataPerbandingan };
}

const fucomController = {
    async index(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (!periode || !isPeriodeSudahMulai(periode)) {
                return res.render('admin/fucom', {
                    user: req.session.user,
                    activePage: 'fucom',
                    pageTitle: 'Perhitungan FUCOM',
                    kriteriaList: [],
                    respondenList: [],
                    dataResponden: {},
                    bobotFinal: [],
                    dfcKonsisten: false,
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

            // Tentukan status konsistensi berdasarkan nilai DFC yang tersimpan
            let dfcKonsisten = false;
            if (bobotFinal.length > 0) {
                dfcKonsisten = parseFloat(bobotFinal[0].nilai_dfc) < DFC_THRESHOLD;
            }

            const terkunci = await cekTerkunci(periode.id_periode);

            res.render('admin/fucom', {
                user: req.session.user,
                activePage: 'fucom',
                pageTitle: 'Perhitungan FUCOM',
                kriteriaList,
                respondenList,
                dataResponden,
                bobotFinal,
                dfcKonsisten,
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
            if (await cekTerkunci(periode.id_periode)) {
                return res.redirect('/admin/fucom?error=Pembobotan terkunci karena sudah ada siswa yang ditetapkan Lulus.');
            }

            if (await bobotSudahFinal(periode.id_periode)) {
                return res.redirect('/admin/fucom?error=Bobot kriteria sudah dihitung dan konsisten. Data responden tidak dapat ditambah/diubah lagi.');
            }

            // PEMBOBOTAN FUCOM HANYA MENGGUNAKAN 1 RESPONDEN RESMI (HASIL MUSYAWARAH)
            const respondenSaatIni = await fucomModel.getRespondenList(periode.id_periode);
            if (respondenSaatIni.length >= 1) {
                return res.redirect('/admin/fucom?error=Pembobotan FUCOM hanya menggunakan 1 responden (hasil musyawarah). Hapus atau edit data yang sudah ada terlebih dahulu jika ingin mengubah.');
            }

            const parsed = parseDanValidasiPayload(req.body);
            if (parsed.errorMsg) {
                return res.redirect('/admin/fucom?error=' + encodeURIComponent(parsed.errorMsg));
            }

            await fucomModel.savePerbandingan(
                periode.id_periode,
                parsed.namaResponden,
                parsed.dataPerbandingan
            );

            // Bobot lama (jika ada, misal dari percobaan sebelumnya yang tidak konsisten) dihapus otomatis
            await fucomModel.hapusBobotFinal(periode.id_periode);

            await userModel.logActivity(
                req.session.user.id_user,
                `Menyimpan data perbandingan kriteria FUCOM (responden: ${parsed.namaResponden})`
            );

            res.redirect('/admin/fucom?success=Data responden berhasil disimpan. Klik Hitung Bobot FUCOM untuk melanjutkan.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/fucom?error=Terjadi kesalahan sistem.');
        }
    },

    // ====== EDIT DATA RESPONDEN (SEBELUM BOBOT DIHITUNG/KONSISTEN) ======
    async editInput(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (await cekTerkunci(periode.id_periode)) {
                return res.redirect('/admin/fucom?error=Pembobotan terkunci karena sudah ada siswa yang ditetapkan Lulus.');
            }

            if (await bobotSudahFinal(periode.id_periode)) {
                return res.redirect('/admin/fucom?error=Bobot kriteria sudah dihitung dan konsisten. Data responden tidak dapat diedit lagi.');
            }

            const { nama_asli } = req.body;
            if (!nama_asli) {
                return res.redirect('/admin/fucom?error=Data responden yang ingin diedit tidak ditemukan.');
            }

            // Pastikan responden yang mau diedit memang ada
            const respondenSaatIni = await fucomModel.getRespondenList(periode.id_periode);
            if (!respondenSaatIni.includes(nama_asli)) {
                return res.redirect('/admin/fucom?error=Data responden yang ingin diedit tidak ditemukan.');
            }

            const parsed = parseDanValidasiPayload(req.body);
            if (parsed.errorMsg) {
                return res.redirect('/admin/fucom?error=' + encodeURIComponent(parsed.errorMsg));
            }

            // Jika nama diganti, cek supaya tidak bentrok dengan nama responden lain (seharusnya tidak ada,
            // karena maksimal 1 responden, tapi tetap dijaga untuk konsistensi)
            const namaBaruLower = parsed.namaResponden.toLowerCase();
            const bentrok = respondenSaatIni.some(
                n => n !== nama_asli && n.toLowerCase() === namaBaruLower
            );
            if (bentrok) {
                return res.redirect('/admin/fucom?error=Nama responden ini sudah pernah diinput sebelumnya.');
            }

            // Hapus data responden lama (berdasarkan nama asli sebelum diedit)
            await fucomModel.hapusPerbandinganByResponden(periode.id_periode, nama_asli);

            // Simpan data baru (nama bisa sama atau berubah, urutan & nilai sudah tervalidasi)
            await fucomModel.savePerbandingan(
                periode.id_periode,
                parsed.namaResponden,
                parsed.dataPerbandingan
            );

            // Bobot lama (kalau ada, dari percobaan sebelumnya yang tidak konsisten) dihapus otomatis
            await fucomModel.hapusBobotFinal(periode.id_periode);

            await userModel.logActivity(
                req.session.user.id_user,
                `Mengedit data perbandingan kriteria FUCOM (responden: ${nama_asli} -> ${parsed.namaResponden})`
            );

            res.redirect('/admin/fucom?success=Data responden berhasil diperbarui. Klik Hitung Bobot FUCOM untuk melanjutkan.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/fucom?error=Terjadi kesalahan sistem.');
        }
    },

    async hapusResponden(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (await cekTerkunci(periode.id_periode)) {
                return res.redirect('/admin/fucom?error=Pembobotan terkunci karena sudah ada siswa yang ditetapkan Lulus.');
            }

            if (await bobotSudahFinal(periode.id_periode)) {
                return res.redirect('/admin/fucom?error=Bobot kriteria sudah dihitung dan konsisten. Data responden tidak dapat dihapus lagi.');
            }

            const { nama_responden } = req.body;
            await fucomModel.hapusPerbandinganByResponden(
                periode.id_periode,
                decodeURIComponent(nama_responden)
            );

            // Hapus juga bobot yang tersimpan (baik belum dihitung maupun hasil yang tidak konsisten)
            await fucomModel.hapusBobotFinal(periode.id_periode);

            await userModel.logActivity(
                req.session.user.id_user,
                `Menghapus data responden FUCOM: ${nama_responden}`
            );

            res.redirect('/admin/fucom?success=Data responden berhasil dihapus. Silakan input ulang data untuk menghitung kembali.');
        } catch (error) {
            console.error(error);
            res.redirect('/admin/fucom?error=Terjadi kesalahan sistem.');
        }
    },

    async hitungBobot(req, res) {
        try {
            const periode = await periodeModel.getActivePeriode();
            if (await cekTerkunci(periode.id_periode)) {
                return res.redirect('/admin/fucom?error=Pembobotan terkunci karena sudah ada siswa yang ditetapkan Lulus.');
            }

            if (await bobotSudahFinal(periode.id_periode)) {
                return res.redirect('/admin/fucom?error=Bobot kriteria sudah final dan konsisten.');
            }

            const respondenList = await fucomModel.getRespondenList(periode.id_periode);
            if (respondenList.length < 1) {
                return res.redirect(`/admin/fucom?error=Data perbandingan kriteria belum diisi. Silakan input data responden terlebih dahulu.`);
            }

            // ====== PEMBOBOTAN FUCOM 1 RESPONDEN (HASIL MUSYAWARAH) ======
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

            // Hitung di memori dulu. Belum ada yang ditulis ke database.
            const hasil = hitungFUCOM(kriteriaOrder, comparisonValues);
            const dfc = parseFloat(hasil.dfc);
            const dfcLolos = dfc < DFC_THRESHOLD;

            // ====== TAHAN JIKA DISTRIBUSI BOBOT TERLALU TIMPANG ======
            // Hanya dicek kalau DFC sudah lolos. Kalau DFC belum lolos, alur perbaikan inkonsistensi
            // yang jalan lebih dulu (bobot disimpan agar skor DFC bisa ditampilkan di Langkah 2).
            // Kalau timpang, bobot TIDAK disimpan sehingga TIDAK terkunci dan data masih bisa diedit.
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

                    return res.redirect('/admin/fucom?error=' + encodeURIComponent(pesan));
                }
            }

            await fucomModel.saveBobotFinal(
                periode.id_periode,
                hasil.bobot,
                hasil.dfc
            );

            await userModel.logActivity(
                req.session.user.id_user,
                `Menghitung bobot kriteria FUCOM (responden: ${namaResponden}, DFC: ${hasil.dfc})`
            );

            // Pesan berbeda tergantung apakah hasil konsisten atau tidak
            if (dfcLolos) {
                res.redirect(`/admin/fucom?success=Bobot kriteria berhasil dihitung dan konsisten. Bobot telah dikunci sebagai bobot final.`);
            } else {
                const dfcTampil = dfc.toFixed(3).replace('.', ',');
                const pesan = `Hasil belum konsisten (DFC ${dfcTampil}, syarat di bawah 0,1). Ikuti panduan perbaikan di bawah, lalu hitung ulang.`;
                res.redirect('/admin/fucom?error=' + encodeURIComponent(pesan));
            }
        } catch (error) {
            console.error(error);
            res.redirect('/admin/fucom?error=' + encodeURIComponent('Terjadi kesalahan dalam perhitungan: ' + error.message));
        }
    }
};

module.exports = fucomController;