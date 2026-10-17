require('dotenv').config();
const pengingatModel = require('./models/pengingatModel');
const pengingatService = require('./services/pengingatService');

(async () => {
    try {
        const daftar = await pengingatModel.getPeriodeAktifKedaluwarsa();
        console.log('Periode aktif yang kedaluwarsa:', daftar);

        const jumlah = await pengingatService.tutupPeriodeKedaluwarsa();
        console.log('Jumlah periode yang ditutup:', jumlah);
    } catch (e) {
        console.error('ERROR:', e);
    }
    process.exit(0);
})();