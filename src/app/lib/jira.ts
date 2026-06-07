// src/app/lib/jira.ts
// Server-side only -- credentials never reach the browser

const JIRA_BASE_URL = process.env.JIRA_BASE_URL!
const JIRA_EMAIL = process.env.JIRA_EMAIL!
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN!
const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS || '300') * 1000

const cache = new Map<string, { data: unknown; expires: number }>()

function getAuthHeader() {
  return `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`
}

async function fetchJiraJQL(jql: string, fields: string[]): Promise<JiraIssue[]> {
  const cacheKey = `${jql}|${fields.join(',')}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.data as JiraIssue[]

  const allIssues: JiraIssue[] = []
  let startAt = 0
  const maxResults = 100

  while (true) {
    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ jql, fields, maxResults, startAt }),
    })
    if (!res.ok) throw new Error(`Jira API ${res.status}: ${await res.text()}`)
    const data = await res.json()
    allIssues.push(...data.issues)
    if (allIssues.length >= data.total || data.issues.length === 0) break
    startAt += maxResults
  }

  cache.set(cacheKey, { data: allIssues, expires: Date.now() + CACHE_TTL })
  return allIssues
}

// --- Types ---

export interface JiraIssue {
  id: string
  key: string
  fields: {
    summary: string
    issuetype: { name: string }
    status: { name: string; statusCategory: { key: string } }
    priority: { name: string }
    created: string
    resolutiondate: string | null
    assignee: { displayName: string } | null
    customfield_11553?: { value: string } | null  // Module FnB
    customfield_11554?: { value: string } | null  // Bug Cause FnB
    customfield_14897?: { value: string } | null  // Area / Subteam
    customfield_10316?: string | null             // InProgress start
  }
}

export interface BugMetrics {
  total: number
  resolved: number
  resolvedPct: number
  slaPassRate: number
  pending: number
  persistent: number   // open > 14 days
  cycleTime: number    // avg days created to resolved
}

export interface SupportMetrics {
  total: number
  resolved: number
  resolvedPct: number
  throughput: number   // resolved / week
  pending: number
  ticketPerWeek: number
  cycleTime: number
}

export interface DailyMetrics {
  bugNewInDay: number
  spNewInDay: number
  wipBug: number
  wipSupport: number
  bugResolvedCreatedRatio: number | null
  spResolvedCreatedRatio: number | null
}

export interface SubteamStat {
  name: string
  bugs: number
  support: number
  resolved: number
}

export interface ChartData {
  bugsByWeek: { week: string; count: number }[]
  bugsByMonth: { month: string; count: number }[]
  bugsByCause: Record<string, number>
  subteamPerformance: SubteamStat[]
  resolvedVsCreatedByMonth: { month: string; resolved: number; created: number }[]
  resolvedVsCreatedByWeek: { week: string; resolved: number; created: number }[]
  persistentVsPending: { label: string; persistent: number; pending: number }[]
}

export interface SectionData {
  bugs: BugMetrics
  support: SupportMetrics
  daily: DailyMetrics
}

export interface FullDashboardData {
  overall: SectionData
  pst: SectionData
  charts: ChartData
  lastUpdated: string
}

// --- SLA helpers ---

const SLA_DAYS: Record<string, number> = { Highest: 2, High: 7, Medium: 12, Low: 15 }

function isSlaBreach(issue: JiraIssue): boolean {
  const limitMs = (SLA_DAYS[issue.fields.priority?.name] ?? 12) * 86400000
  const dueMs = new Date(issue.fields.created).getTime() + limitMs
  if (issue.fields.status?.statusCategory?.key === 'done' && issue.fields.resolutiondate) {
    return new Date(issue.fields.resolutiondate).getTime() > dueMs
  }
  return Date.now() > dueMs
}

function getCycleTimeDays(issue: JiraIssue): number | null {
  if (issue.fields.status?.statusCategory?.key !== 'done' || !issue.fields.resolutiondate) return null
  return (new Date(issue.fields.resolutiondate).getTime() - new Date(issue.fields.created).getTime()) / 86400000
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr), now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const copy = new Date(d)
  copy.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return copy.toISOString().slice(0, 10)
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

// --- Issue type classification ---

const BUG_TYPES = new Set(['Production Bug', 'RW_Production Bug', 'Bug'])

function splitByType(issues: JiraIssue[]) {
  const bugs = issues.filter(i => BUG_TYPES.has(i.fields.issuetype?.name))
  const support = issues.filter(i => !BUG_TYPES.has(i.fields.issuetype?.name))
  return { bugs, support }
}

// --- Metric computations ---

function computeBugMetrics(bugs: JiraIssue[]): BugMetrics {
  if (!bugs.length) return { total: 0, resolved: 0, resolvedPct: 0, slaPassRate: 0, pending: 0, persistent: 0, cycleTime: 0 }

  const resolved = bugs.filter(i => i.fields.status?.statusCategory?.key === 'done')
  const open = bugs.filter(i => i.fields.status?.statusCategory?.key !== 'done')
  const persistent = open.filter(i => Date.now() - new Date(i.fields.created).getTime() > 14 * 86400000)
  const slaPass = resolved.filter(i => !isSlaBreach(i)).length

  const cts = resolved.map(getCycleTimeDays).filter((v): v is number => v !== null)
  const avgCt = cts.length ? cts.reduce((a, b) => a + b, 0) / cts.length : 0

  return {
    total: bugs.length,
    resolved: resolved.length,
    resolvedPct: Math.round(resolved.length / bugs.length * 100),
    slaPassRate: resolved.length ? Math.round(slaPass / resolved.length * 100) : 0,
    pending: open.length,
    persistent: persistent.length,
    cycleTime: Math.round(avgCt * 10) / 10,
  }
}

function computeSupportMetrics(support: JiraIssue[]): SupportMetrics {
  if (!support.length) return { total: 0, resolved: 0, resolvedPct: 0, throughput: 0, pending: 0, ticketPerWeek: 0, cycleTime: 0 }

  const resolved = support.filter(i => i.fields.status?.statusCategory?.key === 'done')
  const open = support.filter(i => i.fields.status?.statusCategory?.key !== 'done')

  const sorted = [...support].sort((a, b) => new Date(a.fields.created).getTime() - new Date(b.fields.created).getTime())
  const weeks = Math.max(1, (Date.now() - new Date(sorted[0].fields.created).getTime()) / (7 * 86400000))

  const cts = resolved.map(getCycleTimeDays).filter((v): v is number => v !== null)
  const avgCt = cts.length ? cts.reduce((a, b) => a + b, 0) / cts.length : 0

  return {
    total: support.length,
    resolved: resolved.length,
    resolvedPct: Math.round(resolved.length / support.length * 100),
    throughput: Math.round(resolved.length / weeks * 10) / 10,
    pending: open.length,
    ticketPerWeek: Math.round(support.length / weeks * 10) / 10,
    cycleTime: Math.round(avgCt * 10) / 10,
  }
}

function computeDailyMetrics(bugs: JiraIssue[], support: JiraIssue[]): DailyMetrics {
  const bugNew = bugs.filter(i => isToday(i.fields.created)).length
  const spNew = support.filter(i => isToday(i.fields.created)).length
  const bugResolved = bugs.filter(i => i.fields.resolutiondate && isToday(i.fields.resolutiondate)).length
  const spResolved = support.filter(i => i.fields.resolutiondate && isToday(i.fields.resolutiondate)).length

  const openBugs = bugs.filter(i => i.fields.status?.statusCategory?.key !== 'done')
  const openSp = support.filter(i => i.fields.status?.statusCategory?.key !== 'done')

  const bugAssignees = new Set(openBugs.map(i => i.fields.assignee?.displayName ?? 'Unassigned'))
  const spAssignees = new Set(openSp.map(i => i.fields.assignee?.displayName ?? 'Unassigned'))

  return {
    bugNewInDay: bugNew,
    spNewInDay: spNew,
    wipBug: bugAssignees.size > 0 ? Math.round(openBugs.length / bugAssignees.size * 10) / 10 : 0,
    wipSupport: spAssignees.size > 0 ? Math.round(openSp.length / spAssignees.size * 10) / 10 : 0,
    bugResolvedCreatedRatio: bugNew > 0 ? Math.round(bugResolved / bugNew * 100) / 100 : null,
    spResolvedCreatedRatio: spNew > 0 ? Math.round(spResolved / spNew * 100) / 100 : null,
  }
}

function computeChartData(allIssues: JiraIssue[], bugs: JiraIssue[]): ChartData {
  // Bugs by week
  const weekMap: Record<string, number> = {}
  bugs.forEach(i => { const w = getWeekKey(i.fields.created); weekMap[w] = (weekMap[w] || 0) + 1 })
  const bugsByWeek = Object.entries(weekMap).sort(([a], [b]) => a.localeCompare(b)).map(([week, count]) => ({ week, count }))

  // Bugs by month
  const monthMap: Record<string, number> = {}
  bugs.forEach(i => { const m = getMonthKey(i.fields.created); monthMap[m] = (monthMap[m] || 0) + 1 })
  const bugsByMonth = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }))

  // Bugs by cause
  const bugsByCause: Record<string, number> = {}
  bugs.forEach(i => {
    const c = i.fields.customfield_11554?.value || 'Unclassified'
    bugsByCause[c] = (bugsByCause[c] || 0) + 1
  })

  // Subteam performance
  const subteamMap: Record<string, SubteamStat> = {}
  allIssues.forEach(i => {
    const team = i.fields.customfield_14897?.value
      || i.fields.customfield_11553?.value
      || i.fields.assignee?.displayName
      || 'Other'
    if (!subteamMap[team]) subteamMap[team] = { name: team, bugs: 0, support: 0, resolved: 0 }
    if (BUG_TYPES.has(i.fields.issuetype?.name)) subteamMap[team].bugs++
    else subteamMap[team].support++
    if (i.fields.status?.statusCategory?.key === 'done') subteamMap[team].resolved++
  })
  const subteamPerformance = Object.values(subteamMap)
    .sort((a, b) => (b.bugs + b.support) - (a.bugs + a.support))
    .slice(0, 8)

  // Resolved vs created by month
  const rcMonth: Record<string, { resolved: number; created: number }> = {}
  bugs.forEach(i => {
    const cm = getMonthKey(i.fields.created)
    if (!rcMonth[cm]) rcMonth[cm] = { resolved: 0, created: 0 }
    rcMonth[cm].created++
    if (i.fields.resolutiondate) {
      const rm = getMonthKey(i.fields.resolutiondate)
      if (!rcMonth[rm]) rcMonth[rm] = { resolved: 0, created: 0 }
      rcMonth[rm].resolved++
    }
  })
  const resolvedVsCreatedByMonth = Object.entries(rcMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }))

  // Resolved vs created by week (last 12 weeks)
  const rcWeek: Record<string, { resolved: number; created: number }> = {}
  bugs.forEach(i => {
    const cw = getWeekKey(i.fields.created)
    if (!rcWeek[cw]) rcWeek[cw] = { resolved: 0, created: 0 }
    rcWeek[cw].created++
    if (i.fields.resolutiondate) {
      const rw = getWeekKey(i.fields.resolutiondate)
      if (!rcWeek[rw]) rcWeek[rw] = { resolved: 0, created: 0 }
      rcWeek[rw].resolved++
    }
  })
  const resolvedVsCreatedByWeek = Object.entries(rcWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([week, v]) => ({ week, ...v }))

  // Persistent vs pending by month
  const pvpMonth: Record<string, { persistent: number; pending: number }> = {}
  bugs.forEach(i => {
    const m = getMonthKey(i.fields.created)
    if (!pvpMonth[m]) pvpMonth[m] = { persistent: 0, pending: 0 }
    const isOpen = i.fields.status?.statusCategory?.key !== 'done'
    if (isOpen) {
      pvpMonth[m].pending++
      if (Date.now() - new Date(i.fields.created).getTime() > 14 * 86400000) pvpMonth[m].persistent++
    }
  })
  const persistentVsPending = Object.entries(pvpMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, v]) => ({ label, ...v }))

  return { bugsByWeek, bugsByMonth, bugsByCause, subteamPerformance, resolvedVsCreatedByMonth, resolvedVsCreatedByWeek, persistentVsPending }
}

// --- Public fetch functions ---

const COMMON_FIELDS = [
  'summary', 'status', 'priority', 'created', 'resolutiondate', 'assignee', 'issuetype',
  'customfield_11553', 'customfield_11554', 'customfield_14897', 'customfield_10316',
]

export async function getFnbFullData(): Promise<FullDashboardData> {
  const overallJql = `project = FNB AND labels = "from-crm" ORDER BY created DESC`
  const pstJql = `project = FNB AND labels = "from-crm" AND "subteam_fnb[dropdown]" = PST ORDER BY created DESC`

  const [overallIssues, pstIssues] = await Promise.all([
    fetchJiraJQL(overallJql, COMMON_FIELDS),
    fetchJiraJQL(pstJql, COMMON_FIELDS),
  ])

  const { bugs: oBugs, support: oSp } = splitByType(overallIssues)
  const { bugs: pBugs, support: pSp } = splitByType(pstIssues)

  return {
    overall: { bugs: computeBugMetrics(oBugs), support: computeSupportMetrics(oSp), daily: computeDailyMetrics(oBugs, oSp) },
    pst: { bugs: computeBugMetrics(pBugs), support: computeSupportMetrics(pSp), daily: computeDailyMetrics(pBugs, pSp) },
    charts: computeChartData(overallIssues, oBugs),
    lastUpdated: new Date().toISOString(),
  }
}

export async function getRetailFullData(): Promise<FullDashboardData> {
  const year = new Date().getFullYear()
  const jql = `created >= "${year}-01-01" AND project = PS AND type IN ("Production Bug","RW_Production Bug", RW_Task, Task) ORDER BY created DESC`

  const allIssues = await fetchJiraJQL(jql, COMMON_FIELDS)
  const { bugs, support } = splitByType(allIssues)

  // PS project is fully managed by PST team -- overall = pst
  return {
    overall: { bugs: computeBugMetrics(bugs), support: computeSupportMetrics(support), daily: computeDailyMetrics(bugs, support) },
    pst: { bugs: computeBugMetrics(bugs), support: computeSupportMetrics(support), daily: computeDailyMetrics(bugs, support) },
    charts: computeChartData(allIssues, bugs),
    lastUpdated: new Date().toISOString(),
  }
}
