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
/**
 * Agregasi bobot dari N responden (minimal 2) menggunakan rata-rata geometris.
 * @param {Array} semuaBobotResponden - array of array: [[{id_kriteria,nama_kriteria,bobot}, ...], [...], ...]
 */
function agregasiBobot(semuaBobotResponden) {
    const map = {};

    semuaBobotResponden.forEach(bobotList => {
        bobotList.forEach(item => {
            if (!map[item.id_kriteria]) {
                map[item.id_kriteria] = { nama_kriteria: item.nama_kriteria, nilai: [] };
            }
            map[item.id_kriteria].nilai.push(item.bobot);
        });
    });

    const hasil = Object.keys(map).map(id => {
        const d = map[id];
        const perkalian = d.nilai.reduce((a, b) => a * b, 1);
        const geo = Math.pow(perkalian, 1 / d.nilai.length);
        return { id_kriteria: parseInt(id), nama_kriteria: d.nama_kriteria, bobot: geo };
    });

    const total = hasil.reduce((s, i) => s + i.bobot, 0);
    return hasil.map(i => ({ ...i, bobot: i.bobot / total }));
}

module.exports = { hitungFUCOM, agregasiBobot };