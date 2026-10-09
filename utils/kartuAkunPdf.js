const PDFDocument = require('pdfkit');

const MARGIN = 36;
const GAP_X = 12;
const GAP_Y = 10;
const KOLOM = 2;
const BARIS = 5;
const TINGGI_KARTU = 140;
const PAD = 10;
const LEBAR_LABEL = 62;

function barisData(doc, x, y, lebar, label, nilai, opsi = {}) {
    doc.font('Helvetica').fontSize(8).fillColor('#555555')
        .text(label, x + PAD, y, { width: LEBAR_LABEL, height: 11, lineBreak: false });

    doc.font(opsi.font || 'Helvetica-Bold').fontSize(opsi.size || 9).fillColor('#000000')
        .text(String(nilai || '-'), x + PAD + LEBAR_LABEL, y, {
            width: lebar - 2 * PAD - LEBAR_LABEL,
            height: opsi.tinggi || 11,
            ellipsis: true
        });
}

function gambarKartu(doc, x, y, lebar, item) {
    doc.save();

    doc.lineWidth(0.8).dash(3, { space: 2 }).rect(x, y, lebar, TINGGI_KARTU).stroke().undash();

    let cy = y + PAD;

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000')
        .text('KARTU AKUN SISWA - SELEKSI KELAS DIGITAL', x + PAD, cy, {
            width: lebar - 2 * PAD,
            lineBreak: false
        });
    cy += 12;

    doc.font('Helvetica').fontSize(8).fillColor('#555555')
        .text('SMAN 12 Padang', x + PAD, cy, { width: lebar - 2 * PAD, lineBreak: false });
    cy += 18;

    barisData(doc, x, cy, lebar, 'Nama', item.nama);
    cy += 14;
    barisData(doc, x, cy, lebar, 'Sekolah Asal', item.sekolah_asal);
    cy += 14;
    barisData(doc, x, cy, lebar, 'NISN (Username)', item.nisn);
    cy += 14;
    barisData(doc, x, cy, lebar, 'Password Awal', item.password, {
        font: 'Courier-Bold',
        size: 12,
        tinggi: 16
    });
    cy += 22;

    doc.font('Helvetica').fontSize(7).fillColor('#333333')
        .text(
            'Login memakai NISN dan password di atas. Wajib mengganti password saat login pertama. Jangan bagikan kartu ini ke siapa pun.',
            x + PAD, cy,
            { width: lebar - 2 * PAD, height: 22 }
        );

    doc.restore();
}

// Menulis PDF langsung ke response (tidak ada file yang disimpan di server)
function streamKartuAkunPdf(items, res, namaFile = 'kartu-akun-siswa.pdf') {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${namaFile}"`);
    res.setHeader('Cache-Control', 'no-store');

    doc.pipe(res);

    const lebarKartu = (doc.page.width - 2 * MARGIN - GAP_X * (KOLOM - 1)) / KOLOM;
    const perHalaman = KOLOM * BARIS;

    items.forEach((item, index) => {
        if (index > 0 && index % perHalaman === 0) {
            doc.addPage();
        }

        const posisi = index % perHalaman;
        const kolom = posisi % KOLOM;
        const baris = Math.floor(posisi / KOLOM);

        const x = MARGIN + kolom * (lebarKartu + GAP_X);
        const y = MARGIN + baris * (TINGGI_KARTU + GAP_Y);

        gambarKartu(doc, x, y, lebarKartu, item);
    });

    doc.end();
}

module.exports = { streamKartuAkunPdf };