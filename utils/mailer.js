const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendDefaultPasswordEmail(toEmail, namaUser, passwordBaru) {
    const mailOptions = {
        from: `"SPK Kelas Digital SMAN 12 Padang" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Password Akun Telah Direset',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
                <h2 style="color:#0b2545;">Password Akun Direset</h2>
                <p>Halo <strong>${namaUser}</strong>,</p>
                <p>Kami menerima permintaan untuk mereset password akun kamu di sistem SPK Kelas Digital SMAN 12 Padang. Password akun kamu sekarang telah diganti menjadi:</p>
                <p style="text-align:center; margin: 25px 0;">
                    <span style="display:inline-block; background:#f4f7fb; color:#0b2545; padding:12px 24px; border-radius:6px; font-weight:bold; font-size:18px; letter-spacing:1px;">
                        ${passwordBaru}
                    </span>
                </p>
                <p>Silakan login menggunakan password ini, lalu segera ganti password kamu sendiri lewat menu <strong>Profil &gt; Ubah Password</strong> agar akun kamu tetap aman.</p>
                <p style="margin-top:30px; font-size:12px; color:#999;">
                    Jika kamu tidak merasa meminta reset password, segera hubungi Admin karena ada kemungkinan orang lain mencoba mengakses akun kamu.
                </p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
}

module.exports = { sendDefaultPasswordEmail };