const { google } = require('googleapis')
const { buildGoogleAuth } = require('./googleAuth')

let cachedClient = null

function isConfigured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GOOGLE_DRIVE_FOLDER_ID,
  )
}

function getClient() {
  if (cachedClient) return cachedClient
  if (!isConfigured()) return null

  const auth = buildGoogleAuth(['https://www.googleapis.com/auth/drive'])
  cachedClient = google.drive({ version: 'v3', auth })
  return cachedClient
}

module.exports = { getClient, isConfigured }
