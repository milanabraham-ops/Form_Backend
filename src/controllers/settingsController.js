const Settings = require('../models/Settings')

// smtpPass is never sent back to the client — only whether one is currently set. The update
// endpoint only overwrites it when a new value is actually provided, so the admin isn't forced
// to re-type the password every time they tweak an unrelated field.
function toPublicSettings(doc) {
  return {
    smtpHost: doc.smtpHost || '',
    smtpPort: doc.smtpPort || 587,
    smtpSecure: Boolean(doc.smtpSecure),
    smtpUser: doc.smtpUser || '',
    smtpPassSet: Boolean(doc.smtpPass),
    emailFrom: doc.emailFrom || '',
    gchatQaWebhookUrl: doc.gchatQaWebhookUrl || '',
    gchatPocWebhookUrl: doc.gchatPocWebhookUrl || '',
  }
}

exports.get = async (req, res, next) => {
  try {
    const doc = await Settings.getSettings()
    res.json(toPublicSettings(doc))
  } catch (err) {
    next(err)
  }
}

exports.update = async (req, res, next) => {
  try {
    const doc = await Settings.getSettings()
    const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, emailFrom, gchatQaWebhookUrl, gchatPocWebhookUrl } = req.body

    if (smtpHost !== undefined) doc.smtpHost = smtpHost.trim()
    if (smtpPort !== undefined) doc.smtpPort = Number(smtpPort) || 587
    if (smtpSecure !== undefined) doc.smtpSecure = Boolean(smtpSecure)
    if (smtpUser !== undefined) doc.smtpUser = smtpUser.trim()
    if (smtpPass) doc.smtpPass = smtpPass
    if (emailFrom !== undefined) doc.emailFrom = emailFrom.trim()
    if (gchatQaWebhookUrl !== undefined) doc.gchatQaWebhookUrl = gchatQaWebhookUrl.trim()
    if (gchatPocWebhookUrl !== undefined) doc.gchatPocWebhookUrl = gchatPocWebhookUrl.trim()

    await doc.save()
    res.json(toPublicSettings(doc))
  } catch (err) {
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message })
    next(err)
  }
}
