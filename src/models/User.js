const { Schema, model } = require('mongoose')

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String },
    authProvider: { type: String, enum: ['local', 'google'], required: true },
    avatarUrl: { type: String, default: '' },
  },
  { timestamps: true },
)

userSchema.index({ googleId: 1 }, { unique: true, sparse: true })

module.exports = model('User', userSchema)
