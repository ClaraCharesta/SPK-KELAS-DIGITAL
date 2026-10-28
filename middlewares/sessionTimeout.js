const cfg = require('../config/sessionConfig');

function hitungStatus(data, konfig) {
    if (!data) return null;

    const sekarang = Date.now();

    const loginAt = Number(data.loginAt);
    if (loginAt && (sekarang - loginAt) > konfig.absolutMs) {
        return 'absolut';
    }

    const terakhir = Number(data.lastActivity);
    if (terakhir && (sekarang - terakhir) > konfig.idleMs) {
        return 'idle';
    }

    return null;
}

function statusSesiSiswa(dataSiswa) {
    return hitungStatus(dataSiswa, cfg.KONFIGURASI.siswa);
}

function statusSesiStaf(dataUser) {
    return hitungStatus(dataUser, cfg.KONFIGURASI.staf);
}

function pesanTimeout(alasan, tipe) {
    const k = tipe === 'staf' ? cfg.KONFIGURASI.staf : cfg.KONFIGURASI.siswa;

    if (alasan === 'absolut') {
        return `Sesi login Anda sudah mencapai batas maksimal ${k.absolutJam} jam. Silakan login kembali.`;
    }
    return `Sesi Anda berakhir otomatis karena tidak ada aktivitas selama ${k.idleMenit} menit. Silakan login kembali.`;
}

function setNoCache(res) {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
}

function permintaanAjax(req) {
    return Boolean(
        req.xhr ||
        String(req.originalUrl || '').indexOf('/sesi/') !== -1 ||
        String(req.get('Accept') || '').indexOf('application/json') !== -1
    );
}

function akhiriSesi(req, res, alasan, tipe) {
    const tujuan = '/login?timeout=' + alasan + (tipe === 'staf' ? '&tipe=staf' : '');
    const ajax = permintaanAjax(req);

    return req.session.destroy(function () {
        res.clearCookie(cfg.SESSION_COOKIE_NAME);

        if (ajax) {
            return res.status(401).json({ expired: true, alasan: alasan, redirect: tujuan });
        }
        return res.redirect(tujuan);
    });
}

function isiLocals(res, data, konfig, pingUrl) {
    res.locals.sesiIdleMs = konfig.idleMs;
    res.locals.sesiPeringatanMs = konfig.peringatanMs;
    res.locals.sesiAbsolutJam = konfig.absolutJam;
    res.locals.sesiSisaAbsolutMs = Math.max(0, Number(data.loginAt) + konfig.absolutMs - Date.now());
    res.locals.sesiPingUrl = pingUrl;
    res.locals.sesiLogoutUrl = '/logout';
}


function siswaIdleTimeout(req, res, next) {
    setNoCache(res);

    if (!req.session || !req.session.siswa) {
        return next();
    }

    const konfig = cfg.KONFIGURASI.siswa;
    const alasan = hitungStatus(req.session.siswa, konfig);

    if (alasan) {
        return akhiriSesi(req, res, alasan, 'siswa');
    }

    const sekarang = Date.now();


    if (!req.session.siswa.loginAt) {
        req.session.siswa.loginAt = sekarang;
    }

    req.session.siswa.lastActivity = sekarang;

    isiLocals(res, req.session.siswa, konfig, '/siswa/sesi/ping');

    res.locals.siswaIdleMs = konfig.idleMs;
    res.locals.siswaPeringatanMs = konfig.peringatanMs;
    res.locals.siswaAbsolutJam = konfig.absolutJam;
    res.locals.siswaSisaAbsolutMs = res.locals.sesiSisaAbsolutMs;

    next();
}


function userIdleTimeout(req, res, next) {
    if (!req.session || !req.session.user) {
        return next();
    }

    setNoCache(res);

    if (req.path === '/logout' || req.path === '/login') {
        return next();
    }

    const konfig = cfg.KONFIGURASI.staf;
    const alasan = hitungStatus(req.session.user, konfig);

    if (alasan) {
        return akhiriSesi(req, res, alasan, 'staf');
    }

    const sekarang = Date.now();

    
    if (!req.session.user.loginAt) {
        req.session.user.loginAt = sekarang;
    }

    req.session.user.lastActivity = sekarang;

    isiLocals(res, req.session.user, konfig, '/sesi/ping');

    next();
}

function pingSesi(req, res) {
    const adaSiswa = Boolean(req.session && req.session.siswa);
    const data = adaSiswa ? req.session.siswa : (req.session && req.session.user);

    if (!data) {
        return res.status(401).json({ expired: true, alasan: 'idle', redirect: '/login' });
    }

    const konfig = adaSiswa ? cfg.KONFIGURASI.siswa : cfg.KONFIGURASI.staf;
    const sisaAbsolutMs = Math.max(0, Number(data.loginAt) + konfig.absolutMs - Date.now());

    res.json({ ok: true, sisaAbsolutMs: sisaAbsolutMs });
}

module.exports = {
    siswaIdleTimeout,
    userIdleTimeout,
    pingSesi,
    statusSesiSiswa,
    statusSesiStaf,
    pesanTimeout
};