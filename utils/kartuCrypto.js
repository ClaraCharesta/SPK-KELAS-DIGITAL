
const crypto = require('crypto');

// Kunci harus 32 byte atau 64 karakter hex dari file .env
const keyHex = process.env.KARTU_KEY || '';

if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
        '[kartuCrypto] KARTU_KEY tidak valid. ' +
        'Buat kunci dengan perintah: openssl rand -hex 32'
    );
}

const KEY = Buffer.from(keyHex, 'hex');

function enkripsi(teks) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);

    const enc = Buffer.concat([
        cipher.update(String(teks), 'utf8'),
        cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    return [iv, tag, enc]
        .map(b => b.toString('base64'))
        .join('.');
}

function dekripsi(teksTerenkripsi) {
    const bagian = String(teksTerenkripsi).split('.');

    if (bagian.length !== 3 || bagian.some(b => !b)) {
        throw new Error('Format teks terenkripsi tidak valid.');
    }

    const [iv, tag, enc] = bagian.map(b =>
        Buffer.from(b, 'base64')
    );

    if (iv.length !== 12 || tag.length !== 16) {
        throw new Error('Data enkripsi tidak valid.');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        KEY,
        iv
    );

    decipher.setAuthTag(tag);

    return Buffer.concat([
        decipher.update(enc),
        decipher.final()
    ]).toString('utf8');
}

module.exports = { enkripsi, dekripsi };

