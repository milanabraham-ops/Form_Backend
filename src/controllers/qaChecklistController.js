const QaChecklistTemplate = require('../models/QaChecklistTemplate')

// The shared base items plus whichever personal items belong to this specific user — never
// another agent's personal additions.
function visibleItems(template, userId) {
  const personal = template.personalItems.filter((i) => String(i.addedBy) === String(userId)).map((i) => i.text)
  return [...template.items, ...personal]
}

exports.get = async (req, res, next) => {
  try {
    const template = await QaChecklistTemplate.getTemplate()
    // baseItems is exposed separately so the frontend can tell a shared default (not removable —
    // it's the same checklist for everyone) apart from something this agent added themselves.
    res.json({ items: visibleItems(template, req.user._id), baseItems: template.items })
  } catch (err) {
    next(err)
  }
}

// QA/admin only — adding an item is personal to the agent adding it; it only shows up on that
// agent's own future reviews, not on every other QA member's checklist.
exports.addItem = async (req, res, next) => {
  try {
    const name = (req.body.item || '').trim()
    if (!name) return res.status(400).json({ error: 'Item name is required' })

    const template = await QaChecklistTemplate.getTemplate()
    const exists = visibleItems(template, req.user._id).some((i) => i.toLowerCase() === name.toLowerCase())
    if (!exists) {
      template.personalItems.push({ text: name, addedBy: req.user._id })
      await template.save()
    }
    res.status(201).json({ items: visibleItems(template, req.user._id), baseItems: template.items })
  } catch (err) {
    next(err)
  }
}
