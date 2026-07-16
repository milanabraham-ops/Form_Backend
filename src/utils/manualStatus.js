const { getManualStatusMap } = require('../services/sheetSync')
const { stampCompletionIfNeeded } = require('./completionTracking')

function persistedStatus(doc) {
  return {
    accountOnboarded: doc.accountOnboarded || '',
    configurationStatus: doc.configurationStatus || '',
    implementationSpecialist: doc.implementationSpecialist || '',
  }
}

// Prefers the live Sheet value; falls back to whatever was last persisted in MongoDB if the
// Sheet has nothing for this row (unreachable, unconfigured, or row not found) so the info
// already saved is never blanked out in the response.
function withManualStatus(doc, statusMap) {
  const status = statusMap.get(String(doc._id)) || persistedStatus(doc)
  return { ...doc.toObject(), ...status }
}

function statusChanged(doc, status) {
  return (
    doc.accountOnboarded !== status.accountOnboarded ||
    doc.configurationStatus !== status.configurationStatus ||
    doc.implementationSpecialist !== status.implementationSpecialist
  )
}

// Mirrors freshly-read Sheet values into MongoDB so they survive even if the Sheet
// becomes unreachable or the row is later removed. Best-effort — never blocks the response.
async function persistManualStatus(Submission, docs, statusMap) {
  const ops = []
  for (const doc of docs) {
    const status = statusMap.get(String(doc._id))
    if (!status || !statusChanged(doc, status)) continue
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: status } } })
  }
  if (ops.length) await Submission.bulkWrite(ops)
}

// The one thing every submission/group list-or-detail endpoint needs: read live tracking status
// from the Sheet, merge it onto each doc for the response, and fire the two background side
// effects (mirror status into Mongo, auto-stamp completion info) — used to be repeated inline at
// every call site, now lives in one place.
async function attachManualStatus(Submission, docs) {
  const statusMap = await getManualStatusMap().catch((err) => {
    console.error('Failed to read tracking status from Google Sheet:', err.message)
    return new Map()
  })
  const merged = docs.map((doc) => withManualStatus(doc, statusMap))

  persistManualStatus(Submission, docs, statusMap).catch((err) => {
    console.error('Failed to persist tracking status to MongoDB:', err.message)
  })
  stampCompletionIfNeeded(Submission, docs, statusMap).catch((err) => {
    console.error('Failed to stamp completion info:', err.message)
  })

  return merged
}

module.exports = { attachManualStatus }
