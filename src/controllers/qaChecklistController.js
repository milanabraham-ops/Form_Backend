const QaChecklistTemplate = require('../models/QaChecklistTemplate')

exports.get = async (req, res, next) => {
  try {
    const template = await QaChecklistTemplate.getTemplate()
    res.json({ items: template.items })
  } catch (err) {
    next(err)
  }
}

// QA/admin only — adding an item changes what every future review is checked against, so it's
// not something a POC or specialist should be able to do.
exports.addItem = async (req, res, next) => {
  try {
    const name = (req.body.item || '').trim()
    if (!name) return res.status(400).json({ error: 'Item name is required' })

    const template = await QaChecklistTemplate.getTemplate()
    const exists = template.items.some((i) => i.toLowerCase() === name.toLowerCase())
    if (!exists) {
      template.items.push(name)
      await template.save()
    }
    res.status(201).json({ items: template.items })
  } catch (err) {
    next(err)
  }
}
