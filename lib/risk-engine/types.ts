export type VatReturn = {
  period: string
  input_vat: number
  output_vat: number
  net_vat: number
  declared_turnover: number
}

export type PurchaseInvoice = {
  invoice_id: string | null
  supplier_tin: string | null
  vat_amount: number
  matched: boolean
  quarantined: boolean
}

export type MerchantStatement = { amount: number }
export type CreditNote = { note_id: string | null; amount: number; quarantined: boolean }
export type Trade = { counterparty_tin: string | null; amount: number; related: boolean }

export type TaxpayerProfile = {
  tin: string | null
  name: string | null
  vat_returns: VatReturn[]
  lekuka_source_available: boolean
  lekuka_purchase_invoices: PurchaseInvoice[]
  merchant_statements: MerchantStatement[]
  lekuka_credit_notes: CreditNote[]
  trades: Trade[]
}

export type Evidence = { source: string; record_ref: string; detail: string }

export type RiskFlag = {
  rule_id: string
  name: string
  triggered: boolean
  severity: number
  exposure: number
  summary: string
  evidence: Evidence[]
}

export type RiskPriority = "High priority" | "Needs review" | "Informational"

export type ScoreResult = {
  tin: string | null
  name: string | null
  rule_version: string
  risk_score: number
  data_confidence: number
  confidence_notes: string[]
  potential_exposure: number
  flags: RiskFlag[]
  advisory: string
  priority: RiskPriority
}

export type EngineHealth = { ok: boolean; rule_version: string }
