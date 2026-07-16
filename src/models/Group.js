const { Schema, model } = require('mongoose')

const groupSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientName: { type: String, required: true, trim: true },
  },
  { timestamps: true },
)

module.exports = model('Group', groupSchema)
