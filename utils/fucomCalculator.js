/**
 * FUCOM (Full Consistency Method)
 *
 * Input:
 *   kriteriaOrder    : [{ id_kriteria, nama }, ...] urut dari PALING penting ke paling kurang penting
 *   comparisonValues : [φ1, φ2, ...] nilai perbandingan antar kriteria berurutan (panjang = n - 1),
 *                      φk = w_k / w_(k+1), sehingga setiap φ harus >= 1
 *
 * Bobot dihitung langsung (closed form) dari rantai rasio, tanpa iterasi:
 *   w_k / w_(k+1) = φk      -> rantai rasio dari kriteria terpenting
 *   w_k / w_(k+2) = φk·φ(k+1) otomatis terpenuhi oleh rantai yang sama
 * Jadi solusi ini sudah optimal (DFC = 0) dan tidak perlu dicari lewat hill-climbing.
 *
 * DFC (χ) = deviasi MAKSIMUM antara rasio bobot aktual dan rasio targetnya.
 */

const PEMBULATAN_DFC = 6;

function formatAngka(v) {
    return String(v).replace('.', ',');
}

// Validasi input. Melempar Error dengan pesan yang bisa langsung ditampilkan ke user.
function validasiMasukan(kriteriaOrder, phi) {
    if (!Array.isArray(kriteriaOrder) || kriteriaOrder.length < 2) {
        throw new Error('Perhitungan FUCOM membutuhkan minimal 2 kriteria.');
    }

    const n = kriteriaOrder.length;

    if (!Array.isArray(phi) || phi.length !== n - 1) {
        const ditemukan = Array.isArray(phi) ? phi.length : 0;
        throw new Error(`Jumlah nilai perbandingan harus ${n - 1}, tetapi ditemukan ${ditemukan}. Silakan edit dan simpan ulang data responden.`);
    }

    phi.forEach(function (v, i) {
        const pasangan = `${kriteriaOrder[i].nama} dibanding ${kriteriaOrder[i + 1].nama}`;

        if (!Number.isFinite(v) || v <= 0) {
            throw new Error(`Nilai perbandingan "${pasangan}" tidak valid. Silakan edit data responden.`);
        }

        // Kriteria sebelumnya diurutkan lebih penting, jadi nilainya tidak boleh di bawah 1.
        if (v < 1) {
            throw new Error(`Nilai perbandingan "${pasangan}" adalah ${formatAngka(v)}, kurang dari 1. Kriteria yang diurutkan lebih awal harus bernilai minimal 1 terhadap kriteria sesudahnya. Silakan edit data responden.`);
        }
    });
}

// DFC (χ) = deviasi maksimum dari dua jenis syarat FUCOM:
//   |w_k / w_(k+1) - φk|              untuk k = 1 .. n-1
//   |w_k / w_(k+2) - φk · φ(k+1)|     untuk k = 1 .. n-2
function hitungDFC(bobot, phi) {
    const n = bobot.length;
    let deviasiMaks = 0;

    for (let k = 0; k < n - 1; k++) {
        const rasioAktual = bobot[k] / bobot[k + 1];
        deviasiMaks = Math.max(deviasiMaks, Math.abs(rasioAktual - phi[k]));
    }

    for (let k = 0; k < n - 2; k++) {
        const rasioAktual = bobot[k] / bobot[k + 2];
        const rasioTarget = phi[k] * phi[k + 1];
        deviasiMaks = Math.max(deviasiMaks, Math.abs(rasioAktual - rasioTarget));
    }

    return deviasiMaks;
}

function hitungFUCOM(kriteriaOrder, comparisonValues) {
    const phi = comparisonValues;

    validasiMasukan(kriteriaOrder, phi);

    const n = kriteriaOrder.length;

    // rasio[k] = w_1 / w_(k+1) = φ1 · φ2 · ... · φk
    const rasio = [1];
    for (let k = 1; k < n; k++) {
        rasio.push(rasio[k - 1] * phi[k - 1]);
    }

    // Bobot mentah proporsional dengan 1 / rasio, lalu dinormalisasi sehingga jumlahnya 1.
    const mentah = rasio.map(function (r) { return 1 / r; });
    const total = mentah.reduce(function (a, b) { return a + b; }, 0);
    const bobot = mentah.map(function (w) { return w / total; });

    // Dibulatkan agar sisa galat floating point (~1e-16) tidak tampil sebagai angka aneh.
    const dfc = Number(hitungDFC(bobot, phi).toFixed(PEMBULATAN_DFC));

    const hasilBobot = kriteriaOrder.map(function (k, idx) {
        return {
            id_kriteria: k.id_kriteria,
            nama_kriteria: k.nama,
            bobot: bobot[idx]
        };
    });

    return { bobot: hasilBobot, dfc: dfc };
}

/**
 * Agregasi bobot dari N responden (minimal 2) menggunakan rata-rata geometris tertimbang.
 * Pengaruh tiap responden = kebalikan DFC-nya (semakin konsisten, semakin dipercaya).
 *
 * CATATAN: pembobotan sekarang memakai 1 responden saja, jadi fungsi ini tidak dipakai
 * oleh fucomController. Hapus jika memang tidak dipakai di tempat lain.
 *
 * @param {Array} semuaHasilResponden - [{ dfc, bobot: [{ id_kriteria, nama_kriteria, bobot }, ...] }, ...]
 */
function agregasiBobot(semuaHasilResponden) {
    if (!Array.isArray(semuaHasilResponden) || semuaHasilResponden.length < 2) {
        throw new Error('Agregasi bobot membutuhkan minimal 2 responden.');
    }

    const EPSILON = 0.0001;

    const bobotPengaruh = semuaHasilResponden.map(function (r) { return 1 / ((r.dfc || 0) + EPSILON); });
    const totalPengaruh = bobotPengaruh.reduce(function (a, b) { return a + b; }, 0);
    const bobotPengaruhNormal = bobotPengaruh.map(function (b) { return b / totalPengaruh; });

    const peta = {};
    semuaHasilResponden.forEach(function (responden, idx) {
        responden.bobot.forEach(function (item) {
            if (!peta[item.id_kriteria]) {
                peta[item.id_kriteria] = { nama_kriteria: item.nama_kriteria, nilaiTertimbang: [] };
            }
            peta[item.id_kriteria].nilaiTertimbang.push({
                nilai: item.bobot,
                pengaruh: bobotPengaruhNormal[idx]
            });
        });
    });

    const hasil = Object.keys(peta).map(function (id) {
        const d = peta[id];
        // Rata-rata geometris tertimbang: exp( sum( pengaruh_i * ln(nilai_i) ) )
        const logSum = d.nilaiTertimbang.reduce(function (sum, item) {
            return sum + item.pengaruh * Math.log(item.nilai);
        }, 0);
        return { id_kriteria: parseInt(id, 10), nama_kriteria: d.nama_kriteria, bobot: Math.exp(logSum) };
    });

    const total = hasil.reduce(function (s, i) { return s + i.bobot; }, 0);
    return hasil.map(function (i) { return Object.assign({}, i, { bobot: i.bobot / total }); });
}

module.exports = { hitungFUCOM, hitungDFC, agregasiBobot };