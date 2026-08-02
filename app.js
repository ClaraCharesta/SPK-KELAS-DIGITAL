const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const db = require('./config/database');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 2 }
}));


const authRoutes = require('./routes/authRoutes');
app.use('/', authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});