const bcrypt = require('bcrypt');
const akunSiswaModel = require('../models/akunSiswaModel');
const waspasModel = require('../models/waspasModel');
const userModel = require('../models/userModel');
const { generatePasswordAcak } = require('./passwordSiswa');

const BCRYPT_ROUNDS = 10;
const HASH_CONCURRENCY = 4;

async function hashDenganBatas(daftar) {
    const hasil = [];

    for (let i = 0; i < daftar.length; i += HASH_CONCURRENCY) {
        const potongan = daftar.slice(i, i + HASH_CONCURRENCY);

        const dihash = await Promise.all(
            potongan.map(async (item) => ({
                ...item,
                passwordHash: await bcrypt.hash(item.password, BCRYPT_ROUNDS)
            }))
        );

        hasil.push(...dihash);
    }

    return hasil;
}

/**
 * Membuat akun untuk SEMUA siswa yang belum punya akun (sekali klik).
 * - Password login disimpan sebagai hash.
 * - Password awal untuk kartu disimpan terenkripsi dalam transaksi yang sama.
 * - Siswa yang sudah punya nilai otomatis berstatus berminat.
 */
async function generateAkunUntukPeriode(id_periode, pelaku) {
    if (await waspasModel.isFinal(id_periode)) {
        throw new Error('Hasil seleksi sudah difinalisasi. Akun baru tidak dapat dibuat.');
    }

    const totalSiswa = await akunSiswaModel.hitungSiswaPeriode(id_periode);
    const belumPunya = await akunSiswaModel.getSiswaTanpaAkun(id_periode);

    const siap = [];
    const gagal = [];

    for (const s of belumPunya) {
        const nisn = String(s.nisn === null || s.nisn === undefined ? '' : s.nisn).trim();

        if (!nisn) {
            gagal.push({ nama: s.nama, nisn: '', alasan: 'NISN kosong' });
            continue;
        }

        if (nisn.length > 20) {
            gagal.push({ nama: s.nama, nisn, alasan: 'NISN lebih dari 20 karakter' });
            continue;
        }

        siap.push({
            id_siswa: s.id_siswa,
            nama: s.nama,
            nisn,
            password: generatePasswordAcak()
        });
    }

    const dihash = await hashDenganBatas(siap);

    const dibuat = await akunSiswaModel.createBulk(
        dihash.map((d) => ({
            id_siswa: d.id_siswa,
            username: d.nisn,
            passwordHash: d.passwordHash,
            passwordAwal: d.password
        }))
    );

    // Siswa yang nilainya sudah diisi operator sebelum akun ada => berminat.
    const otomatisBerminat = await akunSiswaModel.syncMinatDariNilai(id_periode);

    if (otomatisBerminat > 0) {
        await waspasModel.invalidateHasilJikaAda(id_periode);
    }

    if (dihash.length > 0 && pelaku) {
        await userModel.logActivity(
            pelaku.id_user,
            `${pelaku.nama} membuat ${dibuat} akun siswa untuk periode ID ${id_periode}`
        );
    }

    return {
        dibuat,
        dilewati: totalSiswa - belumPunya.length,
        gagal,
        otomatisBerminat
    };
}

/**
 * Reset password satu siswa. Password baru bisa dicetak di kartu.
 * Status akun TIDAK diubah (hanya wajib_ganti_password = 1).
 */
async function resetPasswordSiswa(id_siswa, pelaku) {
    const detail = await akunSiswaModel.findByIdSiswa(id_siswa);

    if (!detail) return null;

    if (await waspasModel.isFinal(detail.id_periode)) {
        return { error: 'Hasil seleksi sudah difinalisasi. Password tidak dapat direset.' };
    }

    if (detail.status_akun === 'nonaktif') {
        return { error: 'Akun nonaktif (siswa menyatakan tidak berminat), tidak dapat direset.' };
    }

    const passwordBaru = generatePasswordAcak();
    const hash = await bcrypt.hash(passwordBaru, BCRYPT_ROUNDS);

    await akunSiswaModel.updatePassword(id_siswa, hash);
    await akunSiswaModel.simpanPasswordAwal(id_siswa, passwordBaru);

    if (pelaku) {
        await userModel.logActivity(
            pelaku.id_user,
            `${pelaku.nama} mereset password akun siswa: ${detail.nama}`
        );
    }

    return {
        id_siswa: detail.id_siswa,
        nama: detail.nama,
        nisn: detail.nisn,
        passwordBaru
    };
}

// Ringkasan untuk flash message.
function buatFlash(hasil) {
    return {
        tipe: 'sukses',
        dibuat: hasil.dibuat,
        dilewati: hasil.dilewati,
        gagal: hasil.gagal.slice(0, 20),
        jumlahGagal: hasil.gagal.length,
        otomatisBerminat: hasil.otomatisBerminat || 0
    };
}

module.exports = {
    generateAkunUntukPeriode,
    resetPasswordSiswa,
    buatFlash
};