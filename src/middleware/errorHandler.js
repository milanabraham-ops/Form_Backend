module.exports = function errorHandler(err, req, res, next) {
  console.error(err)
  const status = err.status || (err.name === 'MulterError' ? 400 : 500)
  res.status(status).json({ error: err.message || 'Internal server error' })
}
