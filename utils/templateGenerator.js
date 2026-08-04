const ExcelJS = require('exceljs');

async function generateTemplateSiswa(res) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Template Siswa');

    const headers = ['NISN', 'NAMA SISWA', 'JENIS KELAMIN SISWA', 'ASAL SEKOLAH', 'PEKERJAAAN AYAH', 'PEKERJAAN IBU', 'APAKAH ANANDA PENERIMA PIP / PKH'];
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center' };
        if (colNumber === 1) {
            // Highlight kolom NISN (kuning)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF200' } };
        } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EDFD' } };
        }
    });

    sheet.columns = [
        { width: 20 }, { width: 30 }, { width: 20 }, { width: 25 }, { width: 22 }, { width: 22 }, { width: 30 }
    ];

    // Baris contoh
    sheet.addRow(['0107455761', 'Contoh Nama Siswa', 'L', 'SMPN 1 Padang', 'Wiraswasta', 'Ibu Rumah Tangga', 'TIDAK']);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Template_Data_Siswa.xlsx');
    await workbook.xlsx.write(res);
    res.end();
}

async function generateTemplateNilai(res, siswaList, kriteriaList) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Template Nilai');

    const headers = ['NISN', 'NAMA (Referensi, jangan diubah)', ...kriteriaList.map(k => k.nama_kriteria)];
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center' };
        if (colNumber === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF200' } }; // NISN kuning
        } else if (colNumber === 2) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }; // Nama abu-abu (referensi saja)
        } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EDFD' } };
        }
    });

    sheet.columns = [
        { width: 18 }, { width: 30 },
        ...kriteriaList.map(() => ({ width: 20 }))
    ];

    // Isi baris per siswa, kolom nilai kriteria sudah pre-fill kalau ada datanya
    siswaList.forEach(s => {
        const row = [s.nisn, s.nama];
        kriteriaList.forEach(k => {
            const nilai = s.nilai && s.nilai[k.id_kriteria] !== undefined ? s.nilai[k.id_kriteria] : '';
            row.push(nilai);
        });
        sheet.addRow(row);
    });

    // Kunci kolom NISN dan Nama supaya tidak sengaja terhapus urutannya (opsional, styling saja)
    sheet.getColumn(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Template_Input_Nilai_Siswa.xlsx');
    await workbook.xlsx.write(res);
    res.end();
}

module.exports = { generateTemplateSiswa, generateTemplateNilai };