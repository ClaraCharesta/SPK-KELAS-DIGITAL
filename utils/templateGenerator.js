const ExcelJS = require('exceljs');

const MAX_BARIS_TEMPLATE = 500; // jumlah baris kosong yang disiapkan untuk diisi + dropdown

const GARIS_TIPIS = (warna) => ({
    top: { style: 'thin', color: { argb: warna } },
    bottom: { style: 'thin', color: { argb: warna } },
    left: { style: 'thin', color: { argb: warna } },
    right: { style: 'thin', color: { argb: warna } }
});

async function generateTemplateSiswa(res) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Template Siswa');

    // Nama kolom TIDAK BOLEH diubah: dibaca persis oleh proses import.
    // (Ejaan "PEKERJAAAN AYAH" dengan tiga A memang disengaja, sesuai yang dibaca controller.)
    const headers = ['NISN', 'NAMA SISWA', 'JENIS KELAMIN SISWA', 'ASAL SEKOLAH', 'PEKERJAAAN AYAH', 'PEKERJAAN IBU', 'APAKAH ANANDA PENERIMA PIP / PKH'];
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, color: { argb: 'FF0B2545' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        if (colNumber === 1) {
            // Kolom NISN dikuning-in biar mencolok
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF200' } };
        } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EDFD' } };
        }
        cell.border = GARIS_TIPIS('FFB0B0B0');
    });

    headerRow.getCell(1).note = 'NISN 10 digit angka. Kolom ini berformat TEKS sehingga angka 0 di depan TETAP ADA (contoh: 0095924661).';
    headerRow.getCell(3).note = 'Pilih dari dropdown: Laki-Laki atau Perempuan.';
    headerRow.getCell(7).note = 'Pilih dari dropdown: YA atau TIDAK.';

    sheet.columns = [
        { width: 18 }, { width: 32 }, { width: 20 }, { width: 26 }, { width: 22 }, { width: 22 }, { width: 32 }
    ];

    // Tidak ada baris contoh di sheet ini: semua baris di bawah header kosong dan siap diisi,
    // jadi jumlah data yang masuk persis sama dengan jumlah baris yang kamu isi.
    // Contoh pengisian ada di sheet "Petunjuk Pengisian".
    for (let i = 2; i <= MAX_BARIS_TEMPLATE + 1; i++) {
        // NISN: format TEKS ("@") supaya 0 di depan tetap ada, dan harus tepat 10 karakter.
        const sel = sheet.getCell(`A${i}`);
        sel.numFmt = '@';
        sel.alignment = { horizontal: 'left' };
        sel.dataValidation = {
            type: 'textLength',
            operator: 'equal',
            allowBlank: true,
            formulae: [10],
            showInputMessage: true,
            promptTitle: 'NISN',
            prompt: 'Isi tepat 10 digit angka, termasuk angka 0 di depan (contoh: 0095924661).',
            showErrorMessage: true,
            errorStyle: 'error',
            errorTitle: 'NISN tidak valid',
            error: 'NISN harus tepat 10 digit angka (contoh: 0095924661).'
        };

        // Nama, sekolah, pekerjaan: teks biasa.
        ['B', 'D', 'E', 'F'].forEach(kolom => {
            sheet.getCell(`${kolom}${i}`).numFmt = '@';
        });

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

        ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(kolom => {
            sheet.getCell(`${kolom}${i}`).border = GARIS_TIPIS('FFEFEFEF');
        });
    }

    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ==== SHEET KEDUA: PETUNJUK PENGISIAN ====
    // Sheet TERPISAH agar header di sheet utama tetap di baris 1 (import membaca header dari baris pertama).
    const petunjuk = workbook.addWorksheet('Petunjuk Pengisian');
    petunjuk.columns = [{ width: 3 }, { width: 95 }];
    const isiPetunjuk = [
        ['', ''],
        ['', 'PETUNJUK PENGISIAN TEMPLATE DATA SISWA'],
        ['', ''],
        ['', '1. Jangan mengubah nama kolom (baris header) di sheet "Template Siswa".'],
        ['', '2. Isi data mulai dari baris 2. Sheet ini sengaja dibiarkan kosong, tidak ada baris contoh yang perlu dihapus.'],
        ['', '3. NISN wajib 10 digit angka dan tidak boleh sama antar siswa. Kolom NISN berformat teks, jadi angka 0 di depan tetap ada (contoh: 0095924661).'],
        ['', '4. Jika NISN disalin dari file lain, tempel sebagai teks (Paste Special > Values/Text) supaya angka 0 di depan tidak hilang.'],
        ['', '5. NAMA SISWA, PEKERJAAAN AYAH, dan PEKERJAAN IBU hanya boleh huruf (tanpa angka/simbol). Pekerjaan boleh dikosongkan (otomatis "Tidak bekerja").'],
        ['', '6. ASAL SEKOLAH boleh huruf dan angka, contoh: "SMPN 1 Padang". Hanya SMP / MTs / SMPLB / Paket B yang diterima.'],
        ['', '7. JENIS KELAMIN SISWA dan APAKAH ANANDA PENERIMA PIP / PKH dipilih dari dropdown (klik sel, lalu klik panah kecil di sisi kanan).'],
        ['', '8. Baris yang datanya tidak lengkap atau formatnya salah akan dilewati sistem saat import, dan sistem menampilkan rincian baris yang gagal.'],
        ['', ''],
        ['', 'CONTOH PENGISIAN (satu baris):'],
        ['', 'NISN: 0095924661 | NAMA SISWA: Adelia Fitri | JENIS KELAMIN: Perempuan | ASAL SEKOLAH: SMPN 12 Padang | AYAH: Nelayan | IBU: IRT | PIP/PKH: TIDAK'],
        ['', ''],
        ['', 'Jika ada pertanyaan lebih lanjut, silakan hubungi Admin/Super Admin sistem.']
    ];
    isiPetunjuk.forEach(baris => petunjuk.addRow(baris));
    petunjuk.getCell('B2').font = { bold: true, size: 13, color: { argb: 'FF0B2545' } };
    for (let r = 4; r <= 11; r++) {
        petunjuk.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'middle' };
        petunjuk.getRow(r).height = 34;
    }
    petunjuk.getCell('B13').font = { bold: true, color: { argb: 'FF0B2545' } };
    petunjuk.getCell('B14').alignment = { wrapText: true, vertical: 'middle' };
    petunjuk.getRow(14).height = 34;
    petunjuk.getCell('B16').font = { italic: true, color: { argb: 'FF777777' } };

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
        cell.border = GARIS_TIPIS('FFB0B0B0');
    });

    sheet.columns = [
        { width: 18 }, { width: 32 },
        ...kriteriaList.map(() => ({ width: 22 }))
    ];

    // Skala tiap kolom kriteria (samakan logikanya dengan validasi di importNilai)
    // "akademik"/"psikotes" => skala 0-100 (boleh desimal, 2 angka di belakang koma)
    // lainnya => skala 1-5 (bilangan bulat saja)
    const skalaPerKriteria = kriteriaList.map(k => {
        const namaLower = String(k.nama_kriteria || '').toLowerCase();
        const isSkor100 = namaLower.indexOf('akademik') !== -1 || namaLower.indexOf('psikotes') !== -1;
        return isSkor100 ? { min: 0, max: 100, tipe: 'decimal' } : { min: 1, max: 5, tipe: 'whole' };
    });

    // Baris per siswa; NISN dikirim sebagai TEKS agar angka 0 di depan tetap ada.
    siswaList.forEach(s => {
        const row = [String(s.nisn === undefined || s.nisn === null ? '' : s.nisn), s.nama];
        kriteriaList.forEach((k, idx) => {
            const mentah = s.nilai && s.nilai[k.id_kriteria] !== undefined ? s.nilai[k.id_kriteria] : null;
            let nilai = '';
            if (mentah !== null && mentah !== '' && Number.isFinite(Number(mentah))) {
                nilai = skalaPerKriteria[idx].tipe === 'whole'
                    ? Math.round(Number(mentah))
                    : Math.round((Number(mentah) + Number.EPSILON) * 100) / 100;
            }
            row.push(nilai);
        });
        const addedRow = sheet.addRow(row);
        addedRow.eachCell(cell => {
            cell.border = GARIS_TIPIS('FFEFEFEF');
        });
    });

    // Validasi rentang angka per kolom kriteria (baris siswa yang ada + buffer kosong)
    const totalBarisData = Math.max(siswaList.length, MAX_BARIS_TEMPLATE);

    // Kolom NISN berformat teks agar angka 0 di depan tetap ada (juga di baris kosong).
    for (let i = 2; i <= totalBarisData + 1; i++) {
        sheet.getCell(`A${i}`).numFmt = '@';
    }

    kriteriaList.forEach((k, idx) => {
        const kolomHuruf = kolomKeHuruf(3 + idx); // kriteria mulai kolom ke-3 (C)
        const skala = skalaPerKriteria[idx];
        const isBulat = skala.tipe === 'whole';

        for (let i = 2; i <= totalBarisData + 1; i++) {
            const cell = sheet.getCell(`${kolomHuruf}${i}`);

            cell.numFmt = isBulat ? '0' : '0.00';
            cell.alignment = { horizontal: 'center' };

            if (isBulat) {
                cell.dataValidation = {
                    type: 'whole',
                    operator: 'between',
                    allowBlank: true,
                    formulae: [skala.min, skala.max],
                    showInputMessage: true,
                    promptTitle: 'Skala 1 - 5',
                    prompt: 'Isi bilangan bulat 1, 2, 3, 4, atau 5. Tidak boleh 0 dan tidak boleh desimal.',
                    showErrorMessage: true,
                    errorStyle: 'error',
                    errorTitle: 'Nilai tidak valid',
                    error: 'Hanya boleh bilangan bulat 1, 2, 3, 4, atau 5 (tidak boleh 0 dan tidak boleh desimal).'
                };
            } else {
                cell.dataValidation = {
                    type: 'decimal',
                    operator: 'between',
                    allowBlank: true,
                    formulae: [skala.min, skala.max],
                    showInputMessage: true,
                    promptTitle: 'Skala 0 - 100',
                    prompt: 'Isi angka 0 sampai 100. Desimal boleh pakai koma atau titik. Sistem otomatis menyimpan 2 angka di belakang koma.',
                    showErrorMessage: true,
                    errorStyle: 'warning',
                    errorTitle: 'Periksa kembali nilai',
                    error: 'Nilai harus antara 0 sampai 100. Desimal boleh pakai koma atau titik; sistem otomatis menyimpan 2 angka di belakang koma. Jika tetap ingin memakai nilai ini, pilih Yes, tetapi nilai di luar 0-100 akan ditolak saat import.'
                };
            }
        }
    });

    sheet.getColumn(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ==== SHEET KEDUA: PETUNJUK PENGISIAN ====
    const petunjuk = workbook.addWorksheet('Petunjuk Pengisian');
    petunjuk.columns = [{ width: 3 }, { width: 95 }];
    const daftarSkalaText = kriteriaList.map((k, idx) => {
        const s = skalaPerKriteria[idx];
        return `   - ${k.nama_kriteria}: skala ${s.min}-${s.max}${s.tipe === 'whole' ? ' (hanya bilangan bulat 1, 2, 3, 4, 5; tidak boleh 0 dan tidak boleh desimal)' : ' (boleh desimal, otomatis disimpan 2 angka di belakang koma)'}`;
    });
    const isiPetunjuk = [
        ['', ''],
        ['', 'PETUNJUK PENGISIAN TEMPLATE NILAI SISWA'],
        ['', ''],
        ['', '1. Jangan mengubah nama kolom (baris header), urutan kolom, maupun urutan baris NISN.'],
        ['', '2. Kolom NISN dan NAMA hanya untuk referensi/pencocokan data, jangan diubah.'],
        ['', '3. Nilai dicocokkan ke sistem berdasarkan kolom NISN, pastikan NISN sesuai dengan data siswa yang sudah terdaftar.'],
        ['', '4. Rentang nilai untuk tiap kriteria:'],
        ...daftarSkalaText.map(t => ['', t]),
        ['', '5. Desimal boleh ditulis dengan tanda koma (85,5) atau titik (85.5), keduanya dikenali sistem. Nilai tanpa desimal seperti 92 otomatis disimpan sebagai 92,00. Nilai dengan lebih dari 2 angka di belakang koma dibulatkan ke 2 angka.'],
        ['', '6. Sel yang dikosongkan akan dilewati (tidak menimpa nilai yang sudah tersimpan sebelumnya).'],
        ['', '7. Baris/nilai dengan format salah (bukan angka, atau di luar rentang) akan dilewati sistem saat import, dan sistem menampilkan penyebab serta rincian baris dan kolom yang gagal.'],
        ['', '8. Kolom NISN berformat teks sehingga angka 0 di depan tetap ada. Lebih aman jangan mengubah kolom NISN.'],
        ['', ''],
        ['', 'Jika ada pertanyaan lebih lanjut, silakan hubungi Admin/Super Admin sistem.']
    ];
    isiPetunjuk.forEach(baris => petunjuk.addRow(baris));
    petunjuk.getCell('B2').font = { bold: true, size: 13, color: { argb: 'FF0B2545' } };
    petunjuk.eachRow((row, rowNumber) => {
        if (rowNumber >= 4) {
            row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
            row.height = 32;
        }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Template_Input_Nilai_Siswa.xlsx');
    await workbook.xlsx.write(res);
    res.end();
}

// Helper: ubah nomor kolom (1, 2, 3, ...) jadi huruf kolom Excel (A, B, C, ...)
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