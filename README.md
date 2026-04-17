# PST Quality Dashboard

Dashboard visualize Production Bug từ Jira — FNB PST & PS Project.

## Stack
- **Next.js 14** (App Router)
- **Chart.js** + react-chartjs-2
- **Vercel** hosting

## Cấu trúc project

```
src/
  app/
    api/jira/
      fnb/route.ts     ← API proxy cho FNB PST
      ps/route.ts      ← API proxy cho PS Project
    components/
      MetricCard.tsx
      ProjectDashboard.tsx
    lib/
      jira.ts          ← Logic gọi Jira + transform data
    page.tsx           ← UI chính với 2 tab
    layout.tsx
    globals.css
```

## Setup local (tùy chọn)

```bash
npm install
cp .env.local.example .env.local
# Điền JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN vào .env.local
npm run dev
# Mở http://localhost:3000
```

## Deploy lên Vercel

1. Push code lên GitHub repo này
2. Vào [vercel.com](https://vercel.com) → Import repo
3. Vào **Settings → Environment Variables**, thêm:
   - `JIRA_BASE_URL` = `https://citigo.atlassian.net`
   - `JIRA_EMAIL` = email Jira của bạn
   - `JIRA_API_TOKEN` = API token Jira
4. Click **Deploy** ✅

## Lấy Jira API Token

1. Vào https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**
3. Copy token vào Vercel Environment Variables

## Metrics được tính

| Metric | Mô tả |
|--------|-------|
| SLA Done Rate | % bug Done không vi phạm SLA (target ≥ 80%) |
| SLA Breach Rate | % bug vi phạm SLA window |
| Avg Cycle Time | Trung bình ngày từ Created → Resolved (chỉ status = Done) |
| Unresolvable Rate | % bug Cancelled/Invalid/Won't Fix |

## SLA Windows

| Priority | SLA (ngày) |
|----------|-----------|
| Highest | 2 |
| High | 7 |
| Medium | 12 |
| Low | 15 |
