const ExcelJS = require('exceljs');

const MAX_BARIS_TEMPLATE = 500; // jumlah baris kosong yang disiapkan untuk diisi + dropdown

async function generateTemplateSiswa(res) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Template Siswa');

    const headers = ['NISN', 'NAMA SISWA', 'JENIS KELAMIN SISWA', 'ASAL SEKOLAH', 'PEKERJAAAN AYAH', 'PEKERJAAN IBU', 'APAKAH ANANDA PENERIMA PIP / PKH'];
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, color: { argb: 'FF0B2545' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        if (colNumber === 1) {
            // Kolom NISN wajib angka, dikuning-in biar mencolok
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF200' } };
        } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EDFD' } };
        }
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
            bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
            left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
            right: { style: 'thin', color: { argb: 'FFB0B0B0' } }
        };
    });

    // Catatan kecil di kolom yang wajib pakai dropdown, biar admin sadar harus pilih bukan ketik manual
    headerRow.getCell(3).note = 'Wajib dipilih dari dropdown: Laki-Laki atau Perempuan. Klik sel di bawah header ini, lalu klik ikon panah ke bawah yang muncul.';
    headerRow.getCell(7).note = 'Wajib dipilih dari dropdown: YA atau TIDAK. Klik sel di bawah header ini, lalu klik ikon panah ke bawah yang muncul.';

    sheet.columns = [
        { width: 18 }, { width: 32 }, { width: 20 }, { width: 26 }, { width: 22 }, { width: 22 }, { width: 32 }
    ];

    // ==== BARIS CONTOH (baris 2 & 3) ====
    // Sengaja ditandai jelas "CONTOH - HAPUS SEBELUM IMPORT" pada kolom Nama.
    // Kalau baris ini tidak sengaja ikut ter-upload, sistem otomatis akan menolaknya
    // (validasi Nama hanya boleh huruf, sedangkan di sini ada tanda "-").
    const barisContoh = [
        ['0000000001', 'CONTOH - HAPUS SEBELUM IMPORT', 'Laki-Laki', 'SMPN 1 Padang', 'Wiraswasta', 'Ibu Rumah Tangga', 'TIDAK'],
        ['0000000002', 'CONTOH - HAPUS SEBELUM IMPORT', 'Perempuan', 'SMPN 5 Padang', 'Petani', 'Pedagang', 'YA']
    ];
    barisContoh.forEach(dataBaris => {
        const row = sheet.addRow(dataBaris);
        row.eachCell(cell => {
            cell.font = { italic: true, color: { argb: 'FF9A6300' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E0' } };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
                bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
                left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
                right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
            };
        });
    });

    // ==== DROPDOWN (DATA VALIDATION) UNTUK JENIS KELAMIN & PIP/PKH ====
    // Diterapkan mulai baris 2 (termasuk baris contoh) sampai baris ke-(MAX_BARIS_TEMPLATE + 1)
    for (let i = 2; i <= MAX_BARIS_TEMPLATE + 1; i++) {
        sheet.getCell(`C${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"Laki-Laki,Perempuan"'],
            showErrorMessage: true,
            errorStyle: 'error',
            errorTitle: 'Pilihan tidak valid',
            error: 'Silakan pilih "Laki-Laki" atau "Perempuan" dari dropdown yang tersedia.'
        };
        sheet.getCell(`G${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"YA,TIDAK"'],
            showErrorMessage: true,
            errorStyle: 'error',
            errorTitle: 'Pilihan tidak valid',
            error: 'Silakan pilih "YA" atau "TIDAK" dari dropdown yang tersedia.'
        };
        // Border tipis di baris-baris kosong biar rapi & jelas batas kolomnya
        if (i > 3) {
            ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(kolom => {
                sheet.getCell(`${kolom}${i}`).border = {
                    top: { style: 'thin', color: { argb: 'FFEFEFEF' } },
                    bottom: { style: 'thin', color: { argb: 'FFEFEFEF' } },
                    left: { style: 'thin', color: { argb: 'FFEFEFEF' } },
                    right: { style: 'thin', color: { argb: 'FFEFEFEF' } }
                };
            });
        }
    }

    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ==== SHEET KEDUA: PETUNJUK PENGISIAN ====
    // Diletakkan di sheet TERPISAH (bukan baris tambahan di sheet utama), supaya baris header
    // di sheet utama tetap di posisi baris 1 — karena proses import membaca header dari baris pertama.
    const petunjuk = workbook.addWorksheet('Petunjuk Pengisian');
    petunjuk.columns = [{ width: 3 }, { width: 95 }];
    const isiPetunjuk = [
        ['', ''],
        ['', 'PETUNJUK PENGISIAN TEMPLATE DATA SISWA'],
        ['', ''],
        ['', '1. Jangan mengubah nama kolom (baris header) di sheet "Template Siswa".'],
        ['', '2. Kolom NISN wajib diisi angka saja, dan tidak boleh sama antar siswa.'],
        ['', '3. Kolom NAMA SISWA, PEKERJAAAN AYAH, dan PEKERJAAN IBU hanya boleh diisi huruf (tanpa angka/simbol).'],
        ['', '4. Kolom ASAL SEKOLAH boleh diisi huruf dan angka, contoh: "SMPN 1 Padang".'],
        ['', '5. Kolom JENIS KELAMIN SISWA WAJIB dipilih dari dropdown: klik sel, lalu klik ikon panah kecil di sisi kanan sel, pilih "Laki-Laki" atau "Perempuan".'],
        ['', '6. Kolom APAKAH ANANDA PENERIMA PIP / PKH WAJIB dipilih dari dropdown: pilih "YA" atau "TIDAK".'],
        ['', '7. Baris contoh (baris 2 dan 3 berwarna kuning muda bertuliskan "CONTOH - HAPUS SEBELUM IMPORT") WAJIB dihapus sebelum file ini diupload kembali ke sistem.'],
        ['', '8. Baris yang datanya tidak lengkap atau formatnya salah akan otomatis dilewati sistem saat proses import, dan akan muncul keterangan jumlah baris yang gagal.'],
        ['', ''],
        ['', 'Jika ada pertanyaan lebih lanjut, silakan hubungi Admin/Super Admin sistem.']
    ];
    isiPetunjuk.forEach(baris => petunjuk.addRow(baris));
    petunjuk.getCell('B2').font = { bold: true, size: 13, color: { argb: 'FF0B2545' } };
    for (let r = 4; r <= 11; r++) {
        petunjuk.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'middle' };
        petunjuk.getRow(r).height = 20;
    }
    petunjuk.getCell('B13').font = { italic: true, color: { argb: 'FF777777' } };

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
    headerRow.height = 24;
    headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, color: { argb: 'FF0B2545' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        if (colNumber === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF200' } }; // NISN kuning
        } else if (colNumber === 2) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }; // Nama abu-abu (referensi saja)
        } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EDFD' } };
        }
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
            bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
            left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
            right: { style: 'thin', color: { argb: 'FFB0B0B0' } }
        };
    });

    sheet.columns = [
        { width: 18 }, { width: 32 },
        ...kriteriaList.map(() => ({ width: 22 }))
    ];

    // Tentukan skala tiap kolom kriteria (samakan logikanya dengan validasi di importNilai)
    // Kriteria yang namanya mengandung "akademik" atau "psikotes" => skala 10-100 (boleh desimal)
    // Kriteria lainnya => skala 1-5 (bilangan bulat)
    const skalaPerKriteria = kriteriaList.map(k => {
        const namaLower = k.nama_kriteria.toLowerCase();
        const isSkor100 = namaLower.indexOf('akademik') !== -1 || namaLower.indexOf('psikotes') !== -1;
        return isSkor100 ? { min: 10, max: 100, tipe: 'decimal' } : { min: 1, max: 5, tipe: 'whole' };
    });

    // Isi baris per siswa, kolom nilai kriteria sudah pre-fill kalau ada datanya
    siswaList.forEach(s => {
        const row = [s.nisn, s.nama];
        kriteriaList.forEach(k => {
            const nilai = s.nilai && s.nilai[k.id_kriteria] !== undefined ? s.nilai[k.id_kriteria] : '';
            row.push(nilai);
        });
        const addedRow = sheet.addRow(row);
        addedRow.eachCell((cell, colNumber) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFEFEFEF' } },
                bottom: { style: 'thin', color: { argb: 'FFEFEFEF' } },
                left: { style: 'thin', color: { argb: 'FFEFEFEF' } },
                right: { style: 'thin', color: { argb: 'FFEFEFEF' } }
            };
        });
    });

    // Validasi rentang angka per kolom kriteria, mengikuti baris data siswa yang ada + buffer kosong
    const totalBarisData = Math.max(siswaList.length, MAX_BARIS_TEMPLATE);
    kriteriaList.forEach((k, idx) => {
        const kolomHuruf = kolomKeHuruf(3 + idx); // kolom C dst (index 1=A, 2=B, kriteria mulai kolom ke-3)
        const skala = skalaPerKriteria[idx];
        for (let i = 2; i <= totalBarisData + 1; i++) {
            sheet.getCell(`${kolomHuruf}${i}`).dataValidation = {
                type: skala.tipe,
                operator: 'between',
                allowBlank: true,
                formulae: [skala.min, skala.max],
                showErrorMessage: true,
                errorStyle: 'error',
                errorTitle: 'Nilai di luar skala',
                error: `Nilai untuk kriteria ini harus antara ${skala.min} sampai ${skala.max}${skala.tipe === 'whole' ? ' (bilangan bulat)' : ''}.`
            };
        }
    });

    sheet.getColumn(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ==== SHEET KEDUA: PETUNJUK PENGISIAN ====
    const petunjuk = workbook.addWorksheet('Petunjuk Pengisian');
    petunjuk.columns = [{ width: 3 }, { width: 95 }];
    const daftarSkalaText = kriteriaList.map((k, idx) => {
        const s = skalaPerKriteria[idx];
        return `   - ${k.nama_kriteria}: skala ${s.min}-${s.max}${s.tipe === 'whole' ? ' (bilangan bulat, tanpa desimal)' : ' (boleh desimal)'}`;
    });
    const isiPetunjuk = [
        ['', ''],
        ['', 'PETUNJUK PENGISIAN TEMPLATE NILAI SISWA'],
        ['', ''],
        ['', '1. Jangan mengubah nama kolom (baris header), urutan kolom, maupun urutan baris NISN.'],
        ['', '2. Kolom NISN dan NAMA hanya untuk referensi/pencocokan data — jangan diubah.'],
        ['', '3. Nilai dicocokkan ke sistem berdasarkan kolom NISN, pastikan NISN sesuai dengan data siswa yang sudah terdaftar.'],
        ['', '4. Rentang nilai untuk tiap kriteria:'],
        ...daftarSkalaText.map(t => ['', t]),
        ['', '5. Sel yang dikosongkan akan dilewati (tidak menimpa nilai yang sudah tersimpan sebelumnya).'],
        ['', '6. Baris/nilai dengan format salah (bukan angka, atau di luar rentang) akan otomatis dilewati sistem saat import, dan akan muncul keterangan jumlah yang gagal.'],
        ['', ''],
        ['', 'Jika ada pertanyaan lebih lanjut, silakan hubungi Admin/Super Admin sistem.']
    ];
    isiPetunjuk.forEach(baris => petunjuk.addRow(baris));
    petunjuk.getCell('B2').font = { bold: true, size: 13, color: { argb: 'FF0B2545' } };
    petunjuk.eachRow((row, rowNumber) => {
        if (rowNumber >= 4) {
            row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
            row.height = 20;
        }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Template_Input_Nilai_Siswa.xlsx');
    await workbook.xlsx.write(res);
    res.end();
}

// Helper: ubah nomor kolom (1, 2, 3, ...) jadi huruf kolom Excel (A, B, C, ...)
// Mendukung sampai kolom ganda seperti AA, AB, dst. jika suatu saat kriteria bertambah banyak
function kolomKeHuruf(nomorKolom) {
    let huruf = '';
    let n = nomorKolom;
    while (n > 0) {
        const sisa = (n - 1) % 26;
        huruf = String.fromCharCode(65 + sisa) + huruf;
        n = Math.floor((n - 1) / 26);
    }
    return huruf;
}

module.exports = { generateTemplateSiswa, generateTemplateNilai };