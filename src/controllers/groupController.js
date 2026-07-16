const Group = require('../models/Group')
const Submission = require('../models/Submission')
const { deleteSubmissionRow } = require('../services/sheetSync')
const { attachManualStatus } = require('../utils/manualStatus')
const { normalizeStatus, statusEquals } = require('../utils/statusMatch')

function uniqueValues(list, key) {
  return [...new Set(list.map((l) => l[key]).filter(Boolean))]
}

// Configuration Status pipeline in the Sheet is: '' (not started) -> 'In progress' -> 'QA' -> 'COMPLETED'.
// A group's locations tend to move through the pipeline together, so roll them up into a single
// group-level status: still "In progress" until every location has at least reached QA, "QA" until
// every location is COMPLETED, and "COMPLETED" only once all of them are. Casing in the Sheet isn't
// meaningful (QA / qa / Qa are the same), so every lookup goes through normalizeStatus first.
const STATUS_TIER = { '': 0, 'IN PROGRESS': 1, QA: 2, COMPLETED: 3 }

function rollupConfigurationStatus(locs) {
  if (locs.length === 0) return ''
  const tiers = locs.map((l) => STATUS_TIER[normalizeStatus(l.configurationStatus)] ?? 0)
  const minTier = Math.min(...tiers)
  if (minTier >= 3) return 'COMPLETED'
  if (minTier >= 2) return 'QA'
  return 'In progress'
}

// Unlike Configuration Status, Account Onboarded is a property of the client account as a whole,
// not each individual location — the account only goes through onboarding once. So once any one
// location has been closed out, the group stays "onboarded" from then on, even as further
// locations are added later (they inherit the account's already-onboarded state).
function rollupAccountOnboarded(locs) {
  if (locs.length === 0) return ''
  return locs.some((l) => statusEquals(l.accountOnboarded, 'CLOSED')) ? 'CLOSED' : 'OPEN'
}

exports.create = async (req, res, next) => {
  try {
    const clientName = (req.body.clientName || '').trim()
    if (!clientName) return res.status(400).json({ error: 'Client name is required' })

    const group = await Group.create({ clientName, owner: req.user._id })
    res.status(201).json(group)
  } catch (err) {
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message })
    next(err)
  }
}

exports.list = async (req, res, next) => {
  try {
    const groups = await Group.find({ owner: req.user._id }).sort({ createdAt: -1 })
    const locations = await Submission.find({ owner: req.user._id, group: { $ne: null } })
    const merged = await attachManualStatus(Submission, locations)

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const byGroup = new Map()
    for (const loc of merged) {
      const gid = String(loc.group)
      if (!byGroup.has(gid)) byGroup.set(gid, [])
      byGroup.get(gid).push(loc)
    }

    res.json(
      groups.map((g) => {
        const locs = byGroup.get(String(g._id)) || []
        const mostRecent = locs.reduce((latest, l) => (!latest || new Date(l.createdAt) > new Date(latest) ? l.createdAt : latest), null)
        return {
          ...g.toObject(),
          locationCount: locs.length,
          mostRecentLocationAt: mostRecent,
          locationsThisMonth: locs.filter((l) => new Date(l.createdAt) >= startOfMonth).length,
          specialists: uniqueValues(locs, 'implementationSpecialist'),
          markets: uniqueValues(locs, 'market'),
          pocs: uniqueValues(locs, 'poc'),
          configurationStatus: rollupConfigurationStatus(locs),
          accountOnboarded: rollupAccountOnboarded(locs),
        }
      }),
    )
  } catch (err) {
    next(err)
  }
}

exports.getById = async (req, res, next) => {
  try {
    const group = await Group.findOne({ _id: req.params.id, owner: req.user._id })
    if (!group) return res.status(404).json({ error: 'Group not found' })

    const locations = await Submission.find({ group: group._id, owner: req.user._id }).sort({ createdAt: -1 })
    const merged = await attachManualStatus(Submission, locations)
    res.json({ ...group.toObject(), locations: merged })
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid group id' })
    next(err)
  }
}

exports.update = async (req, res, next) => {
  try {
    const group = await Group.findOne({ _id: req.params.id, owner: req.user._id })
    if (!group) return res.status(404).json({ error: 'Group not found' })

    const clientName = (req.body.clientName || '').trim()
    if (!clientName) return res.status(400).json({ error: 'Client name is required' })

    group.clientName = clientName
    await group.save()
    res.json(group)
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid group id' })
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message })
    next(err)
  }
}

exports.remove = async (req, res, next) => {
  try {
    const group = await Group.findOne({ _id: req.params.id, owner: req.user._id })
    if (!group) return res.status(404).json({ error: 'Group not found' })

    const locations = await Submission.find({ group: group._id, owner: req.user._id })
    await Submission.deleteMany({ group: group._id, owner: req.user._id })
    await Group.deleteOne({ _id: group._id })
    res.status(204).end()

    Promise.allSettled(locations.map((s) => deleteSubmissionRow(s))).then((results) => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`Failed to delete location ${locations[i]._id} row from Google Sheet:`, r.reason?.message)
        }
      })
    })
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid group id' })
    next(err)
  }
}
