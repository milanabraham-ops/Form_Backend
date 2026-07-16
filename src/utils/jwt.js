const jwt = require('jsonwebtoken')

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')
  return secret
}

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email, name: user.name }, getSecret(), {
    expiresIn: '30d',
  })
}

function verifyToken(token) {
  return jwt.verify(token, getSecret())
}

module.exports = { signToken, verifyToken }
