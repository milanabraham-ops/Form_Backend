const rateLimit = require('express-rate-limit')

// 5 attempts per minute per IP — applied to the endpoints most valuable to brute-force (login,
// Google sign-in, change-password). Successful requests aren't counted, so a legitimate user's
// normal traffic never gets throttled by their own activity, only by repeated failures.
const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts. Please try again in a minute.' },
})

module.exports = { authRateLimit }
