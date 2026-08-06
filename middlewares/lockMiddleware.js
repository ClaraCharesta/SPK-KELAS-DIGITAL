const periodeModel = require('../models/periodeModel');
const waspasModel = require('../models/waspasModel');

const cekLock = async (req, res, next) => {
    try {
        const periode = await periodeModel.getActivePeriode();
        if (!periode) return next();

        const terkunci = await waspasModel.checkAdaSiswaLulus(periode.id_periode);
        if (terkunci) {
            const basePath = '/' + req.originalUrl.split('/')[1] + '/' + req.originalUrl.split('/')[2];
            return res.redirect(basePath + '?error=' + encodeURIComponent('Data terkunci karena sudah ada siswa yang ditetapkan Lulus.'));
        }

        req.periodeAktif = periode;
        next();
    } catch (err) {
        console.error(err);
        res.status(500).send('Terjadi kesalahan sistem.');
    }
};

module.exports = cekLock;