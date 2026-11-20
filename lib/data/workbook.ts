import "server-only"

import ExcelJS from "exceljs"
import type { ParsedWorkbook, WorkbookRecord, WorkbookSheet } from "./types"

const MAX_SHEETS = 20
const MAX_ROWS_PER_SHEET = 10_000
const MAX_RECORDS = 20_000

const sheetAliases: Record<string, string> = {
  company: "taxpayers",
  companies: "taxpayers",
  entity: "taxpayers",
  entities: "taxpayers",
  taxpayer: "taxpayers",
  tax_payer: "taxpayers",
  vat: "vat_returns",
  vat_return: "vat_returns",
  vat_declaration: "vat_returns",
  lekuka_invoice: "purchase_invoices",
  lekuka_invoices: "purchase_invoices",
  lekuka_purchase_invoices: "purchase_invoices",
  invoice: "purchase_invoices",
  invoices: "purchase_invoices",
  purchase_invoice: "purchase_invoices",
  merchant_statement: "merchant_statements",
  merchant: "merchant_statements",
  credit_note: "credit_notes",
  related_party_trades: "trades",
  related_trades: "trades",
  epayments: "e_payments",
  vat_schedule: "e_payments",
  vat_schedule_lines: "e_payments",
  e_certificate: "e_certificates",
  contract: "contract_terms",
  contracts: "contract_terms",
  profit_share: "profit_sharing",
  profit_shares: "profit_sharing",
}

const headerAliases: Record<string, string> = {
  taxpayer_tin: "tin",
  entity_tin: "tin",
  tin_number: "tin",
  tax_id: "tin",
  taxpayer_id: "tin",
  tax_identification_number: "tin",
  taxpayer_name: "name",
  entity_name: "name",
  legal_name: "name",
  financial_year: "tax_year",
  year: "tax_year",
  tax_period: "period",
  vat_period: "period",
  invoice_number: "invoice_id",
  invoice_no: "invoice_id",
  supplier_tax_id: "supplier_tin",
  supplier_vat: "vat_amount",
  declared_revenue: "revenue",
  turnover: "revenue",
  declared_turnover_amount: "declared_turnover",
  refund_amount: "refund_claimed",
  vat_refund: "refund_claimed",
  refund_claim: "refund_claimed",
  input_vat_claimed: "input_vat",
  output_vat_due: "output_vat",
  net_vat_position: "net_vat",
  statement_amount: "amount",
  transaction_amount: "amount",
  credit_note_id: "note_id",
  counterparty_tax_id: "counterparty_tin",
  related_party: "related",
  related_party_amount: "related_party_charges",
  management_fee: "management_fees",
  royalty: "royalties",
  foreign_payment: "foreign_payments",
  imported_services_vat: "imported_services_vat_declared",
  gross_margin: "gross_margin_pct",
  schedule_line_id: "line_reference",
  line_id: "line_reference",
  document_ref: "document_reference",
  supporting_document: "document_reference",
  certificate_id: "certificate_reference",
  certificate_no: "certificate_reference",
  contract_id: "contract_reference",
  contract_no: "contract_reference",
  contract_tax_rate: "contractual_rate",
  tax_rate_claimed: "claimed_rate",
  claimed_tax_rate: "claimed_rate",
  withholding_rate: "rate",
  withholding_tax_rate: "rate",
  tax_base_amount: "tax_base",
  allocation_amount: "allocated_amount",
  declared_allocation: "declared_amount",
  functional_analysis_reference: "functions_assets_risks_reference",
  benefits_in_kind: "non_cash_benefits",
  cash_benefits: "cash_allowances",
  contract_clause: "clause_reference",
}

const numericFields = new Set([
  "input_vat",
  "output_vat",
  "net_vat",
  "declared_turnover",
  "vat_amount",
  "amount",
  "refund_claimed",
  "revenue",
  "taxable_income",
  "related_party_charges",
  "management_fees",
  "royalties",
  "related_party_interest",
  "foreign_payments",
  "low_tax_jurisdiction_payments",
  "gross_margin_pct",
  "imported_services_vat_declared",
  "payroll_amount",
  "withholding_tax_amount",
  "import_amount",
  "import_vat",
  "export_amount",
  "ownership_pct",
  "employee_count",
  "expatriate_count",
  "paye_declared",
  "consultant_payments",
  "payment_amount",
  "tax_base",
  "claimed_rate",
  "claimed_amount",
  "contractual_rate",
  "extraction_confidence",
  "withholding_rate",
  "rate",
  "salary_amount",
  "cash_allowances",
  "non_cash_benefits",
  "allocated_amount",
  "declared_amount",
])

const booleanFields = new Set(["matched", "quarantined", "related"])

export class WorkbookValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkbookValidationError"
  }
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function normalizeHeader(value: string): string {
  const token = normalizeToken(value)
  return headerAliases[token] ?? token
}

function normalizeSheet(value: string): string {
  const token = normalizeToken(value)
  return sheetAliases[token] ?? token
}

function cellValue(value: ExcelJS.CellValue, sheet: string, row: number, column: number): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if ("formula" in value) {
    throw new WorkbookValidationError(
      `${sheet} row ${row}, column ${column}: formula cells are not supported; upload evaluated values.`,
    )
  }
  if ("richText" in value) return value.richText.map((part) => part.text).join("")
  if ("text" in value && typeof value.text === "string") return value.text
  if ("error" in value) {
    throw new WorkbookValidationError(`${sheet} row ${row}, column ${column}: Excel error cells are not supported.`)
  }
  return null
}

function normalizeFieldValue(
  field: string,
  value: unknown,
  sheet: string,
  rowNumber: number,
): unknown {
  if (value === null || value === undefined || value === "") return null

  if (numericFields.has(field)) {
    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value.replace(/,/g, "").trim())
          : Number.NaN
    if (!Number.isFinite(numeric)) {
      throw new WorkbookValidationError(`${sheet} row ${rowNumber}: "${field}" must contain a number.`)
    }
    return numeric
  }

  if (booleanFields.has(field)) {
    if (typeof value === "boolean") return value
    if (value === 1 || value === 0) return value === 1
    if (typeof value === "string") {
      const token = value.trim().toLowerCase()
      if (["true", "yes", "y", "1", "matched", "related"].includes(token)) return true
      if (["false", "no", "n", "0", "unmatched", "unrelated"].includes(token)) return false
    }
    throw new WorkbookValidationError(
      `${sheet} row ${rowNumber}: "${field}" must be Yes/No, True/False or 1/0.`,
    )
  }

  return value
}

function parseSheet(sheet: ExcelJS.Worksheet): WorkbookSheet | null {
  const name = sheet.name
  const key = normalizeSheet(name)
  if (["read_me", "readme", "instructions", "guide"].includes(key)) return null
  const headerRow = sheet.getRow(1)
  const headers: Array<{ column: number; key: string }> = []

  for (let column = 1; column <= sheet.columnCount; column += 1) {
    const raw = cellValue(headerRow.getCell(column).value, name, 1, column)
    if (raw === null || raw === "") continue
    const header = normalizeHeader(String(raw))
    if (!header) continue
    if (headers.some((item) => item.key === header)) {
      throw new WorkbookValidationError(`${name}: column headings must be unique after normalization ("${header}").`)
    }
    headers.push({ column, key: header })
  }

  if (headers.length === 0) return null

  const knownSheet = [
    "taxpayers",
    "vat_returns",
    "purchase_invoices",
    "merchant_statements",
    "credit_notes",
    "trades",
    "withholding_tax",
    "customs",
    "foreign_services",
    "payroll",
    "related_parties",
    "e_payments",
    "e_certificates",
    "contract_terms",
    "profit_sharing",
  ].includes(key)

  if (knownSheet && !headers.some((header) => header.key === "tin")) {
    throw new WorkbookValidationError(`${name}: add a TIN column so records can be linked to a taxpayer.`)
  }

  const rows: WorkbookRecord[] = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const data: Record<string, unknown> = {}
    let hasValue = false

    for (const header of headers) {
      const rawValue = cellValue(row.getCell(header.column).value, name, rowNumber, header.column)
      const value = normalizeFieldValue(header.key, rawValue, name, rowNumber)
      if (value !== null) {
        hasValue = true
        data[header.key] = value
      }
    }
    if (!hasValue) continue

    const tinValue = data.tin
    const tin = tinValue === null || tinValue === undefined ? null : String(tinValue).trim()
    if (knownSheet && !tin) {
      throw new WorkbookValidationError(`${name} row ${rowNumber}: TIN is required.`)
    }
    if (tin && tin.length > 80) {
      throw new WorkbookValidationError(`${name} row ${rowNumber}: TIN is too long.`)
    }
    if (tin) data.tin = tin

    rows.push({ rowNumber, tin, data })
    if (rows.length > MAX_ROWS_PER_SHEET) {
      throw new WorkbookValidationError(`${name}: maximum ${MAX_ROWS_PER_SHEET.toLocaleString()} data rows exceeded.`)
    }
  }

  return { name, key, rows }
}

export async function parseExcelWorkbook(buffer: ArrayBuffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw new WorkbookValidationError("The file is not a readable .xlsx workbook.")
  }

  if (workbook.worksheets.length === 0) {
    throw new WorkbookValidationError("The workbook has no worksheets.")
  }
  if (workbook.worksheets.length > MAX_SHEETS) {
    throw new WorkbookValidationError(`Maximum ${MAX_SHEETS} worksheets allowed.`)
  }

  const sheets = workbook.worksheets
    .map(parseSheet)
    .filter((sheet): sheet is WorkbookSheet => sheet !== null)
  const recordCount = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)
  if (recordCount === 0) {
    throw new WorkbookValidationError("No data rows were found below the worksheet headers.")
  }
  if (recordCount > MAX_RECORDS) {
    throw new WorkbookValidationError(`Maximum ${MAX_RECORDS.toLocaleString()} total data rows exceeded.`)
  }

  const taxpayerIds = new Set(
    sheets.flatMap((sheet) => sheet.rows.map((row) => row.tin).filter((tin): tin is string => Boolean(tin))),
  )
  if (taxpayerIds.size === 0) {
    throw new WorkbookValidationError("At least one worksheet must contain taxpayer rows with a TIN column.")
  }

  return { sheets, recordCount, taxpayerCount: taxpayerIds.size }
}

export const workbookTemplate = {
  taxpayers: [
    "tin",
    "name",
    "tax_year",
    "sector",
    "revenue",
    "taxable_income",
    "refund_claimed",
    "management_fees",
    "royalties",
    "related_party_interest",
    "related_party_charges",
    "foreign_payments",
    "low_tax_jurisdiction_payments",
    "gross_margin_pct",
    "imported_services_vat_declared",
    "payroll_amount",
  ],
  vat_returns: ["tin", "period", "input_vat", "output_vat", "net_vat", "declared_turnover"],
  purchase_invoices: ["tin", "invoice_id", "supplier_tin", "vat_amount", "matched", "quarantined"],
  merchant_statements: ["tin", "amount"],
  credit_notes: ["tin", "note_id", "amount", "quarantined"],
  trades: ["tin", "counterparty_tin", "amount", "related"],
  withholding_tax: [
    "tin",
    "period",
    "certificate_reference",
    "payee",
    "payment_amount",
    "tax_base",
    "rate",
    "withholding_tax_amount",
  ],
  customs: ["tin", "period", "declaration_id", "import_amount", "import_vat", "export_amount"],
  foreign_services: ["tin", "period", "supplier", "description", "amount"],
  payroll: [
    "tin",
    "period",
    "employee_count",
    "expatriate_count",
    "payroll_amount",
    "salary_amount",
    "cash_allowances",
    "non_cash_benefits",
    "paye_declared",
    "contract_reference",
  ],
  related_parties: ["tin", "related_tin", "relationship", "country", "ownership_pct"],
  e_payments: [
    "tin",
    "period",
    "line_reference",
    "amount",
    "invoice_reference",
    "supplier_tin",
    "attachment_status",
    "document_reference",
  ],
  e_certificates: [
    "tin",
    "certificate_reference",
    "contract_reference",
    "period",
    "tax_type",
    "payee",
    "tax_base",
    "claimed_rate",
    "claimed_amount",
  ],
  contract_terms: [
    "tin",
    "contract_reference",
    "effective_from",
    "effective_to",
    "tax_base",
    "contractual_rate",
    "clause_reference",
    "extraction_confidence",
    "validation_status",
  ],
  profit_sharing: [
    "tin",
    "period",
    "related_tin",
    "allocation_key",
    "allocated_amount",
    "declared_amount",
    "functions_assets_risks_reference",
  ],
} as const
