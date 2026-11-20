import { NextRequest, NextResponse } from "next/server"
import { getDashboard } from "@/lib/data/database"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const importId = request.nextUrl.searchParams.get("importId")
  const dashboard = getDashboard(importId)
  if (!dashboard) {
    return NextResponse.json({ error: "The selected import was not found." }, { status: 404 })
  }
  return NextResponse.json(dashboard)
}
