import type { TaxpayerProfile } from "./types"

export function hasRiskEngineRecords(profile: TaxpayerProfile): boolean {
  return (
    profile.vat_returns.length > 0 ||
    profile.lekuka_purchase_invoices.length > 0 ||
    profile.merchant_statements.length > 0 ||
    profile.lekuka_credit_notes.length > 0 ||
    profile.trades.length > 0
  )
}
