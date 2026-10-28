// Pengaturan batas waktu sesi untuk SEMUA aktor.
// Nilai bisa diubah lewat file .env tanpa mengubah kode.
//
// - Idle timeout     : sesi berakhir jika tidak ada aktivitas selama X menit.
// - Absolute timeout : sesi berakhir X jam setelah login, seberapa aktif pun pengguna.
//
// Dua kelompok:
//   siswa -> login lewat session key req.session.siswa
//   staf  -> admin, operator, kepsek (login lewat session key req.session.user)

function angkaPositif(nilai, bawaan) {
    const n = Number(nilai);
    return n > 0 ? n : bawaan;
}

function buatKonfigurasi(idleMenit, absolutJam, peringatanDetik) {
    return {
        idleMenit,
        idleMs: idleMenit * 60 * 1000,
        absolutJam,
        absolutMs: absolutJam * 60 * 60 * 1000,
        peringatanDetik,
        peringatanMs: peringatanDetik * 1000
    };
}

const SISWA_IDLE_MENIT = angkaPositif(process.env.SISWA_IDLE_MENIT, 15);
const SISWA_ABSOLUT_JAM = angkaPositif(process.env.SISWA_ABSOLUT_JAM, 8);
const SISWA_PERINGATAN_DETIK = angkaPositif(process.env.SISWA_PERINGATAN_DETIK, 60);

const STAF_IDLE_MENIT = angkaPositif(process.env.STAF_IDLE_MENIT, 30);
const STAF_ABSOLUT_JAM = angkaPositif(process.env.STAF_ABSOLUT_JAM, 8);
const STAF_PERINGATAN_DETIK = angkaPositif(process.env.STAF_PERINGATAN_DETIK, 60);

module.exports = {
    // Cara baru (dipakai middleware generik)
    KONFIGURASI: {
        siswa: buatKonfigurasi(SISWA_IDLE_MENIT, SISWA_ABSOLUT_JAM, SISWA_PERINGATAN_DETIK),
        staf: buatKonfigurasi(STAF_IDLE_MENIT, STAF_ABSOLUT_JAM, STAF_PERINGATAN_DETIK)
    },

    // Nama lama dipertahankan supaya kode siswa yang sudah ada tidak rusak
    SISWA_IDLE_MENIT,
    SISWA_IDLE_MS: SISWA_IDLE_MENIT * 60 * 1000,

    SISWA_ABSOLUT_JAM,
    SISWA_ABSOLUT_MS: SISWA_ABSOLUT_JAM * 60 * 60 * 1000,

    SISWA_PERINGATAN_MS: SISWA_PERINGATAN_DETIK * 1000,

    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || 'connect.sid'
};