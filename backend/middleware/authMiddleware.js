const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401);
      return next(new Error('Not authorized, token missing.'));
    }

    const token = authHeader.split(' ')[1];
    if (!token || typeof token !== 'string') {
      res.status(401);
      return next(new Error('Not authorized, token missing.'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.id) {
      res.status(401);
      return next(new Error('Not authorized, token invalid.'));
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      res.status(401);
      return next(new Error('Not authorized, user not found.'));
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401);
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Not authorized, token expired.'));
    }
    return next(new Error('Not authorized, token invalid.'));
  }
};

const requireReviewerRole = (req, res, next) => {
  if (!req.user) {
    res.status(401);
    return next(new Error('Not authorized, authentication required.'));
  }

  const allowedRoles = ['reviewer', 'admin', 'instructor'];
  const userRole = req.user.role || 'student';

  if (!allowedRoles.includes(userRole)) {
    res.status(403);
    return next(new Error('Access denied: reviewer permissions required.'));
  }

  next();
};

module.exports = {
  protect,
  requireReviewerRole,
};
