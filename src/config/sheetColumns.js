// US month/day/year format everywhere a date/timestamp is written to the Sheet, regardless of
// the server's own OS locale.
function formatTimestamp(date) {
  if (!date) return ''
  return new Date(date).toLocaleString('en-US')
}

// A leading apostrophe is Sheets' standard "force literal text" marker (never shown, just
// consumed as a formatting instruction) — without it, USER_ENTERED can auto-detect a well-formed
// date string and convert it to its own internal date serial number, which then displays as a raw
// number like 46219.84669 whenever the cell/column doesn't already carry an explicit date format.
function sheetText(value) {
  return value ? `'${value}` : ''
}

function fileLink(fileRef) {
  if (!fileRef || !fileRef.fileId) return ''
  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:5000'
  return `${base}/api/uploads/${fileRef.fileId}`
}

function driveLink(fileRef) {
  return fileRef?.driveUrl || ''
}

// Collapses an audio entry's type/script/file into the single value the sheet displays:
// "Default" if that was chosen, otherwise whatever the POC actually provided — the script/link
// text, the file link (Drive copy preferred over the raw GridFS link), or both.
function audioValue(type, script, fileRef) {
  if (type === 'Default') return 'Default'
  const link = driveLink(fileRef) || fileLink(fileRef)
  return [script || '', link].filter(Boolean).join(' | ')
}

function audioColumns(field, label) {
  return [{ header: label, get: (s) => audioValue(s[`${field}Type`], s[`${field}Script`], s[`${field}File`]) }]
}

// "Dial & Exit" only ever shows an On-Hold Audio field in the form — unlike "Dial & Queue" and
// "Queue Only", it never renders the queue-detail fields (duration, callers, announcement, exit
// type/key, exit voicemail), so those columns would always be blank for it. onHoldOnly skips them.
function queueColumns(key, label, { onHoldOnly = false } = {}) {
  const q = (s) => s.queue && s.queue[key]
  const onHoldColumn = {
    header: `${label} - On-Hold Audio`,
    get: (s) => audioValue(q(s)?.onholdType, q(s)?.onholdScript, q(s)?.onholdFile),
  }
  if (onHoldOnly) return [onHoldColumn]
  return [
    onHoldColumn,
    { header: `${label} - Max Queue Duration (s)`, get: (s) => q(s)?.maxDuration || '' },
    { header: `${label} - Max Callers in Queue`, get: (s) => q(s)?.maxCallers || '' },
    { header: `${label} - Queue Announcement Type`, get: (s) => (q(s)?.announcement || []).join(', ') },
    { header: `${label} - Queue Exit Type`, get: (s) => q(s)?.exitType || '' },
    { header: `${label} - Key to Activate Exit`, get: (s) => q(s)?.exitKey || '' },
    { header: `${label} - Exit Voicemail Audio`, get: (s) => audioValue(undefined, q(s)?.exitScript, q(s)?.exitFile) },
  ]
}

const COLUMNS = [
  { header: 'Account Onboarded', manual: true, get: () => '' },
  { header: 'Configuration Status', manual: true, get: () => '' },
  { header: 'Implementation Specialist', manual: true, get: () => '' },
  { header: 'Timestamp', get: (s) => sheetText(formatTimestamp(s.createdAt)) },

  // Step 1 — Account & Location
  { header: 'Client Name/Account Name', get: (s) => s.clientName || '' },
  { header: 'Location Name', get: (s) => s.locationName || '' },
  { header: 'Billable Location?', get: (s) => s.locationBillable || '' },
  { header: 'Market?', get: (s) => s.market || '' },
  { header: 'Environment?', get: (s) => s.environment || '' },
  { header: 'Billing Plan', get: (s) => s.billingPlan || '' },
  { header: 'Implementation POC', get: (s) => s.poc || '' },
  { header: 'Timezone', get: (s) => s.timezone || '' },
  { header: 'Desired Go-Live Date', get: (s) => s.goLiveDate || '' },

  // Step 2 — Phone & Hours
  { header: 'List of Phone Numbers', get: (s) => s.phoneNumbers || '' },
  { header: 'Business Days', get: (s) => (s.businessDays || []).join(', ') },
  { header: 'Business Hours', get: (s) => s.businessHours || '' },
  { header: 'After Hours Days', get: (s) => (s.afterHoursDays || []).join(', ') },
  { header: 'After Hours Timing', get: (s) => s.afterHoursTiming || '' },
  { header: 'Custom Holidays', get: (s) => s.customHolidays || '' },

  // Step 3 — Call Flow
  { header: 'Business Hours Phone Tree', get: (s) => s.phoneTree || '' },
  { header: 'Business Hours Call Flow in Detail', get: (s) => s.callFlow || '' },
  { header: 'After Hours Condition, if any', get: (s) => s.afterHoursCondition || '' },

  // Step 4 — Audio
  { header: 'Audio Language(s)?', get: (s) => s.audioLanguage || '' },
  ...audioColumns('welcome', 'Welcome Audio'),
  ...audioColumns('ahvm', 'After Hours Voicemail Audio'),
  ...audioColumns('bhvm', 'Busy Hours Voicemail Audio'),

  // Step 5 — Ring / Queue
  { header: 'Ring Type?', get: (s) => s.ringType || '' },
  { header: 'Ring Duration? (in seconds)', get: (s) => s.ringDuration || '' },
  { header: 'List of Users/Extensions in Ring Group', get: (s) => s.ringGroupUsers || '' },
  { header: 'List of Users/Extensions in Shared Voicemail Group', get: (s) => s.svmUsers || '' },
  { header: 'Voicemail to Email Notification?', get: (s) => s.vmEmail || '' },
  { header: 'Voicemail Email Addresses', get: (s) => s.vmEmailAddresses || '' },
  { header: 'Call Queue Type?', get: (s) => s.queueType || '' },
  ...queueColumns('exit', 'Dial & Exit', { onHoldOnly: true }),
  ...queueColumns('dq', 'Dial & Queue'),
  ...queueColumns('qo', 'Queue Only'),
  { header: 'Auto Dial (Queue Only)', get: (s) => s.autoDial || '' },

  // Step 6 — Devices
  { header: 'Device Line Keys', get: (s) => s.lineKeys || '' },
  { header: 'List of Agents Requiring Hot Desking', get: (s) => s.hotDesking || '' },
  { header: 'List of Admin Users', get: (s) => s.adminUsers || '' },
  { header: 'AI Usage Limit', get: (s) => s.aiLimit || '' },
  { header: 'Card Assignment Rules', get: (s) => s.cardAssignment || '' },
  { header: 'Card Visibility - Agent Names', get: (s) => s.cardVisibility || '' },

  // Step 7 — Workflows, DNI, SMS/Fax
  { header: 'Automated Workflow?', get: (s) => s.workflow || '' },
  { header: 'Automated Workflow Condition', get: (s) => s.workflowCondition || '' },
  { header: 'Automated Workflow Actions', get: (s) => (s.workflowAction || []).join(', ') },
  { header: 'SMS Content per Workflow', get: (s) => s.smsContent || '' },
  { header: 'DNI Campaigns?', get: (s) => s.dni || '' },
  { header: 'DNI Campaign Details & Google Ads Credentials', get: (s) => s.dniCampaigns || '' },
  { header: 'List of SMS Numbers', get: (s) => s.smsNumbers || '' },
  { header: 'List of Users with SMS Access', get: (s) => s.smsUsers || '' },
  { header: 'Text Unification?', get: (s) => s.textUnification || '' },
  { header: 'List of Fax Numbers', get: (s) => s.faxNumbers || '' },
  { header: 'List of Users with Fax Access', get: (s) => s.faxUsers || '' },

  // Step 8 — Links & PMS
  { header: 'Phone Information Sheet Link', get: (s) => s.phoneSheetLink || '' },
  { header: 'Questionnaire Link', get: (s) => s.questionnaireLink || '' },
  { header: 'Additional Notes', get: (s) => s.additionalNotes || '' },
  { header: 'PMS System', get: (s) => s.pms || '' },
  { header: 'Server Access Details', get: (s) => s.serverAccess || '' },

  // Tracking — filled manually by the implementation team, not by the form
  { header: 'Completion Date', manual: true, get: () => '' },
  { header: 'Implemented Date', manual: true, get: () => '' },
  { header: 'Time Taken to Complete Setup', manual: true, get: () => '' },
  { header: 'Remarks', manual: true, get: () => '' },

  // Internal lookup key — lets edits find and update the right row instead of appending a duplicate
  { header: 'Submission ID', get: (s) => (s._id ? String(s._id) : '') },
]

const HEADER_ROW = COLUMNS.map((c) => c.header)

const ID_COLUMN_INDEX = COLUMNS.findIndex((c) => c.header === 'Submission ID')
const CLIENT_NAME_COLUMN_INDEX = COLUMNS.findIndex((c) => c.header === 'Client Name/Account Name')
const LOCATION_COLUMN_INDEX = COLUMNS.findIndex((c) => c.header === 'Location Name')
const ACCOUNT_ONBOARDED_COLUMN_INDEX = COLUMNS.findIndex((c) => c.header === 'Account Onboarded')
const CONFIGURATION_STATUS_COLUMN_INDEX = COLUMNS.findIndex((c) => c.header === 'Configuration Status')
const IMPLEMENTATION_SPECIALIST_COLUMN_INDEX = COLUMNS.findIndex((c) => c.header === 'Implementation Specialist')
const COMPLETION_DATE_COLUMN_INDEX = COLUMNS.findIndex((c) => c.header === 'Completion Date')
const TIME_TAKEN_COLUMN_INDEX = COLUMNS.findIndex((c) => c.header === 'Time Taken to Complete Setup')

// Contiguous ranges of columns that come from the submission itself (as opposed to columns the
// implementation team fills in by hand directly in the sheet, e.g. Completion Date, Remarks).
// Edits only ever rewrite these ranges, so manually-entered tracking data is never clobbered.
const SYNCED_RANGES = (() => {
  const ranges = []
  let start = null
  COLUMNS.forEach((col, i) => {
    if (col.manual) {
      if (start !== null) {
        ranges.push([start, i - 1])
        start = null
      }
    } else if (start === null) {
      start = i
    }
  })
  if (start !== null) ranges.push([start, COLUMNS.length - 1])
  return ranges
})()

function mapSubmissionToRow(submission) {
  const doc = submission.toObject ? submission.toObject() : submission
  return COLUMNS.map((c) => {
    const value = c.get(doc)
    return value === null || value === undefined ? '' : String(value)
  })
}

module.exports = {
  HEADER_ROW,
  mapSubmissionToRow,
  formatTimestamp,
  sheetText,
  ID_COLUMN_INDEX,
  CLIENT_NAME_COLUMN_INDEX,
  LOCATION_COLUMN_INDEX,
  ACCOUNT_ONBOARDED_COLUMN_INDEX,
  CONFIGURATION_STATUS_COLUMN_INDEX,
  IMPLEMENTATION_SPECIALIST_COLUMN_INDEX,
  COMPLETION_DATE_COLUMN_INDEX,
  TIME_TAKEN_COLUMN_INDEX,
  SYNCED_RANGES,
}
