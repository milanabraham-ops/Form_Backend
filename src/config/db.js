const mongoose = require('mongoose')

module.exports = async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/voicestack'
  await mongoose.connect(uri)
  console.log('MongoDB connected')
}
