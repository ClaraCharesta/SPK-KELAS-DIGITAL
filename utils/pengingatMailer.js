const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function esc(teks) {
    return String(teks == null ? '' : teks)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// data = { tahunAjaran, tanggalSelesaiText, sisaHari, peran, tugas: [string], linkApp }
async function sendPengingatPeriodeEmail(toEmail, namaUser, data) {
    const daftarTugas = data.tugas.map(t => `<li style="margin-bottom:6px;">${esc(t)}</li>`).join('');
    const tombolLink = data.linkApp
        ? `<p style="text-align:center; margin: 25px 0;">
               <a href="${esc(data.linkApp)}" style="display:inline-block; background:#2563eb; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:bold;">Buka Sistem</a>
           </p>`
        : '';

    const hariTerakhir = Number(data.sisaHari) === 0;

    const subject = hariTerakhir
        ? `[Pengingat HARI INI] Periode Seleksi ${data.tahunAjaran} berakhir hari ini`
        : `[Pengingat H-${data.sisaHari}] Periode Seleksi ${data.tahunAjaran} segera berakhir`;

    const kalimatWaktu = hariTerakhir
        ? `Periode seleksi <strong>${esc(data.tahunAjaran)}</strong> akan berakhir <strong>hari ini</strong>
           (<strong>${esc(data.tanggalSelesaiText)}</strong>). Setelah hari ini berlalu, periode ditutup otomatis dan akun siswa dinonaktifkan.`
        : `Periode seleksi <strong>${esc(data.tahunAjaran)}</strong> akan berakhir pada
           <strong>${esc(data.tanggalSelesaiText)}</strong> (<strong>${data.sisaHari} hari lagi</strong>).`;

    const mailOptions = {
        from: `"SPK Kelas Digital SMAN 12 Padang" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
                <h2 style="color:#0b2545;">Pengingat Periode Seleksi</h2>
                <p>Halo <strong>${esc(namaUser)}</strong>,</p>
                <p>${kalimatWaktu}</p>
                <p>Hal yang perlu kamu perhatikan:</p>
                <ul style="padding-left:20px;">${daftarTugas}</ul>
                ${tombolLink}
                <p style="margin-top:30px; font-size:12px; color:#999;">
                    Email ini dikirim otomatis oleh sistem SPK Kelas Digital SMAN 12 Padang (maksimal 1 email per hari)
                    dan akan berhenti setelah hasil seleksi difinalisasi. Mohon tidak membalas email ini.
                </p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
}

module.exports = { sendPengingatPeriodeEmail };