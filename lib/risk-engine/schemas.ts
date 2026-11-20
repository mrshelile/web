import { ProfileValidationError, RiskEngineError } from "./errors"
import type {
  CreditNote,
  EngineHealth,
  Evidence,
  MerchantStatement,
  PurchaseInvoice,
  RiskFlag,
  ScoreResult,
  TaxpayerProfile,
  Trade,
  VatReturn,
} from "./types"

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function fail(error: typeof ProfileValidationError | typeof RiskEngineError, path: string, message: string): never {
  const description = `${path} ${message}`
  throw error === ProfileValidationError
    ? new ProfileValidationError(description)
    : new RiskEngineError("ENGINE_INVALID_RESPONSE", description)
}

function expectRecord(value: unknown, path: string, error: typeof ProfileValidationError | typeof RiskEngineError): JsonRecord {
  if (!isRecord(value)) fail(error, path, "must be an object")
  return value
}

function allowKeys(
  value: JsonRecord,
  allowed: readonly string[],
  path: string,
  error: typeof ProfileValidationError | typeof RiskEngineError,
): void {
  const allowedSet = new Set(allowed)
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key))
  if (unexpected) fail(error, `${path}.${unexpected}`, "is not supported")
}

function readString(value: unknown, path: string, error: typeof ProfileValidationError | typeof RiskEngineError, nullable: true): string | null
function readString(value: unknown, path: string, error: typeof ProfileValidationError | typeof RiskEngineError, nullable?: false): string
function readString(
  value: unknown,
  path: string,
  error: typeof ProfileValidationError | typeof RiskEngineError,
  nullable = false,
): string | null {
  if ((value === undefined || value === null) && nullable) return null
  if (typeof value !== "string") fail(error, path, "must be a string")
  return value
}

function readNumber(
  value: unknown,
  path: string,
  error: typeof ProfileValidationError | typeof RiskEngineError,
  fallback?: number,
): number {
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== "number" || !Number.isFinite(value)) fail(error, path, "must be a finite number")
  return value
}

function readBoolean(
  value: unknown,
  path: string,
  error: typeof ProfileValidationError | typeof RiskEngineError,
  fallback?: boolean,
): boolean {
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== "boolean") fail(error, path, "must be a boolean")
  return value
}

function readArray(value: unknown, path: string, error: typeof ProfileValidationError | typeof RiskEngineError): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail(error, path, "must be an array")
  return value
}

function readOptionalString(
  record: JsonRecord,
  key: string,
  path: string,
  error: typeof ProfileValidationError | typeof RiskEngineError,
): string | null {
  return readString(record[key], `${path}.${key}`, error, true)
}

function parseVatReturn(value: unknown, index: number): VatReturn {
  const path = `vat_returns[${index}]`
  const row = expectRecord(value, path, ProfileValidationError)
  allowKeys(row, ["period", "input_vat", "output_vat", "net_vat", "declared_turnover"], path, ProfileValidationError)
  return {
    period: readString(row.period, `${path}.period`, ProfileValidationError),
    input_vat: readNumber(row.input_vat, `${path}.input_vat`, ProfileValidationError, 0),
    output_vat: readNumber(row.output_vat, `${path}.output_vat`, ProfileValidationError, 0),
    net_vat: readNumber(row.net_vat, `${path}.net_vat`, ProfileValidationError, 0),
    declared_turnover: readNumber(row.declared_turnover, `${path}.declared_turnover`, ProfileValidationError, 0),
  }
}

function parsePurchaseInvoice(value: unknown, index: number): PurchaseInvoice {
  const path = `lekuka_purchase_invoices[${index}]`
  const row = expectRecord(value, path, ProfileValidationError)
  allowKeys(row, ["invoice_id", "supplier_tin", "vat_amount", "matched", "quarantined"], path, ProfileValidationError)
  return {
    invoice_id: readOptionalString(row, "invoice_id", path, ProfileValidationError),
    supplier_tin: readOptionalString(row, "supplier_tin", path, ProfileValidationError),
    vat_amount: readNumber(row.vat_amount, `${path}.vat_amount`, ProfileValidationError, 0),
    matched: readBoolean(row.matched, `${path}.matched`, ProfileValidationError, false),
    quarantined: readBoolean(row.quarantined, `${path}.quarantined`, ProfileValidationError, false),
  }
}

function parseMerchantStatement(value: unknown, index: number): MerchantStatement {
  const path = `merchant_statements[${index}]`
  const row = expectRecord(value, path, ProfileValidationError)
  allowKeys(row, ["amount"], path, ProfileValidationError)
  return { amount: readNumber(row.amount, `${path}.amount`, ProfileValidationError, 0) }
}

function parseCreditNote(value: unknown, index: number): CreditNote {
  const path = `lekuka_credit_notes[${index}]`
  const row = expectRecord(value, path, ProfileValidationError)
  allowKeys(row, ["note_id", "amount", "quarantined"], path, ProfileValidationError)
  return {
    note_id: readOptionalString(row, "note_id", path, ProfileValidationError),
    amount: readNumber(row.amount, `${path}.amount`, ProfileValidationError, 0),
    quarantined: readBoolean(row.quarantined, `${path}.quarantined`, ProfileValidationError, false),
  }
}

function parseTrade(value: unknown, index: number): Trade {
  const path = `trades[${index}]`
  const row = expectRecord(value, path, ProfileValidationError)
  allowKeys(row, ["counterparty_tin", "amount", "related"], path, ProfileValidationError)
  return {
    counterparty_tin: readOptionalString(row, "counterparty_tin", path, ProfileValidationError),
    amount: readNumber(row.amount, `${path}.amount`, ProfileValidationError, 0),
    related: readBoolean(row.related, `${path}.related`, ProfileValidationError, false),
  }
}

const profileKeys = [
  "tin",
  "name",
  "vat_returns",
  "lekuka_source_available",
  "lekuka_purchase_invoices",
  "lekuka_invoices",
  "merchant_statements",
  "lekuka_credit_notes",
  "credit_notes",
  "trades",
  "bank_transactions",
  "mpesa_statements",
] as const

export function parseTaxpayerProfile(input: unknown): TaxpayerProfile {
  const profile = expectRecord(input, "profile", ProfileValidationError)
  allowKeys(profile, profileKeys, "profile", ProfileValidationError)
  if ("bank_transactions" in profile || "mpesa_statements" in profile) {
    throw new ProfileValidationError("Bank and M-Pesa sources are not accepted")
  }
  if ("lekuka_purchase_invoices" in profile && "lekuka_invoices" in profile) {
    throw new ProfileValidationError("Provide only one of lekuka_purchase_invoices or lekuka_invoices")
  }
  if ("lekuka_credit_notes" in profile && "credit_notes" in profile) {
    throw new ProfileValidationError("Provide only one of lekuka_credit_notes or credit_notes")
  }

  const invoices = profile.lekuka_purchase_invoices ?? profile.lekuka_invoices
  const creditNotes = profile.lekuka_credit_notes ?? profile.credit_notes
  return {
    tin: readString(profile.tin, "profile.tin", ProfileValidationError, true),
    name: readString(profile.name, "profile.name", ProfileValidationError, true),
    vat_returns: readArray(profile.vat_returns, "profile.vat_returns", ProfileValidationError).map(parseVatReturn),
    lekuka_source_available: readBoolean(
      profile.lekuka_source_available,
      "profile.lekuka_source_available",
      ProfileValidationError,
      false,
    ),
    lekuka_purchase_invoices: readArray(invoices, "profile.lekuka_purchase_invoices", ProfileValidationError).map(parsePurchaseInvoice),
    merchant_statements: readArray(profile.merchant_statements, "profile.merchant_statements", ProfileValidationError).map(parseMerchantStatement),
    lekuka_credit_notes: readArray(creditNotes, "profile.lekuka_credit_notes", ProfileValidationError).map(parseCreditNote),
    trades: readArray(profile.trades, "profile.trades", ProfileValidationError).map(parseTrade),
  }
}

function readEvidence(value: unknown, index: number): Evidence {
  const path = `flags[${index}].evidence`
  const evidence = expectRecord(value, path, RiskEngineError)
  allowKeys(evidence, ["source", "record_ref", "detail"], path, RiskEngineError)
  return {
    source: readString(evidence.source, `${path}.source`, RiskEngineError) as string,
    record_ref: readString(evidence.record_ref, `${path}.record_ref`, RiskEngineError) as string,
    detail: readString(evidence.detail, `${path}.detail`, RiskEngineError) as string,
  }
}

function readFlag(value: unknown, index: number): RiskFlag {
  const path = `flags[${index}]`
  const flag = expectRecord(value, path, RiskEngineError)
  allowKeys(flag, ["rule_id", "name", "triggered", "severity", "exposure", "summary", "evidence"], path, RiskEngineError)
  const severity = readNumber(flag.severity, `${path}.severity`, RiskEngineError)
  const exposure = readNumber(flag.exposure, `${path}.exposure`, RiskEngineError)
  if (severity < 0 || severity > 1) fail(RiskEngineError, `${path}.severity`, "must be between 0 and 1")
  if (exposure < 0) fail(RiskEngineError, `${path}.exposure`, "must be non-negative")
  return {
    rule_id: readString(flag.rule_id, `${path}.rule_id`, RiskEngineError),
    name: readString(flag.name, `${path}.name`, RiskEngineError),
    triggered: readBoolean(flag.triggered, `${path}.triggered`, RiskEngineError),
    severity,
    exposure,
    summary: readString(flag.summary, `${path}.summary`, RiskEngineError),
    evidence: readArray(flag.evidence, `${path}.evidence`, RiskEngineError).map(readEvidence),
  }
}

export function parseScoreResult(input: unknown): ScoreResult {
  const result = expectRecord(input, "score", RiskEngineError)
  allowKeys(
    result,
    ["tin", "name", "rule_version", "risk_score", "data_confidence", "confidence_notes", "potential_exposure", "flags", "advisory", "priority"],
    "score",
    RiskEngineError,
  )

  const riskScore = readNumber(result.risk_score, "risk_score", RiskEngineError)
  const confidence = readNumber(result.data_confidence, "data_confidence", RiskEngineError)
  const exposure = readNumber(result.potential_exposure, "potential_exposure", RiskEngineError)
  const priority = readString(result.priority, "priority", RiskEngineError)
  if (!Number.isInteger(riskScore) || riskScore < 0 || riskScore > 100) {
    fail(RiskEngineError, "risk_score", "must be an integer between 0 and 100")
  }
  if (confidence < 0 || confidence > 1) fail(RiskEngineError, "data_confidence", "must be between 0 and 1")
  if (exposure < 0) fail(RiskEngineError, "potential_exposure", "must be non-negative")
  if (priority !== "High priority" && priority !== "Needs review" && priority !== "Informational") {
    fail(RiskEngineError, "priority", "is not a recognized value")
  }

  return {
    tin: readString(result.tin, "tin", RiskEngineError, true),
    name: readString(result.name, "name", RiskEngineError, true),
    rule_version: readString(result.rule_version, "rule_version", RiskEngineError),
    risk_score: riskScore,
    data_confidence: confidence,
    confidence_notes: readArray(result.confidence_notes, "confidence_notes", RiskEngineError).map((item, index) =>
      readString(item, `confidence_notes[${index}]`, RiskEngineError),
    ),
    potential_exposure: exposure,
    flags: readArray(result.flags, "flags", RiskEngineError).map(readFlag),
    advisory: readString(result.advisory, "advisory", RiskEngineError),
    priority,
  }
}

export function parseEngineHealth(input: unknown): EngineHealth {
  const result = expectRecord(input, "health", RiskEngineError)
  allowKeys(result, ["ok", "rule_version"], "health", RiskEngineError)
  return {
    ok: readBoolean(result.ok, "health.ok", RiskEngineError),
    rule_version: readString(result.rule_version, "health.rule_version", RiskEngineError),
  }
}
