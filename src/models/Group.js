const { Schema, model } = require('mongoose')

const groupSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientName: { type: String, required: true, trim: true },
    // Optional, POC/admin-editable estimate of how many locations this client will have —
    // purely informational (progress tracking), not enforced against the actual location count.
    expectedLocationCount: { type: Number, default: null },
  },
  { timestamps: true },
)

module.exports = model('Group', groupSchema)
