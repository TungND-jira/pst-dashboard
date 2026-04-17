export const dynamic = 'force-dynamic'

// src/app/api/jira/ps/route.ts
import { NextResponse } from 'next/server'
import { getPsData } from '@/app/lib/jira'

export async function GET() {
  try {
    const data = await getPsData()
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[PS API Error]', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

export const revalidate = 300
