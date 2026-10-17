require('dotenv').config();
const pengingatModel = require('./models/pengingatModel');
const pengingatService = require('./services/pengingatService');

(async () => {
    try {
        console.log('EMAIL_USER terbaca:', process.env.EMAIL_USER ? 'YA' : 'TIDAK (cek file .env)');
        console.log('EMAIL_PASS terbaca:', process.env.EMAIL_PASS ? 'YA' : 'TIDAK (cek file .env)');

        await pengingatModel.buatTabelJikaBelum();

        // Kalau dijalankan dengan "--reset", catatan pengiriman hari ini dihapus
        // supaya email bisa dikirim ulang (khusus untuk tes).
        if (process.argv.includes('--reset')) {
            const dihapus = await pengingatModel.hapusKlaimHariIni();
            console.log(`Catatan pengiriman hari ini dihapus: ${dihapus} baris.`);
        }

        await pengingatService.kirimPengingatHarian();
    } catch (e) {
        console.error('ERROR:', e);
    }
    console.log('Selesai.');
    process.exit(0);
})();