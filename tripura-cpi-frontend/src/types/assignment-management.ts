export interface SurveyorLookup {
  surveyor_id: number
  username: string
  full_name: string
  phone: string
  is_active: boolean
  district_id: number | null
  created_at: string | null
  modified_at: string | null
}

export interface MarketLookup {
  market_id: number
  market_name: string
  market_code: string
  domain: string
  district_id: number
  district_name: string
  created_at: string | null
  modified_at: string | null
}

export interface SurveyorAssignment {
  surveyor_assignment_id: number
  surveyor_id: number
  surveyor_name: string
  surveyor_phone: string
  round_id: number
  round_number: number
  round_name: string | null
  market_id: number
  market_name: string
  market_code: string
  created_at: string | null
  modified_at: string | null
}

export interface SurveyorMarket {
  surveyor_assignment_id: number
  surveyor_id: number
  round_id: number
  round_number: number
  round_name: string | null
  market_id: number
  market_name: string
  market_code: string
  domain: string
  district_name: string
  created_at: string | null
  modified_at: string | null
}

export interface CreateAssignmentInput {
  surveyor_id: number
  round_id: number
  market_id: number
}

export interface UpdateAssignmentInput {
  assignment_id: number
  body: Partial<CreateAssignmentInput>
}

export interface RolloverResult {
  target_round_id: number
  source_round_id: number
  assignments_copied: number
}

export interface CreatePriceDataInput {
  surveyor_id?: number
  market_item_id: number
  current_period_price: number
  remark?: string | null
  price_recording_date: string
}
