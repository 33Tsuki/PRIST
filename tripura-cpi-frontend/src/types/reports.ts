// Types for the Reports module. The report catalog (types, columns, filters) is
// served by GET /reports/types and drives the whole Generate UI — see
// src/lib/report-schema.ts for how params_schema (a Pydantic JSON Schema) is parsed.

export interface ReportColumnOut {
  key: string
  label: string
  default: boolean
  // Param keys that force this column into the report. While any of them is set the
  // server always renders the column, so the picker shows it checked and locked.
  implied_by: string[]
}

// A minimal JSON Schema shape — only the parts we read to render filter inputs.
export interface JsonSchemaProperty {
  type?: string
  title?: string
  description?: string
  default?: unknown
  enum?: (string | number)[]
  format?: string
  // Pydantic emits optional fields as anyOf: [{type}, {type: 'null'}]
  anyOf?: JsonSchemaProperty[]
}

export interface JsonSchema {
  type?: string
  title?: string
  description?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

export interface ReportTypeOut {
  key: string
  // 1-based display order; the API returns the catalog already sorted by it.
  sequence: number
  title: string
  description: string
  columns: ReportColumnOut[]
  params_schema: JsonSchema
}

export type ReportFormat = 'pdf' | 'docx' | 'xlsx'

// Generation runs as a background job on the server; each history row is the
// job record. Poll GET /reports while any row is PENDING.
export type ReportStatus = 'PENDING' | 'READY' | 'FAILED'

export interface GeneratedReportOut {
  generated_report_id: number
  report_type: string
  title: string
  description: string | null
  file_format: string
  params: Record<string, unknown>
  // progress is a real 0-100 for docx/xlsx; stage-based (15/95) for pdf
  status: ReportStatus
  progress: number
  error: string | null
  completed_at: string | null
  generated_by_user_id: number
  generated_by_username: string | null
  district_id: number | null
  created_at: string | null
}

export interface UpdateReportRequest {
  title?: string
  // An explicit null clears the description; omit to leave it unchanged.
  description?: string | null
}

export interface GenerateReportRequest {
  report_type: string
  title: string
  description?: string | null
  file_format: ReportFormat
  params: Record<string, unknown>
  columns?: string[] | null
  // Row counts above the server's warn threshold get a 409
  // {requires_confirmation: true} until re-submitted with confirm: true
  confirm?: boolean
}

// POST /reports/preview — a dry run of the same pipeline as generation
// (validation, district scoping, fetch, column projection) that returns a row
// sample instead of queueing a render. Nothing is written server-side.
export interface ReportPreviewRequest {
  report_type: string
  params: Record<string, unknown>
  columns?: string[] | null
  // Rows returned, not rows fetched — the server always counts the full result.
  limit?: number
}

export interface ReportPreviewColumn {
  key: string
  label: string
}

export interface ReportPreviewSection {
  heading: string | null
  columns: ReportPreviewColumn[]
  // Positional, aligned to columns, and already formatted exactly as the
  // document will print them (null -> '', booleans -> Yes/No, dates -> 11 Jun 2026).
  rows: string[][]
  // Rows in this section before truncation to the requested limit.
  total_rows: number
}

export interface ReportLimits {
  warn_rows: number
  max_rows_pdf_docx: number
  max_rows_xlsx: number
}

export interface ReportPreviewOut {
  report_type: string
  report_title: string
  // Label/value pairs of the document's own header block (round, district, …).
  meta: [string, string][]
  sections: ReportPreviewSection[]
  total_rows: number
  returned_rows: number
  truncated: boolean
  limits: ReportLimits
  // True when generating this report would return the 409 confirmation handshake.
  exceeds_warn_threshold: boolean
  // Formats whose hard row cap total_rows fits under; others would 422.
  allowed_formats: ReportFormat[]
}
