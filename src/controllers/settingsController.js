const Settings = require('../models/Settings')

function toPublicSettings(doc) {
  return {
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
    const { gchatQaWebhookUrl, gchatPocWebhookUrl } = req.body

    if (gchatQaWebhookUrl !== undefined) doc.gchatQaWebhookUrl = gchatQaWebhookUrl.trim()
    if (gchatPocWebhookUrl !== undefined) doc.gchatPocWebhookUrl = gchatPocWebhookUrl.trim()

    await doc.save()
    res.json(toPublicSettings(doc))
  } catch (err) {
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message })
    next(err)
  }
}
