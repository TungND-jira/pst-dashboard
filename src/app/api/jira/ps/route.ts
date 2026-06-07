// src/app/api/jira/ps/route.ts
import { NextResponse } from 'next/server'
import { getRetailFullData } from '@/app/lib/jira'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const data = await getRetailFullData()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[PS API Error]', error)
    return NextResponse.json(
      { error: 'Không thể lấy dữ liệu Jira. Kiểm tra lạ