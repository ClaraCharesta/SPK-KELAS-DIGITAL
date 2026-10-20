const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'img', 'logo-sman12.png');
// Sesuaikan path di atas sesuai lokasi file generator ini terhadap folder /public.

const PAGE_WIDTH = 595.28;   // A4 portrait (pt)
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - MARGIN - 6;

const SEKOLAH_INFO = {
    nama: 'SMA NEGERI 12 PADANG',
    alamat: 'Jl. Gurun Laweh, RT.2/RW.2, Kec. Nanggalo, Kota Padang, Sumatera Barat 25145',
    telepon: '(0751) 4977224',
    didirikan: '1996',
    provinsi: 'Sumatera Barat'
};

// Palet hitam putih: hitam untuk teks & garis utama, abu-abu untuk garis tipis, zebra, dan latar.
const COLORS = {
    ink: '#000000',          // hitam: judul, garis kop surat, teks utama
    text: '#000000',
    textMuted: '#555555',
    border: '#999999',
    borderLight: '#cccccc',
    zebra: '#f4f4f4',
    cardBg: '#f4f4f4',
    headerBg: '#e6e6e6',
    headerLine: '#000000',
    neutral: '#555555',
    track: '#dddddd'
};

// Status di database yang dianggap MASUK kelas digital. Selain ini dianggap TIDAK masuk.
// (diterima = hasil WASPAS dalam kuota, lulus/diusulkan = status lanjutan setelah diterima)
const STATUS_MASUK = ['diterima', 'lulus', 'diusulkan'];

function isMasuk(status) {
    return STATUS_MASUK.includes(String(status || '').toLowerCase().trim());
}

// Hanya ada 2 status tampilan di laporan
const STATUS_LABEL = {
    masuk: 'Masuk Kelas Digital',
    tidak: 'Tidak Masuk Kelas Digital'
};

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

/**
 * Menggambar satu baris tabel: latar (fill), garis bawah, dan garis vertikal
 * di setiap batas kolom (termasuk batas kiri dan kanan).
 * bounds = daftar posisi X batas kolom.
 * opts: { header: true } untuk baris header (latar abu muda), { fill: '#hex' } untuk baris biasa.
 */
function drawTableRow(doc, y, h, bounds, opts) {
    const options = opts || {};
    const left = bounds[0];
    const right = bounds[bounds.length - 1];

    if (options.header) {
        doc.rect(left, y, right - left, h).fill(COLORS.headerBg);
    } else if (options.fill) {
        doc.rect(left, y, right - left, h).fill(options.fill);
    }

    const lineColor = options.header ? COLORS.headerLine : COLORS.border;
    doc.lineWidth(options.header ? 0.8 : 0.5).strokeColor(lineColor);

    doc.moveTo(left, y + h).lineTo(right, y + h).stroke();
    bounds.forEach((x) => {
        doc.moveTo(x, y).lineTo(x, y + h).stroke();
    });

    if (options.header) {
        // garis atas header hitam supaya kotak header utuh
        doc.moveTo(left, y).lineTo(right, y).lineWidth(0.8).strokeColor(COLORS.headerLine).stroke();
    }
}

/**
 * Badge status berbentuk pill (Masuk / Tidak Masuk Kelas Digital), di-center terhadap kolom [x1, x2].
 * Masuk = hitam dengan teks putih. Tidak masuk = putih dengan garis tepi hitam.
 */
function drawStatusBadge(doc, masuk, x1, x2, rowY, rowH) {
    const bw = 112;
    const bh = 14;
    const bx = x1 + ((x2 - x1) - bw) / 2;
    const by = rowY + (rowH - bh) / 2;
    const label = masuk ? STATUS_LABEL.masuk : STATUS_LABEL.tidak;

    if (masuk) {
        doc.roundedRect(bx, by, bw, bh, 7).fill(COLORS.ink);
        doc.fillColor('#ffffff');
    } else {
        doc.roundedRect(bx, by, bw, bh, 7).lineWidth(0.6).strokeColor(COLORS.ink).stroke();
        doc.fillColor(COLORS.ink);
    }

    doc.font('Helvetica-Bold').fontSize(7)
        .text(label, bx, by + 3.8, { width: bw, align: 'center', lineBreak: false });
}

/** Judul bagian dengan garis aksen di kiri. */
function drawSectionTitle(doc, y, title, accent, rightText) {
    doc.rect(MARGIN, y, 4, 15).fill(accent);
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11)
        .text(title, MARGIN + 11, y + 2, { width: CONTENT_WIDTH - 90, lineBreak: false });
    if (rightText) {
        doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(8.5)
            .text(rightText, PAGE_WIDTH - MARGIN - 90, y + 3.5, { width: 90, align: 'right', lineBreak: false });
    }
    return y + 15 + 10;
}

/**
 * data = { periode, hasilRanking, bobotKriteria, kepsek }
 * kepsek = { nama, nip } -> Kepala Sekolah yang AKTIF (ambil dari userModel.getKepsekAktif()).
 * Jika kepsek tidak ada, bagian tanda tangan tetap tercetak dengan garis kosong seperti sebelumnya.
 */
function generateLaporanPDF(res, data) {
    const { periode, hasilRanking, bobotKriteria, kepsek } = data;

    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename=Laporan_Kelas_Digital_${periode.tahun_ajaran.replace('/', '-')}.pdf`
    );
    doc.pipe(res);

    const tglSekarang = new Date().toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    const siswaMasuk = hasilRanking.filter((h) => isMasuk(h.status_penerimaan));
    const siswaTidakMasuk = hasilRanking.filter((h) => !isMasuk(h.status_penerimaan));

    let y = drawLetterhead(doc, 'LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL');

    // ===== Info laporan (2 baris label : nilai) =====
    const labelW = 95;
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.textMuted)
        .text('Tahun Ajaran', MARGIN, y, { width: labelW, lineBreak: false });
    doc.fillColor(COLORS.text).font('Helvetica-Bold')
        .text(`:  ${periode.tahun_ajaran}`, MARGIN + labelW, y, { width: CONTENT_WIDTH - labelW, lineBreak: false });
    y += 15;
    doc.font('Helvetica').fillColor(COLORS.textMuted)
        .text('Tanggal Cetak', MARGIN, y, { width: labelW, lineBreak: false });
    doc.fillColor(COLORS.text).font('Helvetica-Bold')
        .text(`:  ${tglSekarang}`, MARGIN + labelW, y, { width: CONTENT_WIDTH - labelW, lineBreak: false });
    y += 26;

    // ===== Kotak ringkasan =====
    const cardGap = 10;
    const cardW = (CONTENT_WIDTH - cardGap * 3) / 4;
    const cardH = 48;
    const cards = [
        { label: 'Total Siswa', value: String(hasilRanking.length), color: COLORS.ink },
        { label: 'Kuota Kelas Digital', value: String(periode.kuota_kelas_digital), color: COLORS.ink },
        { label: 'Masuk Kelas Digital', value: String(siswaMasuk.length), color: COLORS.ink },
        { label: 'Tidak Masuk Kelas Digital', value: String(siswaTidakMasuk.length), color: COLORS.neutral }
    ];
    cards.forEach((c, i) => {
        const cx = MARGIN + i * (cardW + cardGap);
        doc.roundedRect(cx, y, cardW, cardH, 5).fillAndStroke(COLORS.cardBg, COLORS.borderLight);
        doc.rect(cx + 0.5, y + 8, 3, cardH - 16).fill(c.color);
        doc.fillColor(c.color).font('Helvetica-Bold').fontSize(17)
            .text(c.value, cx, y + 8, { width: cardW, align: 'center', lineBreak: false });
        doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(7.5)
            .text(c.label, cx, y + 31, { width: cardW, align: 'center', lineBreak: false });
    });
    y += cardH + 26;

    // ===== BOBOT KRITERIA =====
    y = drawSectionTitle(doc, y, 'Bobot Kriteria (Hasil FUCOM)', COLORS.ink, `${bobotKriteria.length} kriteria`);

    const bobotRowH = 22;
    const bobotBounds = [MARGIN, MARGIN + 36, MARGIN + 290, PAGE_WIDTH - MARGIN];

    drawTableRow(doc, y, bobotRowH, bobotBounds, { header: true });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5);
    doc.text('No', bobotBounds[0] + 4, y + 7, { width: bobotBounds[1] - bobotBounds[0] - 8, align: 'center', lineBreak: false });
    doc.text('Kriteria', bobotBounds[1] + 8, y + 7, { width: bobotBounds[2] - bobotBounds[1] - 16, lineBreak: false });
    doc.text('Bobot', bobotBounds[2] + 8, y + 7, { width: bobotBounds[3] - bobotBounds[2] - 16, lineBreak: false });
    y += bobotRowH;

    let totalBobot = 0;
    bobotKriteria.forEach((b, i) => {
        const nilai = parseFloat(b.nilai_bobot) || 0;
        totalBobot += nilai;

        drawTableRow(doc, y, bobotRowH, bobotBounds, { fill: i % 2 === 1 ? COLORS.zebra : null });

        doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(9)
            .text(String(i + 1), bobotBounds[0] + 4, y + 6.5, {
                width: bobotBounds[1] - bobotBounds[0] - 8, align: 'center', lineBreak: false
            });
        doc.fillColor(COLORS.text).font('Helvetica').fontSize(9)
            .text(b.nama_kriteria, bobotBounds[1] + 8, y + 6.5, {
                width: bobotBounds[2] - bobotBounds[1] - 16, height: 12, lineBreak: false, ellipsis: true
            });

        // Bar proporsi + persentase
        const barX = bobotBounds[2] + 8;
        const barW = 120;
        const barY = y + (bobotRowH - 6) / 2;
        doc.roundedRect(barX, barY, barW, 6, 3).fill(COLORS.track);
        const fillW = Math.max(0, Math.min(1, nilai)) * barW;
        if (fillW > 0) {
            doc.roundedRect(barX, barY, Math.max(fillW, 3), 6, 3).fill(COLORS.ink);
        }
        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(9)
            .text(`${(nilai * 100).toFixed(2)}%`, barX + barW + 6, y + 6.5, {
                width: bobotBounds[3] - (barX + barW + 6) - 8, align: 'right', lineBreak: false
            });

        y += bobotRowH;
    });

    // Baris total
    drawTableRow(doc, y, bobotRowH, [bobotBounds[0], bobotBounds[2], bobotBounds[3]], { fill: COLORS.cardBg });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9)
        .text('Total', bobotBounds[0] + 8, y + 6.5, {
            width: bobotBounds[2] - bobotBounds[0] - 16, align: 'right', lineBreak: false
        });
    doc.text(`${(totalBobot * 100).toFixed(2)}%`, bobotBounds[2] + 8, y + 6.5, {
        width: bobotBounds[3] - bobotBounds[2] - 16, align: 'right', lineBreak: false
    });
    y += bobotRowH;

    y += 28;

    // ===== HASIL PERANGKINGAN (DIPISAH: MASUK & TIDAK MASUK KELAS DIGITAL) =====
    const rowH = 22;
    const rankBounds = [
        MARGIN,
        MARGIN + 40,
        MARGIN + 116,
        PAGE_WIDTH - MARGIN - 210,
        PAGE_WIDTH - MARGIN - 132,
        PAGE_WIDTH - MARGIN
    ];

    function drawRankingHeader() {
        drawTableRow(doc, y, rowH + 2, rankBounds, { header: true });
        doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5);
        doc.text('Rank', rankBounds[0] + 4, y + 8, { width: rankBounds[1] - rankBounds[0] - 8, align: 'center', lineBreak: false });
        doc.text('NISN', rankBounds[1] + 8, y + 8, { width: rankBounds[2] - rankBounds[1] - 16, lineBreak: false });
        doc.text('Nama', rankBounds[2] + 8, y + 8, { width: rankBounds[3] - rankBounds[2] - 16, lineBreak: false });
        doc.text('Nilai Q', rankBounds[3] + 8, y + 8, { width: rankBounds[4] - rankBounds[3] - 16, align: 'right', lineBreak: false });
        doc.text('Status', rankBounds[4] + 4, y + 8, { width: rankBounds[5] - rankBounds[4] - 8, align: 'center', lineBreak: false });
        y += rowH + 2;
    }

    function newPageLanjutan() {
        doc.addPage();
        y = drawLetterhead(doc, 'LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL (Lanjutan)');
    }

    function drawRankingSection(judul, list, accent) {
        // Pastikan judul + header + minimal 1 baris muat di halaman ini
        if (needsNewPage(y, 80)) {
            newPageLanjutan();
        }

        y = drawSectionTitle(doc, y, judul, accent, `${list.length} siswa`);

        drawRankingHeader();

        if (list.length === 0) {
            drawTableRow(doc, y, rowH, [MARGIN, PAGE_WIDTH - MARGIN], {});
            doc.fillColor(COLORS.textMuted).font('Helvetica-Oblique').fontSize(8.5)
                .text('Tidak ada data.', MARGIN, y + 7, { width: CONTENT_WIDTH, align: 'center', lineBreak: false });
            y += rowH;
            return;
        }

        list.forEach((h, i) => {
            if (needsNewPage(y, rowH)) {
                newPageLanjutan();
                drawRankingHeader();
            }

            drawTableRow(doc, y, rowH, rankBounds, { fill: i % 2 === 1 ? COLORS.zebra : null });

            doc.fillColor(COLORS.text);
            doc.font('Helvetica-Bold').fontSize(8.5)
                .text(String(h.ranking), rankBounds[0] + 4, y + 7, {
                    width: rankBounds[1] - rankBounds[0] - 8, align: 'center', lineBreak: false
                });
            doc.font('Helvetica').fontSize(8.5)
                .text(String(h.nisn), rankBounds[1] + 8, y + 7, {
                    width: rankBounds[2] - rankBounds[1] - 16, height: 12, lineBreak: false, ellipsis: true
                });
            doc.text(h.nama, rankBounds[2] + 8, y + 7, {
                width: rankBounds[3] - rankBounds[2] - 16, height: 12, lineBreak: false, ellipsis: true
            });
            doc.font('Helvetica-Bold')
                .text(parseFloat(h.nilai_akhir_q).toFixed(4), rankBounds[3] + 8, y + 7, {
                    width: rankBounds[4] - rankBounds[3] - 16, align: 'right', lineBreak: false
                });

            drawStatusBadge(doc, isMasuk(h.status_penerimaan), rankBounds[4], rankBounds[5], y, rowH);

            y += rowH;
        });
    }

    drawRankingSection('A. Siswa yang Masuk Kelas Digital', siswaMasuk, COLORS.ink);

    // Bagian B selalu mulai di halaman baru (tidak menempel di bawah tabel A)
    newPageLanjutan();
    drawRankingSection('B. Siswa yang Tidak Masuk Kelas Digital', siswaTidakMasuk, COLORS.neutral);

    y += 30;

    // ===== TANDA TANGAN =====
    if (needsNewPage(y, 120)) {
        doc.addPage();
        y = drawLetterhead(doc, 'LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL (Lanjutan)');
    }

    const sigW = 190;
    const sigX = PAGE_WIDTH - MARGIN - sigW;

    // Identitas Kepala Sekolah AKTIF (diambil dari akun user dengan role kepsek)
    const namaKepsek = kepsek && kepsek.nama ? String(kepsek.nama).trim() : '';
    const nipKepsek = kepsek && kepsek.nip ? String(kepsek.nip).trim() : '';

    doc.fillColor(COLORS.text).font('Helvetica').fontSize(9.5)
        .text(`Padang, ${tglSekarang}`, sigX, y, { width: sigW, align: 'center', lineBreak: false });
    y += 14;
    doc.text('Mengetahui,', sigX, y, { width: sigW, align: 'center', lineBreak: false });
    y += 13;
    doc.font('Helvetica-Bold')
        .text('Kepala Sekolah', sigX, y, { width: sigW, align: 'center', lineBreak: false });
    y += 58;

    if (namaKepsek) {
        // Nama Kepala Sekolah (tebal, digarisbawahi) lalu NIP di bawahnya
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.text)
            .text(namaKepsek, sigX - 25, y, { width: sigW + 50, align: 'center', lineBreak: false });

        const lebarNama = doc.widthOfString(namaKepsek);
        const garisX = sigX + (sigW - lebarNama) / 2;
        doc.moveTo(garisX, y + 12).lineTo(garisX + lebarNama, y + 12)
            .lineWidth(0.6).strokeColor(COLORS.text).stroke();

        y += 17;
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.text)
            .text(`NIP. ${nipKepsek || '-'}`, sigX, y, { width: sigW, align: 'center', lineBreak: false });
    } else {
        // Tidak ada kepsek aktif: tetap tampilkan garis kosong seperti semula
        doc.moveTo(sigX + 15, y).lineTo(sigX + sigW - 15, y).lineWidth(0.6).strokeColor(COLORS.text).stroke();
        y += 5;
        doc.font('Helvetica').fontSize(9)
            .text('NIP. ', sigX + 15, y, { width: sigW - 30, align: 'left', lineBreak: false });
    }

    // ===== FOOTER SEMUA HALAMAN (garis + identitas + nomor halaman) =====
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        const fy = PAGE_HEIGHT - 32;
        doc.moveTo(MARGIN, fy).lineTo(PAGE_WIDTH - MARGIN, fy)
            .lineWidth(0.5).strokeColor(COLORS.borderLight).stroke();
        doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(7.5)
            .text(
                `Laporan Penempatan Siswa Kelas Digital  |  ${SEKOLAH_INFO.nama}  |  TA ${periode.tahun_ajaran}`,
                MARGIN, fy + 7, { width: CONTENT_WIDTH - 90, align: 'left', lineBreak: false }
            );
        doc.text(
            `Halaman ${i + 1} dari ${range.count}`,
            PAGE_WIDTH - MARGIN - 90, fy + 7, { width: 90, align: 'right', lineBreak: false }
        );
    }

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