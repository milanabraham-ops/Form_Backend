const { stampCompletionIfNeeded } = require('./completionTracking')

// MongoDB is the sole source of truth for Account Onboarded / Configuration Status /
// Implementation Specialist — the Google Sheet is write-only storage (a durable record the
// team can browse), never read back into the app. The one thing every submission/group
// list-or-detail endpoint needs: convert each doc to a plain object and fire the
// auto-stamp-completion-info side effect — used to be repeated inline at every call site.
async function attachManualStatus(Submission, docs) {
  stampCompletionIfNeeded(Submission, docs).catch((err) => {
    console.error('Failed to stamp completion info:', err.message)
  })

  return docs.map((doc) => doc.toObject())
}

module.exports = { attachManualStatus }
