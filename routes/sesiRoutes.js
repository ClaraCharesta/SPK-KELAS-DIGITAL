const express = require('express');
const router = express.Router();
const cfg = require('../config/sessionConfig');

// Middleware siswaIdleTimeout sudah memperbarui lastActivity sebelum sampai ke sini.
// Kalau sesi sudah habis (idle atau absolute), middleware itu sudah membalas 401 lebih dulu.
router.post('/ping', (req, res) => {
    if (!req.session || !req.session.siswa) {
        return res.status(401).json({ expired: true, alasan: 'idle', redirect: '/login?timeout=idle' });
    }

    const loginAt = Number(req.session.siswa.loginAt) || Date.now();
    const sisaAbsolutMs = Math.max(0, loginAt + cfg.SISWA_ABSOLUT_MS - Date.now());

    res.json({
        ok: true,
        batasIdleMs: cfg.SISWA_IDLE_MS,
        sisaAbsolutMs: sisaAbsolutMs
    });
});

module.exports = router;