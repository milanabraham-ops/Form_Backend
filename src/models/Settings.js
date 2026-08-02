const { Schema, model } = require('mongoose')

// Singleton document — exactly one row, holding the SMTP and Google Chat webhook config that
// used to live in .env. Admin-managed via /api/admin/settings so changing a webhook or swapping
// the mail account never needs a code deploy or server restart.
const settingsSchema = new Schema(
  {
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    smtpSecure: { type: Boolean, default: false },
    smtpUser: { type: String, default: '' },
    smtpPass: { type: String, default: '' },
    emailFrom: { type: String, default: '' },
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
