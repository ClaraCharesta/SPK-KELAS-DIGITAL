/**
 * Hitung WASPAS untuk seluruh siswa, LENGKAP dengan detail tiap tahap
 * (Matrix Keputusan, Matrix Ternormalisasi, kontribusi WSM & WPM per kriteria).
 *
 * Aturan pemutus nilai seri (tie-breaker), berurutan:
 *   1. Nilai Q lebih tinggi.
 *   2. Jika Q sama: nilai ternormalisasi (r) pada kriteria berbobot terbesar,
 *      lalu kriteria berbobot terbesar berikutnya, dan seterusnya.
 *   3. Jika seluruh kriteria identik: urutan data (id_siswa lebih kecil lebih dulu).
 *
 * @param {Array} siswaData   - array {id_siswa, nama, nilai: {id_kriteria: nilai_mentah, ...}}
 * @param {Array} kriteriaList - array {id_kriteria, nama_kriteria?, jenis: 'benefit'|'cost'}
 * @param {Array} bobotList   - array {id_kriteria, nilai_bobot}
 * @param {number} lambda     - parameter penyeimbang WSM-WPM, default 0.5
 *
 * @returns {Object} {
 *   lambda,
 *   kriteriaList,
 *   bobotMap,          // { id_kriteria: bobot }
 *   maxNilai,          // { id_kriteria: nilai_max }
 *   minNilai,          // { id_kriteria: nilai_min }
 *   urutanKriteria,    // kriteria diurutkan dari bobot terbesar (dipakai tie-breaker)
 *   matrixKeputusan,   // [{ id_siswa, nama, nilai: { id_kriteria: nilai } }]
 *   matrixNormalisasi, // [{ id_siswa, nama, normalisasi: { id_kriteria: r } }]
 *   hasil,             // [{ id_siswa, nama, wsm, wpm, q, ranking, seri, kelompokSeri, alasanSeri, seriPenuh, detailKriteria }]
 *   seri               // { jumlahKelompok, jumlahSiswa, jumlahSeriPenuh, kelompok: [...] }
 * }
 */

// Pembulatan 10 desimal agar selisih floating point tidak dianggap perbedaan nilai.
function bulat(x) {
    return Math.round(Number(x) * 1e10) / 1e10;
}

function namaKriteria(k) {
    return k.nama_kriteria || k.id_kriteria;
}

function hitungWASPAS(siswaData, kriteriaList, bobotList, lambda = 0.5) {
    const bobotMap = {};
    bobotList.forEach(b => { bobotMap[b.id_kriteria] = parseFloat(b.nilai_bobot); });

    // ================================================================
    // Langkah 1: Cari nilai maksimum & minimum tiap kriteria (dipakai
    // untuk normalisasi di langkah 3)
    // ================================================================
    const maxNilai = {};
    const minNilai = {};
    kriteriaList.forEach(k => {
        const semuaNilai = siswaData
            .map(s => s.nilai[k.id_kriteria])
            .filter(v => v !== null && v !== undefined);
        maxNilai[k.id_kriteria] = semuaNilai.length > 0 ? Math.max(...semuaNilai) : 1;
        minNilai[k.id_kriteria] = semuaNilai.length > 0 ? Math.min(...semuaNilai) : 0;
    });

    // ================================================================
    // Langkah 2: Susun Matrix Keputusan (X)
    // Nilai kosong (belum diinput) diisi nilai tengah (rata-rata max & min)
    // ================================================================
    const matrixKeputusan = siswaData.map(siswa => {
        const baris = { id_siswa: siswa.id_siswa, nama: siswa.nama, nilai: {} };
        kriteriaList.forEach(k => {
            const nilaiMentah = siswa.nilai[k.id_kriteria];
            baris.nilai[k.id_kriteria] = (nilaiMentah !== null && nilaiMentah !== undefined)
                ? parseFloat(nilaiMentah)
                : (maxNilai[k.id_kriteria] + minNilai[k.id_kriteria]) / 2;
        });
        return baris;
    });

    // ================================================================
    // Langkah 3: Normalisasi -> Matrix Ternormalisasi (R)
    // Benefit : r = nilai / nilai_max
    // Cost    : r = nilai_min / nilai
    // ================================================================
    const matrixNormalisasi = matrixKeputusan.map(baris => {
        const normBaris = { id_siswa: baris.id_siswa, nama: baris.nama, normalisasi: {} };
        kriteriaList.forEach(k => {
            const nilai = baris.nilai[k.id_kriteria];
            let r;
            if (k.jenis === 'benefit') {
                r = maxNilai[k.id_kriteria] === 0 ? 0 : nilai / maxNilai[k.id_kriteria];
            } else {
                r = nilai === 0 ? 0 : minNilai[k.id_kriteria] / nilai;
            }
            normBaris.normalisasi[k.id_kriteria] = r;
        });
        return normBaris;
    });

    // ================================================================
    // Langkah 4: Hitung kontribusi WSM (r x bobot) & WPM (r ^ bobot)
    // per kriteria, lalu jumlahkan/kalikan jadi total WSM & WPM per siswa
    // ================================================================
    const hasil = matrixNormalisasi.map(normBaris => {
        let wsm = 0;
        let wpm = 1;
        const detailKriteria = {};

        kriteriaList.forEach(k => {
            const r = normBaris.normalisasi[k.id_kriteria];
            const bobot = bobotMap[k.id_kriteria] || 0;

            const kontribusiWSM = r * bobot;
            const kontribusiWPM = Math.pow(r, bobot);

            wsm += kontribusiWSM;
            wpm *= kontribusiWPM;

            detailKriteria[k.id_kriteria] = {
                nilaiNormalisasi: r,
                bobot,
                kontribusiWSM,
                kontribusiWPM
            };
        });

        // ============================================================
        // Langkah 5: Nilai akhir Q = (lambda x WSM) + ((1 - lambda) x WPM)
        // ============================================================
        const q = (lambda * wsm) + ((1 - lambda) * wpm);

        return {
            id_siswa: normBaris.id_siswa,
            nama: normBaris.nama,
            wsm,
            wpm,
            q,
            seri: false,
            kelompokSeri: null,
            alasanSeri: null,
            seriPenuh: false,
            detailKriteria
        };
    });

    // ================================================================
    // Langkah 6: Urutkan berdasarkan Q tertinggi -> ranking
    // Jika Q sama, dipakai tie-breaker berbobot (lihat bandingkan()).
    // ================================================================

    // Kriteria diurutkan dari bobot terbesar (seri bobot -> id_kriteria terkecil).
    const urutanKriteria = kriteriaList
        .slice()
        .sort((a, b) => {
            const selisih = (bobotMap[b.id_kriteria] || 0) - (bobotMap[a.id_kriteria] || 0);
            if (selisih !== 0) return selisih;
            return Number(a.id_kriteria) - Number(b.id_kriteria);
        });

    // Mengembalikan { nilai, alasan }. nilai < 0 berarti a di atas b.
    // alasan = null jika diputuskan oleh Q, selain itu penjelasan pemutusnya.
    function bandingkan(a, b) {
        const qa = bulat(a.q);
        const qb = bulat(b.q);
        if (qa !== qb) return { nilai: qb - qa, alasan: null };

        for (let i = 0; i < urutanKriteria.length; i++) {
            const k = urutanKriteria[i];
            const ra = bulat(a.detailKriteria[k.id_kriteria].nilaiNormalisasi);
            const rb = bulat(b.detailKriteria[k.id_kriteria].nilaiNormalisasi);
            if (ra !== rb) {
                return {
                    nilai: rb - ra,
                    alasan: { tipe: 'kriteria', kriteria: k, urutan: i + 1 }
                };
            }
        }

        return {
            nilai: Number(a.id_siswa) - Number(b.id_siswa),
            alasan: { tipe: 'urutan_data' }
        };
    }

    function teksAlasan(alasan) {
        if (!alasan) return null;

        if (alasan.tipe === 'kriteria') {
            const bobot = bobotMap[alasan.kriteria.id_kriteria] || 0;
            return 'Nilai Q sama; dipisahkan oleh kriteria "' + namaKriteria(alasan.kriteria) +
                '" (bobot ' + bobot.toFixed(4) + ', prioritas ke-' + alasan.urutan + ')';
        }

        return 'Nilai Q dan seluruh kriteria identik; diurutkan berdasarkan urutan data (ID siswa)';
    }

    hasil.sort((a, b) => bandingkan(a, b).nilai);
    hasil.forEach((item, idx) => { item.ranking = idx + 1; });

    // ================================================================
    // Langkah 7: Deteksi kelompok nilai seri (Q sama) untuk transparansi
    // ================================================================
    const kelompok = [];
    let sekarang = null;
    let nomor = 0;

    for (let i = 1; i < hasil.length; i++) {
        const sebelum = hasil[i - 1];
        const ini = hasil[i];

        if (bulat(sebelum.q) === bulat(ini.q)) {
            if (!sekarang) {
                nomor++;
                sekarang = { nomor, anggota: [sebelum] };
                sebelum.seri = true;
                sebelum.kelompokSeri = nomor;
                kelompok.push(sekarang);
            }

            const pembanding = bandingkan(sebelum, ini);

            ini.seri = true;
            ini.kelompokSeri = nomor;
            ini.alasanSeri = teksAlasan(pembanding.alasan);
            ini.seriPenuh = !!pembanding.alasan && pembanding.alasan.tipe === 'urutan_data';

            sekarang.anggota.push(ini);
        } else {
            sekarang = null;
        }
    }

    const kelompokRingkas = kelompok.map(g => ({
        nomor: g.nomor,
        q: g.anggota[0].q,
        jumlah: g.anggota.length,
        rankMulai: g.anggota[0].ranking,
        rankSelesai: g.anggota[g.anggota.length - 1].ranking,
        adaSeriPenuh: g.anggota.some(a => a.seriPenuh),
        anggota: g.anggota.map(a => ({
            id_siswa: a.id_siswa,
            nama: a.nama,
            ranking: a.ranking,
            alasan: a.alasanSeri,
            seriPenuh: a.seriPenuh
        }))
    }));

    const seri = {
        jumlahKelompok: kelompokRingkas.length,
        jumlahSiswa: kelompokRingkas.reduce((n, g) => n + g.jumlah, 0),
        jumlahSeriPenuh: kelompokRingkas.filter(g => g.adaSeriPenuh).length,
        kelompok: kelompokRingkas
    };

    return {
        lambda,
        kriteriaList,
        bobotMap,
        maxNilai,
        minNilai,
        urutanKriteria,
        matrixKeputusan,
        matrixNormalisasi,
        hasil,
        seri
    };
}

/**
 * Menandai kelompok seri yang berada tepat di batas kuota
 * (sebagian anggota masuk kuota, sebagian tidak).
 */
function tandaiSeriKuota(seri, kuota) {
    const kuotaNum = Number(kuota) || 0;

    const kelompok = seri.kelompok.map(g => ({
        ...g,
        diBatasKuota: kuotaNum > 0 && g.rankMulai <= kuotaNum && g.rankSelesai > kuotaNum
    }));

    return {
        ...seri,
        kuota: kuotaNum,
        kelompok,
        jumlahDiBatasKuota: kelompok.filter(g => g.diBatasKuota).length
    };
}

module.exports = { hitungWASPAS, tandaiSeriKuota };