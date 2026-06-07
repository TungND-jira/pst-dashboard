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
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[PS API Error]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
