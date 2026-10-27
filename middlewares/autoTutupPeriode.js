const periodeModel = require('../models/periodeModel');

const JEDA_MS = 60 * 1000;
let terakhirCek = 0;

function hariIniString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

module.exports = async function autoTutupPeriode(req, res, next) {
    const sekarang = Date.now();

    if (sekarang - terakhirCek >= JEDA_MS) {
        terakhirCek = sekarang;
        try {
            const ditutup = await periodeModel.tutupPeriodeKedaluwarsa(hariIniString());
            const dinonaktifkan = await periodeModel.nonaktifkanAkunPeriodeDitutup();

            if (ditutup > 0 || dinonaktifkan > 0) {
                console.log(`[PERIODE] Ditutup: ${ditutup} periode, akun dinonaktifkan: ${dinonaktifkan}`);
            }
        } catch (e) {
            console.error('[PERIODE] Gagal menutup periode kedaluwarsa:', e);
        }
    }

    next();
};