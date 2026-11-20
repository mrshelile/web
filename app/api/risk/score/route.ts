import { NextRequest, NextResponse } from "next/server"
import { RiskEngineError, ProfileValidationError, publicEngineError } from "@/lib/risk-engine/errors"
import { scoreProfile } from "@/lib/risk-engine/client"
import { parseTaxpayerProfile } from "@/lib/risk-engine/schemas"

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
        { status: 400 },
      )
    }
    throw error
  }

  let profile
  try {
    profile = parseTaxpayerProfile(body)
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      return NextResponse.json(
        { error: { code: "INVALID_PROFILE", message: error.message } },
        { status: 400 },
      )
    }
    throw error
  }

  try {
    return NextResponse.json(await scoreProfile(profile))
  } catch (error) {
    if (error instanceof RiskEngineError) {
      const result = publicEngineError(error)
      return NextResponse.json(result.body, { status: result.status })
    }
    throw error
  }
}
