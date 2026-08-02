const nodemailer = require('nodemailer')
const User = require('../models/User')
const Settings = require('../models/Settings')

function isConfigured(settings) {
  return Boolean(settings.smtpHost && settings.smtpUser && settings.smtpPass)
}

// Built fresh per send rather than cached — the admin can change SMTP credentials at any time
// via Settings, and sending is low-volume enough that transport creation cost is a non-issue.
function buildTransport(settings) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort || 587,
    secure: settings.smtpSecure,
    auth: { user: settings.smtpUser, pass: settings.smtpPass },
  })
}

// Specialist/QA membership always comes from the live User accounts (same roles the admin
// manages in Manage Access) rather than a separately-maintained address list, so the
// recipients never drift out of sync with who's actually on each team.
async function teamEmails(roles) {
  const users = await User.find({ role: { $in: roles } }, 'email')
  return users.map((u) => u.email).filter(Boolean)
}

function submissionLabel(submission) {
  return `${submission.clientName || 'Untitled'} — ${submission.locationName || 'Untitled location'}`
}

// New implementation request lands — email only (per the team's preference; every other
// stage change goes through Google Chat instead). Goes to both specialist and QA teams up
// front, since either can pick up configuration work under this app's workflow.
async function sendNewRequestEmail(submission) {
  const settings = await Settings.getSettings()
  if (!isConfigured(settings)) return

  const recipients = await teamEmails(['specialist', 'qa'])
  if (recipients.length === 0) return

  const transport = buildTransport(settings)
  const label = submissionLabel(submission)
  await transport.sendMail({
    from: settings.emailFrom || settings.smtpUser,
    to: recipients,
    subject: `New implementation request: ${label}`,
    text: [
      `A new implementation request has been submitted and is ready to be configured.`,
      ``,
      `Client: ${submission.clientName || '—'}`,
      `Location: ${submission.locationName || '—'}`,
      `Market: ${submission.market || '—'}`,
      `POC: ${submission.poc || '—'}`,
      ``,
      `Open the Configuration Requests queue to take it over.`,
    ].join('\n'),
  })
}

module.exports = { sendNewRequestEmail }
