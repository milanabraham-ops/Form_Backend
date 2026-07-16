const { Schema, model } = require('mongoose')

const fileRefSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, default: null },
    filename: { type: String, default: '' },
    driveUrl: { type: String, default: '' },
  },
  { _id: false },
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

const submissionSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    group: { type: Schema.Types.ObjectId, ref: 'Group', default: null, index: true },

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

    // Step 5 — Ring / Queue
    ringType: { type: String, default: '' },
    ringDuration: { type: String, default: '' },
    ringGroupUsers: { type: String, default: '' },
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
    serverAccess: { type: String, default: '' },

    // Tracking — mirrored from the manually-maintained dropdown columns in the Google Sheet.
    // The sheet is the source of truth; these are a durable backup so the info survives
    // even if the Sheet is temporarily unreachable or the row is ever removed.
    accountOnboarded: { type: String, default: '' },
    configurationStatus: { type: String, default: '' },
    implementationSpecialist: { type: String, default: '' },

    // Auto-stamped the moment configurationStatus is first observed as COMPLETED — also doubles
    // as the "already stamped" guard so it's only written once.
    completionDate: { type: Date, default: null },
    daysTakenToComplete: { type: Number, default: null },
  },
  { timestamps: true },
)

module.exports = model('Submission', submissionSchema)
