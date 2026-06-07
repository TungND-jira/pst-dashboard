// src/app/lib/jira.ts
// Server-side only — credentials never reach the browser

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

// ─── Types ───────────────────────────────────────────────────────────────────

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
  cycleTime: number    // avg days created → resolved
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
  wipBug: number       // open bugs / distinct assignees
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

// ─── SLA helpers ─────────────────────────────────────────────────────────────

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

// ─── Issue type classification ────────────────────────────────────────────────

const BUG_TYPES = new Set(['Production Bug', 'RW_Production Bug', 'Bug'])
const SUPPORT_TYPES = new Set(['RW_Task', 'Task', 'Support', 'Support Request'])

function splitByType(issues: JiraIssue[]) {
  const bugs = issues.filter(i => BUG_TYPES.has(i.fields.issuetype?.name))
  const support = issues.filter(i => !BUG_TYPES.has(i.fields.issuetype?.name))
  return { bugs, support }
}

// ─── Metric computations ──────────────────────────────────────────────────────

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
  bugs.forEach(i => { const w = getWeekKey(i.fields.created); weekMap[w] = (weekMap[w]