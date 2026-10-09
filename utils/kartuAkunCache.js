const crypto = require('crypto');

// Menyimpan data kartu akun (termasuk password plaintext) HANYA di memori server,
// sementara waktu, dan hanya bisa diambil SATU kali oleh pengguna yang membuatnya.
const TTL_MS = 15 * 60 * 1000; // 15 menit
const store = new Map();

function bersihkan() {
    const sekarang = Date.now();
    for (const [token, entri] of store) {
        if (entri.expires < sekarang) store.delete(token);
    }
}

const timer = setInterval(bersihkan, 60 * 1000);
if (timer.unref) timer.unref();

function simpan(userId, items) {
    const token = crypto.randomBytes(24).toString('hex');
    store.set(token, { userId, items, expires: Date.now() + TTL_MS });
    return token;
}

// Mengembalikan items lalu menghapusnya (sekali pakai). null jika tidak valid.
function ambilSekali(token, userId) {
    const entri = store.get(token);
    if (!entri) return null;

    store.delete(token);

    if (entri.expires < Date.now()) return null;
    if (entri.userId !== userId) return null;

    return entri.items;
}

module.exports = { simpan, ambilSekali };