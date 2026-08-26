/**
 * Hitung WASPAS untuk seluruh siswa, LENGKAP dengan detail tiap tahap
 * (Matrix Keputusan, Matrix Ternormalisasi, kontribusi WSM & WPM per kriteria).
 *
 * @param {Array} siswaData   - array {id_siswa, nama, nilai: {id_kriteria: nilai_mentah, ...}}
 * @param {Array} kriteriaList - array {id_kriteria, nama_kriteria?, jenis: 'benefit'|'cost'}
 * @param {Array} bobotList   - array {id_kriteria, nilai_bobot}
 * @param {number} lambda     - parameter penyeimbang WSM-WPM, default 0.5
 *
 * @returns {Object} {
 *   lambda,
 *   kriteriaList,
 *   bobotMap,        // { id_kriteria: bobot }
 *   maxNilai,        // { id_kriteria: nilai_max }
 *   minNilai,        // { id_kriteria: nilai_min }
 *   matrixKeputusan, // [{ id_siswa, nama, nilai: { id_kriteria: nilai } }]
 *   matrixNormalisasi, // [{ id_siswa, nama, normalisasi: { id_kriteria: r } }]
 *   hasil            // [{ id_siswa, nama, wsm, wpm, q, ranking, detailKriteria: { id_kriteria: {nilaiNormalisasi, bobot, kontribusiWSM, kontribusiWPM} } }]
 * }
 */
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
            detailKriteria
        };
    });

    // ================================================================
    // Langkah 6: Urutkan berdasarkan Q tertinggi -> ranking
    // ================================================================
    hasil.sort((a, b) => b.q - a.q);
    hasil.forEach((item, idx) => { item.ranking = idx + 1; });

    return {
        lambda,
        kriteriaList,
        bobotMap,
        maxNilai,
        minNilai,
        matrixKeputusan,
        matrixNormalisasi,
        hasil
    };
}

module.exports = { hitungWASPAS };
