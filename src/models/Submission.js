const { Schema, model } = require('mongoose')
const { encrypt, decrypt } = require('../utils/encryption')

const fileRefSchema = new Schema(
  {
    // Drive is the primary store now — fileId (GridFS) is only ever set when Drive wasn't
    // configured at upload time (local/dev fallback). driveFileId is the real Drive file id,
    // needed to delete the file later; driveUrl is just the human-clickable view/download link.
    fileId: { type: Schema.Types.ObjectId, default: null },
    driveFileId: { type: String, default: '' },
    filename: { type: String, default: '' },
    driveUrl: { type: String, default: '' },
  },
  { _id: false },
)

const qaChecklistItemSchema = new Schema(
  {
    item: { type: String, required: true },
    // '' = not yet reviewed, 'ok' = no issue, 'error' = something's wrong (see note),
    // 'clarification' = QA has a question about it (see note), 'na' = doesn't apply here.
    status: { type: String, enum: ['', 'ok', 'error', 'clarification', 'na'], default: '' },
    note: { type: String, default: '' },
  },
  { _id: false },
)

const commentSchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, required: true },
    text: { type: String, required: true },
    // Who this specific comment should notify — the POC when a staff member (specialist/qa/
    // admin) posts, or whichever staff member posted most recently when the POC replies. Kept
    // per-comment (not derived at read time) so the notification target is fixed at the moment
    // it's written, and doesn't shift later if a different agent takes over the submission.
    notifyUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
)

const queueDetailSchema = new Schema(
  {
    onholdType: { type: String, default: '' },
    onholdScript: { type: String, default: '' },
    onholdFile: { type: fileRefSchema, default: () => ({}) },
    maxDuration: { type: String, default: '' },
    maxCallers: { type: String, default: '' },
    announcement: { type: [String], default: [] },
    exitType: { type: String, default: '' },
    exitKey: { type: String, default: '' },
    exitScript: { type: String, default: '' },
    exitFile: { type: fileRefSchema, default: () => ({}) },
  },
  { _id: false },
)

// A location can have several independent ring groups, each with its own SVM, voicemail
// settings, and call queue setup — not one shared config for the whole location.
const ringGroupSchema = new Schema(
  {
    // "Same configuration as previous" copies every field below except ringGroupUsers from the
    // prior ring group — the one thing that's always allowed to differ is who's actually in the
    // group. Like sameSvmAsPrevious, the flag only drives the form's UI; every field always
    // holds its own actual resolved value, so nothing downstream needs to resolve the flag.
    sameConfigAsPrevious: { type: Boolean, default: false },

    ringType: { type: String, default: '' },
    ringDuration: { type: String, default: '' },
    ringGroupUsers: { type: String, default: '' },

    // "Same as previous" copies the prior ring group's SVM users so it doesn't need re-typing
    // when several ring groups genuinely share one voicemail group — the flag just drives the
    // form's UI (disables the field); svmUsers itself always holds the actual resolved value,
    // so nothing downstream (Sheet export, review screen) needs to resolve the flag.
    sameSvmAsPrevious: { type: Boolean, default: false },
    svmUsers: { type: String, default: '' },

    vmEmail: { type: String, default: '' },
    vmEmailAddresses: { type: String, default: '' },
    queueType: { type: String, default: '' },
    queue: {
      exit: { type: queueDetailSchema, default: () => ({}) },
      dq: { type: queueDetailSchema, default: () => ({}) },
      qo: { type: queueDetailSchema, default: () => ({}) },
    },
    autoDial: { type: String, default: '' },
  },
  { _id: false },
)

const submissionSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    group: { type: Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
    // Stamped true at creation when the owner is a test account — lets test submissions live
    // alongside real ones in every view (same queues, same stats) while still being identifiable
    // and bulk-purgeable on their own.
    isTestData: { type: Boolean, default: false, index: true },

    // Step 1 — Account & Location
    clientName: { type: String, required: true, trim: true },
    locationName: { type: String, required: true, trim: true },
    locationBillable: { type: String, default: '' },
    market: { type: String, required: true, enum: ['Dental', 'Ophthalmology', 'Physiotherapy', 'Veterinary'] },
    environment: { type: String, default: '' },
    billingPlan: { type: String, default: '' },
    poc: { type: String, default: '' },
    timezone: { type: String, default: '' },
    goLiveDate: { type: String, default: '' },

    // Step 2 — Phone & Hours
    phoneNumbers: { type: String, default: '' },
    businessDays: { type: [String], default: [] },
    businessHours: { type: String, default: '' },
    afterHoursDays: { type: [String], default: [] },
    afterHoursTiming: { type: String, default: '' },
    customHolidays: { type: String, default: '' },

    // Step 3 — Call Flow
    phoneTree: { type: String, default: '' },
    callFlow: { type: String, default: '' },
    afterHoursPhoneTree: { type: String, default: '' },
    afterHoursCondition: { type: String, default: '' },

    // Step 4 — Audio
    audioLanguage: { type: String, default: '' },
    welcomeType: { type: String, default: '' },
    welcomeScript: { type: String, default: '' },
    welcomeFile: { type: fileRefSchema, default: () => ({}) },
    ahvmType: { type: String, default: '' },
    ahvmScript: { type: String, default: '' },
    ahvmFile: { type: fileRefSchema, default: () => ({}) },
    bhvmType: { type: String, default: '' },
    bhvmScript: { type: String, default: '' },
    bhvmFile: { type: fileRefSchema, default: () => ({}) },

    // Step 5 — Ring / Queue (a location can have several independent ring groups)
    ringGroups: { type: [ringGroupSchema], default: () => [] },

    // Step 6 — Devices
    lineKeys: { type: String, default: '' },
    hotDesking: { type: String, default: '' },
    adminUsers: { type: String, default: '' },
    aiLimit: { type: String, default: '' },
    cardAssignment: { type: String, default: '' },
    cardVisibility: { type: String, default: '' },

    // Step 7 — Workflows
    workflow: { type: String, default: '' },
    workflowCondition: { type: String, default: '' },
    workflowAction: { type: [String], default: [] },
    smsContent: { type: String, default: '' },
    dni: { type: String, default: '' },
    dniCampaigns: { type: String, default: '' },
    smsNumbers: { type: String, default: '' },
    smsUsers: { type: String, default: '' },
    textUnification: { type: String, default: '' },
    faxNumbers: { type: String, default: '' },
    faxUsers: { type: String, default: '' },

    // Step 8 — Links & PMS
    phoneSheetLink: { type: String, default: '' },
    questionnaireLink: { type: String, default: '' },
    additionalNotes: { type: String, default: '' },
    pms: { type: String, default: '' },
    // Real login credentials for the client's PMS system — encrypted at rest (AES-256-GCM) via
    // this set/get pair, transparent to the rest of the app: assign/read plaintext as normal,
    // Mongoose handles the ciphertext underneath. Requires `toJSON`/`toObject` getters enabled
    // below, since Express's res.json() serializes through toJSON().
    serverAccess: {
      type: String,
      default: '',
      set: (value) => encrypt(value),
      get: (value) => decrypt(value),
    },

    // Tracking — mirrored from the manually-maintained dropdown columns in the Google Sheet.
    // The sheet is the source of truth; these are a durable backup so the info survives
    // even if the Sheet is temporarily unreachable or the row is ever removed.
    accountOnboarded: { type: String, default: '' },
    configurationStatus: { type: String, default: '' },
    implementationSpecialist: { type: String, default: '' },

    // App-only (not mirrored to the Sheet, which has no matching column) — who on the QA team
    // actually reviewed this one, so QA members can see their own review history separately from
    // the shared QA queue.
    qaAgent: { type: String, default: '' },

    // App-only — the QA reviewer's per-item checklist for this account (Configuration, Phone
    // Number, Ring Groups, etc). Filled in as part of marking the account Completed; its
    // errors/clarifications get attached to the completion notification in Chat.
    qaChecklist: { type: [qaChecklistItemSchema], default: () => [] },

    // App-only — whatever configurationStatus was right before "On Hold" was set, so "Resume"
    // can restore it exactly (Not Started/In Progress for a specialist-side hold, QA for a
    // QA-side hold). Cleared back to '' once resumed.
    statusBeforeHold: { type: String, default: '' },

    // Auto-stamped the moment configurationStatus is first observed as COMPLETED — also doubles
    // as the "already stamped" guard so it's only written once.
    completionDate: { type: Date, default: null },
    daysTakenToComplete: { type: Number, default: null },

    // App-only — set the moment the (separate, deliberate) Handover action posts to the POC's
    // Chat space. Completed just means QA signed off internally; this is the actual "the client
    // has been told" moment, since QA may want to hold off announcing it right away.
    pocHandoverAt: { type: Date, default: null },

    // App-only — stamped the moment a specialist genuinely hands this off to QA (not QA resuming
    // their own on-hold review, and not a silent recheck reopening). Drives the "new QA request"
    // notification, separately from createdAt (which only tells you when the location itself was
    // first submitted, not when it actually became QA's problem).
    qaHandoffAt: { type: Date, default: null },

    // App-only — a Sheets-comment-style discussion thread on this account. Anyone who can
    // configure it (specialist/qa/admin) or the POC who owns it can post; everyone with access to
    // the submission can read the whole log, but only notifyUserId gets alerted per comment.
    comments: { type: [commentSchema], default: () => [] },
  },
  {
    timestamps: true,
    // Needed for serverAccess's getter (decryption) to actually run on the way out — without
    // this, res.json()/toObject() would return the raw ciphertext instead of the plaintext.
    toJSON: { getters: true },
    toObject: { getters: true },
  },
)

module.exports = model('Submission', submissionSchema)
