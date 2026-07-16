const Submission = require('../models/Submission')
const Group = require('../models/Group')
const {
  appendSubmissionRow,
  updateSubmissionRow,
  deleteSubmissionRow,
  getManualStatusMap,
  setAccountOnboarded,
} = require('../services/sheetSync')
const { attachManualStatus } = require('../utils/manualStatus')
const { statusEquals } = require('../utils/statusMatch')

// Account Onboarded is a property of the client account as a whole, not each individual location —
// once any location in a group has been closed out, the account is onboarded for good. So a new
// location added afterward should immediately show CLOSED too, instead of starting blank.
async function inheritOnboardedStatus(submission, groupId) {
  const siblings = await Submission.find({ group: groupId, _id: { $ne: submission._id } })
  if (siblings.length === 0) return

  const statusMap = await getManualStatusMap().catch(() => new Map())
  const alreadyOnboarded = siblings.some((s) => {
    const live = statusMap.get(String(s._id))
    return statusEquals(live ? live.accountOnboarded : s.accountOnboarded, 'CLOSED')
  })
  if (!alreadyOnboarded) return

  submission.accountOnboarded = 'CLOSED'
  await submission.save()
  await setAccountOnboarded(submission, 'CLOSED')
}

function stripProtectedFields(body) {
  const { owner, _id, createdAt, updatedAt, accountOnboarded, configurationStatus, implementationSpecialist, ...rest } = body
  return rest
}

exports.create = async (req, res, next) => {
  try {
    const body = stripProtectedFields(req.body)
    if (body.group) {
      const group = await Group.findOne({ _id: body.group, owner: req.user._id })
      if (!group) return res.status(400).json({ error: 'Invalid group' })
    }

    const submission = await Submission.create({ ...body, owner: req.user._id })
    res.status(201).json(submission)

    appendSubmissionRow(submission)
      .then(() => (submission.group ? inheritOnboardedStatus(submission, submission.group) : null))
      .catch((err) => {
        console.error('Failed to sync submission to Google Sheet:', err.message)
      })
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid group' })
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message })
    }
    next(err)
  }
}

// Only standalone (non-grouped) submissions — locations that belong to a multi-location group
// are listed via GET /api/groups/:id instead, so they aren't double-counted on the dashboard.
exports.list = async (req, res, next) => {
  try {
    const submissions = await Submission.find({ owner: req.user._id, group: null }).sort({ createdAt: -1 })
    res.json(await attachManualStatus(Submission, submissions))
  } catch (err) {
    next(err)
  }
}

exports.getById = async (req, res, next) => {
  try {
    const submission = await Submission.findOne({ _id: req.params.id, owner: req.user._id })
    if (!submission) return res.status(404).json({ error: 'Submission not found' })
    const [merged] = await attachManualStatus(Submission, [submission])
    res.json(merged)
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid submission id' })
    next(err)
  }
}

exports.update = async (req, res, next) => {
  try {
    const submission = await Submission.findOne({ _id: req.params.id, owner: req.user._id })
    if (!submission) return res.status(404).json({ error: 'Submission not found' })

    Object.assign(submission, stripProtectedFields(req.body))
    await submission.save()
    res.json(submission)

    updateSubmissionRow(submission).catch((err) => {
      console.error('Failed to sync submission edit to Google Sheet:', err.message)
    })
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid submission id' })
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message })
    next(err)
  }
}

exports.remove = async (req, res, next) => {
  try {
    const submission = await Submission.findOne({ _id: req.params.id, owner: req.user._id })
    if (!submission) return res.status(404).json({ error: 'Submission not found' })

    await Submission.deleteOne({ _id: submission._id })
    res.status(204).end()

    deleteSubmissionRow(submission).catch((err) => {
      console.error('Failed to delete submission row from Google Sheet:', err.message)
    })
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid submission id' })
    next(err)
  }
}
