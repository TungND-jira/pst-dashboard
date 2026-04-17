'use client'
import styles from './MetricCard.module.css'

interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'neutral'
  color?: 'default' | 'green' | 'red' | 'yellow' | 'blue' | 'purple'
  target?: string
  delay?: number
}

export default function MetricCard({ label, value, unit, trend, color = 'default', target, delay = 0 }: MetricCardProps) {
  return (
    <div
      className={`${styles.card} ${styles[color]} fade-up`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>
        {value}
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {target && <div className={styles.target}>{target}</div>}
    </div>
  )
}
