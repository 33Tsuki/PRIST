export type MasterDataEntityType = 'items' | 'markets' | 'shops' | 'shops-direct'

export const CPI_DOMAINS = ['Rural Non Tribal', 'Rural Tribal', 'Urban'] as const
export const SHOP_SELECTION_STATUSES = [
  'SUBSTITUTE 1',
  'SUBSTITUTE 2',
  'ORIGINALLY SELECTED',
  'NOT SELECTED',
] as const

export interface ItemOut {
  item_id: number
  item_code: string
  item_name: string
  notes: string | null
  created_at: string
  modified_at: string
}

export interface MarketOut {
  market_id: number
  market_code: string
  selected_market: string
  domain: string
  des_corrected: string | null
  district_id: number
  district_name: string
  district_code: string
  vill_town_mmdc: string | null
  tehsil_id: number | null
  tehsil: string | null
  teh_mmdc: string | null
  subdivision_id: number | null
  subdivision: string | null
  subdivision_lgd_code: number | null
  market_day: string | null
  market_time: string | null
  block_ulb_name: string | null
  block_lgd_code: number | null
  dso_office: string | null
  village_town: string | null
  address: string | null
  notes: string | null
  created_at: string
  modified_at: string
}

export interface ShopOut {
  shop_id: number
  shop_serial_no: string
  shop_name: string
  shop_phone_number: string | null
  shop_description_and_location: string | null
  general_description_of_items_sold: string | null
  shop_selection_status: string
  notes: string | null
  market_id: number
  created_at: string
  modified_at: string
}

export interface ItemCreate {
  item_code: string
  item_name: string
  notes?: string | null
}

export interface MarketCreate {
  domain: string
  des_corrected?: string | null
  district_id: number
  vill_town_mmdc?: string | null
  subdivision_id?: number | null
  market_day?: string | null
  market_time?: string | null
  block_ulb_name?: string | null
  block_lgd_code?: number | null
  dso_office?: string | null
  village_town?: string | null
  selected_market: string
  market_code: string
  address?: string | null
  notes?: string | null
}

export interface ShopCreate {
  shop_serial_no: string
  shop_name: string
  shop_phone_number?: string | null
  shop_description_and_location?: string | null
  general_description_of_items_sold?: string | null
  notes?: string | null
}

export interface ItemUpdate {
  item_code?: string
  item_name?: string
  notes?: string | null
}

export interface MarketUpdate {
  domain?: string
  des_corrected?: string | null
  district_id?: number
  vill_town_mmdc?: string | null
  subdivision_id?: number | null
  market_day?: string | null
  market_time?: string | null
  block_ulb_name?: string | null
  block_lgd_code?: number | null
  dso_office?: string | null
  village_town?: string | null
  selected_market?: string
  market_code?: string
  address?: string | null
  notes?: string | null
}

export interface ShopUpdate {
  shop_serial_no?: string
  shop_name?: string
  shop_phone_number?: string | null
  shop_description_and_location?: string | null
  general_description_of_items_sold?: string | null
  notes?: string | null
}

/**
 * `create` only inserts what is missing; `upsert` also applies edits to rows that
 * already exist. Neither mode deletes anything.
 */
export type SetupUploadMode = 'create' | 'upsert'

/** `updated` / `unchanged` only occur in an upsert. */
export type BulkRecordStatus =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'duplicate'
  | 'skipped'
  | 'error'

export interface BulkRecordResult {
  row: number
  status: BulkRecordStatus
  id: number | null
  identifier: string
  detail: string | null
  warning?: string | null
  market_id?: number | null
  /** Field-level diff of an upsert, e.g. `unit_of_sale: 'kg' -> '500 gm'`. */
  changes?: string[]
}

interface BulkUploadCounts {
  total: number
  created: number
  updated: number
  unchanged: number
  duplicates: number
  errors: number
  warnings: number
}

export interface BulkUploadResponse extends BulkUploadCounts {
  entity: string
  dry_run: boolean
  mode: SetupUploadMode
  results: BulkRecordResult[]
}

/** One file's outcome within a multi-file / zip bulk upload. */
export interface FileUploadResult extends BulkUploadCounts {
  filename: string
  status: 'processed' | 'error'
  detail: string | null
  results: BulkRecordResult[]
}

/** Per-file aggregated response from the bulk setup ingestion endpoint. */
export interface BulkBundleResponse extends BulkUploadCounts {
  entity: string
  dry_run: boolean
  mode: SetupUploadMode
  file_count: number
  files: FileUploadResult[]
}

export interface ItemsQueryParams {
  search?: string
}

export interface MarketsQueryParams {
  domain?: string
  district_id?: number
}

export interface ShopsQueryParams {
  search?: string
}

export interface AllShopsQueryParams {
  domain?: string
  district_id?: number
  market_id?: number
}

export interface SubdivisionOut {
  subdivision_id: number
  name: string
  lgd_code: number
  district_id: number
  district_name: string
  created_at: string | null
  modified_at: string | null
}

export interface DistrictOut {
  district_id: number
  name: string
  code: string
  lgd_code: number | null
  created_at: string | null
  modified_at: string | null
}

export type BulkDeleteRecordStatus = 'deleted' | 'not_found' | 'error'

export interface BulkDeleteResult {
  id: number
  status: BulkDeleteRecordStatus
  detail: string | null
}

export interface BulkDeleteResponse {
  entity: string
  total: number
  deleted: number
  not_found: number
  errors: number
  results: BulkDeleteResult[]
}
