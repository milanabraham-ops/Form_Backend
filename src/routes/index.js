const router = require('express').Router()

router.get('/health', (req, res) => res.json({ status: 'ok' }))
router.use('/auth', require('./authRoutes'))
router.use('/submissions', require('./submissionRoutes'))
router.use('/groups', require('./groupRoutes'))
router.use('/uploads', require('./uploadRoutes'))
router.use('/avatar', require('./avatarRoutes'))
router.use('/admin', require('./adminRoutes'))

module.exports = router
