import "server-only"

import { mkdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { parseScoreResult } from "@/lib/risk-engine/schemas"
import type { ScoreResult, TaxpayerProfile } from "@/lib/risk-engine/types"
import type {
  CaseStatus,
  DashboardData,
  DashboardSummary,
  ImportSummary,
  ParsedWorkbook,
  TaxpayerDashboardRow,
} from "./types"

type RiskLensGlobal = typeof globalThis & { __riskLensDatabase?: DatabaseSync }
type SourceRow = {
  sheet_key: string
  tin: string | null
  data_json: string
}

const dbDirectory = process.env.RISKLENS_DATA_DIR
  ? path.resolve(process.env.RISKLENS_DATA_DIR)
  : path.resolve(process.cwd(), ".data")
const dbPath = process.env.RISKLENS_SQLITE_PATH
  ? path.resolve(process.env.RISKLENS_SQLITE_PATH)
  : path.join(dbDirectory, "risklens.sqlite")

function createDatabase(): DatabaseSync {
  mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
  db.exec(`
    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      record_count INTEGER NOT NULL,
      taxpayer_count INTEGER NOT NULL,
      worksheet_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_records (
      id INTEGER PRIMARY KEY,
      import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      sheet_name TEXT NOT NULL,
      sheet_key TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      tin TEXT,
      data_json TEXT NOT NULL,
      UNIQUE(import_id, sheet_name, row_number)
    );
    CREATE INDEX IF NOT EXISTS source_records_import_tin
      ON source_records(import_id, tin);
    CREATE INDEX IF NOT EXISTS source_records_import_sheet
      ON source_records(import_id, sheet_key);
    CREATE TABLE IF NOT EXISTS risk_scores (
      import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      tin TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('scored', 'error', 'not_evaluable')),
      score_json TEXT,
      error_message TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(import_id, tin)
    );
    CREATE TABLE IF NOT EXISTS case_reviews (
      import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      tin TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('New', 'Reviewing', 'Request information', 'Referred', 'Closed')),
      officer_note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY(import_id, tin)
    );
  `)
  return db
}

function database(): DatabaseSync {
  const appGlobal = globalThis as RiskLensGlobal
  if (!appGlobal.__riskLensDatabase) appGlobal.__riskLensDatabase = createDatabase()
  return appGlobal.__riskLensDatabase
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function numeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "bigint") return Number(value)
  return 0
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asNumber(value: unknown, field: string): number {
  if (value === null || value === undefined || value === "") return 0
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim())
  if (!Number.isFinite(parsed)) throw new Error(`Imported ${field} is not a valid number.`)
  return parsed
}

function asBoolean(value: unknown, field: string): boolean {
  if (value === null || value === undefined || value === "") return false
  if (typeof value === "boolean") return value
  if (value === 1 || value === "1" || String(value).toLowerCase() === "yes" || String(value).toLowerCase() === "true") {
    return true
  }
  if (value === 0 || value === "0" || String(value).toLowerCase() === "no" || String(value).toLowerCase() === "false") {
    return false
  }
  throw new Error(`Imported ${field} is not a valid Yes/No value.`)
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value)
}

export function saveWorkbookImport(
  id: string,
  fileName: string,
  parsed: ParsedWorkbook,
): ImportSummary {
  const db = database()
  const uploadedAt = new Date().toISOString()
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO imports (id, file_name, uploaded_at, record_count, taxpayer_count, worksheet_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, fileName, uploadedAt, parsed.recordCount, parsed.taxpayerCount, parsed.sheets.length)

    const insertRow = db.prepare(
      `INSERT INTO source_records (import_id, sheet_name, sheet_key, row_number, tin, data_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const sheet of parsed.sheets) {
      for (const row of sheet.rows) {
        insertRow.run(id, sheet.name, sheet.key, row.rowNumber, row.tin, JSON.stringify(row.data))
      }
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return { id, fileName, uploadedAt, recordCount: parsed.recordCount, taxpayerCount: parsed.taxpayerCount, worksheetCount: parsed.sheets.length }
}

export function listImports(): ImportSummary[] {
  const rows = database()
    .prepare(
      `SELECT id, file_name, uploaded_at, record_count, taxpayer_count, worksheet_count
       FROM imports ORDER BY uploaded_at DESC`,
    )
    .all()
  return rows.map((row) => ({
    id: text(row.id),
    fileName: text(row.file_name),
    uploadedAt: text(row.uploaded_at),
    recordCount: numeric(row.record_count),
    taxpayerCount: numeric(row.taxpayer_count),
    worksheetCount: numeric(row.worksheet_count),
  }))
}

function loadSourceRows(importId: string): SourceRow[] {
  return database()
    .prepare(
      `SELECT sheet_key, tin, data_json FROM source_records
       WHERE import_id = ? ORDER BY sheet_name, row_number`,
    )
    .all(importId) as SourceRow[]
}

function sourceRowsForTin(importId: string, tin: string): SourceRow[] {
  return database()
    .prepare(
      `SELECT sheet_key, tin, data_json FROM source_records
       WHERE import_id = ? AND tin = ? ORDER BY sheet_name, row_number`,
    )
    .all(importId, tin) as SourceRow[]
}

function rowsForSheet(rows: SourceRow[], sheetKey: string): Record<string, unknown>[] {
  return rows.filter((row) => row.sheet_key === sheetKey).map((row) => JSON.parse(row.data_json) as Record<string, unknown>)
}

export function getTaxpayerProfile(importId: string, tin: string): TaxpayerProfile | null {
  const rows = sourceRowsForTin(importId, tin)
  if (rows.length === 0) return null

  const taxpayer = rowsForSheet(rows, "taxpayers")[0] ?? {}
  const vatReturns = rowsForSheet(rows, "vat_returns").map((row) => ({
    period: String(row.period ?? ""),
    input_vat: asNumber(row.input_vat, "input_vat"),
    output_vat: asNumber(row.output_vat, "output_vat"),
    net_vat: asNumber(row.net_vat, "net_vat"),
    declared_turnover: asNumber(row.declared_turnover, "declared_turnover"),
  }))
  const purchaseInvoices = rowsForSheet(rows, "purchase_invoices").map((row) => ({
    invoice_id: nullableText(row.invoice_id),
    supplier_tin: nullableText(row.supplier_tin),
    vat_amount: asNumber(row.vat_amount, "vat_amount"),
    matched: asBoolean(row.matched, "matched"),
    quarantined: asBoolean(row.quarantined, "quarantined"),
  }))
  const merchantStatements = rowsForSheet(rows, "merchant_statements").map((row) => ({
    amount: asNumber(row.amount, "merchant statement amount"),
  }))
  const creditNotes = rowsForSheet(rows, "credit_notes").map((row) => ({
    note_id: nullableText(row.note_id),
    amount: asNumber(row.amount, "credit note amount"),
    quarantined: asBoolean(row.quarantined, "quarantined"),
  }))
  const trades = rowsForSheet(rows, "trades").map((row) => ({
    counterparty_tin: nullableText(row.counterparty_tin),
    amount: asNumber(row.amount, "trade amount"),
    related: asBoolean(row.related, "related"),
  }))

  return {
    tin,
    name: nullableText(taxpayer.name),
    vat_returns: vatReturns,
    lekuka_source_available: purchaseInvoices.length > 0 || creditNotes.length > 0,
    lekuka_purchase_invoices: purchaseInvoices,
    merchant_statements: merchantStatements,
    lekuka_credit_notes: creditNotes,
    trades,
  }
}

export function saveRiskScore(importId: string, tin: string, score: ScoreResult): void {
  database()
    .prepare(
      `INSERT INTO risk_scores (import_id, tin, status, score_json, error_message, updated_at)
       VALUES (?, ?, 'scored', ?, NULL, ?)
       ON CONFLICT(import_id, tin) DO UPDATE SET
         status = 'scored', score_json = excluded.score_json, error_message = NULL, updated_at = excluded.updated_at`,
    )
    .run(importId, tin, JSON.stringify(score), new Date().toISOString())
}

export function saveRiskScoreError(importId: string, tin: string, message: string): void {
  database()
    .prepare(
      `INSERT INTO risk_scores (import_id, tin, status, score_json, error_message, updated_at)
       VALUES (?, ?, 'error', NULL, ?, ?)
       ON CONFLICT(import_id, tin) DO UPDATE SET
         status = 'error', score_json = NULL, error_message = excluded.error_message, updated_at = excluded.updated_at`,
    )
    .run(importId, tin, message, new Date().toISOString())
}

export function saveNotEvaluable(importId: string, tin: string): void {
  database()
    .prepare(
      `INSERT INTO risk_scores (import_id, tin, status, score_json, error_message, updated_at)
       VALUES (?, ?, 'not_evaluable', NULL, 'No R1-R5 source rows are available.', ?)
       ON CONFLICT(import_id, tin) DO UPDATE SET
         status = 'not_evaluable', score_json = NULL,
         error_message = excluded.error_message, updated_at = excluded.updated_at`,
    )
    .run(importId, tin, new Date().toISOString())
}

export function saveCaseReview(
  importId: string,
  tin: string,
  status: CaseStatus,
  officerNote: string,
): { status: CaseStatus; officerNote: string; updatedAt: string } {
  const updatedAt = new Date().toISOString()
  database()
    .prepare(
      `INSERT INTO case_reviews (import_id, tin, status, officer_note, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(import_id, tin) DO UPDATE SET
         status = excluded.status, officer_note = excluded.officer_note, updated_at = excluded.updated_at`,
    )
    .run(importId, tin, status, officerNote, updatedAt)
  return { status, officerNote, updatedAt }
}

const emptySummary: DashboardSummary = {
  taxpayers: 0,
  records: 0,
  scored: 0,
  highPriority: 0,
  needsReview: 0,
  informational: 0,
  flagged: 0,
  averageConfidence: 0,
  potentialExposure: 0,
  refundClaims: 0,
}

export function getDashboard(importId?: string | null): DashboardData | null {
  const imports = listImports()
  if (imports.length === 0) {
    return {
      imports,
      activeImportId: null,
      activeImport: null,
      summary: emptySummary,
      sourceCounts: {},
      taxpayers: [],
    }
  }

  const activeImport = importId
    ? imports.find((item) => item.id === importId)
    : imports[0]
  if (!activeImport) return null

  const db = database()
  const sourceRows = loadSourceRows(activeImport.id)
  const scoreRows = db
    .prepare(
      `SELECT tin, status, score_json, error_message FROM risk_scores WHERE import_id = ?`,
    )
    .all(activeImport.id)
  const scores = new Map<string, { status: string; score: ScoreResult | null; error: string | null }>()
  for (const row of scoreRows) {
    const scoreJson = row.score_json
    const score = typeof scoreJson === "string" ? parseScoreResult(JSON.parse(scoreJson)) : null
    scores.set(text(row.tin), {
      status: text(row.status),
      score,
      error: typeof row.error_message === "string" ? row.error_message : null,
    })
  }
  const caseRows = db
    .prepare(
      `SELECT tin, status, officer_note, updated_at FROM case_reviews WHERE import_id = ?`,
    )
    .all(activeImport.id)
  const cases = new Map<string, { status: CaseStatus; note: string; updatedAt: string | null }>()
  for (const row of caseRows) {
    cases.set(text(row.tin), {
      status: text(row.status) as CaseStatus,
      note: text(row.officer_note),
      updatedAt: text(row.updated_at),
    })
  }

  const taxpayers = new Map<string, TaxpayerDashboardRow>()
  const sourceCounts: Record<string, number> = {}
  for (const row of sourceRows) {
    sourceCounts[row.sheet_key] = (sourceCounts[row.sheet_key] ?? 0) + 1
    if (!row.tin) continue

    let taxpayer = taxpayers.get(row.tin)
    if (!taxpayer) {
      const savedScore = scores.get(row.tin)
      const savedCase = cases.get(row.tin)
      taxpayer = {
        tin: row.tin,
        name: row.tin,
        sector: "",
        taxYear: "",
        revenue: 0,
        taxableIncome: 0,
        refundClaimed: 0,
        relatedPartyCharges: 0,
        foreignPayments: 0,
        importedServicesVatDeclared: 0,
        grossMarginPct: 0,
        sourceCounts: {},
        score: savedScore?.score ?? null,
        scoreStatus:
          savedScore?.status === "scored"
            ? "scored"
            : savedScore?.status === "error"
              ? "error"
              : savedScore?.status === "not_evaluable"
                ? "not_evaluable"
                : "unscored",
        scoreError: savedScore?.error ?? null,
        caseStatus: savedCase?.status ?? "New",
        officerNote: savedCase?.note ?? "",
        caseUpdatedAt: savedCase?.updatedAt ?? null,
      }
      taxpayers.set(row.tin, taxpayer)
    }

    taxpayer.sourceCounts[row.sheet_key] = (taxpayer.sourceCounts[row.sheet_key] ?? 0) + 1
    const data = asRecord(JSON.parse(row.data_json))
    if (row.sheet_key === "taxpayers") {
      if (typeof data.name === "string" && data.name.trim()) taxpayer.name = data.name.trim()
      if (typeof data.sector === "string") taxpayer.sector = data.sector
      if (data.tax_year !== null && data.tax_year !== undefined) taxpayer.taxYear = String(data.tax_year)
      taxpayer.revenue = asNumber(data.revenue, "revenue")
      taxpayer.taxableIncome = asNumber(data.taxable_income, "taxable_income")
      taxpayer.refundClaimed = asNumber(data.refund_claimed, "refund_claimed")
      taxpayer.relatedPartyCharges = asNumber(data.related_party_charges, "related_party_charges")
      taxpayer.foreignPayments = asNumber(data.foreign_payments, "foreign_payments")
      taxpayer.importedServicesVatDeclared = asNumber(
        data.imported_services_vat_declared,
        "imported_services_vat_declared",
      )
      taxpayer.grossMarginPct = asNumber(data.gross_margin_pct, "gross_margin_pct")
    }
    if (row.sheet_key === "foreign_services") {
      taxpayer.foreignPayments += asNumber(data.amount, "foreign service amount")
      taxpayer.importedServicesVatDeclared += asNumber(
        data.imported_services_vat_declared,
        "imported_services_vat_declared",
      )
    }
    if (row.sheet_key === "related_parties") {
      taxpayer.relatedPartyCharges += asNumber(data.related_party_charges ?? data.amount, "related party charges")
    }
  }

  const taxpayerRows = [...taxpayers.values()].sort((left, right) => {
    const leftScore = left.score?.risk_score ?? -1
    const rightScore = right.score?.risk_score ?? -1
    return rightScore - leftScore || left.name.localeCompare(right.name)
  })
  const scored = taxpayerRows.filter((taxpayer) => taxpayer.score)
  const summary: DashboardSummary = {
    taxpayers: taxpayerRows.length,
    records: activeImport.recordCount,
    scored: scored.length,
    highPriority: scored.filter((taxpayer) => taxpayer.score?.priority === "High priority").length,
    needsReview: scored.filter((taxpayer) => taxpayer.score?.priority === "Needs review").length,
    informational: scored.filter((taxpayer) => taxpayer.score?.priority === "Informational").length,
    flagged: scored.filter((taxpayer) => (taxpayer.score?.flags.length ?? 0) > 0).length,
    averageConfidence: scored.length
      ? scored.reduce((sum, taxpayer) => sum + (taxpayer.score?.data_confidence ?? 0), 0) / scored.length
      : 0,
    potentialExposure: scored.reduce((sum, taxpayer) => sum + (taxpayer.score?.potential_exposure ?? 0), 0),
    refundClaims: taxpayerRows.reduce((sum, taxpayer) => sum + taxpayer.refundClaimed, 0),
  }

  return {
    imports,
    activeImportId: activeImport.id,
    activeImport,
    summary,
    sourceCounts,
    taxpayers: taxpayerRows,
  }
}
