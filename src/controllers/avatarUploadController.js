const { getBucket } = require('../config/gridfs')

exports.upload = async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' })

  try {
    const bucket = getBucket()
    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
    })

    uploadStream.on('error', next)
    uploadStream.on('finish', () => {
      const base = process.env.PUBLIC_BASE_URL || 'http://localhost:5000'
      res.status(201).json({ fileId: uploadStream.id, url: `${base}/api/uploads/${uploadStream.id}` })
    })

    uploadStream.end(req.file.buffer)
  } catch (err) {
    next(err)
  }
}
