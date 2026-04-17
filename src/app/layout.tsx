import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PST Quality Dashboard',
  description: 'Production Bug Dashboard — FNB PST & PS Project',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
