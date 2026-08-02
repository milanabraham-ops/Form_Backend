// Google Chat incoming webhooks — simplest integration for a one-way notification (no OAuth,
// no published/installed Chat app, just a POST to a per-space URL). Each event type posts to
// its own configured space so QA-team traffic and POC updates don't mix in one channel.
// URLs are admin-managed (Settings), not env vars, so swapping a space needs no deploy/restart.
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

// New request just came in — same shared space as the QA handoff notification, since both are
// "this needs someone from the team to pick it up" call-to-actions.
async function notifyNewRequest(submission) {
  const settings = await Settings.getSettings()
  const webhookUrl = settings.gchatQaWebhookUrl
  if (!webhookUrl) return
  const label = submissionLabel(submission)
  await postToWebhook(webhookUrl, `*${label}* is a new implementation request submitted by ${submission.poc || 'a POC'}.`)
}

// Specialist just handed a location off — QA team's shared space, so anyone on the team can
// see it needs a reviewer.
async function notifyQATeamHandoff(submission) {
  const settings = await Settings.getSettings()
  const webhookUrl = settings.gchatQaWebhookUrl
  if (!webhookUrl) return
  const label = submissionLabel(submission)
  await postToWebhook(
    webhookUrl,
    `*${label}* has been configured by ${submission.implementationSpecialist || 'a specialist'} and is ready for QA review.`,
  )
}

// QA's per-item checklist findings, attached to the completion notification so the POC sees
// exactly what (if anything) needs their attention without having to open the account.
function checklistSummary(qaChecklist) {
  const errors = (qaChecklist || []).filter((i) => i.status === 'error')
  const clarifications = (qaChecklist || []).filter((i) => i.status === 'clarification')
  if (errors.length === 0 && clarifications.length === 0) return 'No errors.'

  const section = (title, items) => `${title}:\n${items.map((i) => `- ${i.item}: ${i.note || 'No detail provided'}`).join('\n')}`
  const parts = []
  if (errors.length > 0) parts.push(section('Errors', errors))
  if (clarifications.length > 0) parts.push(section('Clarifications', clarifications))
  return parts.join('\n\n')
}

// QA signed off — POC's own space, addressed by name so it's clear whose request this is.
async function notifyPocCompleted(submission) {
  const settings = await Settings.getSettings()
  const webhookUrl = settings.gchatPocWebhookUrl
  if (!webhookUrl) return
  const label = submissionLabel(submission)
  await postToWebhook(
    webhookUrl,
    `Hi ${submission.poc || 'there'}, *${label}* has been reviewed by ${submission.qaAgent || 'the QA team'} and is complete.\n\n${checklistSummary(submission.qaChecklist)}`,
  )
}

module.exports = { notifyNewRequest, notifyQATeamHandoff, notifyPocCompleted }
