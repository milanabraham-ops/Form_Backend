const router = require('express').Router()
const ctrl = require('../controllers/qaChecklistController')
const requireAuth = require('../middleware/requireAuth')
const requireRole = require('../middleware/requireRole')

router.get('/', requireAuth, ctrl.get)
router.post('/', requireAuth, requireRole('qa', 'admin'), ctrl.addItem)

module.exports = router
