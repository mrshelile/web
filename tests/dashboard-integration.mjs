import assert from "node:assert/strict"
import ExcelJS from "exceljs"

const baseUrl = process.env.RISKLENS_WEB_URL ?? "http://localhost:3000"
const workbook = new ExcelJS.Workbook()
const guide = workbook.addWorksheet("Read Me")
guide.addRow(["RiskLens Excel import guide"])
guide.addRow(["Enter TIN values as text."])

const taxpayers = workbook.addWorksheet("Taxpayers")
taxpayers.addRow([
  "tin",
  "name",
  "tax_year",
  "sector",
  "revenue",
  "taxable_income",
  "refund_claimed",
  "related_party_charges",
  "foreign_payments",
  "gross_margin_pct",
  "imported_services_vat_declared",
])
taxpayers.addRow(["SYNTH-TEST-01", "Synthetic Demo Co", "2026", "Wholesale", 1_500_000, -20_000, 240_000, 310_000, 125_000, 8.5, 0])

const vatReturns = workbook.addWorksheet("VAT Returns")
vatReturns.addRow(["tin", "period", "input_vat", "output_vat", "net_vat", "declared_turnover"])
for (const period of ["2026-01", "2026-02", "2026-03"]) {
  vatReturns.addRow(["SYNTH-TEST-01", period, 100_000, 20_000, -80_000, 150_000])
}

const invoices = workbook.addWorksheet("Purchase Invoices")
invoices.addRow(["tin", "invoice_id", "supplier_tin", "vat_amount", "matched", "quarantined"])
invoices.addRow(["SYNTH-TEST-01", "SYN-INV-1", "SYN-SUP-1", 45_000, true, false])

const merchant = workbook.addWorksheet("Merchant Statements")
merchant.addRow(["tin", "amount"])
merchant.addRow(["SYNTH-TEST-01", 1_200_000])

const notes = workbook.addWorksheet("Credit Notes")
notes.addRow(["tin", "note_id", "amount", "quarantined"])
notes.addRow(["SYNTH-TEST-01", "SYN-CN-1", 90_000, false])

const trades = workbook.addWorksheet("Trades")
trades.addRow(["tin", "counterparty_tin", "amount", "related"])
trades.addRow(["SYNTH-TEST-01", "SYN-RELATED-1", 450_000, true])

const templateResponse = await fetch(`${baseUrl}/api/data/template`)
assert.equal(templateResponse.status, 200, "Excel template endpoint should succeed")
assert.match(templateResponse.headers.get("content-type") ?? "", /spreadsheetml/)
const templateWorkbook = new ExcelJS.Workbook()
await templateWorkbook.xlsx.load(await templateResponse.arrayBuffer())
assert.ok(templateWorkbook.getWorksheet("Taxpayers"), "template should include the taxpayer worksheet")
assert.ok(templateWorkbook.getWorksheet("VAT Returns"), "template should include the VAT worksheet")

const form = new FormData()
form.set(
  "file",
  new Blob([await workbook.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }),
  "risklens-synthetic-integration.xlsx",
)
const uploadResponse = await fetch(`${baseUrl}/api/data/imports`, { method: "POST", body: form })
assert.equal(uploadResponse.status, 201, "valid workbook should be imported")
const upload = await uploadResponse.json()
assert.equal(upload.import.taxpayerCount, 1)
assert.equal(upload.import.recordCount, 8)
assert.equal(upload.dashboard.summary.refundClaims, 240_000)

const dashboardResponse = await fetch(
  `${baseUrl}/api/data/dashboard?importId=${encodeURIComponent(upload.import.id)}`,
)
assert.equal(dashboardResponse.status, 200, "import should persist in SQLite")
const dashboard = await dashboardResponse.json()
assert.equal(dashboard.taxpayers[0].tin, "SYNTH-TEST-01")
assert.equal(dashboard.taxpayers[0].relatedPartyCharges, 310_000)
assert.equal(dashboard.taxpayers[0].sourceCounts.vat_returns, 3)

const scoreResponse = await fetch(
  `${baseUrl}/api/data/imports/${encodeURIComponent(upload.import.id)}/score`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tin: "SYNTH-TEST-01" }),
  },
)
assert.equal(scoreResponse.status, 200, "imported profile should be sent to the Python engine")
const score = await scoreResponse.json()
assert.ok(score.flags.some((flag) => flag.rule_id === "R1"), "synthetic recurring credit should surface R1 evidence")

const caseResponse = await fetch(`${baseUrl}/api/data/cases`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    importId: upload.import.id,
    tin: "SYNTH-TEST-01",
    status: "Reviewing",
    officerNote: "Synthetic evidence review only.",
  }),
})
assert.equal(caseResponse.status, 200, "case review should persist in SQLite")

const refreshedResponse = await fetch(
  `${baseUrl}/api/data/dashboard?importId=${encodeURIComponent(upload.import.id)}`,
)
const refreshed = await refreshedResponse.json()
assert.equal(refreshed.taxpayers[0].scoreStatus, "scored")
assert.equal(refreshed.taxpayers[0].caseStatus, "Reviewing")
assert.equal(refreshed.taxpayers[0].officerNote, "Synthetic evidence review only.")

const invalidWorkbook = new ExcelJS.Workbook()
const invalidTaxpayers = invalidWorkbook.addWorksheet("Taxpayers")
invalidTaxpayers.addRow(["tin", "name", "revenue"])
invalidTaxpayers.addRow(["SYNTH-BAD-01", "Invalid Demo", "not-a-number"])
const invalidForm = new FormData()
invalidForm.set(
  "file",
  new Blob([await invalidWorkbook.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }),
  "invalid-numeric.xlsx",
)
const invalidUpload = await fetch(`${baseUrl}/api/data/imports`, { method: "POST", body: invalidForm })
assert.equal(invalidUpload.status, 400, "invalid numeric fields should be rejected before persistence")
assert.match((await invalidUpload.json()).error, /revenue.*number/i)

const legacyForm = new FormData()
legacyForm.set("file", new Blob(["not an xlsx"]), "legacy.xls")
const legacyUpload = await fetch(`${baseUrl}/api/data/imports`, { method: "POST", body: legacyForm })
assert.equal(legacyUpload.status, 400, "legacy .xls files should receive a clear validation error")

console.log("Dashboard integration passed: template, Excel import, SQLite persistence, Python scoring, and case review")
