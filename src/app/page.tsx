'use client'
import { useState } from 'react'
import ProjectDashboard from './components/ProjectDashboard'
import styles from './page.module.css'

const TABS = [
  { id: 'fnb', label: 'FNB PST', api: '/api/jira/fnb', desc: 'Production Bugs · Subteam PST · Project FNB' },
  { id: 'ps', label: 'PS Project', api: '/api/jira/ps', desc: 'Production Bugs · Project PS' },
]

export default function Home() {
  const [activeTab, setActiveTab] = useState('fnb')
  const active = TABS.find(t => t.id === activeTab)!

  return (
    <div className={styles.page}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>◆</div>
          <div>
            <div className={styles.logoTitle}>PST Dashboard</div>
            <div className={styles.logoSub}>Quality Report</div>
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navLabel}>Projects</div>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`${styles.navItem} ${activeTab === tab.id ? styles.navItemActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className={styles.navDot} />
              <div>
                <div className={styles.navItemTitle}>{tab.label}</div>
                <div className={styles.navItemDesc}>{tab.desc}</div>
              </div>
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.footerItem}>
            <span className={styles.statusDot} />
            Live · citigo.atlassian.net
          </div>
          <div className={styles.footerYear}>{new Date().getFullYear()}</div>
        </div>
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div>
            <h1 className={styles.pageTitle}>{active.label}</h1>
            <p className={styles.pageDesc}>{active.desc}</p>
          </div>
          <div className={styles.yearBadge}>{new Date().getFullYear()}</div>
        </div>

        <ProjectDashboard
          key={activeTab}
          apiPath={active.api}
          projectName={active.label}
        />
      </main>
    </div>
  )
}
