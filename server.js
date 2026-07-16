require('dotenv').config()

const app = require('./src/app')
const connectDB = require('./src/config/db')
const { ensureHeaderRow } = require('./src/services/sheetSync')

const PORT = process.env.PORT || 5000

connectDB()
  .then(() =>
    ensureHeaderRow().catch((err) => console.error('Failed to ensure Google Sheet header row:', err.message)),
  )
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
  })
  .catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
