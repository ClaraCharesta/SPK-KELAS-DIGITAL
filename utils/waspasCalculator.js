/**
 * Hitung WASPAS untuk seluruh siswa.
 * @param {Array} siswaData - array {id_siswa, nama, nilai: {id_kriteria: nilai_mentah, ...}}
 * @param {Array} kriteriaList - array {id_kriteria, jenis: 'benefit'|'cost'}
 * @param {Array} bobotList - array {id_kriteria, nilai_bobot}
 * @param {number} lambda - parameter penyeimbang WSM-WPM, default 0.5
 * @returns {Array} hasil per siswa: {id_siswa, wsm, wpm, q, ranking}
 */
function hitungWASPAS(siswaData, kriteriaList, bobotList, lambda = 0.5) {
    const bobotMap = {};
    bobotList.forEach(b => { bobotMap[b.id_kriteria] = parseFloat(b.nilai_bobot); });

    // Langkah 1: Cari nilai maksimum dan minimum tiap kriteria (untuk normalisasi)
    const maxNilai = {};
    const minNilai = {};
    kriteriaList.forEach(k => {
        const semuaNilai = siswaData
            .map(s => s.nilai[k.id_kriteria])
            .filter(v => v !== null && v !== undefined);
        maxNilai[k.id_kriteria] = semuaNilai.length > 0 ? Math.max(...semuaNilai) : 1;
        minNilai[k.id_kriteria] = semuaNilai.length > 0 ? Math.min(...semuaNilai) : 0;
    });

    // Langkah 2: Normalisasi, hitung WSM & WPM per siswa
    const hasil = siswaData.map(siswa => {
        let wsm = 0;
        let wpm = 1;

        kriteriaList.forEach(k => {
            const nilaiMentah = siswa.nilai[k.id_kriteria];
            const bobot = bobotMap[k.id_kriteria] || 0;

            // Kalau nilai kosong (belum diinput), anggap nilai netral (nilai tengah)
            const nilai = (nilaiMentah !== null && nilaiMentah !== undefined)
                ? nilaiMentah
                : (maxNilai[k.id_kriteria] + minNilai[k.id_kriteria]) / 2;

            let nilaiNormalisasi;
            if (k.jenis === 'benefit') {
                nilaiNormalisasi = maxNilai[k.id_kriteria] === 0 ? 0 : nilai / maxNilai[k.id_kriteria];
            } else {
                nilaiNormalisasi = nilai === 0 ? 0 : minNilai[k.id_kriteria] / nilai;
            }

            wsm += nilaiNormalisasi * bobot;
            wpm *= Math.pow(nilaiNormalisasi, bobot);
        });

        const q = (lambda * wsm) + ((1 - lambda) * wpm);

        return { id_siswa: siswa.id_siswa, nama: siswa.nama, wsm, wpm, q };
    });

    // Langkah 3: Urutkan berdasarkan nilai Q tertinggi, beri ranking
    hasil.sort((a, b) => b.q - a.q);
    hasil.forEach((item, idx) => { item.ranking = idx + 1; });

    return hasil;
}

module.exports = { hitungWASPAS };