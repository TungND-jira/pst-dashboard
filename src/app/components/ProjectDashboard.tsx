'use client'
import { useEffect, useState } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import type { FullDashboardData, BugMetrics, SupportMetrics, DailyMetrics } from '@/app/lib/jira'
import styles from './ProjectDashboard.module.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler)

const COLORS = ['#a78bfa', '#4f8ef7', '#2dd4a0', '#f7c04f', '#f75f5f', '#fb923c', '#34d399', '#60a5fa']
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

// ─── Metric tile ─────────────────────────────────────────────────────────────

function Tile({ label, value, sub, variant = 'default' }: {
  label: string; value: string | number; sub?: string
  variant?: 'bug' | 'support' | 'wip' | 'daily' | 'default'
}) {
  return (
    <div className={`${styles.tile} ${styles['tile_' + variant]}`}>
      <div className={styles.tileLabel}>{label}</div>
      <div className={styles.tileValue}>{value}</div>
      {sub && <div className={styles.tileSub}>{sub}</div>}
    </div>
  )
}

function BugRow({ m }: { m: BugMetrics }) {
  return (
    <div className={styles.metricsRow}>
      <Tile label="TỔNG BUG" value={m.total} variant="bug" />
      <Tile label="RESOLVED" value={`${m.resolved}/${m.resolvedPct}%`} variant="bug" />
      <Tile label="SLA PASS RATE" value={`${m.slaPassRate}%`} sub="JQL" variant="bug" />
      <Tile label="PENDING" value={`${m.pending} tks`} sub="10%" variant="bug" />
      <Tile label="PERSISTENT (>14d)" value={`${m.persistent} tks`} sub="JQL" variant="bug" />
      <Tile label="CYCLE TIME" value={`${m.cycleTime}d`} sub="Ratio" variant="bug" />
    </div>
  )
}

function SupportRow({ m }: { m: SupportMetrics }) {
  return (
    <div className={styles.metricsRow}>
      <Tile label="TỔNG SUPPORT" value={m.total} variant="support" />
      <Tile label="RESOLVED" value={`${m.resolved}/${m.resolvedPct}%`} variant="support" />
      <Tile label="THROUGHPUT" value={`${m.throughput} tks/week`} sub="ratio" variant="support" />
      <Tile label="PENDING" value={`${m.pending} tks`} sub="10%" variant="support" />
      <Tile label="TICKET/WEEK" value={`${m.ticketPerWeek} tks`} sub="ratio" variant="support" />
      <Tile label="CYCLE TIME" value={`${m.cycleTime}d`} sub="tăng/giảm" variant="support" />
    </div>
  )
}

function DailyRow({ m }: { m: DailyMetrics }) {
  const bugRatio = m.bugResolvedCreatedRatio !== null ? m.bugResolvedCreatedRatio.toFixed(2) : '—'
  const spRatio = m.spResolvedCreatedRatio !== null ? m.spResolvedCreatedRatio.toFixed(2) : '—'
  return (
    <div className={styles.metricsRow}>
      <Tile label="WIP BUG" value={`${m.wipBug} tks/per`} variant="wip" />
      <Tile label="WIP SUPPORT" value={`${m.wipSupport} tks/per`} variant="wip" />
      <Tile label="BUG NEW IN DAY" value={`${m.bugNewInDay} tickets`} variant="daily" />
      <Tile label="RESOLVED/CREATED IN DAY" value={bugRatio} sub="bug" variant="daily" />
      <Tile label="SP NEW IN DAY" value={`${m.spNewInDay} tickets`} variant="daily" />
      <Tile label="RESOLVED/CREATED IN DAY" value={spRatio} sub="support" variant="daily" />
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

// ─── Main component ───────────────────────────────────────────────────────────

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
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [apiPath])

  if (loading) return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
      <p>Đang tải dữ liệu từ Jira...</p>
    </div>
  )

  if (error) return (
    <div className={styles.errorState}>
      <div className={styles.errorIcon}>⚠</div>
      <p>{error}</p>
      <button onClick={fetchData} className={styles.retryBtn}>Thử lại</button>
    </div>
  )

  if (!data) return null

  const { overall, pst, charts } = data

  // ── Chart data ──────────────────────────────────────────────────────────────
  const bugMonthData = {
    labels: charts.bugsByMonth.map(d => d.month.slice(5)),
    datasets: [{ label: 'Bug/tháng', data: charts.bugsByMonth.map(d => d.count), borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.12)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#a78bfa' }],
  }

  const bugWeekData = {
    labels: charts.bugsByWeek.slice(-12).map(d => d.week.slice(5)),
    datasets: [{ label: 'Bug/tuần', data: charts.bugsByWeek.slice(-12).map(d => d.count), borderColor: '#4f8ef7', backgroundColor: 'rgba(79,142,247,0.12)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#4f8ef7' }],
  }

  const causeEntries = Object.entries(charts.bugsByCause).sort(([, a], [, b]) => b - a).slice(0, 8)
  const causeData = {
    labels: causeEntries.map(([k]) => k),
    datasets: [{ data: causeEntries.map(([, v]) => v), backgroundColor: COLORS, borderWidth: 0 }],
  }

  const subteamData = {
    labels: charts.subteamPerformance.map(s => s.name.length > 12 ? s.name.slice(0, 11) + '…' : s.name),
    datasets: [
      { label: 'Bug', data: charts.subteamPerformance.map(s => s.bugs), backgroundColor: 'rgba(167,139,250,0.8)', borderRadius: 3 },
      { label: 'Support', data: charts.subteamPerformance.map(s => s.support), backgroundColor: 'rgba(45,212,160,0.8)', borderRadius: 3 },
      { label: 'Resolved', data: charts.subteamPerformance.map(s => s.resolved), backgroundColor: 'rgba(251,146,60,0.8)', borderRadius: 3 },
    ],
  }

  const rcMonthData = {
    labels: charts.resolvedVsCreatedByMonth.map(d => d.month.slice(5)),
    datasets: [
      { label: 'Created', data: charts.resolvedVsCreatedByMonth.map(d => d.created), backgroundColor: 'rgba(167,139,250,0.7)', borderRadius: 3 },
      { label: 'Resolved', data: charts.resolvedVsCreatedByMonth.map(d => d.resolved), backgroundColor: 'rgba(45,212,160,0.7)', borderRadius: 3 },
    ],
  }

  const rcWeekData = {
    labels: charts.resolvedVsCreatedByWeek.map(d => d.week.slice(5)),
    datasets: [
      { label: 'Created', data: charts.resolvedVsCreatedByWeek.map(d => d.created), borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
      { label: 'Resolved', data: charts.resolvedVsCreatedByWeek.map(d => d.resolved), borderColor: '#2dd4a0', backgroundColor: 'rgba(45,212,160,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
    ],
  }

  const pvpData = {
    labels: charts.persistentVsPending.map(d => d.label.slice(5)),
    datasets: [
      { label: 'Pending', data: charts.persistentVsPending.map(d => d.pending), backgroundColor: 'rgba(79,142,247,0.7)', borderRadius: 3 },
      { label: 'Persistent >14d', data: charts.persistentVsPending.map(d => d.persistent), backgroundColor: 'rgba(247,96,95,0.7)', borderRadius: 3 },
    ],
  }

  const doughnutOpts = {
    ...CHART_BASE, scales: undefined,
    plugins: { ...CHART_BASE.plugins, legend: { ...CHART_BASE.plugins.legend, position: 'bottom' as const } },
