// Client errors (4xx) carry a deliberate, safe-to-show message set by the code that threw them
// (e.g. multer's fileFilter, or a validation check) — those are passed through as-is. Anything
// that reaches here as a 500 is unexpected — its message could be a raw Mongoose/driver error
// exposing internal details, so it's replaced with a generic message for the client while the
// full error (with stack) still goes to the server console below.
module.exports = function errorHandler(err, req, res, next) {
  console.error(err)
  const status = err.status || (err.name === 'MulterError' ? 400 : 500)
  const message = status >= 500 ? 'Internal server error' : err.message || 'Something went wrong'
  res.status(status).json({ error: message })
}
