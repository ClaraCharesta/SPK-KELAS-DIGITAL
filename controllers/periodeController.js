const periodeModel = require('../models/periodeModel');
const kriteriaModel = require('../models/kriteriaModel');
const userModel = require('../models/userModel');
const waspasModel = require('../models/waspasModel');
const pengingatService = require('../services/pengingatService');

const MIN_JARAK_HARI_SELESAI = 7;

function tahunAjaranSekarang() {
    const y = new Date().getFullYear();
    return `${y}/${y + 1}`;
}

function tanggalKeString(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
    }
    return String(val).split('T')[0];
}

// Ambil tanggal periode sebagai string 'YYYY-MM-DD'.
// Utamakan kolom *_str hasil DATE_FORMAT dari MySQL (tidak kena masalah timezone),
// kalau tidak ada baru fallback ke konversi dari nilai asli.
// field: 'tanggal_mulai' atau 'tanggal_selesai'
function tanggalPeriode(p, field) {
    if (!p) return null;
    const str = p[field + '_str'];
    if (str) return String(str);
    return tanggalKeString(p[field]);
}

function hariIniString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function tambahHariString(str, n) {
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function formatTanggalIndoServer(str) {
    const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const [y, m, d] = str.split('-');
    return `${parseInt(d)} ${BULAN[parseInt(m) - 1]} ${y}`;
}

function rentangTahunAjaran(tahun_ajaran) {
    const m = String(tahun_ajaran || '').trim().match(/^(\d{4})\/(\d{4})$/);
    if (!m) return null;
    return { min: `${m[1]}-01-01`, max: `${m[2]}-12-31` };
}

function validasiTanggalPeriode(mulai, selesai, mulaiLama = null, selesaiLama = null, tahunAjaran = null) {
    const hariIni = hariIniString();
    const minSelesai = tambahHariString(hariIni, MIN_JARAK_HARI_SELESAI);

    const mulaiBaru = mulai || '';
    const selesaiBaru = selesai || '';
    const mulaiBerubah = mulaiBaru !== (mulaiLama || '');
    const selesaiBerubah = selesaiBaru !== (selesaiLama || '');

    const rentang = rentangTahunAjaran(tahunAjaran);
    if (rentang) {
        const teksRentang = `tahun ajaran ${String(tahunAjaran).trim()} (${formatTanggalIndoServer(rentang.min)} sampai ${formatTanggalIndoServer(rentang.max)})`;

        if (mulaiBaru && (mulaiBaru < rentang.min || mulaiBaru > rentang.max)) {
            return `Tanggal mulai harus berada di dalam ${teksRentang}.`;
        }
        if (selesaiBaru && (selesaiBaru < rentang.min || selesaiBaru > rentang.max)) {
            return `Tanggal selesai harus berada di dalam ${teksRentang}.`;
        }
    }

    if (mulaiBaru && mulaiBerubah && mulaiBaru < hariIni) {
        return `Tanggal mulai tidak boleh sebelum hari ini (${formatTanggalIndoServer(hariIni)}).`;
    }

    if (selesaiBaru && selesaiBerubah && selesaiBaru < minSelesai) {
        return `Tanggal selesai minimal ${MIN_JARAK_HARI_SELESAI} hari dari hari ini, yaitu ${formatTanggalIndoServer(minSelesai)} atau setelahnya.`;
    }

    if (mulaiBaru && selesaiBaru && selesaiBaru < mulaiBaru) {
        return 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
    }

    return null;
}

async function ambilPeriodeById(id_periode) {
    const semua = await periodeModel.getAll();
    return semua.find(x => String(x.id_periode) === String(id_periode)) || null;
}

function picuPengingat() {
    try {
        pengingatService.kirimPengingatHarian().catch(function (e) {
            console.error('[PENGINGAT] Gagal memicu pengingat:', e);
        });
    } catch (e) {
        console.error('[PENGINGAT] Gagal memicu pengingat:', e);
    }
}

// Sinkronkan status periode dengan tanggal:
// 1) tutup periode aktif yang tanggal selesainya sudah lewat
// 2) nonaktifkan semua akun siswa dari periode yang sudah ditutup
async function sinkronkanStatusPeriode(idUserLog = null) {
    try {
        const hariIni = hariIniString();
        const ditutup = await periodeModel.tutupPeriodeKedaluwarsa(hariIni);
        const dinonaktifkan = await periodeModel.nonaktifkanAkunPeriodeDitutup();

        if (ditutup > 0) {
            console.log(`[PERIODE] Hari ini ${hariIni}: ${ditutup} periode ditutup otomatis karena melewati tanggal selesai`);
        }
        if (dinonaktifkan > 0) {
            console.log(`[PERIODE] ${dinonaktifkan} akun siswa dinonaktifkan karena periodenya ditutup`);
        }

        if (idUserLog && ditutup > 0) {
            await userModel.logActivity(idUserLog, `Sistem menutup ${ditutup} periode seleksi yang melewati tanggal selesai`);
        }
        if (idUserLog && dinonaktifkan > 0) {
            await userModel.logActivity(idUserLog, `Sistem menonaktifkan ${dinonaktifkan} akun siswa dari periode yang ditutup`);
        }
    } catch (e) {
        console.error('Gagal menyinkronkan status periode:', e);
    }
}

// Urutan prioritas status (berdasarkan tanggal):
// 1. Ditutup  -> status_periode bukan 'aktif' ATAU tanggal selesai sudah lewat
// 2. Selesai  -> hasil seleksi sudah difinalisasi (dan periode masih berjalan)
// 3. Belum Aktif -> tanggal mulai belum tiba
// 4. Aktif
function computeDisplayStatus(p) {
    const hariIni = hariIniString();
    const tglSelesaiStr = tanggalPeriode(p, 'tanggal_selesai');
    const sudahLewat = !!tglSelesaiStr && tglSelesaiStr < hariIni;

    if (p.status_periode !== 'aktif' || sudahLewat) {
        return { label: 'Ditutup', badgeClass: 'badge-red' };
    }
    if (p.status_penyelesaian === 'selesai') {
        return { label: 'Selesai', badgeClass: 'badge-lulus' };
    }
    const tglMulaiStr = tanggalPeriode(p, 'tanggal_mulai');
    if (tglMulaiStr) {
        if (tglMulaiStr > hariIni) {
            return { label: 'Belum Aktif', badgeClass: 'badge-yellow' };
        }
    }
    return { label: 'Aktif', badgeClass: 'badge-green' };
}

const REGEX_TAHUN_AJARAN = /^(\d{4})\/(\d{4})$/;

async function validasiTahunAjaran(tahun_ajaran, excludeId = null) {
    const m = String(tahun_ajaran || '').trim().match(REGEX_TAHUN_AJARAN);

    if (!m) {
        return 'Format tahun ajaran harus 4 digit/4 digit. Contoh: 2027/2028.';
    }

    const awal = Number(m[1]);
    const akhir = Number(m[2]);

    if (akhir !== awal + 1) {
        return 'Tahun kedua harus tepat satu tahun setelah tahun pertama. Contoh: 2027/2028.';
    }

    const terbesar = await periodeModel.getTahunAwalTerbesar(excludeId);

    if (terbesar !== null && awal <= terbesar) {
        const terakhir = `${terbesar}/${terbesar + 1}`;
        const berikutnya = `${terbesar + 1}/${terbesar + 2}`;

        return `Tahun ajaran harus lebih baru dari periode terakhir (${terakhir}). Gunakan ${berikutnya} atau yang lebih besar.`;
    }

    return null;
}

const periodeController = {
    async index(req, res) {
        try {
            await sinkronkanStatusPeriode(req.session.user.id_user);

            const periodeListRaw = await periodeModel.getAll();
            const latestId = await periodeModel.getLatestId();

            const periodeList = await Promise.all(periodeListRaw.map(async p => ({
                ...p,
                tgl_mulai_str: tanggalPeriode(p, 'tanggal_mulai') || '',
                tgl_selesai_str: tanggalPeriode(p, 'tanggal_selesai') || '',
                display_status: computeDisplayStatus(p),
                bobot_final: await kriteriaModel.checkBobotSudahFinal(p.id_periode)
            })));

            const terbesar = await periodeModel.getTahunAwalTerbesar();
            const tahunSaran = terbesar !== null ? `${terbesar + 1}/${terbesar + 2}` : '';

            // Pastikan halaman selalu diambil ulang dari server (tidak dari cache browser)
            res.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });

            res.render('admin/periode', {
                user: req.session.user, periodeList, latestId, activePage: 'periode',
                pageTitle: 'Kelola Periode Seleksi',
                tahunSaran,
                tahunSekarang: tahunAjaranSekarang(),
                tahunTerakhir: terbesar !== null ? `${terbesar}/${terbesar + 1}` : '',
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data periode.');
        }
    },

    async create(req, res) {
        try {
            const { kuota_kelas_digital, tanggal_mulai, tanggal_selesai } = req.body;
            const tahun_ajaran = tahunAjaranSekarang();

            if (!tahun_ajaran || !kuota_kelas_digital) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Tahun ajaran dan kuota wajib diisi.'));
            }
            if (parseInt(kuota_kelas_digital) < 30) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Kuota minimal 30 siswa.'));
            }

            const tahunBersih = tahun_ajaran.trim();

            const sudahAdaTahunIni = await periodeModel.existsByTahunAjaran(tahunBersih);
            if (sudahAdaTahunIni) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent(`Periode tahun ajaran ${tahunBersih} sudah dibuat. Tahun ajaran otomatis mengikuti tahun sekarang dan tidak dapat diubah.`));
            }

            const pesanTahun = await validasiTahunAjaran(tahunBersih);
            if (pesanTahun) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent(pesanTahun));
            }

            const pesanTanggal = validasiTanggalPeriode(tanggal_mulai, tanggal_selesai, null, null, tahunBersih);
            if (pesanTanggal) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent(pesanTanggal));
            }

            const sudahAda = await periodeModel.existsByTahunAjaran(tahunBersih);
            if (sudahAda) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent(`Tahun ajaran "${tahunBersih}" sudah pernah dibuat sebelumnya. Gunakan nama lain, atau edit periode yang sudah ada.`));
            }

            const id_periode_baru = await periodeModel.create({
                tahun_ajaran: tahunBersih,
                kuota_kelas_digital,
                tanggal_mulai: tanggal_mulai || null,
                tanggal_selesai: tanggal_selesai || null
            });

            await kriteriaModel.createDefault(id_periode_baru);
            await userModel.logActivity(req.session.user.id_user, `Admin membuka periode seleksi baru: ${tahunBersih}`);

            const dinonaktifkan = await periodeModel.nonaktifkanAkunPeriodeDitutup();
            if (dinonaktifkan > 0) {
                await userModel.logActivity(
                    req.session.user.id_user,
                    `Sistem menonaktifkan ${dinonaktifkan} akun siswa dari periode yang ditutup`
                );
            }

            picuPengingat();

            res.redirect('/admin/periode?success=' + encodeURIComponent('Periode seleksi berhasil dibuat dan diaktifkan beserta 6 kriteria default.'));
        } catch (error) {
            console.error(error);
            res.redirect('/admin/periode?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
        }
    },

    async updateKuota(req, res) {
        try {
            const { id_periode, kuota_kelas_digital } = req.body;

            await sinkronkanStatusPeriode(req.session.user.id_user);

            if (parseInt(kuota_kelas_digital) < 30) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Kuota minimal 30 siswa.'));
            }

            const periodeLama = await ambilPeriodeById(id_periode);
            if (!periodeLama) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Periode tidak ditemukan.'));
            }
            if (periodeLama.status_periode !== 'aktif') {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Kuota tidak dapat diubah karena periode sudah ditutup.'));
            }

            if (await waspasModel.isFinal(id_periode)) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Kuota tidak dapat diubah karena hasil seleksi sudah difinalisasi.'));
            }

            if (await kriteriaModel.checkBobotSudahFinal(id_periode)) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Kuota tidak dapat diubah karena pembobotan FUCOM sudah dilakukan.'));
            }

            await periodeModel.updateKuota(id_periode, kuota_kelas_digital);

            await waspasModel.invalidateHasilJikaAda(id_periode);

            await userModel.logActivity(req.session.user.id_user, `Admin mengubah kuota periode ID ${id_periode} menjadi ${kuota_kelas_digital}`);
            res.redirect('/admin/periode?success=' + encodeURIComponent('Kuota berhasil diperbarui. Hasil ranking sebelumnya dikosongkan, silakan hitung ulang WASPAS.'));
        } catch (error) {
            console.error(error);
            res.redirect('/admin/periode?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
        }
    },

    async update(req, res) {
        try {
            const { id_periode, kuota_kelas_digital, tanggal_mulai, tanggal_selesai } = req.body;

            await sinkronkanStatusPeriode(req.session.user.id_user);

            const latestId = await periodeModel.getLatestId();

            if (parseInt(id_periode) !== latestId) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Hanya periode terbaru yang dapat diedit.'));
            }

            const periodeLama = await ambilPeriodeById(id_periode);
            if (!periodeLama) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Periode tidak ditemukan.'));
            }

            if (periodeLama.status_periode !== 'aktif') {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Periode sudah ditutup, tidak dapat diedit.'));
            }

            const statusPenyelesaian = await periodeModel.getStatusPenyelesaian(id_periode);
            if (statusPenyelesaian === 'selesai') {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Periode ini tidak dapat diedit karena hasil seleksinya sudah difinalisasi.'));
            }

            if (await kriteriaModel.checkBobotSudahFinal(id_periode)) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Periode ini tidak dapat diedit karena pembobotan FUCOM sudah dilakukan.'));
            }

            if (parseInt(kuota_kelas_digital) < 30) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Kuota minimal 30 siswa.'));
            }

            const tahunBersih = String(periodeLama.tahun_ajaran || '').trim();

            const pesanTahun = await validasiTahunAjaran(tahunBersih, id_periode);
            if (pesanTahun) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent(pesanTahun));
            }

            const pesanTanggal = validasiTanggalPeriode(
                tanggal_mulai,
                tanggal_selesai,
                tanggalPeriode(periodeLama, 'tanggal_mulai'),
                tanggalPeriode(periodeLama, 'tanggal_selesai'),
                tahunBersih
            );
            if (pesanTanggal) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent(pesanTanggal));
            }

            const sudahAda = await periodeModel.existsByTahunAjaran(tahunBersih, id_periode);
            if (sudahAda) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent(`Tahun ajaran "${tahunBersih}" sudah dipakai periode lain.`));
            }

            await periodeModel.update(id_periode, {
                tahun_ajaran: tahunBersih,
                kuota_kelas_digital,
                tanggal_mulai: tanggal_mulai || null,
                tanggal_selesai: tanggal_selesai || null
            });

            await waspasModel.invalidateHasilJikaAda(id_periode);

            await userModel.logActivity(req.session.user.id_user, `Admin memperbarui periode: ${tahunBersih}`);

            picuPengingat();

            res.redirect('/admin/periode?success=' + encodeURIComponent('Periode berhasil diperbarui.'));
        } catch (error) {
            console.error(error);
            res.redirect('/admin/periode?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
        }
    },

    async delete(req, res) {
        try {
            const { id_periode } = req.params;

            await sinkronkanStatusPeriode(req.session.user.id_user);

            const latestId = await periodeModel.getLatestId();

            if (parseInt(id_periode) !== latestId) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Hanya periode terbaru yang dapat dihapus.'));
            }

            const p = await ambilPeriodeById(id_periode);
            if (!p) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Periode tidak ditemukan.'));
            }

            if (p.status_periode !== 'aktif') {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Periode sudah ditutup, tidak dapat dihapus.'));
            }

            const statusPenyelesaian = await periodeModel.getStatusPenyelesaian(id_periode);
            if (statusPenyelesaian === 'selesai') {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Periode ini tidak dapat dihapus karena sudah difinalisasi dan tersimpan sebagai data historis.'));
            }

            if (await kriteriaModel.checkBobotSudahFinal(id_periode)) {
                return res.redirect('/admin/periode?error=' + encodeURIComponent('Periode ini tidak dapat dihapus karena pembobotan FUCOM sudah dijalankan dan final.'));
            }

            await periodeModel.deleteCascade(id_periode);
            await userModel.logActivity(req.session.user.id_user, `Admin menghapus periode ID ${id_periode} beserta seluruh data terkait`);
            res.redirect('/admin/periode?success=' + encodeURIComponent('Periode beserta seluruh data terkait berhasil dihapus.'));
        } catch (error) {
            console.error(error);
            res.redirect('/admin/periode?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
        }
    }
};

module.exports = periodeController;