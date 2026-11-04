import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { RoundSelectionState } from '@/types'

// Shared round selection for the Setups and Assignments pages (the survey
// dashboard keeps its own URL-param round). sessionStorage so the selection
// survives navigation and refresh within a tab, but each new session starts
// at the default round.
export const useRoundStore = create<RoundSelectionState>()(
  persist(
    (set) => ({
      selectedRoundIdOverride: '',
      setSelectedRoundIdOverride: (id: string) => set({ selectedRoundIdOverride: id }),
    }),
    {
      name: 'round-selection',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)
