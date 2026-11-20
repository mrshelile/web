import ExcelJS from "exceljs"
import { NextResponse } from "next/server"
import { workbookTemplate } from "@/lib/data/workbook"

export const runtime = "nodejs"

const sheetTitles: Record<string, string> = {
  taxpayers: "Taxpayers",
  vat_returns: "VAT Returns",
  purchase_invoices: "Purchase Invoices",
  merchant_statements: "Merchant Statements",
  credit_notes: "Credit Notes",
  trades: "Trades",
  withholding_tax: "Withholding Tax",
  customs: "Customs",
  foreign_services: "Foreign Services",
  payroll: "Payroll",
  related_parties: "Related Parties",
}

export async function GET(): Promise<NextResponse> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "RiskLens"
  workbook.subject = "Synthetic or approved masked tax-risk records"
  workbook.created = new Date()

  const instructions = workbook.addWorksheet("Read Me")
  instructions.addRows([
    ["RiskLens proposal prototype — Excel import guide"],
    ["Use synthetic or approved masked data only. Local SQLite is not encrypted and is not approved for confidential live taxpayer data."],
    ["Enter TIN values as text to preserve leading zeroes. Keep the same TIN spelling in every worksheet."],
    ["Use one row per taxpayer, VAT period or source transaction, as appropriate. Leave unknown values blank; do not estimate or invent them."],
    ["Amount fields must be numeric. Boolean fields accept Yes/No, True/False or 1/0."],
    ["Current Python screening is R1–R5 only. Corporate-tax, WHT, customs, payroll and imported-services sheets are stored for review but are not scored."],
    ["Do not upload bank transactions or M-Pesa statements."],
    ["Supported format: .xlsx. Upload limit: 10 MB, 20 worksheets and 20,000 total data rows."],
  ])
  instructions.getColumn(1).width = 115
  instructions.getColumn(1).alignment = { wrapText: true, vertical: "top" }
  instructions.getRow(1).font = { bold: true, size: 14, color: { argb: "FF153E38" } }
  for (let row = 2; row <= instructions.rowCount; row += 1) {
    instructions.getRow(row).height = 30
  }
  instructions.views = [{ state: "frozen", ySplit: 1 }]

  for (const [sheetKey, columns] of Object.entries(workbookTemplate)) {
    const sheetName = sheetTitles[sheetKey] ?? sheetKey
    const sheet = workbook.addWorksheet(sheetName)
    sheet.addRow([...columns])
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153E38" } }
    sheet.views = [{ state: "frozen", ySplit: 1 }]
    sheet.columns = columns.map((header) => ({ header, width: Math.max(18, header.length + 3) }))
    sheet.getColumn(1).numFmt = "@"
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="risklens-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  })
}
