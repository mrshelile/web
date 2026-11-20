import { NextRequest, NextResponse } from "next/server"
import { internalApiError } from "@/lib/api/errors"
import { getTaxpayerProfile, saveNotEvaluable, saveRiskScore, saveRiskScoreError } from "@/lib/data/database"
import { RiskEngineError, publicEngineError } from "@/lib/risk-engine/errors"
import { scoreProfile } from "@/lib/risk-engine/client"
import { hasRiskEngineRecords } from "@/lib/risk-engine/profile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ importId: string }> }

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { importId } = await context.params
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
    }
    if (typeof body !== "object" || body === null || !("tin" in body) || typeof body.tin !== "string" || !body.tin.trim()) {
      return NextResponse.json({ error: "A taxpayer TIN is required." }, { status: 400 })
    }
    const tin = body.tin.trim()
    const profile = getTaxpayerProfile(importId, tin)
    if (!profile) {
      return NextResponse.json({ error: "Taxpayer was not found in this import." }, { status: 404 })
    }

    if (!hasRiskEngineRecords(profile)) {
      saveNotEvaluable(importId, tin)
      return NextResponse.json(
        { error: "No VAT, Lekuka, merchant-statement or trade records are available for R1–R5 screening." },
        { status: 422 },
      )
    }

    try {
      const result = await scoreProfile(profile)
      saveRiskScore(importId, tin, result)
      return NextResponse.json(result)
    } catch (error) {
      if (!(error instanceof RiskEngineError)) throw error
      const publicError = publicEngineError(error)
      const message = publicError.body.error.message
      saveRiskScoreError(importId, tin, message)
      return NextResponse.json(publicError.body, { status: publicError.status })
    }
  } catch (error) {
    return internalApiError(error, "POST", "/api/data/imports/[importId]/score")
  }
}
