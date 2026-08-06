const PDFDocument = require('pdfkit');
function generateLaporanPDF(res, data) {
    const { periode, hasilRanking, bobotKriteria, namaSekolah = 'SMAN 12 Padang' } = data;
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Laporan_Kelas_Digital_${periode.tahun_ajaran.replace('/', '-')}.pdf`);
    doc.pipe(res);
    const primaryColor = '#123a82';
    const accentColor = '#1d5fd6';
    const lightBg = '#f4f8ff';
    // ===== HEADER BANNER =====
    doc.rect(0, 0, 595, 100).fill(primaryColor);
    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
        .text(namaSekolah, 40, 25, { align: 'left' });
    doc.fontSize(11).font('Helvetica')
        .text('LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL', 40, 50);
    doc.fontSize(10)
        .text(`Tahun Ajaran ${periode.tahun_ajaran}  •  Kuota: ${periode.kuota_kelas_digital} siswa`, 40, 68);
    doc.y = 125;
    doc.x = 40;
    // ===== BOBOT KRITERIA (Card style) =====
    doc.fillColor(primaryColor).fontSize(13).font('Helvetica-Bold').text('Bobot Kriteria (Hasil FUCOM)', 40, doc.y);
    doc.moveDown(0.6);
    let yBobot = doc.y;
    doc.roundedRect(40, yBobot, 515, 22, 4).fill(lightBg);
    doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold');
    doc.text('Kriteria', 50, yBobot + 6, { width: 350 });
    doc.text('Bobot', 420, yBobot + 6, { width: 100 });
    yBobot += 22;
    doc.font('Helvetica').fontSize(9);
    bobotKriteria.forEach((b, i) => {
        if (i % 2 === 0) {
            doc.rect(40, yBobot, 515, 20).fill('#fbfcfe');
        }
        doc.fillColor('#333333');
        doc.text(b.nama_kriteria, 50, yBobot + 5, { width: 350 });
        doc.font('Helvetica-Bold').fillColor(accentColor).text(`${(b.nilai_bobot * 100).toFixed(2)}%`, 420, yBobot + 5, { width: 100 });
        doc.font('Helvetica');
        yBobot += 20;
    });
    doc.y = yBobot + 20;
    // ===== HASIL RANKING =====
    doc.fillColor(primaryColor).fontSize(13).font('Helvetica-Bold').text('Hasil Perangkingan Siswa', 40, doc.y);
    doc.moveDown(0.6);
    const colX = { rank: 45, nisn: 85, nama: 155, q: 360, status: 430 };
    let y = doc.y;
    doc.roundedRect(40, y, 515, 22, 4).fill(primaryColor);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
    doc.text('Rank', colX.rank, y + 6, { width: 35 });
    doc.text('NISN', colX.nisn, y + 6, { width: 65 });
    doc.text('Nama', colX.nama, y + 6, { width: 200 });
    doc.text('Nilai Q', colX.q, y + 6, { width: 60 });
    doc.text('Status', colX.status, y + 6, { width: 110 });
    y += 22;
    const statusColor = { lulus: '#27ae60', diusulkan: '#1d5fd6', cadangan: '#e67e22' };
    const statusLabel = { lulus: 'Lulus', diusulkan: 'Diusulkan', cadangan: 'Cadangan' };
    doc.font('Helvetica').fontSize(9);
    hasilRanking.forEach((h, i) => {
        if (y > 760) {
            doc.addPage();
            y = 40;
        }
        if (i % 2 === 0) doc.rect(40, y, 515, 20).fill('#fbfcfe');
        doc.fillColor('#333333');
        doc.font('Helvetica-Bold').text(`#${h.ranking}`, colX.rank, y + 5, { width: 35 });
        doc.font('Helvetica').text(h.nisn, colX.nisn, y + 5, { width: 65 });
        doc.text(h.nama, colX.nama, y + 5, { width: 200 });
        doc.text(parseFloat(h.nilai_akhir_q).toFixed(4), colX.q, y + 5, { width: 60 });
        const warna = statusColor[h.status_penerimaan] || '#999';
        doc.roundedRect(colX.status, y + 3, 75, 14, 7).fill(warna);
        doc.fillColor('#ffffff').fontSize(8).text(statusLabel[h.status_penerimaan] || h.status_penerimaan, colX.status, y + 6, { width: 75, align: 'center' });
        doc.fontSize(9);
        y += 20;
    });
    doc.y = y + 25;
    // ===== FOOTER TANDA TANGAN =====
    if (doc.y > 680) doc.addPage();
    doc.moveDown(1);
    const tglSekarang = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.fillColor('#333333').fontSize(10).font('Helvetica').text(`Padang, ${tglSekarang}`, 380, doc.y, { width: 175 });
    doc.moveDown(0.3);
    doc.text('Kepala Sekolah,', 380, doc.y, { width: 175 });
    doc.moveDown(3);
    doc.font('Helvetica-Bold').text('(_____________________)', 380, doc.y, { width: 175 });
    // Footer garis bawah tiap halaman
    doc.fontSize(7).fillColor('#aaaaaa')
        .text(`Dicetak otomatis oleh Sistem Pendukung Keputusan — ${namaSekolah}`, 40, 800, { width: 515, align: 'center' });
    doc.end();
}

function generateNilaiSiswaPDF(res, data) {
    const { periode, siswaList, kriteriaList, namaSekolah = 'SMAN 12 Padang' } = data;

    const doc = new PDFDocument({ margin: 0, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Data_Nilai_Siswa_${periode.tahun_ajaran.replace('/', '-')}.pdf`);
    doc.pipe(res);

    const primaryColor = '#123a82';

    doc.rect(0, 0, 842, 80).fill(primaryColor);
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text(namaSekolah, 40, 20);
    doc.fontSize(10).font('Helvetica').text(`Data Nilai Siswa per Kriteria — Tahun Ajaran ${periode.tahun_ajaran}`, 40, 45);

    let y = 100;
    const colWidth = 700 / (kriteriaList.length + 2);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
    doc.roundedRect(40, y, 762, 20, 3).fill(primaryColor);
    doc.fillColor('#ffffff');
    doc.text('NISN', 45, y + 6, { width: 70 });
    doc.text('Nama', 115, y + 6, { width: 150 });
    let xKriteria = 265;
    kriteriaList.forEach(k => {
        doc.text(k.nama_kriteria, xKriteria, y + 6, { width: colWidth - 5 });
        xKriteria += colWidth;
    });
    y += 20;

    doc.font('Helvetica').fontSize(8);
    siswaList.forEach((s, i) => {
        if (y > 540) { doc.addPage({ layout: 'landscape' }); y = 40; }
        if (i % 2 === 0) doc.rect(40, y, 762, 18).fill('#f7f9fc');
        doc.fillColor('#333333');
        doc.text(s.nisn, 45, y + 4, { width: 70 });
        doc.text(s.nama, 115, y + 4, { width: 150 });
        let xVal = 265;
        kriteriaList.forEach(k => {
            const nilai = s.nilai && s.nilai[k.id_kriteria] !== undefined && s.nilai[k.id_kriteria] !== null ? s.nilai[k.id_kriteria] : '-';
            doc.text(String(nilai), xVal, y + 4, { width: colWidth - 5 });
            xVal += colWidth;
        });
        y += 18;
    });

    doc.end();
}

module.exports = { generateLaporanPDF, generateNilaiSiswaPDF };