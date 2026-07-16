const express = require('express')
const cors = require('cors')
const routes = require('./routes')
const errorHandler = require('./middleware/errorHandler')

const app = express()

const corsOrigin = process.env.CORS_ORIGIN
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',').map((o) => o.trim()) } : undefined))
app.use(express.json({ limit: '2mb' }))
app.use('/api', routes)
app.use(errorHandler)

module.exports = app
