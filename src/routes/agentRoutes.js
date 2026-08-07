const router = require('express').Router()
const ctrl = require('../controllers/agentController')
const requireAuth = require('../middleware/requireAuth')
const requireRole = require('../middleware/requireRole')

router.get('/', requireAuth, requireRole('qa', 'specialist', 'admin'), ctrl.list)

module.exports = router
