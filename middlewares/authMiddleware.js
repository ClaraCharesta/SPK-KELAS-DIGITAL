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

module.exports = { isAuthenticated, checkRole };