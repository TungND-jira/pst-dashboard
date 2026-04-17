// src/app/api/jira/fnb/route.ts
import { NextResponse } from 'next/server'
import { getFnbPstData } from '@/app/lib/jira'

export async function GET() {
  try {
    const data = await getFnbPstData()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[FNB API Error]', error)
    return NextResponse.json(
      { error: 'Không thể lấy dữ liệu Jira. Kiểm tra lại credentials.' },
      { status: 500 }
    )
  }
}

// Revalidate cache mỗi 5 phút
export const revalidate = 300
