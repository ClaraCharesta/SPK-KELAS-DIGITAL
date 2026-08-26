const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'img', 'logo-sman12.png');
// Sesuaikan path di atas sesuai lokasi file generator ini terhadap folder /public.

const PAGE_WIDTH = 595.28;   // A4 portrait (pt)
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - MARGIN;

const SEKOLAH_INFO = {
    nama: 'SMA NEGERI 12 PADANG',
    alamat: 'Jl. Gurun Laweh, RT.2/RW.2, Kec. Nanggalo, Kota Padang, Sumatera Barat 25145',
    telepon: '(0751) 4977224',
    didirikan: '1996',
    provinsi: 'Sumatera Barat'
};

// Palet monokrom — satu warna aksen gelap untuk judul & garis, sisanya hitam/abu.
const COLORS = {
    ink: '#1a2740',     // navy tua, dipakai terbatas: judul & garis kop surat
    text: '#1f1f1f',
    textMuted: '#6b6b6b',
    border: '#9aa0aa',
    borderLight: '#d8dbe0'
};

const STATUS_LABEL = { lulus: 'Lulus', diusulkan: 'Diusulkan', cadangan: 'Cadangan' };

/**
 * Kop surat resmi klasik: logo di kiri, identitas sekolah center di tengah
 * halaman penuh (bukan center relatif terhadap logo), lalu garis ganda tebal-tipis.
 */
function drawLetterhead(doc, subtitle) {
    const top = MARGIN;
    const logoSize = 58;

    if (fs.existsSync(LOGO_PATH)) {
        try {
            doc.image(LOGO_PATH, MARGIN, top + 2, { width: logoSize, height: logoSize });
        } catch (err) {
            // lanjut tanpa logo kalau gagal dimuat
        }
    }

    // Teks identitas sekolah di-center terhadap FULL lebar halaman (MARGIN s/d PAGE_WIDTH-MARGIN),
    // bukan digeser mengikuti logo — ini yang bikin kop surat terlihat "ketengah" seperti format resmi.
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(15)
        .text(SEKOLAH_INFO.nama, MARGIN, top + 2, { width: CONTENT_WIDTH, align: 'center' });

    doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(8.3)
        .text(SEKOLAH_INFO.alamat, MARGIN, doc.y + 3, { width: CONTENT_WIDTH, align: 'center' });

    doc.text(
        `Telp. ${SEKOLAH_INFO.telepon}   |   Didirikan ${SEKOLAH_INFO.didirikan}   |   Provinsi ${SEKOLAH_INFO.provinsi}`,
        MARGIN, doc.y + 1, { width: CONTENT_WIDTH, align: 'center' }
    );

    const textBottom = doc.y + 8;
    const lineY = Math.max(textBottom, top + logoSize + 6);

    // Garis ganda tebal-tipis khas kop surat resmi
    doc.moveTo(MARGIN, lineY).lineTo(PAGE_WIDTH - MARGIN, lineY)
        .lineWidth(1.4).strokeColor(COLORS.ink).stroke();
    doc.moveTo(MARGIN, lineY + 3).lineTo(PAGE_WIDTH - MARGIN, lineY + 3)
        .lineWidth(0.5).strokeColor(COLORS.ink).stroke();

    let y = lineY + 20;

    // Judul dokumen, center, dengan garis bawah pendek (gaya judul surat resmi)
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(11.5)
        .text(subtitle, MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
    y = doc.y + 4;

    const titleWidth = doc.widthOfString(subtitle, { font: 'Helvetica-Bold', size: 11.5 });
    const underlineX = (PAGE_WIDTH - titleWidth) / 2;
    doc.moveTo(underlineX, y).lineTo(underlineX + titleWidth, y)
        .lineWidth(0.7).strokeColor(COLORS.text).stroke();

    return y + 18;
}

function needsNewPage(y, blockHeight) {
    return y + blockHeight > BOTTOM_LIMIT;
}

function generateLaporanPDF(res, data) {
    const { periode, hasilRanking, bobotKriteria } = data;

    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename=Laporan_Kelas_Digital_${periode.tahun_ajaran.replace('/', '-')}.pdf`
    );
    doc.pipe(res);

    let y = drawLetterhead(doc, 'LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL');

    // ===== Info periode — baris teks polos, tanpa kotak warna =====
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(9.5)
        .text(`Tahun Ajaran     : ${periode.tahun_ajaran}`, MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 2;
    doc.text(`Kuota Kelas Digital : ${periode.kuota_kelas_digital} siswa`, MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 14;

    doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(0.6).strokeColor(COLORS.borderLight).stroke();
    y += 18;

    // ===== BOBOT KRITERIA =====
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11)
        .text('Bobot Kriteria (Hasil FUCOM)', MARGIN, y);
    y = doc.y + 10;

    const bobotColX = { nama: MARGIN + 4, bobot: PAGE_WIDTH - MARGIN - 96 };
    const bobotRowH = 20;
    const bobotTableTop = y;

    // Header tabel: teks bold + garis atas-bawah, TANPA blok warna
    doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(1).strokeColor(COLORS.text).stroke();
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(9);
    doc.text('Kriteria', bobotColX.nama, y + 6, { width: 350 });
    doc.text('Bobot', bobotColX.bobot, y + 6, { width: 92, align: 'right' });
    y += bobotRowH;
    doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(1).strokeColor(COLORS.text).stroke();

    doc.font('Helvetica').fontSize(9);
    bobotKriteria.forEach((b) => {
        doc.fillColor(COLORS.text)
            .text(b.nama_kriteria, bobotColX.nama, y + 5, { width: 350 });
        doc.font('Helvetica-Bold')
            .text(`${(b.nilai_bobot * 100).toFixed(2)}%`, bobotColX.bobot, y + 5, { width: 92, align: 'right' });
        doc.font('Helvetica');
        y += bobotRowH;
        doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(0.4).strokeColor(COLORS.borderLight).stroke();
    });

    y += 26;

    // ===== HASIL PERANGKINGAN =====
    if (needsNewPage(y, 60)) {
        doc.addPage();
        y = drawLetterhead(doc, 'LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL (Lanjutan)');
    }

    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11)
        .text('Hasil Perangkingan Siswa', MARGIN, y);
    y = doc.y + 10;

    const colX = {
        rank: MARGIN + 4,
        nisn: MARGIN + 40,
        nama: MARGIN + 110,
        q: MARGIN + 330,
        status: MARGIN + 405
    };
    const rowH = 19;

    function drawRankingHeader() {
        doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(1).strokeColor(COLORS.text).stroke();
        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(8.5);
        doc.text('Rank', colX.rank, y + 6, { width: 34 });
        doc.text('NISN', colX.nisn, y + 6, { width: 65 });
        doc.text('Nama', colX.nama, y + 6, { width: 210 });
        doc.text('Nilai Q', colX.q, y + 6, { width: 60, align: 'right' });
        doc.text('Status', colX.status, y + 6, { width: 100, align: 'center' });
        y += rowH + 4;
        doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(1).strokeColor(COLORS.text).stroke();
    }

    drawRankingHeader();

    doc.font('Helvetica').fontSize(8.5);
    hasilRanking.forEach((h) => {
        if (needsNewPage(y, rowH)) {
            doc.addPage();
            y = drawLetterhead(doc, 'LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL (Lanjutan)');
            drawRankingHeader();
        }

        doc.fillColor(COLORS.text);
        doc.font('Helvetica-Bold').text(`#${h.ranking}`, colX.rank, y + 5, { width: 34 });
        doc.font('Helvetica').text(h.nisn, colX.nisn, y + 5, { width: 65 });
        doc.text(h.nama, colX.nama, y + 5, { width: 210 });
        doc.text(parseFloat(h.nilai_akhir_q).toFixed(4), colX.q, y + 5, { width: 60, align: 'right' });

        const label = STATUS_LABEL[h.status_penerimaan] || h.status_penerimaan;
        doc.font(h.status_penerimaan === 'lulus' ? 'Helvetica-Bold' : 'Helvetica')
            .text(label, colX.status, y + 5, { width: 100, align: 'center' });
        doc.font('Helvetica');

        y += rowH;
        doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(0.4).strokeColor(COLORS.borderLight).stroke();
    });

    y += 30;

    // ===== TANDA TANGAN =====
    if (needsNewPage(y, 110)) {
        doc.addPage();
        y = drawLetterhead(doc, 'LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL (Lanjutan)');
    }

    const tglSekarang = new Date().toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
    const sigX = PAGE_WIDTH - MARGIN - 175;

    doc.fillColor(COLORS.text).font('Helvetica').fontSize(9.5)
        .text(`Padang, ${tglSekarang}`, sigX, y, { width: 175, align: 'center' });
    y += 14;
    doc.text('Kepala Sekolah,', sigX, y, { width: 175, align: 'center' });
    y += 55;
    doc.font('Helvetica-Bold')
        .text('(_____________________)', sigX, y, { width: 175, align: 'center' });

    doc.end();
}

function generateNilaiSiswaPDF(res, data) {
    const { periode, siswaList, kriteriaList } = data;

    const L_WIDTH = 841.89;  // A4 landscape
    const L_HEIGHT = 595.28;
    const lMargin = 40;
    const lContentWidth = L_WIDTH - lMargin * 2;
    const lBottomLimit = L_HEIGHT - lMargin;

    const doc = new PDFDocument({ margin: 0, size: 'A4', layout: 'landscape', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename=Data_Nilai_Siswa_${periode.tahun_ajaran.replace('/', '-')}.pdf`
    );
    doc.pipe(res);

    function drawLandscapeHeader() {
        const top = lMargin;
        const logoSize = 46;

        if (fs.existsSync(LOGO_PATH)) {
            try {
                doc.image(LOGO_PATH, lMargin, top + 2, { width: logoSize, height: logoSize });
            } catch (err) { /* lanjut tanpa logo */ }
        }

        doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(13)
            .text(SEKOLAH_INFO.nama, lMargin, top + 2, { width: lContentWidth, align: 'center' });
        doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(8)
            .text(`Data Nilai Siswa per Kriteria — Tahun Ajaran ${periode.tahun_ajaran}`, lMargin, doc.y + 3, {
                width: lContentWidth, align: 'center'
            });

        const textBottom = doc.y + 6;
        const lineY = Math.max(textBottom, top + logoSize + 6);
        doc.moveTo(lMargin, lineY).lineTo(L_WIDTH - lMargin, lineY)
            .lineWidth(1.2).strokeColor(COLORS.ink).stroke();

        return lineY + 16;
    }

    let y = drawLandscapeHeader();

    const colWidth = (lContentWidth - 220) / kriteriaList.length;
    const rowH = 18;

    function drawTableHeader() {
        doc.moveTo(lMargin, y).lineTo(L_WIDTH - lMargin, y).lineWidth(1).strokeColor(COLORS.text).stroke();
        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(8);
        doc.text('NISN', lMargin + 6, y + 5, { width: 70 });
        doc.text('Nama', lMargin + 90, y + 5, { width: 150 });
        let xKriteria = lMargin + 250;
        kriteriaList.forEach(k => {
            doc.text(k.nama_kriteria, xKriteria, y + 5, { width: colWidth - 5, align: 'center' });
            xKriteria += colWidth;
        });
        y += rowH + 3;
        doc.moveTo(lMargin, y).lineTo(L_WIDTH - lMargin, y).lineWidth(1).strokeColor(COLORS.text).stroke();
    }

    drawTableHeader();
    doc.font('Helvetica').fontSize(8);

    siswaList.forEach((s) => {
        if (y + rowH > lBottomLimit) {
            doc.addPage({ layout: 'landscape', margin: 0, size: 'A4' });
            y = drawLandscapeHeader();
            drawTableHeader();
        }

        doc.fillColor(COLORS.text);
        doc.text(s.nisn, lMargin + 6, y + 4, { width: 70 });
        doc.text(s.nama, lMargin + 90, y + 4, { width: 150 });

        let xVal = lMargin + 250;
        kriteriaList.forEach(k => {
            const nilai = (s.nilai && s.nilai[k.id_kriteria] !== undefined && s.nilai[k.id_kriteria] !== null)
                ? s.nilai[k.id_kriteria] : '-';
            doc.text(String(nilai), xVal, y + 4, { width: colWidth - 5, align: 'center' });
            xVal += colWidth;
        });

        y += rowH;
        doc.moveTo(lMargin, y).lineTo(L_WIDTH - lMargin, y).lineWidth(0.4).strokeColor(COLORS.borderLight).stroke();
    });

    doc.end();
}

module.exports = { generateLaporanPDF, generateNilaiSiswaPDF };