const { Schema, model } = require('mongoose')

// Singleton document — exactly one row, holding the Google Chat webhook config that used to
// live in .env. Admin-managed via /api/admin/settings so swapping a webhook never needs a code
// deploy or server restart.
const settingsSchema = new Schema(
  {
    gchatQaWebhookUrl: { type: String, default: '' },
    gchatPocWebhookUrl: { type: String, default: '' },
  },
  { timestamps: true },
)

async function getSettings() {
  let doc = await this.findOne()
  if (!doc) doc = await this.create({})
  return doc
}

settingsSchema.statics.getSettings = getSettings

module.exports = model('Settings', settingsSchema)
