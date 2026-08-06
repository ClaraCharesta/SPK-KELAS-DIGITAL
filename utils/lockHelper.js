const waspasModel = require('../models/waspasModel');

async function cekTerkunci(id_periode) {
    if (!id_periode) return false;
    return await waspasModel.checkAdaSiswaLulus(id_periode);
}

module.exports = { cekTerkunci };