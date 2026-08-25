const rateLimit = require('express-rate-limit');

/**
 * Stricter rate limiter for sensitive authentication endpoints.
 * Protects against brute-force password guessing and registration spam.
 * Allows 20 requests per 15-minute window per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per 15 minutes
  standardHeaders: true, // Return standard RateLimit headers
  legacyHeaders: false, // Disable legacy X-RateLimit-* headers
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
    });
  },
});

module.exports = {
  authLimiter,
};
