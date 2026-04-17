// src/app/lib/jira.ts
// Tất cả logic gọi Jira API — chạy server-side, token không bao giờ ra browser

const JIRA_BASE_URL = process.env.JIRA_BASE_URL!
const JIRA_EMAIL = process.env.JIRA_EMAIL!
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN!
const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS || '300') * 1000

// In-memory cache
const cache = new Map<string, { data: unknown; expires: number }>()

function getAuthHeader() {
  const credentials = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')
  return `Basic ${credentials}`
}

async function fetchJiraJQL(jql: string, fields: string[]): Promise<JiraIssue[]> {
  const cacheKey = `${jql}|${fields.join(',')}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    return cached.data as JiraIssue[]
  }

  const allIssues: JiraIssue[] = []
  let nextPageToken: string | undefined = undefined

  // Jira Cloud dùng nextPageToken để phân trang
  while (true) {
    const params: Record<string, string> = {
      jql,
      maxResults: '100',
      fields: fields.join(','),
    }
    if (nextPageToken) params.nextPageToken = nextPageToken

    const url = `${JIRA_BASE_URL}/rest/api/3/search/jql?${new URLSearchParams(params).toString()}`
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': getAuthHeader(), 'Accept': 'application/json' },
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Jira API error ${res.status}: ${err}`)
    }

    const data = await res.json()
    allIssues.push(...(data.issues || []))

    if (data.isLast || !data.nextPageToken || data.issues?.length === 0) break
    nextPageToken = data.nextPageToken
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
    status: { name: string; statusCategory: { key: string } }
    priority: { name: string }
    created: string
    resolutiondate: string | null
    assignee: { displayName: string } | null
    // Custom fields FNB
    customfield_11553?: { value: string } | null  // Module FnB 2.0
    customfield_11554?: { value: string } | null  // Bug Cause FnB
    customfield_11555?: string | null             // Cause Detail
    customfield_14897?: { value: string } | null  // Area
    customfield_10316?: string | null             // InProgress start timestamp
  }
}

export interface DashboardData {
  totalBugs: number
  resolvedBugs: number
  openBugs: number
  slaBreachRate: number
  slaDoneRate: number
  avgCycleTime: number
  bugsPerWeek: number
  bugsByStatus: Record<string, number>
  bugsByPriority: Record<string, number>
  bugsByModule: Record<string, number>
  bugsByCause: Record<string, number>
  bugsByWeek: { week: string; count: number }[]
  cycleTimeByPriority: Record<string, number>
  unresolvableRate: number
  topAssignees: { name: string; count: number }[]
  lastUpdated: string
}

// ─── SLA windows (ngày) ──────────────────────────────────────────────────────

const SLA_DAYS: Record<string, number> = {
  Highest: 2,
  High: 7,
  Medium: 12,
  Low: 15,
}

function isSlaBreach(issue: JiraIssue): boolean {
  const slaLimit = SLA_DAYS[issue.fields.priority?.name] ?? 12
  const created = new Date(issue.fields.created)
  const slaDueDate = new Date(created.getTime() + slaLimit * 86400000)

  const isDone = issue.fields.status?.name === 'Done'
  if (isDone && issue.fields.resolutiondate) {
    const resolved = new Date(issue.fields.resolutiondate)
    return resolved > slaDueDate
  }
  // Chưa done → so sánh với hôm nay
  return new Date() > slaDueDate
}

function getCycleTimeDays(issue: JiraIssue): number | null {
  if (issue.fields.status?.name !== 'Done' || !issue.fields.resolutiondate) return null
  const created = new Date(issue.fields.created)
  const resolved = new Date(issue.fields.resolutiondate)
  return (resolved.getTime() - created.getTime()) / 86400000
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr)
  // Monday of the week
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return monday.toISOString().slice(0, 10)
}

// ─── Main transform ───────────────────────────────────────────────────────────

export function transformIssues(issues: JiraIssue[]): DashboardData {
  const EXCLUDED_STATUSES = ['Cancelled', 'Invalid', "Won't Fix"]
  const doneIssues = issues.filter(i =>
    i.fields.status?.name === 'Done' && !EXCLUDED_STATUSES.includes(i.fields.status?.name)
  )
  const unresolvable = issues.filter(i => EXCLUDED_STATUSES.includes(i.fields.status?.name))
  const openIssues = issues.filter(i =>
    i.fields.status?.statusCategory?.key !== 'done'
  )

  // SLA
  const slaBreaches = issues.filter(isSlaBreach).length
  const doneWithSla = doneIssues.filter(i => !isSlaBreach(i)).length

  // Cycle time
  const cycleTimes = doneIssues.map(getCycleTimeDays).filter((v): v is number => v !== null)
  const avgCycleTime = cycleTimes.length ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length : 0

  // Bugs per week
  const firstDate = issues.length ? new Date(issues[issues.length - 1].fields.created) : new Date()
  const weeks = Math.max(1, Math.ceil((Date.now() - firstDate.getTime()) / (7 * 86400000)))
  const bugsPerWeek = doneIssues.length / weeks

  // By status
  const bugsByStatus: Record<string, number> = {}
  issues.forEach(i => {
    const s = i.fields.status?.name || 'Unknown'
    bugsByStatus[s] = (bugsByStatus[s] || 0) + 1
  })

  // By priority
  const bugsByPriority: Record<string, number> = {}
  issues.forEach(i => {
    const p = i.fields.priority?.name || 'Unknown'
    bugsByPriority[p] = (bugsByPriority[p] || 0) + 1
  })

  // By module (FNB custom field)
  const bugsByModule: Record<string, number> = {}
  issues.forEach(i => {
    const m = i.fields.customfield_11553?.value || 'Không xác định'
    bugsByModule[m] = (bugsByModule[m] || 0) + 1
  })

  // By cause
  const bugsByCause: Record<string, number> = {}
  issues.forEach(i => {
    const c = i.fields.customfield_11554?.value || 'Chưa phân loại'
    bugsByCause[c] = (bugsByCause[c] || 0) + 1
  })

  // By week trend
  const weekMap: Record<string, number> = {}
  issues.forEach(i => {
    const w = getWeekKey(i.fields.created)
    weekMap[w] = (weekMap[w] || 0) + 1
  })
  const bugsByWeek = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({ week, count }))

  // Cycle time by priority
  const cycleByPriority: Record<string, number[]> = {}
  doneIssues.forEach(i => {
    const ct = getCycleTimeDays(i)
    if (ct === null) return
    const p = i.fields.priority?.name || 'Unknown'
    if (!cycleByPriority[p]) cycleByPriority[p] = []
    cycleByPriority[p].push(ct)
  })
  const cycleTimeByPriority: Record<string, number> = {}
  Object.entries(cycleByPriority).forEach(([p, times]) => {
    cycleTimeByPriority[p] = times.reduce((a, b) => a + b, 0) / times.length
  })

  // Top assignees (open bugs)
  const assigneeMap: Record<string, number> = {}
  openIssues.forEach(i => {
    const name = i.fields.assignee?.displayName || 'Unassigned'
    assigneeMap[name] = (assigneeMap[name] || 0) + 1
  })
  const topAssignees = Object.entries(assigneeMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }))

  return {
    totalBugs: issues.length,
    resolvedBugs: doneIssues.length,
    openBugs: openIssues.length,
    slaBreachRate: issues.length ? (slaBreaches / issues.length) * 100 : 0,
    slaDoneRate: doneIssues.length ? (doneWithSla / doneIssues.length) * 100 : 0,
    avgCycleTime: Math.round(avgCycleTime * 10) / 10,
    bugsPerWeek: Math.round(bugsPerWeek * 10) / 10,
    bugsByStatus,
    bugsByPriority,
    bugsByModule,
    bugsByCause,
    bugsByWeek,
    cycleTimeByPriority,
    unresolvableRate: issues.length ? (unresolvable.length / issues.length) * 100 : 0,
    topAssignees,
    lastUpdated: new Date().toISOString(),
  }
}

// ─── Public fetch functions ───────────────────────────────────────────────────

const COMMON_FIELDS = [
  'status', 'priority', 'created', 'resolutiondate', 'assignee',
  'customfield_11553', 'customfield_11554',
]

const YEAR = new Date().getFullYear()

export async function getFnbPstData(): Promise<DashboardData> {
  const jql = `created >= "${YEAR}-01-01" AND project = FNB AND created <= "${YEAR}-12-31" AND "subteam_fnb[dropdown]" = PST AND type = "Production Bug" ORDER BY created DESC`
  const issues = await fetchJiraJQL(jql, COMMON_FIELDS)
  return transformIssues(issues)
}

export async function getPsData(): Promise<DashboardData> {
  const jql = `created >= "${YEAR}-01-01" AND project = PS AND created <= "${YEAR}-12-31" AND status NOT IN (Warning, Invalid, Cancelled) AND type IN ("RW_Production Bug", "Production Bug") ORDER BY created DESC`
  const issues = await fetchJiraJQL(jql, COMMON_FIELDS)
  return transformIssues(issues)
}
