// Turns a report type's params_schema (a Pydantic JSON Schema) into a flat list of
// filter-field descriptors the generic FilterField renderer can draw. Adding a new
// *scalar* filter on the backend (bool/date/enum/number/text) needs zero frontend
// changes; only a brand-new entity-lookup filter needs an entry in LOOKUP_FIELDS.

import type { JsonSchema, JsonSchemaProperty } from '@/types'

export type FilterWidget = 'lookup' | 'enum' | 'integer' | 'number' | 'boolean' | 'date' | 'text'

// Which entity a lookup field points at, and so which <Select> renders it. Dispatch is on
// this rather than on the field's name, so registering a field below is genuinely all it takes.
export type LookupKind = 'round' | 'district' | 'market'

export interface FilterField {
  key: string
  label: string
  required: boolean
  widget: FilterWidget
  enumValues?: (string | number)[]
  // For lookup fields, which entity to draw a dropdown for.
  kind?: LookupKind
  // For lookup fields, the key of the field this one cascades from (e.g. market -> district).
  dependsOn?: string
}

// The single extension point where DB-id filters are enriched into named dropdowns.
// A key listed here is rendered as a <Select> populated by the matching lookup hook in
// the FilterField component; anything not listed falls back to a plain scalar input.
export const LOOKUP_FIELDS: Record<string, { kind: LookupKind; dependsOn?: string }> = {
  round_id: { kind: 'round' },
  from_round_id: { kind: 'round' },
  // A range's end may not precede its start, so the To list is filtered by the From value —
  // the same cascade the market/district pair uses.
  to_round_id: { kind: 'round', dependsOn: 'from_round_id' },
  district_id: { kind: 'district' },
  market_id: { kind: 'market', dependsOn: 'district_id' },
}

// The property key the backend uses for the district scope. For a District Supervisor
// this field is preselected to their district and locked (backend enforces scope too).
export const DISTRICT_FIELD_KEY = 'district_id'

// Collapse Pydantic's `anyOf: [{type: T}, {type: 'null'}]` to the meaningful branch.
function effectiveProperty(prop: JsonSchemaProperty): JsonSchemaProperty {
  if (!prop.anyOf) return prop
  const nonNull = prop.anyOf.find((p) => p.type !== 'null')
  return { ...nonNull, default: prop.default, title: prop.title, description: prop.description }
}

function widgetFor(key: string, prop: JsonSchemaProperty): FilterWidget {
  if (key in LOOKUP_FIELDS) return 'lookup'
  if (prop.enum) return 'enum'
  if (prop.type === 'boolean') return 'boolean'
  if (prop.type === 'integer') return 'integer'
  if (prop.type === 'number') return 'number'
  if (prop.type === 'string' && (prop.format === 'date' || prop.format === 'date-time'))
    return 'date'
  return 'text'
}

// A backend field with no `title` would otherwise surface its raw schema key as the
// label ("district_id", "include_zero_rows"), both here and in FilterField's placeholder.
function humanizeKey(key: string): string {
  const words = key.split('_').filter((w) => w !== 'id')
  if (words.length === 0) return key
  return words.join(' ').replace(/^./, (c) => c.toUpperCase())
}

export function parseParamsSchema(schema: JsonSchema): FilterField[] {
  const properties = schema.properties ?? {}
  const required = new Set(schema.required ?? [])
  return Object.entries(properties).map(([key, raw]) => {
    const prop = effectiveProperty(raw)
    const widget = widgetFor(key, prop)
    return {
      key,
      label: prop.title ?? humanizeKey(key),
      required: required.has(key),
      widget,
      enumValues: prop.enum,
      kind: LOOKUP_FIELDS[key]?.kind,
      dependsOn: LOOKUP_FIELDS[key]?.dependsOn,
    }
  })
}

// Coerce collected filter values to the shapes the backend expects and drop empty
// optionals, producing the `params` object for POST /reports.
export function buildParams(
  fields: FilterField[],
  values: Record<string, string>,
): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = values[field.key]
    if (raw == null || raw === '') continue
    switch (field.widget) {
      case 'lookup':
      case 'integer':
        params[field.key] = Number(raw)
        break
      case 'number':
        params[field.key] = Number(raw)
        break
      case 'boolean':
        params[field.key] = raw === 'true'
        break
      default:
        params[field.key] = raw
    }
  }
  return params
}
