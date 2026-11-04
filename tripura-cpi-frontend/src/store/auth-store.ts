import { create } from 'zustand'
import { useRoundStore } from '@/store/round-store'
import type { AuthState, User } from '@/types'

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user: User) => set({ user, isAuthenticated: true }),
  clearAuth: () => {
    set({ user: null, isAuthenticated: false })
    // Reset the shared round selection so the next user in this tab doesn't
    // inherit the previous user's choice in Survey Management.
    useRoundStore.getState().setSelectedRoundIdOverride('')
  },
}))
