/**
 * Fungsi utama perhitungan FUCOM.
 * @param {Array} kriteriaOrder - array kriteria terurut dari peringkat 1 s.d N, 
 *   contoh: [{id_kriteria: 3, nama: 'Nilai Akademik'}, {id_kriteria: 5, nama: 'Minat'}, ...]
 * @param {Array} comparisonValues - array nilai perbandingan antar kriteria berurutan,
 *   contoh: [5, 3, 2, 4, 1] (panjang = jumlah kriteria - 1)
 * @returns {Object} { bobot: [...], dfc: number }
 */
function hitungFUCOM(kriteriaOrder, comparisonValues) {
    const n = kriteriaOrder.length;

    // Langkah 1: Hitung comparative priority (phi) antar kriteria berurutan
    // phi[k] = perbandingan kriteria ke-k terhadap ke-(k+1)
    const phi = comparisonValues;

    // Langkah 2: Hitung final comparative priority (rasio kriteria ke-1 terhadap ke-k)
    // finalRatio[k] = perkalian phi dari 1 sampai k
    const finalRatio = [1]; // rasio kriteria pertama terhadap dirinya sendiri = 1
    for (let k = 1; k < n; k++) {
        finalRatio.push(finalRatio[k - 1] * phi[k - 1]);
    }

    // Langkah 3: Hitung bobot awal (belum dioptimasi) sebagai starting point
    // w_awal[k] = 1 / finalRatio[k], lalu dinormalisasi
    const wAwal = finalRatio.map(r => 1 / r);
    const sumWAwal = wAwal.reduce((a, b) => a + b, 0);
    const wNormalisasiAwal = wAwal.map(w => w / sumWAwal);

    // Langkah 4: Optimasi sederhana untuk meminimalkan DFC
    // Menggunakan pendekatan iteratif untuk mencari bobot yang meminimalkan total deviasi
    // dari kondisi: w(k)/w(k+1) = phi(k)  DAN  w(k)/w(k+2) = phi(k)*phi(k+1)

    let bobot = [...wNormalisasiAwal];
    let bestDfc = hitungDFC(bobot, phi, finalRatio);

    // Iterasi pencarian lokal sederhana (hill climbing) untuk memperbaiki DFC
    const maxIterasi = 2000;
    const stepSize = 0.001;

    for (let iter = 0; iter < maxIterasi; iter++) {
        let improved = false;

        for (let i = 0; i < n; i++) {
            for (const delta of [stepSize, -stepSize]) {
                const bobotCoba = [...bobot];
                bobotCoba[i] += delta;

                if (bobotCoba[i] <= 0) continue;

                // Normalisasi ulang supaya total tetap 1
                const total = bobotCoba.reduce((a, b) => a + b, 0);
                const bobotNormalisasi = bobotCoba.map(w => w / total);

                const dfcCoba = hitungDFC(bobotNormalisasi, phi, finalRatio);

                if (dfcCoba < bestDfc) {
                    bestDfc = dfcCoba;
                    bobot = bobotNormalisasi;
                    improved = true;
                }
            }
        }

        if (!improved) break; // berhenti kalau sudah tidak ada perbaikan
    }

    // Susun hasil sesuai urutan id_kriteria asli
    const hasilBobot = kriteriaOrder.map((k, idx) => ({
        id_kriteria: k.id_kriteria,
        nama_kriteria: k.nama,
        bobot: bobot[idx]
    }));

    return { bobot: hasilBobot, dfc: bestDfc };
}

/**
 * Hitung nilai DFC (Deviation from Full Consistency) untuk suatu set bobot.
 */
function hitungDFC(bobot, phi, finalRatio) {
    const n = bobot.length;
    let totalDeviasi = 0;
    let jumlahPasangan = 0;

    // Syarat 1: w(k) / w(k+1) harus sama dengan phi(k)
    for (let k = 0; k < n - 1; k++) {
        const rasioAktual = bobot[k] / bobot[k + 1];
        totalDeviasi += Math.abs(rasioAktual - phi[k]);
        jumlahPasangan++;
    }

    // Syarat 2: w(k) / w(k+2) harus sama dengan phi(k) * phi(k+1)
    for (let k = 0; k < n - 2; k++) {
        const rasioAktual = bobot[k] / bobot[k + 2];
        const rasioTarget = phi[k] * phi[k + 1];
        totalDeviasi += Math.abs(rasioAktual - rasioTarget);
        jumlahPasangan++;
    }

    return jumlahPasangan > 0 ? totalDeviasi / jumlahPasangan : 0;
}

/**
 * Agregasi bobot dari beberapa responden menggunakan rata-rata geometris.
 * @param {Array} listBobotPerResponden - array of { id_kriteria, bobot } per responden
 * @returns {Array} bobot akhir teragregasi
 */
function agregasiBobot(listHasilPerResponden) {
    // listHasilPerResponden = [{ nama_responden, bobot: [{id_kriteria, nama_kriteria, bobot}, ...] }, ...]
    const semuaKriteria = {};

    listHasilPerResponden.forEach(responden => {
        responden.bobot.forEach(item => {
            if (!semuaKriteria[item.id_kriteria]) {
                semuaKriteria[item.id_kriteria] = { nama_kriteria: item.nama_kriteria, nilaiList: [] };
            }
            semuaKriteria[item.id_kriteria].nilaiList.push(item.bobot);
        });
    });

    const hasilAgregasi = Object.keys(semuaKriteria).map(id_kriteria => {
        const data = semuaKriteria[id_kriteria];
        // Rata-rata geometris: akar pangkat n dari perkalian semua nilai
        const perkalian = data.nilaiList.reduce((a, b) => a * b, 1);
        const rataGeometris = Math.pow(perkalian, 1 / data.nilaiList.length);
        return { id_kriteria: parseInt(id_kriteria), nama_kriteria: data.nama_kriteria, bobot: rataGeometris };
    });

    // Normalisasi ulang supaya total bobot = 1
    const total = hasilAgregasi.reduce((sum, item) => sum + item.bobot, 0);
    return hasilAgregasi.map(item => ({ ...item, bobot: item.bobot / total }));
}

module.exports = { hitungFUCOM, agregasiBobot };