import type { MasterDataEntityType, SurveyEntityType } from '@/types'

type EntityType = MasterDataEntityType | SurveyEntityType

interface EntityLabel {
  /** Lower-case singular, for use inside a sentence. */
  singular: string
  /** Lower-case plural, for use inside a sentence. */
  plural: string
  /** Title-case plural, for headings and dialog titles. */
  title: string
}

// The API slugs ('shops-direct', 'survey-rounds') are not readable, so every user-facing
// mention of an entity goes through this map rather than being derived from the slug.
const ENTITY_LABELS: Record<EntityType, EntityLabel> = {
  items: { singular: 'item', plural: 'items', title: 'Items' },
  markets: { singular: 'market', plural: 'markets', title: 'Markets' },
  shops: { singular: 'shop', plural: 'shops', title: 'Shops' },
  'shops-direct': { singular: 'shop', plural: 'shops', title: 'Shops' },
  'survey-rounds': { singular: 'survey round', plural: 'survey rounds', title: 'Survey Rounds' },
}

export function entityLabel(entityType: EntityType): EntityLabel {
  return ENTITY_LABELS[entityType]
}

/** "1 shop" / "4 shops" — the count with the correctly pluralised noun. */
export function countedEntity(entityType: EntityType, count: number): string {
  const label = entityLabel(entityType)
  return `${count} ${count === 1 ? label.singular : label.plural}`
}
