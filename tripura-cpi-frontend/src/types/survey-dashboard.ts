import type { MarketSurveyStatus, RoundStatus } from './survey'

export interface CollectedDataItemOut {
  setup_id: number
  item_id: number
  item_code: string
  item_name: string
  shop_id: number
  shop_serial_no: string
  shop_name: string
  shop_selection_status: string
  item_availability_code: string | null
  ds_remark: string | null // DS item-level remark (setup.remark)
  market_item_id: number | null
  unit_of_sale: string | null
  product_specification: string | null
  market_item_description: string | null
  previous_period_price: number | null
  current_period_price: number | null
  is_na: boolean | null
  is_not_applicable: boolean | null
  price_recording_date: string | null
  price_remark: string | null
  price_change: number | null
  price_change_percentage: number | null
  price_alert: boolean
}

export interface CollectedDataSummary {
  total_items: number
  collected_count: number
  pending_count: number
  status: MarketSurveyStatus
  round_status: RoundStatus
  is_submitted: boolean
  alert_count: number
  submitted_at: string | null // ISO datetime, null until submitted
  submitted_by: number | null // PC user_id who submitted
  submitted_by_name: string | null // PC full name
  surveyor_id: number | null // currently assigned PC user_id (null if unassigned)
  surveyor_name: string | null
  surveyor_phone: string | null
}

export interface CollectedDataResponse {
  summary: CollectedDataSummary
  items: CollectedDataItemOut[]
}
