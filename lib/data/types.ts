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

export type EPaymentScheduleLine = {
  reference: string
  period: string
  amount: number
  invoiceReference: string | null
  supplierTin: string | null
  attachmentStatus: string
  documentReference: string | null
}

export type CertificateRecord = {
  reference: string
  contractReference: string | null
  period: string
  taxType: string
  payee: string | null
  taxBase: number | null
  claimedRate: number | null
  claimedAmount: number | null
}

export type ContractTerm = {
  reference: string
  effectiveFrom: string
  effectiveTo: string
  taxBase: number | null
  contractualRate: number | null
  clauseReference: string | null
  extractionConfidence: number | null
  validationStatus: string
}

export type WithholdingRecord = {
  certificateReference: string | null
  period: string
  payee: string | null
  paymentAmount: number | null
  withholdingAmount: number | null
  taxBase: number | null
  rate: number | null
}

export type ProfitSharingRecord = {
  period: string
  relatedTin: string | null
  allocationKey: string | null
  allocatedAmount: number | null
  declaredAmount: number | null
  functionsAssetsRisksReference: string | null
}

export type PayrollBenefitRecord = {
  period: string
  expatriateCount: number
  salaryAmount: number | null
  cashAllowances: number | null
  nonCashBenefits: number | null
  payeDeclared: number | null
  contractReference: string | null
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
  epaymentsLines: EPaymentScheduleLine[]
  certificates: CertificateRecord[]
  contractTerms: ContractTerm[]
  withholdingRecords: WithholdingRecord[]
  profitSharingRecords: ProfitSharingRecord[]
  payrollBenefitRecords: PayrollBenefitRecord[]
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
