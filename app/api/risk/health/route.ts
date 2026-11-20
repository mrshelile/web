import { NextResponse } from "next/server";
import { internalApiError } from "@/lib/api/errors"
import { checkEngineHealth } from "@/lib/risk-engine/client"
import { RiskEngineError, publicEngineError } from "@/lib/risk-engine/errors"

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await checkEngineHealth())
  } catch (error) {
    if (error instanceof RiskEngineError) {
      const result = publicEngineError(error)
      return NextResponse.json(result.body, { status: result.status })
    }
    return internalApiError(error, "GET", "/api/risk/health")
  }
}
