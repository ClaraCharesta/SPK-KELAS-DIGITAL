const cfg = require('../config/sessionConfig');

// Mengembalikan:
//   'absolut' -> umur sesi sudah melewati batas maksimal sejak login
//   'idle'    -> tidak ada aktivitas lebih lama dari batas idle
//   null      -> sesi masih sah
// Absolute dicek lebih dulu karena sifatnya lebih tegas.
// Sesi lama yang belum punya loginAt / lastActivity dianggap masih sah.
function statusSesiSiswa(dataSiswa) {
    if (!dataSiswa) return null;

    const sekarang = Date.now();

    const loginAt = Number(dataSiswa.loginAt);
    if (loginAt && (sekarang - loginAt) > cfg.SISWA_ABSOLUT_MS) {
        return 'absolut';
    }

    const terakhir = Number(dataSiswa.lastActivity);
    if (terakhir && (sekarang - terakhir) > cfg.SISWA_IDLE_MS) {
        return 'idle';
    }

    return null;
}

// Teks pesan di halaman login sesuai alasan sesi berakhir.
function pesanTimeout(alasan) {
    if (alasan === 'absolut') {
        return `Sesi login Anda sudah mencapai batas maksimal ${cfg.SISWA_ABSOLUT_JAM} jam. Silakan login kembali.`;
    }
    return `Sesi Anda berakhir otomatis karena tidak ada aktivitas selama ${cfg.SISWA_IDLE_MENIT} menit. Silakan login kembali.`;
}

// Dipasang di app.use('/siswa', ...) sebelum route siswa.
// - Halaman siswa tidak boleh disimpan di cache (supaya tombol Back tidak menampilkan halaman lama setelah logout).
// - Jika sesi melewati batas idle atau absolute: sesi dihapus, lalu diarahkan ke login.
// - Jika masih sah: lastActivity diperbarui (setiap request ke /siswa dihitung sebagai aktivitas).
//   loginAt TIDAK pernah diperbarui di sini, itulah yang membuat absolute timeout tidak bisa diperpanjang.
function siswaIdleTimeout(req, res, next) {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

    if (!req.session || !req.session.siswa) {
        return next();
    }

    const alasan = statusSesiSiswa(req.session.siswa);

    if (alasan) {
        const permintaanAjax =
            req.xhr ||
            req.path.indexOf('/sesi/') === 0 ||
            String(req.get('Accept') || '').indexOf('application/json') !== -1;

        return req.session.destroy(function () {
            res.clearCookie(cfg.SESSION_COOKIE_NAME);

            const tujuan = '/login?timeout=' + alasan;

            if (permintaanAjax) {
                return res.status(401).json({ expired: true, alasan: alasan, redirect: tujuan });
            }
            return res.redirect(tujuan);
        });
    }

    const sekarang = Date.now();

    // Sesi lama (dibuat sebelum fitur ini ada) belum punya loginAt: mulai hitung dari sekarang.
    if (!req.session.siswa.loginAt) {
        req.session.siswa.loginAt = sekarang;
    }

    req.session.siswa.lastActivity = sekarang;

    // Dipakai oleh partial siswa-idle.ejs
    res.locals.siswaIdleMs = cfg.SISWA_IDLE_MS;
    res.locals.siswaPeringatanMs = cfg.SISWA_PERINGATAN_MS;
    res.locals.siswaAbsolutJam = cfg.SISWA_ABSOLUT_JAM;
    res.locals.siswaSisaAbsolutMs = Math.max(
        0,
        req.session.siswa.loginAt + cfg.SISWA_ABSOLUT_MS - sekarang
    );

    next();
}

module.exports = { siswaIdleTimeout, statusSesiSiswa, pesanTimeout };