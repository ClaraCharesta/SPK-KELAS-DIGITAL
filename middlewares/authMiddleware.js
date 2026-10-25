const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

const checkRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.session.user || !allowedRoles.includes(req.session.user.role)) {
            return res.status(403).send('Anda tidak memiliki akses ke halaman ini.');
        }
        next();
    };
};

const DASHBOARD_BY_ROLE = {
    admin: '/admin/dashboard',
    operator: '/operator/dashboard',
    kepsek: '/kepsek/dashboard'
};

// Kalau akun sedang wajib ganti password (habis reset lewat "Lupa Password" atau direset admin),
// paksa dia tetap di halaman dashboard (biar overlay ganti password muncul) dan blokir akses ke halaman lain.
const wajibGantiPasswordGuard = (req, res, next) => {
    if (req.session.user && req.session.user.wajibGantiPassword) {
        res.locals.wajibGantiPassword = true;

        const dashboardRolePath = DASHBOARD_BY_ROLE[req.session.user.role] || '/login';
        const allowedPaths = ['/dashboard', dashboardRolePath, '/ganti-password-wajib', '/logout'];

        if (!allowedPaths.includes(req.path)) {
            return res.redirect('/dashboard');
        }
    } else {
        res.locals.wajibGantiPassword = false;
    }
    next();
};

module.exports = { isAuthenticated, checkRole, wajibGantiPasswordGuard };