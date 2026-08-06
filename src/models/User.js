const { Schema, model } = require('mongoose')

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String },
    authProvider: { type: String, enum: ['local', 'google'], required: true },
    avatarUrl: { type: String, default: '' },
    role: { type: String, enum: ['poc', 'specialist', 'qa', 'admin'], default: 'poc' },
    // Set when an admin creates an account with the shared default password — forces a change on
    // first login before anything else in the app is reachable. Never true for Google sign-in
    // accounts, since those never have an admin-set password to begin with.
    mustChangePassword: { type: Boolean, default: false },
    // Full functionality, same as a real account — just tagged so its submissions/groups can be
    // told apart (isTestData) and bulk-purged later without touching real client data.
    isTestAccount: { type: Boolean, default: false },
    // Bumped on every refresh-token rotation, logout, and password change. A refresh token
    // embeds the version it was issued at — if it no longer matches, the token is stale (already
    // rotated away, or the session was deliberately ended) and is rejected. Incrementing this is
    // how logout/password-change invalidate every outstanding refresh token at once, with no
    // separate token-storage table needed.
    refreshTokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
)

userSchema.index({ googleId: 1 }, { unique: true, sparse: true })

module.exports = model('User', userSchema)
