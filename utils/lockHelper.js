const db = require('../config/database');

async function cekTerkunci(id_periode) {
    const [[row]] = await db.query(
        'SELECT status_penyelesaian FROM periode_seleksi WHERE id_periode = ?',
        [id_periode]
    );
    return !!row && row.status_penyelesaian === 'selesai';
}

module.exports = { cekTerkunci };