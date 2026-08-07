const { Schema, model } = require('mongoose')

// Singleton document — exactly one row, holding the Google Chat webhook config that used to
// live in .env. Admin-managed via /api/admin/settings so swapping a webhook never needs a code
// deploy or server restart.
const settingsSchema = new Schema(
  {
    gchatQaWebhookUrl: { type: String, default: '' },
    gchatPocWebhookUrl: { type: String, default: '' },
    // The Google Drive folder (Shared Drive id) audio/avatar uploads go into — used to live in
    // GOOGLE_DRIVE_FOLDER_ID, moved here since an admin swapping drives shouldn't need a deploy.
    // Defaulted to the drive already in use at the time this moved, so existing deployments keep
    // working unchanged the moment this ships — Mongoose applies schema defaults for any path
    // missing on an already-existing document, not just brand new ones.
    googleDriveFolderId: { type: String, default: '0AO8px7bKarwcUk9PVA' },
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
