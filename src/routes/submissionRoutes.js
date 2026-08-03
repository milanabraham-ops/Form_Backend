const router = require('express').Router()
const ctrl = require('../controllers/submissionController')
const requireAuth = require('../middleware/requireAuth')

router.use(requireAuth)

router.post('/', ctrl.create)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getById)
router.patch('/:id', ctrl.update)
router.post('/:id/handover', ctrl.handover)
router.delete('/:id', ctrl.remove)

module.exports = router
