// src/app/api/jira/ps/route.ts
import { NextResponse } from 'next/server'
import { getPsData } from '@/app/lib/jira'

export async function GET() {
  try {
    const data = await getPsData()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[PS API Error]', error)
    return NextResponse.json(
      { error: 'Không thể lấy dữ liệu Jira. Kiểm tra lại credentials.' },
      { status: 500 }
    )
  }
}

export const revalidate = 300
