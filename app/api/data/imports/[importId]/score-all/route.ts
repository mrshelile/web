import { NextResponse } from "next/server"
import { internalApiError } from "@/lib/api/errors"
import {
  getTaxpayerProfile,
  listImportedTaxpayerTins,
  listImports,
  saveRiskScoreUpdates,
  type RiskScoreUpdate,
} from "@/lib/data/database"
import { RiskEngineError, publicEngineError } from "@/lib/risk-engine/errors"
import { scoreProfiles } from "@/lib/risk-engine/client"
import { hasRiskEngineRecords } from "@/lib/risk-engine/profile"
import type { TaxpayerProfile } from "@/lib/risk-engine/types"

const MAX_BATCH_PROFILES = 1000

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ importId: string }> }

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { importId } = await context.params
    if (!listImports().some((item) => item.id === importId)) {
      return NextResponse.json({ error: "Import was not found." }, { status: 404 })
    }

    const tins = listImportedTaxpayerTins(importId)
    if (tins.length > MAX_BATCH_PROFILES) {
      return NextResponse.json(
        { error: `Bulk screening supports up to ${MAX_BATCH_PROFILES} taxpayers per import.` },
        { status: 413 },
      )
    }

    const updates: RiskScoreUpdate[] = []
    const profiles: TaxpayerProfile[] = []
    for (const tin of tins) {
      try {
        const profile = getTaxpayerProfile(importId, tin)
        if (!profile) {
          updates.push({ tin, status: "error", errorMessage: "Taxpayer profile could not be loaded." })
        } else if (hasRiskEngineRecords(profile)) {
          profiles.push(profile)
        } else {
          updates.push({
            tin,
            status: "not_evaluable",
            errorMessage: "No VAT, purchase-invoice, merchant-statement or trade records are available for R1–R5 screening.",
          })
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown profile error."
        updates.push({ tin, status: "error", errorMessage: `Taxpayer profile could not be prepared: ${detail}` })
      }
    }

    let scores = 0
    let flagged = 0
    let highPriority = 0
    let engineErrorMessage: string | null = null
    if (profiles.length > 0) {
      try {
        const results = await scoreProfiles(profiles)
        for (const result of results) {
          if (result.score) {
            scores += 1
            if (result.score.flags.some((flag) => flag.triggered)) flagged += 1
            if (result.score.priority === "High priority") highPriority += 1
            updates.push({ tin: result.tin, status: "scored", score: result.score })
          } else {
            updates.push({
              tin: result.tin,
              status: "error",
              errorMessage: result.error ?? "Scoring failed for this taxpayer.",
            })
          }
        }
      } catch (error) {
        if (!(error instanceof RiskEngineError)) throw error
        const message = publicEngineError(error).body.error.message
        engineErrorMessage = message
        updates.push(
          ...profiles.map((profile) => ({
            tin: profile.tin ?? "",
            status: "error" as const,
            errorMessage: message,
          })),
        )
      }
    }

    saveRiskScoreUpdates(importId, updates)

    const failed = updates.filter((update) => update.status === "error").length
    const notEvaluable = updates.filter((update) => update.status === "not_evaluable").length
    return NextResponse.json({
      total: tins.length,
      scored: scores,
      flagged,
      highPriority,
      notEvaluable,
      failed,
      ...(engineErrorMessage ? { errorMessage: engineErrorMessage } : {}),
    })
  } catch (error) {
    return internalApiError(error, "POST", "/api/data/imports/[importId]/score-all")
  }
}
