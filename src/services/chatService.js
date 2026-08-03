// Google Chat incoming webhooks — simplest integration for a one-way notification (no OAuth,
// no published/installed Chat app, just a POST to a per-space URL). Two spaces total: the
// QA/specialist team's internal space, and the implementation POC's space — URLs are
// admin-managed (Settings), not env vars, so swapping a space needs no deploy/restart.
//
// Every message except the initial "new request" bot ping is user-composed (the specialist/QA/
// POC edits it before it sends), so this file is mostly two generic "post this text" senders
// rather than one function per event.
const Settings = require('../models/Settings')

function submissionLabel(submission) {
  return `${submission.clientName || 'Untitled'} (${submission.locationName || 'Untitled location'})`
}

async function postToWebhook(webhookUrl, text) {
  if (!webhookUrl) return
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`Google Chat webhook responded ${res.status}`)
}

// New request just came in — the one fixed, system-generated message (everything else in this
// file is user-composed). @all-pinged since nobody's picked it up yet and any specialist could
// be the one to take it.
async function notifyNewRequest(submission) {
  const settings = await Settings.getSettings()
  const label = submissionLabel(submission)
  await postToWebhook(settings.gchatQaWebhookUrl, `<users/all> New implementation request submitted by *${submission.poc || 'a POC'}* for *${label}*.`)
}

// Every QA/specialist-team message from here on (handoff notes, QA result, recheck-fixed) is
// composed by whoever triggers it — this just posts it as-is.
async function postToQaGroup(message) {
  const settings = await Settings.getSettings()
  await postToWebhook(settings.gchatQaWebhookUrl, message)
}

// Every POC-facing message (the new-request confirmation, the final handover) is composed by
// the POC/specialist/QA member sending it — this just posts it as-is.
async function postToPocGroup(message) {
  const settings = await Settings.getSettings()
  await postToWebhook(settings.gchatPocWebhookUrl, message)
}

module.exports = { notifyNewRequest, postToQaGroup, postToPocGroup }
