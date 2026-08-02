const { Schema, model } = require('mongoose')

// The product keeps changing, so the QA checklist can't be a fixed list baked into code — this
// is a singleton document (same pattern as Settings) holding the current shared set of items,
// growable by QA/admin as new things need verifying. Every account's own qaChecklist is merged
// against this list when opened for review, so a newly added item shows up on every account
// still awaiting completion, not just ones created after it was added.
const BASE_ITEMS = [
  'Configuration',
  'Token Ticket',
  'Click to Call',
  'Team Login',
  'Account Onboarding',
  'BS Permissions',
  'Purchase Numbers',
  'Phone Number',
  'Fax Number',
  'Location',
  'Location Mapping',
  'IVR + VM Audios',
  'Extensions',
  'Agents',
  'IP Address(es)',
  'Devices',
  'Ring Groups',
  'Call Queue',
  'Phone Tree(s)',
  'Offline Phone Tree(s)',
  'Provisioning Profile',
  'Message Group',
  'Fax Permissions',
  'Admin Users',
  'Potential Opportunities',
  'VoiceBot',
]

const qaChecklistTemplateSchema = new Schema(
  {
    items: { type: [String], default: () => [...BASE_ITEMS] },
  },
  { timestamps: true },
)

async function getTemplate() {
  let doc = await this.findOne()
  if (!doc) doc = await this.create({})
  return doc
}

qaChecklistTemplateSchema.statics.getTemplate = getTemplate

module.exports = model('QaChecklistTemplate', qaChecklistTemplateSchema)
