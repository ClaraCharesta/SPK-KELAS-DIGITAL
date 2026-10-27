const waspasModel = require('../models/waspasModel');

async function cekTerkunci(id_periode) {
    return waspasModel.isFinal(id_periode);
}

module.exports = { cekTerkunci };