const PDFDocument = require('pdfkit');

function generateLaporanPDF(res, data) {
    const { periode, hasilRanking, bobotKriteria, namaSekolah = 'SMAN 12 Padang' } = data;

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Laporan_Kelas_Digital_${periode.tahun_ajaran.replace('/', '-')}.pdf`);

    doc.pipe(res);

    // Header
    doc.fontSize(16).font('Helvetica-Bold').text(namaSekolah, { align: 'center' });
    doc.fontSize(13).font('Helvetica-Bold').text('LAPORAN HASIL PENEMPATAN SISWA KELAS DIGITAL', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Tahun Ajaran: ${periode.tahun_ajaran}`, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).text(`Kuota Kelas Digital: ${periode.kuota_kelas_digital} siswa`, { align: 'center' });
    doc.moveDown(1);

    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);

    // Bagian Bobot Kriteria
    doc.fontSize(12).font('Helvetica-Bold').text('Bobot Kriteria (Hasil FUCOM)');
    doc.moveDown(0.5);

    const startXBobot = 40;
    let yBobot = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Kriteria', startXBobot, yBobot, { width: 300 });
    doc.text('Bobot', startXBobot + 300, yBobot, { width: 100 });
    yBobot += 15;
    doc.moveTo(startXBobot, yBobot).lineTo(555, yBobot).stroke();
    yBobot += 5;

    doc.font('Helvetica');
    bobotKriteria.forEach(b => {
        doc.text(b.nama_kriteria, startXBobot, yBobot, { width: 300 });
        doc.text(`${(b.nilai_bobot * 100).toFixed(2)}%`, startXBobot + 300, yBobot, { width: 100 });
        yBobot += 16;
    });

    doc.y = yBobot + 15;
    doc.moveDown(0.5);

    // Bagian Hasil Ranking
    doc.fontSize(12).font('Helvetica-Bold').text('Hasil Perangkingan Siswa');
    doc.moveDown(0.5);

    const colX = { rank: 40, nisn: 75, nama: 145, q: 350, status: 420 };
    let y = doc.y;

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Rank', colX.rank, y, { width: 30 });
    doc.text('NISN', colX.nisn, y, { width: 65 });
    doc.text('Nama', colX.nama, y, { width: 200 });
    doc.text('Nilai Q', colX.q, y, { width: 60 });
    doc.text('Status', colX.status, y, { width: 100 });
    y += 15;
    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 5;

    doc.font('Helvetica');
    hasilRanking.forEach(h => {
        if (y > 750) {
            doc.addPage();
            y = 40;
        }
        doc.text(`#${h.ranking}`, colX.rank, y, { width: 30 });
        doc.text(h.nisn, colX.nisn, y, { width: 65 });
        doc.text(h.nama, colX.nama, y, { width: 200 });
        doc.text(parseFloat(h.nilai_akhir_q).toFixed(4), colX.q, y, { width: 60 });
        doc.text(h.status_penerimaan === 'diterima' ? 'Diterima' : 'Cadangan', colX.status, y, { width: 100 });
        y += 16;
    });

    doc.y = y + 20;

    // Footer tanda tangan
    if (doc.y > 680) doc.addPage();
    doc.moveDown(2);
    const tglSekarang = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.fontSize(10).text(`Padang, ${tglSekarang}`, 380, doc.y, { width: 175 });
    doc.moveDown(0.3);
    doc.text('Kepala Sekolah,', 380, doc.y, { width: 175 });
    doc.moveDown(3);
    doc.text('(_____________________)', 380, doc.y, { width: 175 });

    doc.end();
}

module.exports = { generateLaporanPDF };