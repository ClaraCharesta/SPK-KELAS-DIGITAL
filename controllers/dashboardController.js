const dashboardModel = require('../models/dashboardModel');
const periodeModel = require('../models/periodeModel');
const akunSiswaModel = require('../models/akunSiswaModel');
const siswaModel = require('../models/siswaModel');
const db = require('../config/database');
const { cekTerkunci } = require('../utils/lockHelper');
const { cekBobotFinal } = require('../utils/bobotHelper');
const { isPeriodeSudahMulai } = require('../utils/periodeHelper');

// Tautan tujuan dari dashboard. GANTI nilai "perankingan" jika route menu
// Perankingan/WASPAS di aplikasimu berbeda.
const LINK = {
    fucom: '/admin/fucom',
    siswa: '/admin/siswa',
    nilai: '/admin/nilai',
    perankingan: '/admin/waspas'
};

// ===== Helper tanggal =====
function tanggalLokal(val) {
    if (!val) return null;

    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        return new Date(val.getFullYear(), val.getMonth(), val.getDate());
    }

    const bagian = String(val).split('T')[0].split('-').map(Number);
    if (bagian.length !== 3 || bagian.some(isNaN)) return null;

    return new Date(bagian[0], bagian[1] - 1, bagian[2]);
}

function formatTanggalIndo(val) {
    const t = tanggalLokal(val);
    if (!t) return '-';
    return t.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function selisihHariDariHariIni(val) {
    const t = tanggalLokal(val);
    if (!t) return null;

    const now = new Date();
    const hariIni = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return Math.round((t.getTime() - hariIni.getTime()) / 86400000);
}

function persen(bagian, total) {
    return total > 0 ? Math.round((bagian / total) * 100) : 0;
}

// ======================================================================
// Membangun seluruh data "Progres Periode Berjalan" untuk dashboard operator.
// Hanya membaca data, tidak mengubah apa pun di database.
// ======================================================================
async function bangunProgres(periodeAktif) {
    const idPeriode = periodeAktif.id_periode;

    const R = (await akunSiswaModel.ringkasan(idPeriode)) || {};
    const siswaList = await siswaModel.getAllWithAkun(idPeriode);
    const raw = await dashboardModel.getProgresPeriode(idPeriode);
    const bobotFinal = Boolean(await cekBobotFinal(idPeriode));
    const terkunci = Boolean(await cekTerkunci(idPeriode));
    const sudahMulai = Boolean(isPeriodeSudahMulai(periodeAktif));

    // ----- Angka ringkasan (sumbernya sama dengan halaman Data Siswa) -----
    const total = Number(R.total) || siswaList.length;
    const tanpaAkun = Number(R.tanpaAkun) || 0;
    const akunAktif = Number(R.aktif) || 0;
    const akunNonaktif = Number(R.nonaktif) || 0;
    const berminat = Number(R.berminat) || 0;
    const tidakBerminat = Number(R.tidakBerminat) || 0;
    const belumRespon = Number(R.belumKonfirmasi) || 0;

    const totalKriteria = raw.totalKriteria;

    // ----- Daftar siswa + masalah yang perlu ditindaklanjuti -----
    const daftarSiswa = siswaList.map(function (s) {
        const punyaAkun = Boolean(s.punya_akun);
        const minat = punyaAkun ? (s.status_minat || 'belum_respon') : 'belum_respon';
        const terisi = Number(raw.nilaiPerSiswa[String(s.id_siswa)] || 0);
        const nilaiLengkap = totalKriteria > 0 && terisi >= totalKriteria;

        const masalah = [];
        if (!punyaAkun) masalah.push('tanpa_akun');
        if (minat === 'belum_respon') masalah.push('belum_respon');
        if (minat === 'berminat' && !nilaiLengkap) masalah.push('nilai_kurang');

        let aksiHref = null;
        let aksiLabel = null;

        if (!punyaAkun) {
            aksiHref = LINK.siswa + '?filter=tanpa_akun';
            aksiLabel = 'Buat akun';
        } else if (minat === 'belum_respon') {
            aksiHref = LINK.siswa + '?minat=belum_respon';
            aksiLabel = 'Konfirmasi minat';
        } else if (masalah.indexOf('nilai_kurang') !== -1) {
            aksiHref = LINK.nilai + '/' + s.id_siswa;
            aksiLabel = 'Isi nilai';
        }

        let lastLogin = null;
        if (punyaAkun && s.last_login) {
            const dl = new Date(s.last_login);
            lastLogin = isNaN(dl.getTime()) ? null : formatTanggalIndo(dl);
        }

        return {
            id: s.id_siswa,
            nisn: s.nisn || '-',
            nama: s.nama || '-',
            punyaAkun,
            statusAkun: punyaAkun ? (s.status_akun || 'aktif') : 'tanpa_akun',
            minat,
            terisi,
            nilaiLengkap,
            belumGantiPassword: punyaAkun && Boolean(s.wajib_ganti_password),
            lastLogin,
            masalah,
            aksiHref,
            aksiLabel
        };
    });

    // ----- Kelengkapan nilai (hanya peserta berminat) -----
    const peserta = daftarSiswa.filter(function (s) { return s.minat === 'berminat'; });
    const nilaiLengkap = peserta.filter(function (s) { return s.nilaiLengkap; }).length;
    const nilaiKosong = peserta.filter(function (s) { return s.terisi === 0; }).length;
    const nilaiSebagian = Math.max(0, berminat - nilaiLengkap - nilaiKosong);

    const perKriteria = raw.kriteria.map(function (k) {
        return {
            nama: k.nama_kriteria,
            jenis: k.jenis,
            terisi: k.terisi,
            persen: persen(k.terisi, berminat)
        };
    });

    // ----- Kuota -----
    const kuota = Number(periodeAktif.kuota_kelas_digital) || 0;
    const selisihKuota = kuota - berminat;

    // ----- FUCOM -----
    const bobotList = raw.bobot.map(function (b) {
        return {
            nama: b.nama_kriteria,
            persen: Number((parseFloat(b.nilai_bobot) * 100).toFixed(2))
        };
    });
    const dfc = raw.bobot.length > 0 ? parseFloat(raw.bobot[0].nilai_dfc) : null;

    // ----- Periode -----
    const sisaHari = selisihHariDariHariIni(periodeAktif.tanggal_selesai);

    let statusLabel = 'Aktif';
    let statusKelas = 'badge-green';
    if (!sudahMulai) {
        statusLabel = 'Belum Aktif';
        statusKelas = 'badge-yellow';
    } else if (terkunci) {
        statusLabel = 'Difinalisasi';
        statusKelas = 'badge-blue';
    }

    // ----- Tahapan seleksi -----
    const langkah = [
        {
            no: 1,
            judul: 'Pembobotan FUCOM',
            selesai: bobotFinal,
            detail: bobotFinal
                ? 'Bobot final & konsisten'
                : (raw.jumlahResponden > 0 ? 'Data terisi, bobot belum final' : 'Data perbandingan belum diisi'),
            href: LINK.fucom,
            aksi: 'Buka menu Pembobotan Kriteria'
        },
        {
            no: 2,
            judul: 'Data Siswa',
            selesai: total > 0,
            detail: total > 0 ? total + ' siswa terdaftar' : 'Belum ada data siswa',
            href: LINK.siswa,
            aksi: 'Buka menu Data Siswa'
        },
        {
            no: 3,
            judul: 'Akun Siswa',
            selesai: total > 0 && tanpaAkun === 0,
            detail: total === 0
                ? 'Menunggu data siswa'
                : (tanpaAkun === 0 ? 'Semua siswa punya akun' : tanpaAkun + ' siswa belum punya akun'),
            href: LINK.siswa + '?filter=tanpa_akun',
            aksi: 'Lihat siswa yang belum punya akun'
        },
        {
            no: 4,
            judul: 'Kesediaan Siswa',
            selesai: total > 0 && belumRespon === 0,
            detail: total === 0
                ? 'Menunggu data siswa'
                : (belumRespon === 0 ? 'Semua siswa sudah merespons' : belumRespon + ' siswa belum merespons'),
            href: LINK.siswa + '?minat=belum_respon',
            aksi: 'Lihat siswa yang belum merespons'
        },
        {
            no: 5,
            judul: 'Kelengkapan Nilai',
            selesai: berminat > 0 && nilaiLengkap >= berminat,
            detail: berminat === 0
                ? 'Belum ada peserta berminat'
                : nilaiLengkap + ' dari ' + berminat + ' peserta lengkap',
            href: LINK.nilai,
            aksi: 'Buka menu Input Nilai'
        },
        {
            no: 6,
            judul: 'Perankingan WASPAS',
            selesai: raw.jumlahHasilWaspas > 0,
            detail: raw.jumlahHasilWaspas > 0
                ? raw.jumlahHasilWaspas + ' siswa sudah diranking'
                : 'Belum dihitung',
            href: LINK.perankingan,
            aksi: 'Buka menu Perankingan'
        },
        {
            no: 7,
            judul: 'Finalisasi Hasil',
            selesai: terkunci,
            detail: terkunci ? 'Hasil sudah difinalisasi' : 'Belum difinalisasi',
            href: LINK.perankingan,
            aksi: 'Buka menu Perankingan'
        }
    ];

    const idxBerjalan = langkah.findIndex(function (l) { return !l.selesai; });
    langkah.forEach(function (l, i) {
        l.status = l.selesai ? 'selesai' : (i === idxBerjalan ? 'berjalan' : 'menunggu');
    });

    const tahapSelesai = langkah.filter(function (l) { return l.selesai; }).length;

    // ----- Daftar hal yang perlu ditindaklanjuti -----
    const tindakan = [];
    function tambah(tingkat, teks, href, label) {
        tindakan.push({ tingkat: tingkat, teks: teks, href: href || null, label: label || null });
    }

    if (!sudahMulai) {
        tambah('info', 'Periode ini baru dimulai pada ' + formatTanggalIndo(periodeAktif.tanggal_mulai) + '.');
    }

    if (!terkunci && sisaHari !== null) {
        if (sisaHari < 0) {
            tambah('bahaya', 'Tanggal selesai periode sudah lewat. Hubungi Admin untuk memperpanjang periode.');
        } else if (sisaHari <= 7) {
            tambah('peringatan', 'Periode berakhir ' + (sisaHari === 0 ? 'hari ini' : 'dalam ' + sisaHari + ' hari') + ' (' + formatTanggalIndo(periodeAktif.tanggal_selesai) + ').');
        }
    }

    if (!bobotFinal) {
        tambah('peringatan', 'Pembobotan FUCOM belum final. Seluruh tombol di menu Data Siswa tetap nonaktif sampai bobot final.', LINK.fucom, 'Buka Pembobotan');
    }

    if (bobotFinal && total === 0) {
        tambah('info', 'Belum ada data siswa pada periode ini.', LINK.siswa, 'Tambah / Import Siswa');
    }

    if (tanpaAkun > 0) {
        tambah('peringatan', tanpaAkun + ' siswa belum punya akun.', LINK.siswa + '?filter=tanpa_akun', 'Lihat siswa');
    }

    if (belumRespon > 0) {
        tambah('peringatan', belumRespon + ' siswa belum merespons kesediaan. Input nilai tetap nonaktif sampai semuanya merespons.', LINK.siswa + '?minat=belum_respon', 'Lihat siswa');
    }

    if (raw.belumLogin > 0) {
        tambah('info', raw.belumLogin + ' akun aktif belum pernah login.');
    }

    if (raw.belumGantiPassword > 0) {
        tambah('info', raw.belumGantiPassword + ' akun aktif belum mengganti password awal.');
    }

    if (berminat > 0 && nilaiLengkap < berminat) {
        tambah('peringatan', (berminat - nilaiLengkap) + ' peserta berminat belum lengkap nilainya.', LINK.nilai, 'Isi nilai');
    }

    if (kuota > 0 && berminat > kuota) {
        tambah('info', 'Peserta berminat (' + berminat + ') melebihi kuota (' + kuota + ') sebanyak ' + (berminat - kuota) + ' siswa.');
    }

    if (tindakan.length === 0) {
        tambah('sukses', 'Tidak ada hal yang perlu ditindaklanjuti saat ini.');
    }

    return {
        periode: {
            tahunAjaran: periodeAktif.tahun_ajaran,
            kuota,
            tanggalMulai: formatTanggalIndo(periodeAktif.tanggal_mulai),
            tanggalSelesai: formatTanggalIndo(periodeAktif.tanggal_selesai),
            sisaHari,
            sudahMulai,
            statusLabel,
            statusKelas
        },
        persenTahap: persen(tahapSelesai, langkah.length),
        tahapSelesai,
        tahapTotal: langkah.length,
        langkah,
        siswa: {
            total,
            tanpaAkun,
            akunAktif,
            akunNonaktif,
            berminat,
            belumRespon,
            tidakBerminat,
            belumLogin: raw.belumLogin,
            belumGantiPassword: raw.belumGantiPassword
        },
        persen: {
            akun: persen(total - tanpaAkun, total),
            respons: persen(total - belumRespon, total),
            nilai: persen(nilaiLengkap, berminat)
        },
        nilai: {
            berminat,
            lengkap: nilaiLengkap,
            sebagian: nilaiSebagian,
            kosong: nilaiKosong,
            totalKriteria,
            perKriteria
        },
        kuota: {
            kuota,
            terisi: berminat,
            angkaSelisih: Math.abs(selisihKuota),
            labelSelisih: selisihKuota >= 0 ? 'Sisa kuota' : 'Melebihi kuota',
            melebihi: selisihKuota < 0,
            persen: kuota > 0 ? Math.min(100, Math.round((berminat / kuota) * 100)) : 0
        },
        fucom: {
            final: bobotFinal,
            responden: raw.jumlahResponden,
            dfc,
            bobot: bobotList
        },
        waspas: {
            sudah: raw.jumlahHasilWaspas > 0,
            jumlah: raw.jumlahHasilWaspas
        },
        terkunci,
        tindakan,
        daftarSiswa
    };
}

const dashboardController = {
    async showSuperAdminDashboard(req, res) {
        try {
            const stats = await dashboardModel.getSuperAdminStats();

            res.render('superadmin/dashboard', {
                user: req.session.user,
                stats,
                activePage: 'dashboard',
                pageTitle: 'Dashboard Admin'
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data dashboard.');
        }
    },

    async showAdminDashboard(req, res) {
        try {
            const [[periode]] = await db.query(
                "SELECT id_periode FROM periode_seleksi WHERE status_periode = 'aktif' LIMIT 1"
            );

            const stats = periode
                ? await dashboardModel.getAdminStats(periode.id_periode)
                : {
                    totalSiswa: 0,
                    totalKriteria: 0,
                    kriteriaTerisi: 0,
                    statusFucom: 'Belum',
                    statusWaspas: 'Belum'
                };

            const latestPeriode = await periodeModel.getLatestPeriode();
            const chartData = await dashboardModel.getChartData(
                latestPeriode ? latestPeriode.id_periode : null
            );
            const riwayatPeriode = await dashboardModel.getRiwayatAntarPeriode();

            // Data progres periode berjalan. Jika gagal dibangun, dashboard lama tetap tampil.
            let progres = null;
            let progresGagal = false;

            if (periode) {
                try {
                    const periodeAktif = await periodeModel.getActivePeriode();
                    if (periodeAktif) progres = await bangunProgres(periodeAktif);
                } catch (errProgres) {
                    console.error('ERROR PROGRES DASHBOARD:', errProgres);
                    progres = null;
                    progresGagal = true;
                }
            }

            res.render('admin/dashboard', {
                user: req.session.user,
                stats,
                chartData,
                latestPeriode,
                riwayatPeriode,
                progres,
                progresGagal,
                activePage: 'dashboard',
                pageTitle: 'Dashboard Operator'
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data dashboard.');
        }
    },

    async showKepsekDashboard(req, res) {
        try {
            const latestPeriode = await periodeModel.getLatestPeriode();
            const chartData = await dashboardModel.getChartData(
                latestPeriode ? latestPeriode.id_periode : null
            );
            const riwayatPeriode = await dashboardModel.getRiwayatAntarPeriode();

            res.render('kepsek/dashboard', {
                user: req.session.user,
                chartData,
                latestPeriode,
                riwayatPeriode,
                activePage: 'dashboard',
                pageTitle: 'Dashboard Kepala Sekolah'
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Terjadi kesalahan mengambil data dashboard.');
        }
    }
};

module.exports = dashboardController;