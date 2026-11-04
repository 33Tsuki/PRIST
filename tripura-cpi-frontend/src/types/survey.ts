export type SurveyEntityType = 'survey-rounds'

/** Round lifecycle state (DRAFT → ACTIVE → CLOSED). The single ACTIVE round of a
 *  cycle is the "current" round field staff sync against. */
export type RoundStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED'
/** Cadence track. Only MONTHLY is wired up today; QUARTERLY/YEARLY are reserved
 *  for a future multi-cadence feature. */
export type RoundCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

export interface SurveyRoundOut {
  round_id: number
  round_number: number
  round_name: string | null
  cycle: RoundCycle
  round_status: RoundStatus
  round_start_date: string // "YYYY-MM-DD" — planned
  round_end_date: string // "YYYY-MM-DD" — planned
  actual_start_date: string | null // stamped when the round is started
  actual_end_date: string | null // stamped when the round is ended
  created_at: string | null
  modified_at: string | null
}

export interface SurveyRoundCreate {
  round_name?: string | null
  round_start_date: string
  round_end_date: string
  // round_number is assigned by the server (next in the cycle); cycle defaults to
  // MONTHLY server-side; status is always DRAFT on create.
}

export interface SurveyRoundUpdate {
  round_name?: string | null
  round_start_date?: string | null
  round_end_date?: string | null
  // round_number and cycle are fixed at creation; round_status / actual dates are
  // managed only via the start/end endpoints.
}

// IN_PROGRESS/SUBMITTED/APPROVED are stored; NOT_STARTED (round still DRAFT) and
// INCOMPLETE (round CLOSED but never submitted) are derived server-side from the
// round lifecycle for display only.
export type MarketSurveyStatus =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'NOT_STARTED'
  | 'INCOMPLETE'

export interface RoundMarketSummaryOut {
  market_id: number
  market_code: string
  selected_market: string
  domain: string
  district_id: number
  district_name: string
  subdivision_id: number | null
  subdivision: string | null
  status: MarketSurveyStatus
  round_status: RoundStatus
  setup_count: number
  total_count: number
  collected_count: number
  alert_count: number
  // Assignment + submission trail, so the dashboard can group by price collector
  // and show the review timeline without a per-market request.
  surveyor_id: number | null
  surveyor_name: string | null
  surveyor_phone: string | null
  submitted_at: string | null
  submitted_by_name: string | null
  reviewed_at: string | null
}

/** One (market, item) pair still awaiting a price. Carries the market's grouping
 *  dimensions so it can be pivoted without a second lookup. */
export interface PendingItemOut {
  market_id: number
  market_code: string
  selected_market: string
  domain: string
  district_id: number
  district_name: string
  subdivision_id: number | null
  subdivision: string | null
  item_id: number
  item_code: string
  item_name: string
  surveyor_id: number | null
  surveyor_name: string | null
}

export interface RoundMarketSetupOut {
  setup_id: number
  item_id: number
  item_code: string
  item_name: string
  shop_id: number
  shop_serial_no: string
  shop_name: string
  shop_selection_status: string
  item_availability_code: string | null
  market_item_id: number | null
  unit_of_sale: string | null
  product_specification: string | null
  market_item_description: string | null
  remark: string | null
}

export interface SetupShopEntry {
  shop_id: number
  item_availability_code?: string | null
  remark?: string | null
  unit_of_sale?: string | null
  product_specification?: string | null
  market_item_description?: string | null
}

export interface SetupCreate {
  item_id: number
  round_id: number
  originally_selected: SetupShopEntry
  substitute_1?: SetupShopEntry | null
  substitute_2?: SetupShopEntry | null
}

export interface SetupReplace {
  originally_selected: SetupShopEntry
  substitute_1?: SetupShopEntry | null
  substitute_2?: SetupShopEntry | null
}

/** A shop slot within an item's grouped setup (frontend-derived). */
export interface ItemSetupSlot {
  status: string // 'ORIGINALLY SELECTED' | 'SUBSTITUTE 1' | 'SUBSTITUTE 2'
  shop_id: number
  shop_serial_no: string
  shop_name: string
}

/** All setup rows for one item in a round + market, grouped (frontend-derived). */
export interface ItemSetupGroup {
  item_id: number
  item_code: string
  item_name: string
  market_item_description: string | null
  product_specification: string | null
  unit_of_sale: string | null
  remark: string | null
  slots: ItemSetupSlot[] // ordered: originally selected, substitute 1, substitute 2
}

export interface SetupUpdate {
  shop_selection_status?: string | null
  item_availability_code?: string | null
  remark?: string | null
  unit_of_sale?: string | null
  product_specification?: string | null
}

export interface RolloverSetupsResult {
  target_round_id: number
  source_round_id: number
  setups_copied: number
  market_items_copied: number
  price_data_created: number
}
