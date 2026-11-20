# Unified RiskLens Feature Specification

## Product direction

RiskLens is one tax-intelligence application, not a launcher for separate products. The Next.js application owns the user experience and internal API; the Python service evaluates normalized taxpayer profiles. The browser never calls Python directly.

The attached feature list is the source for the Taxathon prototype and platform roadmap summarized here. The referenced `taxathon_dashboard_v2_readable.html` was not present in the workspace, so this specification is based on the pasted feature list rather than an HTML code review.

## Single-system architecture

```text
Officer browser
    ↓
Next.js application and internal API
    ├── Excel intake, validation and taxpayer workflows
    ├── local SQLite prototype storage
    ├── authorized RSL service integrations (future)
    └── server-only Python engine adapter
            ↓
        Python FastAPI risk engine
            ↓
        score, confidence, priority, exposure, explanations and evidence
            ↓
Next.js application response and officer workspace
```

Engine URL and optional service authentication are server-side deployment settings only; no key value belongs in source control or browser-visible variables. Local development defaults to `http://localhost:8000`.

## Unified officer workflow

1. Import an Excel workbook from the provided template.
2. Validate worksheet headings, TINs, numeric fields and source rows.
3. Group records by taxpayer and financial period; show source, row and coverage counts.
4. Submit a validated profile through the Next.js API to the Python engine.
5. Rank companies for review and display the score, confidence, triggered rules, evidence, limitations and suggested officer checks.
6. Open a taxpayer review, record a case status and officer note.
7. Optionally adjust an illustrative recovery scenario, clearly separate from assessed or collected revenue.

## Minimum viable product boundary

The current build is a local, single-user MVP to demonstrate the proposal, not a production RSL system:

- One officer dashboard with overview, audit worklist, VAT refund review, MNE data view, recovery scenarios and workbook-import history.
- Excel `.xlsx` template and upload, server-side validation, row/source counts and local SQLite persistence.
- Server-side Next.js API sends supported taxpayer profiles to the separate Python R1–R5 scoring service.
- Officers can review returned evidence and save an MVP case status/note in SQLite.
- Proposal-only corporate-tax signals are displayed as source fields, not scored.

Not part of this MVP: RSL login/RBAC, multiple users, live RSL/Lekuka connectors, secure/hosted database, append-only audit history, automatic decisions, proposal-only rules in the scorer, production case assignment, taxpayer portal, bulk scoring jobs, formal report/export, assessments or real collection data. The local SQLite file is unencrypted and deployment storage may be ephemeral; do not use confidential live taxpayer data.

## Unified modules

### 1. Data intake and quality

- `.xlsx` upload and a downloadable multi-worksheet template.
- Server-side workbook parsing, source normalization and SQLite persistence.
- Import limits and validation for file size, worksheet count, row count, TINs, numeric fields, booleans and duplicate column headings.
- Workbook guide sheet states source, privacy, validation and scoring limits; TIN columns are formatted as text to preserve leading zeroes.
- Header aliases for common TIN, taxpayer, invoice and amount labels.
- Import source, row and coverage counts.
- Cross-import duplicate reconciliation, editable mapping/correction workflow and source-version history remain future work.

### 2. Taxpayer profile

Maintain a taxpayer profile and historical periods containing identity/TIN, name, tax year, sector, revenue/turnover, taxable income, refunds, management fees, royalties, related-party interest, low-tax jurisdiction payments, foreign ownership, gross margin, imported services and declared imported-services VAT. A complete Taxpayer 360 profile may additionally include registration, ownership, directors, subsidiaries, contact, filing/payment history, audits and investigations.

### 3. Risk intelligence

The current Python engine is the **R1–R5 VAT risk family**:

- R1 recurring VAT credit position.
- R2 input VAT matching to normalized Lekuka purchase invoices.
- R3 turnover reconciliation using merchant statements only.
- R4 credit-note activity from normalized Lekuka credit notes.
- R5 related trading.

The pasted Taxathon prototype describes a separate **corporate-tax risk family**:

| Candidate rule | Indicator | Prototype points |
| --- | --- | ---: |
| R8 | Repeated losses while revenue grows | 25 |
| R21 | Refunds in two or more years | 15 |
| R7 | Related-party charges above 20% of revenue | 25 |
| R7 | Related-party charges above 12% of revenue | 12 |
| R18 | Low-tax jurisdiction payments plus related-party charges above 12% | 15 |
| R18 | Foreign-owned company gross margin materially below sector median | 10 |
| VAT-IMP | Imported-services VAT below 70% of expected VAT | 20 |

These are not implemented in the Python engine. Before combining them with R1–R5, RSL must approve their data definitions, rule ownership, interaction/deduplication, versioning and score aggregation. The engine's existing weights, thresholds and version remain authoritative for R1–R5; prototype point scores must not be silently mixed into that score.

### 4. Risk classification and explanations

- Rank taxpayer reviews by score and expose triggered rules and evidence.
- Show confidence, missing data and rules that could not be evaluated.
- Explain why each rule triggered, include legitimate alternative explanations and recommend verification steps.
- Keep every signal explicitly advisory; it is not a confirmed violation.
- Preserve the current engine priority (`High priority`, `Needs review`, `Informational`) as the API result.

The Taxathon prototype separately describes HIGH 60–100, MEDIUM 30–59 and LOW 0–29. This classification differs from the engine's confidence-gated priority thresholds and needs an approved product decision before display; do not show conflicting labels for one score.

### 5. Audit priority and case review

- Filter the queue by all, high and medium risk; show a bounded list and order by priority.
- Expand a company to inspect identifiers, ownership, triggered rules, confidence and recommended checks.
- Record officer notes, taxpayer explanations, decision status and decision time.
- Close a case as a false positive, escalate it or assign it for review.
- Count escalations and false-positive closures.
- In the complete platform, add case references, officer/team assignment, supervisor review, evidence, correspondence, assessment recommendations and a durable history.

Case status and officer notes are persisted in local SQLite for the prototype. This is not a secure, multi-user or tamper-evident audit store; production decisions require authorized identity, access controls and an approved audit service.

### 6. Revenue recovery and scenarios

- Estimate high-risk population, audit success, potential adjustment, collection and target attainment.
- Show progress toward a target and the required average adjustment.
- Provide Conservative, Base and Optimistic scenarios.
- Allow assumptions for taxpayer population, high-risk share, average adjustment, audit success, collection rate and target.
- Recalculate estimates as assumptions change.

Clearly label estimates as illustrative. Keep estimated revenue distinct from approved assessments and actual collections.

### 7. Executive dashboard, reporting and alerts

The MVP overview shows imported taxpayer/row counts, priority distribution, average confidence, indicative engine exposure, refund claims and source coverage. It does not claim assessed/recovered revenue. Future executive views may show liabilities, compliance and trends by time, sector, tax type and geography.

Alerts, investigations, workload views, scheduled reports and CSV/Excel/PDF exports are future work.

### 8. Compliance, investigations and revenue

The complete platform roadmap includes filing/payment obligation monitoring, late or missing returns, unpaid liabilities, compliance history and alerts; investigation planning, assignment, evidence, correspondence, findings, recommendations, escalation and closure; and assessment, penalties/interest, payment tracking, overdue liabilities and recovery performance.

### 9. Governance and administration

The complete platform requires secure login, session management, role-based permissions, account lifecycle, supervisor approvals, audit history, configurable rules and thresholds, tax years/types, sector reference data, import templates, validation settings, health monitoring, backups and recovery.

### 10. Data management and integrations

Use authorized RSL integration contracts, source lineage, duplicate detection, validation, version history and durable storage. The current Phase 1 source policy excludes bank transactions and M-Pesa. No external connector should be invented from the feature list. RSL-approved API, database and identity-provider contracts are needed before implementing production integrations.

### 11. Advanced intelligence

Future analysis may include taxpayer relationship networks, shared ownership/directors, transaction anomalies, sector benchmarking, revenue leakage, tax-gap estimates, risk history, geographic trends, invoice intelligence and predictive analytics. These capabilities require approved data, validation and governance; they are not current scoring behavior.

## Current workspace status

Implemented in the current workspace:

- A single Next.js officer dashboard with Overview, Audit Worklist, VAT Refund Review, MNE Screening, Recovery Scenarios and Data & Imports views.
- Excel `.xlsx` template download and server-side workbook validation/import.
- Local SQLite storage for imports, source rows, R1–R5 scores and prototype case notes/status.
- Per-taxpayer R1–R5 scoring from imported VAT, purchase invoice, merchant statement, credit note and trade worksheets.
- A visible warning that proposal-only MNE rules are not scored by the current engine.
- Server-only Next.js adapter for the Python `/health` and `/score` endpoints.
- Request/response validation and typed Python API contracts.
- R1–R5 scoring, confidence, priority and evidence; R3 uses merchant statements only.
- Synthetic sample scoring and API/integration tests.

Not implemented in the current MVP:

- Approved live RSL connectors, login/RBAC, multi-user access, secure hosted database/append-only audit storage, automatic processing queues, formal executive reporting/exports, taxpayer guidance, assessment/payment workflows, and the proposed additional tax rules.

## MVP follow-up and production gates

1. Validate the workbook template and screening behavior with synthetic or approved masked data.
2. Measure rules against reviewed cases and approve RSL thresholds before presenting operational performance.
3. Before any live data: implement RSL identity, role/case authorization, record-view logging, an append-only audit store and approved hosting.
4. Replace local SQLite before shared or production deployment; then add approved RSL sources and the remaining modules in phases.

The RSL connectors and full-platform modules remain a roadmap until their data and identity contracts are available. SQLite, scoring, case notes and scenarios in this MVP are for a local proposal prototype only. No production login, secure audit trail or real revenue figures are implied by this specification.
