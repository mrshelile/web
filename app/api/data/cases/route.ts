import { NextRequest, NextResponse } from "next/server"
import { internalApiError } from "@/lib/api/errors"
import { getTaxpayerProfile, saveCaseReview } from "@/lib/data/database"
import type { CaseStatus } from "@/lib/data/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const caseStatuses: CaseStatus[] = ["New", "Reviewing", "Request information", "Referred", "Closed"]

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Case details are required." }, { status: 400 })
  }
  const payload = body as Record<string, unknown>
  const importId = typeof payload.importId === "string" ? payload.importId : ""
  const tin = typeof payload.tin === "string" ? payload.tin.trim() : ""
  const status = payload.status
  const officerNote = typeof payload.officerNote === "string" ? payload.officerNote.trim() : ""
  const taxpayerResponse = typeof payload.taxpayerResponse === "string" ? payload.taxpayerResponse.trim() : ""
  const missingEvidence = typeof payload.missingEvidence === "string" ? payload.missingEvidence.trim() : ""
  const officerFinding = typeof payload.officerFinding === "string" ? payload.officerFinding.trim() : ""
  const decisionReason = typeof payload.decisionReason === "string" ? payload.decisionReason.trim() : ""
  if (!importId || !tin || typeof status !== "string" || !caseStatuses.includes(status as CaseStatus)) {
    return NextResponse.json({ error: "Import, TIN and a supported case status are required." }, { status: 400 })
  }
  if (officerNote.length > 2_000) {
    return NextResponse.json({ error: "Officer notes must be 2,000 characters or fewer." }, { status: 400 })
  }
  for (const [value, label] of [
    [taxpayerResponse, "Taxpayer responses"],
    [missingEvidence, "Missing-evidence lists"],
    [officerFinding, "Officer findings"],
    [decisionReason, "Decision reasons"],
  ] as const) {
    if (value.length > 2_000) {
      return NextResponse.json({ error: `${label} must be 2,000 characters or fewer.` }, { status: 400 })
    }
  }
  let taxpayerProfile: ReturnType<typeof getTaxpayerProfile>
  try {
    taxpayerProfile = getTaxpayerProfile(importId, tin)
  } catch (error) {
    return internalApiError(error, "POST", "/api/data/cases")
  }
  if (!taxpayerProfile) {
    return NextResponse.json({ error: "Taxpayer was not found in this import." }, { status: 404 })
  }

  try {
    return NextResponse.json(saveCaseReview(
      importId,
      tin,
      status as CaseStatus,
      officerNote,
      taxpayerResponse,
      missingEvidence,
      officerFinding,
      decisionReason,
    ))
  } catch (error) {
    return internalApiError(error, "POST", "/api/data/cases")
  }
}
