export type UserRole = 'ADMIN' | 'DISTRICT_SUPERVISOR' | 'PRICE_COLLECTOR'

export interface User {
  user_id: number
  username: string
  full_name: string
  phone: string
  email: string | null
  role: UserRole
  is_active: boolean
  district_id: number | null
  district_name: string | null
  district_code: string | null
  created_at: string
  modified_at: string
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User) => void
  clearAuth: () => void
}

export interface RoundSelectionState {
  selectedRoundIdOverride: string
  setSelectedRoundIdOverride: (id: string) => void
}

export * from './master-data'
export * from './survey'
export * from './assignment-management'
export * from './survey-dashboard'
export * from './reports'
