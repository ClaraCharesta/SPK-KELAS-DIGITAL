function hitungFUCOM(kriteriaOrder, comparisonValues) {
    const n = kriteriaOrder.length;
    const phi = comparisonValues;

    const finalRatio = [1];
    for (let k = 1; k < n; k++) {
        finalRatio.push(finalRatio[k - 1] * phi[k - 1]);
    }

    const wAwal = finalRatio.map(r => 1 / r);
    const sumWAwal = wAwal.reduce((a, b) => a + b, 0);
    const wNormalisasiAwal = wAwal.map(w => w / sumWAwal);

    let bobot = [...wNormalisasiAwal];
    let bestDfc = hitungDFC(bobot, phi);

    const maxIterasi = 2000;
    const stepSize = 0.001;

    for (let iter = 0; iter < maxIterasi; iter++) {
        let improved = false;

        for (let i = 0; i < n; i++) {
            for (const delta of [stepSize, -stepSize]) {
                const bobotCoba = [...bobot];
                bobotCoba[i] += delta;

                if (bobotCoba[i] <= 0) continue;

                const total = bobotCoba.reduce((a, b) => a + b, 0);
                const bobotNormalisasi = bobotCoba.map(w => w / total);

                const dfcCoba = hitungDFC(bobotNormalisasi, phi);

                if (dfcCoba < bestDfc) {
                    bestDfc = dfcCoba;
                    bobot = bobotNormalisasi;
                    improved = true;
                }
            }
        }

        if (!improved) break;
    }

    const hasilBobot = kriteriaOrder.map((k, idx) => ({
        id_kriteria: k.id_kriteria,
        nama_kriteria: k.nama,
        bobot: bobot[idx]
    }));

    return { bobot: hasilBobot, dfc: bestDfc };
}

function hitungDFC(bobot, phi) {
    const n = bobot.length;
    let totalDeviasi = 0;
    let jumlahPasangan = 0;

    for (let k = 0; k < n - 1; k++) {
        const rasioAktual = bobot[k] / bobot[k + 1];
        totalDeviasi += Math.abs(rasioAktual - phi[k]);
        jumlahPasangan++;
    }

    for (let k = 0; k < n - 2; k++) {
        const rasioAktual = bobot[k] / bobot[k + 2];
        const rasioTarget = phi[k] * phi[k + 1];
        totalDeviasi += Math.abs(rasioAktual - rasioTarget);
        jumlahPasangan++;
    }

    return jumlahPasangan > 0 ? totalDeviasi / jumlahPasangan : 0;
}

/**
 * Agregasi bobot dari TEPAT 2 responden menggunakan rata-rata geometris.
 * @param {Array} hasilResponden1 - array { id_kriteria, nama_kriteria, bobot }
 * @param {Array} hasilResponden2 - array { id_kriteria, nama_kriteria, bobot }
 */
function agregasiBobot(hasilResponden1, hasilResponden2) {
    const map1 = {};
    hasilResponden1.forEach(item => { map1[item.id_kriteria] = item; });

    const hasilAgregasi = hasilResponden2.map(item2 => {
        const item1 = map1[item2.id_kriteria];
        const b1 = item1 ? item1.bobot : item2.bobot;
        const b2 = item2.bobot;
        const rataGeometris = Math.sqrt(b1 * b2);
        return { id_kriteria: item2.id_kriteria, nama_kriteria: item2.nama_kriteria, bobot: rataGeometris };
    });

    const total = hasilAgregasi.reduce((sum, item) => sum + item.bobot, 0);
    return hasilAgregasi.map(item => ({ ...item, bobot: item.bobot / total }));
}

module.exports = { hitungFUCOM, agregasiBobot };