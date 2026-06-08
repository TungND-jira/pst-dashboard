'use client'
import { useEffect, useState } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import type { FullDashboardData, BugMetrics, SupportMetrics, DailyMetrics, SubteamMonthly } from '@/app/lib/jira'
import styles from './ProjectDashboard.module.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler)

const COLORS = ['#a78bfa', '#4f8ef7', '#2dd4a0', '#f7c04f', '#f75f5f', '#fb923c', '#34d399', '#60a5fa', '#e879f9', '#38bdf8']
const SUBTEAM_COLORS = ['#a78bfa', '#4f8ef7', '#2dd4a0', '#f7c04f', '#f75f5f', '#fb923c', '#34d399', '#60a5fa']
const CHART_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7c84a0', font: { family: 'Be Vietnam Pro', size: 11 }, boxWidth: 10 } },
    tooltip: { backgroundColor: '#141720', borderColor: '#1f2437', borderWidth: 1, titleColor: '#e8eaf0', bodyColor: '#7c84a0', padding: 10 },
  },
  scales: {
    x: { ticks: { color: '#7c84a0', font: { family: 'Be Vietnam Pro', size: 10 } }, grid: { color: '#1f2437' } },
    y: { ticks: { color: '#7c84a0', font: { family: 'Be Vietnam Pro', size: 10 } }, grid: { color: '#1f2437' } },
  },
}

// --- Delta badge ---

function deltaBadge(current: number, prev: number): { pct: number | null; cls: string } {
  if (prev === 0) return { pct: null, cls: '' }
  const pct = Math.round((current - prev) / prev * 100)
  return { pct, cls: pct > 0 ? styles.deltaPos : pct < 0 ? styles.deltaNeg : styles.deltaFlat }
}

// --- Metric tile ---

function Tile({ label, value, sub, variant = 'default', href, weekCurrent, weekPrev }: {
  label: string
  value: string | number
  sub?: string
  variant?: 'bug' | 'support' | 'wip' | 'daily' | 'default'
  href?: string
  weekCurrent?: number
  weekPrev?: number
}) {
  const { pct, cls } = (weekCurrent !== undefined && weekPrev !== undefined)
    ? deltaBadge(weekCurrent, weekPrev)
    : { pct: null, cls: '' }

  const inner = (
    <div className={`${styles.tile} ${styles['tile_' + variant]}`}>
      <div className={styles.tileLabel}>{label}</div>
      <div className={styles.tileValue}>{value}</div>
      <div className={styles.tileFooter}>
        {sub && <span className={styles.tileSub}>{sub}</span>}
        {pct !== null && (
          <span className={`${styles.tileDelta} ${cls}`}>
            {pct > 0 ? '+' : ''}{pct}% vs last wk
          </span>
        )}
      </div>
    </div>
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={styles.tileLink}>
        {inner}
      </a>
    )
  }
  return inner
}

// --- Metric rows ---

function BugRow({ m, title }: { m: BugMetrics; title?: string }) {
  return (
    <>
      {title && <div className={styles.subTitle}>{title}</div>}
      <div className={styles.metricsRow}>
        <Tile label="TOTAL BUGS" value={m.total} variant="bug" href={m.jqlTotal}
          weekCurrent={m.weeklyCreated} weekPrev={m.prevWeekCreated} />
        <Tile label="RESOLVED" value={`${m.resolved} / ${m.resolvedPct}%`} variant="bug" href={m.jqlTotal}
          weekCurrent={m.weeklyResolved} weekPrev={m.prevWeekResolved} />
        <Tile label="SLA PASS RATE" value={`${m.slaPassRate}%`} variant="bug" />
        <Tile label="PENDING" value={`${m.pending} tks`} variant="bug" href={m.jqlPending} />
        <Tile label="PERSISTENT >14d" value={`${m.persistent} tks`} variant="bug" href={m.jqlPersistent} />
        <Tile label="CYCLE TIME" value={`${m.cycleTime}d`} variant="bug" />
      </div>
    </>
  )
}

function SupportRow({ m, title }: { m: SupportMetrics; title?: string }) {
  return (
    <>
      {title && <div className={styles.subTitle}>{title}</div>}
      <div className={styles.metricsRow}>
        <Tile label="TOTAL SUPPORT" value={m.total} variant="support" href={m.jqlTotal}
          weekCurrent={m.weeklyCreated} weekPrev={m.prevWeekCreated} />
        <Tile label="RESOLVED" value={`${m.resolved} / ${m.resolvedPct}%`} variant="support" href={m.jqlTotal}
          weekCurrent={m.weeklyResolved} weekPrev={m.prevWeekResolved} />
        <Tile label="THROUGHPUT" value={`${m.throughput} tks/wk`} variant="support" />
        <Tile label="PENDING" value={`${m.pending} tks`} variant="support" href={m.jqlPending} />
        <Tile label="TICKET/WEEK" value={`${m.ticketPerWeek} tks`} variant="support" />
        <Tile label="CYCLE TIME" value={`${m.cycleTime}d`} variant="support" />
      </div>
    </>
  )
}

function DailyRow({ m }: { m: DailyMetrics }) {
  const bugRatio = m.bugResolvedCreatedRatio !== null ? m.bugResolvedCreatedRatio.toFixed(2) : '--'
  const spRatio = m.spResolvedCreatedRatio !== null ? m.spResolvedCreatedRatio.toFixed(2) : '--'
  return (
    <div className={styles.metricsRow}>
      <Tile label="WIP BUG" value={`${m.wipBug} tks/person`} variant="wip" />
      <Tile label="WIP SUPPORT" value={`${m.wipSupport} tks/person`} variant="wip" />
      <Tile label="BUG NEW TODAY" value={`${m.bugNewInDay} tickets`} variant="daily" />
      <Tile label="BUG RESOLVED/CREATED" value={bugRatio} sub="today" variant="daily" />
      <Tile label="SP NEW TODAY" value={`${m.spNewInDay} tickets`} variant="daily" />
      <Tile label="SP RESOLVED/CREATED" value={spRatio} sub="today" variant="daily" />
    </div>
  )
}

// --- Subteam monthly table ---

function SubteamTable({ rows }: { rows: SubteamMonthly[] }) {
  const months = Array.from(new Set(rows.map(r => r.month))).sort()
  const teams = Array.from(new Set(rows.map(r => r.subteam))).sort()
  const latest = months[months.length - 1]
  const latestRows = rows.filter(r => r.month === latest)
    .sort((a, b) => b.total - a.total)

  return (
    <div className={styles.subteamTableWrap}>
      <div className={styles.chartTitle}>Subteam Summary (Latest Month: {latest})</div>
      <table className={styles.subteamTable}>
        <thead>
          <tr>
            <th>Subteam</th>
            <th>Total</th>
            <th>Bugs</th>
            <th>Support</th>
            <th>Resolved</th>
            <th>Resolve%</th>
            <th>SLA Pass</th>
          </tr>
        </thead>
        <tbody>
          {latestRows.map(r => (
            <tr key={r.subteam}>
              <td>{r.subteam}</td>
              <td>{r.total}</td>
              <td>{r.bugs}</td>
              <td>{r.support}</td>
              <td>{r.resolved}</td>
              <td>{r.total > 0 ? Math.round(r.resolved / r.total * 100) : 0}%</td>
              <td>{r.bugs > 0 ? Math.round(r.slaPass / r.bugs * 100) : '--'}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.tableNote}>Showing {latestRows.length} subteams | All months: {months.length}</div>
    </div>
  )
}

function SectionHeading({ title }: { title: string }) {
  return (
    <div className={styles.sectionHeading}>
      <span className={styles.sectionTitle}>{title}</span>
      <div className={styles.sectionLine} />
    </div>
  )
}

// --- Main component ---

export default function ProjectDashboard({ apiPath }: { apiPath: string; projectName: string }) {
  const [data, setData] = useState<FullDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  const fetchData = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(apiPath)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json); setLastFetch(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [apiPath])

  if (loading) return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
      <p>Loading data from Jira...</p>
    </div>
  )

  if (error) return (
    <div className={styles.errorState}>
      <div className={styles.errorIcon}>!</div>
      <p>{error}</p>
      <button onClick={fetchData} className={styles.retryBtn}>Retry</button>
    </div>
  )

  if (!data) return null

  const { overall, pst, charts } = data

  // --- Chart datasets ---

  const bugMonthData = {
    labels: charts.bugsByMonth.map(d => d.month.slice(5)),
    datasets: [{ label: 'Bug/month', data: charts.bugsByMonth.map(d => d.count), borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.12)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#a78bfa' }],
  }

  const bugWeekData = {
    labels: charts.bugsByWeek.slice(-12).map(d => d.week.slice(5)),
    datasets: [{ label: 'Bug/week', data: charts.bugsByWeek.slice(-12).map(d => d.count), borderColor: '#4f8ef7', backgroundColor: 'rgba(79,142,247,0.12)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#4f8ef7' }],
  }

  const causeEntries = Object.entries(charts.bugsByCause).sort(([, a], [, b]) => b - a).slice(0, 8)
  const causeData = {
    labels: causeEntries.map(([k]) => k),
    datasets: [{ data: causeEntries.map(([, v]) => v), backgroundColor: COLORS, borderWidth: 0 }],
  }

  const subteamData = {
    labels: charts.subteamPerformance.map(s => s.name.length > 12 ? s.name.slice(0, 11) + '...' : s.name),
    datasets: [
      { label: 'Bug', data: charts.subteamPerformance.map(s => s.bugs), backgroundColor: 'rgba(167,139,250,0.8)', borderRadius: 3 },
      { label: 'Support', data: charts.subteamPerformance.map(s => s.support), backgroundColor: 'rgba(45,212,160,0.8)', borderRadius: 3 },
      { label: 'Resolved', data: charts.subteamPerformance.map(s => s.resolved), backgroundColor: 'rgba(251,146,60,0.8)', borderRadius: 3 },
    ],
  }

  // Subteam monthly: grouped bars, one dataset per subteam, showing total per month
  const subteamNames = Array.from(new Set(charts.subteamMonthly.map(r => r.subteam))).sort()
  const subteamMonths = Array.from(new Set(charts.subteamMonthly.map(r => r.month))).sort().slice(-6)
  const subteamMonthlyData = {
    labels: subteamMonths.map(m => m.slice(5)),
    datasets: subteamNames.slice(0, 8).map((team, idx) => ({
      label: team.length > 14 ? team.slice(0, 13) + '...' : team,
      data: subteamMonths.map(month => {
        const row = charts.subteamMonthly.find(r => r.month === month && r.subteam === team)
        return row?.total ?? 0
      }),
      backgroundColor: SUBTEAM_COLORS[idx % SUBTEAM_COLORS.length] + 'cc',
      borderRadius: 2,
    })),
  }

  // RC month with ratio line
  const rcMonthData = {
    labels: charts.resolvedVsCreatedByMonth.map(d => d.month.slice(5)),
    datasets: [
      { label: 'Created', data: charts.resolvedVsCreatedByMonth.map(d => d.created), backgroundColor: 'rgba(167,139,250,0.7)', borderRadius: 3, type: 'bar' as const },
      { label: 'Resolved', data: charts.resolvedVsCreatedByMonth.map(d => d.resolved), backgroundColor: 'rgba(45,212,160,0.7)', borderRadius: 3, type: 'bar' as const },
      { label: 'R/C Ratio', data: charts.resolvedVsCreatedByMonth.map(d => d.ratio), borderColor: '#f7c04f', backgroundColor: 'transparent', type: 'line' as const, tension: 0.4, pointRadius: 4, yAxisID: 'y1' },
    ],
  }
  const rcMonthOpts = {
    ...CHART_BASE,
    scales: {
      ...CHART_BASE.scales,
      y1: { position: 'right' as const, ticks: { color: '#7c84a0', font: { family: 'Be Vietnam Pro', size: 10 } }, grid: { drawOnChartArea: false } },
    },
  }

  const rcWeekData = {
    labels: charts.resolvedVsCreatedByWeek.map(d => d.week.slice(5)),
    datasets: [
      { label: 'Created', data: charts.resolvedVsCreatedByWeek.map(d => d.created), borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
      { label: 'Resolved', data: charts.resolvedVsCreatedByWeek.map(d => d.resolved), borderColor: '#2dd4a0', backgroundColor: 'rgba(45,212,160,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
      { label: 'R/C Ratio', data: charts.resolvedVsCreatedByWeek.map(d => d.ratio), borderColor: '#f7c04f', backgroundColor: 'transparent', tension: 0.4, pointRadius: 3, borderDash: [4, 3], yAxisID: 'y1' },
    ],
  }
  const rcWeekOpts = {
    ...CHART_BASE,
    scales: {
      ...CHART_BASE.scales,
      y1: { position: 'right' as const, ticks: { color: '#7c84a0', font: { family: 'Be Vietnam Pro', size: 10 } }, grid: { drawOnChartArea: false } },
    },
  }

  const pvpData = {
    labels: charts.persistentVsPending.map(d => d.label.slice(5)),
    datasets: [
      { label: 'Pending', data: charts.persistentVsPending.map(d => d.pending), backgroundColor: 'rgba(79,142,247,0.7)', borderRadius: 3 },
      { label: 'Persistent >14d', data: charts.persistentVsPending.map(d => d.persistent), backgroundColor: 'rgba(247,96,95,0.7)', borderRadius: 3 },
    ],
  }

  // WIP per assignee (horizontal bar)
  const wipData = {
    labels: charts.wipPerAssignee.map(w => w.assignee.length > 14 ? w.assignee.slice(0, 13) + '...' : w.assignee),
    datasets: [
      { label: 'Bug', data: charts.wipPerAssignee.map(w => w.bugs), backgroundColor: 'rgba(167,139,250,0.8)', borderRadius: 3 },
      { label: 'Support', data: charts.wipPerAssignee.map(w => w.support), backgroundColor: 'rgba(45,212,160,0.8)', borderRadius: 3 },
    ],
  }
  const wipOpts = {
    ...CHART_BASE,
    indexAxis: 'y' as const,
    scales: {
      x: { ...CHART_BASE.scales.x, stacked: true },
      y: { ...CHART_BASE.scales.y, stacked: true },
    },
  }

  // Cycle time dual-line
  const ctWeekData = {
    labels: charts.cycleTimeByWeek.map(d => d.period.slice(5)),
    datasets: [
      { label: 'Bug CT (days)', data: charts.cycleTimeByWeek.map(d => d.bugCycleTime), borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
      { label: 'Support CT (days)', data: charts.cycleTimeByWeek.map(d => d.supportCycleTime), borderColor: '#2dd4a0', backgroundColor: 'rgba(45,212,160,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
    ],
  }
  const ctMonthData = {
    labels: charts.cycleTimeByMonth.map(d => d.period.slice(5)),
    datasets: [
      { label: 'Bug CT (days)', data: charts.cycleTimeByMonth.map(d => d.bugCycleTime), borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.12)', fill: true, tension: 0.4, pointRadius: 4 },
      { label: 'Support CT (days)', data: charts.cycleTimeByMonth.map(d => d.supportCycleTime), borderColor: '#2dd4a0', backgroundColor: 'rgba(45,212,160,0.12)', fill: true, tension: 0.4, pointRadius: 4 },
    ],
  }

  const doughnutOpts = {
    ...CHART_BASE, scales: undefined,
    plugins: { ...CHART_BASE.plugins, legend: { ...CHART_BASE.plugins.legend, position: 'bottom' as const } },
  }

  return (
    <div className={styles.dashboard}>
      {/* Topbar */}
      <div className={styles.topbar}>
        <div className={styles.meta}>
          {lastFetch && <span>Updated: {lastFetch.toLocaleTimeString()}</span>}
          <span className={styles.dot} />
          <span>Cache 5min</span>
        </div>
        <button onClick={fetchData} className={styles.refreshBtn}>Refresh</button>
      </div>

      {/* OVERALL */}
      <SectionHeading title="OVERALL" />
      <BugRow m={overall.bugs} title="Production Bugs" />
      <SupportRow m={overall.support} title="Support Tickets" />

      {/* PST */}
      <SectionHeading title="PST SUBTEAM" />
      <BugRow m={pst.bugs} title="Production Bugs" />
      <SupportRow m={pst.support} title="Support Tickets" />
      <DailyRow m={pst.daily} />

      {/* BUG CROSS SECTION */}
      <SectionHeading title="BUG ANALYSIS" />

      <div className={styles.chartRow}>
        <div className={`${styles.chartCard} ${styles.chartFull}`}>
          <div className={styles.chartTitle}>Subteam Performance (All time)</div>
          <div className={styles.chartWrap} style={{ height: 220 }}>
            <Bar data={subteamData} options={CHART_BASE as never} />
          </div>
        </div>
      </div>

      <div className={styles.chartRow}>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>Bug trend by month</div>
          <div className={styles.chartWrap}>
            <Line data={bugMonthData} options={CHART_BASE as never} />
          </div>
        </div>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>Bug trend by week (last 12w)</div>
          <div className={styles.chartWrap}>
            <Line data={bugWeekData} options={CHART_BASE as never} />
          </div>
        </div>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>Bug cause distribution</div>
          <div className={styles.chartWrap}>
            <Doughnut data={causeData} options={doughnutOpts as never} />
          </div>
        </div>
      </div>

      {/* SUBTEAM MONTHLY */}
      <SectionHeading title="SUBTEAM MONTHLY BREAKDOWN" />
      <div className={styles.chartRow}>
        <div className={`${styles.chartCard} ${styles.chartFull}`}>
          <div className={styles.chartTitle}>Tickets per subteam by month (last 6 months)</div>
          <div className={styles.chartWrap} style={{ height: 240 }}>
            <Bar data={subteamMonthlyData} options={CHART_BASE as never} />
          </div>
        </div>
      </div>
      {charts.subteamMonthly.length > 0 && <SubteamTable rows={charts.subteamMonthly} />}

      {/* RESOLVED vs CREATED */}
      <SectionHeading title="RESOLVED vs CREATED" />
      <div className={styles.chartRow}>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>Resolved / Created (Month) + R/C ratio line</div>
          <div className={styles.chartWrap}>
            <Bar data={rcMonthData as never} options={rcMonthOpts as never} />
          </div>
        </div>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>Resolved / Created (Week) + R/C ratio line</div>
          <div className={styles.chartWrap}>
            <Line data={rcWeekData as never} options={rcWeekOpts as never} />
          </div>
        </div>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>Persistent and Pending Bugs</div>
          <div className={styles.chartWrap}>
            <Bar data={pvpData} options={CHART_BASE as never} />
          </div>
        </div>
      </div>

      {/* WIP + CYCLE TIME */}
      <SectionHeading title="WIP AND CYCLE TIME" />
      <div className={styles.chartRow}>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>WIP per assignee (open tickets)</div>
          <div className={styles.chartWrap} style={{ height: 280 }}>
            <Bar data={wipData} options={wipOpts as never} />
          </div>
        </div>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>Cycle time by week (avg days)</div>
          <div className={styles.chartWrap}>
            <Line data={ctWeekData} options={CHART_BASE as never} />
          </div>
        </div>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>Cycle time by month (avg days)</div>
          <div className={styles.chartWrap}>
            <Line data={ctMonthData} options={CHART_BASE as never} />
          </div>
        </div>
  