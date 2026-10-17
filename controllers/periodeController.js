const periodeModel = require('../models/periodeModel');
const kriteriaModel = require('../models/kriteriaModel');
const userModel = require('../models/userModel');
const waspasModel = require('../models/waspasModel');
const pengingatService = require('../services/pengingatService');

// Jarak minimal (hari) antara hari ini dan tanggal selesai periode.
const MIN_JARAK_HARI_SELESAI = 7;

// Helper tanggal (aman untuk string 'YYYY-MM-DD' maupun objek Date)
function tanggalKeString(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
    }
    return String(val).split('T')[0];
}

function hariIniString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Tambah n hari ke string 'YYYY-MM-DD', hasilnya string 'YYYY-MM-DD'
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

// Validasi rentang tanggal periode. Mengembalikan pesan error, atau null jika valid.
// - Tanggal mulai (jika diisi dan DIUBAH) minimal hari ini.
// - Tanggal selesai (jika diisi dan DIUBAH) minimal 7 hari dari hari ini.
// - Tanggal selesai tidak boleh sebelum tanggal mulai.
// mulaiLama/selesaiLama dipakai saat edit/perpanjang: tanggal yang tidak diubah tidak divalidasi ulang,
// supaya periode yang sudah berjalan tetap bisa diedit.
function validasiTanggalPeriode(mulai, selesai, mulaiLama = null, selesaiLama = null) {
    const hariIni = hariIniString();
    const minSelesai = tambahHariString(hariIni, MIN_JARAK_HARI_SELESAI);

    const mulaiBaru = mulai || '';
    const selesaiBaru = selesai || '';
    const mulaiBerubah = mulaiBaru !== (mulaiLama || '');
    const selesaiBerubah = selesaiBaru !== (selesaiLama || '');

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

// Periode dianggap kedaluwarsa jika tanggal selesai sudah lewat dan belum difinalisasi.
// Berlaku untuk SEMUA periode (bukan hanya yang terbaru).
function isKedaluwarsa(p) {
    if (!p || !p.tanggal_selesai) return false;
    if (p.status_penyelesaian === 'selesai') return false;
    return tanggalKeString(p.tanggal_selesai) < hariIniString();
}

// Ambil satu periode berdasarkan ID (memakai getAll yang sudah ada)
async function ambilPeriodeById(id_periode) {
    const semua = await periodeModel.getAll();
    return semua.find(x => String(x.id_periode) === String(id_periode)) || null;
}

// Kembalikan true (dan sudah redirect) jika periode kedaluwarsa.
// Dipakai sebagai penjaga di sisi server supaya request manual (URL/Postman) juga ditolak.
async function tolakJikaKedaluwarsa(res, id_periode, aksi) {
    const p = await ambilPeriodeById(id_periode);
    if (p && isKedaluwarsa(p)) {
        res.redirect('/superadmin/periode?error=' + encodeURIComponent(
            `Periode kedaluwarsa tidak dapat ${aksi}. Gunakan fitur Perpanjang untuk mengubah tanggal periode.`
        ));
        return true;
    }
    return false;
}

// Jalankan pengecekan pengingat di latar belakang (tidak menunggu, tidak boleh bikin error).
function picuPengingat() {
    try {
        pengingatService.kirimPengingatHarian().catch(function (e) {
            console.error('[PENGINGAT] Gagal memicu pengingat:', e);
        });
    } catch (e) {
        console.error('[PENGINGAT] Gagal memicu pengingat:', e);
    }
}

// Tidak bergantung pada latestId
function computeDisplayStatus(p) {
    if (isKedaluwarsa(p)) {
        return { label: 'Kedaluwarsa', badgeClass: 'badge-orange' };
    }
    if (p.status_periode !== 'aktif') {
        return { label: 'Ditutup', badgeClass: 'badge-red' };
    }
    if (p.tanggal_mulai) {
        const tglMulaiStr = tanggalKeString(p.tanggal_mulai);
        if (tglMulaiStr > hariIniString()) {
            return { label: 'Belum Aktif', badgeClass: 'badge-yellow' };
        }
    }
    return { label: 'Aktif', badgeClass: 'badge-green' };
}

const REGEX_TAHUN_AJARAN = /^(\d{4})\/(\d{4})$/;

// Mengembalikan pesan error, atau null jika tahun ajaran valid.
// Aturan: format YYYY/YYYY, tahun kedua = tahun pertama + 1,
// dan tahun awal harus LEBIH BESAR dari tahun awal periode lain yang sudah ada.
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
        // Kembali ke bentuk "YYYY/YYYY" dari tahun terbesar yang tercatat.
        const terakhir = `${terbesar}/${terbesar + 1}`;
        const berikutnya = `${terbesar + 1}/${terbesar + 2}`;

        return `Tahun ajaran harus lebih baru dari periode terakhir (${terakhir}). Gunakan ${berikutnya} atau yang lebih besar.`;
    }

    return null;
}

const periodeController = {
    async index(req, res) {
        try {
            // Pastikan periode kedaluwarsa sudah ditutup sebelum halaman ditampilkan
            // (cadangan kalau cron belum sempat jalan). Kalau gagal, halaman tetap tampil.
            try {
                await pengingatService.tutupPeriodeKedaluwarsa();
            } catch (e) {
                console.error('Gagal menutup periode kedaluwarsa:', e);
            }

            const periodeListRaw = await periodeModel.getAll();
            const latestId = await periodeModel.getLatestId();

            // kedaluwarsa berlaku untuk semua periode; bisa_perpanjang hanya periode terbaru
            const periodeList = await Promise.all(periodeListRaw.map(async p => ({
                ...p,
                display_status: computeDisplayStatus(p),
                kedaluwarsa: isKedaluwarsa(p),
                bisa_perpanjang: p.id_periode === latestId,
                bobot_final: await kriteriaModel.checkBobotSudahFinal(p.id_periode)
            })));

            // Banner hanya untuk periode terbaru yang kedaluwarsa (satu-satunya yang bisa diperpanjang)
            const periodeKedaluwarsa = periodeList.find(p => p.kedaluwarsa && p.bisa_perpanjang) || null;

            // Saran tahun ajaran berikutnya untuk modal "Buka Periode Baru".
            const terbesar = await periodeModel.getTahunAwalTerbesar();
            const tahunSaran = terbesar !== null ? `${terbesar + 1}/${terbesar + 2}` : '';

            res.render('superadmin/periode', {
                user: req.session.user, periodeList, latestId, activePage: 'periode',
                pageTitle: 'Kelola Periode Seleksi',
                tahunSaran,
                tahunTerakhir: terbesar !== null ? `${terbesar}/${terbesar + 1}` : '',
                periodeKedaluwarsa,
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
            const { tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai } = req.body;

            if (!tahun_ajaran || !kuota_kelas_digital) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Tahun ajaran dan kuota wajib diisi.'));
            }
            if (parseInt(kuota_kelas_digital) < 30) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Kuota minimal 30 siswa.'));
            }

            const pesanTahun = await validasiTahunAjaran(tahun_ajaran.trim());
            if (pesanTahun) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent(pesanTahun));
            }

            // Validasi rentang tanggal (mulai minimal hari ini, selesai minimal 7 hari dari hari ini)
            const pesanTanggal = validasiTanggalPeriode(tanggal_mulai, tanggal_selesai);
            if (pesanTanggal) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent(pesanTanggal));
            }

            const sudahAda = await periodeModel.existsByTahunAjaran(tahun_ajaran);
            if (sudahAda) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent(`Tahun ajaran "${tahun_ajaran}" sudah pernah dibuat sebelumnya. Gunakan nama lain, atau edit periode yang sudah ada.`));
            }

            const id_periode_baru = await periodeModel.create({ tahun_ajaran: tahun_ajaran.trim(), kuota_kelas_digital, tanggal_mulai, tanggal_selesai });

            await kriteriaModel.createDefault(id_periode_baru);
            await userModel.logActivity(req.session.user.id_user, `Super Admin membuka periode seleksi baru: ${tahun_ajaran}`);

            // Periode lama otomatis ditutup, jadi akun siswanya ikut dinonaktifkan.
            const dinonaktifkan = await periodeModel.nonaktifkanAkunPeriodeDitutup();
            if (dinonaktifkan > 0) {
                await userModel.logActivity(
                    req.session.user.id_user,
                    `Sistem menonaktifkan ${dinonaktifkan} akun siswa dari periode yang ditutup`
                );
            }

            picuPengingat();

            res.redirect('/superadmin/periode?success=' + encodeURIComponent('Periode seleksi berhasil dibuat dan diaktifkan beserta 6 kriteria default.'));
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
        }
    },

    async updateKuota(req, res) {
        try {
            const { id_periode, kuota_kelas_digital } = req.body;

            // Periode kedaluwarsa tidak boleh diubah kuotanya, harus diperpanjang dulu.
            if (await tolakJikaKedaluwarsa(res, id_periode, 'diubah kuotanya')) return;

            if (parseInt(kuota_kelas_digital) < 30) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Kuota minimal 30 siswa.'));
            }

            // Status Masuk/Tidak Masuk dihitung dari ranking dan kuota,
            // jadi kuota tidak boleh diubah setelah hasil difinalisasi.
            if (await waspasModel.isFinal(id_periode)) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Kuota tidak dapat diubah karena hasil seleksi sudah difinalisasi.'));
            }

            await periodeModel.updateKuota(id_periode, kuota_kelas_digital);

            // Perubahan kuota membuat hasil ranking lama tidak valid.
            await waspasModel.invalidateHasilJikaAda(id_periode);

            await userModel.logActivity(req.session.user.id_user, `Super Admin mengubah kuota periode ID ${id_periode} menjadi ${kuota_kelas_digital}`);
            res.redirect('/superadmin/periode?success=' + encodeURIComponent('Kuota berhasil diperbarui. Hasil ranking sebelumnya dikosongkan, silakan hitung ulang WASPAS.'));
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
        }
    },

    async setActive(req, res) {
        try {
            const { id_periode } = req.params;

            // Periode kedaluwarsa tidak boleh diaktifkan lewat jalur apa pun.
            const periodeTarget = await ambilPeriodeById(id_periode);
            if (periodeTarget && isKedaluwarsa(periodeTarget)) {
                const latestId = await periodeModel.getLatestId();
                const pesan = (periodeTarget.id_periode === latestId)
                    ? 'Periode ini tidak bisa diaktifkan karena tanggal selesainya sudah kedaluwarsa. Anda harus mengubah tanggal rentang periode terlebih dahulu lewat tombol Perpanjang.'
                    : 'Periode ini sudah kedaluwarsa dan bukan periode terbaru, sehingga tidak dapat diaktifkan kembali. Datanya tetap tersimpan sebagai arsip.';
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent(pesan));
            }

            await periodeModel.setActive(id_periode);

            // Periode lain ditutup (akunnya dinonaktifkan), periode ini dibuka kembali (akunnya diaktifkan).
            const dinonaktifkan = await periodeModel.nonaktifkanAkunPeriodeDitutup();
            const diaktifkan = await periodeModel.aktifkanKembaliAkunPeriode(id_periode);

            await userModel.logActivity(
                req.session.user.id_user,
                `Super Admin mengaktifkan periode ID ${id_periode} (${diaktifkan} akun siswa diaktifkan, ${dinonaktifkan} akun periode lain dinonaktifkan)`
            );
            res.redirect('/superadmin/periode?success=' + encodeURIComponent('Periode berhasil diaktifkan.'));
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
        }
    },

    async update(req, res) {
        try {
            const { id_periode, tahun_ajaran, kuota_kelas_digital, tanggal_mulai, tanggal_selesai } = req.body;
            const latestId = await periodeModel.getLatestId();

            if (parseInt(id_periode) !== latestId) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Hanya periode terbaru yang dapat diedit.'));
            }

            // Periode kedaluwarsa tidak boleh diedit, harus lewat Perpanjang.
            if (await tolakJikaKedaluwarsa(res, id_periode, 'diedit')) return;

            const statusPenyelesaian = await periodeModel.getStatusPenyelesaian(id_periode);
            if (statusPenyelesaian === 'selesai') {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Periode ini tidak dapat diedit karena hasil seleksinya sudah difinalisasi.'));
            }

            if (await kriteriaModel.checkBobotSudahFinal(id_periode)) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Periode ini tidak dapat diedit karena pembobotan FUCOM sudah dijalankan dan final.'));
            }

            if (parseInt(kuota_kelas_digital) < 30) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Kuota minimal 30 siswa.'));
            }

            // Validasi rentang tanggal. Tanggal yang tidak diubah dibiarkan apa adanya,
            // supaya periode yang sudah berjalan tetap bisa diedit (misal hanya ganti kuota).
            const periodeLama = await ambilPeriodeById(id_periode);
            const pesanTanggal = validasiTanggalPeriode(
                tanggal_mulai,
                tanggal_selesai,
                periodeLama ? tanggalKeString(periodeLama.tanggal_mulai) : null,
                periodeLama ? tanggalKeString(periodeLama.tanggal_selesai) : null
            );
            if (pesanTanggal) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent(pesanTanggal));
            }

            // Saat edit, periode ini dikecualikan dari pembanding supaya tahunnya sendiri tidak dianggap bentrok.
            const pesanTahun = await validasiTahunAjaran(String(tahun_ajaran || '').trim(), id_periode);
            if (pesanTahun) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent(pesanTahun));
            }

            const sudahAda = await periodeModel.existsByTahunAjaran(tahun_ajaran, id_periode);
            if (sudahAda) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent(`Tahun ajaran "${tahun_ajaran}" sudah dipakai periode lain.`));
            }

            await periodeModel.update(id_periode, { tahun_ajaran: tahun_ajaran.trim(), kuota_kelas_digital, tanggal_mulai, tanggal_selesai });

            // Kuota bisa ikut berubah, jadi hasil ranking lama dikosongkan.
            await waspasModel.invalidateHasilJikaAda(id_periode);

            await userModel.logActivity(req.session.user.id_user, `Super Admin memperbarui periode: ${tahun_ajaran}`);

            picuPengingat();

            res.redirect('/superadmin/periode?success=' + encodeURIComponent('Periode berhasil diperbarui.'));
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
        }
    },

    // Perpanjang periode kedaluwarsa: HANYA mengubah rentang tanggal.
    // Tahun ajaran, kuota, bobot FUCOM, dan hasil ranking tidak disentuh,
    // sehingga tetap bisa dipakai walaupun bobot FUCOM sudah final.
    async perpanjang(req, res) {
        try {
            const { id_periode, tanggal_mulai, tanggal_selesai } = req.body;
            const latestId = await periodeModel.getLatestId();

            if (parseInt(id_periode) !== latestId) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Hanya periode terbaru yang dapat diperpanjang.'));
            }

            const p = await ambilPeriodeById(id_periode);
            if (!p) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Periode tidak ditemukan.'));
            }

            if (p.status_penyelesaian === 'selesai') {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Periode ini tidak dapat diperpanjang karena hasil seleksinya sudah difinalisasi.'));
            }

            if (!tanggal_selesai) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Tanggal selesai baru wajib diisi.'));
            }

            // Tanggal selesai baru wajib minimal 7 hari dari hari ini (selesaiLama = null
            // supaya SELALU divalidasi). Tanggal mulai hanya divalidasi kalau diubah dari yang lama.
            const pesanTanggal = validasiTanggalPeriode(
                tanggal_mulai,
                tanggal_selesai,
                tanggalKeString(p.tanggal_mulai),
                null
            );
            if (pesanTanggal) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent(pesanTanggal));
            }

            await periodeModel.update(id_periode, {
                tahun_ajaran: p.tahun_ajaran,
                kuota_kelas_digital: p.kuota_kelas_digital,
                tanggal_mulai: tanggal_mulai || null,
                tanggal_selesai
            });

            // Jika periode sempat ditutup (otomatis/manual), buka kembali beserta akun siswanya.
            let diaktifkan = 0;
            if (p.status_periode !== 'aktif') {
                await periodeModel.setActive(id_periode);
                await periodeModel.nonaktifkanAkunPeriodeDitutup();
                diaktifkan = await periodeModel.aktifkanKembaliAkunPeriode(id_periode);
            }

            await userModel.logActivity(
                req.session.user.id_user,
                `Super Admin memperpanjang periode ${p.tahun_ajaran} hingga ${tanggal_selesai} (${diaktifkan} akun siswa diaktifkan kembali)`
            );

            picuPengingat();

            res.redirect('/superadmin/periode?success=' + encodeURIComponent('Periode berhasil diperpanjang dan diaktifkan kembali. Data siswa, nilai, dan hasil ranking sebelumnya tetap aman.'));
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
        }
    },

    async delete(req, res) {
        try {
            const { id_periode } = req.params;
            const latestId = await periodeModel.getLatestId();

            if (parseInt(id_periode) !== latestId) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Hanya periode terbaru yang dapat dihapus.'));
            }

            // Periode kedaluwarsa tidak boleh dihapus, harus diperpanjang dulu.
            if (await tolakJikaKedaluwarsa(res, id_periode, 'dihapus')) return;

            const statusPenyelesaian = await periodeModel.getStatusPenyelesaian(id_periode);
            if (statusPenyelesaian === 'selesai') {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Periode ini tidak dapat dihapus karena sudah difinalisasi dan tersimpan sebagai data historis.'));
            }

            if (await kriteriaModel.checkBobotSudahFinal(id_periode)) {
                return res.redirect('/superadmin/periode?error=' + encodeURIComponent('Periode ini tidak dapat dihapus karena pembobotan FUCOM sudah dijalankan dan final.'));
            }

            await periodeModel.deleteCascade(id_periode);
            await userModel.logActivity(req.session.user.id_user, `Super Admin menghapus periode ID ${id_periode} beserta seluruh data terkait`);
            res.redirect('/superadmin/periode?success=' + encodeURIComponent('Periode beserta seluruh data terkait berhasil dihapus.'));
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
        }
    },

    async tutupManual(req, res) {
        try {
            const { id_periode } = req.params;

            // Periode kedaluwarsa tidak boleh ditutup manual (sudah otomatis tertutup/kedaluwarsa).
            if (await tolakJikaKedaluwarsa(res, id_periode, 'ditutup manual')) return;

            await periodeModel.tutupManual(id_periode);

            // Periode ditutup, akun siswanya ikut dinonaktifkan.
            const dinonaktifkan = await periodeModel.nonaktifkanAkunPeriodeDitutup();

            await userModel.logActivity(
                req.session.user.id_user,
                `Super Admin menutup periode ID ${id_periode} secara manual (${dinonaktifkan} akun siswa dinonaktifkan)`
            );
            res.redirect('/superadmin/periode?success=' + encodeURIComponent('Periode berhasil ditutup. Akun siswa pada periode ini dinonaktifkan.'));
        } catch (error) {
            console.error(error);
            res.redirect('/superadmin/periode?error=' + encodeURIComponent('Terjadi kesalahan sistem.'));
        }
    }
};

module.exports = periodeController;