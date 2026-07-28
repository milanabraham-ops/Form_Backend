const bcrypt = require('bcryptjs')
const { OAuth2Client } = require('google-auth-library')
const User = require('../models/User')
const { signToken } = require('../utils/jwt')

const googleClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID)

function toPublicUser(user) {
  return { id: user._id, name: user.name, email: user.email, avatarUrl: user.avatarUrl || '', role: user.role || 'poc' }
}

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() })
    if (existing) return res.status(409).json({ error: 'An account with that email already exists' })

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({ name: name.trim(), email, passwordHash, authProvider: 'local' })

    res.status(201).json({ token: signToken(user), user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
}

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })

    const user = await User.findOne({ email: email.toLowerCase().trim() })
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid email or password' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' })

    res.json({ token: signToken(user), user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
}

exports.google = async (req, res, next) => {
  try {
    const { credential } = req.body
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' })
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
      return res.status(500).json({ error: 'Google sign-in is not configured on the server' })
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) return res.status(401).json({ error: 'Invalid Google credential' })

    let user = await User.findOne({ googleId: payload.sub })
    if (!user) {
      user = await User.findOne({ email: payload.email.toLowerCase() })
      if (user) {
        user.googleId = payload.sub
        if (!user.avatarUrl && payload.picture) user.avatarUrl = payload.picture
        await user.save()
      }
    }
    if (!user) {
      user = await User.create({
        name: payload.name || payload.email,
        email: payload.email,
        googleId: payload.sub,
        authProvider: 'google',
        avatarUrl: payload.picture || '',
      })
    }

    res.json({ token: signToken(user), user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
}

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
}

exports.updateMe = async (req, res, next) => {
  try {
    const { avatarUrl } = req.body
    if (typeof avatarUrl !== 'string') return res.status(400).json({ error: 'avatarUrl must be a string' })
    const trimmed = avatarUrl.trim()
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      return res.status(400).json({ error: 'avatarUrl must be a valid http(s) URL' })
    }

    const user = await User.findByIdAndUpdate(req.user._id, { avatarUrl: trimmed }, { new: true })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user: toPublicUser(user) })
  } catch (err) {
    next(err)
  }
}
