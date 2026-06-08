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

function jiraUrl(jql: string): string {
  return `${JIRA_BASE_URL}/issues/?jql=${encodeURIComponent(jql)}`
}

async function fetchJiraJQL(jql: string, fields: string[]): Promise<JiraIssue[]> {
  const cacheKey = `${jql}|${fields.join(',')}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.data as JiraIssue[]

  const allIssues: JiraIssue[] = []
  let nextPageToken: string | undefined = undefined
  const maxResults = 100

  while (true) {
    const body: Record<string, unknown> = { jql, fields, maxResults }
    if (nextPageToken) body.nextPageToken = nextPageToken

    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Jira API ${res.status}: ${await res.text()}`)
    const data = await res.json()
    allIssues.push(...(data.issues ?? []))
    if (!data.nextPageToken || data.issues.length === 0) break
    nextPageToken = data.nextPageToken
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
    customfield_14897?: { value: string } | null  // Area (Retail)
    customfield_17194?: { value: string } | null  // Subteam_FnB
    customfield_10316?: string | null             // InProgress start
  }
}

export interface BugMetrics {
  total: number
  resolved: number
  resolvedPct: number
  slaPassRate: number
  pending: number
  persistent: number
  cycleTime: number
  // Week-over-week
  weeklyCreated: number
  prevWeekCreated: number
  weeklyResolved: number
  prevWeekResolved: number
  // JQL deep-links
  jqlTotal: string
  jqlPending: string
  jqlPersistent: string
}

export interface SupportMetrics {
  total: number
  resolved: number
  resolvedPct: number
  throughput: number
  pending: number
  ticketPerWeek: number
  cycleTime: number
  // Week-over-week
  weeklyCreated: number
  prevWeekCreated: number
  weeklyResolved: number
  prevWeekResolved: number
  // JQL deep-links
  jqlTotal: string
  jqlPending: string
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

export interface SubteamMonthly {
  month: string
  subteam: string
  bugs: number
  support: number
  resolved: number
  resolvedBugs: number
  total: number
  slaPass: number
}

export interface WipEntry {
  assignee: string
  bugs: number
  support: number
  total: number
}

export interface CycleTimePoint {
  period: string
  bugCycleTime: number
  supportCycleTime: number
}

export interface ChartData {
  bugsByWeek: { week: string; count: number }[]
  bugsByMonth: { month: string; count: number }[]
  bugsByCause: Record<string, number>
  subteamPerformance: SubteamStat[]
  resolvedVsCreatedByMonth: { month: string; resolved: number; created: number; ratio: number }[]
  resolvedVsCreatedByWeek: { week: string; resolved: number; created: number; ratio: number }[]
  persistentVsPending: { label: string; persistent: number; pending: number }[]
  subteamMonthly: SubteamMonthly[]
  wipPerAssignee: WipEntry[]
  cycleTimeByWeek: CycleTimePoint[]
  cycleTimeByMonth: CycleTimePoint[]
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

function getCurrentWeekKey(): string {
  return getWeekKey(new Date().toISOString())
}

function getPrevWeekKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return getWeekKey(d.toISOString())
}

function avg(arr: number[]): number {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0
}

// --- Issue type classification ---

const BUG_TYPES = new Set(['Production Bug', 'RW_Production Bug', 'Bug'])
const BUG_TYPE_JQL = `issuetype IN ("Production Bug","RW_Production Bug","Bug")`
const SUPPORT_TYPE_JQL = `issuetype NOT IN ("Production Bug","RW_Production Bug","Bug")`

function splitByType(issues: JiraIssue[]) {
  const bugs = issues.filter(i => BUG_TYPES.has(i.fields.issuetype?.name))
  const support = issues.filter(i => !BUG_TYPES.has(i.fields.issuetype?.name))
  return { bugs, support }
}

// --- Metric computations ---

function computeBugMetrics(bugs: JiraIssue[], contextJql: string): BugMetrics {
  if (!bugs.length) {
    const baseJql = `${contextJql} AND ${BUG_TYPE_JQL}`
    return {
      total: 0, resolved: 0, resolvedPct: 0, slaPassRate: 0, pending: 0, persistent: 0, cycleTime: 0,
      weeklyCreated: 0, prevWeekCreated: 0, weeklyResolved: 0, prevWeekResolved: 0,
      jqlTotal: jiraUrl(baseJql),
      jqlPending: jiraUrl(`${baseJql} AND statusCategory != Done`),
      jqlPersistent: jiraUrl(`${baseJql} AND statusCategory != Done AND created <= "-14d"`),
    }
  }

  const baseJql = `${contextJql} AND ${BUG_TYPE_JQL}`
  const currentWeek = getCurrentWeekKey()
  const prevWeek = getPrevWeekKey()

  const resolved = bugs.filter(i => i.fields.status?.statusCategory?.key === 'done')
  const open = bugs.filter(i => i.fields.status?.statusCategory?.key !== 'done')
  const persistent = open.filter(i => Date.now() - new Date(i.fields.created).getTime() > 14 * 86400000)
  const slaPass = resolved.filter(i => !isSlaBreach(i)).length

  const cts = resolved.map(getCycleTimeDays).filter((v): v is number => v !== null)
  const avgCt = avg(cts)

  const weeklyCreated = bugs.filter(i => getWeekKey(i.fields.created) === currentWeek).length
  const prevWeekCreated = bugs.filter(i => getWeekKey(i.fields.created) === prevWeek).length
  const weeklyResolved = resolved.filter(i => i.fields.resolutiondate && getWeekKey(i.fields.resolutiondate) === currentWeek).length
  const prevWeekResolved = resolved.filter(i => i.fields.resolutiondate && getWeekKey(i.fields.resolutiondate) === prevWeek).length

  return {
    total: bugs.length,
    resolved: resolved.length,
    resolvedPct: Math.round(resolved.length / bugs.length * 100),
    slaPassRate: resolved.length ? Math.round(slaPass / resolved.length * 100) : 0,
    pending: open.length,
    persistent: persistent.length,
    cycleTime: avgCt,
    weeklyCreated,
    prevWeekCreated,
    weeklyResolved,
    prevWeekResolved,
    jqlTotal: jiraUrl(baseJql),
    jqlPending: jiraUrl(`${baseJql} AND statusCategory != Done`),
    jqlPersistent: jiraUrl(`${baseJql} AND statusCategory != Done AND created <= "-14d"`),
  }
}

function computeSupportMetrics(support: JiraIssue[], contextJql: string): SupportMetrics {
  if (!support.length) {
    const baseJql = `${contextJql} AND ${SUPPORT_TYPE_JQL}`
    return {
      total: 0, resolved: 0, resolvedPct: 0, throughput: 0, pending: 0, ticketPerWeek: 0, cycleTime: 0,
      weeklyCreated: 0, prevWeekCreated: 0, weeklyResolved: 0, prevWeekResolved: 0,
      jqlTotal: jiraUrl(baseJql),
      jqlPending: jiraUrl(`${baseJql} AND statusCategory != Done`),
    }
  }

  const baseJql = `${contextJql} AND ${SUPPORT_TYPE_JQL}`
  const currentWeek = getCurrentWeekKey()
  const prevWeek = getPrevWeekKey()

  const resolved = support.filter(i => i.fields.status?.statusCategory?.key === 'done')
  const open = support.filter(i => i.fields.status?.statusCategory?.key !== 'done')

  const sorted = [...support].sort((a, b) => new Date(a.fields.created).getTime() - new Date(b.fields.created).getTime())
  const weeks = Math.max(1, (Date.now() - new Date(sorted[0].fields.created).getTime()) / (7 * 86400000))

  const cts = resolved.map(getCycleTimeDays).filter((v): v is number => v !== null)
  const avgCt = avg(cts)

  const weeklyCreated = support.filter(i => getWeekKey(i.fields.created) === currentWeek).length
  const prevWeekCreated = support.filter(i => getWeekKey(i.fields.created) === prevWeek).length
  const weeklyResolved = resolved.filter(i => i.fields.resolutiondate && getWeekKey(i.fields.resolutiondate) === currentWeek).length
  const prevWeekResolved = resolved.filter(i => i.fields.resolutiondate && getWeekKey(i.fields.resolutiondate) === prevWeek).length

  return {
    total: support.length,
    resolved: resolved.length,
    resolvedPct: Math.round(resolved.length / support.length * 100),
    throughput: Math.round(resolved.length / weeks * 10) / 10,
    pending: open.length,
    ticketPerWeek: Math.round(support.length / weeks * 10) / 10,
    cycleTime: avgCt,
    weeklyCreated,
    prevWeekCreated,
    weeklyResolved,
    prevWeekResolved,
    jqlTotal: jiraUrl(baseJql),
    jqlPending: jiraUrl(`${baseJql} AND statusCategory != Done`),
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

function computeChartData(allIssues: JiraIssue[], bugs: JiraIssue[], getSubteam: (i: JiraIssue) => string): ChartData {
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

  // Subteam performance (summary)
  const subteamMap: Record<string, SubteamStat> = {}
  allIssues.forEach(i => {
    const team = getSubteam(i)
    if (!subteamMap[team]) subteamMap[team] = { name: team, bugs: 0, support: 0, resolved: 0 }
    if (BUG_TYPES.has(i.fields.issuetype?.name)) subteamMap[team].bugs++
    else subteamMap[team].support++
    if (i.fields.status?.statusCategory?.key === 'done') subteamMap[team].resolved++
  })
  const subteamPerformance = Object.values(subteamMap)
    .sort((a, b) => (b.bugs + b.support) - (a.bugs + a.support))
    .slice(0, 8)

  // Resolved vs created by month (with ratio)
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
    .map(([month, v]) => ({
      month, ...v,
      ratio: v.created > 0 ? Math.round(v.resolved / v.created * 100) / 100 : 0,
    }))

  // Resolved vs created by week (last 12, with ratio)
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
    .map(([week, v]) => ({
      week, ...v,
      ratio: v.created > 0 ? Math.round(v.resolved / v.created * 100) / 100 : 0,
    }))

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

  // Subteam monthly breakdown
  const smMap: Record<string, SubteamMonthly> = {}
  allIssues.forEach(i => {
    const team = getSubteam(i)
    const month = getMonthKey(i.fields.created)
    const key = `${month}|${team}`
    if (!smMap[key]) smMap[key] = { month, subteam: team, bugs: 0, support: 0, resolved: 0, resolvedBugs: 0, total: 0, slaPass: 0 }
    const e = smMap[key]
    e.total++
    if (BUG_TYPES.has(i.fields.issuetype?.name)) {
      e.bugs++
      if (i.fields.status?.statusCategory?.key === 'done') {
        e.resolvedBugs++
        if (!isSlaBreach(i)) e.slaPass++
      }
    } else {
      e.support++
    }
    if (i.fields.status?.statusCategory?.key === 'done') e.resolved++
  })
  const subteamMonthly = Object.values(smMap).sort((a, b) =>
    a.month.localeCompare(b.month) || a.subteam.localeCompare(b.subteam)
  )

  // WIP per assignee (open tickets only)
  const wipMap: Record<string, WipEntry> = {}
  allIssues
    .filter(i => i.fields.status?.statusCategory?.key !== 'done')
    .forEach(i => {
      const name = i.fields.assignee?.displayName || 'Unassigned'
      if (!wipMap[name]) wipMap[name] = { assignee: name, bugs: 0, support: 0, total: 0 }
      wipMap[name].total++
      if (BUG_TYPES.has(i.fields.issuetype?.name)) wipMap[name].bugs++
      else wipMap[name].support++
    })
  const wipPerAssignee = Object.values(wipMap).sort((a, b) => b.total - a.total).slice(0, 12)

  // Cycle time by week and by month
  const ctWeekMap: Record<string, { bugTimes: number[]; supportTimes: number[] }> = {}
  const ctMonthMap: Record<string, { bugTimes: number[]; supportTimes: number[] }> = {}
  allIssues.forEach(i => {
    const ct = getCycleTimeDays(i)
    if (ct === null || !i.fields.resolutiondate) return
    const week = getWeekKey(i.fields.resolutiondate)
    const month = getMonthKey(i.fields.resolutiondate)
    if (!ctWeekMap[week]) ctWeekMap[week] = { bugTimes: [], supportTimes: [] }
    if (!ctMonthMap[month]) ctMonthMap[month] = { bugTimes: [], supportTimes: [] }
    if (BUG_TYPES.has(i.fields.issuetype?.name)) {
      ctWeekMap[week].bugTimes.push(ct)
      ctMonthMap[month].bugTimes.push(ct)
    } else {
      ctWeekMap[week].supportTimes.push(ct)
      ctMonthMap[month].supportTimes.push(ct)
    }
  })
  const cycleTimeByWeek = Object.entries(ctWeekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([period, v]) => ({ period, bugCycleTime: avg(v.bugTimes), supportCycleTime: avg(v.supportTimes) }))

  const cycleTimeByMonth = Object.entries(ctMonthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({ period, bugCycleTime: avg(v.bugTimes), supportCycleTime: avg(v.supportTimes) }))

  return {
    bugsByWeek, bugsByMonth, bugsByCause, subteamPerformance,
    resolvedVsCreatedByMonth, resolvedVsCreatedByWeek, persistentVsPending,
    subteamMonthly, wipPerAssignee, cycleTimeByWeek, cycleTimeByMonth,
  }
}

// --- Public fetch functions ---

const COMMON_FIELDS = [
  'summary', 'status', 'priority', 'created', 'resolutiondate', 'assignee', 'issuetype',
  'customfield_11553', 'customfield_11554', 'customfield_14897', 'customfield_17194', 'customfield_10316',
]

export async function getFnbFullData(): Promise<FullDashboardData> {
  const overallJql = `project = FNB AND labels = "from-crm"`
  const pstJql = `project = FNB AND labels = "from-crm" AND "subteam_fnb[dropdown]" = PST`

  const [overallIssues, pstIssues] = await Promise.all([
    fetchJiraJQL(`${overallJql} ORDER BY created DESC`, COMMON_FIELDS),
    fetchJiraJQL(`${pstJql} ORDER BY created DESC`, COMMON_FIELDS),
  ])

  const { bugs: oBugs, support: oSp } = splitByType(overallIssues)
  const { bugs: pBugs, support: pSp } = splitByType(pstIssues)

  return {
    overall: {
      bugs: computeBugMetrics(oBugs, overallJql),
      support: computeSupportMetrics(oSp, overallJql),
      daily: computeDailyMetrics(oBugs, oSp),
    },
    pst: {
      bugs: computeBugMetrics(pBugs, pstJql),
      support: computeSupportMetrics(pSp, pstJql),
      daily: computeDailyMetrics(pBugs, pSp),
    },
    charts: computeChartData(overallIssues, oBugs,
      (i) => i.fields.customfield_17194?.value || i.fields.assignee?.displayName || 'Other'
    ),
    lastUpdated: new Date().toISOString(),
  }
}

export async function getRetailFullData(): Promise<FullDashboardData> {
  const year = new Date().getFullYear()
  const overallJql = `created >= "${year}-01-01" AND project = PS AND type IN ("Production Bug","RW_Production Bug",RW_Task,Task)`
  const pstJql = `${overallJql} AND "subteam_retail[dropdown]" = PST`

  const [overallIssues, pstIssues] = await Promise.all([
    fetchJiraJQL(`${overallJql} ORDER BY created DESC`, COMMON_FIELDS),
    fetchJiraJQL(`${pstJql} ORDER BY created DESC`, COMMON_FIELDS),
  ])

  const { bugs: oBugs, support: oSp } = splitByType(overallIssues)
  const { bugs: pBugs, support: pSp } = splitByType(pstIssues)

  return {
    overall: {
      bugs: computeBugMetrics(oBugs, overallJql),
      support: computeSupportMetrics(oSp, overallJql),
      daily: computeDailyMetrics(oBugs, oSp),
    },
    pst: {
      bugs: computeBugMetrics(pBugs, pstJql),
      support: computeSupportMetrics(pSp, pstJql),
      daily: computeDailyMetrics(pBugs, pSp),
    },
    charts: computeChartData(overallIssues, oBugs,
      (i) => i.fields.customfield_14897?.value || i.fields.assignee?.displayName || 'Other'
    ),
    lastUpdated: new Date().toISOString(),
  }
}
