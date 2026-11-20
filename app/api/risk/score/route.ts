import { NextRequest, NextResponse } from "next/server"
import { internalApiError } from "@/lib/api/errors"
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
    return internalApiError(error, "POST", "/api/risk/score")
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
    return internalApiError(error, "POST", "/api/risk/score")
  }

  try {
    return NextResponse.json(await scoreProfile(profile))
  } catch (error) {
    if (error instanceof RiskEngineError) {
      const result = publicEngineError(error)
      return NextResponse.json(result.body, { status: result.status })
    }
    return internalApiError(error, "POST", "/api/risk/score")
  }
}
