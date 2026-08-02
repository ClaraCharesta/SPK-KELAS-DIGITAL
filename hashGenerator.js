const bcrypt = require('bcrypt');

const password = 'admin123'; // bisa kamu ganti sesuai mau

bcrypt.hash(password, 10).then(hash => {
    console.log('Hash password:', hash);
});