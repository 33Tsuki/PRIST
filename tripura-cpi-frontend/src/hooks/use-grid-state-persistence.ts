import { useCallback, useRef, useState } from 'react'
import type { GridState, StateUpdatedEvent } from 'ag-grid-community'

const STORAGE_PREFIX = 'tcpi:grid-state:'
const PERSISTED_KEYS = [
  'columnOrder',
  'columnSizing',
  'columnVisibility',
  'columnPinning',
  'sort',
] as const satisfies readonly (keyof GridState)[]

function pickPersisted(state: GridState): GridState {
  // partialColumnState tells AG Grid we're supplying only some column-state keys
  const out: GridState = { partialColumnState: true }
  for (const key of PERSISTED_KEYS) {
    if (state[key] !== undefined) (out as Record<string, unknown>)[key] = state[key]
  }
  return out
}

export function useGridStatePersistence(persistKey?: string) {
  const storageKey = persistKey ? `${STORAGE_PREFIX}${persistKey}` : null

  const readInitial = useCallback((): GridState | undefined => {
    if (!storageKey) return undefined
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as GridState) : undefined
    } catch {
      return undefined
    }
  }, [storageKey])

  // Seeded once from storage; cleared on reset so the remounted grid renders defaults.
  const [initialState, setInitialState] = useState<GridState | undefined>(readInitial)
  // Bumped on reset to force AG Grid to remount (matches the fresh-refresh code path).
  const [gridKey, setGridKey] = useState(0)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onStateUpdated = useCallback(
    (event: StateUpdatedEvent) => {
      if (!storageKey) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(pickPersisted(event.state)))
        } catch {
          /* ignore quota / serialization errors */
        }
      }, 300) // debounce — onStateUpdated fires often (drag, resize, init)
    },
    [storageKey],
  )

  const resetState = useCallback(() => {
    if (timer.current) clearTimeout(timer.current) // drop any pending pre-reset save
    if (storageKey) localStorage.removeItem(storageKey)
    setInitialState(undefined)
    // Remount with a cleared initialState so every column re-initializes from colDef defaults
    // (order/width/visibility/pinning/sort), exactly like a fresh page load.
    setGridKey((k) => k + 1)
  }, [storageKey])

  return { initialState, gridKey, onStateUpdated, resetState, enabled: !!storageKey }
}
