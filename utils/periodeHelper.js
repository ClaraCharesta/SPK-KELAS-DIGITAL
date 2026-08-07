function isPeriodeSudahMulai(periode) {
    if (!periode) return false;
    if (!periode.tanggal_mulai) return true; // tanpa tanggal mulai, dianggap langsung berlaku

    const tglMulai = periode.tanggal_mulai instanceof Date ? periode.tanggal_mulai : new Date(periode.tanggal_mulai);
    const tglMulaiStr = tglMulai.toISOString().split('T')[0];

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    return tglMulaiStr <= todayStr;
}

function pesanBelumMulai(periode) {
    const tglMulai = periode.tanggal_mulai instanceof Date ? periode.tanggal_mulai : new Date(periode.tanggal_mulai);
    const [y, m, d] = tglMulai.toISOString().split('T')[0].split('-');
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const tglFormatted = `${parseInt(d)} ${bulan[parseInt(m) - 1]} ${y}`;
    return `Periode seleksi "${periode.tahun_ajaran}" belum aktif. Periode ini baru bisa digunakan mulai tanggal ${tglFormatted}.`;
}

module.exports = { isPeriodeSudahMulai, pesanBelumMulai };