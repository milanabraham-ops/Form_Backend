const { Readable } = require('stream')
const { getClient, isConfigured } = require('../config/googleDrive')

const folderIdCache = new Map()

function escapeForQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function getOrCreateSubfolder(drive, parentId, name) {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  const query = [
    `'${parentId}' in parents`,
    `name = '${escapeForQuery(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ')

  const existing = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'drive',
    driveId: rootFolderId,
  })

  let folderId = existing.data.files?.[0]?.id
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
      supportsAllDrives: true,
    })
    folderId = created.data.id
  }
  return folderId
}

// Folder layout: a single-location practice gets just ONE folder (named for the client/account)
// with audio uploaded directly into it. A multi-location group gets that same client folder acting
// as the group folder, with one subfolder per location inside it — the extra nesting only exists
// when there's actually more than one location to keep separate. locationName is only passed by
// the frontend when the submission belongs to a group, so its absence is exactly the signal for
// "single location, don't nest."
async function getOrCreateLocationFolder(drive, clientName, locationName) {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  const clientFolderName = (clientName || 'Unnamed Practice').trim() || 'Unnamed Practice'

  let clientFolderId = folderIdCache.get(clientFolderName)
  if (!clientFolderId) {
    clientFolderId = await getOrCreateSubfolder(drive, rootFolderId, clientFolderName)
    folderIdCache.set(clientFolderName, clientFolderId)
  }

  const locationFolderName = (locationName || '').trim()
  if (!locationFolderName) return clientFolderId

  const cacheKey = `${clientFolderName}::${locationFolderName}`
  if (folderIdCache.has(cacheKey)) return folderIdCache.get(cacheKey)

  const locationFolderId = await getOrCreateSubfolder(drive, clientFolderId, locationFolderName)
  folderIdCache.set(cacheKey, locationFolderId)
  return locationFolderId
}

async function uploadToDrive(buffer, filename, mimeType, practiceName, locationName) {
  if (!isConfigured()) return null

  const drive = getClient()
  const parentId = await getOrCreateLocationFolder(drive, practiceName, locationName)

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [parentId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  })

  return { fileId: res.data.id, url: res.data.webViewLink }
}

const AVATARS_CACHE_KEY = '\0avatars' // NUL prefix can't collide with a real client folder name

async function getOrCreateAvatarsFolder(drive) {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  let folderId = folderIdCache.get(AVATARS_CACHE_KEY)
  if (!folderId) {
    folderId = await getOrCreateSubfolder(drive, rootFolderId, 'Avatars')
    folderIdCache.set(AVATARS_CACHE_KEY, folderId)
  }
  return folderId
}

// Profile pictures get their own flat folder, separate from the per-client/location layout —
// there's no practice/location context for an avatar, just the account uploading it.
async function uploadAvatarToDrive(buffer, filename, mimeType) {
  if (!isConfigured()) return null

  const drive = getClient()
  const parentId = await getOrCreateAvatarsFolder(drive)

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [parentId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  })

  return { fileId: res.data.id, url: res.data.webViewLink }
}

module.exports = { uploadToDrive, uploadAvatarToDrive }
