const Submission = require('../models/Submission')
const Group = require('../models/Group')
const {
  appendSubmissionRow,
  updateSubmissionRow,
  deleteSubmissionRow,
  setAccountOnboarded,
  setManualField,
} = require('../services/sheetSync')
const { attachManualStatus } = require('../utils/manualStatus')
const { statusEquals, normalizeStatus } = require('../utils/statusMatch')
const { notifyNewRequest, postToQaGroup, postToPocGroup } = require('../services/chatService')

// Roles that manage the client relationship itself (creating/deleting submissions and groups).
// Specialist/QA only ever act on tracking fields of records that already exist.
const OWNER_ROLES = ['poc', 'admin']
// QA can also pick up and perform configuration work themselves (same fields as specialist),
// in addition to their own verification/onboarding sign-off — specialist cannot do QA's part.
// Account Onboarded belongs to whoever is actually doing the account at the time (specialist
// while configuring, QA during review), not just QA — so both can set it.
const TRACKING_FIELDS_BY_ROLE = {
  specialist: ['configurationStatus', 'implementationSpecialist', 'accountOnboarded', 'statusBeforeHold'],
  qa: ['configurationStatus', 'implementationSpecialist', 'accountOnboarded', 'qaAgent', 'statusBeforeHold', 'qaChecklist'],
}
const MANUAL_TRACKING_FIELDS = ['accountOnboarded', 'configurationStatus', 'implementationSpecialist']

// Account Onboarded is a property of the client account as a whole, not each individual location —
// once any location in a group has been closed out, the account is onboarded for good. So a new
// location added afterward should immediately show Closed too, instead of starting blank.
async function inheritOnboardedStatus(submission, groupId) {
  const siblings = await Submission.find({ group: groupId, _id: { $ne: submission._id } })
  if (siblings.length === 0) return

  const alreadyOnboarded = siblings.some((s) => statusEquals(s.accountOnboarded, 'CLOSED'))
  if (!alreadyOnboarded) return

  submission.accountOnboarded = 'Closed'
  await submission.save()
  await setAccountOnboarded(submission, 'Closed')
}

// Transient, Chat-message-only fields never persisted to the Submission document itself —
// stripped here (ahead of fieldsForRole) so this applies uniformly regardless of role, admin
// included, rather than needing every TRACKING_FIELDS_BY_ROLE list to know to exclude them.
function stripProtectedFields(body) {
  const { owner, _id, createdAt, updatedAt, pocMessage, qaHandoffMessage, qaResultMessage, isRecheck, ...rest } = body
  return rest
}

function stripTrackingFields(body) {
  const { accountOnboarded, configurationStatus, implementationSpecialist, qaAgent, ...rest } = body
  return rest
}

// What a given role is allowed to change on an existing submission via PATCH.
// poc: everything except the 3 tracking fields (those are set by specialist/qa/admin instead).
// admin: everything, including tracking fields.
// specialist / qa: ONLY their own tracking field(s) — never the client's actual setup data.
function fieldsForRole(role, body) {
  const base = stripProtectedFields(body)
  if (role === 'admin') return base
  if (role === 'poc') return stripTrackingFields(base)
  const allowed = TRACKING_FIELDS_BY_ROLE[role] || []
  const out = {}
  for (const key of allowed) {
    if (base[key] !== undefined) out[key] = base[key]
  }
  return out
}

exports.create = async (req, res, next) => {
  try {
    if (!OWNER_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' })

    const body = stripTrackingFields(stripProtectedFields(req.body))
    if (body.group) {
      const groupFilter = req.user.role === 'admin' ? { _id: body.group } : { _id: body.group, owner: req.user._id }
      const group = await Group.findOne(groupFilter)
      if (!group) return res.status(400).json({ error: 'Invalid group' })
    }

    const submission = await Submission.create({ ...body, owner: req.user._id, isTestData: Boolean(req.user.isTestAccount) })
    res.status(201).json(submission)

    appendSubmissionRow(submission)
      .then(() => (submission.group ? inheritOnboardedStatus(submission, submission.group) : null))
      .catch((err) => {
        console.error('Failed to sync submission to Google Sheet:', err.message)
      })

    notifyNewRequest(submission).catch((err) => {
      console.error('Failed to send new-request Chat notification:', err.message)
    })

    // POC's own edited message to their client-facing space — optional (only sent if they
    // actually wrote/kept one), separate from the fixed bot message to the QA/specialist group.
    if (req.body.pocMessage && req.body.pocMessage.trim()) {
      postToPocGroup(req.body.pocMessage.trim()).catch((err) => {
        console.error('Failed to send new-request Chat message to POC group:', err.message)
      })
    }
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
// Specialist/QA/Admin aren't scoped to "their own" — they need visibility across every account.
exports.list = async (req, res, next) => {
  try {
    const filter = req.user.role === 'poc' ? { owner: req.user._id, group: null } : {}
    const submissions = await Submission.find(filter).sort({ createdAt: -1 })
    res.json(await attachManualStatus(Submission, submissions))
  } catch (err) {
    next(err)
  }
}

exports.getById = async (req, res, next) => {
  try {
    const filter = req.user.role === 'poc' ? { _id: req.params.id, owner: req.user._id } : { _id: req.params.id }
    const submission = await Submission.findOne(filter)
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
    const filter = req.user.role === 'poc' ? { _id: req.params.id, owner: req.user._id } : { _id: req.params.id }
    const submission = await Submission.findOne(filter)
    if (!submission) return res.status(404).json({ error: 'Submission not found' })

    const updates = fieldsForRole(req.user.role, req.body)
    if (Object.keys(updates).length === 0) {
      return res.status(403).json({ error: 'You are not allowed to edit this' })
    }

    Object.assign(submission, updates)
    await submission.save()
    res.json(submission)

    updateSubmissionRow(submission).catch((err) => {
      console.error('Failed to sync submission edit to Google Sheet:', err.message)
    })

    for (const field of MANUAL_TRACKING_FIELDS) {
      if (updates[field] === undefined) continue
      setManualField(submission, field, submission[field]).catch((err) => {
        console.error(`Failed to sync ${field} to Google Sheet:`, err.message)
      })
    }

    // Both the QA-handoff note and the QA-result message are composed by whoever triggers the
    // transition (specialist / QA) and only sent if they actually wrote one — a recheck reopening
    // back to QA (isRecheck) is silent, since the specialist already got the original handoff
    // message and doesn't need a second "ready for QA" ping for the same round.
    if (updates.configurationStatus !== undefined) {
      const newStatus = normalizeStatus(updates.configurationStatus)
      if (newStatus === 'QA' && !req.body.isRecheck && req.body.qaHandoffMessage && req.body.qaHandoffMessage.trim()) {
        postToQaGroup(req.body.qaHandoffMessage.trim()).catch((err) => console.error('Failed to notify QA team in Chat:', err.message))
      } else if (newStatus === 'COMPLETED' && req.body.qaResultMessage && req.body.qaResultMessage.trim()) {
        postToQaGroup(req.body.qaResultMessage.trim()).catch((err) => console.error('Failed to send QA result to Chat:', err.message))
      }
    }
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid submission id' })
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message })
    next(err)
  }
}

// A deliberate, separate step from marking Completed — QA may want to hold off telling the
// client right away, and may go through one or more recheck rounds first. QA/admin only, same
// as the rest of the QA-side actions.
exports.handover = async (req, res, next) => {
  try {
    if (!['qa', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' })

    const message = (req.body.message || '').trim()
    if (!message) return res.status(400).json({ error: 'Message is required' })

    const submission = await Submission.findById(req.params.id)
    if (!submission) return res.status(404).json({ error: 'Submission not found' })

    submission.pocHandoverAt = new Date()
    await submission.save()
    res.json(submission)

    postToPocGroup(message).catch((err) => console.error('Failed to send handover message to Chat:', err.message))
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid submission id' })
    next(err)
  }
}

exports.remove = async (req, res, next) => {
  try {
    if (!OWNER_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' })

    const filter = req.user.role === 'poc' ? { _id: req.params.id, owner: req.user._id } : { _id: req.params.id }
    const submission = await Submission.findOne(filter)
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
