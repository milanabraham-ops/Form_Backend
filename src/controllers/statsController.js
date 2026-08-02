const Submission = require('../models/Submission')
const { normalizeStatus } = require('../utils/statusMatch')

const RANGE_DAYS = { week: 7, month: 30, quarter: 90, year: 365 }

function rangeStart(range) {
  const days = RANGE_DAYS[range]
  if (!days) return null
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

// Mirrors the Sheet's own Configuration Status dropdown (Not Taken / Not Started / In Progress /
// On Hold / QA / Completed) — anything unrecognized (blank, or literally "Not Taken") falls back
// to "Not Taken" rather than a silent 4th bucket, so old and new data classify the same way.
function statusBucket(status) {
  const s = normalizeStatus(status)
  if (s === 'COMPLETED') return 'Completed'
  if (s === 'ON HOLD') return 'On Hold'
  if (s === 'QA') return 'QA'
  if (s === 'IN PROGRESS') return 'In Progress'
  if (s === 'NOT STARTED') return 'Not Started'
  return 'Not Taken'
}

function isMineName(fieldValue, name) {
  return (fieldValue || '').trim().toLowerCase() === (name || '').trim().toLowerCase()
}

function dayKey(date) {
  return date.toISOString().slice(0, 10)
}

function weekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// Builds a fixed, ordered set of trend buckets ending "now", sized to the range so the bar
// count stays readable (7 daily bars for a week, up to 13 weekly bars for a quarter, etc).
// For 'all', only the most recent 12 months are plotted — older activity is still counted in
// every other stat, just not drawn as its own bar, so `truncated` is surfaced rather than hidden.
function buildTrend(docs, range) {
  const now = new Date()
  let keyFn
  let bucketCount

  if (range === 'week') {
    keyFn = dayKey
    bucketCount = 7
  } else if (range === 'month') {
    keyFn = weekKey
    bucketCount = 5
  } else if (range === 'quarter') {
    keyFn = weekKey
    bucketCount = 13
  } else {
    keyFn = monthKey
    bucketCount = 12
  }

  const buckets = []
  if (keyFn === dayKey) {
    for (let i = bucketCount - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      buckets.push({ key: dayKey(d), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })
    }
  } else if (keyFn === weekKey) {
    for (let i = bucketCount - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i * 7)
      buckets.push({ key: weekKey(d), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) })
    }
  } else {
    for (let i = bucketCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({ key: monthKey(d), label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) })
    }
  }

  const counts = new Map(buckets.map((b) => [b.key, 0]))
  let truncated = false
  for (const doc of docs) {
    const k = keyFn(new Date(doc.createdAt))
    if (counts.has(k)) counts.set(k, counts.get(k) + 1)
    else truncated = true
  }

  return { truncated, points: buckets.map((b) => ({ label: b.label, count: counts.get(b.key) })) }
}

// An "account" is the client relationship, not the individual location — a Group with several
// locations counts as one account, same as the Dashboard's own uniqueAccounts calc; a standalone
// Submission (no group) is its own account. "Locations" (docs.length) counts every Submission.
function accountsCount(docs) {
  const keys = new Set(docs.map((d) => (d.group ? `g:${d.group}` : `s:${d._id}`)))
  return keys.size
}

function avg(nums) {
  if (!nums.length) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

function statusBreakdown(docs) {
  const order = ['Not Taken', 'Not Started', 'In Progress', 'On Hold', 'QA', 'Completed']
  const counts = new Map(order.map((s) => [s, 0]))
  for (const doc of docs) {
    const bucket = statusBucket(doc.configurationStatus)
    counts.set(bucket, (counts.get(bucket) || 0) + 1)
  }
  return order.map((status) => ({ status, count: counts.get(status) }))
}

// Market is a nominal category (matches Submission's own enum) — no natural order, unlike
// Configuration Status, so this is a plain count breakdown rather than a funnel.
const MARKETS = ['Dental', 'Ophthalmology', 'Physiotherapy', 'Veterinary']

function marketBreakdown(docs) {
  const counts = new Map(MARKETS.map((m) => [m, 0]))
  for (const doc of docs) {
    if (counts.has(doc.market)) counts.set(doc.market, counts.get(doc.market) + 1)
  }
  return MARKETS.map((market) => ({ market, count: counts.get(market) }))
}

// Leaderboard rows for a name-keyed field (implementationSpecialist / qaAgent / poc). Sorted desc,
// capped at 10 for chart legibility — `omitted` says how many more exist so nothing is silently
// dropped from view.
function leaderboard(docs, field, extra) {
  const byName = new Map()
  for (const doc of docs) {
    const name = (doc[field] || '').trim()
    if (!name) continue
    if (!byName.has(name)) byName.set(name, { name, count: 0, completed: 0, days: [] })
    const row = byName.get(name)
    row.count += 1
    if (normalizeStatus(doc.configurationStatus) === 'COMPLETED') row.completed += 1
    if (extra === 'days' && typeof doc.daysTakenToComplete === 'number') row.days.push(doc.daysTakenToComplete)
  }
  const sorted = [...byName.values()]
    .map((r) => ({ name: r.name, count: r.count, completed: r.completed, avgDays: avg(r.days) }))
    .sort((a, b) => b.count - a.count)
  return { rows: sorted.slice(0, 10), omitted: Math.max(0, sorted.length - 10) }
}

// Two-series radar: "You" vs "Team Average", each axis independently scaled so the larger of the
// two hits 100 — keeps the shape meaningful without needing a shared absolute scale across axes
// that measure very different things (a count vs a percentage vs an inverted day-count).
function buildYouVsTeamRadar(axes, youValues, teamValues) {
  const scaled = axes.map((axis, i) => {
    const you = youValues[i] ?? 0
    const team = teamValues[i] ?? 0
    const max = Math.max(you, team, 0.0001)
    return { axis, you: Math.round((you / max) * 100), team: Math.round((team / max) * 100) }
  })
  return {
    axes,
    series: [
      { name: 'You', values: scaled.map((s) => s.you) },
      { name: 'Team Average', values: scaled.map((s) => s.team) },
    ],
  }
}

exports.get = async (req, res, next) => {
  try {
    const range = ['week', 'month', 'quarter', 'year'].includes(req.query.range) ? req.query.range : 'all'
    const start = rangeStart(range)
    const filter = start ? { createdAt: { $gte: start } } : {}
    const docs = await Submission.find(filter).lean()

    const completedDocs = docs.filter((d) => normalizeStatus(d.configurationStatus) === 'COMPLETED')
    const overview = {
      total: docs.length,
      accounts: accountsCount(docs),
      completed: completedDocs.length,
      inProgress: docs.filter((d) => normalizeStatus(d.configurationStatus) === 'IN PROGRESS').length,
      inQA: docs.filter((d) => normalizeStatus(d.configurationStatus) === 'QA').length,
      notStarted: docs.filter((d) => !normalizeStatus(d.configurationStatus)).length,
      avgDaysToConfigure: avg(docs.filter((d) => typeof d.daysTakenToComplete === 'number').map((d) => d.daysTakenToComplete)),
    }
    const trend = buildTrend(docs, range)
    const status = statusBreakdown(docs)

    if (req.user.role === 'admin') {
      return res.json({
        role: 'admin',
        range,
        overview,
        trend,
        status,
        market: marketBreakdown(docs),
        specialistLeaderboard: leaderboard(docs, 'implementationSpecialist', 'days'),
        qaLeaderboard: leaderboard(docs, 'qaAgent'),
        pocLeaderboard: leaderboard(docs, 'poc'),
        radarTopSpecialists: (() => {
          const { rows } = leaderboard(docs, 'implementationSpecialist', 'days')
          const top = rows.slice(0, 3)
          const axes = ['Volume', 'Speed', 'Completion Rate']
          const maxCount = Math.max(1, ...top.map((r) => r.count))
          const validDays = top.map((r) => r.avgDays).filter((d) => typeof d === 'number')
          const maxDays = Math.max(1, ...validDays)
          return {
            axes,
            series: top.map((r) => ({
              name: r.name,
              values: [
                Math.round((r.count / maxCount) * 100),
                typeof r.avgDays === 'number' ? Math.round((1 - r.avgDays / (maxDays * 1.2)) * 100) : 0,
                r.count ? Math.round((r.completed / r.count) * 100) : 0,
              ],
            })),
          }
        })(),
      })
    }

    if (req.user.role === 'poc') {
      const mineDocs = docs.filter((d) => String(d.owner) === String(req.user._id))
      const mineCompleted = mineDocs.filter((d) => normalizeStatus(d.configurationStatus) === 'COMPLETED')
      return res.json({
        role: 'poc',
        range,
        mine: {
          total: mineDocs.length,
          accounts: accountsCount(mineDocs),
          completed: mineCompleted.length,
          avgDaysToConfigure: avg(mineDocs.filter((d) => typeof d.daysTakenToComplete === 'number').map((d) => d.daysTakenToComplete)),
          trend: buildTrend(mineDocs, range),
          status: statusBreakdown(mineDocs),
          market: marketBreakdown(mineDocs),
        },
        // Org-wide, so a POC can see how their own volume stacks up against every other POC —
        // keyed on the free-text `poc` field (the named point-of-contact), not the `owner` account.
        othersLeaderboard: leaderboard(docs, 'poc'),
      })
    }

    if (req.user.role === 'specialist') {
      const mineDocs = docs.filter((d) => isMineName(d.implementationSpecialist, req.user.name))
      const mineCompleted = mineDocs.filter((d) => normalizeStatus(d.configurationStatus) === 'COMPLETED')
      const mineDays = mineDocs.filter((d) => typeof d.daysTakenToComplete === 'number').map((d) => d.daysTakenToComplete)

      const teamDocs = docs.filter((d) => (d.implementationSpecialist || '').trim())
      const teamCompleted = teamDocs.filter((d) => normalizeStatus(d.configurationStatus) === 'COMPLETED')
      const teamDays = teamDocs.filter((d) => typeof d.daysTakenToComplete === 'number').map((d) => d.daysTakenToComplete)
      const activeSpecialists = new Set(teamDocs.map((d) => d.implementationSpecialist.trim().toLowerCase())).size

      const mineAvgDays = avg(mineDays)
      const teamAvgDaysPerPerson = activeSpecialists ? teamDocs.length / activeSpecialists : 0

      return res.json({
        role: 'specialist',
        range,
        mine: {
          configured: mineDocs.length,
          accounts: accountsCount(mineDocs),
          completed: mineCompleted.length,
          avgDaysToConfigure: mineAvgDays,
          trend: buildTrend(mineDocs, range),
        },
        team: {
          configured: teamDocs.length,
          accounts: accountsCount(teamDocs),
          completed: teamCompleted.length,
          avgDaysToConfigure: avg(teamDays),
          activeSpecialists,
          avgConfiguredPerPerson: activeSpecialists ? Math.round((teamDocs.length / activeSpecialists) * 10) / 10 : 0,
          // Per-teammate breakdown (including you), for context beyond a single team-average number.
          leaderboard: leaderboard(teamDocs, 'implementationSpecialist', 'days'),
        },
        radar: buildYouVsTeamRadar(
          ['Volume', 'Speed', 'Completion Rate'],
          [
            mineDocs.length,
            mineAvgDays ? 1 / mineAvgDays : 0,
            mineDocs.length ? (mineCompleted.length / mineDocs.length) * 100 : 0,
          ],
          [
            teamAvgDaysPerPerson,
            avg(teamDays) ? 1 / avg(teamDays) : 0,
            teamDocs.length ? (teamCompleted.length / teamDocs.length) * 100 : 0,
          ],
        ),
      })
    }

    // qa
    const mineDocs = docs.filter((d) => isMineName(d.qaAgent, req.user.name))
    const mineCompleted = mineDocs.filter((d) => normalizeStatus(d.configurationStatus) === 'COMPLETED')

    const teamDocs = docs.filter((d) => (d.qaAgent || '').trim())
    const teamCompleted = teamDocs.filter((d) => normalizeStatus(d.configurationStatus) === 'COMPLETED')
    const activeQA = new Set(teamDocs.map((d) => d.qaAgent.trim().toLowerCase())).size

    res.json({
      role: 'qa',
      range,
      mine: { reviewed: mineDocs.length, accounts: accountsCount(mineDocs), completed: mineCompleted.length, trend: buildTrend(mineDocs, range) },
      team: {
        reviewed: teamDocs.length,
        accounts: accountsCount(teamDocs),
        completed: teamCompleted.length,
        activeReviewers: activeQA,
        avgReviewedPerPerson: activeQA ? Math.round((teamDocs.length / activeQA) * 10) / 10 : 0,
        leaderboard: leaderboard(teamDocs, 'qaAgent'),
      },
      radar: buildYouVsTeamRadar(
        ['Volume', 'Completion Rate'],
        [mineDocs.length, mineDocs.length ? (mineCompleted.length / mineDocs.length) * 100 : 0],
        [activeQA ? teamDocs.length / activeQA : 0, teamDocs.length ? (teamCompleted.length / teamDocs.length) * 100 : 0],
      ),
    })
  } catch (err) {
    next(err)
  }
}
