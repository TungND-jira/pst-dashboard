export const dynamic = 'force-dynamic'

// src/app/api/jira/fnb/route.ts
import { NextResponse } from 'next/server'
import { getFnbPstData } from '@/app/lib/jira'

export async function GET() {
  try {
    const data = await getFnbPstData()
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[FNB API Error]', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

// Revalidate cache mỗi 5 phút
export const revalidate = 300
