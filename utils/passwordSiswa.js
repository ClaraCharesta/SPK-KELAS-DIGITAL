const crypto = require('crypto');

// Tanpa karakter yang mirip: 0, O, o, 1, l, I
const HURUF = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const ANGKA = '23456789';
const PANJANG = 8;

function acakDari(set) {
    return set[crypto.randomInt(0, set.length)];
}

// Password acak 8 karakter (pasti ada huruf dan angka), memakai crypto.randomInt
function generatePasswordAcak() {
    const semua = HURUF + ANGKA;
    const hasil = [acakDari(HURUF), acakDari(ANGKA)];

    while (hasil.length < PANJANG) {
        hasil.push(acakDari(semua));
    }

    // acak urutan (Fisher-Yates dengan crypto)
    for (let i = hasil.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
    }

    return hasil.join('');
}

module.exports = { generatePasswordAcak };