// src/app/api/jira/fnb/route.ts
import { NextResponse } from 'next/server'
import { getFnbFullData } from '@/app/lib/jira'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const data = await getFnbFullData()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[FNB API Error]', error)
    return NextResponse.json(
      { error: 'Không thể lấy dữ liệu Jira. Kiểm tra lại credentials.' },
      { status: 500 }
    )
 