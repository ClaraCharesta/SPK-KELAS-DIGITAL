// Pengaturan batas waktu sesi siswa.
// Nilai bisa diubah lewat file .env tanpa mengubah kode.
//
// - Idle timeout     : sesi berakhir jika tidak ada aktivitas selama X menit.
// - Absolute timeout : sesi berakhir X jam setelah login, seberapa aktif pun siswa.

const menitEnv = Number(process.env.SISWA_IDLE_MENIT);
const jamEnv = Number(process.env.SISWA_ABSOLUT_JAM);
const peringatanEnv = Number(process.env.SISWA_PERINGATAN_DETIK);

const SISWA_IDLE_MENIT = menitEnv > 0 ? menitEnv : 15;
const SISWA_ABSOLUT_JAM = jamEnv > 0 ? jamEnv : 8;
const SISWA_PERINGATAN_DETIK = peringatanEnv > 0 ? peringatanEnv : 60;

module.exports = {
    SISWA_IDLE_MENIT,
    SISWA_IDLE_MS: SISWA_IDLE_MENIT * 60 * 1000,

    SISWA_ABSOLUT_JAM,
    SISWA_ABSOLUT_MS: SISWA_ABSOLUT_JAM * 60 * 60 * 1000,

    SISWA_PERINGATAN_MS: SISWA_PERINGATAN_DETIK * 1000,

    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || 'connect.sid'
};