const db = require('../config/database');

// Ambang konsistensi FUCOM (sama dengan fucomController).
const DFC_THRESHOLD = 0.1;

// Bobot dianggap FINAL jika sudah dihitung DAN konsisten (DFC < 0,1).
async function cekBobotFinal(id_periode) {
    const [[r]] = await db.query(
        'SELECT COUNT(*) AS jumlah, MAX(nilai_dfc) AS dfc FROM bobot_kriteria WHERE id_periode = ?',
        [id_periode]
    );

    if (!r || Number(r.jumlah) === 0) return false;
    if (r.dfc === null || r.dfc === undefined) return false;

    return parseFloat(r.dfc) < DFC_THRESHOLD;
}

module.exports = { cekBobotFinal, DFC_THRESHOLD };