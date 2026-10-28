const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'img', 'logo-sman12.png');
// Sesuaikan path di atas sesuai lokasi file generator ini terhadap folder /public.

const PAGE_WIDTH = 595.28;   // A4 portrait (pt)
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - 52; // sisakan ruang untuk footer

const L_WIDTH = 841.89;      // A4 landscape (pt)
const L_HEIGHT = 595.28;
const L_CONTENT_WIDTH = L_WIDTH - MARGIN * 2;
const L_BOTTOM_LIMIT = L_HEIGHT - 52;

const SEKOLAH_INFO = {
    instansi1: 'PEMERINTAH PROVINSI SUMATERA BARAT',
    instansi2: 'DINAS PENDIDIKAN',
    nama: 'SMA NEGERI 12 PADANG',
    alamat: 'Jl. Gurun Laweh, RT.2/RW.2, Kec. Nanggalo, Kota Padang, Sumatera Barat 25145',
    telepon: '(0751) 4977224',
    didirikan: '1996',
    provinsi: 'Sumatera Barat'
};

// Hitam putih tanpa isi warna (hemat tinta): hanya teks dan garis.
// Satu-satunya warna: garis pembatas merah antara siswa masuk dan tidak masuk.
const COLORS = {
    ink: '#000000',
    text: '#000000',
    textMuted: '#555555',
    line: '#000000',
    lineSoft: '#9a9a9a',
    red: '#d00000'
};

// Status di database yang dianggap MASUK kelas digital. Selain ini dianggap TIDAK masuk.
const STATUS_MASUK = ['diterima', 'lulus', 'diusulkan'];

function isMasuk(status) {
    return STATUS_MASUK.includes(String(status || '').toLowerCase().trim());
}

// Nilai status_penyelesaian (tabel periode) yang dianggap SUDAH FINAL.
// Nilai lain (misal 'belum_selesai') dianggap DRAFT.
const STATUS_PENYELESAIAN_FINAL = ['selesai', 'sudah_selesai', 'final', 'difinalisasi'];

/**
 * Menentukan apakah hasil seleksi sudah FINAL.
 * Memakai kolom periode.status_penyelesaian:
 *   - 'selesai' (dan variannya di atas) -> FINAL
 *   - 'belum_selesai' / nilai lain      -> DRAFT
 * Jika kolom tidak ada sama sekali, dianggap FINAL (perilaku lama).
 */
function isLaporanFinal(periode) {
    if (!periode || periode.status_penyelesaian === undefined || periode.status_penyelesaian === null) {
        return true;
    }
    const nilai = String(periode.status_penyelesaian).toLowerCase().trim();
    return STATUS_PENYELESAIAN_FINAL.includes(nilai);
}

const STATUS_LABEL = {
    masuk: 'Masuk',
    tidak: 'Tidak Masuk'
};

const CELL_PAD_X = 6;

/**
 * Kop surat: logo kiri, identitas di tengah, garis ganda tebal-tipis.
 * Dipanggil di SETIAP halaman. Mengembalikan posisi Y tepat di bawah garis ganda.
 */
function drawKop(doc, pageW) {
    const contentW = pageW - MARGIN * 2;
    const top = MARGIN;
    const logoSize = 56;

    if (fs.existsSync(LOGO_PATH)) {
        try {
            doc.image(LOGO_PATH, MARGIN, top + 2, { width: logoSize, height: logoSize });
        } catch (err) {
            // lanjut tanpa logo kalau gagal dimuat
        }
    }

    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9)
        .text(SEKOLAH_INFO.instansi1, MARGIN, top, { width: contentW, align: 'center', lineBreak: false });
    doc.text(SEKOLAH_INFO.instansi2, MARGIN, doc.y + 1, { width: contentW, align: 'center', lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(13)
        .text(SEKOLAH_INFO.nama, MARGIN, doc.y + 2, { width: contentW, align: 'center', lineBreak: false });

    doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(7.5)
        .text(
            `${SEKOLAH_INFO.alamat}  |  Telp. ${SEKOLAH_INFO.telepon}`,
            MARGIN, doc.y + 3, { width: contentW, align: 'center', lineBreak: false }
        );

    const lineY = Math.max(doc.y + 6, top + logoSize + 6);

    // Garis ganda tebal-tipis khas kop surat
    doc.moveTo(MARGIN, lineY).lineTo(pageW - MARGIN, lineY)
        .lineWidth(1.8).strokeColor(COLORS.line).stroke();
    doc.moveTo(MARGIN, lineY + 3).lineTo(pageW - MARGIN, lineY + 3)
        .lineWidth(0.5).strokeColor(COLORS.line).stroke();

    return lineY + 3;
}

/**
 * Halaman pertama: kop surat + judul dokumen.
 * Mengembalikan posisi Y untuk konten berikutnya.
 */
function drawLetterhead(doc, pageW, judul, subJudul) {
    const contentW = pageW - MARGIN * 2;

    let y = drawKop(doc, pageW) + 15;

    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(11);
    doc.text(judul, MARGIN, y, { width: contentW, align: 'center', lineBreak: false });
    y = doc.y + 2;

    if (subJudul) {
        doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(9)
            .text(subJudul, MARGIN, y, { width: contentW, align: 'center', lineBreak: false });
        y = doc.y;
    }

    return y + 14;
}

/**
 * Halaman lanjutan: kop surat penuh (tanpa judul).
 * Mengembalikan posisi Y untuk konten berikutnya.
 */
function drawKopLanjutan(doc, pageW) {
    return drawKop(doc, pageW) + 14;
}

/**
 * Footer semua halaman: garis tipis, keterangan dokumen, nomor halaman.
 */
function drawFooters(doc, teksKiri) {
    const range = doc.bufferedPageRange();

    for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);

        const pw = doc.page.width;
        const ph = doc.page.height;
        const fy = ph - 34;

        doc.moveTo(MARGIN, fy).lineTo(pw - MARGIN, fy)
            .lineWidth(0.4).strokeColor(COLORS.lineSoft).stroke();

        doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(7.5)
            .text(teksKiri, MARGIN, fy + 6, { width: pw - MARGIN * 2 - 90, align: 'left', lineBreak: false });
        doc.text(
            `Halaman ${i + 1} dari ${range.count}`,
            pw - MARGIN - 90, fy + 6, { width: 90, align: 'right', lineBreak: false }
        );
    }
}

/**
 * Tinggi satu baris tabel, mengikuti teks yang membungkus di sel paling tinggi.
 */
function measureRow(doc, cells, bounds, opts) {
    const o = opts || {};
    const fontSize = o.fontSize || 8.5;

    doc.font(o.bold || o.header ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);

    let maxH = 0;
    cells.forEach((teks, i) => {
        const w = bounds[i + 1] - bounds[i] - CELL_PAD_X * 2;
        const h = doc.heightOfString(String(teks), { width: w });
        if (h > maxH) maxH = h;
    });

    return Math.max(o.minH || 18, maxH + 8);
}

/**
 * Menggambar satu baris tabel dengan kotak penuh:
 * garis atas (hanya pada header, baris lain memakai garis bawah baris sebelumnya),
 * garis bawah, dan garis vertikal pada setiap batas kolom.
 */
function drawRow(doc, y, h, bounds, cells, aligns, opts) {
    const o = opts || {};
    const fontSize = o.fontSize || 8.5;
    const left = bounds[0];
    const right = bounds[bounds.length - 1];

    doc.lineWidth(o.header ? 0.8 : 0.5).strokeColor(COLORS.line);

    if (o.header || o.firstRow) {
        doc.moveTo(left, y).lineTo(right, y).stroke();
    }
    doc.moveTo(left, y + h).lineTo(right, y + h).stroke();
    bounds.forEach((x) => {
        doc.moveTo(x, y).lineTo(x, y + h).stroke();
    });

    doc.fillColor(COLORS.text)
        .font(o.bold || o.header ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(fontSize);

    cells.forEach((teks, i) => {
        const w = bounds[i + 1] - bounds[i] - CELL_PAD_X * 2;
        const th = doc.heightOfString(String(teks), { width: w });
        const ty = y + (h - th) / 2;
        doc.text(String(teks), bounds[i] + CELL_PAD_X, ty, {
            width: w,
            align: (aligns && aligns[i]) || 'left'
        });
    });
}

/**
 * Garis pembatas merah melintang penuh lebar tabel.
 */
function drawGarisMerah(doc, y, bounds) {
    doc.lineWidth(1.6).strokeColor(COLORS.red)
        .moveTo(bounds[0], y).lineTo(bounds[bounds.length - 1], y).stroke();
    doc.strokeColor(COLORS.line);
}

function needsNewPage(y, blockHeight, limit) {
    return y + blockHeight > (limit || BOTTOM_LIMIT);
}

function drawSectionTitle(doc, y, teks, size) {
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(size || 9.5)
        .text(teks, MARGIN, y, { width: CONTENT_WIDTH, lineBreak: false });
    return doc.y + 6;
}

function formatAngka(nilai, digit) {
    const n = parseFloat(nilai);
    return Number.isFinite(n) ? n.toFixed(digit) : '-';
}

/**
 * data = { periode, hasilRanking, bobotKriteria, kepsek }
 * kepsek = { nama, nip } -> Kepala Sekolah yang AKTIF (ambil dari userModel.getKepsekAktif()).
 * Jika kepsek tidak ada, bagian tanda tangan tetap tercetak dengan garis kosong seperti sebelumnya.
 *
 * Jika periode.status_penyelesaian belum 'selesai', judul menjadi
 * "DRAFT LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL".
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

    // Judul berubah jadi DRAFT (tetap bold) kalau periode belum diselesaikan/difinalisasi
    const laporanFinal = isLaporanFinal(periode);
    const judulLaporan = laporanFinal
        ? 'LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL'
        : 'DRAFT LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL';

    let y = drawLetterhead(
        doc,
        PAGE_WIDTH,
        judulLaporan,
        `Tahun Ajaran ${periode.tahun_ajaran}`
    );

    function halamanBaru() {
        doc.addPage();
        y = drawKopLanjutan(doc, PAGE_WIDTH);
    }

    /**
     * Tabel generik berkotak penuh dengan header berulang di tiap halaman.
     * rows = [{ cells, bold, bounds?, aligns?, garisMerah? }]
     * bounds/aligns pada baris bersifat opsional (untuk sel yang digabung).
     * garisMerah = true -> gambar garis merah di batas atas baris ini.
     */
    function drawTable(headerCells, rows, bounds, aligns, teksKosong) {
        const hHeader = measureRow(doc, headerCells, bounds, { header: true, minH: 22 });

        if (needsNewPage(y, hHeader + 40)) halamanBaru();

        drawRow(doc, y, hHeader, bounds, headerCells, headerCells.map(() => 'center'), { header: true });
        y += hHeader;

        if (rows.length === 0) {
            const hKosong = 20;
            drawRow(doc, y, hKosong, [bounds[0], bounds[bounds.length - 1]],
                [teksKosong || 'Tidak ada data.'], ['center'], {});
            y += hKosong;
            return;
        }

        rows.forEach((r) => {
            const rb = r.bounds || bounds;
            const ra = r.aligns || aligns;
            const h = measureRow(doc, r.cells, rb, { bold: r.bold });
            let barisPertamaDiHalaman = false;

            if (needsNewPage(y, h)) {
                halamanBaru();
                drawRow(doc, y, hHeader, bounds, headerCells, headerCells.map(() => 'center'), { header: true });
                y += hHeader;
                barisPertamaDiHalaman = true;
            }

            drawRow(doc, y, h, rb, r.cells, ra, { bold: r.bold });

            // Garis merah pembatas (dilewati jika batas jatuh tepat di pergantian halaman)
            if (r.garisMerah && !barisPertamaDiHalaman) {
                drawGarisMerah(doc, y, bounds);
            }

            y += h;
        });
    }

    // ===== Ringkasan satu baris =====
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(9)
        .text(
            `Kuota: ${periode.kuota_kelas_digital} siswa   |   Total siswa: ${hasilRanking.length}   |   ` +
            `Masuk: ${siswaMasuk.length}   |   Tidak masuk: ${siswaTidakMasuk.length}   |   Dicetak: ${tglSekarang}`,
            MARGIN, y, { width: CONTENT_WIDTH, align: 'left', lineBreak: false }
        );
    y = doc.y + 18;

    // ===== BOBOT KRITERIA =====
    if (needsNewPage(y, 90)) halamanBaru();
    y = drawSectionTitle(doc, y, 'Bobot Kriteria (FUCOM)');

    const bobotBounds = [MARGIN, MARGIN + 36, PAGE_WIDTH - MARGIN - 110, PAGE_WIDTH - MARGIN];

    let totalBobot = 0;
    const barisBobot = bobotKriteria.map((b, i) => {
        const nilai = parseFloat(b.nilai_bobot) || 0;
        totalBobot += nilai;
        return {
            cells: [String(i + 1), String(b.nama_kriteria), `${(nilai * 100).toFixed(2)}%`]
        };
    });

    if (barisBobot.length > 0) {
        // Baris total: dua kolom pertama digabung, teks rata kanan
        barisBobot.push({
            cells: ['Total', `${(totalBobot * 100).toFixed(2)}%`],
            bounds: [bobotBounds[0], bobotBounds[2], bobotBounds[3]],
            aligns: ['right', 'center'],
            bold: true
        });
    }

    drawTable(['No', 'Kriteria', 'Bobot'], barisBobot, bobotBounds, ['center', 'left', 'center'], 'Belum ada bobot kriteria.');
    y += 22;

    // ===== HASIL PERANGKINGAN =====
    const rankBounds = [
        MARGIN,
        MARGIN + 40,
        MARGIN + 125,
        PAGE_WIDTH - MARGIN - 175,
        PAGE_WIDTH - MARGIN - 95,
        PAGE_WIDTH - MARGIN
    ];
    const rankAligns = ['center', 'left', 'left', 'center', 'center'];
    const rankHeader = ['Rank', 'NISN', 'Nama', 'Nilai Q', 'Keterangan'];

    const barisRanking = hasilRanking.map((h, i) => {
        const masuk = isMasuk(h.status_penerimaan);
        const sebelumnyaMasuk = i > 0 && isMasuk(hasilRanking[i - 1].status_penerimaan);

        return {
            cells: [
                String(h.ranking),
                String(h.nisn),
                String(h.nama),
                formatAngka(h.nilai_akhir_q, 4),
                masuk ? STATUS_LABEL.masuk : STATUS_LABEL.tidak
            ],
            // Garis merah tepat di batas siswa masuk -> tidak masuk
            garisMerah: i > 0 && sebelumnyaMasuk && !masuk
        };
    });

    if (needsNewPage(y, 80)) halamanBaru();
    y = drawSectionTitle(doc, y, 'Hasil Perangkingan (WASPAS)');
    drawTable(rankHeader, barisRanking, rankBounds, rankAligns, 'Tidak ada data.');

    y += 30;

    // ===== TANDA TANGAN =====
    if (needsNewPage(y, 130)) halamanBaru();

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
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.text)
            .text(namaKepsek, sigX - 25, y, { width: sigW + 50, align: 'center', lineBreak: false });

        const lebarNama = doc.widthOfString(namaKepsek);
        const garisX = sigX + (sigW - lebarNama) / 2;
        doc.moveTo(garisX, y + 12).lineTo(garisX + lebarNama, y + 12)
            .lineWidth(0.6).strokeColor(COLORS.line).stroke();

        y += 17;
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.text)
            .text(`NIP. ${nipKepsek || '-'}`, sigX, y, { width: sigW, align: 'center', lineBreak: false });
    } else {
        // Tidak ada kepsek aktif: tetap tampilkan garis kosong seperti semula
        doc.moveTo(sigX + 15, y).lineTo(sigX + sigW - 15, y).lineWidth(0.6).strokeColor(COLORS.line).stroke();
        y += 5;
        doc.font('Helvetica').fontSize(9)
            .text('NIP. ', sigX + 15, y, { width: sigW - 30, align: 'left', lineBreak: false });
    }

    // ===== FOOTER SEMUA HALAMAN =====
    drawFooters(
        doc,
        `Laporan Penempatan Siswa Kelas Digital  |  ${SEKOLAH_INFO.nama}  |  TA ${periode.tahun_ajaran}`
    );

    doc.end();
}

function generateNilaiSiswaPDF(res, data) {
    const { periode, siswaList, kriteriaList } = data;

    const doc = new PDFDocument({ margin: 0, size: 'A4', layout: 'landscape', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename=Data_Nilai_Siswa_${periode.tahun_ajaran.replace('/', '-')}.pdf`
    );
    doc.pipe(res);

    let y = drawLetterhead(
        doc,
        L_WIDTH,
        'DATA NILAI SISWA PER KRITERIA',
        `Tahun Ajaran ${periode.tahun_ajaran}`
    );

    doc.fillColor(COLORS.text).font('Helvetica').fontSize(9)
        .text(`Jumlah siswa: ${siswaList.length}`, MARGIN, y, { width: L_CONTENT_WIDTH, lineBreak: false });
    y += 18;

    // Kolom: No | NISN | Nama | kriteria...
    const lebarNo = 30;
    const lebarNisn = 75;
    const lebarNama = 170;
    const jumlahKriteria = kriteriaList.length;
    const lebarKriteria = jumlahKriteria > 0
        ? (L_CONTENT_WIDTH - lebarNo - lebarNisn - lebarNama) / jumlahKriteria
        : 0;

    const bounds = [MARGIN, MARGIN + lebarNo, MARGIN + lebarNo + lebarNisn, MARGIN + lebarNo + lebarNisn + lebarNama];
    kriteriaList.forEach((_, i) => {
        bounds.push(bounds[3] + lebarKriteria * (i + 1));
    });
    bounds[bounds.length - 1] = L_WIDTH - MARGIN; // hindari selisih pembulatan

    const aligns = ['center', 'left', 'left'].concat(kriteriaList.map(() => 'center'));
    const headerCells = ['No', 'NISN', 'Nama Siswa'].concat(kriteriaList.map((k) => String(k.nama_kriteria)));
    const optsTabel = { fontSize: 8 };

    const hHeader = measureRow(doc, headerCells, bounds, { header: true, minH: 24, fontSize: 8 });

    function gambarHeader() {
        drawRow(doc, y, hHeader, bounds, headerCells, headerCells.map(() => 'center'),
            { header: true, fontSize: 8 });
        y += hHeader;
    }

    function halamanBaru() {
        doc.addPage({ layout: 'landscape', margin: 0, size: 'A4' });
        y = drawKopLanjutan(doc, L_WIDTH);
        gambarHeader();
    }

    if (needsNewPage(y, hHeader + 40, L_BOTTOM_LIMIT)) {
        doc.addPage({ layout: 'landscape', margin: 0, size: 'A4' });
        y = drawKopLanjutan(doc, L_WIDTH);
    }
    gambarHeader();

    if (siswaList.length === 0) {
        drawRow(doc, y, 20, [bounds[0], bounds[bounds.length - 1]], ['Tidak ada data.'], ['center'], optsTabel);
        y += 20;
    }

    siswaList.forEach((s, idx) => {
        const cells = [
            String(idx + 1),
            String(s.nisn),
            String(s.nama)
        ].concat(kriteriaList.map((k) => {
            const nilai = (s.nilai && s.nilai[k.id_kriteria] !== undefined && s.nilai[k.id_kriteria] !== null)
                ? s.nilai[k.id_kriteria] : '-';
            return String(nilai);
        }));

        const h = measureRow(doc, cells, bounds, optsTabel);

        if (needsNewPage(y, h, L_BOTTOM_LIMIT)) halamanBaru();

        drawRow(doc, y, h, bounds, cells, aligns, optsTabel);
        y += h;
    });

    drawFooters(
        doc,
        `Data Nilai Siswa per Kriteria  |  ${SEKOLAH_INFO.nama}  |  TA ${periode.tahun_ajaran}`
    );

    doc.end();
}

module.exports = { generateLaporanPDF, generateNilaiSiswaPDF };