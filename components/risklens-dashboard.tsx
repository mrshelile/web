"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import type { CaseStatus, DashboardData, TaxpayerDashboardRow } from "@/lib/data/types"

type DashboardTab = "overview" | "worklist" | "refunds" | "mne" | "recovery" | "imports"
type EngineHealth = { ok: boolean; rule_version: string }
type Scenario = { name: string; adjustment: number; auditSuccess: number; collectionRate: number }

const navigation: Array<{ id: DashboardTab; label: string; marker: string }> = [
  { id: "overview", label: "Overview", marker: "OV" },
  { id: "worklist", label: "Audit worklist", marker: "AU" },
  { id: "refunds", label: "VAT refund review", marker: "VA" },
  { id: "mne", label: "MNE screening", marker: "MN" },
  { id: "recovery", label: "Recovery scenarios", marker: "RC" },
  { id: "imports", label: "Data & imports", marker: "DA" },
]
const emptyTaxpayers: TaxpayerDashboardRow[] = []

const initialScenarios: Scenario[] = [
  { name: "Conservative", adjustment: 0, auditSuccess: 0, collectionRate: 0 },
  { name: "Base case", adjustment: 0, auditSuccess: 0, collectionRate: 0 },
  { name: "Optimistic", adjustment: 0, auditSuccess: 0, collectionRate: 0 },
]

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-LS", { maximumFractionDigits: 0 }).format(value)
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value))
}

function titleFor(tab: DashboardTab): { title: string; subtitle: string } {
  const copy: Record<DashboardTab, { title: string; subtitle: string }> = {
    overview: {
      title: "Risk intelligence overview",
      subtitle: "Evidence-led screening across your imported tax records.",
    },
    worklist: {
      title: "Audit worklist",
      subtitle: "Review and document leads; a risk flag is not a finding of wrongdoing.",
    },
    refunds: {
      title: "VAT refund review",
      subtitle: "Inspect refund claims alongside the source coverage available for each taxpayer.",
    },
    mne: {
      title: "Multinational screening",
      subtitle: "Review related-party and cross-border indicators without treating them as scored rules.",
    },
    recovery: {
      title: "Recovery scenarios",
      subtitle: "Explore editable assumptions; these estimates are not assessed or collected revenue.",
    },
    imports: {
      title: "Data & imports",
      subtitle: "Load approved workbooks and inspect the records stored in the local SQLite database.",
    },
  }
  return copy[tab]
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback
  const record = payload as Record<string, unknown>
  if (typeof record.error === "string") return record.error
  if (typeof record.error === "object" && record.error !== null && "message" in record.error) {
    const message = (record.error as { message?: unknown }).message
    if (typeof message === "string") return message
  }
  return fallback
}

function riskClass(priority: string): string {
  if (priority === "High priority") return "priority-high"
  if (priority === "Needs review") return "priority-review"
  return "priority-info"
}

function sourceLabel(key: string): string {
  const labels: Record<string, string> = {
    taxpayers: "Taxpayer profiles",
    vat_returns: "VAT returns",
    purchase_invoices: "Purchase invoices",
    merchant_statements: "Merchant statements",
    credit_notes: "Credit notes",
    trades: "Trade records",
    withholding_tax: "Withholding tax",
    customs: "Customs",
    foreign_services: "Foreign services",
    payroll: "Payroll",
    related_parties: "Related parties",
  }
  return labels[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function RiskLensDashboard() {
  const [tab, setTab] = useState<DashboardTab>("overview")
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [health, setHealth] = useState<EngineHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [busyTin, setBusyTin] = useState<string | null>(null)
  const [expandedTin, setExpandedTin] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [notice, setNotice] = useState("")
  const [pageError, setPageError] = useState("")
  const [caseCountOverride, setCaseCountOverride] = useState<number | null>(null)
  const [target, setTarget] = useState(0)
  const [scenarios, setScenarios] = useState(initialScenarios)

  const loadDashboard = useCallback(async (importId?: string): Promise<DashboardData> => {
    const query = importId ? `?importId=${encodeURIComponent(importId)}` : ""
    const response = await fetch(`/api/data/dashboard${query}`, { cache: "no-store" })
    const payload: unknown = await response.json()
    if (!response.ok) throw new Error(errorMessage(payload, "Unable to load dashboard data."))
    const next = payload as DashboardData
    setDashboard(next)
    return next
  }, [])

  const loadHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/risk/health", { cache: "no-store" })
      if (!response.ok) {
        setHealth(null)
        return
      }
      setHealth((await response.json()) as EngineHealth)
    } catch {
      setHealth(null)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      fetch("/api/data/dashboard", { cache: "no-store" }).then(async (response) => {
        const payload: unknown = await response.json()
        if (!response.ok) throw new Error(errorMessage(payload, "Unable to load dashboard data."))
        return payload as DashboardData
      }),
      fetch("/api/risk/health", { cache: "no-store" })
        .then(async (response) => (response.ok ? ((await response.json()) as EngineHealth) : null))
        .catch(() => null),
    ])
      .then(([nextDashboard, engineHealth]) => {
        if (!active) return
        setDashboard(nextDashboard)
        setHealth(engineHealth)
        setCaseCountOverride(nextDashboard.summary.highPriority)
      })
      .catch((error: unknown) => {
        if (active) setPageError(error instanceof Error ? error.message : "Unable to load dashboard data.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const selectedCopy = titleFor(tab)
  const taxpayers = dashboard?.taxpayers ?? emptyTaxpayers
  const visibleTaxpayers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return taxpayers.filter((taxpayer) => {
      if (tab === "refunds" && taxpayer.refundClaimed <= 0) return false
      if (tab === "mne" && taxpayer.relatedPartyCharges <= 0 && taxpayer.foreignPayments <= 0) return false
      if (tab === "worklist" && taxpayer.scoreStatus === "not_evaluable") return false
      return !term || taxpayer.name.toLowerCase().includes(term) || taxpayer.tin.toLowerCase().includes(term)
    })
  }, [search, tab, taxpayers])

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedFile) return
    const form = event.currentTarget
    setUploading(true)
    setPageError("")
    setNotice("")
    const formData = new FormData()
    formData.set("file", selectedFile)
    try {
      const response = await fetch("/api/data/imports", { method: "POST", body: formData })
      const payload: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, "Workbook import failed."))
      const record = payload as { import: { id: string; taxpayerCount: number; recordCount: number } }
      const next = await loadDashboard(record.import.id)
      setCaseCountOverride(next.summary.highPriority)
      setSelectedFile(null)
      form.reset()
      setTab("overview")
      setNotice(
        `Imported ${formatNumber(record.import.recordCount)} rows for ${formatNumber(record.import.taxpayerCount)} taxpayers. Records are saved in local SQLite.`,
      )
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Workbook import failed.")
    } finally {
      setUploading(false)
    }
  }

  async function selectImport(importId: string) {
    setLoading(true)
    setPageError("")
    try {
      const next = await loadDashboard(importId)
      setCaseCountOverride(next.summary.highPriority)
      setExpandedTin(null)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load this import.")
    } finally {
      setLoading(false)
    }
  }

  async function runScore(tin: string) {
    if (!dashboard?.activeImportId) return
    setBusyTin(tin)
    setPageError("")
    setNotice("")
    try {
      const response = await fetch(
        `/api/data/imports/${encodeURIComponent(dashboard.activeImportId)}/score`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tin }),
        },
      )
      const payload: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, "Risk scoring failed."))
      const next = await loadDashboard(dashboard.activeImportId)
      setCaseCountOverride(next.summary.highPriority)
      setNotice(`R1–R5 screening completed for ${tin}. Review its evidence before taking action.`)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Risk scoring failed.")
      try {
        await loadDashboard(dashboard.activeImportId)
      } catch {
        setPageError("Scoring failed, and the dashboard could not refresh. Reload the page to retry.")
      }
    } finally {
      setBusyTin(null)
    }
  }

  async function saveCase(
    tin: string,
    status: CaseStatus,
    officerNote: string,
    taxpayerResponse: string,
    missingEvidence: string,
    officerFinding: string,
    decisionReason: string,
  ) {
    if (!dashboard?.activeImportId) return
    const response = await fetch("/api/data/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        importId: dashboard.activeImportId,
        tin,
        status,
        officerNote,
        taxpayerResponse,
        missingEvidence,
        officerFinding,
        decisionReason,
      }),
    })
    const payload: unknown = await response.json()
    if (!response.ok) throw new Error(errorMessage(payload, "Unable to save case review."))
    await loadDashboard(dashboard.activeImportId)
    setNotice("Case review saved locally.")
  }

  const noImports = !loading && dashboard?.imports.length === 0

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">R</div>
          <div>
            <div className="brand-name">RiskLens</div>
            <div className="brand-caption">TAX INTELLIGENCE</div>
          </div>
        </div>

        <div className="workspace-label">OFFICER WORKSPACE</div>
        <nav className="main-navigation" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={`nav-item ${tab === item.id ? "nav-item-active" : ""}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              <span className="nav-marker">{item.marker}</span>
              <span>{item.label}</span>
              {item.id === "worklist" && dashboard?.summary.highPriority ? (
                <span className="nav-count">{dashboard.summary.highPriority}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="engine-card">
            <span className={`status-dot ${health?.ok ? "status-online" : ""}`} />
            <div>
              <strong>Python engine</strong>
              <span>{health?.ok ? `Connected · ${health.rule_version}` : "Not connected"}</span>
            </div>
            <button className="refresh-button" type="button" aria-label="Refresh engine status" onClick={loadHealth}>
              ↻
            </button>
          </div>
          <div className="profile-block">
            <div className="profile-avatar">RL</div>
            <div className="profile-copy">
              <strong>Local proposal demo</strong>
              <span>SQLite · local workspace</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>RiskLens</span><i>/</i>{selectedCopy.title}</div>
          <div className="topbar-actions">
            {dashboard?.imports.length ? (
              <label className="dataset-select">
                <span>DATASET</span>
                <select
                  aria-label="Active imported workbook"
                  value={dashboard.activeImportId ?? ""}
                  onChange={(event) => void selectImport(event.target.value)}
                >
                  {dashboard.imports.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fileName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <a className="button button-outline button-small" href="/api/data/template">
              <span aria-hidden="true">↓</span> Import template
            </a>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> REVENUE RISK & COMPLIANCE</div>
              <h1>{selectedCopy.title}</h1>
              <p>{selectedCopy.subtitle}</p>
            </div>
            <div className={`engine-pill ${health?.ok ? "engine-pill-online" : ""}`}>
              <span className={`status-dot ${health?.ok ? "status-online" : ""}`} />
              {health?.ok ? "Risk engine connected" : "Risk engine offline"}
            </div>
          </section>

          <div className="prototype-notice">
            <span className="notice-icon">i</span>
            <p><strong>Proposal prototype.</strong> Use synthetic or approved masked data only. Risk flags are audit leads, not proof of wrongdoing. No automated refund, assessment or enforcement decision is made.</p>
          </div>

          {pageError ? (
            <div className="alert alert-error" role="alert">
              <span>{pageError}</span>
              <button type="button" aria-label="Dismiss error" onClick={() => setPageError("")}>×</button>
            </div>
          ) : null}
          {notice ? (
            <div className="alert alert-success" role="status">
              <span>{notice}</span>
              <button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button>
            </div>
          ) : null}

          {noImports ? (
            <EmptyState
              selectedFile={selectedFile}
              uploading={uploading}
              onFileChange={setSelectedFile}
              onSubmit={handleUpload}
            />
          ) : loading ? (
            <div className="loading-panel"><span className="spinner" /> Loading workspace data…</div>
          ) : dashboard ? (
            <>
              {tab === "overview" ? (
                <Overview
                  dashboard={dashboard}
                  health={health}
                  onOpenWorklist={() => setTab("worklist")}
                  onScore={runScore}
                  busyTin={busyTin}
                  expandedTin={expandedTin}
                  onToggleTin={(tin) => setExpandedTin(expandedTin === tin ? null : tin)}
                  onSaveCase={saveCase}
                />
              ) : null}
              {tab === "worklist" || tab === "refunds" ? (
                <section className="panel data-panel">
                  <div className="panel-heading panel-heading-wrap">
                    <div>
                      <div className="section-kicker">{tab === "refunds" ? "REFUND CLAIMANTS" : "PRIORITIZED REVIEW"}</div>
                      <h2>{tab === "refunds" ? "Refund claim review" : "Taxpayer review queue"}</h2>
                      <p>
                        {tab === "refunds"
                          ? "Refund amounts come from the workbook. R1–R5 does not decide refund eligibility."
                          : "Score records individually and review the engine evidence before making a decision."}
                      </p>
                    </div>
                    <div className="table-search">
                      <span aria-hidden="true">⌕</span>
                      <input
                        aria-label="Search taxpayers"
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search TIN or name"
                        value={search}
                      />
                    </div>
                  </div>
                  <TaxpayerTable
                    rows={visibleTaxpayers}
                    importId={dashboard.activeImportId}
                    engineOnline={Boolean(health?.ok)}
                    busyTin={busyTin}
                    expandedTin={expandedTin}
                    onScore={runScore}
                    onToggleTin={(tin) => setExpandedTin(expandedTin === tin ? null : tin)}
                    onSaveCase={saveCase}
                    mode={tab === "refunds" ? "refunds" : "worklist"}
                  />
                </section>
              ) : null}
              {tab === "mne" ? <MneScreen taxpayers={visibleTaxpayers} search={search} onSearch={setSearch} /> : null}
              {tab === "recovery" ? (
                <RecoveryScreen
                  highPriority={dashboard.summary.highPriority}
                  caseCountOverride={caseCountOverride ?? dashboard.summary.highPriority}
                  setCaseCountOverride={setCaseCountOverride}
                  target={target}
                  setTarget={setTarget}
                  scenarios={scenarios}
                  setScenarios={setScenarios}
                />
              ) : null}
              {tab === "imports" ? (
                <ImportsScreen
                  dashboard={dashboard}
                  selectedFile={selectedFile}
                  uploading={uploading}
                  onFileChange={setSelectedFile}
                  onSubmit={handleUpload}
                />
              ) : null}
              <footer className="page-footer">
                <span>RiskLens · Proposal prototype · SQLite local storage</span>
                <span>Human review required · No findings are automated</span>
              </footer>
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function EmptyState({
  selectedFile,
  uploading,
  onFileChange,
  onSubmit,
}: {
  selectedFile: File | null
  uploading: boolean
  onFileChange: (file: File | null) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <section className="empty-workspace">
      <div className="empty-orbit"><span>RL</span></div>
      <div className="section-kicker">YOUR WORKSPACE IS READY</div>
      <h2>Start with an approved dataset</h2>
      <p>Upload an Excel workbook to build a local taxpayer worklist, review source quality and run available R1–R5 checks.</p>
      <form className="upload-form upload-form-empty" onSubmit={onSubmit}>
        <label className="file-picker">
          <input
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            type="file"
          />
          <span className="file-picker-icon">↑</span>
          <span><strong>{selectedFile?.name ?? "Choose an Excel workbook"}</strong><small>{selectedFile ? `${(selectedFile.size / 1024).toFixed(0)} KB · XLSX` : "XLSX format · up to 10 MB"}</small></span>
          <span className="button button-dark">{selectedFile ? "Change file" : "Browse files"}</span>
        </label>
        <button className="button button-primary upload-submit" disabled={!selectedFile || uploading} type="submit">
          {uploading ? "Importing workbook…" : "Import dataset"} <span aria-hidden="true">→</span>
        </button>
      </form>
      <a className="template-link" href="/api/data/template">Download the Excel template <span>↗</span></a>
      <div className="empty-steps">
        <span><b>01</b> Upload template</span><i>→</i><span><b>02</b> Validate records</span><i>→</i><span><b>03</b> Review signals</span>
      </div>
      <p className="privacy-caption">Store TINs as text to preserve leading zeroes. Local SQLite is not encrypted; do not upload confidential live taxpayer data.</p>
    </section>
  )
}

function StatCard({
  label,
  value,
  footnote,
  accent,
  marker,
}: {
  label: string
  value: string
  footnote: string
  accent?: string
  marker: string
}) {
  return (
    <article className={`stat-card ${accent ?? ""}`}>
      <div className="stat-top"><span>{label}</span><span className="stat-marker">{marker}</span></div>
      <strong>{value}</strong>
      <small>{footnote}</small>
    </article>
  )
}

function Overview({
  dashboard,
  health,
  onOpenWorklist,
  onScore,
  busyTin,
  expandedTin,
  onToggleTin,
  onSaveCase,
}: {
  dashboard: DashboardData
  health: EngineHealth | null
  onOpenWorklist: () => void
  onScore: (tin: string) => void
  busyTin: string | null
  expandedTin: string | null
  onToggleTin: (tin: string) => void
  onSaveCase: (
    tin: string,
    status: CaseStatus,
    note: string,
    taxpayerResponse: string,
    missingEvidence: string,
    officerFinding: string,
    decisionReason: string,
  ) => Promise<void>
}) {
  const { summary } = dashboard
  const maxCases = Math.max(summary.highPriority, summary.needsReview, summary.informational, 1)
  const sourceEntries = Object.entries(dashboard.sourceCounts).sort((left, right) => right[1] - left[1])

  return (
    <>
      <div className="stats-grid">
        <StatCard label="Taxpayers" value={formatNumber(summary.taxpayers)} footnote={`${formatNumber(summary.records)} source rows imported`} marker="01" />
        <StatCard label="High priority" value={formatNumber(summary.highPriority)} footnote="Engine priority · confidence gated" accent="stat-high" marker="02" />
        <StatCard label="Potential exposure" value={formatNumber(summary.potentialExposure)} footnote="Indicative engine exposure · not assessed" accent="stat-exposure" marker="03" />
        <StatCard label="Refund claims" value={formatNumber(summary.refundClaims)} footnote="As provided in workbook · source currency" accent="stat-refund" marker="04" />
      </div>

      <div className="overview-grid">
        <section className="panel risk-distribution">
          <div className="panel-heading">
            <div><div className="section-kicker">SCREENING RESULTS</div><h2>Priority distribution</h2></div>
            <span className="subtle-badge">{formatNumber(summary.scored)} scored</span>
          </div>
          <div className="distribution-chart">
            {[
              { label: "High priority", count: summary.highPriority, className: "bar-high", color: "text-high" },
              { label: "Needs review", count: summary.needsReview, className: "bar-review", color: "text-review" },
              { label: "Informational", count: summary.informational, className: "bar-info", color: "text-info" },
            ].map((item) => (
              <div className="distribution-row" key={item.label}>
                <div className="distribution-label"><span>{item.label}</span><strong className={item.color}>{item.count}</strong></div>
                <div className="distribution-track"><span className={item.className} style={{ width: `${(item.count / maxCases) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="distribution-foot">
            <span>{formatNumber(summary.flagged)} taxpayer(s) with at least one triggered rule</span>
            <span>{Math.round(summary.averageConfidence * 100)}% avg. confidence</span>
          </div>
          <button className="text-button" onClick={onOpenWorklist} type="button">Open audit worklist <span>→</span></button>
        </section>

        <section className="panel source-panel">
          <div className="panel-heading">
            <div><div className="section-kicker">DATA COVERAGE</div><h2>Source records</h2></div>
            <span className="source-total">{formatNumber(summary.records)}</span>
          </div>
          {sourceEntries.length ? (
            <div className="source-list">
              {sourceEntries.slice(0, 7).map(([source, count]) => (
                <div className="source-row" key={source}>
                  <span className="source-indicator" />
                  <span>{sourceLabel(source)}</span>
                  <strong>{formatNumber(count)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="inline-empty"><strong>No workbook imported</strong><span>Import records to populate source coverage.</span></div>
          )}
          <div className="source-foot">
            <span className={`engine-mini-dot ${health?.ok ? "engine-online" : ""}`} />
            <span>R1–R5 engine {health?.ok ? "available" : "unavailable"}</span>
            <span className="source-foot-version">{health?.ok ? health.rule_version : "—"}</span>
          </div>
        </section>
      </div>

      <section className="panel queue-panel">
        <div className="panel-heading panel-heading-wrap">
          <div><div className="section-kicker">REVIEW REQUIRED</div><h2>Priority taxpayer queue</h2><p>Results are advisory. Verify evidence and consider lawful explanations.</p></div>
          <button className="button button-outline button-small" onClick={onOpenWorklist} type="button">View all records <span>→</span></button>
        </div>
        <TaxpayerTable
          rows={dashboard.taxpayers.slice(0, 5)}
          importId={dashboard.activeImportId}
          engineOnline={Boolean(health?.ok)}
          busyTin={busyTin}
          expandedTin={expandedTin}
          onScore={onScore}
          onToggleTin={onToggleTin}
          onSaveCase={onSaveCase}
          mode="worklist"
          compact
        />
      </section>

      {dashboard.activeImport ? (
        <div className="import-meta-line">
          <span className="meta-icon">▤</span>
          <span>Active dataset <strong>{dashboard.activeImport.fileName}</strong></span>
          <span>{formatDate(dashboard.activeImport.uploadedAt)}</span>
          <span>{formatNumber(dashboard.activeImport.worksheetCount)} worksheets</span>
        </div>
      ) : null}
    </>
  )
}

function TaxpayerTable({
  rows,
  importId,
  engineOnline,
  busyTin,
  expandedTin,
  onScore,
  onToggleTin,
  onSaveCase,
  mode,
  compact = false,
}: {
  rows: TaxpayerDashboardRow[]
  importId: string | null
  engineOnline: boolean
  busyTin: string | null
  expandedTin: string | null
  onScore: (tin: string) => void
  onToggleTin: (tin: string) => void
  onSaveCase: (
    tin: string,
    status: CaseStatus,
    note: string,
    taxpayerResponse: string,
    missingEvidence: string,
    officerFinding: string,
    decisionReason: string,
  ) => Promise<void>
  mode: "worklist" | "refunds"
  compact?: boolean
}) {
  if (!rows.length) {
    return (
      <div className="table-empty">
        <span className="empty-table-icon">⌕</span>
        <strong>No matching records</strong>
        <span>Check your search or upload a workbook with the relevant source rows.</span>
      </div>
    )
  }

  return (
    <div className="table-scroll">
      <table className="taxpayer-table">
        <thead>
          <tr>
            <th>Taxpayer</th>
            <th>{mode === "refunds" ? "Refund claimed" : "Risk score"}</th>
            <th>{mode === "refunds" ? "VAT source rows" : "Data confidence"}</th>
            <th>Case status</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((taxpayer) => (
            <TableRows
              key={taxpayer.tin}
              taxpayer={taxpayer}
              importId={importId}
              engineOnline={engineOnline}
              busy={busyTin === taxpayer.tin}
              expanded={expandedTin === taxpayer.tin}
              onScore={() => onScore(taxpayer.tin)}
              onToggle={() => onToggleTin(taxpayer.tin)}
              onSaveCase={(status, note, taxpayerResponse, missingEvidence, officerFinding, decisionReason) =>
                onSaveCase(
                  taxpayer.tin,
                  status,
                  note,
                  taxpayerResponse,
                  missingEvidence,
                  officerFinding,
                  decisionReason,
                )
              }
              mode={mode}
              compact={compact}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TableRows({
  taxpayer,
  importId,
  engineOnline,
  busy,
  expanded,
  onScore,
  onToggle,
  onSaveCase,
  mode,
  compact,
}: {
  taxpayer: TaxpayerDashboardRow
  importId: string | null
  engineOnline: boolean
  busy: boolean
  expanded: boolean
  onScore: () => void
  onToggle: () => void
  onSaveCase: (
    status: CaseStatus,
    note: string,
    taxpayerResponse: string,
    missingEvidence: string,
    officerFinding: string,
    decisionReason: string,
  ) => Promise<void>
  mode: "worklist" | "refunds"
  compact: boolean
}) {
  const canScore = Boolean(importId) && taxpayer.scoreStatus !== "not_evaluable"
  const score = taxpayer.score
  return (
    <>
      <tr className={expanded ? "row-expanded" : ""}>
        <td>
          <button className="taxpayer-cell" onClick={onToggle} type="button">
            <span className="company-avatar">{taxpayer.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{taxpayer.name}</strong><small>{taxpayer.tin}{taxpayer.sector ? ` · ${taxpayer.sector}` : ""}</small></span>
          </button>
        </td>
        <td>
          {mode === "refunds" ? (
            <strong className="amount-cell">{formatNumber(taxpayer.refundClaimed)}</strong>
          ) : score ? (
            <span className="score-cell"><strong>{score.risk_score}</strong><span className={`priority-pill ${riskClass(score.priority)}`}>{score.priority}</span></span>
          ) : (
            <span className={`score-state score-state-${taxpayer.scoreStatus}`}>
              {taxpayer.scoreStatus === "error" ? "Retry scoring" : taxpayer.scoreStatus === "not_evaluable" ? "Not evaluable" : "Not scored"}
            </span>
          )}
        </td>
        <td>
          {mode === "refunds" ? (
            <span className="source-chip">{taxpayer.sourceCounts.vat_returns ?? 0} VAT rows</span>
          ) : score ? (
            <span className="confidence-cell">
              <span className="confidence-track"><i style={{ width: `${Math.round(score.data_confidence * 100)}%` }} /></span>
              <strong>{Math.round(score.data_confidence * 100)}%</strong>
            </span>
          ) : (
            <span className="muted-cell">{taxpayer.scoreError ?? `${Object.values(taxpayer.sourceCounts).reduce((sum, count) => sum + count, 0)} source rows`}</span>
          )}
        </td>
        <td><span className={`case-status case-${taxpayer.caseStatus.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{taxpayer.caseStatus}</span></td>
        <td className="row-action-cell">
          {mode === "worklist" && !score && canScore ? (
            <button className="score-button" disabled={!engineOnline || busy} onClick={onScore} type="button">
              {busy ? "Scoring…" : "Run R1–R5"}
            </button>
          ) : (
            <button className="row-open" aria-label={`Open ${taxpayer.name}`} onClick={onToggle} type="button">↗</button>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr className="detail-row">
          <td colSpan={5}>
            <div className="taxpayer-detail">
              <div className="detail-summary">
                <div className="detail-heading">
                  <div><div className="section-kicker">TAXPAYER REVIEW · {taxpayer.taxYear || "PERIOD NOT PROVIDED"}</div><h3>{taxpayer.name}</h3><span>TIN {taxpayer.tin}</span></div>
                  {mode === "worklist" && !score && canScore ? (
                    <button className="button button-primary button-small" disabled={!engineOnline || busy} onClick={onScore} type="button">
                      {busy ? "Scoring…" : "Run R1–R5 screening"}
                    </button>
                  ) : null}
                </div>
                {mode === "refunds" ? (
                  <div className="detail-metrics">
                    <Metric label="Refund claimed" value={formatNumber(taxpayer.refundClaimed)} />
                    <Metric label="Revenue" value={formatNumber(taxpayer.revenue)} />
                    <Metric label="VAT return rows" value={String(taxpayer.sourceCounts.vat_returns ?? 0)} />
                  </div>
                ) : score ? (
                  <>
                    <div className="detail-metrics">
                      <Metric label="Priority" value={score.priority} />
                      <Metric label="Confidence" value={`${Math.round(score.data_confidence * 100)}%`} />
                      <Metric label="Potential exposure" value={formatNumber(score.potential_exposure)} />
                    </div>
                    {score.confidence_notes.length ? (
                      <div className="confidence-notes"><strong>Data limitations</strong><ul>{score.confidence_notes.map((item) => <li key={item}>{item}</li>)}</ul></div>
                    ) : null}
                    {score.flags.length ? (
                      <div className="evidence-list">
                        {score.flags.map((flag) => (
                          <article className="evidence-card" key={flag.rule_id}>
                            <div><span className="flag-id">{flag.rule_id}</span><strong>{flag.name}</strong><span className="flag-exposure">{formatNumber(flag.exposure)} indicative</span></div>
                            <p>{flag.summary}</p>
                            {flag.evidence.map((evidence) => (
                              <small key={`${evidence.source}-${evidence.record_ref}`}>
                                <b>{evidence.source}</b> · {evidence.record_ref} — {evidence.detail}
                              </small>
                            ))}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="inline-empty"><strong>No R1–R5 flags triggered</strong><span>This is not a finding that the taxpayer is compliant; check source completeness.</span></div>
                    )}
                    <p className="advisory-copy">{score.advisory}</p>
                  </>
                ) : (
                  <div className="inline-empty"><strong>{taxpayer.scoreStatus === "not_evaluable" ? "Not evaluable by the current engine" : "No score saved"}</strong><span>{taxpayer.scoreError ?? "No relevant R1–R5 source rows are present. Missing data is not evidence of non-compliance."}</span></div>
                )}
              </div>
              <CaseReview key={`${taxpayer.tin}-${taxpayer.caseUpdatedAt ?? taxpayer.caseStatus}`} taxpayer={taxpayer} onSave={onSaveCase} />
            </div>
            {mode === "refunds" ? (
              <div className="refund-context">
                <strong>Fairness reminder</strong>
                <span>Refund history alone is not adverse. Verify exports, investment, timing, invoices and taxpayer explanations using authorized source evidence.</span>
              </div>
            ) : null}
            {compact ? <span className="sr-only">Compact worklist preview</span> : null}
          </td>
        </tr>
      ) : null}
    </>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="detail-metric"><span>{label}</span><strong>{value}</strong></div>
}

function CaseReview({
  taxpayer,
  onSave,
}: {
  taxpayer: TaxpayerDashboardRow
  onSave: (
    status: CaseStatus,
    note: string,
    taxpayerResponse: string,
    missingEvidence: string,
    officerFinding: string,
    decisionReason: string,
  ) => Promise<void>
}) {
  const [status, setStatus] = useState<CaseStatus>(taxpayer.caseStatus)
  const [note, setNote] = useState(taxpayer.officerNote)
  const [taxpayerResponse, setTaxpayerResponse] = useState(taxpayer.taxpayerResponse)
  const [missingEvidence, setMissingEvidence] = useState(taxpayer.missingEvidence)
  const [officerFinding, setOfficerFinding] = useState(taxpayer.officerFinding)
  const [decisionReason, setDecisionReason] = useState(taxpayer.decisionReason)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function save() {
    setSaving(true)
    setError("")
    try {
      await onSave(status, note, taxpayerResponse, missingEvidence, officerFinding, decisionReason)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this review.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="case-review">
      <div className="section-kicker">OFFICER REVIEW · LOCAL PROTOTYPE</div>
      <label className="field-label">Case status
        <select value={status} onChange={(event) => setStatus(event.target.value as CaseStatus)}>
          <option>New</option><option>Reviewing</option><option>Request information</option><option>Referred</option><option>Closed</option>
        </select>
      </label>
      <label className="field-label">Review note
        <textarea maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="Record evidence checked, context and next action…" value={note} />
      </label>
      <label className="field-label">Taxpayer response / explanation
        <textarea maxLength={2000} onChange={(event) => setTaxpayerResponse(event.target.value)} placeholder="Record the taxpayer's explanation or correction…" value={taxpayerResponse} />
      </label>
      <label className="field-label">Missing evidence
        <textarea maxLength={2000} onChange={(event) => setMissingEvidence(event.target.value)} placeholder="List specific records or documents still required…" value={missingEvidence} />
      </label>
      <label className="field-label">Officer finding
        <textarea maxLength={2000} onChange={(event) => setOfficerFinding(event.target.value)} placeholder="Document facts and the neutral finding…" value={officerFinding} />
      </label>
      <label className="field-label">Decision reason
        <textarea maxLength={2000} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Record the reason for close, referral or further review…" value={decisionReason} />
      </label>
      {taxpayer.caseAuditHistory.length ? (
        <details className="case-audit-history">
          <summary>Audit trail ({taxpayer.caseAuditHistory.length})</summary>
          <ol>
            {taxpayer.caseAuditHistory.slice(0, 10).map((event) => (
              <li key={event.id}>
                <strong>{event.status}</strong>
                <span>{formatDate(event.updatedAt)} · {event.action}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <div className="case-save-row">
        <small>{taxpayer.caseUpdatedAt ? `Last saved ${formatDate(taxpayer.caseUpdatedAt)}` : "No review saved yet"}</small>
        <button className="button button-dark button-small" disabled={saving} onClick={() => void save()} type="button">
          {saving ? "Saving…" : "Save review"}
        </button>
      </div>
      {error ? <div className="field-error" role="alert">{error}</div> : null}
    </div>
  )
}

function MneScreen({
  taxpayers,
  search,
  onSearch,
}: {
  taxpayers: TaxpayerDashboardRow[]
  search: string
  onSearch: (value: string) => void
}) {
  const mneTaxpayers = taxpayers.filter((taxpayer) => taxpayer.relatedPartyCharges > 0 || taxpayer.foreignPayments > 0)
  return (
    <section className="panel data-panel">
      <div className="panel-heading panel-heading-wrap">
        <div>
          <div className="section-kicker">CORPORATE TAX · PROPOSAL INDICATORS</div>
          <h2>Related-party and cross-border data</h2>
          <p>Workbook fields are visible for review; the current R1–R5 VAT engine does not score these indicators.</p>
        </div>
        <div className="table-search"><span aria-hidden="true">⌕</span><input aria-label="Search MNE records" onChange={(event) => onSearch(event.target.value)} placeholder="Search TIN or name" value={search} /></div>
      </div>
      <div className="rule-roadmap-banner">
        <strong>Not scored by current engine</strong>
        <span>Transfer-pricing, persistent-loss, imported-services and WHT rules need separate approved definitions and validation. No adverse inference is drawn from missing information.</span>
      </div>
      {mneTaxpayers.length ? (
        <div className="table-scroll">
          <table className="taxpayer-table mne-table">
          <thead><tr><th>Taxpayer</th><th>Revenue</th><th>Related-party charges</th><th>RP charge / revenue</th><th>Foreign payments</th><th>Gross margin</th><th>Imported-services VAT</th></tr></thead>
            <tbody>{mneTaxpayers.map((taxpayer) => (
              <tr key={taxpayer.tin}>
                <td><div className="taxpayer-cell static"><span className="company-avatar">{taxpayer.name.slice(0, 1).toUpperCase()}</span><span><strong>{taxpayer.name}</strong><small>{taxpayer.tin}{taxpayer.sector ? ` · ${taxpayer.sector}` : ""}</small></span></div></td>
                <td>{formatNumber(taxpayer.revenue)}</td>
                <td>{formatNumber(taxpayer.relatedPartyCharges)}</td>
              <td>{taxpayer.revenue > 0 ? `${((taxpayer.relatedPartyCharges / taxpayer.revenue) * 100).toFixed(1)}%` : "Not evaluable"}</td>
                <td>{formatNumber(taxpayer.foreignPayments)}</td>
                <td>{taxpayer.grossMarginPct ? `${taxpayer.grossMarginPct}%` : "—"}</td>
                <td>{formatNumber(taxpayer.importedServicesVatDeclared)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="table-empty"><span className="empty-table-icon">⌕</span><strong>No MNE indicator data imported</strong><span>Use the Taxpayers worksheet columns for related-party charges, foreign payments and gross margin.</span></div>
      )}
      <div className="policy-footnote">International transactions, losses and recurring refunds are not inherently abusive. Officer review and source evidence are required.</div>
    </section>
  )
}

function RecoveryScreen({
  highPriority,
  caseCountOverride,
  setCaseCountOverride,
  target,
  setTarget,
  scenarios,
  setScenarios,
}: {
  highPriority: number
  caseCountOverride: number
  setCaseCountOverride: (value: number) => void
  target: number
  setTarget: (value: number) => void
  scenarios: Scenario[]
  setScenarios: (value: Scenario[] | ((current: Scenario[]) => Scenario[])) => void
}) {
  return (
    <div className="recovery-layout">
      <section className="panel recovery-inputs">
        <div className="section-kicker">EDITABLE ASSUMPTIONS</div>
        <h2>Build a planning scenario</h2>
        <p>Set assumptions explicitly. Zero values produce no estimate; nothing here represents assessed or collected tax.</p>
        <label className="field-label">Cases selected for audit
          <input min={0} max={1000000} onChange={(event) => setCaseCountOverride(Math.max(0, Number(event.target.value) || 0))} type="number" value={caseCountOverride} />
          <small>{highPriority} high-priority cases currently scored in this dataset.</small>
        </label>
        <label className="field-label">Collection target (optional)
          <input min={0} onChange={(event) => setTarget(Math.max(0, Number(event.target.value) || 0))} type="number" value={target} />
          <small>Enter a planning target using the workbook’s reporting currency.</small>
        </label>
        <div className="scenario-safety"><span>!</span><p>These are illustrative scenarios only. Use RSL-approved assumptions and do not present them as a revenue-loss or recovery forecast.</p></div>
      </section>
      <div className="scenario-cards">
        {scenarios.map((scenario, index) => {
          const estimate = caseCountOverride * scenario.adjustment * (scenario.auditSuccess / 100) * (scenario.collectionRate / 100)
          const progress = target > 0 ? Math.min((estimate / target) * 100, 100) : 0
          return (
            <section className={`panel scenario-card scenario-${index}`} key={scenario.name}>
              <div className="scenario-title"><span className="scenario-index">0{index + 1}</span><div><h3>{scenario.name}</h3><span>Illustrative estimate</span></div></div>
              <div className="scenario-estimate">{formatNumber(estimate)}<small>potential collection · source currency</small></div>
              <label className="field-label">Average adjustment per successful audit
                <input min={0} onChange={(event) => setScenarios((current) => current.map((item) => item.name === scenario.name ? { ...item, adjustment: Math.max(0, Number(event.target.value) || 0) } : item))} type="number" value={scenario.adjustment} />
              </label>
              <div className="scenario-fields">
                <label className="field-label">Audit success %<input min={0} max={100} onChange={(event) => setScenarios((current) => current.map((item) => item.name === scenario.name ? { ...item, auditSuccess: Math.min(100, Math.max(0, Number(event.target.value) || 0)) } : item))} type="number" value={scenario.auditSuccess} /></label>
                <label className="field-label">Collection %<input min={0} max={100} onChange={(event) => setScenarios((current) => current.map((item) => item.name === scenario.name ? { ...item, collectionRate: Math.min(100, Math.max(0, Number(event.target.value) || 0)) } : item))} type="number" value={scenario.collectionRate} /></label>
              </div>
              {target > 0 ? <div className="scenario-progress"><div><span>Target attainment</span><strong>{Math.round(progress)}%</strong></div><i><b style={{ width: `${progress}%` }} /></i></div> : <div className="scenario-progress no-target">Add a target to see indicative attainment.</div>}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function ImportsScreen({
  dashboard,
  selectedFile,
  uploading,
  onFileChange,
  onSubmit,
}: {
  dashboard: DashboardData
  selectedFile: File | null
  uploading: boolean
  onFileChange: (file: File | null) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="imports-layout">
      <section className="panel import-panel">
        <div className="section-kicker">EXCEL WORKBOOK · XLSX</div>
        <h2>Import source data</h2>
        <p>Upload a workbook up to 10 MB. The workbook is validated and persisted in local SQLite before scoring.</p>
        <form className="upload-form" onSubmit={onSubmit}>
          <label className="file-picker file-picker-compact">
            <input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} type="file" />
            <span className="file-picker-icon">↑</span>
            <span><strong>{selectedFile?.name ?? "Select an .xlsx workbook"}</strong><small>{selectedFile ? `${(selectedFile.size / 1024).toFixed(0)} KB` : "Use the RiskLens template for predictable mapping"}</small></span>
          </label>
          <button className="button button-primary" disabled={!selectedFile || uploading} type="submit">{uploading ? "Importing…" : "Validate & import"} <span>→</span></button>
        </form>
        <a className="template-link template-link-left" href="/api/data/template">Download workbook template <span>↗</span></a>
        <div className="import-limits">
          <span>10 MB max</span><span>20 worksheets max</span><span>20,000 rows max</span><span>.xlsx only</span><span>TIN as text</span>
        </div>
      </section>
      <section className="panel import-history">
        <div className="panel-heading"><div><div className="section-kicker">LOCAL SQLITE</div><h2>Import history</h2></div><span className="subtle-badge">{dashboard.imports.length} workbooks</span></div>
        {dashboard.imports.length ? dashboard.imports.map((item) => (
          <div className={`import-history-row ${item.id === dashboard.activeImportId ? "import-current" : ""}`} key={item.id}>
            <div className="file-symbol">XLS</div>
            <div className="import-history-copy"><strong>{item.fileName}</strong><span>{formatDate(item.uploadedAt)} · {item.worksheetCount} worksheets</span></div>
            <div className="import-row-count"><strong>{formatNumber(item.taxpayerCount)}</strong><span>taxpayers</span></div>
            <div className="import-row-count"><strong>{formatNumber(item.recordCount)}</strong><span>rows</span></div>
            {item.id === dashboard.activeImportId ? <span className="current-tag">ACTIVE</span> : null}
          </div>
        )) : <div className="inline-empty"><strong>No imports yet</strong><span>Upload a workbook to create the first local dataset.</span></div>}
        <div className="local-storage-note"><span>i</span><p>Data is stored on this machine in <code>.data/risklens.sqlite</code>. This local prototype does not encrypt the database or provide multi-user access controls.</p></div>
      </section>
      <section className="panel source-coverage-panel">
        <div className="panel-heading"><div><div className="section-kicker">ACTIVE WORKBOOK</div><h2>Worksheet coverage</h2></div><span className="source-total">{formatNumber(dashboard.summary.records)}</span></div>
        {Object.keys(dashboard.sourceCounts).length ? (
          <div className="coverage-grid">
            {Object.entries(dashboard.sourceCounts).sort((left, right) => right[1] - left[1]).map(([source, count]) => (
              <div className="coverage-card" key={source}><span>{sourceLabel(source)}</span><strong>{formatNumber(count)}</strong><small>rows stored</small></div>
            ))}
          </div>
        ) : <div className="inline-empty"><strong>No source coverage yet</strong><span>Import data to see worksheet counts.</span></div>}
      </section>
    </div>
  )
}
