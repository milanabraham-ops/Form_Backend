const bcrypt = require('bcryptjs')
const User = require('../models/User')

const ROLES = ['poc', 'specialist', 'qa', 'admin']

function toPublicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || '',
    role: user.role || 'poc',
    createdAt: user.createdAt,
  }
}

exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 })
    res.json(users.map(toPublicUser))
  } catch (err) {
    next(err)
  }
}

exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` })
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() })
    if (existing) return res.status(409).json({ error: 'An account with that email already exists' })

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      name: name.trim(),
      email,
      passwordHash,
      authProvider: 'local',
      role: role || 'poc',
    })

    res.status(201).json(toPublicUser(user))
  } catch (err) {
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message })
    next(err)
  }
}

exports.updateRole = async (req, res, next) => {
  try {
    const { role } = req.body
    if (!ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` })

    if (String(req.params.id) === String(req.user._id) && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove your own admin role' })
    }

    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(toPublicUser(user))
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid user id' })
    next(err)
  }
}
