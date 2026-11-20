import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { internalApiError } from "@/lib/api/errors"
import { getDashboard, listImports, saveWorkbookImport } from "@/lib/data/database"
import { parseExcelWorkbook, WorkbookValidationError } from "@/lib/data/workbook"

const MAX_FILE_BYTES = 10 * 1024 * 1024

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ imports: listImports() })
  } catch (error) {
    return internalApiError(error, "GET", "/api/data/imports")
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > MAX_FILE_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "Workbook exceeds the 10 MB upload limit." }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Upload must use multipart form data." }, { status: 400 })
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an .xlsx workbook to upload." }, { status: 400 })
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "Only .xlsx workbooks are supported. Save legacy .xls files as .xlsx." }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The selected workbook is empty." }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Workbook exceeds the 10 MB upload limit." }, { status: 413 })
  }

  let parsed
  try {
    parsed = await parseExcelWorkbook(await file.arrayBuffer())
  } catch (error) {
    if (error instanceof WorkbookValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return internalApiError(error, "POST", "/api/data/imports")
  }

  const safeFileName = file.name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 180) || "workbook.xlsx"
  try {
    const savedImport = saveWorkbookImport(randomUUID(), safeFileName, parsed)
    return NextResponse.json(
      { import: savedImport, dashboard: getDashboard(savedImport.id) },
      { status: 201 },
    )
  } catch (error) {
    return internalApiError(error, "POST", "/api/data/imports")
  }
}
