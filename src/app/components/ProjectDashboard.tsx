'use client'
import { useEffect, useRef, useState } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import type { DashboardData } from '@/app/lib/jira'
import MetricCard from './MetricCard'
import styles from './ProjectDashboard.module.css'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, Filler
)

const CHART_COLORS = ['#4f8ef7', '#2dd4a0', '#f7c04f', '#f75f5f', '#a78bfa', '#fb923c', '#34d399', '#60a5fa']

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7c84a0', font: { family: 'Be Vietnam Pro', size: 12 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#141720',
      borderColor: '#1f2437',
      borderWidth: 1,
      titleColor: '#e8eaf0',
      bodyColor: '#7c84a0',
      padding: 12,
    },
  },
  scales: {
    x: { ticks: { color: '#7c84a0', font: { family: 'Be Vietnam Pro', size: 11 } }, grid: { color: '#1f2437' } },
    y: { ticks: { color: '#7c84a0', font: { family: 'Be Vietnam Pro', size: 11 } }, grid: { color: '#1f2437' } },
  },
}

interface Props {
  apiPath: string
  projectName: string
}

export default function ProjectDashboard({ apiPath, projectName }: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiPath)
      if (!res.ok) throw new Error('API error')
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
      setLastFetch(new Date())
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
    <div className={styles.error}>
      <div className={styles.errorIcon}>⚠</div>
      <p>{error}</p>
      <button onClick={fetchData} className={styles.retryBtn}>Thử lại</button>
    </div>
  )

  if (!data) return null

  const slaColor = data.slaDoneRate >= 80 ? 'green' : data.slaDoneRate >= 60 ? 'yellow' : 'red'

  // Chart data
  const weekTrendData = {
    labels: data.bugsByWeek.map(w => w.week.slice(5)),
    datasets: [{
      label: 'Bug mới/tuần',
      data: data.bugsByWeek.map(w => w.count),
      borderColor: '#4f8ef7',
      backgroundColor: 'rgba(79,142,247,0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#4f8ef7',
    }]
  }

  const priorityData = {
    labels: Object.keys(data.bugsByPriority),
    datasets: [{
      data: Object.values(data.bugsByPriority),
      backgroundColor: CHART_COLORS,
      borderWidth: 0,
    }]
  }

  const moduleEntries = Object.entries(data.bugsByModule).sort(([,a],[,b]) => b - a).slice(0, 10)
  const moduleData = {
    labels: moduleEntries.map(([k]) => k),
    datasets: [{
      label: 'Số bug',
      data: moduleEntries.map(([,v]) => v),
      backgroundColor: 'rgba(79,142,247,0.8)',
      borderRadius: 4,
    }]
  }

  const causeEntries = Object.entries(data.bugsByCause).sort(([,a],[,b]) => b - a).slice(0, 8)
  const causeData = {
    labels: causeEntries.map(([k]) => k),
    datasets: [{
      label: 'Số bug',
      data: causeEntries.map(([,v]) => v),
      backgroundColor: 'rgba(45,212,160,0.8)',
      borderRadius: 4,
    }]
  }

  const ctEntries = Object.entries(data.cycleTimeByPriority)
  const cycleTimeData = {
    labels: ctEntries.map(([k]) => k),
    datasets: [{
      label: 'Avg cycle time (ngày)',
      data: ctEntries.map(([,v]) => Math.round(v * 10) / 10),
      backgroundColor: CHART_COLORS,
      borderWidth: 0,
      borderRadius: 4,
    }]
  }

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.projectTitle}>{projectName}</h2>
          <div className={styles.meta}>
            {lastFetch && <span>Cập nhật: {lastFetch.toLocaleTimeString('vi-VN')}</span>}
            <span className={styles.dot} />
            <span>Cache 5 phút</span>
          </div>
        </div>
        <button onClick={fetchData} className={styles.refreshBtn} title="Refresh">
          ↻ Refresh
        </button>
      </div>

      {/* KPI Row */}
      <div className={styles.kpiGrid}>
        <MetricCard label="Tổng Bug" value={data.totalBugs} color="blue" delay={0} />
        <MetricCard label="Đã giải quyết" value={data.resolvedBugs} color="green" delay={60} target={`${Math.round(data.resolvedBugs/data.totalBugs*100)}% total`} />
        <MetricCard label="Đang mở" value={data.openBugs} color="yellow" delay={120} />
        <MetricCard label="SLA Done Rate" value={data.slaDoneRate.toFixed(1)} unit="%" color={slaColor} delay={180} target="Target: ≥ 80%" />
        <MetricCard label="SLA Breach Rate" value={data.slaBreachRate.toFixed(1)} unit="%" color={data.slaBreachRate > 30 ? 'red' : 'default'} delay={240} />
        <MetricCard label="Avg Cycle Time" value={data.avgCycleTime} unit=" ngày" color="purple" delay={300} />
        <MetricCard label="Bug/tuần" value={data.bugsPerWeek} color="default" delay={360} />
        <MetricCard label="Unresolvable" value={data.unresolvableRate.toFixed(1)} unit="%" color="default" delay={420} />
      </div>

      {/* Charts Row 1 */}
      <div className={styles.chartsRow}>
        <div className={styles.chartCard} style={{ flex: 2 }}>
          <div className={styles.chartTitle}>📈 Xu hướng Bug theo tuần</div>
          <div className={styles.chartWrap}>
            <Line data={weekTrendData} options={chartDefaults as never} />
          </div>
        </div>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>🎯 Phân bổ theo Priority</div>
          <div className={styles.chartWrap}>
            <Doughnut data={priorityData} options={{
              ...chartDefaults,
              scales: undefined,
              plugins: { ...chartDefaults.plugins, legend: { ...chartDefaults.plugins.legend, position: 'bottom' as const } }
            } as never} />
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className={styles.chartsRow}>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>📦 Bug theo Module</div>
          <div className={styles.chartWrap}>
            <Bar data={moduleData} options={{ ...chartDefaults, indexAxis: 'y' as const } as never} />
          </div>
        </div>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>🔍 Nguyên nhân Bug</div>
          <div className={styles.chartWrap}>
            <Bar data={causeData} options={{ ...chartDefaults, indexAxis: 'y' as const } as never} />
          </div>
        </div>
      </div>

      {/* Charts Row 3 */}
      <div className={styles.chartsRow}>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>⏱ Cycle Time theo Priority (avg ngày)</div>
          <div className={styles.chartWrap} style={{ height: 200 }}>
            <Bar data={cycleTimeData} options={chartDefaults as never} />
          </div>
        </div>
        <div className={styles.chartCard} style={{ flex: 1 }}>
          <div className={styles.chartTitle}>👤 Top Assignees (bug đang mở)</div>
          <div className={styles.assigneeList}>
            {data.topAssignees.map((a, i) => (
              <div key={a.name} className={styles.assigneeRow}>
                <span className={styles.assigneeRank}>{i + 1}</span>
                <span className={styles.assigneeName}>{a.name}</span>
                <div className={styles.assigneeBar}>
                  <div
                    className={styles.assigneeBarFill}
                    style={{ width: `${(a.count / data.topAssignees[0].count) * 100}%` }}
                  />
                </div>
                <span className={styles.assigneeCount}>{a.count}</span>
              </div>
            ))}
            {data.topAssignees.length === 0 && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 40 }}>Không có bug đang mở</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
