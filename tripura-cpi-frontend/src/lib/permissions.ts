import type { User } from '@/types'

// UX-only authorization. The backend is the source of truth (every action is
// re-validated server-side via require_*/assert_*_in_scope); these rules only
// decide what the dashboard shows or enables.

export type Action = 'read' | 'create' | 'update' | 'delete' | 'approve' | 'unsubmit' | 'rollover'

export type Subject =
  | 'Dashboard'
  | 'MasterData'
  | 'User'
  | 'PriceCollector'
  | 'Assignment'
  | 'Setup'
  | 'CollectedData'
  | 'Round'
  | 'Report'

interface Resource {
  district_id?: number | null
}

interface Rule {
  action: Action
  subject: Subject
  condition?: (user: User, resource?: Resource) => boolean
}

// A supervisor may only act within their own district. When a resource carries a
// district_id we enforce the match; when it doesn't, we trust the backend's scoping
// (DS list endpoints already return only in-district rows).
const sameDistrict = (user: User, resource?: Resource): boolean => {
  const districtId = resource?.district_id
  if (districtId == null) return true
  return districtId === user.district_id
}

const SUPERVISOR_RULES: Rule[] = [
  { action: 'read', subject: 'Dashboard' },
  { action: 'read', subject: 'User' },
  { action: 'read', subject: 'Assignment' },
  { action: 'read', subject: 'Setup' },
  { action: 'read', subject: 'CollectedData' },
  { action: 'read', subject: 'Round' },
  { action: 'read', subject: 'Report' },
  { action: 'update', subject: 'PriceCollector', condition: sameDistrict },
  { action: 'create', subject: 'Assignment', condition: sameDistrict },
  { action: 'update', subject: 'Assignment', condition: sameDistrict },
  { action: 'delete', subject: 'Assignment', condition: sameDistrict },
  { action: 'create', subject: 'Setup', condition: sameDistrict },
  { action: 'update', subject: 'Setup', condition: sameDistrict },
  { action: 'approve', subject: 'CollectedData', condition: sameDistrict },
  { action: 'unsubmit', subject: 'CollectedData', condition: sameDistrict },
  { action: 'rollover', subject: 'Round' },
]

export function canPerform(
  user: User | null,
  action: Action,
  subject: Subject,
  resource?: Resource,
): boolean {
  if (!user) return false
  if (user.role === 'ADMIN') return true
  if (user.role === 'DISTRICT_SUPERVISOR') {
    const rule = SUPERVISOR_RULES.find((r) => r.action === action && r.subject === subject)
    if (!rule) return false
    return rule.condition ? rule.condition(user, resource) : true
  }
  return false
}
