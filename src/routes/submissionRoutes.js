const router = require('express').Router()
const ctrl = require('../controllers/submissionController')
const requireAuth = require('../middleware/requireAuth')
const { validateBody } = require('../middleware/validate')
const { createSubmissionSchema, updateSubmissionSchema, addCommentSchema } = require('../validators/submissionValidators')

router.use(requireAuth)

router.post('/', validateBody(createSubmissionSchema), ctrl.create)
router.get('/', ctrl.list)
router.get('/:id', ctrl.getById)
router.patch('/:id', validateBody(updateSubmissionSchema), ctrl.update)
router.post('/:id/handover', ctrl.handover)
router.post('/:id/comments', validateBody(addCommentSchema), ctrl.addComment)
router.delete('/:id', ctrl.remove)

module.exports = router
