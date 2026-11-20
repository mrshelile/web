import type { ScoreResult } from "@/lib/risk-engine/types"

export type ImportSummary = {
  id: string
  fileName: string
  uploadedAt: string
  recordCount: number
  taxpayerCount: number
  worksheetCount: number
}

export type CaseStatus =
  | "New"
  | "Reviewing"
  | "Request information"
  | "Referred"
  | "Closed"

export type CaseAuditEvent = {
  id: number
  action: "created" | "updated"
  status: CaseStatus
  officerNote: string
  taxpayerResponse: string
  missingEvidence: string
  officerFinding: string
  decisionReason: string
  updatedAt: string
}

export type CaseReview = {
  status: CaseStatus
  officerNote: string
  taxpayerResponse: string
  missingEvidence: string
  officerFinding: string
  decisionReason: string
  updatedAt: string | null
  auditHistory: CaseAuditEvent[]
}

export type TaxpayerDashboardRow = {
  tin: string
  name: string
  sector: string
  taxYear: string
  revenue: number
  taxableIncome: number
  refundClaimed: number
  relatedPartyCharges: number
  managementFees: number
  royalties: number
  relatedPartyInterest: number
  lowTaxJurisdictionPayments: number
  foreignPayments: number
  importedServicesVatDeclared: number
  grossMarginPct: number
  payrollAmount: number
  expatriateCount: number
  payeDeclared: number
  consultantPayments: number
  negativeVatPeriods: number
  duplicateInvoiceCount: number
  quarantinedInvoiceCount: number
  sourceCounts: Record<string, number>
  score: ScoreResult | null
  scoreStatus: "unscored" | "scored" | "error" | "not_evaluable"
  scoreError: string | null
  caseStatus: CaseStatus
  officerNote: string
  caseUpdatedAt: string | null
  taxpayerResponse: string
  missingEvidence: string
  officerFinding: string
  decisionReason: string
  caseAuditHistory: CaseAuditEvent[]
}

export type DashboardSummary = {
  taxpayers: number
  records: number
  scored: number
  highPriority: number
  needsReview: number
  informational: number
  flagged: number
  averageConfidence: number
  potentialExposure: number
  refundClaims: number
}

export type DashboardData = {
  imports: ImportSummary[]
  activeImportId: string | null
  activeImport: ImportSummary | null
  summary: DashboardSummary
  sourceCounts: Record<string, number>
  taxpayers: TaxpayerDashboardRow[]
}

export type WorkbookRecord = {
  rowNumber: number
  tin: string | null
  data: Record<string, unknown>
}

export type WorkbookSheet = {
  name: string
  key: string
  rows: WorkbookRecord[]
}

export type ParsedWorkbook = {
  sheets: WorkbookSheet[]
  recordCount: number
  taxpayerCount: number
}
