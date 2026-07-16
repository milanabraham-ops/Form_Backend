const mongoose = require('mongoose')
const { getBucket } = require('../config/gridfs')
const { uploadToDrive } = require('../services/driveUpload')

exports.upload = async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' })

  try {
    const bucket = getBucket()
    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
    })

    uploadStream.on('error', next)
    uploadStream.on('finish', async () => {
      let driveUrl = ''
      try {
        const drive = await uploadToDrive(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          req.body.practiceName,
          req.body.locationName,
        )
        if (drive) driveUrl = drive.url
      } catch (err) {
        console.error('Failed to copy upload to Google Drive:', err.message)
      }

      res.status(201).json({
        fileId: uploadStream.id,
        filename: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
        driveUrl,
      })
    })

    uploadStream.end(req.file.buffer)
  } catch (err) {
    next(err)
  }
}

exports.stream = async (req, res, next) => {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid file id' })

  try {
    const bucket = getBucket()
    const _id = new mongoose.Types.ObjectId(id)
    const files = await bucket.find({ _id }).toArray()
    if (!files.length) return res.status(404).json({ error: 'File not found' })

    const file = files[0]
    res.set('Content-Type', file.contentType || 'application/octet-stream')
    res.set('Content-Disposition', `inline; filename="${file.filename}"`)
    res.set('Content-Length', file.length)

    bucket.openDownloadStream(_id).on('error', next).pipe(res)
  } catch (err) {
    next(err)
  }
}

exports.remove = async (req, res, next) => {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid file id' })

  try {
    await getBucket().delete(new mongoose.Types.ObjectId(id))
    res.status(204).end()
  } catch (err) {
    if (err.message && err.message.includes('File not found')) {
      return res.status(404).json({ error: 'File not found' })
    }
    next(err)
  }
}
