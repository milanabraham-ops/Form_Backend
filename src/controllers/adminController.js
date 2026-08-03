const bcrypt = require('bcryptjs')
const User = require('../models/User')

const ROLES = ['poc', 'specialist', 'qa', 'admin']
// Every admin-created account starts with this same password (not one the admin picks) — the
// account is forced to change it on first login (see mustChangePassword), so there's no real
// value in the admin choosing a one-off temporary password each time.
const DEFAULT_PASSWORD = '12345678'

function toPublicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || '',
    role: user.role || 'poc',
    mustChangePassword: Boolean(user.mustChangePassword),
    isTestAccount: Boolean(user.isTestAccount),
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
    const { name, email, role, isTestAccount } = req.body
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' })
    }
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` })
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() })
    if (existing) return res.status(409).json({ error: 'An account with that email already exists' })

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
    const user = await User.create({
      name: name.trim(),
      email,
      passwordHash,
      authProvider: 'local',
      role: role || 'poc',
      mustChangePassword: true,
      isTestAccount: Boolean(isTestAccount),
    })

    res.status(201).json(toPublicUser(user))
  } catch (err) {
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message })
    next(err)
  }
}

// Revokes access by deleting the account outright — they can no longer log in. Their historical
// submissions/tracking-field entries (owner, implementationSpecialist, qaAgent, poc are all
// free text or a dangling ref, never cascade-deleted) stay in place as a record of past work.
exports.removeUser = async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot remove your own account' })
    }

    const user = await User.findByIdAndDelete(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.status(204).end()
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid user id' })
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
