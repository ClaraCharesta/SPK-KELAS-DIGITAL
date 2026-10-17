const cron = require('node-cron');
const periodeModel = require('../models/periodeModel');
const waspasModel = require('../models/waspasModel');
const pengingatModel = require('../models/pengingatModel');
const { sendPengingatPeriodeEmail } = require('../utils/pengingatMailer');

// Sisa hari berapa saja email dikirim. 0 = hari terakhir periode (berakhir hari ini).
// Ubah sesuka hati, contoh: [7, 3, 2, 1, 0]
const HARI_PENGINGAT = [7, 6, 5, 4, 3, 2, 1, 0];

const PESAN_PER_ROLE = {
    superadmin: {
        peran: 'Super Admin',
        tugas: [
            'Ingatkan Operator agar data siswa dan nilai segera dilengkapi.',
            'Pastikan pembobotan FUCOM dan perankingan WASPAS sudah dijalankan sebelum periode berakhir.',
            'Jika memang butuh waktu lebih, kamu bisa memperpanjang tanggal periode lewat menu Kelola Periode.'
        ]
    },
    operator: {
        peran: 'Operator',
        tugas: [
            'Lengkapi data siswa dan nilai siswa pada periode ini.',
            'Jalankan perankingan sebelum periode berakhir.',
            'Setelah periode berakhir, akun siswa dinonaktifkan dan periode ditutup otomatis.'
        ]
    },
    kepsek: {
        peran: 'Kepala Sekolah',
        tugas: [
            'Mohon ingatkan guru/operator agar data siswa dan nilai segera dilengkapi.',
            'Pastikan proses seleksi dan perankingan selesai sebelum periode berakhir.'
        ]
    }
};

// Dipakai kalau nilai role di database tidak dikenali, supaya user TIDAK dilewati diam-diam.
const PESAN_DEFAULT = {
    peran: 'Pengguna Sistem',
    tugas: [
        'Pastikan data siswa dan nilai pada periode ini sudah lengkap.',
        'Pastikan proses seleksi dan perankingan selesai sebelum periode berakhir.'
    ]
};

// Nama lain dari tiap role (setelah dinormalisasi: huruf kecil, tanpa spasi/underscore/strip).
const ALIAS_ROLE = {
    superadmin: 'superadmin',
    superadministrator: 'superadmin',
    admin: 'superadmin',
    administrator: 'superadmin',
    operator: 'operator',
    guru: 'operator',
    kepsek: 'kepsek',
    kepalasekolah: 'kepsek'
};

function ambilPesanRole(role) {
    const norm = String(role || '').toLowerCase().replace(/[^a-z]/g, '');
    const kunci = ALIAS_ROLE[norm];
    if (kunci && PESAN_PER_ROLE[kunci]) {
        return PESAN_PER_ROLE[kunci];
    }
    console.warn(`[PENGINGAT] Role "${role}" tidak dikenali, memakai pesan umum.`);
    return PESAN_DEFAULT;
}

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function tanggalKeString(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
    }
    return String(val).split('T')[0];
}

function formatTanggalIndo(val) {
    const str = tanggalKeString(val);
    if (!str) return '-';
    const [y, m, d] = str.split('-');
    return `${parseInt(d)} ${BULAN[parseInt(m) - 1]} ${y}`;
}

function jeda(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Menutup otomatis semua periode aktif yang tanggal selesainya sudah lewat.
// Data TIDAK dihapus; hanya status ditutup dan akun siswa dinonaktifkan.
async function tutupPeriodeKedaluwarsa() {
    const daftar = await pengingatModel.getPeriodeAktifKedaluwarsa();
    if (daftar.length === 0) return 0;

    for (const p of daftar) {
        await periodeModel.tutupManual(p.id_periode);
        console.log(`[PERIODE] Periode ${p.tahun_ajaran} (ID ${p.id_periode}) ditutup otomatis karena kedaluwarsa.`);
    }

    const dinonaktifkan = await periodeModel.nonaktifkanAkunPeriodeDitutup();
    console.log(`[PERIODE] ${dinonaktifkan} akun siswa dinonaktifkan karena periode kedaluwarsa.`);
    return daftar.length;
}

let sedangKirim = false;

// Aman dipanggil berkali-kali (tiap jam, saat server nyala, setelah admin ubah periode).
// Tiap user tetap hanya menerima MAKSIMAL 1 email per periode per hari
// karena dijaga UNIQUE key di tabel pengingat_periode.
async function kirimPengingatHarian() {
    if (sedangKirim) {
        console.log('[PENGINGAT] Pengecekan sebelumnya masih berjalan, dilewati.');
        return;
    }
    sedangKirim = true;

    try {
        await pengingatModel.buatTabelJikaBelum();

        const minHari = Math.min(...HARI_PENGINGAT);
        const maxHari = Math.max(...HARI_PENGINGAT);

        const periodeList = await pengingatModel.getPeriodeUntukPengingat(minHari, maxHari);
        console.log(`[PENGINGAT] Periode dalam rentang pengingat: ${periodeList.length}`);
        if (periodeList.length === 0) {
            console.log('[PENGINGAT] Tidak ada periode aktif yang sudah mulai, belum selesai, dan sisa harinya masuk rentang.');
            return;
        }

        const penerima = await pengingatModel.getPenerima();
        console.log(`[PENGINGAT] Akun aktif ber-email: ${penerima.length}`);
        if (penerima.length === 0) {
            console.log('[PENGINGAT] Tidak ada akun aktif yang punya email.');
            return;
        }

        let terkirim = 0;
        let sudahTerkirim = 0;
        let gagal = 0;

        for (const p of periodeList) {
            const sisaHari = Number(p.sisa_hari);

            if (!HARI_PENGINGAT.includes(sisaHari)) {
                console.log(`[PENGINGAT] Periode ${p.tahun_ajaran}: sisa ${sisaHari} hari tidak ada di HARI_PENGINGAT, dilewati.`);
                continue;
            }

            // Kalau hasil seleksi sudah final, tidak perlu mengingatkan lagi.
            if (await waspasModel.isFinal(p.id_periode)) {
                console.log(`[PENGINGAT] Periode ${p.tahun_ajaran}: hasil seleksi sudah final, dilewati.`);
                continue;
            }

            for (const u of penerima) {
                const cfg = ambilPesanRole(u.role);

                // Cegah email dobel di hari yang sama (cek tiap jam, restart server, dll).
                const berhasilKlaim = await pengingatModel.klaimPengingat(p.id_periode, u.id_user, sisaHari);
                if (!berhasilKlaim) {
                    sudahTerkirim++;
                    console.log(`[PENGINGAT] ${u.email}: hari ini sudah pernah dikirim, dilewati.`);
                    continue;
                }

                try {
                    await sendPengingatPeriodeEmail(u.email, u.nama, {
                        tahunAjaran: p.tahun_ajaran,
                        tanggalSelesaiText: formatTanggalIndo(p.tanggal_selesai),
                        sisaHari,
                        peran: cfg.peran,
                        tugas: cfg.tugas,
                        linkApp: process.env.APP_URL || ''
                    });
                    terkirim++;
                    console.log(`[PENGINGAT] Terkirim ke ${u.email} (${cfg.peran}), H-${sisaHari}.`);
                } catch (err) {
                    // Gagal kirim: batalkan klaim supaya dicoba lagi di pengecekan berikutnya.
                    gagal++;
                    await pengingatModel.batalkanKlaim(p.id_periode, u.id_user);
                    console.error(`[PENGINGAT] GAGAL kirim ke ${u.email}:`, err.message);
                }

                await jeda(500); // beri jeda antar email
            }
        }

        console.log(`[PENGINGAT] Selesai. Terkirim: ${terkirim}, sudah dikirim sebelumnya: ${sudahTerkirim}, gagal: ${gagal}.`);
    } catch (error) {
        console.error('[PENGINGAT] Error:', error);
    } finally {
        sedangKirim = false;
    }
}

let sudahJalan = false;

function mulaiJadwal() {
    if (sudahJalan) return;
    sudahJalan = true;

    console.log('[PENGINGAT] Jadwal pengingat dan penutupan otomatis diaktifkan.');

    // Tutup periode kedaluwarsa setiap hari pukul 00:05 WIB
    cron.schedule('5 0 * * *', async () => {
        try { await tutupPeriodeKedaluwarsa(); }
        catch (e) { console.error('[PERIODE] Gagal tutup otomatis:', e); }
    }, { timezone: 'Asia/Jakarta' });

    // Cek pengingat SETIAP JAM (menit ke-0). Email pertama hari itu terkirim di jam pengecekan
    // pertama yang menemukan periode di rentang pengingat; pengecekan berikutnya tidak mengirim dobel.
    cron.schedule('0 * * * *', () => { kirimPengingatHarian(); }, { timezone: 'Asia/Jakarta' });

    // Catch-up saat server baru menyala (aman, karena ada log anti-dobel)
    setTimeout(async () => {
        try { await tutupPeriodeKedaluwarsa(); } catch (e) { console.error(e); }
        kirimPengingatHarian();
    }, 10000);
}

module.exports = { mulaiJadwal, tutupPeriodeKedaluwarsa, kirimPengingatHarian };