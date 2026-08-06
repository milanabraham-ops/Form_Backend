const jwt = require('jsonwebtoken')

// Access and refresh tokens use separate secrets so a leaked access token (short-lived, sent on
// every request) can never be replayed as a refresh token, and vice versa.
function getAccessSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')
  return secret
}

function getRefreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not configured')
  return secret
}

// Algorithm is pinned on both sign and verify — jsonwebtoken defaults to HS256 either way, but
// pinning explicitly on verify prevents an algorithm-confusion attack if that default ever
// changes upstream, and makes the intent unambiguous here.
const ALGORITHM = 'HS256'

function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email, name: user.name }, getAccessSecret(), {
    algorithm: ALGORITHM,
    expiresIn: '15m',
  })
}

function verifyAccessToken(token) {
  return jwt.verify(token, getAccessSecret(), { algorithms: [ALGORITHM] })
}

// The refresh token only ever needs the user id and the version it was issued at — no email/name,
// since it's never used to identify the user for anything other than minting a fresh access token.
function signRefreshToken(user) {
  return jwt.sign({ sub: user._id.toString(), v: user.refreshTokenVersion }, getRefreshSecret(), {
    algorithm: ALGORITHM,
    expiresIn: '30d',
  })
}

function verifyRefreshToken(token) {
  return jwt.verify(token, getRefreshSecret(), { algorithms: [ALGORITHM] })
}

module.exports = { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken }
