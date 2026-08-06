const mongoose = require('mongoose')
const Submission = require('../models/Submission')
const Group = require('../models/Group')
const { getBucket } = require('../config/gridfs')
const { getClient: getDriveClient, isConfigured: isDriveConfigured } = require('../config/googleDrive')
const { deleteSubmissionRow } = require('../services/sheetSync')

// Every place a submission can hold an uploaded audio file — the three top-level welcome/AHVM/BHVM
// files, plus each ring group's own on-hold and exit-queue files (exit/dq/qo, each with its own).
function fileRefsOf(submission) {
  const refs = [submission.welcomeFile, submission.ahvmFile, submission.bhvmFile]
  for (const group of submission.ringGroups || []) {
    for (const key of ['exit', 'dq', 'qo']) {
      const detail = group.queue?.[key]
      if (!detail) continue
      refs.push(detail.onholdFile, detail.exitFile)
    }
  }
  return refs.filter(Boolean)
}

// Wipes every account/location produced by test accounts — Mongo, the uploaded audio (GridFS),
// the Google Drive backup copies, and the corresponding Sheet rows — without touching anything
// created by a real account. Test accounts themselves are untouched so they stay reusable.
exports.purge = async (req, res, next) => {
  try {
    const submissions = await Submission.find({ isTestData: true })
    const bucket = getBucket()
    const drive = isDriveConfigured() ? getDriveClient() : null

    let filesDeleted = 0
    let driveFilesDeleted = 0

    for (const submission of submissions) {
      for (const ref of fileRefsOf(submission)) {
        if (ref.fileId) {
          try {
            await bucket.delete(new mongoose.Types.ObjectId(ref.fileId))
            filesDeleted++
          } catch (err) {
            if (!/file not found/i.test(err.message || '')) console.error('Failed to delete GridFS file:', err.message)
          }
        }
        if (ref.driveFileId && drive) {
          try {
            await drive.files.delete({ fileId: ref.driveFileId, supportsAllDrives: true })
            driveFilesDeleted++
          } catch (err) {
            console.error('Failed to delete Drive file:', err.message)
          }
        }
      }
    }

    const sheetResults = await Promise.allSettled(submissions.map((s) => deleteSubmissionRow(s)))
    sheetResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`Failed to delete test submission ${submissions[i]._id} row from Google Sheet:`, r.reason?.message)
      }
    })

    const { deletedCount: submissionsDeleted } = await Submission.deleteMany({ isTestData: true })
    const { deletedCount: groupsDeleted } = await Group.deleteMany({ isTestData: true })

    res.json({ submissionsDeleted, groupsDeleted, filesDeleted, driveFilesDeleted })
  } catch (err) {
    next(err)
  }
}
