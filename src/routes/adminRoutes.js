const router = require('express').Router()
const ctrl = require('../controllers/adminController')
const settingsCtrl = require('../controllers/settingsController')
const requireAuth = require('../middleware/requireAuth')
const requireRole = require('../middleware/requireRole')

router.use(requireAuth, requireRole('admin'))

router.get('/users', ctrl.listUsers)
router.post('/users', ctrl.createUser)
router.patch('/users/:id/role', ctrl.updateRole)

router.get('/settings', settingsCtrl.get)
router.patch('/settings', settingsCtrl.update)

module.exports = router
