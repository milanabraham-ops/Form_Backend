const router = require('express').Router()
const ctrl = require('../controllers/authController')
const requireAuth = require('../middleware/requireAuth')

router.post('/login', ctrl.login)
router.post('/google', ctrl.google)
router.get('/me', requireAuth, ctrl.me)
router.patch('/me', requireAuth, ctrl.updateMe)
router.post('/change-password', requireAuth, ctrl.changePassword)

module.exports = router
